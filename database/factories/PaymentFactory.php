<?php

namespace Database\Factories;

use App\Models\Client;
use App\Models\Contract;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Payment>
 */
class PaymentFactory extends Factory
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
            'contract_id' => Contract::factory(),
            'reminder_id' => null,
            'amount' => $this->faker->randomFloat(2, 10000, 500000),
            'currency' => 'CRC',
            'status' => $this->faker->randomElement(['unverified', 'in_review', 'verified', 'rejected']),
            'channel' => $this->faker->randomElement(['manual', 'whatsapp', 'web']),
            'reference' => strtoupper($this->faker->bothify('REF####')),
            'paid_at' => $this->faker->dateTimeBetween('-15 days', 'now'),
            'metadata' => [],
        ];
    }
}
