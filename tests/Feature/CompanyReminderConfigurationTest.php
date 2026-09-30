<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Client;
use App\Models\Payment;
use App\Models\Contract;
use App\Models\PayerAlias;
use App\Services\PayerAliasService;
use App\Services\ConciliationPdfService;
use App\Models\Reminder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CompanyReminderConfigurationTest extends TestCase
{
    use RefreshDatabase;

    public function test_company_test_reminder_uses_that_company_configuration(): void
    {
        $user = User::factory()->create(['profile_type' => 'admin']);
        $company = Company::query()->where('slug', 'ticofac')->firstOrFail();
        $company->update([
            'reminder_template' => 'Mensaje de {company_name} para {client_name}',
            'payment_contact' => '88887777',
            'bank_accounts' => 'Cuenta TicoFac',
            'beneficiary_name' => 'TicoFac S.A.',
        ]);

        $response = $this->actingAs($user)->post(
            route('settings.companies.send-test', $company),
            ['phone' => '61112222']
        );

        $response->assertRedirect();
        $reminder = Reminder::query()->get()->firstOrFail(fn (Reminder $item) => ($item->payload['phone'] ?? null) === '50661112222');
        $this->assertSame($company->id, $reminder->client->company_id);
        $this->assertSame('ticofac', $reminder->payload['sender_company']);
        $this->assertSame($company->reminder_template, $reminder->payload['company_reminder_template']);
        $this->assertSame('88887777', $reminder->payload['payment_contact']);
        $this->assertSame('Cuenta TicoFac', $reminder->payload['bank_accounts']);
        $this->assertSame('TicoFac S.A.', $reminder->payload['beneficiary_name']);
    }
    public function test_payment_receipt_message_uses_the_client_company(): void
    {
        $company = new Company(['name' => 'TicoFac', 'slug' => 'ticofac']);
        $client = new Client(['name' => 'LicOutlet']);
        $client->setRelation('company', $company);

        $payment = new Payment(['amount' => 20000, 'currency' => 'CRC', 'metadata' => []]);
        $payment->setRelation('client', $client);

        $message = app(ConciliationPdfService::class)->generateWhatsAppMessage($payment, 1);

        $this->assertStringContainsString('TicoFac: ¡Pago recibido!', $message);
        $this->assertStringContainsString('Gracias por preferir TicoFac', $message);
        $this->assertStringNotContainsString('TicoCast', $message);
    }

    public function test_verified_payer_alias_is_learned_and_ambiguous_companies_are_not_auto_matched(): void
    {
        $service = app(PayerAliasService::class);
        $ticoFac = Company::query()->where('slug', 'ticofac')->firstOrFail();
        $client = Client::factory()->create(['company_id' => $ticoFac->id]);
        Contract::factory()->create(['client_id' => $client->id, 'amount' => 20000]);
        $payment = Payment::factory()->create([
            'client_id' => $client->id,
            'amount' => 20000,
            'status' => 'verified',
            'metadata' => ['sinpe_email_origin_name' => 'Ricardo González', 'sinpe_email_origin_phone' => '88887777'],
        ]);

        $alias = $service->learnFromVerifiedPayment($payment);
        $this->assertInstanceOf(PayerAlias::class, $alias);
        $this->assertSame($client->id, $service->matchClient('Ricardo Gonzalez', '', 20000)?->id);

        $ticoCast = Company::query()->where('slug', 'ticocast')->firstOrFail();
        $otherClient = Client::factory()->create(['company_id' => $ticoCast->id]);
        Contract::factory()->create(['client_id' => $otherClient->id, 'amount' => 20000]);
        $otherPayment = Payment::factory()->create([
            'client_id' => $otherClient->id,
            'amount' => 20000,
            'status' => 'verified',
            'metadata' => ['sinpe_email_origin_name' => 'Ricardo González'],
        ]);
        $service->learnFromVerifiedPayment($otherPayment);

        $this->assertNull($service->matchClient('Ricardo González', '', 20000));
    }
}
