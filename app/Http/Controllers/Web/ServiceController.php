<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ServiceController extends Controller
{
    public function index(): Response
    {
        $services = Service::query()
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
                Rule::unique('services', 'name')->ignore($service?->id),
            ],
            'price' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', Rule::in(['CRC', 'USD'])],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return [
            'name' => trim((string) $data['name']),
            'price' => $data['price'],
            'currency' => strtoupper($data['currency']),
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
        ];
    }
}
