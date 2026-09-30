<?php

namespace Tests\Feature;

use App\Services\PushNotificationService;
use App\Services\PayerAliasService;
use App\Services\SinpeBcrEmailConciliationService;
use App\Services\SinpeBcrEmailParser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use ReflectionMethod;
use Tests\TestCase;

class SinpeEmailPushNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_payment_email_pushes_once_per_reference(): void
    {
        $push = Mockery::mock(PushNotificationService::class);
        $push->shouldReceive('sendToActiveUsersWithPreference')
            ->once()
            ->with(
                'payment_email_received',
                'Nuevo correo de pago recibido',
                Mockery::on(fn (string $body) => str_contains($body, 'CRC 2,000.00')
                    && str_contains($body, 'REF-PUSH-001')),
                Mockery::on(fn (array $data) => $data['url'] === '/sinpe-emails?read=unread'
                    && $data['reference'] === 'REF-PUSH-001'),
            )
            ->andReturn(1);

        $service = new SinpeBcrEmailConciliationService(
            new SinpeBcrEmailParser(),
            $push,
            Mockery::mock(PayerAliasService::class),
        );
        $store = new ReflectionMethod($service, 'storeTransaction');

        $arguments = [
            [
                'reference' => 'REF-PUSH-001',
                'origin_phone' => '88888888',
                'origin_name' => 'Cliente de prueba',
                'motive' => 'Pago mensual',
                'amount' => 2000,
                'performed_at' => now(),
                'raw_excerpt' => 'Correo de prueba',
            ],
            'uid-push-001',
            'SINPE recibido',
            false,
            'skipped',
            null,
            null,
            null,
            'Pendiente de asociación',
        ];

        $store->invokeArgs($service, $arguments);
        $store->invokeArgs($service, $arguments);

        $this->assertDatabaseCount('sinpe_email_transactions', 1);
    }

    public function test_old_payment_email_is_stored_without_sending_a_push(): void
    {
        $push = Mockery::mock(PushNotificationService::class);
        $push->shouldNotReceive('sendToActiveUsersWithPreference');

        $service = new SinpeBcrEmailConciliationService(
            new SinpeBcrEmailParser(),
            $push,
            Mockery::mock(PayerAliasService::class),
        );
        $store = new ReflectionMethod($service, 'storeTransaction');

        $store->invokeArgs($service, [
            [
                'reference' => 'REF-PUSH-OLD-001',
                'origin_phone' => '88888888',
                'origin_name' => 'Cliente de prueba',
                'motive' => 'Pago mensual',
                'amount' => 2000,
                'performed_at' => now()->subDays(2),
                'raw_excerpt' => 'Correo de prueba antiguo',
            ],
            'uid-push-old-001',
            'SINPE recibido',
            false,
            'skipped',
            null,
            null,
            null,
            'Pendiente de asociación',
        ]);

        $this->assertDatabaseCount('sinpe_email_transactions', 1);
    }
}
