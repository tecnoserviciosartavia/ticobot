<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        $response = $this->get('/');

        // En apps con auth (Breeze/Jetstream), la ruta raíz suele redirigir (302)
        // hacia /login o /dashboard según el estado de autenticación.
        $response->assertStatus(302);
    }
}
