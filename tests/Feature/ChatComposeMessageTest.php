<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WhatsappChatMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChatComposeMessageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $cachePath = storage_path('app/whatsapp_meta_restriction.json');
        if (is_file($cachePath)) {
            unlink($cachePath);
        }
    }

    public function test_chat_module_can_create_a_new_outbound_message_from_scratch(): void
    {
        $user = User::factory()->create();
        $phone = '50688881111';

        $response = $this->actingAs($user)
            ->from(route('chats.create'))
            ->post(route('chats.store'), [
                'phone' => '+506 8888 1111',
                'body' => 'Mensaje inicial desde cero',
            ]);

        $response->assertRedirect(route('chats.show', $phone));
        $response->assertSessionHas('success');

        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'phone' => $phone,
            'direction' => 'outbound',
            'body' => 'Mensaje inicial desde cero',
            'status' => 'queued',
            'sent_by_user_id' => $user->id,
        ]);

        $message = WhatsappChatMessage::query()->where('phone', $phone)->first();
        $this->assertNotNull($message);
        $this->assertSame('manual-compose', $message->metadata['source'] ?? null);
    }

    public function test_outbound_queue_uses_phone_when_a_phone_conversation_has_a_bsuid(): void
    {
        WhatsappChatMessage::create([
            'phone' => '50672007128',
            'identity_type' => 'phone',
            'whatsapp_user_id' => 'CR.1018903824340993',
            'direction' => 'outbound',
            'body' => 'Mensaje desde Android',
            'status' => 'queued',
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/chats/outbound-queue')
            ->assertOk()
            ->assertJsonPath('messages.0.phone', '50672007128')
            ->assertJsonPath('messages.0.identity_type', 'phone');
    }

    public function test_chat_messages_can_be_requeued_for_retry_after_a_temporary_failure(): void
    {
        $user = User::factory()->create();
        $message = WhatsappChatMessage::query()->create([
            'phone' => '50688881111',
            'direction' => 'outbound',
            'body' => 'Mensaje a reintentar',
            'status' => 'failed',
            'sent_by_user_id' => $user->id,
        ]);

        $this->actingAs($user)
            ->patchJson('/api/chats/messages/'.$message->id.'/status', [
                'status' => 'queued',
            ])
            ->assertOk()
            ->assertJson(['ok' => true]);

        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'id' => $message->id,
            'status' => 'queued',
        ]);
    }

    public function test_outbound_queue_retries_failed_messages_from_today(): void
    {
        WhatsappChatMessage::query()->create([
            'phone' => '50677770000',
            'direction' => 'outbound',
            'body' => 'Reintento automático',
            'status' => 'failed',
            'created_at' => now(),
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/chats/outbound-queue?limit=20')
            ->assertOk()
            ->assertJsonFragment(['body' => 'Reintento automático']);
    }

    public function test_web_chat_allows_reply_even_after_24_hour_window_expires(): void
    {
        $user = User::factory()->create();
        $phone = '50677778888';

        WhatsappChatMessage::query()->create([
            'phone' => $phone,
            'direction' => 'inbound',
            'body' => 'Cliente antiguo',
            'status' => 'read',
            'sent_at' => now()->subDays(2),
            'created_at' => now()->subDays(2),
        ]);

        $this->actingAs($user)
            ->from(route('chats.show', $phone))
            ->post(route('chats.reply', $phone), [
                'body' => 'Respuesta fuera de ventana',
            ])
            ->assertRedirect(route('chats.show', $phone));

        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'phone' => $phone,
            'direction' => 'outbound',
            'body' => 'Respuesta fuera de ventana',
            'status' => 'queued',
        ]);
    }

    public function test_whatsapp_account_status_uses_supported_meta_fields_only(): void
    {
        config([
            'services.whatsapp.token' => 'token_ok',
            'services.whatsapp.phone_id' => '1234567890',
            'services.whatsapp.waba_id' => '',
        ]);

        Http::fake(function ($request) {
            $fields = (string) ($request->data()['fields'] ?? '');
            $this->assertStringContainsString('display_phone_number', $fields);
            $this->assertStringContainsString('quality_rating', $fields);
            $this->assertStringNotContainsString('account_review_status', $fields);

            return Http::response([
                'id' => '1234567890',
                'display_phone_number' => '+506 8888 8888',
                'quality_rating' => 'GREEN',
                'verified_name' => 'Empresa Demo',
            ], 200);
        });

        $status = app(\App\Http\Controllers\Api\WhatsAppStatusController::class)->accountStatusFromMeta();

        $this->assertSame('ready', $status['status']);
        $this->assertSame(false, $status['is_restricted']);
    }

    public function test_whatsapp_account_status_uses_recent_cached_meta_restriction(): void
    {
        $cachePath = storage_path('app/whatsapp_meta_restriction.json');
        if (! is_dir(dirname($cachePath))) {
            mkdir(dirname($cachePath), 0777, true);
        }

        file_put_contents($cachePath, json_encode([
            'status' => 'restricted',
            'is_restricted' => true,
            'balance_due' => 5.07,
            'currency' => 'USD',
            'message' => 'Your account is restricted due to an unpaid balance of $5.07 USD.',
            'updated_at' => now()->toIso8601String(),
        ], JSON_THROW_ON_ERROR));

        Http::fake([
            'https://graph.facebook.com/*' => Http::response([
                'id' => '1234567890',
                'display_phone_number' => '+506 8888 8888',
                'quality_rating' => 'GREEN',
                'verified_name' => 'Empresa Demo',
            ], 200),
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/whatsapp/account-status')
            ->assertOk()
            ->assertJsonPath('status', 'restricted')
            ->assertJsonPath('is_restricted', true)
            ->assertJsonPath('balance_due', 5.07)
            ->assertJsonPath('currency', 'USD');
    }

    public function test_whatsapp_account_status_reports_pending_balance_restriction(): void
    {
        Http::fake([
            'https://graph.facebook.com/*' => Http::response([
                'error' => [
                    'message' => 'Your account is restricted due to an unpaid balance of $5.07 USD.',
                ],
            ], 400),
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/whatsapp/account-status')
            ->assertOk()
            ->assertJsonPath('status', 'restricted')
            ->assertJsonPath('is_restricted', true)
            ->assertJsonPath('balance_due', 5.07)
            ->assertJsonPath('currency', 'USD');
    }

    public function test_whatsapp_account_status_checks_waba_and_billing_real_meta_endpoints(): void
    {
        Http::fake(function ($request) {
            $url = (string) $request->url();

            if (str_starts_with($url, 'https://graph.facebook.com/v18.0/116680085957739')) {
                return Http::response([
                    'id' => '116680085957739',
                    'display_phone_number' => '+506 8852 5881',
                    'quality_rating' => 'GREEN',
                    'verified_name' => 'Tecno Servicios Artavia',
                ], 200);
            }

            if (str_starts_with($url, 'https://graph.facebook.com/v18.0/2467621973716692?')) {
                return Http::response([
                    'id' => '2467621973716692',
                    'name' => 'Tecno Servicios Artavia',
                    'owner_business' => [
                        'id' => '2467621973716692',
                    ],
                    'account_status' => 'ACTIVE',
                ], 200);
            }

            if (str_starts_with($url, 'https://graph.facebook.com/v18.0/2467621973716692/billing_and_payment')) {
                return Http::response([
                    'error' => [
                        'message' => 'You do not have permission to perform this action.',
                    ],
                ], 400);
            }

            return Http::response(['error' => ['message' => 'Unexpected request']], 500);
        });

        config(['services.whatsapp.token' => 'token_ok', 'services.whatsapp.phone_id' => '116680085957739', 'services.whatsapp.waba_id' => '2467621973716692']);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/whatsapp/account-status')
            ->assertOk()
            ->assertJsonPath('status', 'permission_required')
            ->assertJsonPath('is_restricted', false);
    }
}
