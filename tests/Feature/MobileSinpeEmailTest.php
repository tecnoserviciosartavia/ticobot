<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\SinpeEmailTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileSinpeEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_sinpe_emails_in_mobile_app(): void
    {
        Sanctum::actingAs(User::factory()->create(['profile_type' => 'admin']));
        SinpeEmailTransaction::create(['reference' => 'MOBILE-LIST-1', 'origin_name' => 'María Solano', 'amount' => 12500, 'status' => 'pending']);

        $this->getJson('/api/mobile/sinpe-emails')->assertOk()
            ->assertJsonPath('data.0.reference', 'MOBILE-LIST-1')
            ->assertJsonPath('data.0.origin_name', 'María Solano');
    }

    public function test_admin_can_apply_sinpe_email_to_contract_from_mobile_app(): void
    {
        Sanctum::actingAs(User::factory()->create(['profile_type' => 'admin']));
        $client = Client::factory()->create();
        $contract = Contract::factory()->create(['client_id' => $client->id, 'billing_cycle' => 'monthly', 'amount' => 12500]);
        $transaction = SinpeEmailTransaction::create(['reference' => 'MOBILE-APPLY-1', 'origin_name' => $client->name, 'amount' => 12500, 'status' => 'pending', 'performed_at' => now()]);

        $this->postJson("/api/mobile/sinpe-emails/{$transaction->id}/conciliate", [
            'client_id' => $client->id, 'contract_id' => $contract->id,
            'billing_month' => '2026-07', 'months_count' => 2,
            'covered_months' => ['2026-07', '2026-08'],
        ])->assertOk()->assertJsonPath('data.status', 'in_review');

        $transaction->refresh();
        $this->assertSame('in_review', $transaction->status);
        $this->assertSame($client->id, $transaction->matched_client_id);
        $this->assertSame($contract->id, $transaction->matched_contract_id);
        $this->assertNotNull($transaction->payment_id);
        $this->assertDatabaseHas('payments', ['id' => $transaction->payment_id, 'status' => 'in_review', 'channel' => 'sinpe']);

        $conciliationId = $transaction->payment->conciliation->id;
        $this->putJson("/api/conciliations/{$conciliationId}", [
            'status' => 'approved',
            'verified_at' => now()->toIso8601String(),
        ])->assertOk();
        $this->assertDatabaseHas('conciliations', ['id' => $conciliationId, 'status' => 'approved']);
        $this->assertDatabaseHas('payments', ['id' => $transaction->payment_id, 'status' => 'verified']);
    }
}