<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Models\SinpeEmailTransaction;
use Illuminate\Support\Carbon;

class PaymentSettlementService
{
    /**
     * Al marcar un pago como verificado: liquidar recordatorios del período (o períodos)
     * y avanzar la fecha del contrato. Funciona igual venga el pago del web, API, bot,
     * SINPE o conciliación, siempre que haya meses en metadata o se puedan inferir.
     */
    public function settleVerifiedPayment(Payment $payment): void
    {
        if ($payment->status !== 'verified') {
            return;
        }

        if (! $payment->client_id) {
            return;
        }

        $meta = is_array($payment->metadata) ? $payment->metadata : [];
        $effectiveContractId = $payment->contract_id
            ?: (isset($meta['conciliation_contract_id']) && is_numeric($meta['conciliation_contract_id'])
                ? (int) $meta['conciliation_contract_id']
                : null);

        $payment->loadMissing('contract');
        $contract = $effectiveContractId
            ? ($payment->contract_id === $effectiveContractId
                ? ($payment->contract ?? Contract::query()->find($effectiveContractId))
                : Contract::query()->find($effectiveContractId))
            : null;

        $settledAt = now(config('app.timezone'));
        $tz = config('app.timezone');

        // 1) Recordatorio explícitamente vinculado (se mantiene el grupo por misma fecha programada).
        if ($payment->reminder_id) {
            $linkedReminder = Reminder::query()->find($payment->reminder_id);

            if ($linkedReminder) {
                $linkedScheduledRaw = $linkedReminder->getRawOriginal('scheduled_for');

                Reminder::query()
                    ->where('client_id', $linkedReminder->client_id)
                    ->where('scheduled_for', $linkedScheduledRaw)
                    ->whereIn('status', ['pending', 'queued', 'sent'])
                    ->where(function ($query) use ($linkedReminder) {
                        if ($linkedReminder->contract_id) {
                            $query->where('contract_id', $linkedReminder->contract_id);
                        } else {
                            $query->whereNull('contract_id');
                        }
                    })
                    ->update([
                        'status' => 'paid',
                        'acknowledged_at' => $settledAt,
                    ]);
            }
        }

        $yearMonths = $this->resolveCoverageYearMonths($payment, $contract);
        $this->maybeBackfillCoveredMonths($payment, $yearMonths);

        $baseQuery = Reminder::query()->where('client_id', $payment->client_id);

        if ($effectiveContractId) {
            $baseQuery->where('contract_id', $effectiveContractId);
        }

        $bulkCount = 0;

        if ($contract && $this->contractIsMonthlyLike($contract) && $yearMonths !== []) {
            $bulkCount = (int) (clone $baseQuery)
                ->whereIn('status', ['pending', 'queued', 'sent'])
                ->where(function ($query) use ($yearMonths, $tz) {
                    foreach ($yearMonths as $ym) {
                        $start = Carbon::createFromFormat('Y-m', $ym, $tz)->startOfMonth();
                        $end = $start->copy()->endOfMonth();
                        $query->orWhereBetween('scheduled_for', [$start, $end]);
                    }
                })
                ->update([
                    'status' => 'paid',
                    'acknowledged_at' => $settledAt,
                ]);
        }

        if ($bulkCount === 0) {
            $nextPending = (clone $baseQuery)
                ->whereIn('status', ['pending', 'queued'])
                ->orderBy('scheduled_for')
                ->first();

            if ($nextPending) {
                $nextScheduledRaw = $nextPending->getRawOriginal('scheduled_for');

                (clone $baseQuery)
                    ->whereIn('status', ['pending', 'queued'])
                    ->where('scheduled_for', $nextScheduledRaw)
                    ->update([
                        'status' => 'paid',
                        'acknowledged_at' => $settledAt,
                    ]);
            }

            $todayStart = Carbon::today($tz)->startOfDay();
            $todayEnd = Carbon::today($tz)->endOfDay();
            (clone $baseQuery)
                ->where('status', 'sent')
                ->whereBetween('sent_at', [$todayStart, $todayEnd])
                ->update([
                    'status' => 'paid',
                    'acknowledged_at' => $settledAt,
                ]);
        }

        if ($contract && $effectiveContractId === $contract->id && $this->contractIsMonthlyLike($contract)) {
            $meta = is_array($payment->metadata) ? $payment->metadata : [];
            $grace = (int) ($meta['grace_months'] ?? 0);
            $n = count($yearMonths);

            if ($n === 0 && isset($meta['months']) && is_numeric($meta['months'])) {
                $n = max(1, (int) $meta['months']);
            }

            if ($n === 0 && $contract->amount > 0 && $payment->amount > 0) {
                $ratio = (float) $payment->amount / (float) $contract->amount;
                if ($ratio > 1.01) {
                    $n = max(1, (int) floor($ratio + 1e-6));
                } else {
                    $n = 1;
                }
            }

            $n = max(1, $n) + max(0, $grace);

            $paidAt = $payment->paid_at
                ? Carbon::parse($payment->paid_at, $tz)
                : Carbon::now($tz);

            $this->advanceContractSchedule($contract, $n, $paidAt, $yearMonths);
        }

        $this->deleteRelatedSinpeEmailTransactions($payment);
    }

