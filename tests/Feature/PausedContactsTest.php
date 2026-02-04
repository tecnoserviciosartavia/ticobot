<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\PausedContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PausedContactsTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_pause_contact_without_client_id(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

    $phone = '506' . (string) random_int(60000000, 69999999);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/paused-contacts', [
                'whatsapp_number' => $phone,
                'reason' => 'test',
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/paused-contacts/check/' . $phone)
            ->assertOk()
            ->assertJsonPath('is_paused', true);
    }

    public function test_can_resume_contact_by_number_without_client_id(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

    $phone = '506' . (string) random_int(70000000, 79999999);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/paused-contacts', [
                'whatsapp_number' => $phone,
                'reason' => 'test',
            ])
            ->assertOk();

        $this->assertSame(1, PausedContact::where('whatsapp_number', $phone)->count(), 'PausedContact not persisted after POST');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/paused-contacts/check/' . $phone)
            ->assertOk()
            ->assertJsonPath('is_paused', true);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->deleteJson('/api/paused-contacts/by-number/' . $phone);

        if ($res->status() !== 200) {
            $last8 = substr($phone, -8);
            $still = PausedContact::where('whatsapp_number', $phone)->orWhere('whatsapp_number', 'like', "%$last8")->count();
            $this->fail('DELETE by-number failed. status=' . $res->status() . ' body=' . $res->getContent() . ' still_in_db=' . $still);
        }

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/paused-contacts/check/' . $phone)
            ->assertOk()
            ->assertJsonPath('is_paused', false);
    }
}
