<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WhatsappChatMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChatComposeMessageTest extends TestCase
{
    use RefreshDatabase;

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
}
