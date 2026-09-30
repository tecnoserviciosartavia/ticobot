<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class PausedContactFactory extends Factory
{
    public function definition(): array
    {
        return [
            'client_id' => null,
            'whatsapp_number' => $this->faker->numerify('506########'),
            'reason' => $this->faker->sentence(),
        ];
    }
}