    /**
     * Meses cubiertos por todos los pagos verificados del contrato (incluye cortesía).
     *
     * @return array{paid_months: list<string>, last_paid_month: string|null}
     */
    public function computePaidYearMonths(Contract $contract): array
    {
        if (! $this->contractIsMonthlyLike($contract)) {
            return ['paid_months' => [], 'last_paid_month' => null];
        }

        $tz = config('app.timezone');
        $paidMonths = [];

        $payments = Payment::query()
            ->where('contract_id', $contract->id)
            ->where('status', 'verified')
            ->orderBy('paid_at')
            ->get();

        foreach ($payments as $payment) {
            $yms = $this->resolveCoverageYearMonths($payment, $contract);

            foreach ($yms as $ym) {
                $paidMonths[$ym] = true;
            }

            $meta = is_array($payment->metadata) ? $payment->metadata : [];
            $grace = (int) ($meta['grace_months'] ?? 0);

            if ($grace > 0 && $yms !== []) {
                $last = $yms[count($yms) - 1];
                $start = Carbon::createFromFormat('Y-m-d', $last.'-01', $tz);

                for ($i = 1; $i <= $grace; $i++) {
                    $paidMonths[$start->copy()->addMonths($i)->format('Y-m')] = true;
                }
            }
        }

        if ($paidMonths === []) {
            return ['paid_months' => [], 'last_paid_month' => null];
        }

        $list = array_keys($paidMonths);
        sort($list);

        return [
            'paid_months' => $list,
            'last_paid_month' => $list[count($list) - 1],
        ];
    }

    /**
     * Próximo vencimiento coherente con los pagos verificados del contrato.
     */
    public function computeExpectedNextDueDate(Contract $contract): ?Carbon
    {
        if (! $contract->next_due_date || ! $this->contractIsMonthlyLike($contract)) {
            return null;
        }

        $coverage = $this->computePaidYearMonths($contract);

        if ($coverage['last_paid_month'] === null) {
            return null;
        }

        $tz = config('app.timezone');
        $dueDay = (int) Carbon::parse($contract->next_due_date, $tz)->format('d');
        $target = Carbon::createFromFormat('Y-m-d', $coverage['last_paid_month'].'-01', $tz)
            ->addMonthNoOverflow();

        return $target->copy()->day(min($dueDay, $target->daysInMonth));
    }

    /**
     * @return list<string> YYYY-MM ordenados
     */
    public function resolveCoverageYearMonths(Payment $payment, ?Contract $contract): array
    {
        if (! $contract || ! $this->contractIsMonthlyLike($contract)) {
            return [];
        }

        $tz = config('app.timezone');
        $meta = is_array($payment->metadata) ? $payment->metadata : [];

        if (! empty($meta['covered_months']) && is_array($meta['covered_months'])) {
            $out = [];
            foreach ($meta['covered_months'] as $ym) {
                if (is_string($ym) && preg_match('/^\d{4}-\d{2}$/', $ym) === 1) {
                    $out[] = $ym;
                }
            }
            if ($out !== []) {
                $out = array_values(array_unique($out));
                sort($out);

                return $out;
            }
        }

        $count = 0;
        if (isset($meta['months']) && is_numeric($meta['months'])) {
            $count = max(1, (int) $meta['months']);
        }

        if ($count === 0 && $contract->amount > 0 && $payment->amount > 0) {
            $ratio = (float) $payment->amount / (float) $contract->amount;
            if ($ratio > 1.01) {
                $count = max(1, (int) floor($ratio + 1e-6));
            }
        }

        $anchor = $meta['paid_for_month'] ?? null;
        if (! is_string($anchor) || preg_match('/^\d{4}-\d{2}$/', $anchor) !== 1) {
            if ($contract->next_due_date) {
                $anchor = Carbon::parse($contract->next_due_date, $tz)->format('Y-m');
            } elseif ($payment->paid_at) {
                $anchor = Carbon::parse($payment->paid_at, $tz)->format('Y-m');
            } else {
                $anchor = Carbon::now($tz)->format('Y-m');
            }
        }

        if ($count <= 1) {
            return [$anchor];
        }

        $start = Carbon::createFromFormat('Y-m-d', $anchor . '-01', $tz);
        $out = [];
        for ($i = 0; $i < $count; $i++) {
            $out[] = $start->copy()->addMonths($i)->format('Y-m');
        }

        return $out;
    }

