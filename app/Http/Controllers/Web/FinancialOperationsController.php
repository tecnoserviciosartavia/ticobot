<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class FinancialOperationsController extends Controller
{
    public function index(Request $request): Response
    {
        $tab = in_array($request->query('tab'), ['overview', 'payments', 'collections'], true)
            ? (string) $request->query('tab')
            : 'overview';
        $status = trim((string) $request->query('status', ''));
        $search = trim((string) $request->query('search', ''));
        $start = Carbon::now(config('app.timezone'))->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $periodPayments = Payment::query()
            ->where('currency', 'CRC')
            ->where(function ($query) use ($start, $end): void {
                $query->whereBetween('paid_at', [$start->toDateString(), $end->toDateString()])
                    ->orWhere(function ($fallback) use ($start, $end): void {
                        $fallback->whereNull('paid_at')->whereBetween('created_at', [$start, $end]);
                    });
            });

        $summary = [
            'contracted' => (float) Contract::query()->where('status', 'active')->where('currency', 'CRC')->sum('amount'),
            'verified' => (float) (clone $periodPayments)->where('status', 'verified')->sum('amount'),
            'in_review' => (float) (clone $periodPayments)->where('status', 'in_review')->sum('amount'),
            'unverified' => (float) (clone $periodPayments)->where('status', 'unverified')->sum('amount'),
            'verified_count' => (int) (clone $periodPayments)->where('status', 'verified')->count(),
            'review_count' => (int) (clone $periodPayments)->whereIn('status', ['in_review', 'unverified'])->count(),
        ];
        $dueContracts = Contract::query()
            ->where('status', 'active')
            ->where('currency', 'CRC')
            ->whereDate('next_due_date', '<=', $end)
            ->get(['id', 'amount', 'next_due_date']);
        $dueContractIds = $dueContracts->pluck('id');
        $verifiedByContract = Payment::query()
            ->whereIn('contract_id', $dueContractIds)
            ->where('status', 'verified')
            ->where('amount', '>', 0)
            ->where(function ($query) use ($start, $end): void {
                $query->whereBetween('paid_at', [$start->toDateString(), $end->toDateString()])
                    ->orWhere(function ($fallback) use ($start, $end): void {
                        $fallback->whereNull('paid_at')->whereBetween('created_at', [$start, $end]);
                    });
            })
            ->selectRaw('contract_id, SUM(amount) as total')
            ->groupBy('contract_id')
            ->pluck('total', 'contract_id');
        $reviewByContract = Payment::query()
            ->whereIn('contract_id', $dueContractIds)
            ->where('status', 'in_review')
            ->where('amount', '>', 0)
            ->where(function ($query) use ($start, $end): void {
                $query->whereBetween('paid_at', [$start->toDateString(), $end->toDateString()])
                    ->orWhere(function ($fallback) use ($start, $end): void {
                        $fallback->whereNull('paid_at')->whereBetween('created_at', [$start, $end]);
                    });
            })
            ->selectRaw('contract_id, SUM(amount) as total')
            ->groupBy('contract_id')
            ->pluck('total', 'contract_id');

        $summary['due_this_month'] = (float) $dueContracts->sum('amount');
        $summary['due_verified'] = (float) $dueContracts->sum(
            fn (Contract $contract) => min((float) $contract->amount, (float) ($verifiedByContract[$contract->id] ?? 0))
        );
        $summary['due_in_review'] = (float) $dueContracts->sum(
            fn (Contract $contract) => min(
                max(0, (float) $contract->amount - (float) ($verifiedByContract[$contract->id] ?? 0)),
                (float) ($reviewByContract[$contract->id] ?? 0)
            )
        );
        $summary['overdue'] = (float) $dueContracts
            ->filter(fn (Contract $contract) => $contract->next_due_date?->isBefore(Carbon::today(config('app.timezone'))))
            ->sum('amount');
        $summary['future'] = max(0, $summary['contracted'] - $summary['due_this_month']);
        $summary['pending'] = max(0, $summary['due_this_month'] - $summary['due_verified'] - $summary['due_in_review']);
        $periodObligations = $summary['verified'] + $summary['due_this_month'];
        $summary['rate'] = $periodObligations > 0
            ? round(($summary['verified'] / $periodObligations) * 100, 2)
            : 0.0;

        $paymentsQuery = Payment::query()
            ->with(['client:id,name,phone', 'contract:id,name,amount,currency', 'conciliation:id,payment_id,status'])
            ->withCount('receipts');

        if ($status !== '') {
            $paymentsQuery->where('status', $status);
        }
        if ($search !== '') {
            $paymentsQuery->where(function ($query) use ($search): void {
                $query->where('reference', 'like', "%{$search}%")
                    ->orWhereHas('client', fn ($client) => $client->where('name', 'like', "%{$search}%"));
            });
        }

        $payments = $paymentsQuery
            ->orderByDesc('created_at')
            ->paginate(15, ['*'], 'payments_page')
            ->withQueryString()
            ->through(fn (Payment $payment) => [
                'id' => $payment->id,
                'status' => $payment->status,
                'channel' => $payment->channel,
                'amount' => (float) $payment->amount,
                'currency' => $payment->currency ?: 'CRC',
                'reference' => $payment->reference,
                'paid_at' => $payment->paid_at?->toDateString(),
                'created_at' => $payment->created_at?->toIso8601String(),
                'receipts_count' => $payment->receipts_count,
                'client' => $payment->client?->only(['id', 'name', 'phone']),
                'contract' => $payment->contract?->only(['id', 'name', 'amount', 'currency']),
                'conciliation' => $payment->conciliation?->only(['id', 'status']),
                'needs_attention' => $payment->client_id === null
                    || $payment->contract_id === null
                    || (float) $payment->amount <= 0
                    || $payment->paid_at === null,
            ]);

        return Inertia::render('Finance/Index', [
            'activeTab' => $tab,
            'periodLabel' => $start->locale('es')->translatedFormat('F Y'),
            'summary' => $summary,
            'dataQuality' => [
                'without_contract' => Payment::query()->whereNull('contract_id')->count(),
                'without_client' => Payment::query()->whereNull('client_id')->count(),
                'zero_amount' => Payment::query()->where('amount', '<=', 0)->count(),
                'without_paid_at' => Payment::query()->whereNull('paid_at')->count(),
            ],
            'payments' => $payments,
            'filters' => ['status' => $status, 'search' => $search],
        ]);
    }

    public function payments(): RedirectResponse
    {
        return redirect()->route('finance.index', ['tab' => 'payments']);
    }

    public function collections(): RedirectResponse
    {
        return redirect()->route('finance.index', ['tab' => 'collections']);
    }

    public function conciliations(): RedirectResponse
    {
        return redirect()->route('finance.index', ['tab' => 'payments']);
    }

    public function accounting(): RedirectResponse
    {
        return redirect()->route('finance.index', ['tab' => 'overview']);
    }
}
