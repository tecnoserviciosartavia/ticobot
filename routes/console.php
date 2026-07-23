<?php

use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Carbon;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('billing:resend-missed-month {month? : Mes objetivo YYYY-MM} {--dry-run : No aplica cambios, solo muestra el plan}', function (?string $month = null) {
    $tz = config('app.timezone', 'America/Costa_Rica');
    $month = $month ?: Carbon::now($tz)->format('Y-m');

    try {
        $target = Carbon::createFromFormat('Y-m', $month, $tz)->startOfMonth();
    } catch (\Throwable $e) {
        $this->error('Formato inválido. Usa YYYY-MM, por ejemplo 2026-06.');
        return 1;
    }

    $monthStart = $target->copy()->startOfMonth();
    $monthEnd = $target->copy()->endOfMonth();

    $this->info(sprintf('Revisando recordatorios de contratos mensuales para %s...', $target->format('F Y')));

    $contracts = Contract::query()
        ->where(function ($query) {
            $query->whereNull('billing_cycle')
                ->orWhere('billing_cycle', '')
                ->orWhereIn('billing_cycle', ['monthly', 'mensual']);
        })
        ->whereBetween('next_due_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
        ->get();

    if ($contracts->isEmpty()) {
        $this->info('No se encontraron contratos mensuales con next_due_date en el mes seleccionado.');
        return 0;
    }

    $dryRun = $this->option('dry-run');
    $updatedContracts = 0;
    $skippedContracts = 0;

    foreach ($contracts as $contract) {
        $hasVerifiedPayment = Payment::query()
            ->where('contract_id', $contract->id)
            ->where('status', 'verified')
            ->where(function ($query) use ($month) {
                $query->where('metadata->paid_for_month', $month)
                    ->orWhereJsonContains('metadata->covered_months', $month)
                    ->orWhereRaw("DATE_FORMAT(paid_at, '%Y-%m') = ?", [$month]);
            })
            ->exists();

        if ($hasVerifiedPayment) {
            $skippedContracts++;
            continue;
        }

        $scheduledFor = Carbon::parse($contract->next_due_date, $tz)
            ->startOfDay()
            ->setTimeFromTimeString(config('reminders.send_time', '12:00'));

        $existing = Reminder::query()
            ->where('contract_id', $contract->id)
            ->whereBetween('scheduled_for', [$monthStart->copy()->setTime(0, 0, 0), $monthEnd->copy()->setTime(23, 59, 59)])
            ->whereIn('status', ['pending', 'queued', 'failed', 'sent'])
            ->get();

        if ($existing->isNotEmpty()) {
            foreach ($existing as $reminder) {
                if ($reminder->status !== 'pending') {
                    $this->line(sprintf('  - Contrato %s: reprogramando recordatorio %d (%s) a pending', $contract->name, $reminder->id, $reminder->status));
                    if (! $dryRun) {
                        $reminder->forceFill([
                            'status' => 'pending',
                            'queued_at' => null,
                            'sent_at' => null,
                            'last_attempt_at' => null,
                            'last_resend_at' => Carbon::now($tz)->toDateTimeString(),
                        ])->save();
                    }
                } else {
                    $this->line(sprintf('  - Contrato %s: recordatorio %d ya está pendiente', $contract->name, $reminder->id));
                }
            }
        } else {
            $this->line(sprintf('  - Contrato %s: creando recordatorio pendiente para %s', $contract->name, $scheduledFor->toDateTimeString()));
            if (! $dryRun) {
                Reminder::createOpenUnique([
                    'contract_id' => $contract->id,
                    'client_id' => $contract->client_id,
                    'channel' => 'whatsapp',
                    'scheduled_for' => $scheduledFor,
                    'status' => 'pending',
                    'payload' => array_filter([
                        'recurrence' => 'monthly',
                        'amount' => (string) $contract->amount,
                        'due_date' => $contract->next_due_date?->toDateString(),
                    ], fn ($value) => $value !== null && $value !== ''),
                ]);
            }
        }

        $updatedContracts++;
    }

    $this->info(sprintf('Contratos procesados: %d. Saltados porque ya tienen pago verificado: %d.', $updatedContracts + $skippedContracts, $skippedContracts));
    $this->info(sprintf('Contratos con acciones aplicadas: %d.', $updatedContracts));

    if ($dryRun) {
        $this->info('Dry-run: no se modificó la base de datos.');
    }

    return 0;
})->purpose('Reenvía recordatorios mensuales para un mes objetivo cuando no existe pago verificado para el período.');

Schedule::command('services:notify-platform-payments')->hourly();
Schedule::command('emails:reconcile-sinpe-bcr')->everyFiveMinutes();
