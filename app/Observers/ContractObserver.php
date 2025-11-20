<?php

namespace App\Observers;

use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;

class ContractObserver
{
    /**
     * Handle the Contract "created" event.
     */
    public function created(Contract $contract): void
    {
        // Auto-create reminder when contract is created
        if ($contract->client_id && $contract->next_due_date) {
            $dueDate = Carbon::parse($contract->next_due_date);
            
            // Schedule reminder for the same day as due date (not 3 days before)
            $scheduledFor = $dueDate->copy()->startOfDay();

            // If scheduled date is in the past, schedule for today
            if ($scheduledFor->isPast()) {
                $scheduledFor = Carbon::today();
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
        if ($contract->wasChanged('next_due_date') && $contract->next_due_date) {
            $newScheduledFor = Carbon::parse($contract->next_due_date)
                ->startOfDay();

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
