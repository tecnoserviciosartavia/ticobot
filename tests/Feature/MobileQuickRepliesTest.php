<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileQuickRepliesTest extends TestCase
{
    use RefreshDatabase;

    public function test_reactivation_template_is_available_as_a_quick_reply(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/mobile/quick-replies')->assertOk();
        $reply = collect($response->json('data'))->firstWhere('id', 'service_reactivation');

        $this->assertIsArray($reply);
        $this->assertSame('Invitar a renovar', $reply['title']);
        $this->assertSame('reactivacion_servicio_v1', $reply['template_name']);
        $this->assertStringContainsString('[PLATAFORMAS]', $reply['body']);
    }
}
