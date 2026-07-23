<?php

namespace App\Http\Controllers\api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Models\Setting;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class CollectionsDashboardController extends Controller
{
    public function sendPaymentNotice(
        Contract $contract,
        WhatsAppNotificationService $whatsApp
    ) {
        $contract->loadMissing('client:id,name,phone');
        $client = $contract->client;
        $dueDate = $contract->next_due_date ? Carbon::parse($contract->next_due_date) : null;

        if (! $client || ! $dueDate) {
            return response()->json(['message' => 'El contrato no tiene cliente o fecha de cobro.'], 422);
        }

        $phone = trim((string) $client->phone);
        if ($phone === '') {
            return response()->json(['message' => 'El cliente no tiene un teléfono registrado.'], 422);
        }

        $hasPayment = Payment::query()
            ->where('status', 'verified')
            ->where('amount', '>', 0)
            ->where(function ($query) use ($contract, $client) {
                $query->where('contract_id', $contract->id)
                    ->orWhere(function ($legacy) use ($client) {
                        $legacy->whereNull('contract_id')->where('client_id', $client->id);
                    });
            })
            ->where(function ($query) use ($dueDate) {
                $query->whereBetween('paid_at', [$dueDate->copy()->startOfMonth()->toDateString(), $dueDate->copy()->endOfMonth()->toDateString()])
                    ->orWhere(function ($fallback) use ($dueDate) {
                        $fallback->whereNull('paid_at')
                            ->whereBetween('created_at', [$dueDate->copy()->startOfMonth(), $dueDate->copy()->endOfMonth()]);
                    });
            })
            ->exists();

        if ($hasPayment) {
            return response()->json(['message' => 'Ya existe un pago registrado para el mes de este cobro.'], 409);
        }

        $paymentContact = trim((string) Setting::get('payment_contact', ''));
        $bankAccounts = trim((string) Setting::get('bank_accounts', ''));
        if ($paymentContact === '' && $bankAccounts === '') {
            return response()->json(['message' => 'Configure primero el SINPE o las cuentas bancarias en Configuración.'], 422);
        }

        $message = $this->buildPaymentNotice($contract, $paymentContact, $bankAccounts);
        if (! $whatsApp->sendTextMessage($phone, $message)) {
            return response()->json(['message' => 'No se pudo enviar el mensaje por WhatsApp.'], 502);
        }

        return response()->json([
            'success' => true,
            'message' => 'Aviso de pago enviado manualmente por WhatsApp.',
        ]);
    }

    private function buildPaymentNotice(Contract $contract, string $paymentContact, string $bankAccounts): string
    {
        $clientName = trim((string) $contract->client?->name) ?: 'cliente';
        $contractName = trim((string) $contract->name) ?: 'su servicio';
        $currency = strtoupper((string) ($contract->currency ?: 'CRC'));
        $amount = (float) $contract->amount;
        $formattedAmount = $currency === 'USD'
            ? '$'.number_format($amount, 2, '.', ',').' USD'
            : '₡'.number_format($amount, 2, ',', '.');

        $month = now(config('app.timezone'))->locale('es')->translatedFormat('F Y');
        $lines = [
            "Hola {$clientName},",
            '',
            "Le informamos que aún no hemos registrado el pago correspondiente al presente mes ({$month}) de {$contractName}.",
            '',
            "Monto adeudado: {$formattedAmount}",
            '',
            'Datos para realizar el pago:',
        ];

        if ($paymentContact !== '') {
            $lines[] = "SINPE Móvil: {$paymentContact}";
        }
        if ($bankAccounts !== '') {
            $lines[] = 'Cuentas bancarias:';
            $lines[] = $bankAccounts;
        }

        $lines[] = '';
        $lines[] = 'Si ya realizó el pago, por favor envíenos el comprobante por este medio.';

        return implode("\n", $lines);
    }

