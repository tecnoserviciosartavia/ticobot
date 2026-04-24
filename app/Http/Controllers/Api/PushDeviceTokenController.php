<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushDeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushDeviceTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:512'],
            'platform' => ['nullable', 'string', 'in:android,ios,web'],
        ]);

        PushDeviceToken::query()->updateOrCreate(
            ['token' => (string) $data['token']],
            [
                'user_id' => $request->user()?->id,
                'platform' => (string) ($data['platform'] ?? 'android'),
                'last_seen_at' => now(),
                'is_active' => true,
            ]
        );

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:512'],
        ]);

        PushDeviceToken::query()
            ->where('token', (string) $data['token'])
            ->update([
                'is_active' => false,
                'last_seen_at' => now(),
            ]);

        return response()->json(['ok' => true]);
    }
}
