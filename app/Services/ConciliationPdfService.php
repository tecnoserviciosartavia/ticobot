<?php

namespace App\Services;

use App\Models\Conciliation;
use App\Models\Payment;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;

class ConciliationPdfService
{
    /**
     * Genera un PDF de recibo conciliado para un pago
     *
     * @param Payment $payment
     * @param int $months Meses cancelados
     * @return string Path del PDF generado
     */
    public function generateConciliationReceipt(Payment $payment, int $months = 1): string
    {
        $client = $payment->client;
        $contract = $payment->contract;
        
        // Obtener el logo de la empresa si existe
        $logoPath = public_path('images/logo.png');
        $logoData = null;
        if (file_exists($logoPath)) {
            $logoData = base64_encode(file_get_contents($logoPath));
        }

        // Calcular información del ticket
        $paidAt = $payment->paid_at ? Carbon::parse($payment->paid_at) : Carbon::now();
        $monthlyAmount = $contract ? $contract->amount : ($payment->amount / max($months, 1));
        $total = $payment->amount;
        
        // Datos para el PDF
        $data = [
            'client_name' => $client ? $client->name : 'Cliente',
            'balance' => 0.00, // Balance actual después del pago
            'ticket_id' => str_pad($payment->id, 6, '0', STR_PAD_LEFT),
            'initial_balance' => $total,
            'total_transactions' => -$total,
            'final_balance' => 0.00,
            'date' => $paidAt->format('Y-m-d'),
            'concept' => $this->getPaymentConcept($months),
            'amount' => $total,
            'currency' => $payment->currency ?? 'CRC',
            'months' => $months,
            'logo_data' => $logoData,
        ];

        // Generar el PDF usando una vista blade
        $pdf = Pdf::loadView('pdf.conciliation-receipt', $data)
            ->setPaper('a6', 'portrait');

        // Guardar el PDF en storage (public para poder acceder)
        $filename = "conciliation-{$payment->id}-" . time() . '.pdf';
        $path = "conciliations/{$filename}";
        
        // Usar el disco 'public' explícitamente
        Storage::disk('public')->put($path, $pdf->output());

        return Storage::disk('public')->path($path);
    }

    /**
     * Genera el mensaje de WhatsApp personalizado según los meses
     *
     * @param int $months
     * @return string
     */
    public function generateWhatsAppMessage(int $months): string
    {
        $monthText = $months === 1 ? '1 mes' : "{$months} meses";
        
        $message = "¡Pago Recibido! Tu suscripción actual tiene una duración de {$monthText}. ";
        $message .= "Tres días antes de que se cumpla el ";
        $message .= $months === 1 ? "mes" : "período";
        $message .= ", te enviaremos un mensaje para consultar si deseas extenderla por más tiempo.\n\n";
        $message .= "¡Gracias por su preferencia y esperamos seguir brindándole nuestros Servicios de Entretenimiento!";

        return $message;
    }

    /**
     * Obtiene el concepto del pago según los meses
     *
     * @param int $months
     * @return string
     */
    private function getPaymentConcept(int $months): string
    {
        $currentMonth = Carbon::now()->locale('es')->translatedFormat('F');
        
        if ($months === 1) {
            return "Pago de {$currentMonth}";
        } elseif ($months === 2) {
            $nextMonth = Carbon::now()->addMonth()->locale('es')->translatedFormat('F');
            return "Pago de {$currentMonth} y {$nextMonth}";
        } else {
            return "Pago de {$months} meses";
        }
    }

    /**
     * Calcula los meses pagados basándose en el metadata del pago
     *
     * @param Payment $payment
     * @return int
     */
    public function calculateMonthsFromPayment(Payment $payment): int
    {
        // Intentar obtener de metadata primero
        if ($payment->metadata && isset($payment->metadata['months'])) {
            return (int) $payment->metadata['months'];
        }

        // Calcular basándose en el monto y el contrato
        if ($payment->contract && $payment->contract->amount > 0) {
            return (int) ceil($payment->amount / $payment->contract->amount);
        }

        // Por defecto, 1 mes
        return 1;
    }
}
