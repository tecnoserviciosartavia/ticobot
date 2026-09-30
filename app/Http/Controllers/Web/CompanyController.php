<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use Illuminate\Support\Carbon;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class CompanyController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Settings/Companies/Index', [
            'multiCompanyEnabled' => Setting::get('multi_company_enabled', '0') === '1',
            'companies' => Company::withCount(['clients', 'services'])->orderBy('name')->get()->map(function (Company $company) {
                $passwordConfigured = filled($company->sinpe_imap_password);
                $company->makeHidden('sinpe_imap_password');
                $company->setAttribute('sinpe_imap_password_configured', $passwordConfigured);
                return $company;
            }),
        ]);
    }

    public function toggle(Request $request): RedirectResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        Setting::set('multi_company_enabled', $data['enabled'] ? '1' : '0');
        return back()->with('success', 'Configuración multiempresa actualizada.');
    }

    public function store(Request $request): RedirectResponse
    {
        Company::create($this->validated($request));
        return back()->with('success', 'Empresa creada.');
    }

    public function update(Request $request, Company $company): RedirectResponse
    {
        $company->update($this->validated($request, $company));
        return back()->with('success', 'Empresa actualizada.');
    }

    public function sendTest(Request $request, Company $company): RedirectResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'regex:/^\d{8,15}$/']]);
        $raw = preg_replace('/[^0-9]/', '', $data['phone']);
        $phone = strlen($raw) === 8 ? '506'.$raw : $raw;
        $client = Client::firstOrCreate(
            ['phone' => $raw, 'company_id' => $company->id],
            ['name' => 'Cliente de Prueba - '.$company->name, 'email' => "test_{$company->id}_{$raw}@test.com", 'status' => 'active']
        );
        $contract = Contract::firstOrCreate(
            ['client_id' => $client->id, 'name' => 'Prueba '.$company->name],
            ['amount' => 0, 'currency' => 'CRC', 'billing_cycle' => 'monthly', 'next_due_date' => now()->addMonth(), 'grace_period_days' => 0]
        );
        Reminder::create([
            'contract_id' => $contract->id, 'client_id' => $client->id, 'channel' => 'whatsapp',
            'scheduled_for' => Carbon::now(), 'status' => 'pending',
            'payload' => array_merge($company->reminderPayload(), ['phone' => $phone, 'amount' => '0', 'due_date' => now()->toDateString()]),
        ]);
        return back()->with('success', "Recordatorio de prueba de {$company->name} encolado para +{$phone}.");
    }

    public function destroy(Company $company): RedirectResponse
    {
        if ($company->clients()->exists() || $company->services()->exists()) {
            return back()->with('error', 'No se puede eliminar una empresa con clientes o servicios asociados.');
        }
        $company->delete();
        return back()->with('success', 'Empresa eliminada.');
    }

    private function validated(Request $request, ?Company $company = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:100', Rule::unique('companies')->ignore($company?->id)],
            'reminder_template' => ['nullable', 'string', 'max:5000'],
            'payment_contact' => ['nullable', 'string', 'max:255'],
            'bank_accounts' => ['nullable', 'string', 'max:2000'],
            'beneficiary_name' => ['nullable', 'string', 'max:255'],
            'is_active' => ['required', 'boolean'],
            'sinpe_email_enabled' => ['sometimes', 'boolean'],
            'sinpe_imap_host' => ['nullable', 'string', 'max:255'],
            'sinpe_imap_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'sinpe_imap_encryption' => ['nullable', Rule::in(['ssl', 'tls', 'none'])],
            'sinpe_imap_folder' => ['nullable', 'string', 'max:255'],
            'sinpe_imap_username' => ['nullable', 'string', 'max:255'],
            'sinpe_imap_password' => ['nullable', 'string', 'max:500'],
        ]);

        if (empty($data['sinpe_imap_password'])) {
            unset($data['sinpe_imap_password']);
        }

        return $data;
    }
}
