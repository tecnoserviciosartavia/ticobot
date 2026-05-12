<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $period = $request->get('period', '30d');
        $today = Carbon::today();

        // Calculate date range based on period
        $startDate = match($period) {
            '7d' => $today->copy()->subDays(7),
            '30d' => $today->copy()->subDays(30),
            '90d' => $today->copy()->subDays(90),
            '1y' => $today->copy()->subYear(),
            default => $today->copy()->subDays(30),
        };

        // Calculate current period stats
        $currentContracts = Contract::where('created_at', '>=', $startDate)->count();
        $currentActiveContracts = Contract::whereHas('client')->where('created_at', '>=', $startDate)->count();
        $currentRevenue = Payment::where('status', 'verified')->where('created_at', '>=', $startDate)->sum('amount') ?: 0;
        $currentPendingPayments = Payment::where('status', '!=', 'verified')->where('created_at', '>=', $startDate)->count();
        $currentVerifiedPayments = Payment::where('status', 'verified')->where('created_at', '>=', $startDate)->count();
        $currentTotalPayments = Payment::where('created_at', '>=', $startDate)->count();

        // Calculate previous period stats for comparison
        $previousStartDate = match($period) {
            '7d' => $startDate->copy()->subDays(7),
            '30d' => $startDate->copy()->subDays(30),
            '90d' => $startDate->copy()->subDays(90),
            '1y' => $startDate->copy()->subYear(),
            default => $startDate->copy()->subDays(30),
        };
        $previousEndDate = $startDate->copy()->subDay();

        $previousContracts = Contract::whereBetween('created_at', [$previousStartDate, $previousEndDate])->count();
        $previousActiveContracts = Contract::whereHas('client')->whereBetween('created_at', [$previousStartDate, $previousEndDate])->count();
        $previousRevenue = Payment::where('status', 'verified')->whereBetween('created_at', [$previousStartDate, $previousEndDate])->sum('amount') ?: 0;
        $previousPendingPayments = Payment::where('status', '!=', 'verified')->whereBetween('created_at', [$previousStartDate, $previousEndDate])->count();
        $previousVerifiedPayments = Payment::where('status', 'verified')->whereBetween('created_at', [$previousStartDate, $previousEndDate])->count();
        $previousTotalPayments = Payment::whereBetween('created_at', [$previousStartDate, $previousEndDate])->count();

        // Calculate percentage changes
        $contractsChange = $previousContracts > 0 ? (($currentContracts - $previousContracts) / $previousContracts) * 100 : 0;
        $activeContractsChange = $previousActiveContracts > 0 ? (($currentActiveContracts - $previousActiveContracts) / $previousActiveContracts) * 100 : 0;
        $revenueChange = $previousRevenue > 0 ? (($currentRevenue - $previousRevenue) / $previousRevenue) * 100 : 0;
        $pendingPaymentsChange = $previousPendingPayments > 0 ? (($currentPendingPayments - $previousPendingPayments) / $previousPendingPayments) * 100 : 0;
        
        // Calculate conversion rate (verified payments / total payments)
        $conversionRate = $currentTotalPayments > 0 ? ($currentVerifiedPayments / $currentTotalPayments) * 100 : 0;
        $previousConversionRate = $previousTotalPayments > 0 ? ($previousVerifiedPayments / $previousTotalPayments) * 100 : 0;
        $conversionRateChange = $previousConversionRate > 0 ? (($conversionRate - $previousConversionRate) / $previousConversionRate) * 100 : 0;

        // Calculate stats for the new Dashboard component filtered by period
        $stats = [
            'totalContracts' => $currentContracts,
            'activeContracts' => $currentActiveContracts,
            'totalRevenue' => $currentRevenue,
            'pendingPayments' => $currentPendingPayments,
            'conversionRate' => round($conversionRate, 1),
            'recentActivity' => $this->getRecentActivity($startDate),
            'paymentStats' => [
                'verified' => $currentVerifiedPayments,
                'unverified' => $currentTotalPayments - $currentVerifiedPayments,
                'total' => $currentTotalPayments,
                'failed' => 0, // Can be calculated based on failed reminders
            ],
            'reminderStats' => [
                'sent' => Reminder::where('status', 'sent')->where('created_at', '>=', $startDate)->count(),
                'pending' => Reminder::whereIn('status', ['pending', 'queued'])->where('created_at', '>=', $startDate)->count(),
                'failed' => Reminder::where('status', 'failed')->where('created_at', '>=', $startDate)->count(),
            ],
            'revenueByMonth' => $this->getRevenueByMonth($startDate),
            'period' => $period,
            'changes' => [
                'contracts' => round($contractsChange, 1),
                'activeContracts' => round($activeContractsChange, 1),
                'revenue' => round($revenueChange, 1),
                'pendingPayments' => round($pendingPaymentsChange, 1),
                'conversionRate' => round($conversionRateChange, 1),
            ],
            'recentSentReminders' => $this->getRecentSentReminders($startDate),
            'upcomingCollections' => $this->getUpcomingCollectionsSnapshot(7),
        ];

        return Inertia::render('Dashboard', [
            'stats' => $stats,
        ]);
    }

    private function getRecentActivity(Carbon $startDate): array
    {
        return collect([])
            ->concat(
                Reminder::query()
                    ->where('created_at', '>=', $startDate)
                    ->with(['client:id,name', 'contract:id,name'])
                    ->latest('created_at')
                    ->limit(3)
                    ->get()
                    ->map(fn (Reminder $reminder) => [
                        'id' => $reminder->id,
                        'type' => 'reminder',
                        'description' => "Recordatorio para {$reminder->client?->name}",
                        'created_at' => $reminder->created_at->toISOString(),
                    ])
            )
            ->concat(
                Payment::query()
                    ->where('created_at', '>=', $startDate)
                    ->with(['client:id,name', 'contract:id,name'])
                    ->latest('created_at')
                    ->limit(2)
                    ->get()
                    ->map(fn (Payment $payment) => [
                        'id' => $payment->id,
                        'type' => 'payment',
                        'description' => "Pago de {$payment->client?->name}",
                        'created_at' => $payment->created_at->toISOString(),
                    ])
            )
            ->sortByDesc('created_at')
            ->values()
            ->take(5)
            ->toArray();
    }

    private function getRevenueByMonth(Carbon $startDate): array
    {
        return Payment::query()
            ->where('status', 'verified')
            ->where('created_at', '>=', $startDate)
            ->selectRaw('DATE_FORMAT(created_at, "%Y-%m") as month, SUM(amount) as revenue, COUNT(*) as contracts')
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->map(fn ($item) => [
                'month' => Carbon::createFromFormat('Y-m', $item->month)->format('M Y'),
                'revenue' => (float) $item->revenue,
                'contracts' => (int) $item->contracts,
            ])
            ->toArray();
    }

    /**
     * Recordatorios de cobro ya enviados en el período (WhatsApp, etc.); suelen incluir pedido de comprobante.
     *
     * @return array<int, array{id: int, client_name: string|null, client_phone: string|null, contract_name: string|null, channel: string|null, sent_at: string|null}>
     */
    private function getRecentSentReminders(Carbon $startDate): array
    {
        return Reminder::query()
            ->where('status', 'sent')
            ->whereNotNull('sent_at')
            ->where('sent_at', '>=', $startDate)
            ->with(['client:id,name,phone', 'contract:id,name'])
            ->orderByDesc('sent_at')
            ->limit(30)
            ->get()
            ->map(fn (Reminder $r) => [
                'id' => $r->id,
                'client_name' => $r->client?->name,
                'client_phone' => $r->client?->phone,
                'contract_name' => $r->contract?->name,
                'channel' => $r->channel,
                'sent_at' => $r->sent_at?->toIso8601String(),
            ])
            ->values()
            ->all();
    }

    /**
     * Misma regla que Cobranzas: contrato con vencimiento y sin pago registrado en el mes del vencimiento.
     *
     * @return array{
     *   as_of: string,
     *   window_days: int,
     *   overdue: array{count: int, by_currency: array<string, float>},
     *   due_today: array{count: int, by_currency: array<string, float>},
     *   due_soon: array{count: int, by_currency: array<string, float>},
     *   total_by_currency: array<string, float>
     * }
     */
    private function getUpcomingCollectionsSnapshot(int $days): array
    {
        $today = Carbon::today();
        if ($days < 0) {
            $days = 0;
        }
        if ($days > 31) {
            $days = 31;
        }
        $soonEnd = $today->copy()->addDays($days);

        $hasPaymentForMonth = function (int $clientId, Carbon $dueDate): bool {
            $monthStart = $dueDate->copy()->startOfMonth();
            $monthEnd = $dueDate->copy()->endOfMonth();

            return Payment::query()
                ->where('client_id', $clientId)
                ->where('amount', '>', 0)
                ->whereBetween('created_at', [$monthStart, $monthEnd])
                ->exists();
        };

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

        $mapRow = function (Contract $c) use ($hasPaymentForMonth): array {
            $due = $c->next_due_date ? Carbon::parse($c->next_due_date) : null;
            $client = $c->client;
            $paid = ($client && $due) ? $hasPaymentForMonth((int) $client->id, $due) : false;

            return [
                'amount' => (float) $c->amount,
                'currency' => $c->currency ?? 'CRC',
                'has_payment_registered' => $paid,
            ];
        };

        $aggregate = function ($collection) use ($mapRow): array {
            $byCurrency = [];
            $count = 0;
            foreach ($collection as $c) {
                $row = $mapRow($c);
                if ($row['has_payment_registered']) {
                    continue;
                }
                $count++;
                $cur = $row['currency'];
                $byCurrency[$cur] = ($byCurrency[$cur] ?? 0) + $row['amount'];
            }

            return ['count' => $count, 'by_currency' => $byCurrency];
        };

        $overdue = $aggregate($overdueContracts);
        $dueToday = $aggregate($dueTodayContracts);
        $dueSoon = $aggregate($dueSoonContracts);

        $totalByCurrency = [];
        foreach ([$overdue['by_currency'], $dueToday['by_currency'], $dueSoon['by_currency']] as $part) {
            foreach ($part as $cur => $amt) {
                $totalByCurrency[$cur] = ($totalByCurrency[$cur] ?? 0) + $amt;
            }
        }

        return [
            'as_of' => $today->toDateString(),
            'window_days' => $days,
            'overdue' => ['count' => $overdue['count'], 'by_currency' => $overdue['by_currency']],
            'due_today' => ['count' => $dueToday['count'], 'by_currency' => $dueToday['by_currency']],
            'due_soon' => ['count' => $dueSoon['count'], 'by_currency' => $dueSoon['by_currency']],
            'total_by_currency' => $totalByCurrency,
        ];
    }
}
