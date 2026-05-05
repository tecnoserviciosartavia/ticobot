<?php

namespace Tests\Feature\Api;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Payment;
use App\Models\PausedContact;
use Illuminate\Foundation\Testing\RefreshDatabase;

class PaymentStatusControllerTest extends TestCase
{
    use RefreshDatabase;

    protected Client $client;

    protected function setUp(): void
    {
        parent::setUp();

        $this->client = Client::factory()->create([
            'phone' => '+50612345678',
            'name' => 'Test Client',
            'email' => 'test@example.com',
        ]);
    }

    /** @test */
    public function it_gets_payment_status_by_phone()
    {
        // Create some payments
        Payment::factory()->create([
            'client_id' => $this->client->id,
            'amount' => 100.00,
            'currency' => 'USD',
            'status' => 'verified',
            'paid_at' => now()->subDays(5),
        ]);

        Payment::factory()->create([
            'client_id' => $this->client->id,
            'amount' => 50.00,
            'currency' => 'USD',
            'status' => 'unverified',
        ]);

        $response = $this->postJson("/api/payment-status/{$this->client->phone}");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'client' => [
                    'id' => $this->client->id,
                    'name' => $this->client->name,
                    'phone' => $this->client->phone,
                ],
                'summary' => [
                    'total_payments' => 2,
                    'unverified' => 1,
                    'verified' => 1,
                ],
            ]);

        $response->assertJsonCount(2, 'payments');
    }

    /** @test */
    public function it_handles_phone_not_found()
    {
        $response = $this->postJson('/api/payment-status/+50699999999');

        $response->assertStatus(404)
            ->assertJson([
                'success' => false,
                'message' => 'Cliente no encontrado',
            ]);
    }

    /** @test */
    public function it_handles_partial_phone_match()
    {
        // Create client with partial phone
        $partialClient = Client::factory()->create([
            'phone' => '+50612345678',
        ]);

        Payment::factory()->create([
            'client_id' => $partialClient->id,
            'amount' => 25.00,
            'status' => 'verified',
        ]);

        // Search with just last 8 digits
        $response = $this->postJson('/api/payment-status/12345678');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);
    }

    /** @test */
    public function it_can_pause_contact()
    {
        $response = $this->postJson('/api/paused-contacts', [
            'whatsapp_number' => '+50612345678',
            'client_id' => $this->client->id,
            'reason' => 'Test pause',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Contacto agregado a la lista de pausa',
            ]);

        $this->assertDatabaseHas('paused_contacts', [
            'client_id' => $this->client->id,
            'whatsapp_number' => '50612345678',
            'reason' => 'Test pause',
        ]);
    }

    /** @test */
    public function it_can_pause_contact_without_client_id()
    {
        $response = $this->postJson('/api/paused-contacts', [
            'whatsapp_number' => '+50612345678',
            'reason' => 'Test pause without client',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);

        // Should auto-link to existing client
        $this->assertDatabaseHas('paused_contacts', [
            'client_id' => $this->client->id,
            'whatsapp_number' => '50612345678',
        ]);
    }

    /** @test */
    public function it_can_resume_contact()
    {
        // Create paused contact
        PausedContact::create([
            'client_id' => $this->client->id,
            'whatsapp_number' => '50612345678',
            'reason' => 'Test pause',
        ]);

        $response = $this->deleteJson("/api/paused-contacts/{$this->client->id}/50612345678");

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Contacto removido de la lista de pausa',
            ]);

        $this->assertDatabaseMissing('paused_contacts', [
            'client_id' => $this->client->id,
            'whatsapp_number' => '50612345678',
        ]);
    }

    /** @test */
    public function it_can_resume_contact_by_number_only()
    {
        PausedContact::create([
            'client_id' => $this->client->id,
            'whatsapp_number' => '50612345678',
            'reason' => 'Test pause',
        ]);

        $response = $this->deleteJson('/api/paused-contacts/by-number/50612345678');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);

        $this->assertDatabaseMissing('paused_contacts', [
            'whatsapp_number' => '50612345678',
        ]);
    }

    /** @test */
    public function it_lists_paused_contacts()
    {
        // Create paused contacts
        PausedContact::factory()->create([
            'client_id' => $this->client->id,
            'whatsapp_number' => '50612345678',
            'reason' => 'First pause',
        ]);

        PausedContact::factory()->create([
            'whatsapp_number' => '50687654321',
            'reason' => 'Second pause',
        ]);

        $response = $this->getJson('/api/paused-contacts');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'total' => 2,
            ]);

        $response->assertJsonCount(2, 'data');
    }

    /** @test */
    public function it_checks_if_number_is_paused()
    {
        PausedContact::create([
            'client_id' => $this->client->id,
            'whatsapp_number' => '50612345678',
            'reason' => 'Test pause',
        ]);

        $response = $this->getJson('/api/paused-contacts/check/50612345678');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'whatsapp_number' => '50612345678',
                'is_paused' => true,
            ]);

        // Check non-paused number
        $response = $this->getJson('/api/paused-contacts/check/50699999999');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'whatsapp_number' => '50699999999',
                'is_paused' => false,
            ]);
    }

    /** @test */
    public function it_normalizes_phone_numbers()
    {
        $response = $this->postJson('/api/paused-contacts', [
            'whatsapp_number' => '12345678', // Without country code
            'client_id' => $this->client->id,
        ]);

        $response->assertStatus(200);

        // Should be stored as digits only
        $this->assertDatabaseHas('paused_contacts', [
            'client_id' => $this->client->id,
            'whatsapp_number' => '12345678',
        ]);
    }

    /** @test */
    public function it_handles_resume_contact_not_found()
    {
        $response = $this->deleteJson("/api/paused-contacts/{$this->client->id}/50699999999");

        $response->assertStatus(404)
            ->assertJson([
                'success' => false,
                'message' => 'Contacto no encontrado en lista de pausa',
            ]);
    }

    /** @test */
    public function it_validates_pause_contact_request()
    {
        $response = $this->postJson('/api/paused-contacts', [
            'whatsapp_number' => '', // Required field missing
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['whatsapp_number']);
    }

    /** @test */
    public function it_handles_sql_injection_attempts()
    {
        // This test ensures our SQL injection fix works
        $maliciousInput = "12345678'; DROP TABLE clients; --";
        
        $response = $this->postJson("/api/payment-status/{$maliciousInput}");

        // Should return 404, not 500 (which would indicate SQL injection success)
        $response->assertStatus(404);
        
        // Verify clients table still exists
        $this->assertDatabaseCount('clients', 1);
    }

    /** @test */
    public function it_handles_special_characters_in_phone_search()
    {
        $clientWithSpecialChars = Client::factory()->create([
            'phone' => '+506 (123) 456-78',
        ]);

        Payment::factory()->create([
            'client_id' => $clientWithSpecialChars->id,
            'amount' => 75.00,
            'status' => 'verified',
        ]);

        // Search with clean digits
        $response = $this->postJson('/api/payment-status/12345678');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
            ]);
    }
}
