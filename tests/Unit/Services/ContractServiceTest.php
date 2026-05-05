<?php

namespace Tests\Unit\Services;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Service;
use App\Services\ContractService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Carbon\Carbon;

class ContractServiceTest extends TestCase
{
    use RefreshDatabase;

    protected ContractService $contractService;
    protected Client $client;
    protected Service $service1;
    protected Service $service2;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->contractService = new ContractService();
        
        $this->client = Client::factory()->create([
            'phone' => '+50612345678',
            'name' => 'Test Client',
        ]);

        $this->service1 = Service::factory()->create([
            'name' => 'Netflix',
            'price' => 10.99,
            'currency' => 'USD',
            'pin' => '1234',
        ]);

        $this->service2 = Service::factory()->create([
            'name' => 'Spotify',
            'price' => 5.99,
            'currency' => 'USD',
            'pin' => null,
        ]);
    }

    /** @test */
    public function it_can_create_a_contract_with_services()
    {
        $data = [
            'client_id' => $this->client->id,
            'currency' => 'USD',
            'billing_cycle' => 'monthly',
            'next_due_date' => '2024-12-15',
            'grace_period_days' => 5,
            'notes' => 'Test contract',
            'service_ids' => [$this->service1->id, $this->service2->id],
            'service_quantities' => [
                $this->service1->id => 2,
                $this->service2->id => 1,
            ],
        ];

        $contract = $this->contractService->createContract($data, $this->client);

        $this->assertInstanceOf(Contract::class, $contract);
        $this->assertEquals($this->client->id, $contract->client_id);
        $this->assertEquals(27.97, $contract->amount); // (10.99 * 2) + 5.99
        $this->assertEquals('USD', $contract->currency);
        $this->assertEquals('monthly', $contract->billing_cycle);
        $this->assertEquals('2024-12-15', $contract->next_due_date->format('Y-m-d'));
        $this->assertEquals(5, $contract->grace_period_days);
        $this->assertEquals('Test contract', $contract->notes);

        // Check services are attached
        $this->assertCount(2, $contract->services);
        $this->assertEquals(2, $contract->services()->where('service_id', $this->service1->id)->first()->pivot->quantity);
        $this->assertEquals(1, $contract->services()->where('service_id', $this->service2->id)->first()->pivot->quantity);
    }

    /** @test */
    public function it_can_create_a_contract_without_services()
    {
        $data = [
            'client_id' => $this->client->id,
            'currency' => 'CRC',
            'billing_cycle' => 'weekly',
            'grace_period_days' => 3,
        ];

        $contract = $this->contractService->createContract($data, $this->client);

        $this->assertInstanceOf(Contract::class, $contract);
        $this->assertEquals(0.0, $contract->amount);
        $this->assertCount(0, $contract->services);
    }

    /** @test */
    public function it_can_create_a_contract_with_discount()
    {
        $data = [
            'client_id' => $this->client->id,
            'currency' => 'USD',
            'billing_cycle' => 'monthly',
            'discount_amount' => 5.00,
            'service_ids' => [$this->service1->id],
        ];

        $contract = $this->contractService->createContract($data, $this->client);

        $this->assertEquals(5.99, $contract->amount); // 10.99 - 5.00
    }

    /** @test */
    public function it_can_update_a_contract()
    {
        // Create initial contract
        $initialData = [
            'client_id' => $this->client->id,
            'currency' => 'USD',
            'billing_cycle' => 'monthly',
            'service_ids' => [$this->service1->id],
        ];

        $contract = $this->contractService->createContract($initialData, $this->client);

        // Update contract
        $updateData = [
            'currency' => 'CRC',
            'billing_cycle' => 'weekly',
            'grace_period_days' => 10,
            'notes' => 'Updated contract',
            'service_ids' => [$this->service1->id, $this->service2->id],
            'service_quantities' => [
                $this->service1->id => 1,
                $this->service2->id => 2,
            ],
        ];

        $updatedContract = $this->contractService->updateContract($contract, $updateData);

        $this->assertEquals('CRC', $updatedContract->currency);
        $this->assertEquals('weekly', $updatedContract->billing_cycle);
        $this->assertEquals(10, $updatedContract->grace_period_days);
        $this->assertEquals('Updated contract', $updatedContract->notes);
        $this->assertCount(2, $updatedContract->services);
    }

    /** @test */
    public function it_can_create_a_quick_contract()
    {
        $data = [
            'amount' => 100.00,
            'currency' => 'CRC',
            'billing_cycle' => 'monthly',
            'next_due_date' => '2024-12-20',
            'grace_period_days' => 3,
            'notes' => 'Quick contract',
        ];

        $contract = $this->contractService->createQuickContract($data);

        $this->assertInstanceOf(Contract::class, $contract);
        $this->assertNull($contract->client_id);
        $this->assertEquals(100.00, $contract->amount);
        $this->assertEquals('CRC', $contract->currency);
        $this->assertEquals('monthly', $contract->billing_cycle);
    }

    /** @test */
    public function it_calculates_contract_amount_correctly()
    {
        $data = [
            'service_ids' => [$this->service1->id, $this->service2->id],
            'service_quantities' => [
                $this->service1->id => 3,
                $this->service2->id => 2,
            ],
        ];

        $contract = $this->contractService->createContract($data, $this->client);

        // (10.99 * 3) + (5.99 * 2) = 32.97 + 11.98 = 44.95
        $this->assertEquals(44.95, $contract->amount);
    }

    /** @test */
    public function it_resolves_service_pins_correctly()
    {
        $data = [
            'client_id' => $this->client->id,
            'currency' => 'USD',
            'billing_cycle' => 'monthly',
            'service_ids' => [$this->service1->id],
            'service_pins' => [
                $this->service1->id => '9999',
            ],
        ];

        $contract = $this->contractService->createContract($data, $this->client);

        $pivot = $contract->services()->first()->pivot;
        $this->assertEquals('9999', $pivot->pin_override);
    }

    /** @test */
    public function it_generates_pins_from_phone_number()
    {
        $data = [
            'client_id' => $this->client->id,
            'currency' => 'USD',
            'billing_cycle' => 'monthly',
            'service_ids' => [$this->service1->id],
        ];

        $contract = $this->contractService->createContract($data, $this->client);

        $pivot = $contract->services()->first()->pivot;
        // Should use last 4 digits of phone: 5678
        $this->assertEquals('5678', $pivot->pin_override);
    }

    /** @test */
    public function it_returns_null_for_spotify_service()
    {
        $spotifyService = Service::factory()->create([
            'name' => 'Spotify Premium',
            'price' => 9.99,
            'currency' => 'USD',
            'pin' => '1234',
        ]);

        $data = [
            'client_id' => $this->client->id,
            'currency' => 'USD',
            'billing_cycle' => 'monthly',
            'service_ids' => [$spotifyService->id],
        ];

        $contract = $this->contractService->createContract($data, $this->client);

        $pivot = $contract->services()->first()->pivot;
        $this->assertNull($pivot->pin_override);
    }

    /** @test */
    public function it_computes_next_due_date_correctly()
    {
        // Test weekly
        $data = [
            'client_id' => $this->client->id,
            'currency' => 'USD',
            'billing_cycle' => 'weekly',
        ];

        $contract = $this->contractService->createContract($data, $this->client);
        $expectedDate = Carbon::today()->addDays(7)->format('Y-m-d');
        $this->assertEquals($expectedDate, $contract->next_due_date->format('Y-m-d'));

        // Test monthly
        $data['billing_cycle'] = 'monthly';
        $contract2 = $this->contractService->createContract($data, $this->client);
        $expectedDate2 = Carbon::today()->addMonthNoOverflow()->format('Y-m-d');
        $this->assertEquals($expectedDate2, $contract2->next_due_date->format('Y-m-d'));
    }

    /** @test */
    public function it_gets_contract_statistics()
    {
        // Create some contracts
        Contract::factory()->create(['billing_cycle' => 'monthly', 'currency' => 'USD']);
        Contract::factory()->create(['billing_cycle' => 'weekly', 'currency' => 'CRC']);
        Contract::factory()->create(['billing_cycle' => 'monthly', 'currency' => 'USD']);

        $stats = $this->contractService->getContractStats();

        $this->assertEquals(3, $stats['total_contracts']);
        $this->assertArrayHasKey('by_billing_cycle', $stats);
        $this->assertArrayHasKey('by_currency', $stats);
        $this->assertEquals(2, $stats['by_billing_cycle']['monthly']);
        $this->assertEquals(1, $stats['by_billing_cycle']['weekly']);
        $this->assertEquals(2, $stats['by_currency']['USD']);
        $this->assertEquals(1, $stats['by_currency']['CRC']);
    }
}