    /**
     * Dashboard de cobranzas: quién debe (solo si NO existe pago registrado) y acciones sugeridas.
     *
     * Regla base (según requerimiento):
     * - Deuda = contrato con next_due_date vencido/hoy/próximo y SIN pagos registrados que cubran ese periodo.
     *   Por simplicidad operativa aquí interpretamos "pago registrado" como: existe algún Payment del cliente
     *   con created_at >= inicio del mes del next_due_date (o del rango) (y monto > 0).
     *
     * Nota: esta definición es intencionalmente conservadora y se puede afinar con lógica por contrato.
     */
    public function overview(Request $request)
    {
        $days = (int) $request->query('days', 7);
        if ($days < 0) $days = 0;
        if ($days > 31) $days = 31;

        $today = Carbon::today();
        $soonEnd = $today->copy()->addDays($days);

        // Ventanas:
        $overdueContracts = Contract::query()
            ->whereNotNull('next_due_date')
            ->whereDate('next_due_date', '<', $today)
            ->with('client:id,name,phone,email')
            ->get();

        $dueTodayContracts = Contract::query()
            ->whereNotNull('next_due_date')
            ->whereDate('next_due_date', '=', $today)
            ->with('client:id,name,phone,email')
            ->get();

        $dueSoonContracts = Contract::query()
            ->whereNotNull('next_due_date')
            ->whereDate('next_due_date', '>', $today)
            ->whereDate('next_due_date', '<=', $soonEnd)
            ->with('client:id,name,phone,email')
            ->get();

        // Helper: determinar si hay pago registrado "para ese mes".
        $hasPaymentForMonth = function (Contract $contract, Carbon $dueDate): bool {
            $monthStart = $dueDate->copy()->startOfMonth();
            $monthEnd = $dueDate->copy()->endOfMonth();

            return Payment::query()
                ->where('status', 'verified')
                ->where('amount', '>', 0)
                ->where(function ($query) use ($contract) {
                    $query->where('contract_id', $contract->id)
                        ->orWhere(function ($legacy) use ($contract) {
                            $legacy->whereNull('contract_id')->where('client_id', $contract->client_id);
                        });
                })
                ->where(function ($query) use ($monthStart, $monthEnd) {
                    $query->whereBetween('paid_at', [$monthStart->toDateString(), $monthEnd->toDateString()])
                        ->orWhere(function ($fallback) use ($monthStart, $monthEnd) {
                            $fallback->whereNull('paid_at')->whereBetween('created_at', [$monthStart, $monthEnd]);
                        });
                })
                ->exists();
        };

        $mapContract = function (Contract $c) use ($hasPaymentForMonth) {
            $due = $c->next_due_date ? Carbon::parse($c->next_due_date) : null;
            $client = $c->client;

            $paid = ($client && $due) ? $hasPaymentForMonth($c, $due) : false;

            return [
                'contract' => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'amount' => (float) $c->amount,
                    'currency' => $c->currency ?? 'CRC',
                    'next_due_date' => $due?->toDateString(),
                ],
                'client' => $client ? [
                    'id' => $client->id,
                    'name' => $client->name,
                    'phone' => $client->phone,
                    'email' => $client->email,
                ] : null,
                'has_payment_registered' => $paid,
            ];
        };

        $filterNoPayment = function (array $row): bool {
            return empty($row['has_payment_registered']);
        };

        $overdue = $overdueContracts->map($mapContract)->filter($filterNoPayment)->values();
        $dueToday = $dueTodayContracts->map($mapContract)->filter($filterNoPayment)->values();
        $dueSoon = $dueSoonContracts->map($mapContract)->filter($filterNoPayment)->values();

        // Totales rápidos
        $totals = [
            'overdue' => $overdue->count(),
            'due_today' => $dueToday->count(),
            'due_soon' => $dueSoon->count(),
        ];

        return response()->json([
            'success' => true,
            'window_days' => $days,
            'as_of' => $today->toDateString(),
            'totals' => $totals,
            'overdue' => $overdue,
            'due_today' => $dueToday,
            'due_soon' => $dueSoon,
        ]);
    }
}
