<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Client>
 */
class ClientFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => $this->faker->company(),
            'legal_id' => $this->faker->unique()->numerify('3-###-######'),
            'email' => $this->faker->unique()->companyEmail(),
            'phone' => $this->faker->e164PhoneNumber(),
            'status' => 'active',
            'metadata' => [],
            'notes' => $this->faker->optional()->sentence(),
        ];
    }
}
