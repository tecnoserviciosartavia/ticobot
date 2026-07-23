<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushWebSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushWebSubscriptionController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subscription' => ['required', 'array'],
            'subscription.endpoint' => ['required', 'string', 'max:2048'],
            'subscription.keys' => ['required', 'array'],
            'subscription.keys.p256dh' => ['required', 'string', 'max:512'],
            'subscription.keys.auth' => ['required', 'string', 'max:512'],
            'subscription.expirationTime' => ['nullable'],
            'platform' => ['nullable', 'string', 'in:web'],
        ]);

        $subscription = (array) $data['subscription'];
        $endpoint = (string) $subscription['endpoint'];

        PushWebSubscription::query()->updateOrCreate(
            ['endpoint_hash' => hash('sha256', $endpoint)],
            [
                'user_id' => $request->user()?->id,
                'endpoint' => $endpoint,
                'subscription' => $subscription,
                'platform' => 'web',
                'last_seen_at' => now(),
                'is_active' => true,
            ]
        );

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'max:2048'],
        ]);

        PushWebSubscription::query()
            ->where('endpoint_hash', hash('sha256', (string) $data['endpoint']))
            ->update([
                'is_active' => false,
                'last_seen_at' => now(),
            ]);

        return response()->json(['ok' => true]);
    }
}
