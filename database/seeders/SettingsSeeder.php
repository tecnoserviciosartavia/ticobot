<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Setting;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        Setting::updateOrCreate(['key' => 'payment_contact'], ['value' => '88525881', 'description' => 'Sinpemóvil o contacto de pago']);
        Setting::updateOrCreate(['key' => 'bank_accounts'], ['value' => "BCR: CR21015202001214583670\nBAC: CR27010200009456644981\nPOPULAR: CR54016111152151714031", 'description' => 'Cuentas bancarias separadas por nueva línea']);
        Setting::updateOrCreate(['key' => 'service_name'], ['value' => 'TicoCast', 'description' => 'Nombre del servicio mostrado en recordatorios']);
        Setting::updateOrCreate(['key' => 'beneficiary_name'], ['value' => 'Fabián Artavia Serrano', 'description' => 'Nombre del beneficiario para cuentas bancarias']);
    }
}
