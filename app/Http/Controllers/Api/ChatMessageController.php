<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\WhatsappChatMessage;
use App\Services\PushNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatMessageController extends Controller
{
    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?: '';
    }

    private function phoneLookupKeys(string $phone): array
    {
        $digits = $this->normalizePhone($phone);
        if ($digits === '') {
            return [];
        }

        $keys = [$digits];
        if (strlen($digits) > 8) {
            $keys[] = substr($digits, -8);
        }
        if (strlen($digits) > 7) {
            $keys[] = substr($digits, -7);
        }

        return array_values(array_unique(array_filter($keys)));
    }

    private function resolveClientByPhone(string $phone): ?Client
    {
        $lookupKeys = $this->phoneLookupKeys($phone);
        if ($lookupKeys === []) {
            return null;
        }

        $clients = Client::query()
            ->select('id', 'name', 'phone')
            ->get();

        foreach ($clients as $client) {
            foreach ($this->phoneLookupKeys((string) $client->phone) as $clientKey) {
                if (in_array($clientKey, $lookupKeys, true)) {
                    return $client;
                }
            }
        }

        return null;
    }

    private function resolveMediaKind(array $media): string
    {
        $kind = strtolower(trim((string) ($media['kind'] ?? '')));
        if ($kind !== '') {
            return $kind;
        }

        $mimetype = strtolower(trim((string) ($media['mimetype'] ?? '')));
        if ($mimetype === '') {
            return '';
        }

        if (str_starts_with($mimetype, 'image/')) {
            return 'image';
        }

        if (str_starts_with($mimetype, 'video/')) {
            return 'video';
        }

        if (str_starts_with($mimetype, 'audio/')) {
            return 'audio';
        }

        return 'document';
    }

    private function buildNotificationPayload(string $phone, ?string $body, ?array $media): array
    {
        $client = $this->resolveClientByPhone($phone);
        $displayName = $client?->name ?: $phone;
        $title = 'Nuevo mensaje de ' . $displayName;

        $preview = trim((string) $body);
        $mediaKind = $media ? $this->resolveMediaKind($media) : '';
        $caption = $media ? trim((string) ($media['caption'] ?? '')) : '';
        $filename = $media ? trim((string) ($media['filename'] ?? '')) : '';

        if ($mediaKind !== '') {
            if ($mediaKind === 'image') {
                $preview = $caption !== '' ? 'Imagen: ' . $caption : 'Imagen recibida';
            } elseif ($mediaKind === 'video') {
                $preview = $caption !== '' ? 'Video: ' . $caption : 'Video recibido';
            } elseif ($mediaKind === 'audio') {
                $preview = 'Audio recibido';
            } elseif ($mediaKind === 'document') {
                $preview = $filename !== '' ? 'Archivo: ' . $filename : 'Archivo adjunto';
            }
        }

        if ($preview === '') {
            $preview = 'Mensaje de WhatsApp';
        } elseif (mb_strlen($preview) > 160) {
            $preview = mb_substr($preview, 0, 157) . '...';
        }

        return [
            'client' => $client,
            'title' => $title,
            'preview' => $preview,
            'kind' => $mediaKind,
        ];
    }

    /**
     * Bot POST: registrar un mensaje entrante de WhatsApp.
     * POST /api/chats/inbound
     */
    public function inbound(Request $request, PushNotificationService $push): JsonResponse
    {
        $data = $request->validate([
            'phone'               => ['required', 'string', 'max:20'],
            'body'                => ['nullable', 'string'],
            'whatsapp_message_id' => ['nullable', 'string', 'max:100'],
            'sent_at'             => ['nullable', 'date'],
            'metadata'            => ['nullable', 'array'],
            'media'               => ['nullable', 'array'],
            'skip_push'           => ['nullable', 'boolean'],
        ]);

        // Evitar duplicados por whatsapp_message_id
        if (! empty($data['whatsapp_message_id'])) {
            $exists = WhatsappChatMessage::where('whatsapp_message_id', $data['whatsapp_message_id'])->exists();
            if ($exists) {
                return response()->json(['ok' => true, 'duplicate' => true]);
            }
        }

        $metadata = $data['metadata'] ?? [];
        if (isset($data['media']) && is_array($data['media'])) {
            $metadata['media'] = $data['media'];
        }

        $message = WhatsappChatMessage::create([
            'phone'               => $data['phone'],
            'direction'           => 'inbound',
            'body'                => $data['body'] ?? null,
            'status'              => 'received',
            'whatsapp_message_id' => $data['whatsapp_message_id'] ?? null,
            'sent_at'             => $data['sent_at'] ?? null,
            'metadata'            => $metadata,
        ]);

        $notification = $this->buildNotificationPayload(
            (string) $data['phone'],
            $data['body'] ?? null,
            isset($data['media']) && is_array($data['media']) ? $data['media'] : null
        );

        if (! ($data['skip_push'] ?? false)) {
            $push->sendToActiveUsersWithPreference('whatsapp_incoming_messages', $notification['title'], $notification['preview'], [
                'type' => 'whatsapp_inbound_message',
                'phone' => (string) $data['phone'],
                'message_id' => (string) ($data['whatsapp_message_id'] ?? $message->whatsapp_message_id ?? ''),
                'url' => '/chats/' . rawurlencode((string) $data['phone']),
                'client_name' => (string) ($notification['client']?->name ?? ''),
                'message_kind' => (string) $notification['kind'],
            ]);
        }

        return response()->json(['ok' => true, 'id' => $message->id], 201);
    }

    /**
     * Bot POST: registrar un mensaje de salida en el historial del chat.
     * POST /api/chats/outbound
     */
    public function outbound(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone'               => ['required', 'string', 'max:20'],
            'body'                => ['nullable', 'string'],
            'whatsapp_message_id' => ['nullable', 'string', 'max:100'],
            'sent_at'             => ['nullable', 'date'],
            'metadata'            => ['nullable', 'array'],
            'media'               => ['nullable', 'array'],
            'skip_push'           => ['nullable', 'boolean'],
        ]);

        $message = null;
        if (! empty($data['whatsapp_message_id'])) {
            $message = WhatsappChatMessage::where('whatsapp_message_id', $data['whatsapp_message_id'])->first();
        }

        if (! $message) {
            $message = WhatsappChatMessage::create([
                'phone'               => $data['phone'],
                'direction'           => 'outbound',
                'body'                => $data['body'] ?? null,
                'status'              => 'sent',
                'whatsapp_message_id' => $data['whatsapp_message_id'] ?? null,
                'sent_at'             => $data['sent_at'] ?? now(),
                'metadata'            => $data['metadata'] ?? null,
            ]);
        } else {
            $message->update([
                'phone'      => $data['phone'],
                'direction'  => 'outbound',
                'body'       => $data['body'] ?? $message->body,
                'status'     => 'sent',
                'sent_at'    => $data['sent_at'] ?? $message->sent_at ?? now(),
                'metadata'   => $data['metadata'] ?? $message->metadata,
            ]);
        }

        return response()->json(['ok' => true, 'id' => $message->id], 201);
    }

    /**
     * Bot POST: marcar que el cliente solicitó ayuda y disparar notificaciones al equipo.
     * POST /api/chats/help-request
     */
    public function helpRequest(Request $request, PushNotificationService $push): JsonResponse
    {
        $data = $request->validate([
            'phone'               => ['required', 'string', 'max:20'],
            'body'                => ['nullable', 'string'],
            'whatsapp_message_id' => ['nullable', 'string', 'max:100'],
            'sent_at'             => ['nullable', 'date'],
            'metadata'            => ['nullable', 'array'],
            'source'              => ['nullable', 'string', 'max:50'],
            'skip_push'           => ['nullable', 'boolean'],
        ]);

        $message = null;
        if (! empty($data['whatsapp_message_id'])) {
            $message = WhatsappChatMessage::where('whatsapp_message_id', $data['whatsapp_message_id'])->first();
        }

        if (! $message) {
            $message = WhatsappChatMessage::firstOrCreate(
                [
                    'phone'               => $data['phone'],
                    'whatsapp_message_id' => $data['whatsapp_message_id'] ?? null,
                ],
                [
                    'direction'           => 'inbound',
                    'body'                => $data['body'] ?? null,
                    'status'              => 'received',
                    'sent_at'             => $data['sent_at'] ?? now(),
                    'metadata'            => $data['metadata'] ?? null,
                ]
            );
        }

        $metadata = array_merge((array) ($message->metadata ?? []), $data['metadata'] ?? []);
        $metadata['help_requested'] = true;
        $metadata['help_requested_at'] = now()->toIso8601String();
        $metadata['help_request_source'] = (string) ($data['source'] ?? $metadata['help_request_source'] ?? 'bot');

        $message->update([
            'metadata' => $metadata,
        ]);

        $notification = $this->buildNotificationPayload(
            (string) $data['phone'],
            $data['body'] ?? null,
            isset($metadata['media']) && is_array($metadata['media']) ? $metadata['media'] : null
        );
        $title = 'Solicitud de ayuda de ' . ($notification['client']?->name ?? (string) $data['phone']);
        $body = $notification['preview'] !== 'Mensaje de WhatsApp'
            ? $notification['preview']
            : 'El cliente solicitó ayuda en WhatsApp.';

        $sent = 0;
        if (! ($data['skip_push'] ?? false)) {
            $sent = $push->sendToActiveUsersWithPreference('whatsapp_help_requests', $title, $body, [
                'type' => 'whatsapp_help_request',
                'phone' => (string) $data['phone'],
                'message_id' => (string) ($data['whatsapp_message_id'] ?? $message->whatsapp_message_id ?? ''),
                'source' => (string) ($data['source'] ?? 'bot'),
                'url' => '/chats/' . rawurlencode((string) $data['phone']),
                'client_name' => (string) ($notification['client']?->name ?? ''),
                'message_kind' => (string) $notification['kind'],
            ]);
        }

        return response()->json([
            'ok' => true,
            'id' => $message->id,
            'notifications_sent' => $sent,
        ], 201);
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

    /**
     * Bot GET: obtener mensajes de salida pendientes para despacharlos por WhatsApp.
     * GET /api/chats/outbound-queue
     */
    public function outboundQueue(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 20);
        $limit = max(1, min($limit, 100));

        $messages = WhatsappChatMessage::query()
            ->where('direction', 'outbound')
            ->where('status', 'queued')
            ->orderBy('id')
            ->limit($limit)
            ->get(['id', 'phone', 'body', 'metadata']);

        return response()->json([
            'messages' => $messages->map(fn (WhatsappChatMessage $message) => [
                'id' => $message->id,
                'phone' => $message->phone,
                'body' => $message->body ?? '',
                'media' => is_array($message->metadata) ? ($message->metadata['media'] ?? null) : null,
            ])->values(),
        ]);
    }
}
