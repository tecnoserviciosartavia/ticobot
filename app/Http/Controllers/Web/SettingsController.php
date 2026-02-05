<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Illuminate\Http\Request;
use App\Models\Setting;
use App\Models\Service;
use App\Support\WhatsAppStatus;

class SettingsController extends Controller
{
    public function index()
    {
        $all = Setting::all()->mapWithKeys(function ($s) {
            return [$s->key => $s->value];
        })->toArray();

        $services = Service::query()
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get()
            ->map(fn (Service $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'price' => (string) $s->price,
                'currency' => $s->currency,
                'is_active' => (bool) $s->is_active,
                'updated_at' => $s->updated_at?->toIso8601String(),
            ]);

        return Inertia::render('Settings/General/Index', [
            'settings' => $all,
            'whatsapp' => WhatsAppStatus::snapshot(),
            'services' => $services,
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            // "service_name" se mantiene solo por compatibilidad; ya no se configura desde la UI.
            'service_name' => 'nullable|string',
            'company_name' => 'nullable|string',
            'reminder_template' => 'nullable|string',
            'payment_contact' => 'nullable|string',
            'bank_accounts' => 'nullable|string',
            'beneficiary_name' => 'nullable|string',
        ]);

        if (array_key_exists('service_name', $data)) {
            Setting::set('service_name', $data['service_name'] ?? '');
        }
        if (array_key_exists('company_name', $data)) {
            Setting::set('company_name', $data['company_name'] ?? '');
        }
        if (array_key_exists('reminder_template', $data)) {
            Setting::set('reminder_template', $data['reminder_template'] ?? '');
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
