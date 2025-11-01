<?php

namespace Database\Factories;

use App\Models\Client;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Contract>
 */
class ContractFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'client_id' => Client::factory(),
            'name' => $this->faker->words(3, true),
            'amount' => $this->faker->randomFloat(2, 10000, 250000),
            'currency' => 'CRC',
            'billing_cycle' => $this->faker->randomElement(['monthly', 'quarterly', 'annual', 'one_time']),
            'next_due_date' => $this->faker->dateTimeBetween('+2 days', '+40 days'),
            'grace_period_days' => $this->faker->randomElement([0, 3, 5, 7]),
            'metadata' => [],
        ];
    }
}
