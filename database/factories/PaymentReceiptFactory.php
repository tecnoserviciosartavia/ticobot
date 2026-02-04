<?php

namespace Database\Factories;

use App\Models\Payment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\PaymentReceipt>
 */
class PaymentReceiptFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'payment_id' => Payment::factory(),
            'file_path' => 'receipts/'.$this->faker->uuid().'.pdf',
            'file_name' => $this->faker->lexify('receipt-????').'.pdf',
            'file_size' => $this->faker->numberBetween(75000, 2_000_000),
            'mime_type' => 'application/pdf',
            'received_at' => $this->faker->dateTimeBetween('-10 days', 'now'),
            'metadata' => [],
        ];
    }
}
