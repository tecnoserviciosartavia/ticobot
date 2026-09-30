<?php

namespace Database\Factories;

use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;

class ServiceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'company_id' => Company::query()->where('is_active', true)->orderBy('id')->value('id'),
            'name' => $this->faker->unique()->word(),
            'price' => 5000,
            'cost' => 0,
            'currency' => 'CRC',
            'is_active' => true,
        ];
    }
}
