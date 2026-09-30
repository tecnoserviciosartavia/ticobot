<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\PushDeviceToken;
use App\Models\User;
use App\Models\WhatsappChatMessage;
use App\Services\PushNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Mockery;
use Mockery\MockInterface;
use Tests\TestCase;

class IncomingChatPushNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_meta_webhook_preserves_delivery_failure_details(): void
    {
        $message = WhatsappChatMessage::query()->create([
            'phone' => '50670099532',
            'direction' => 'outbound',
            'body' => 'Recordatorio',
            'status' => 'sent',
            'whatsapp_message_id' => 'wamid.meta.failed.1',
            'metadata' => ['source' => 'scheduled_reminder_template'],
            'sent_at' => now(),
        ]);

        $payload = [
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'statuses' => [[
                            'id' => 'wamid.meta.failed.1',
                            'status' => 'failed',
                            'timestamp' => (string) now()->timestamp,
                            'recipient_id' => '50670099532',
                            'errors' => [[
                                'code' => 131049,
                                'title' => 'Message not delivered',
                                'message' => 'Message not delivered',
                            ]],
                        ]],
                    ],
                ]],
            ]],
        ];

        $this->postJson('/api/meta/whatsapp/webhook', $payload)->assertOk();

        $message->refresh();
        $this->assertSame('failed', $message->status);
        $this->assertSame('scheduled_reminder_template', $message->metadata['source']);
        $this->assertSame(131049, $message->metadata['meta_delivery']['errors'][0]['code']);
    }

    public function test_meta_webhook_pushes_only_once_for_a_new_message(): void
    {
        Http::fake();

        Client::query()->create([
            'name' => 'Fabián A',
            'phone' => '70099532',
        ]);

        $this->mock(PushNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('sendToActiveUsersWithPreference')
                ->once()
                ->with(
                    'whatsapp_incoming_messages',
                    'Nuevo mensaje de Fabián A',
                    'Hola desde Meta',
                    Mockery::on(fn (array $data): bool => ($data['phone'] ?? null) === '50670099532'
                        && ($data['message_id'] ?? null) === 'wamid.meta.push.1'
                        && ($data['url'] ?? null) === '/chats/50670099532')
                )
                ->andReturn(1);
        });

        $payload = [
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'messages' => [[
                            'from' => '50670099532',
                            'id' => 'wamid.meta.push.1',
                            'timestamp' => (string) now()->timestamp,
                            'type' => 'text',
                            'text' => ['body' => 'Hola desde Meta'],
                        ]],
                    ],
                ]],
            ]],
        ];

        $this->postJson('/api/meta/whatsapp/webhook', $payload)->assertOk();
        $this->postJson('/api/meta/whatsapp/webhook', $payload)->assertOk();

        $this->assertDatabaseCount('whatsapp_chat_messages', 1);
        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'phone' => '50670099532',
            'identity_type' => 'phone',
            'whatsapp_user_id' => null,
        ]);
    }

    public function test_meta_webhook_stores_bsuid_without_treating_it_as_a_phone(): void
    {
        Http::fake();

        $this->mock(PushNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('sendToActiveUsersWithPreference')
                ->once()
                ->with(
                    'whatsapp_incoming_messages',
                    'Nuevo mensaje de bsuid-user-123',
                    'Hola por username',
                    Mockery::on(fn (array $data): bool => ($data['phone'] ?? null) === 'bsuid:bsuid-user-123'
                        && ($data['identity_type'] ?? null) === 'bsuid'
                        && ($data['whatsapp_user_id'] ?? null) === 'bsuid-user-123'
                        && ($data['url'] ?? null) === '/chats/bsuid%3Absuid-user-123')
                )
                ->andReturn(1);
        });

        $payload = [
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'messages' => [[
                            'from' => 'bsuid-user-123',
                            'business_scoped_user_id' => 'bsuid-user-123',
                            'id' => 'wamid.meta.bsuid.1',
                            'timestamp' => (string) now()->timestamp,
                            'type' => 'text',
                            'text' => ['body' => 'Hola por username'],
                        ]],
                    ],
                ]],
            ]],
        ];

        $this->postJson('/api/meta/whatsapp/webhook', $payload)->assertOk();

        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'phone' => 'bsuid:bsuid-user-123',
            'identity_type' => 'bsuid',
            'whatsapp_user_id' => 'bsuid-user-123',
            'body' => 'Hola por username',
        ]);
    }

    public function test_meta_webhook_keeps_phone_conversation_when_bsuid_and_phone_are_both_present(): void
    {
        Http::fake();

        $this->mock(PushNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('sendToActiveUsersWithPreference')->once()->andReturn(1);
        });

        $payload = [
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'contacts' => [[
                            'wa_id' => '50670099532',
                            'business_scoped_user_id' => 'bsuid-user-456',
                        ]],
                        'messages' => [[
                            'from' => '50670099532',
                            'id' => 'wamid.meta.bsuid.2',
                            'type' => 'text',
                            'text' => ['body' => 'Hola con ambas identidades'],
                        ]],
                    ],
                ]],
            ]],
        ];

        $this->postJson('/api/meta/whatsapp/webhook', $payload)->assertOk();

        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'phone' => '50670099532',
            'identity_type' => 'phone',
            'whatsapp_user_id' => 'bsuid-user-456',
        ]);
    }

    public function test_inbound_text_message_uses_client_name_in_push_title(): void
    {
        $user = User::factory()->create([
            'push_notification_preferences' => [
                'whatsapp_incoming_messages' => true,
            ],
        ]);

        Client::query()->create([
            'name' => 'Laura Gómez',
            'phone' => '50688881111',
        ]);

        PushDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'test-device-token-123456',
            'platform' => 'android',
            'is_active' => true,
            'last_seen_at' => now(),
        ]);

        $this->mock(PushNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('sendToActiveUsersWithPreference')
                ->once()
                ->with(
                    'whatsapp_incoming_messages',
                    'Nuevo mensaje de Laura Gómez',
                    'Hola desde WhatsApp',
                    Mockery::on(function (array $data): bool {
                        return ($data['type'] ?? null) === 'whatsapp_inbound_message'
                            && ($data['phone'] ?? null) === '50688881111'
                            && ($data['url'] ?? null) === '/chats/50688881111'
                            && ($data['client_name'] ?? null) === 'Laura Gómez';
                    })
                )
                ->andReturn(1);
        });

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/chats/inbound', [
                'phone' => '50688881111',
                'body' => 'Hola desde WhatsApp',
                'whatsapp_message_id' => 'wamid.test.123',
                'metadata' => ['source' => 'bot'],
            ]);

        $response->assertCreated();
        $response->assertJson(['ok' => true]);
        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'phone' => '50688881111',
            'direction' => 'inbound',
            'body' => 'Hola desde WhatsApp',
            'status' => 'received',
        ]);
    }

    public function test_inbound_image_message_uses_image_preview(): void
    {
        $user = User::factory()->create([
            'push_notification_preferences' => [
                'whatsapp_incoming_messages' => true,
            ],
        ]);

        Client::query()->create([
            'name' => 'Ivette Solano',
            'phone' => '50672140974',
        ]);

        PushDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'test-device-token-abcdef',
            'platform' => 'android',
            'is_active' => true,
            'last_seen_at' => now(),
        ]);

        $this->mock(PushNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('sendToActiveUsersWithPreference')
                ->once()
                ->with(
                    'whatsapp_incoming_messages',
                    'Nuevo mensaje de Ivette Solano',
                    'Imagen: Foto del recibo',
                    Mockery::on(function (array $data): bool {
                        return ($data['message_kind'] ?? null) === 'image'
                            && ($data['phone'] ?? null) === '50672140974'
                            && ($data['url'] ?? null) === '/chats/50672140974';
                    })
                )
                ->andReturn(1);
        });

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/chats/inbound', [
                'phone' => '50672140974',
                'body' => null,
                'media' => [
                    'kind' => 'image',
                    'mimetype' => 'image/jpeg',
                    'caption' => 'Foto del recibo',
                    'filename' => 'recibo.jpg',
                ],
                'whatsapp_message_id' => 'wamid.test.image',
                'metadata' => ['source' => 'bot'],
            ]);

        $response->assertCreated();
        $response->assertJson(['ok' => true]);
    }

    public function test_inbound_document_message_uses_file_preview(): void
    {
        $user = User::factory()->create([
            'push_notification_preferences' => [
                'whatsapp_incoming_messages' => true,
            ],
        ]);

        Client::query()->create([
            'name' => 'Carlos Méndez',
            'phone' => '50655553333',
        ]);

        PushDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'test-device-token-fedcba',
            'platform' => 'android',
            'is_active' => true,
            'last_seen_at' => now(),
        ]);

        $this->mock(PushNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('sendToActiveUsersWithPreference')
                ->once()
                ->with(
                    'whatsapp_incoming_messages',
                    'Nuevo mensaje de Carlos Méndez',
                    'Archivo: contrato.pdf',
                    Mockery::on(function (array $data): bool {
                        return ($data['message_kind'] ?? null) === 'document'
                            && ($data['phone'] ?? null) === '50655553333'
                            && ($data['url'] ?? null) === '/chats/50655553333';
                    })
                )
                ->andReturn(1);
        });

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/chats/inbound', [
                'phone' => '50655553333',
                'body' => null,
                'media' => [
                    'kind' => 'document',
                    'mimetype' => 'application/pdf',
                    'filename' => 'contrato.pdf',
                ],
                'whatsapp_message_id' => 'wamid.test.document',
                'metadata' => ['source' => 'bot'],
            ]);

        $response->assertCreated();
        $response->assertJson(['ok' => true]);
    }
}
