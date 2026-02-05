<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Illuminate\Http\Request;
use App\Models\Setting;
use App\Models\Service;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;
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

    public function sendTestReminder(Request $request)
    {
        $data = $request->validate([
            // Permite 8 dígitos (CR) o 10+ con código país (ej 506XXXXXXXX)
            'phone' => ['required', 'string', 'regex:/^\d{8,15}$/'],
        ]);

        $raw = preg_replace('/[^0-9]/', '', $data['phone'] ?? '');
        // Si viene como 8 dígitos, asumimos CR y agregamos 506.
        $phone = strlen($raw) === 8 ? ('506' . $raw) : $raw;

        // Crear/obtener cliente de prueba por teléfono
        $client = Client::firstOrCreate(
            ['phone' => $raw],
            [
                'name' => 'Cliente de Prueba',
                'email' => "test_{$raw}@test.com",
                'address' => 'Dirección de prueba',
                'identification' => 'TEST-' . substr($raw, -8),
            ]
        );

        // Crear/obtener contrato de prueba para ese cliente
        $contract = Contract::firstOrCreate(
            ['client_id' => $client->id],
            [
                'name' => 'Contrato de Prueba - Sistema',
                'amount' => 0.00,
                'currency' => 'CRC',
                'billing_cycle' => 'monthly',
                'next_due_date' => now()->addMonth(),
                'grace_period_days' => 0,
            ]
        );

        // Crear recordatorio inmediato. El bot se encarga del contenido vía reminder_template.
        $reminder = Reminder::create([
            'contract_id' => $contract->id,
            'client_id' => $client->id,
            'channel' => 'whatsapp',
            'scheduled_for' => Carbon::now(),
            'status' => 'pending',
            'payload' => [
                // Importante: guardamos el teléfono con código país por si el bot lo usa.
                'phone' => $phone,
            ],
        ]);

        return redirect()->back()->with('success', "Recordatorio de prueba encolado para +{$phone}.")->with('reminder_id', $reminder->id);
    }
}
