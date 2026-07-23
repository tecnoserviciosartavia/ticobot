<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\WhatsappChatMessage;
use App\Services\PushNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;
use Symfony\Component\HttpFoundation\Response;

class MetaWhatsAppWebhookController extends Controller
{
    public function verify(Request $request): Response
    {
        $query = $request->query();
        $mode = $query['hub_mode'] ?? $query['hub.mode'] ?? $request->query('hub_mode') ?? $request->query('hub.mode');
        $token = $query['hub_verify_token'] ?? $query['hub.verify_token'] ?? $request->query('hub_verify_token') ?? $request->query('hub.verify_token');
        $challenge = $query['hub_challenge'] ?? $query['hub.challenge'] ?? $request->query('hub_challenge') ?? $request->query('hub.challenge');

        $expectedToken = (string) env('META_WHATSAPP_VERIFY_TOKEN', '');

        if ($mode === 'subscribe' && $expectedToken !== '' && hash_equals($expectedToken, (string) $token)) {
            return response((string) $challenge, 200)->header('Content-Type', 'text/plain');
        }

        return response()->json(['ok' => false, 'error' => 'forbidden'], 403);
    }

    public function handle(Request $request, PushNotificationService $push): JsonResponse
    {
        $payload = $request->all();

        try {
            $entryList = $payload['entry'] ?? [];

            foreach ($entryList as $entry) {
                $changes = $entry['changes'] ?? [];

                foreach ($changes as $change) {
                    $value = $change['value'] ?? [];
                    $messages = $value['messages'] ?? [];

                    foreach ($messages as $message) {
                        $from = (string) ($message['from'] ?? '');
                        $messageId = (string) ($message['id'] ?? '');
                        $timestamp = isset($message['timestamp']) ? (int) $message['timestamp'] : null;
                        $type = (string) ($message['type'] ?? 'text');
                        $body = null;
                        $media = null;

                        if ($type === 'text') {
                            $body = $message['text']['body'] ?? null;
                        } elseif ($type === 'button') {
                            $body = $message['button']['text'] ?? null;
                        } elseif ($type === 'interactive') {
                            $interactive = $message['interactive'] ?? [];
                            $body = $interactive['button_reply']['title'] ?? $interactive['list_reply']['title'] ?? null;
                        } elseif ($type === 'reaction') {
                            $emoji = trim((string) data_get($message, 'reaction.emoji', ''));
                            $body = $emoji !== '' ? $emoji : null;
                        } elseif (in_array($type, ['image', 'video', 'audio', 'document', 'sticker'], true)) {
                            $media = $this->downloadMediaFromMeta($message, $type);
                            if (is_array($media)) {
                                $body = $media['caption'] ?? $body;
                            }
                        }

                        $metadata = [
                            'meta_payload' => $message,
                            'meta_status' => $value['statuses'] ?? null,
                            'meta_contacts' => $value['contacts'] ?? null,
                            'meta_message_type' => $type,
                        ];

                        if (is_array($media)) {
                            $metadata['media'] = $media;
                        }

                        if ($from !== '' && $messageId !== '') {
                            $storedMessage = WhatsappChatMessage::firstOrCreate(
                                ['whatsapp_message_id' => $messageId],
                                [
                                    'phone' => $from,
                                    'direction' => 'inbound',
                                    'body' => $body,
                                    'status' => 'received',
                                    'sent_at' => $timestamp ? now()->setTimestamp($timestamp) : now(),
                                    'metadata' => $metadata,
                                ]
                            );

                            if ($storedMessage->wasRecentlyCreated) {
                                $client = $this->resolveClientByPhone($from);
                                $preview = $this->notificationPreview($body, $media);
                                $push->sendToActiveUsersWithPreference('whatsapp_incoming_messages', 'Nuevo mensaje de '.($client?->name ?: $from), $preview, [
                                    'type' => 'whatsapp_inbound_message',
                                    'phone' => $from,
                                    'message_id' => $messageId,
                                    'url' => '/chats/'.rawurlencode($from),
                                    'client_name' => (string) ($client?->name ?? ''),
                                    'message_kind' => (string) ($media['kind'] ?? ''),
                                ]);
                            }

                            $this->forwardInboundMessageToBot([
                                'id' => $messageId,
                                'from' => $from,
                                'body' => $body,
                                'timestamp' => $timestamp,
                                'type' => $type,
                                'hasMedia' => in_array($type, ['image', 'video', 'document', 'audio', 'sticker'], true),
                                'meta' => $metadata,
                            ]);
                        }
                    }

                    $statuses = $value['statuses'] ?? [];
                    foreach ($statuses as $status) {
                        $messageId = (string) ($status['id'] ?? '');
                        $state = (string) ($status['status'] ?? '');

                        if ($messageId === '' || $state === '') {
                            continue;
                        }

                        $mappedStatus = match ($state) {
                            'sent' => 'sent',
                            'delivered' => 'delivered',
                            'read' => 'read',
                            'failed' => 'failed',
                            default => null,
                        };

                        if ($mappedStatus === null) {
                            continue;
                        }

                        WhatsappChatMessage::where('whatsapp_message_id', $messageId)->update([
                            'status' => $mappedStatus,
                        ]);
                    }
                }
            }
        } catch (Throwable $e) {
            Log::error('Meta WhatsApp webhook error', [
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json(['ok' => true]);
    }

    private function resolveClientByPhone(string $phone): ?Client
    {
        $digits = preg_replace('/\D+/', '', $phone) ?: '';
        $suffix = substr($digits, -8);

        return Client::query()->select('id', 'name', 'phone')->get()->first(
            fn (Client $client): bool => substr(preg_replace('/\D+/', '', (string) $client->phone) ?: '', -8) === $suffix
        );
    }

    private function notificationPreview(?string $body, ?array $media): string
    {
        $kind = strtolower(trim((string) ($media['kind'] ?? '')));
        $preview = trim((string) $body);

        $preview = match ($kind) {
            'image' => filled($media['caption'] ?? null) ? 'Imagen: '.trim((string) $media['caption']) : 'Imagen recibida',
            'video' => filled($media['caption'] ?? null) ? 'Video: '.trim((string) $media['caption']) : 'Video recibido',
            'audio' => 'Audio recibido',
            'document' => filled($media['filename'] ?? null) ? 'Archivo: '.trim((string) $media['filename']) : 'Archivo adjunto',
            default => $preview,
        };

        if ($preview === '') {
            return 'Mensaje de WhatsApp';
        }

        return mb_strlen($preview) > 160 ? mb_substr($preview, 0, 157).'...' : $preview;
    }

    private function downloadMediaFromMeta(array $message, string $type): ?array
    {
        $mediaNode = $message[$type] ?? null;
        if (! is_array($mediaNode)) {
            return null;
        }

        $mediaId = trim((string) ($mediaNode['id'] ?? ''));
        if ($mediaId === '') {
            return null;
        }

        $token = trim((string) config('services.whatsapp.token', ''));
        if ($token === '') {
            return null;
        }

        $version = trim((string) config('services.whatsapp.version', 'v18.0')) ?: 'v18.0';
        $baseUrl = 'https://graph.facebook.com/'.$version;

        $metadataResponse = Http::timeout(10)
            ->withToken($token)
            ->acceptJson()
            ->get($baseUrl.'/'.$mediaId);

        if (! $metadataResponse->successful()) {
            Log::warning('No se pudo obtener metadata de media de Meta WhatsApp', [
                'media_id' => $mediaId,
                'status' => $metadataResponse->status(),
            ]);
            return null;
        }

        $downloadUrl = trim((string) ($metadataResponse->json('url') ?? ''));
        if ($downloadUrl === '') {
            return null;
        }

        $fileResponse = Http::timeout(20)
            ->withToken($token)
            ->accept('*/*')
            ->get($downloadUrl);

        if (! $fileResponse->successful()) {
            Log::warning('No se pudo descargar media de Meta WhatsApp', [
                'media_id' => $mediaId,
                'status' => $fileResponse->status(),
            ]);
            return null;
        }

        $binary = $fileResponse->body();
        if ($binary === '') {
            return null;
        }

        $mimetype = trim((string) ($metadataResponse->json('mime_type') ?? $fileResponse->header('Content-Type') ?? ($mediaNode['mime_type'] ?? $mediaNode['mimetype'] ?? '')));
        $filename = trim((string) ($mediaNode['filename'] ?? $metadataResponse->json('filename') ?? ''));
        $caption = isset($mediaNode['caption']) ? trim((string) $mediaNode['caption']) : null;
        $kind = match (true) {
            str_starts_with($mimetype, 'image/') => 'image',
            str_starts_with($mimetype, 'video/') => 'video',
            str_starts_with($mimetype, 'audio/') => 'audio',
            $mimetype === 'application/pdf' => 'document',
            default => $type === 'sticker' ? 'image' : 'document',
        };

        return [
            'kind' => $kind,
            'mimetype' => $mimetype !== '' ? $mimetype : null,
            'filename' => $filename !== '' ? $filename : null,
            'data' => base64_encode($binary),
            'size' => strlen($binary),
            'caption' => $caption !== '' ? $caption : null,
            'media_id' => $mediaId,
        ];
    }

    private function forwardInboundMessageToBot(array $payload): void
    {
        $botWebhookUrl = rtrim((string) env('BOT_WEBHOOK_URL', ''), '/');
        if ($botWebhookUrl === '') {
            return;
        }

        try {
            Http::timeout(5)->post($botWebhookUrl . '/webhook/meta_inbound', $payload);
        } catch (\Throwable $e) {
            Log::warning('No se pudo reenviar el mensaje entrante de Meta al bot', [
                'error' => $e->getMessage(),
                'phone' => $payload['from'] ?? null,
            ]);
        }
    }
}
