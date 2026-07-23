<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class FinancialOperationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_open_the_unified_financial_view(): void
    {
        $admin = User::factory()->create(['profile_type' => 'admin']);
        $client = Client::query()->create([
            'name' => 'Cliente financiero',
            'phone' => '88888888',
            'status' => 'active',
        ]);
        $contract = Contract::query()->create([
            'client_id' => $client->id,
            'amount' => 5000,
            'currency' => 'CRC',
            'billing_cycle' => 'monthly',
            'status' => 'active',
        ]);
        Payment::query()->create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'amount' => 5000,
            'currency' => 'CRC',
            'status' => 'verified',
            'channel' => 'manual',
            'paid_at' => now(),
        ]);

        $this->actingAs($admin)
            ->get(route('finance.index', ['tab' => 'payments']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Finance/Index')
                ->where('activeTab', 'payments')
                ->where('summary.verified', 5000)
                ->has('payments.data', 1));
    }

    public function test_legacy_financial_pages_redirect_to_the_unified_view(): void
    {
        $admin = User::factory()->create(['profile_type' => 'admin']);

        $this->actingAs($admin)->get(route('payments.index'))
            ->assertRedirect(route('finance.index', ['tab' => 'payments']));
        $this->actingAs($admin)->get(route('collections.index'))
            ->assertRedirect(route('finance.index', ['tab' => 'collections']));
        $this->actingAs($admin)->get(route('conciliations.index'))
            ->assertRedirect(route('finance.index', ['tab' => 'payments']));
        $this->actingAs($admin)->get(route('accounting.index'))
            ->assertRedirect(route('finance.index', ['tab' => 'overview']));
    }
}
