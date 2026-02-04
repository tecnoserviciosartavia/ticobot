<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VerifiedPaymentSettlesRemindersTest extends TestCase
{
    use RefreshDatabase;

    public function test_manual_verified_payment_marks_next_pending_reminder_as_paid(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $user = User::factory()->create();
        $this->actingAs($user);

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'next_due_date' => '2026-02-10',
            'billing_cycle' => 'monthly',
        ]);

        $reminder = Reminder::query()->where('contract_id', $contract->id)->firstOrFail();
        $this->assertSame('pending', $reminder->status);

        $payload = [
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'amount' => 10000,
            'currency' => 'CRC',
            'channel' => 'manual',
            'status' => 'verified',
            'paid_at' => Carbon::now('America/Costa_Rica')->toDateString(),
        ];

        $response = $this->post(route('payments.store'), $payload);
        $response->assertRedirect(route('payments.index'));

        $reminder->refresh();
        $this->assertSame('paid', $reminder->status);
        $this->assertNotNull($reminder->acknowledged_at);

        $payment = Payment::query()->latest('id')->firstOrFail();
        $this->assertSame('verified', $payment->status);
    }
}
