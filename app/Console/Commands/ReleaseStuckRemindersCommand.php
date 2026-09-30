<?php

namespace App\Console\Commands;

use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;
use Illuminate\Console\Command;

class ReleaseStuckRemindersCommand extends Command
{
    protected $signature = 'billing:release-stuck-reminders
                            {--dry-run : Solo muestra acciones (default)}
                            {--apply : Aplica cambios en la base de datos}
                            {--minutes=30 : Minutos en queued antes de liberar}';

    protected $description = 'Libera recordatorios atascados en queued y crea pending para vencimientos vencidos sin recordatorio';

    public function handle(): int
    {
        $dryRun = ! (bool) $this->option('apply');
        $minutes = max(5, (int) $this->option('minutes'));
        $tz = config('app.timezone');
        $now = Carbon::now($tz);
        $cutoff = $now->copy()->subMinutes($minutes);
        $sendTime = (string) config('reminders.send_time', '09:00');

        $stuck = Reminder::query()
            ->where('status', 'queued')
            ->where(function ($query) use ($cutoff) {
                $query->where('queued_at', '<=', $cutoff)
                    ->orWhere(function ($nested) use ($cutoff) {
                        $nested->whereNull('queued_at')
                            ->where('last_attempt_at', '<=', $cutoff);
                    });
            })
            ->with('client:id,name')
            ->orderBy('id')
            ->get();

        $this->info(sprintf('Recordatorios queued atascados (>=%d min): %d', $minutes, $stuck->count()));

        foreach ($stuck as $reminder) {
            $label = sprintf('#%d %s (queued %s)', $reminder->id, $reminder->client?->name ?? '—', $reminder->queued_at ?? $reminder->last_attempt_at ?? '?');
            if ($dryRun) {
                $this->line("  liberar → pending: {$label}");
                continue;
            }

            $reminder->forceFill([
                'status' => 'pending',
                'queued_at' => null,
                'last_resend_at' => $now,
            ])->save();

            $this->line("  ✓ liberado: {$label}");
        }

        $today = Carbon::today($tz);
        $overdueContracts = Contract::query()
            ->whereNotNull('client_id')
            ->whereNotNull('next_due_date')
            ->whereDate('next_due_date', '<=', $today)
            ->where(function ($query) {
                $query->whereNull('billing_cycle')
                    ->orWhere('billing_cycle', '')
                    ->orWhereIn('billing_cycle', ['monthly', 'mensual']);
            })
            ->with('client:id,name')
            ->orderBy('next_due_date')
            ->get();

        $created = 0;

        foreach ($overdueContracts as $contract) {
            $dueDate = Carbon::parse($contract->next_due_date, $tz)->startOfDay();
            $hasOpen = Reminder::query()
                ->where('contract_id', $contract->id)
                ->whereIn('status', ['pending', 'queued'])
                ->exists();

            if ($hasOpen) {
                continue;
            }

            $hasSentForDue = Reminder::query()
                ->where('contract_id', $contract->id)
                ->where('status', 'sent')
                ->whereDate('scheduled_for', $dueDate->toDateString())
                ->exists();

            if ($hasSentForDue) {
                continue;
            }

            $scheduledFor = $dueDate->copy()->setTimeFromTimeString($sendTime);

            if ($dryRun) {
                $this->line(sprintf(
                    '  crear pending: contrato #%d %s → %s',
                    $contract->id,
                    $contract->client?->name ?? '—',
                    $scheduledFor->toDateTimeString(),
                ));
                $created++;
                continue;
            }

            Reminder::createOpenUnique([
                'contract_id' => $contract->id,
                'client_id' => $contract->client_id,
                'channel' => 'whatsapp',
                'scheduled_for' => $scheduledFor,
                'status' => 'pending',
                'payload' => array_filter([
                    'recurrence' => 'monthly',
                    'amount' => (string) $contract->amount,
                    'due_date' => $dueDate->toDateString(),
                ], fn ($value) => $value !== null && $value !== ''),
            ]);

            $created++;
            $this->line(sprintf(
                '  ✓ pending creado: contrato #%d %s → %s',
                $contract->id,
                $contract->client?->name ?? '—',
                $scheduledFor->toDateTimeString(),
            ));
        }

        $this->newLine();
        $this->info(sprintf('Pending creados/reactivados para vencidos: %d', $created));

        if ($dryRun) {
            $this->comment('Dry-run: no se modificó la base de datos.');
        }

        return self::SUCCESS;
    }
}
