<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\ServiceAccount;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceAccountController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'service_id' => ['required', 'integer', Rule::exists('services', 'id')],
            'name' => ['nullable', 'string', 'max:255'],
            'identifier' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        ServiceAccount::create([
            'service_id' => $data['service_id'],
            'name' => trim((string) ($data['name'] ?? '')) ?: null,
            'identifier' => trim((string) $data['identifier']),
            'password' => trim((string) ($data['password'] ?? '')) ?: null,
            'is_active' => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : true,
        ]);

        return redirect()->back()->with('success', 'Cuenta de servicio agregada.');
    }

    public function destroy(ServiceAccount $serviceAccount): RedirectResponse
    {
        $serviceAccount->delete();

        return redirect()->back()->with('success', 'Cuenta de servicio eliminada.');
    }
}
