<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Illuminate\Http\Request;
use App\Models\Setting;

class SettingsController extends Controller
{
    public function index()
    {
        $all = Setting::all()->mapWithKeys(function ($s) {
            return [$s->key => $s->value];
        })->toArray();

        return Inertia::render('Settings/General/Index', [
            'settings' => $all,
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'service_name' => 'nullable|string',
            'payment_contact' => 'nullable|string',
            'bank_accounts' => 'nullable|string',
            'beneficiary_name' => 'nullable|string',
        ]);

        if (array_key_exists('service_name', $data)) {
            Setting::set('service_name', $data['service_name'] ?? '');
        }
        if (array_key_exists('payment_contact', $data)) {
            Setting::set('payment_contact', $data['payment_contact'] ?? '');
        }
        if (array_key_exists('bank_accounts', $data)) {
            Setting::set('bank_accounts', $data['bank_accounts'] ?? '');
        }
        if (array_key_exists('beneficiary_name', $data)) {
            Setting::set('beneficiary_name', $data['beneficiary_name'] ?? '');
        }

        return redirect()->back()->with('success', 'Configuración guardada.');
    }
}
