<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

class MobileFinanceController extends Controller
{
    public function show(): JsonResponse
    {
        $start = Carbon::now(config('app.timezone'))->startOfMonth();
        $end = $start->copy()->endOfMonth();
        $periodPayments = Payment::query()
            ->where('currency', 'CRC')
            ->where(fn ($query) => $query
                ->whereBetween('paid_at', [$start->toDateString(), $end->toDateString()])
                ->orWhere(fn ($fallback) => $fallback
                    ->whereNull('paid_at')
                    ->whereBetween('created_at', [$start, $end])));

        $dueContracts = Contract::query()
            ->where('status', 'active')
            ->where('currency', 'CRC')
            ->whereDate('next_due_date', '<=', $end)
            ->get(['id', 'amount']);
        $contractIds = $dueContracts->pluck('id');
        $totalsByStatus = fn (string $status) => Payment::query()
            ->whereIn('contract_id', $contractIds)
            ->where('status', $status)
            ->where('amount', '>', 0)
            ->where(fn ($query) => $query
                ->whereBetween('paid_at', [$start->toDateString(), $end->toDateString()])
                ->orWhere(fn ($fallback) => $fallback
                    ->whereNull('paid_at')
                    ->whereBetween('created_at', [$start, $end])))
            ->selectRaw('contract_id, SUM(amount) as total')
            ->groupBy('contract_id')
            ->pluck('total', 'contract_id');

        $verifiedByContract = $totalsByStatus('verified');
        $reviewByContract = $totalsByStatus('in_review');
        $contracted = (float) Contract::query()->where('status', 'active')->where('currency', 'CRC')->sum('amount');
        $verified = (float) (clone $periodPayments)->where('status', 'verified')->sum('amount');
        $inReview = (float) (clone $periodPayments)->where('status', 'in_review')->sum('amount');
        $unverified = (float) (clone $periodPayments)->where('status', 'unverified')->sum('amount');
        $due = (float) $dueContracts->sum('amount');
        $dueVerified = (float) $dueContracts->sum(
            fn (Contract $contract) => min((float) $contract->amount, (float) ($verifiedByContract[$contract->id] ?? 0))
        );
        $dueInReview = (float) $dueContracts->sum(
            fn (Contract $contract) => min(
                max(0, (float) $contract->amount - (float) ($verifiedByContract[$contract->id] ?? 0)),
                (float) ($reviewByContract[$contract->id] ?? 0)
            )
        );

        return response()->json(['data' => [
            'period_label' => $start->locale('es')->translatedFormat('F Y'),
            'contracted' => $contracted,
            'verified' => $verified,
            'pending' => max(0, $due - $dueVerified - $dueInReview),
            'in_review' => $inReview + $unverified,
            'due_this_month' => $due,
            'future' => max(0, $contracted - $due),
            'verified_count' => (int) (clone $periodPayments)->where('status', 'verified')->count(),
            'review_count' => (int) (clone $periodPayments)->whereIn('status', ['in_review', 'unverified'])->count(),
        ]]);
    }
}
