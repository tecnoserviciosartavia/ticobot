<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MobileSystemSettingsController extends Controller
{
    private const ALLOWED_KEYS = [
        'company_name',
        'service_name',
        'payment_contact',
        'beneficiary_name',
        'bank_accounts',
        'reminder_template',
    ];

    public function show(): JsonResponse
    {
        return response()->json(['data' => collect(self::ALLOWED_KEYS)->mapWithKeys(
            fn (string $key) => [$key => (string) Setting::get($key, '')]
        )]);
    }

    public function companies(): JsonResponse
    {
        return response()->json([
            'data' => Company::query()->orderBy('name')->get(['id', 'name', 'slug', 'payment_contact', 'beneficiary_name', 'bank_accounts', 'is_active']),
            'multi_company_enabled' => Setting::get('multi_company_enabled', '0') === '1',
        ]);
    }

    public function storeCompany(Request $request): JsonResponse
    {
        $company = Company::create($this->validatedCompany($request));

        return response()->json(['data' => $company], 201);
    }

    public function updateCompany(Request $request, Company $company): JsonResponse
    {
        $company->update($this->validatedCompany($request, $company));

        return response()->json(['data' => $company->fresh()]);
    }

    public function destroyCompany(Company $company): JsonResponse
    {
        if ($company->clients()->exists() || $company->services()->exists()) {
            return response()->json(['message' => 'No se puede eliminar una empresa con clientes o servicios asociados.'], 422);
        }

        $company->delete();

        return response()->json(status: 204);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_name' => ['nullable', 'string', 'max:255'],
            'service_name' => ['nullable', 'string', 'max:255'],
            'payment_contact' => ['nullable', 'string', 'max:100'],
            'beneficiary_name' => ['nullable', 'string', 'max:255'],
            'bank_accounts' => ['nullable', 'string', 'max:5000'],
            'reminder_template' => ['nullable', 'string', 'max:5000'],
        ]);

        foreach (self::ALLOWED_KEYS as $key) {
            if (array_key_exists($key, $data)) {
                Setting::set($key, trim((string) ($data[$key] ?? '')));
            }
        }

        return $this->show();
    }

    private function validatedCompany(Request $request, ?Company $company = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:100', Rule::unique('companies')->ignore($company?->id)],
            'payment_contact' => ['nullable', 'string', 'max:255'],
            'bank_accounts' => ['nullable', 'string', 'max:2000'],
            'beneficiary_name' => ['nullable', 'string', 'max:255'],
            'is_active' => ['required', 'boolean'],
        ]);
    }
}
