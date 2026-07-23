<?php

namespace App\Console\Commands;

use App\Models\Contract;
use App\Models\Reminder;
use App\Services\PaymentSettlementService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class RepairBillingScheduleCommand extends Command
{
    protected $signature = 'billing:repair-schedule
                            {--dry-run : Solo muestra el plan (default)}
                            {--apply : Aplica correcciones en contratos y recordatorios}
                            {--only-ahead : Solo contratos con next_due_date 1 mes adelantado respecto a pagos}
                            {--only-behind : Solo contratos con next_due_date atrasado respecto a pagos (falta avanzar)}
                            {--resend-due : Tras corregir, reactiva recordatorios vencidos que aún no están pending}';

    protected $description = 'Compara next_due_date vs pagos verificados, corrige desfases y prepara recordatorios';

    public function handle(PaymentSettlementService $settlement): int
    {
        $apply = (bool) $this->option('apply');
        $onlyAhead = (bool) $this->option('only-ahead');
        $onlyBehind = (bool) $this->option('only-behind');
        $resendDue = (bool) $this->option('resend-due');
        $tz = config('app.timezone');
        $today = Carbon::today($tz);

        if (! $apply) {
            $this->info('Modo diagnóstico (usa --apply para corregir).');
        }

        $contracts = Contract::query()
            ->whereNotNull('client_id')
            ->whereNotNull('next_due_date')
            ->where(function ($query) {
                $query->whereNull('billing_cycle')
                    ->orWhere('billing_cycle', '')
                    ->orWhereIn('billing_cycle', ['monthly', 'mensual']);
            })
            ->with('client:id,name')
            ->orderBy('id')
            ->get();

        $rows = [];
        $fixed = 0;
        $resendQueued = 0;

        foreach ($contracts as $contract) {
            $expected = $settlement->computeExpectedNextDueDate($contract);

            if ($expected === null) {
                continue;
            }

            $actual = Carbon::parse($contract->next_due_date, $tz)->startOfDay();
            $expectedDay = $expected->copy()->startOfDay();

            if ($actual->equalTo($expectedDay)) {
                continue;
            }

            $monthDiff = ($actual->year * 12 + $actual->month) - ($expectedDay->year * 12 + $expectedDay->month);
            $coverage = $settlement->computePaidYearMonths($contract);

            if ($onlyAhead && $monthDiff !== 1) {
                continue;
            }

            if ($onlyBehind && $monthDiff >= 0) {
                continue;
            }

            $pending = Reminder::query()
                ->where('contract_id', $contract->id)
                ->where('status', 'pending')
                ->orderBy('scheduled_for')
                ->first();

            $rows[] = [
                'contract' => $contract,
                'client' => $contract->client?->name ?? '—',
                'actual' => $actual->toDateString(),
                'expected' => $expectedDay->toDateString(),
                'last_paid' => $coverage['last_paid_month'],
                'month_diff' => $monthDiff,
                'pending' => $pending?->scheduled_for?->toDateString(),
            ];
        }

        if ($rows === []) {
            $this->info('No hay contratos con desfase según los pagos verificados.');

            return self::SUCCESS;
        }

        $this->table(
            ['ID', 'Cliente', 'Actual', 'Esperado', 'Último pagado', 'Δ meses', 'Recordatorio pending'],
            array_map(fn (array $r) => [
                $r['contract']->id,
                $r['client'],
                $r['actual'],
                $r['expected'],
                $r['last_paid'],
                $r['month_diff'],
                $r['pending'] ?? '—',
            ], $rows),
        );

        $this->newLine();
        $this->info(sprintf('Contratos con desfase: %d', count($rows)));

        $ahead = count(array_filter($rows, fn (array $r) => $r['month_diff'] === 1));
        $behind = count(array_filter($rows, fn (array $r) => $r['month_diff'] === -1));
        $other = count($rows) - $ahead - $behind;
        $this->line(sprintf('- 1 mes adelantado (bug típico): %d', $ahead));
        $this->line(sprintf('- 1 mes atrasado: %d', $behind));
        $this->line(sprintf('- Otros: %d', $other));

        if (! $apply) {
            $this->newLine();
            $this->comment('Ejecutá con --apply para corregir. Agregá --resend-due para reactivar recordatorios ya vencidos.');

            return self::SUCCESS;
        }

        foreach ($rows as $row) {
            /** @var Contract $contract */
            $contract = $row['contract'];
            $expectedDate = $row['expected'];
            $expectedCarbon = Carbon::parse($expectedDate, $tz)->startOfDay();
            $sendTime = (string) config('reminders.send_time', '12:00');
            $scheduledFor = $expectedCarbon->copy()->setTimeFromTimeString($sendTime);

            $contract->update(['next_due_date' => $expectedDate]);
            $fixed++;

            // Eliminar recordatorios pending/queued adelantados por el bug (p. ej. julio cuando debe ser junio).
            $cancelled = Reminder::query()
                ->where('contract_id', $contract->id)
                ->whereIn('status', ['pending', 'queued'])
                ->where('scheduled_for', '>', $expectedCarbon->copy()->endOfMonth())
                ->update([
                    'status' => 'duplicate',
                    'acknowledged_at' => Carbon::now($tz),
                ]);

            $pendingAtExpected = Reminder::query()
                ->where('contract_id', $contract->id)
                ->where('status', 'pending')
                ->whereBetween('scheduled_for', [
                    $expectedCarbon->copy()->startOfMonth(),
                    $expectedCarbon->copy()->endOfMonth(),
                ])
                ->exists();

            if (! $pendingAtExpected) {
                Reminder::createOpenUnique([
                    'contract_id' => $contract->id,
                    'client_id' => $contract->client_id,
                    'channel' => 'whatsapp',
                    'scheduled_for' => $scheduledFor,
                    'status' => 'pending',
                    'payload' => array_filter([
                        'recurrence' => 'monthly',
                        'amount' => (string) $contract->amount,
                        'due_date' => $expectedDate,
                    ], fn ($value) => $value !== null && $value !== ''),
                ]);
            }

            $this->line(sprintf(
                '✓ Contrato %d (%s): %s → %s%s',
                $contract->id,
                $row['client'],
                $row['actual'],
                $expectedDate,
                $cancelled > 0 ? " ({$cancelled} recordatorio(s) adelantado(s) cancelado(s))" : '',
            ));

            if (! $resendDue || $expectedCarbon->greaterThan($today)) {
                continue;
            }

            $reminder = Reminder::query()
                ->where('contract_id', $contract->id)
                ->whereIn('status', ['pending', 'queued', 'sent', 'failed'])
                ->whereBetween('scheduled_for', [
                    $expectedCarbon->copy()->startOfMonth(),
                    $expectedCarbon->copy()->endOfMonth(),
                ])
                ->orderByDesc('id')
                ->first();

            if ($reminder && $reminder->status !== 'pending') {
                $reminder->forceFill([
                    'status' => 'pending',
                    'scheduled_for' => $scheduledFor,
                    'queued_at' => null,
                    'sent_at' => null,
                    'last_attempt_at' => null,
                    'last_resend_at' => Carbon::now($tz),
                ])->save();
                $resendQueued++;
                $this->line(sprintf('  ↳ Recordatorio reactivado para %s', $scheduledFor->toDateTimeString()));
            }
        }

        $this->newLine();
        $this->info(sprintf('Contratos corregidos: %d', $fixed));

        if ($resendDue) {
            $this->info(sprintf('Recordatorios reactivados para reenvío: %d', $resendQueued));
        }

        return self::SUCCESS;
    }
}
