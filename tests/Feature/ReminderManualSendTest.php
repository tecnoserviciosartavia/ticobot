<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use App\Models\ReminderMessage;
use App\Models\User;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class ReminderManualSendTest extends TestCase
{
    use RefreshDatabase;

    public function test_manual_send_marks_reminder_as_sent_and_records_history(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        Carbon::setTestNow(Carbon::parse('2026-07-17 11:00:00', 'America/Costa_Rica'));

        $user = User::factory()->create();
        $client = Client::factory()->create([
            'phone' => '50688887777',
        ]);
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-07-10',
        ]);
        $reminder = Reminder::create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'channel' => 'whatsapp',
            'scheduled_for' => Carbon::now('America/Costa_Rica')->subDays(2),
            'status' => 'pending',
            'attempts' => 0,
            'payload' => [
                'message' => 'Recordatorio de pago pendiente',
                'amount' => '15000',
                'due_date' => '2026-07-10',
            ],
        ]);

        $this->mock(WhatsAppNotificationService::class, function (MockInterface $mock) use ($client) {
            $mock->shouldReceive('sendTextMessage')
                ->once()
                ->with($client->phone, 'Recordatorio de pago pendiente')
                ->andReturn(true);
        });

        $this->actingAs($user)
            ->from(route('reminders.index'))
            ->post(route('reminders.send-manually', $reminder->id))
            ->assertRedirect();

        $reminder->refresh();

        $this->assertSame('sent', $reminder->status);
        $this->assertNotNull($reminder->sent_at);
        $this->assertSame(1, $reminder->attempts);
        $this->assertNotNull($reminder->last_resend_at);
        $this->assertNotNull($reminder->response_payload['manual_sent_at'] ?? null);
        $this->assertSame($user->id, $reminder->response_payload['manual_sent_by'] ?? null);

        $this->assertSame(1, ReminderMessage::query()->where('reminder_id', $reminder->id)->count());
        $message = ReminderMessage::query()->where('reminder_id', $reminder->id)->firstOrFail();
        $this->assertSame('outbound', $message->direction);
        $this->assertSame('text', $message->message_type);
        $this->assertSame('Recordatorio de pago pendiente', $message->content);
        $this->assertSame($client->id, $message->client_id);

        Carbon::setTestNow();
    }
}
