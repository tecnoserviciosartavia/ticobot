<?php

namespace Tests\Feature;

use App\Models\WhatsappChatMessage;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChatWindowVisibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_conversations_with_open_service_window_are_listed(): void
    {
        config()->set('app.timezone', 'UTC');
        Carbon::setTestNow(Carbon::parse('2026-07-17 12:00:00', 'UTC'));

        $openPhone = '506' . random_int(60000000, 69999999);
        $closedPhone = '506' . random_int(70000000, 79999999);

        WhatsappChatMessage::create([
            'phone' => $closedPhone,
            'direction' => 'inbound',
            'body' => 'Hola, necesito ayuda',
            'status' => 'received',
            'sent_at' => Carbon::now('UTC')->subHours(26),
        ]);

        WhatsappChatMessage::create([
            'phone' => $closedPhone,
            'direction' => 'outbound',
            'body' => 'Respuesta tardía en historial',
            'status' => 'sent',
            'sent_at' => Carbon::now('UTC')->subHour(),
        ]);

        WhatsappChatMessage::create([
            'phone' => $openPhone,
            'direction' => 'inbound',
            'body' => 'Necesito hablar contigo',
            'status' => 'received',
            'sent_at' => Carbon::now('UTC')->subHours(2),
        ]);

        WhatsappChatMessage::create([
            'phone' => $openPhone,
            'direction' => 'outbound',
            'body' => 'Te respondo dentro de ventana',
            'status' => 'sent',
            'sent_at' => Carbon::now('UTC')->subHour(),
        ]);

        $openConversations = WhatsappChatMessage::openConversations();

        $this->assertCount(1, $openConversations);
        $this->assertSame($openPhone, $openConversations->first()['phone']);
        $this->assertTrue($openConversations->first()['is_service_window_open']);

        $closedConversation = WhatsappChatMessage::conversationSummaryForPhone($closedPhone);
        $this->assertNotNull($closedConversation);
        $this->assertFalse($closedConversation['is_service_window_open']);
        $this->assertNotNull($closedConversation['service_window_expires_at']);

        Carbon::setTestNow();
    }

    public function test_reply_is_rejected_once_the_service_window_expires(): void
    {
        config()->set('app.timezone', 'UTC');
        Carbon::setTestNow(Carbon::parse('2026-07-17 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $phone = '506' . random_int(80000000, 89999999);

        WhatsappChatMessage::create([
            'phone' => $phone,
            'direction' => 'inbound',
            'body' => 'Hola',
            'status' => 'received',
            'sent_at' => Carbon::now('UTC')->subHours(26),
        ]);

        $this->actingAs($user)
            ->from('/chats/' . $phone)
            ->post('/chats/' . $phone . '/reply', [
                'body' => 'Respuesta fuera de ventana',
            ])
            ->assertSessionHasErrors('body')
            ->assertRedirect('/chats/' . $phone);

        $this->assertSame(0, WhatsappChatMessage::query()
            ->where('phone', $phone)
            ->where('direction', 'outbound')
            ->where('status', 'queued')
            ->count());

        Carbon::setTestNow();
    }

    public function test_mobile_chat_list_includes_the_complete_history_like_the_web(): void
    {
        config()->set("app.timezone", "UTC");
        Carbon::setTestNow(Carbon::parse("2026-07-17 12:00:00", "UTC"));

        $user = User::factory()->create();
        $phone = "506".random_int(70000000, 79999999);

        WhatsappChatMessage::create([
            "phone" => $phone,
            "direction" => "inbound",
            "body" => "Conversación histórica",
            "status" => "read",
            "sent_at" => Carbon::now("UTC")->subDays(5),
        ]);

        Sanctum::actingAs($user);

        $this->getJson("/api/mobile/chats")
            ->assertOk()
            ->assertJsonPath("data.0.phone", $phone)
            ->assertJsonPath("data.0.last_body", "Conversación histórica")
            ->assertJsonPath("data.0.is_service_window_open", false);

        Carbon::setTestNow();
    }

    public function test_reply_can_queue_an_image_with_an_optional_caption(): void
    {
        $user = User::factory()->create();
        $phone = '506'.random_int(80000000, 89999999);

        WhatsappChatMessage::create([
            'phone' => $phone,
            'direction' => 'inbound',
            'body' => 'Podés enviarme la imagen',
            'status' => 'received',
            'sent_at' => now()->subHour(),
        ]);

        $this->actingAs($user)
            ->post(route('chats.reply', $phone), [
                'body' => 'Aquí está el comprobante',
                'attachment' => UploadedFile::fake()->image('comprobante.jpg', 640, 480),
            ])
            ->assertSessionHasNoErrors();

        $message = WhatsappChatMessage::query()
            ->where('phone', $phone)
            ->where('direction', 'outbound')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('queued', $message->status);
        $this->assertSame('Aquí está el comprobante', $message->body);
        $this->assertSame('image', $message->metadata['media']['kind'] ?? null);
        $this->assertSame('comprobante.jpg', $message->metadata['media']['filename'] ?? null);
        $this->assertNotEmpty($message->metadata['media']['data'] ?? null);
    }
}
