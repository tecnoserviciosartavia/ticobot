<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Company;
use App\Models\Contract;
use App\Models\Reminder;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuickContractAssignmentCreatesReminderTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigning_temporary_contract_to_new_client_creates_initial_reminder(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $user = User::factory()->create();
        $this->actingAs($user);

        $contract = Contract::factory()->create([
            'client_id' => null,
            'next_due_date' => '2026-02-10',
            'billing_cycle' => 'monthly',
        ]);

        $payload = [
            'company_id' => Company::query()->where('slug', 'ticocast')->valueOrFail('id'),
            'name' => 'fabian2',
            'email' => null,
            'phone' => null,
            'status' => 'active',
            'notes' => null,
            'contract_id' => $contract->id,
        ];

        $response = $this->post(route('clients.store'), $payload);

        $client = Client::query()->latest('id')->firstOrFail();
        $response->assertRedirect(route('clients.show', $client));

        $contract->refresh();
        $this->assertSame($client->id, $contract->client_id);

        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();
        $this->assertSame($client->id, $reminder->client_id);
        $this->assertSame('pending', $reminder->status);
        $this->assertSame('2026-02-10 09:00:00', $reminder->scheduled_for->timezone('America/Costa_Rica')->format('Y-m-d H:i:s'));
    }
    public function test_quick_contract_accepts_ticofac_services_before_client_exists(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $company = Company::query()->where("slug", "ticofac")->firstOrFail();
        $service = Service::query()->create([
            "company_id" => $company->id,
            "name" => "Sistema LicOutlet",
            "price" => 50000,
            "cost" => 10000,
            "currency" => "CRC",
            "is_active" => true,
        ]);

        $response = $this->postJson(route("webapi.contracts.quick"), [
            "client_id" => 0,
            "company_id" => $company->id,
            "amount" => "50000.00",
            "currency" => "CRC",
            "discount_amount" => "0",
            "billing_cycle" => "monthly",
            "next_due_date" => "2026-07-30",
            "grace_period_days" => 0,
            "status" => "active",
            "service_ids" => [$service->id],
            "service_quantities" => [(string) $service->id => 1],
        ]);

        $response->assertCreated()->assertJsonPath("amount", "50000.00");
        $contract = Contract::query()->findOrFail($response->json("id"));
        $this->assertNull($contract->client_id);
        $this->assertTrue($contract->services()->whereKey($service->id)->exists());
    }
}
