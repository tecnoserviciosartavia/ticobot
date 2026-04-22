<?php

namespace Tests\Feature;

use App\Models\Service;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class NotifyPlatformPaymentsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_sends_admin_a_fixed_platform_cost_reminder_and_not_a_usage_charge_message(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');

        $today = Carbon::today('America/Costa_Rica');

        Service::query()->create([
            'name' => 'Netflix Premium',
            'price' => 4500,
            'cost' => 25.50,
            'payment_day' => (int) $today->day,
            'account_email' => 'cuenta@netflix.com',
            'currency' => 'USD',
            'is_active' => true,
        ]);

        putenv('BOT_ADMIN_PHONES=50688887777');
        $_ENV['BOT_ADMIN_PHONES'] = '50688887777';
        $_SERVER['BOT_ADMIN_PHONES'] = '50688887777';

        $this->mock(WhatsAppNotificationService::class, function (MockInterface $mock) use ($today) {
            $mock->shouldReceive('sendTextMessage')
                ->once()
                ->withArgs(function (string $phone, string $message) use ($today) {
                    $this->assertSame('50688887777', $phone);
                    $this->assertStringContainsString('Recordatorio de costo mensual de plataforma', $message);
                    $this->assertStringContainsString('Tipo: costo fijo mensual de la plataforma', $message);
                    $this->assertStringContainsString('Costo fijo mensual: $25.50', $message);
                    $this->assertStringContainsString('Fecha de pago: '.$today->toDateString(), $message);
                    $this->assertStringContainsString('No corresponde al cobro por uso al cliente.', $message);

                    return true;
                })
                ->andReturnTrue();
        });

        $this->artisan('services:notify-platform-payments')
            ->expectsOutputToContain('Recordatorios de costos de plataforma enviados: 1')
            ->assertSuccessful();

        $this->assertDatabaseHas('service_payment_notifications', [
            'phone' => '50688887777',
            'due_date' => $today->toDateString(),
        ]);
    }
}