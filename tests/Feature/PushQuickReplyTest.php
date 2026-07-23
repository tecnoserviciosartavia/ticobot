<?php

namespace Tests\Feature;

use App\Models\PushDeviceToken;
use App\Models\User;
use App\Models\WhatsappChatMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushQuickReplyTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_android_device_can_queue_a_quick_reply(): void
    {
        $user = User::factory()->create();
        PushDeviceToken::query()->create([
            'user_id' => $user->id,
            'token' => 'android-fcm-token',
            'platform' => 'android',
            'is_active' => true,
        ]);
        WhatsappChatMessage::query()->create([
            'phone' => '50670099532',
            'direction' => 'inbound',
            'body' => 'Hola',
            'status' => 'received',
            'sent_at' => now(),
        ]);

        $this->postJson('/api/push/quick-reply', [
            'device_token' => 'android-fcm-token',
            'phone' => '50670099532',
            'message' => 'Te atiendo en un momento.',
        ])->assertOk()->assertJson(['ok' => true]);

        $this->assertDatabaseHas('whatsapp_chat_messages', [
            'phone' => '50670099532',
            'direction' => 'outbound',
            'body' => 'Te atiendo en un momento.',
            'status' => 'queued',
            'sent_by_user_id' => $user->id,
        ]);
    }

    public function test_unknown_device_cannot_send_a_quick_reply(): void
    {
        $this->postJson('/api/push/quick-reply', [
            'device_token' => 'unknown-token',
            'phone' => '50670099532',
            'message' => 'No autorizado',
        ])->assertUnauthorized();
    }
}