    /**
     * @param  list<string>  $yearMonths
     */
    private function maybeBackfillCoveredMonths(Payment $payment, array $yearMonths): void
    {
        if ($yearMonths === []) {
            return;
        }

        $meta = is_array($payment->metadata) ? $payment->metadata : [];
        $existing = $meta['covered_months'] ?? null;

        if (is_array($existing) && $existing !== []) {
            return;
        }

        $meta['covered_months'] = $yearMonths;
        if (empty($meta['paid_for_month']) && $yearMonths !== []) {
            $meta['paid_for_month'] = $yearMonths[0];
        }

        $payment->forceFill(['metadata' => $meta])->saveQuietly();
    }

    /**
     * Elimina transacciones SINPE locales una vez que el pago ya quedó verificado.
     */
    private function deleteRelatedSinpeEmailTransactions(Payment $payment): void
    {
        $referenceCandidates = array_values(array_unique(array_filter([
            trim((string) ($payment->reference ?? '')),
            trim((string) (is_array($payment->metadata) ? ($payment->metadata['sinpe_email_reference'] ?? '') : '')),
        ])));

        $query = SinpeEmailTransaction::query()
            ->where('payment_id', $payment->id);

        if ($referenceCandidates !== []) {
            $query->orWhere(function ($innerQuery) use ($payment, $referenceCandidates) {
                $innerQuery
                    ->where('matched_client_id', $payment->client_id)
                    ->whereIn('reference', $referenceCandidates);
            });
        }

        $transactions = $query->get(['id']);

        if ($transactions->isEmpty()) {
            return;
        }

        SinpeEmailTransaction::query()
            ->whereIn('id', $transactions->pluck('id'))
            ->delete();
    }

    /**
     * @param  list<string>  $yearMonths  Períodos YYYY-MM cubiertos por el pago
     */
    private function advanceContractSchedule(Contract $contract, int $monthsPaid, Carbon $paidAt, array $yearMonths = []): void
    {
        if ($monthsPaid <= 0) {
            return;
        }

        $tz = config('app.timezone');
        $paidAt = $paidAt->copy()->timezone($tz);

        $dueDay = $contract->next_due_date
            ? (int) Carbon::parse($contract->next_due_date, $tz)->format('d')
            : (int) $paidAt->format('d');

        $newDueDate = null;

        if ($yearMonths !== []) {
            $lastYm = $yearMonths[count($yearMonths) - 1];
            // Meses extra tras el último cubierto (p. ej. meses de cortesía).
            $extraAfterCoverage = 1 + max(0, $monthsPaid - count($yearMonths));
            $target = Carbon::createFromFormat('Y-m-d', $lastYm.'-01', $tz)
                ->addMonthsNoOverflow($extraAfterCoverage);
            $newDueDate = $target->copy()->day(min($dueDay, $target->daysInMonth));
        }

        if ($newDueDate === null) {
            $base = $contract->next_due_date
                ? Carbon::parse($contract->next_due_date, $tz)
                : $paidAt;

            $newDueDate = $base->copy()->addMonthsNoOverflow($monthsPaid);
        }

        $contract->update(['next_due_date' => $newDueDate]);
    }

    private function contractIsMonthlyLike(Contract $contract): bool
    {
        $raw = $contract->billing_cycle;
        if ($raw === null || $raw === '') {
            return true;
        }

        $cycle = strtolower(trim((string) $raw));

        return $cycle === 'monthly' || $cycle === 'mensual';
    }
}
