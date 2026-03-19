<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReminderClaimingTest extends TestCase
{
    use RefreshDatabase;

    public function test_reminder_can_only_be_claimed_once_and_duplicate_pending_siblings_are_cancelled(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-03-19',
            'billing_cycle' => 'monthly',
        ]);

        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();
        $duplicate = Reminder::create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'channel' => 'whatsapp',
            'scheduled_for' => $reminder->scheduled_for,
            'status' => 'pending',
        ]);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/reminders/' . $reminder->id . '/claim')
            ->assertOk()
            ->assertJsonPath('claimed', true)
            ->assertJsonPath('duplicates_cancelled', 1);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/reminders/' . $reminder->id . '/claim')
            ->assertStatus(409)
            ->assertJsonPath('claimed', false);

        $reminder->refresh();
        $duplicate->refresh();

        $this->assertSame('queued', $reminder->status);
        $this->assertNotNull($reminder->queued_at);
        $this->assertSame(1, $reminder->attempts);
        $this->assertSame('duplicate', $duplicate->status);
        $this->assertNotNull($duplicate->acknowledged_at);
    }

    public function test_sent_without_payment_endpoint_ignores_reminders_already_resent_today(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');

        Carbon::setTestNow(Carbon::parse('2026-03-19 18:00:00', 'America/Costa_Rica'));

        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-03-19',
            'billing_cycle' => 'monthly',
        ]);

        $eligible = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();
        $eligible->forceFill([
            'status' => 'sent',
            'sent_at' => Carbon::now('America/Costa_Rica')->subHours(2),
        ])->save();

        $alreadyResent = Reminder::create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'channel' => 'whatsapp',
            'scheduled_for' => Carbon::now('America/Costa_Rica')->setTime(9, 0),
            'status' => 'sent',
            'sent_at' => Carbon::now('America/Costa_Rica')->subHours(2),
            'last_resend_at' => Carbon::now('America/Costa_Rica')->subMinutes(5),
        ]);

        $startDate = Carbon::now('America/Costa_Rica')->startOfDay()->toIso8601String();
        $endDate = Carbon::now('America/Costa_Rica')->endOfDay()->toIso8601String();

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/reminders/sent-without-payment?start_date=' . urlencode($startDate) . '&end_date=' . urlencode($endDate))
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $eligible->id);

        $alreadyResent->refresh();
        $this->assertNotNull($alreadyResent->last_resend_at);

        Carbon::setTestNow();
    }
}