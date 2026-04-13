<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContractObserverReminderSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_updating_contract_syncs_pending_reminder_payload_and_schedule(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'amount' => 2000,
            'billing_cycle' => 'monthly',
            'next_due_date' => '2026-04-21',
        ]);

        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();

        $contract->update([
            'amount' => 2500,
            'billing_cycle' => 'weekly',
            'next_due_date' => '2026-04-28',
        ]);

        $reminder->refresh();

        $this->assertSame('2026-04-28', $reminder->scheduled_for?->toDateString());
        $this->assertSame('2500.00', $reminder->payload['amount'] ?? null);
        $this->assertSame('weekly', $reminder->payload['recurrence'] ?? null);
        $this->assertSame('2026-04-28', $reminder->payload['due_date'] ?? null);
    }
}
