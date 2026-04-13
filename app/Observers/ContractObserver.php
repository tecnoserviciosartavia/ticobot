<?php

namespace App\Observers;

use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;

class ContractObserver
{
    private function recurrenceForBillingCycle(string $billingCycle): string
    {
        return match($billingCycle) {
            'weekly' => 'weekly',
            'biweekly' => 'biweekly',
            'monthly' => 'monthly',
            'one_time' => 'once',
            default => 'once',
        };
    }

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

            // Map billing_cycle to recurrence
            $recurrence = $this->recurrenceForBillingCycle($contract->billing_cycle);

            Reminder::createOpenUnique([
                'client_id' => $contract->client_id,
                'contract_id' => $contract->id,
                'scheduled_for' => $scheduledFor,
                'status' => 'pending',
                'channel' => 'whatsapp',
                'payload' => array_filter([
                    'recurrence' => $recurrence,
                    'amount' => (string) $contract->amount,
                    'due_date' => $contract->next_due_date?->toDateString(),
                ], fn ($value) => $value !== null && $value !== ''),
            ]);
        }
    }

    /**
     * Handle the Contract "updated" event.
     */
    public function updated(Contract $contract): void
    {
        // If a previously unassigned contract gets assigned to a client, ensure it has an initial reminder.
        if ($contract->wasChanged('client_id') && $contract->client_id && $contract->next_due_date) {
            $hasAnyReminder = Reminder::where('contract_id', $contract->id)->exists();

            if (! $hasAnyReminder) {
                $dueDate = Carbon::parse($contract->next_due_date, config('app.timezone'));
                $scheduledFor = $this->normalizeScheduledFor($dueDate);

                $recurrence = $this->recurrenceForBillingCycle($contract->billing_cycle);

                Reminder::createOpenUnique([
                    'client_id' => $contract->client_id,
                    'contract_id' => $contract->id,
                    'scheduled_for' => $scheduledFor,
                    'status' => 'pending',
                    'channel' => 'whatsapp',
                    'payload' => array_filter([
                        'recurrence' => $recurrence,
                        'amount' => (string) $contract->amount,
                        'due_date' => $contract->next_due_date?->toDateString(),
                    ], fn ($value) => $value !== null && $value !== ''),
                ]);
            }
        }

        // Update pending reminders if next_due_date changes
        if ($contract->client_id && $contract->wasChanged('next_due_date') && $contract->next_due_date) {
            $newScheduledFor = $this->normalizeScheduledFor(
                Carbon::parse($contract->next_due_date, config('app.timezone'))
            );

            // Update pending reminders for this contract, preserving the real due date
            // even when it is already overdue.
            $updated = Reminder::where('contract_id', $contract->id)
                ->where('status', 'pending')
                ->update(['scheduled_for' => $newScheduledFor]);

            // If there are no pending reminders yet, create one.
            if ($updated === 0) {
                $recurrence = $this->recurrenceForBillingCycle($contract->billing_cycle);

                Reminder::createOpenUnique([
                    'client_id' => $contract->client_id,
                    'contract_id' => $contract->id,
                    'scheduled_for' => $newScheduledFor,
                    'status' => 'pending',
                    'channel' => 'whatsapp',
                    'payload' => array_filter([
                        'recurrence' => $recurrence,
                        'amount' => (string) $contract->amount,
                        'due_date' => $contract->next_due_date?->toDateString(),
                    ], fn ($value) => $value !== null && $value !== ''),
                ]);
            }
        }

        // Keep pending reminder payload synchronized with contract changes.
        if (
            $contract->wasChanged('amount')
            || $contract->wasChanged('billing_cycle')
            || ($contract->wasChanged('next_due_date') && $contract->next_due_date)
        ) {
            $reminders = Reminder::where('contract_id', $contract->id)
                ->where('status', 'pending')
                ->get();

            $recurrence = $this->recurrenceForBillingCycle($contract->billing_cycle);
            $dueDate = $contract->next_due_date?->toDateString();

            foreach ($reminders as $reminder) {
                $payload = is_array($reminder->payload) ? $reminder->payload : [];

                if ($contract->wasChanged('amount')) {
                    $payload['amount'] = (string) $contract->amount;
                }

                if ($contract->wasChanged('billing_cycle')) {
                    $payload['recurrence'] = $recurrence;
                }

                if ($contract->wasChanged('next_due_date') && $dueDate) {
                    $payload['due_date'] = $dueDate;
                }

                $reminder->payload = $payload;
                $reminder->save();
            }
        }
    }
}
