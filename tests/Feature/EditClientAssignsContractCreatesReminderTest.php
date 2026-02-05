<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EditClientAssignsContractCreatesReminderTest extends TestCase
{
    use RefreshDatabase;

    public function test_editing_client_can_assign_temporary_contract_and_creates_reminder(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $user = User::factory()->create();
        $this->actingAs($user);

        $client = Client::factory()->create([
            'status' => 'active',
        ]);

        $contract = Contract::factory()->create([
            'client_id' => null,
            'next_due_date' => '2026-02-10',
            'billing_cycle' => 'monthly',
        ]);

        $payload = [
            'name' => $client->name,
            'email' => $client->email,
            'phone' => $client->phone,
            'status' => $client->status,
            'notes' => $client->notes,
            'contract_id' => $contract->id,
        ];

        $response = $this->put(route('clients.update', $client), $payload);
        $response->assertRedirect(route('clients.show', $client));

        $contract->refresh();
        $this->assertSame($client->id, $contract->client_id);

        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();
        $this->assertSame($client->id, $reminder->client_id);
        $this->assertSame('pending', $reminder->status);
        $this->assertSame('2026-02-10 09:00:00', $reminder->scheduled_for->timezone('America/Costa_Rica')->format('Y-m-d H:i:s'));
    }
}
