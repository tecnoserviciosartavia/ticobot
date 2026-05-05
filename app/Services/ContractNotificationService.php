<?php

namespace App\Services;

use App\Models\Contract;
use App\Services\WhatsAppNotificationService;

class ContractNotificationService
{
    protected WhatsAppNotificationService $whatsappService;

    public function __construct(WhatsAppNotificationService $whatsappService)
    {
        $this->whatsappService = $whatsappService;
    }

    /**
     * Send access credentials for a contract
     */
    public function sendAccessMessages(Contract $contract): int
    {
        if (!$contract->client || !$contract->client->phone) {
            return 0;
        }

        $services = $contract->services->map(function ($service) use ($contract) {
            return [
                'name' => $service->name,
                'account_email' => $service->account_email,
                'password' => $service->password,
                'pin' => $service->pivot?->pin_override ?? $this->resolveAccessPin(
                    $service->name,
                    $contract->client->phone,
                    null,
                    $service->pin
                ),
            ];
        })->toArray();

        return $this->whatsappService->sendPlatformAccessMessages(
            $contract->client->phone,
            $services
        );
    }

    /**
     * Resend access credentials for a contract
     */
    public function resendAccessMessages(Contract $contract): array
    {
        $sent = $this->sendAccessMessages($contract);

        if ($sent > 0) {
            return [
                'success' => true,
                'message' => "Accesos reenviados ({$sent} mensaje(s) enviado(s))."
            ];
        }

        return [
            'success' => false,
            'message' => 'No se pudieron enviar los accesos. Verifique que el cliente tenga teléfono y los servicios tengan credenciales configuradas.'
        ];
    }

    /**
     * Send contract creation notification
     */
    public function sendContractCreatedNotification(Contract $contract): bool
    {
        if (!$contract->client || !$contract->client->phone) {
            return false;
        }

        $message = $this->buildContractCreatedMessage($contract);
        
        return $this->whatsappService->sendTextMessage(
            $contract->client->phone,
            $message
        );
    }

    /**
     * Send contract update notification
     */
    public function sendContractUpdatedNotification(Contract $contract): bool
    {
        if (!$contract->client || !$contract->client->phone) {
            return false;
        }

        $message = $this->buildContractUpdatedMessage($contract);
        
        return $this->whatsappService->sendTextMessage(
            $contract->client->phone,
            $message
        );
    }

    /**
     * Send payment reminder notification
     */
    public function sendPaymentReminderNotification(Contract $contract): bool
    {
        if (!$contract->client || !$contract->client->phone) {
            return false;
        }

        $message = $this->buildPaymentReminderMessage($contract);
        
        return $this->whatsappService->sendTextMessage(
            $contract->client->phone,
            $message
        );
    }

    /**
     * Build contract creation message
     */
    protected function buildContractCreatedMessage(Contract $contract): string
    {
        $currency = $contract->currency === 'USD' ? '$' : '₡';
        $amount = number_format($contract->amount, 2, ',', '.');
        
        $message = "🎉 *Contrato Creado*\n\n";
        $message .= "Hola {$contract->client->name},\n\n";
        $message .= "Se ha creado tu contrato:\n";
        $message .= "• Código: {$contract->name}\n";
        $message .= "• Monto: {$currency}{$amount}\n";
        $message .= "• Ciclo: {$this->getBillingCycleLabel($contract->billing_cycle)}\n";
        $message .= "• Próximo vencimiento: " . $contract->next_due_date?->format('d/m/Y') . "\n\n";
        
        if ($contract->services->count() > 0) {
            $message .= "Servicios incluidos:\n";
            foreach ($contract->services as $service) {
                $quantity = $service->pivot->quantity ?? 1;
                $message .= "• {$service->name}" . ($quantity > 1 ? " (x{$quantity})" : "") . "\n";
            }
            $message .= "\n";
        }
        
        $message .= "Te enviaremos las credenciales de acceso por separado.\n\n";
        $message .= "Gracias por confiar en nosotros! 🚀";

        return $message;
    }

