<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\WhatsAppStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WhatsAppStatusController extends Controller
{
    public function storeQr(Request $request): JsonResponse
    {
        $data = $request->validate([
            'qr' => ['required', 'string'],
        ]);

        WhatsAppStatus::storeQr($data['qr']);

        return response()->json([
            'status' => 'pending',
        ]);
    }

    public function markReady(): JsonResponse
    {
        WhatsAppStatus::markReady();

        return response()->json([
            'status' => 'ready',
        ]);
    }

    public function markDisconnected(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        WhatsAppStatus::markDisconnected($data['reason'] ?? null);

        return response()->json([
            'status' => 'disconnected',
        ]);
    }
}
