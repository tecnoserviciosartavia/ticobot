<?php

namespace Tests\Unit;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Services\PaymentSettlementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PaymentSettlementServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_payment_advances_monthly_schedule_using_contract_due_date(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'amount' => 15000,
            'currency' => 'CRC',
            'billing_cycle' => 'monthly',
            'next_due_date' => '2026-06-01',
        ]);

        $originalReminder = Reminder::query()
            ->where('contract_id', $contract->id)
            ->where('status', 'pending')
            ->firstOrFail();

        $this->assertSame('2026-06-01', $originalReminder->scheduled_for?->toDateString());

        $payment = Payment::factory()->create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'reminder_id' => $originalReminder->id,
            'amount' => 15000,
            'currency' => 'CRC',
            'status' => 'verified',
            'channel' => 'manual',
            'paid_at' => '2026-06-10',
            'metadata' => ['paid_for_month' => '2026-06'],
        ]);

        app(PaymentSettlementService::class)->settleVerifiedPayment($payment->fresh(['contract']));

        $contract->refresh();

        $this->assertSame('2026-07-01', $contract->next_due_date?->toDateString());

        $paidReminder = Reminder::query()
            ->where('contract_id', $contract->id)
            ->where('status', 'paid')
            ->firstOrFail();

        $this->assertSame('2026-06-01', $paidReminder->scheduled_for?->toDateString());

        $pendingReminder = Reminder::query()
            ->where('contract_id', $contract->id)
            ->where('status', 'pending')
            ->firstOrFail();

        $this->assertSame('2026-07-01', $pendingReminder->scheduled_for?->toDateString());
    }

    public function test_verified_payment_does_not_skip_month_when_next_due_already_advanced(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');
        config()->set('reminders.send_time', '09:00');

        $client = Client::factory()->create();
        $contract = Contract::factory()->create([
            'client_id' => $client->id,
            'amount' => 15000,
            'currency' => 'CRC',
            'billing_cycle' => 'monthly',
            'next_due_date' => '2026-06-01',
        ]);

        $juneReminder = Reminder::query()
            ->where('contract_id', $contract->id)
            ->where('status', 'pending')
            ->firstOrFail();

        // Simula que el recordatorio de junio ya se envió y el bot creó el de julio.
        $juneReminder->forceFill([
            'status' => 'sent',
            'sent_at' => Carbon::parse('2026-06-01 09:00:00', 'America/Costa_Rica'),
        ])->save();

        $contract->forceFill(['next_due_date' => '2026-07-01'])->save();

        Reminder::createOpenUnique([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'channel' => 'whatsapp',
            'scheduled_for' => Carbon::parse('2026-07-01 09:00:00', 'America/Costa_Rica'),
            'status' => 'pending',
            'payload' => ['recurrence' => 'monthly', 'amount' => '15000', 'due_date' => '2026-07-01'],
        ]);

        $payment = Payment::factory()->create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'amount' => 15000,
            'currency' => 'CRC',
            'status' => 'verified',
            'channel' => 'sinpe',
            'paid_at' => '2026-06-15',
            'metadata' => [
                'paid_for_month' => '2026-06',
                'covered_months' => ['2026-06'],
            ],
        ]);

        app(PaymentSettlementService::class)->settleVerifiedPayment($payment->fresh(['contract']));

        $contract->refresh();

        $this->assertSame('2026-07-01', $contract->next_due_date?->toDateString());

        $pendingReminder = Reminder::query()
            ->where('contract_id', $contract->id)
            ->where('status', 'pending')
            ->firstOrFail();

        $this->assertSame('2026-07-01', $pendingReminder->scheduled_for?->toDateString());
    }
}
