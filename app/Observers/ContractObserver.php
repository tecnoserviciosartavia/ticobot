<?php

namespace App\Observers;

use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;

class ContractObserver
{
    private function normalizeScheduledFor(Carbon $date): Carbon
    {
        $tz = config('app.timezone');
        $time = (string) config('reminders.send_time', '09:00');
        // Guarantee we produce a datetime in the app timezone at a stable hour.
        return $date->copy()->timezone($tz)->startOfDay()->setTimeFromTimeString($time);
    }

    /**
     * Handle the Contract "created" event.
     */
    public function created(Contract $contract): void
    {
        // Auto-create reminder when contract is created
        if ($contract->client_id && $contract->next_due_date) {
            // Parse in app timezone to avoid UTC midnight issues
            $dueDate = Carbon::parse($contract->next_due_date, config('app.timezone'));
            
            // Schedule reminder for the due date at configured send_time
            $scheduledFor = $this->normalizeScheduledFor($dueDate);

            // If scheduled date is in the past, schedule for today
            if ($scheduledFor->isPast()) {
                $scheduledFor = $this->normalizeScheduledFor(Carbon::today(config('app.timezone')));
            }

            // Map billing_cycle to recurrence
            $recurrence = match($contract->billing_cycle) {
                'weekly' => 'weekly',
                'biweekly' => 'biweekly',
                'monthly' => 'monthly',
                'one_time' => 'once',
                default => 'once',
            };

            Reminder::create([
                'client_id' => $contract->client_id,
                'contract_id' => $contract->id,
                'scheduled_for' => $scheduledFor,
                'status' => 'pending',
                'channel' => 'whatsapp',
                'recurrence' => $recurrence,
            ]);
        }
    }

    /**
     * Handle the Contract "updated" event.
     */
    public function updated(Contract $contract): void
    {
        // Update pending reminders if next_due_date changes
        if ($contract->client_id && $contract->wasChanged('next_due_date') && $contract->next_due_date) {
            $newScheduledFor = $this->normalizeScheduledFor(
                Carbon::parse($contract->next_due_date, config('app.timezone'))
            );

            if ($newScheduledFor->isFuture() || $newScheduledFor->isToday()) {
                // Update pending reminders for this contract
                Reminder::where('contract_id', $contract->id)
                    ->where('status', 'pending')
                    ->update(['scheduled_for' => $newScheduledFor]);
            }
        }

        // Update billing_cycle recurrence in pending reminders
        if ($contract->wasChanged('billing_cycle')) {
            $recurrence = match($contract->billing_cycle) {
                'weekly' => 'weekly',
                'biweekly' => 'biweekly',
                'monthly' => 'monthly',
                'one_time' => 'once',
                default => 'once',
            };

            Reminder::where('contract_id', $contract->id)
                ->where('status', 'pending')
                ->update(['recurrence' => $recurrence]);
        }

        // Update payload amount in pending reminders if contract amount changes
        if ($contract->wasChanged('amount')) {
            $reminders = Reminder::where('contract_id', $contract->id)
                ->where('status', 'pending')
                ->get();

            foreach ($reminders as $reminder) {
                $payload = $reminder->payload ?? [];
                $payload['amount'] = (string) $contract->amount;
                $reminder->payload = $payload;
                $reminder->save();
            }
        }
    }
}