    /**
     * Build contract update message
     */
    protected function buildContractUpdatedMessage(Contract $contract): string
    {
        $currency = $contract->currency === 'USD' ? '$' : '₡';
        $amount = number_format($contract->amount, 2, ',', '.');
        
        $message = "📝 *Contrato Actualizado*\n\n";
        $message .= "Hola {$contract->client->name},\n\n";
        $message .= "Tu contrato ha sido actualizado:\n";
        $message .= "• Código: {$contract->name}\n";
        $message .= "• Monto: {$currency}{$amount}\n";
        $message .= "• Ciclo: {$this->getBillingCycleLabel($contract->billing_cycle)}\n";
        $message .= "• Próximo vencimiento: " . $contract->next_due_date?->format('d/m/Y') . "\n\n";
        
        if ($contract->services->count() > 0) {
            $message .= "Servicios activos:\n";
            foreach ($contract->services as $service) {
                $quantity = $service->pivot->quantity ?? 1;
                $message .= "• {$service->name}" . ($quantity > 1 ? " (x{$quantity})" : "") . "\n";
            }
        }
        
        $message .= "\nSi tienes alguna pregunta, contáctanos. 😊";

        return $message;
    }

    /**
     * Build payment reminder message
     */
    protected function buildPaymentReminderMessage(Contract $contract): string
    {
        $currency = $contract->currency === 'USD' ? '$' : '₡';
        $amount = number_format($contract->amount, 2, ',', '.');
        
        $message = "💳 *Recordatorio de Pago*\n\n";
        $message .= "Hola {$contract->client->name},\n\n";
        $message .= "Te recordamos tu próximo pago:\n";
        $message .= "• Contrato: {$contract->name}\n";
        $message .= "• Monto: {$currency}{$amount}\n";
        $message .= "• Vencimiento: " . $contract->next_due_date?->format('d/m/Y') . "\n\n";
        
        if ($contract->grace_period_days > 0) {
            $message .= "Tienes {$contract->grace_period_days} días de gracia después del vencimiento.\n\n";
        }
        
        $message .= "Métodos de pago:\n";
        $message .= "• 📱 SINPE Móvil\n";
        $message .= "• 🏦 Transferencia bancaria\n";
        $message .= "• 💵 Efectivo\n\n";
        
        $message .= "Para confirmar tu pago, envía tu comprobante por este chat.\n\n";
        $message .= "Gracias! 🙏";

        return $message;
    }

    /**
     * Get billing cycle label in Spanish
     */
    protected function getBillingCycleLabel(string $billingCycle): string
    {
        return match ($billingCycle) {
            'weekly' => 'Semanal',
            'biweekly' => 'Quincenal',
            'monthly' => 'Mensual',
            'one_time' => 'Único',
            default => ucfirst($billingCycle),
        };
    }

    /**
     * Resolve access PIN for service
     */
    protected function resolveAccessPin(?string $serviceName, ?string $phone, ?string $providedPin, ?string $defaultPin): ?string
    {
        $serviceNameNorm = mb_strtolower((string) ($serviceName ?? ''));
        
        // Spotify doesn't use PIN
        if (str_contains($serviceNameNorm, 'spotify')) {
            return null;
        }

        // Use provided PIN if available
        $providedPin = trim((string) ($providedPin ?? ''));
        if ($providedPin !== '') {
            return $providedPin;
        }

        // Use default PIN if available
        $defaultPin = trim((string) ($defaultPin ?? ''));
        if ($defaultPin !== '') {
            return $defaultPin;
        }

        // Generate PIN from phone number
        if ($phone) {
            $digits = preg_replace('/\D+/', '', $phone);
            if ($digits !== '') {
                $lastFour = substr($digits, -4);
                if ($lastFour !== '') {
                    if (str_contains($serviceNameNorm, 'prime')) {
                        return $lastFour . substr($lastFour, -1);
                    }
                    return $lastFour;
                }
            }
        }

        return null;
    }
}
