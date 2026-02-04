<?php

namespace Tests\Unit;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReminderDateNormalizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_contract_creation_schedules_reminder_at_configured_send_time(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $client = Client::factory()->create();

        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-02-10',
            'billing_cycle' => 'monthly',
        ]);

        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();

        $this->assertSame('pending', $reminder->status);
        $this->assertSame('2026-02-10 09:00:00', $reminder->scheduled_for->timezone('America/Costa_Rica')->format('Y-m-d H:i:s'));
    }

    public function test_contract_due_date_update_updates_pending_reminders_with_send_time(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-02-10',
            'billing_cycle' => 'monthly',
        ]);

        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();
        $this->assertSame('2026-02-10 09:00:00', $reminder->scheduled_for->timezone('America/Costa_Rica')->format('Y-m-d H:i:s'));

        $contract->forceFill(['next_due_date' => '2026-02-15'])->save();

        $reminder->refresh();
        $this->assertSame('2026-02-15 09:00:00', $reminder->scheduled_for->timezone('America/Costa_Rica')->format('Y-m-d H:i:s'));
    }
}
