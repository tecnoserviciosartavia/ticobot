<?php

namespace App\Http\Controllers\api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Carbon\Carbon;
use Illuminate\Http\Request;

class CollectionsDashboardController extends Controller
{
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
            ->whereBetween('next_due_date', [$today->toDateString(), $soonEnd->toDateString()])
            ->with('client:id,name,phone,email')
            ->get();

        // Helper: determinar si hay pago registrado "para ese mes".
        $hasPaymentForMonth = function (int $clientId, Carbon $dueDate): bool {
            $monthStart = $dueDate->copy()->startOfMonth();
            $monthEnd = $dueDate->copy()->endOfMonth();

            return Payment::query()
                ->where('client_id', $clientId)
                ->where('amount', '>', 0)
                ->whereBetween('created_at', [$monthStart, $monthEnd])
                ->exists();
        };

        $mapContract = function (Contract $c) use ($hasPaymentForMonth) {
            $due = $c->next_due_date ? Carbon::parse($c->next_due_date) : null;
            $client = $c->client;

            $paid = ($client && $due) ? $hasPaymentForMonth((int) $client->id, $due) : false;

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
