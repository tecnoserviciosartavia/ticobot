<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class AccountingController extends Controller
{
    public function index(): Response
    {
        // Agrupar montos por estado y moneda
        $byStatusCurrency = Payment::query()
            ->selectRaw('status, COALESCE(currency, "CRC") as currency, SUM(amount) as total_amount, COUNT(*) as total_count')
            ->groupBy('status', 'currency')
            ->get()
            ->groupBy('status')
            ->map(fn ($group) => $group->map(fn ($row) => [
                'currency' => $row->currency,
                'total_amount' => (float) $row->total_amount,
                'total_count' => (int) $row->total_count,
            ]));

        // Totales generales por estado
        $statuses = ['verified', 'unverified', 'in_review', 'rejected'];
        $totals = [];
        foreach ($statuses as $st) {
            $totals[$st] = [
                'amount' => (float) Payment::where('status', $st)->sum('amount'),
                'count' => (int) Payment::where('status', $st)->count(),
            ];
        }

        // Total meses pagados (metadata['months']) para pagos conciliados (verified)
        $verifiedPayments = Payment::where('status', 'verified')->get(['metadata']);
        $totalMonths = 0;
        foreach ($verifiedPayments as $p) {
            if (is_array($p->metadata) && isset($p->metadata['months'])) {
                $totalMonths += (int) $p->metadata['months'];
            }
        }

        // Últimos 7 días: montos diarios verificados vs pendientes
        $dailyWindow = collect(range(0,6))->map(function ($i) {
            $day = Carbon::today()->subDays($i);
            return [
                'date' => $day->toDateString(),
                'verified_amount' => (float) Payment::whereDate('created_at', $day)->where('status', 'verified')->sum('amount'),
                'pending_amount' => (float) Payment::whereDate('created_at', $day)->whereIn('status', ['unverified','in_review'])->sum('amount'),
            ];
        })->reverse()->values();

        // Porcentaje conciliado = monto verificado / (verificado + pendiente)
        $verifiedTotal = $totals['verified']['amount'];
        $pendingTotal = $totals['unverified']['amount'] + $totals['in_review']['amount'];
        $conciliationRate = ($verifiedTotal + $pendingTotal) > 0
            ? round(($verifiedTotal / ($verifiedTotal + $pendingTotal)) * 100, 2)
            : 0.0;

        // Cálculo mensual: Total contratos - Total pagado verificado
        $monthlyData = $this->calculateMonthlyPending();

        return Inertia::render('Accounting/Index', [
            'by_status_currency' => $byStatusCurrency,
            'totals' => $totals,
            'total_months' => $totalMonths,
            'daily' => $dailyWindow,
            'conciliation_rate' => $conciliationRate,
            'monthly_pending' => $monthlyData,
        ]);
    }

    /**
     * Calcula el total pendiente mensualmente (Total contratos - Total pagado)
     */
    private function calculateMonthlyPending(): array
    {
        // Obtener últimos 12 meses
        $months = collect(range(0, 11))->map(function ($i) {
            $date = Carbon::today()->subMonths($i)->startOfMonth();
            return [
                'month' => $date->format('Y-m'),
                'label' => ucfirst($date->locale('es')->isoFormat('MMM YYYY')),
            ];
        })->reverse()->values();

        // Calcular para cada mes
        $monthlyData = $months->map(function ($monthInfo) {
            $startOfMonth = Carbon::parse($monthInfo['month'])->startOfMonth();
            $endOfMonth = Carbon::parse($monthInfo['month'])->endOfMonth();

            // Total de contratos activos en ese mes (por moneda)
            $contractsByCurrency = Contract::query()
                ->where(function ($q) use ($endOfMonth) {
                    $q->where('created_at', '<=', $endOfMonth)
                      ->where(function ($sq) use ($endOfMonth) {
                          $sq->whereNull('deleted_at')
                            ->orWhere('deleted_at', '>', $endOfMonth);
                      });
                })
                ->selectRaw('COALESCE(currency, "CRC") as currency, SUM(amount) as total')
                ->groupBy('currency')
                ->get()
                ->mapWithKeys(fn ($row) => [$row->currency => (float) $row->total]);

            // Total pagado verificado HASTA ese mes (acumulado)
            $paidByCurrency = Payment::query()
                ->where('status', 'verified')
                ->where('created_at', '<=', $endOfMonth)
                ->selectRaw('COALESCE(currency, "CRC") as currency, SUM(amount) as total')
                ->groupBy('currency')
                ->get()
                ->mapWithKeys(fn ($row) => [$row->currency => (float) $row->total]);

            // Calcular pendiente por moneda
            $currencies = $contractsByCurrency->keys()->merge($paidByCurrency->keys())->unique();
            $pendingByCurrency = $currencies->mapWithKeys(function ($currency) use ($contractsByCurrency, $paidByCurrency) {
                $contractTotal = $contractsByCurrency->get($currency, 0);
                $paidTotal = $paidByCurrency->get($currency, 0);
                return [$currency => $contractTotal - $paidTotal];
            });

            return [
                'month' => $monthInfo['label'],
                'contracts_total' => $contractsByCurrency,
                'paid_total' => $paidByCurrency,
                'pending_total' => $pendingByCurrency,
            ];
        });

        return $monthlyData->toArray();
    }
}
