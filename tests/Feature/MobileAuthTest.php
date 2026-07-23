<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MobileAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_user_can_login_use_token_and_logout(): void
    {
        $user = User::factory()->create(['password' => 'secret-pass']);

        $login = $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'secret-pass',
            'device_name' => 'Android test',
        ])->assertOk()->assertJsonPath('user.id', $user->id);

        $token = $login->json('token');
        $this->assertNotEmpty($token);

        $this->withToken($token)
            ->getJson('/api/mobile/me')
            ->assertOk()
            ->assertJsonPath('user.email', $user->email);

        $this->withToken($token)->postJson('/api/mobile/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_mobile_login_rejects_invalid_credentials(): void
    {
        $user = User::factory()->create();

        $this->postJson('/api/mobile/login', [
            'email' => $user->email,
            'password' => 'incorrecta',
        ])->assertUnprocessable();
    }
}
