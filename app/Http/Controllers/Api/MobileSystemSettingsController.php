<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}
