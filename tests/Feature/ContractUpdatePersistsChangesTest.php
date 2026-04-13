<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContractUpdatePersistsChangesTest extends TestCase
{
    use RefreshDatabase;

    public function test_editing_contract_persists_core_fields_and_service_quantities(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $client = Client::factory()->create();
        $service = Service::query()->create([
            'name' => 'TDMAX',
            'price' => 2000,
            'currency' => 'CRC',
            'is_active' => true,
        ]);

        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'name' => 'Contrato original',
            'currency' => 'CRC',
            'discount_amount' => 0,
            'billing_cycle' => 'monthly',
            'next_due_date' => '2026-05-12',
            'grace_period_days' => 0,
            'notes' => 'nota original',
        ]);

        $contract->services()->sync([
            $service->id => ['quantity' => 1],
        ]);

        $response = $this->put(route('contracts.update', $contract), [
            'client_id' => (string) $client->id,
            'name' => 'Contrato actualizado',
            'currency' => 'CRC',
            'discount_amount' => '500',
            'billing_cycle' => 'monthly',
            'next_due_date' => '2026-06-15',
            'grace_period_days' => '3',
            'notes' => 'nota actualizada',
            'service_ids' => [$service->id],
            'service_quantities' => [
                (string) $service->id => 10,
            ],
        ]);

        $response->assertRedirect(route('contracts.show', $contract));

        $contract->refresh();

        $this->assertSame('Contrato actualizado', $contract->name);
        $this->assertSame('2026-06-15', $contract->next_due_date?->toDateString());
        $this->assertSame('3', (string) $contract->grace_period_days);
        $this->assertSame('nota actualizada', $contract->notes);
        $this->assertSame('500.00', (string) $contract->discount_amount);
        $this->assertSame('19500.00', (string) $contract->amount);
        $this->assertSame(10, (int) $contract->services()->firstOrFail()->pivot->quantity);
    }
}