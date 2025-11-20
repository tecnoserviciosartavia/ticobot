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
            $scheduledFor = $dueDate->copy()
                ->subDays(3) // 3 días antes del vencimiento
                ->startOfDay();

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
        // Optionally: Update pending reminders if next_due_date changes
        if ($contract->wasChanged('next_due_date') && $contract->next_due_date) {
            $newScheduledFor = Carbon::parse($contract->next_due_date)
                ->subDays(3)
                ->startOfDay();

            if ($newScheduledFor->isFuture()) {
                // Update pending reminders for this contract
                Reminder::where('contract_id', $contract->id)
                    ->where('status', 'pending')
                    ->update(['scheduled_for' => $newScheduledFor]);
            }
        }
    }
}
