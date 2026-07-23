<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MetaWhatsAppMessageController extends Controller
{
    public function sendText(Request $request, WhatsAppNotificationService $whatsApp): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'min:5'],
            'message' => ['required', 'string', 'min:1'],
        ]);

        if (! $whatsApp->isMetaConfigured()) {
            return response()->json([
                'ok' => false,
                'error' => 'Meta WhatsApp no configurado en el backend',
            ], 503);
        }

        // El bot registra este envío en /chats/outbound para conservar su estado
        // y evitar que el mismo mensaje aparezca dos veces en el hilo.
        $sent = $whatsApp->sendTextMessage($data['phone'], $data['message'], false);

        if (! $sent) {
            return response()->json([
                'ok' => false,
                'error' => 'No se pudo enviar el mensaje por Meta WhatsApp',
            ], 500);
        }

        return response()->json(['ok' => true]);
    }

    public function sendMedia(Request $request, WhatsAppNotificationService $whatsApp): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'min:5'], 'data' => ['required', 'string'],
            'mimetype' => ['required', 'string', 'max:120'], 'filename' => ['nullable', 'string', 'max:255'],
            'caption' => ['nullable', 'string', 'max:1024'],
        ]);
        $sent = $whatsApp->sendMediaMessage($data['phone'], $data['data'], $data['mimetype'], $data['filename'] ?? null, $data['caption'] ?? null);
        return $sent ? response()->json(['ok' => true]) : response()->json(['ok' => false, 'error' => 'No se pudo enviar el archivo por Meta WhatsApp'], 500);
    }

    public function sendTemplate(Request $request, WhatsAppNotificationService $whatsApp): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'min:5'],
            'template' => ['required', 'string', 'max:512'],
            'language' => ['nullable', 'string', 'max:20'],
            'parameters' => ['nullable', 'array'],
            'parameters.*' => ['string', 'max:1024'],
        ]);

        $sent = $whatsApp->sendTemplateMessage(
            $data['phone'],
            $data['template'],
            array_values($data['parameters'] ?? []),
            $data['language'] ?? 'es',
            ['source' => 'scheduled_reminder_template']
        );

        return $sent
            ? response()->json(['ok' => true])
            : response()->json(['ok' => false, 'error' => 'Meta no aceptó la plantilla'], 500);
    }
}
