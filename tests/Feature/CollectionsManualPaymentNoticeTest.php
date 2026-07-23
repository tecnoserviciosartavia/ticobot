<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Setting;
use App\Models\User;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class CollectionsManualPaymentNoticeTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_admin_can_manually_send_a_payment_notice_with_amount_and_accounts(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        Carbon::setTestNow(Carbon::parse('2026-07-18 10:00:00', 'America/Costa_Rica'));

        $user = User::factory()->create(['profile_type' => 'admin']);
        $client = Client::factory()->create(['name' => 'María Mora', 'phone' => '50688887777']);
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'name' => 'Plan familiar',
            'amount' => 12500,
            'currency' => 'CRC',
            'next_due_date' => '2026-07-10',
        ]);
        Setting::set('payment_contact', '8888-9999');
        Setting::set('bank_accounts', "BCR: CR123\nBAC: CR456");

        $this->mock(WhatsAppNotificationService::class, function (MockInterface $mock) use ($client): void {
            $mock->shouldReceive('sendTextMessage')
                ->once()
                ->withArgs(function (string $phone, string $message) use ($client): bool {
                    return $phone === $client->phone
                        && str_contains($message, 'presente mes (julio 2026)')
                        && str_contains($message, 'Monto adeudado: ₡12.500,00')
                        && str_contains($message, 'SINPE Móvil: 8888-9999')
                        && str_contains($message, 'BCR: CR123')
                        && str_contains($message, 'BAC: CR456');
                })
                ->andReturn(true);
        });

        $this->actingAs($user)
            ->postJson(route('webapi.collections.send-payment-notice', $contract))
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_notice_is_not_sent_when_payment_for_due_month_exists(): void
    {
        $user = User::factory()->create(['profile_type' => 'admin']);
        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-07-10',
        ]);
        Payment::factory()->create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'amount' => 1000,
            'status' => 'verified',
            'paid_at' => '2026-07-12',
            'created_at' => '2026-07-12 10:00:00',
        ]);

        $this->mock(WhatsAppNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('sendTextMessage');
        });

        $this->actingAs($user)
            ->postJson(route('webapi.collections.send-payment-notice', $contract))
            ->assertConflict()
            ->assertJsonPath('message', 'Ya existe un pago registrado para el mes de este cobro.');
    }
}
