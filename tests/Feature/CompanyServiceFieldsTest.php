<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CompanyServiceFieldsTest extends TestCase
{
    use RefreshDatabase;

    public function test_ticofac_services_only_keep_basic_cost_fields(): void
    {
        $company = Company::where('slug', 'ticofac')->firstOrFail();
        $user = User::factory()->create(['profile_type' => 'admin']);

        $this->actingAs($user)->post(route('settings.services.store'), [
            'company_id' => $company->id,
            'name' => 'Facturación mensual',
            'price' => 25000,
            'cost' => 10000,
            'currency' => 'CRC',
            'is_active' => true,
            'payment_day' => 15,
            'account_email' => 'should-not-save@example.com',
            'password' => 'secret',
            'pin' => '1234',
            'max_profiles' => 10,
        ])->assertRedirect();

        $service = Service::where('name', 'Facturación mensual')->firstOrFail();
        $this->assertSame($company->id, $service->company_id);
        $this->assertSame('25000.00', $service->price);
        $this->assertSame('10000.00', $service->cost);
        $this->assertNull($service->payment_day);
        $this->assertNull($service->account_email);
        $this->assertNull($service->password);
        $this->assertNull($service->pin);
        $this->assertNull($service->max_profiles);
    }
}
