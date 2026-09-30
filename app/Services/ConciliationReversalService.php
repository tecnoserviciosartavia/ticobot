<?php

namespace App\Services;

use App\Models\Conciliation;
use App\Models\Reminder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ConciliationReversalService
{
    public function __construct(private readonly PaymentSettlementService $settlement) {}

    public function reverse(Conciliation $conciliation, ?int $userId = null): void
    {
        DB::transaction(function () use ($conciliation, $userId): void {
            $conciliation->loadMissing('payment.contract');
            $payment = $conciliation->payment;

            if (! $payment) {
                $conciliation->delete();

                return;
            }

            $contract = $payment->contract;
            $periods = $this->settlement->resolveCoverageYearMonths($payment, $contract);
            $referenceTime = $conciliation->verified_at ?? $conciliation->updated_at;
            $reopenedIds = [];

            if ($contract) {
                $candidates = Reminder::query()
                    ->where('contract_id', $contract->id)
                    ->where('status', 'paid')
                    ->get()
                    ->filter(function (Reminder $reminder) use ($periods, $referenceTime): bool {
                        $periodMatches = $reminder->scheduled_for
                            && in_array($reminder->scheduled_for->timezone(config('app.timezone'))->format('Y-m'), $periods, true);
                        $timeMatches = $referenceTime && $reminder->acknowledged_at
                            && abs($reminder->acknowledged_at->diffInSeconds($referenceTime, false)) <= 300;

                        return $periodMatches || $timeMatches;
                    });

                foreach ($candidates as $reminder) {
                    $isFuture = $reminder->scheduled_for
                        && $reminder->scheduled_for->isFuture();
                    $reminder->forceFill([
                        'status' => $isFuture ? 'pending' : 'sent',
                        'acknowledged_at' => null,
                    ])->save();
                    $reopenedIds[] = $reminder->id;
                }
            }

            $metadata = is_array($payment->metadata) ? $payment->metadata : [];
            $metadata['conciliation_reversal'] = [
                'conciliation_id' => $conciliation->id,
                'reversed_at' => now(config('app.timezone'))->toIso8601String(),
                'reversed_by' => $userId,
                'previous_status' => $conciliation->status,
                'periods' => $periods,
                'reopened_reminder_ids' => $reopenedIds,
            ];
            $payment->forceFill(['status' => 'unverified', 'metadata' => $metadata])->save();
            $conciliation->delete();

            if ($contract) {
                $expected = $this->settlement->computeExpectedNextDueDate($contract);
                if ($expected) {
                    $contract->forceFill(['next_due_date' => $expected->toDateString()])->save();
                }
            }
        });
    }
}
