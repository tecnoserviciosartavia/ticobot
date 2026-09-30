<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeleteContractFromClientTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_delete_contract_while_preserving_payments_and_soft_deleting_reminders(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-02-10',
            'billing_cycle' => 'monthly',
        ]);

        // Observer should create a pending reminder on creation
        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();
        $payment = Payment::factory()->create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
        ]);

        $response = $this->delete(route('contracts.destroy', $contract));
        $response->assertRedirect(route('clients.show', $client));

        $this->assertSoftDeleted('contracts', ['id' => $contract->id]);
        $this->assertSoftDeleted('reminders', ['id' => $reminder->id]);
        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'contract_id' => $contract->id,
        ]);
    }
}
