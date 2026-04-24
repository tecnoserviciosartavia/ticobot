<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsappChatMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatMessageController extends Controller
{
    /**
     * Bot POST: registrar un mensaje entrante de WhatsApp.
     * POST /api/chats/inbound
     */
    public function inbound(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone'               => ['required', 'string', 'max:20'],
            'body'                => ['nullable', 'string'],
            'whatsapp_message_id' => ['nullable', 'string', 'max:100'],
            'sent_at'             => ['nullable', 'date'],
            'metadata'            => ['nullable', 'array'],
        ]);

        // Evitar duplicados por whatsapp_message_id
        if (! empty($data['whatsapp_message_id'])) {
            $exists = WhatsappChatMessage::where('whatsapp_message_id', $data['whatsapp_message_id'])->exists();
            if ($exists) {
                return response()->json(['ok' => true, 'duplicate' => true]);
            }
        }

        $message = WhatsappChatMessage::create([
            'phone'               => $data['phone'],
            'direction'           => 'inbound',
            'body'                => $data['body'] ?? null,
            'status'              => 'received',
            'whatsapp_message_id' => $data['whatsapp_message_id'] ?? null,
            'sent_at'             => $data['sent_at'] ?? null,
            'metadata'            => $data['metadata'] ?? null,
        ]);

        return response()->json(['ok' => true, 'id' => $message->id], 201);
    }

    /**
     * Bot GET: obtener mensajes de salida pendientes de envío.
     * GET /api/chats/outbound-queue
     */
    public function outboundQueue(): JsonResponse
    {
        $messages = WhatsappChatMessage::where('direction', 'outbound')
            ->where('status', 'queued')
            ->orderBy('created_at')
            ->limit(20)
            ->get(['id', 'phone', 'body']);

        return response()->json(['messages' => $messages->values()]);
    }

    /**
     * Bot PATCH: marcar un mensaje como enviado o fallido.
     * PATCH /api/chats/messages/{id}/status
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status'              => ['required', 'in:sent,failed'],
            'whatsapp_message_id' => ['nullable', 'string', 'max:100'],
        ]);

        $message = WhatsappChatMessage::findOrFail($id);
        $message->update([
            'status'              => $data['status'],
            'whatsapp_message_id' => $data['whatsapp_message_id'] ?? $message->whatsapp_message_id,
            'sent_at'             => $data['status'] === 'sent' ? now() : null,
        ]);

        return response()->json(['ok' => true]);
    }
}
