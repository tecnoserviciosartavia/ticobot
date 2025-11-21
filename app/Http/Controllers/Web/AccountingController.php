<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
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

        return Inertia::render('Accounting/Index', [
            'by_status_currency' => $byStatusCurrency,
            'totals' => $totals,
            'total_months' => $totalMonths,
            'daily' => $dailyWindow,
            'conciliation_rate' => $conciliationRate,
        ]);
    }
}
