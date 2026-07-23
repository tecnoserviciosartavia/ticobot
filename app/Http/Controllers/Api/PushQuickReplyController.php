<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushDeviceToken;
use App\Models\WhatsappChatMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushQuickReplyController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_token' => ['required', 'string', 'max:512'],
            'phone' => ['required', 'string', 'max:20'],
            'message' => ['required', 'string', 'max:4096'],
        ]);

        $device = PushDeviceToken::query()
            ->where('token', $data['device_token'])
            ->where('platform', 'android')
            ->where('is_active', true)
            ->whereNotNull('user_id')
            ->first();

        if (! $device) {
            return response()->json(['ok' => false, 'error' => 'Dispositivo no autorizado.'], 401);
        }

        $conversation = WhatsappChatMessage::conversationSummaryForPhone($data['phone']);
        if (! $conversation || ! ($conversation['is_service_window_open'] ?? false)) {
            return response()->json(['ok' => false, 'error' => 'La ventana de respuesta de 24 horas expiró.'], 422);
        }

        WhatsappChatMessage::create([
            'phone' => $data['phone'],
            'direction' => 'outbound',
            'body' => trim($data['message']),
            'status' => 'queued',
            'sent_by_user_id' => $device->user_id,
            'sent_at' => null,
            'metadata' => ['source' => 'android_quick_reply'],
        ]);

        $device->update(['last_seen_at' => now()]);

        return response()->json(['ok' => true]);
    }
}
