<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReminderCreationDeduplicationTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_reminder_creation_reuses_existing_open_reminder_for_same_contract_and_datetime(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $user = User::factory()->create();
        $this->actingAs($user);

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-04-21',
            'billing_cycle' => 'monthly',
        ]);

        $existingReminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();

        $response = $this->postJson('/api/reminders', [
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'channel' => 'whatsapp',
            'scheduled_for' => $existingReminder->scheduled_for?->toIso8601String(),
            'payload' => [
                'message' => 'Cobro inicial',
                'recurrence' => 'monthly',
            ],
        ]);

        $response->assertCreated();
        $response->assertJsonPath('id', $existingReminder->id);

        $existingReminder->refresh();

        $this->assertSame(1, Reminder::query()->where('contract_id', $contract->id)->count());
        $this->assertSame('Cobro inicial', $existingReminder->payload['message'] ?? null);
        $this->assertSame('monthly', $existingReminder->payload['recurrence'] ?? null);
    }

    public function test_send_reminder_endpoint_reuses_contract_initial_reminder_instead_of_creating_duplicate(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $user = User::factory()->create();
        $this->actingAs($user);

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-04-21',
            'billing_cycle' => 'monthly',
        ]);

        $existingReminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();

        $response = $this->postJson("/api/clients/{$client->id}/send-reminder");

        $response->assertCreated();
        $response->assertJsonPath('reminder.id', $existingReminder->id);

        $existingReminder->refresh();

        $this->assertSame(1, Reminder::query()->where('contract_id', $contract->id)->count());
        $this->assertSame('monthly', $existingReminder->payload['recurrence'] ?? null);
        $this->assertSame((string) $contract->amount, $existingReminder->payload['amount'] ?? null);
    }
}