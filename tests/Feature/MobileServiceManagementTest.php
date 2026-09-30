<?php
namespace Tests\Feature;
use App\Models\User; use Illuminate\Foundation\Testing\RefreshDatabase; use Laravel\Sanctum\Sanctum; use Tests\TestCase;
class MobileServiceManagementTest extends TestCase { use RefreshDatabase;
 public function test_admin_manages_services_and_accounts_from_mobile():void { Sanctum::actingAs(User::factory()->create(['profile_type'=>'admin']));
  $this->postJson('/api/mobile/services',['name'=>'Netflix','price'=>5000,'cost'=>3000,'payment_day'=>15,'account_email'=>'admin@example.com','password'=>'secret','pin'=>'1234','max_profiles'=>5,'currency'=>'CRC','is_active'=>true])->assertCreated();
  $id=\App\Models\Service::where('name','Netflix')->value('id');
  $this->postJson('/api/mobile/service-accounts',['service_id'=>$id,'name'=>'Principal','identifier'=>'cuenta@example.com','password'=>'clave','is_active'=>true])->assertCreated();
  $this->getJson('/api/mobile/services')->assertOk()->assertJsonPath('data.0.name','Netflix')->assertJsonPath('data.0.accounts.0.identifier','cuenta@example.com');
 }
 public function test_non_admin_cannot_open_mobile_service_management():void { Sanctum::actingAs(User::factory()->create(['profile_type'=>'agent'])); $this->getJson('/api/mobile/services')->assertForbidden(); }
}