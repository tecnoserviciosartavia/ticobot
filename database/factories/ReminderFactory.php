<?php

namespace Database\Factories;

use App\Models\Client;
use App\Models\Contract;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Reminder>
 */
class ReminderFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'contract_id' => Contract::factory(),
            'client_id' => Client::factory(),
            'channel' => 'whatsapp',
            'scheduled_for' => $this->faker->dateTimeBetween('+1 hour', '+3 days'),
            'queued_at' => null,
            'sent_at' => null,
            'acknowledged_at' => null,
            'status' => 'pending',
            'payload' => [],
            'response_payload' => null,
            'attempts' => 0,
            'last_attempt_at' => null,
        ];
    }
}
