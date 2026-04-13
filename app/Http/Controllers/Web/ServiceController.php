<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Service;
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

        $services = Service::query()
            ->orderBy('name')
            ->get()
            ->map(fn (Service $s) => [
                'id' => $s->id,
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
            ]);

        return Inertia::render('Settings/Services/Index', [
            'services' => $services,
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

        return [
            'name' => trim((string) $data['name']),
            'price' => $data['price'],
            'cost' => array_key_exists('cost', $data) ? $data['cost'] : 0,
            'payment_day' => array_key_exists('payment_day', $data) ? $data['payment_day'] : null,
            'account_email' => $data['account_email'] ?? null,
            'password' => $data['password'] ?? null,
            'pin' => $data['pin'] ?? null,
            'max_profiles' => isset($data['max_profiles']) && $data['max_profiles'] !== '' ? (int) $data['max_profiles'] : null,
            'currency' => strtoupper($data['currency']),
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
        ];
    }
}
