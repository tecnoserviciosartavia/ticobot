<?php

namespace Database\Factories;

use App\Models\Client;
use App\Models\Reminder;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ReminderMessage>
 */
class ReminderMessageFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'reminder_id' => Reminder::factory(),
            'client_id' => Client::factory(),
            'direction' => $this->faker->randomElement(['outgoing', 'incoming']),
            'message_type' => 'text',
            'content' => $this->faker->sentence(),
            'whatsapp_message_id' => $this->faker->uuid(),
            'attachment_path' => null,
            'metadata' => [],
            'sent_at' => $this->faker->dateTimeBetween('-1 hour', 'now'),
        ];
    }
}
