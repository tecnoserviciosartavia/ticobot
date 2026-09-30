<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\Company;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ServiceController extends Controller
{
    public function index(): Response
    {
        $usageCounts = DB::table('contract_service')
            ->join('contracts', 'contracts.id', '=', 'contract_service.contract_id')
            ->whereNull('contracts.deleted_at')
            ->select('contract_service.service_id', DB::raw('SUM(contract_service.quantity) as total_used'))
            ->groupBy('contract_service.service_id')
            ->pluck('total_used', 'contract_service.service_id')
            ->map(fn ($v) => (int) $v)
            ->toArray();

        $services = Service::query()->with('company')
            ->with(['accounts' => fn ($query) => $query->orderBy('identifier')])
            ->orderBy('name')
            ->get()
            ->map(fn (Service $s) => [
                'id' => $s->id,
                'company_id' => $s->company_id,
                'company_name' => $s->company?->name,
                'company_slug' => $s->company?->slug,
                'name' => $s->name,
                'price' => (string) $s->price,
                'cost' => (string) ($s->cost ?? '0.00'),
                'payment_day' => $s->payment_day,
                'account_email' => $s->account_email,
                'password' => $s->password,
                'pin' => $s->pin,
                'max_profiles' => $s->max_profiles,
                'profiles_used' => (int) ($usageCounts[$s->id] ?? 0),
                'currency' => $s->currency,
                'is_active' => (bool) $s->is_active,
                'updated_at' => $s->updated_at?->toIso8601String(),
                'accounts' => $s->accounts->map(fn ($account) => [
                    'id' => $account->id,
                    'name' => $account->name,
                    'identifier' => $account->identifier,
                    'is_active' => (bool) $account->is_active,
                ])->values()->all(),
            ]);

        return Inertia::render('Settings/Services/Index', [
            'services' => $services,
            'companies' => Company::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'slug']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        Service::create($data);
        return redirect()->back()->with('success', 'Servicio agregado.');
    }

    public function update(Request $request, Service $service): RedirectResponse
    {
        $data = $this->validated($request, $service);
        $service->update($data);
        return redirect()->back()->with('success', 'Servicio actualizado.');
    }

    public function destroy(Service $service): RedirectResponse
    {
        $service->delete();
        return redirect()->back()->with('success', 'Servicio eliminado.');
    }

    private function validated(Request $request, ?Service $service = null): array
    {
        $data = $request->validate([
            'company_id' => ['required', 'integer', Rule::exists('companies', 'id')->where('is_active', true)],
            'name' => [
                'required',
                'string',
                'max:255',
            ],
            'price' => ['required', 'numeric', 'min:0'],
            'cost' => ['nullable', 'numeric', 'min:0'],
            'payment_day' => ['nullable', 'integer', 'min:1', 'max:31'],
            'account_email' => ['nullable', 'email', 'max:255', Rule::unique('services', 'account_email')->ignore($service?->id)],
            'password' => ['nullable', 'string', 'max:255'],
            'pin' => ['nullable', 'string', 'max:64'],
            'max_profiles' => ['nullable', 'integer', 'min:1'],
            'currency' => ['required', Rule::in(['CRC', 'USD'])],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $company = Company::query()->findOrFail((int) $data['company_id']);
        $ticocastOnly = $company->slug === 'ticocast';
        return [
            'company_id' => (int) $data['company_id'],
            'name' => trim((string) $data['name']),
            'price' => $data['price'],
            'cost' => array_key_exists('cost', $data) ? $data['cost'] : 0,
            'payment_day' => $ticocastOnly && array_key_exists('payment_day', $data) ? $data['payment_day'] : null,
            'account_email' => $ticocastOnly ? ($data['account_email'] ?? null) : null,
            'password' => $ticocastOnly ? ($data['password'] ?? null) : null,
            'pin' => $ticocastOnly ? ($data['pin'] ?? null) : null,
            'max_profiles' => $ticocastOnly && isset($data['max_profiles']) && $data['max_profiles'] !== '' ? (int) $data['max_profiles'] : null,
            'currency' => strtoupper($data['currency']),
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
        ];
    }
}
