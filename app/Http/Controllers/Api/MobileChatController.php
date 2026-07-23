<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Setting;
use App\Models\WhatsappChatMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileChatController extends Controller
{
    private const QUICK_REPLIES_KEY = 'mobile_quick_replies';

    public function index(): JsonResponse
    {
        $clients = Client::query()->get(['name', 'phone'])->keyBy(
            fn (Client $client) => preg_replace('/\D+/', '', (string) $client->phone)
        );

        // La app muestra el mismo historial completo que la web; la ventana de servicio
        // limita las respuestas, no la visibilidad del chat.
        $conversations = WhatsappChatMessage::latestPerPhone(false)->map(function (array $item) use ($clients) {
            $phone = preg_replace('/\D+/', '', (string) $item['phone']);
            $client = $clients->get($phone) ?? $clients->first(
                fn (Client $candidate, string $candidatePhone) => str_ends_with($candidatePhone, substr($phone, -8))
            );

            return array_merge($item, ['client_name' => $client?->name]);
        });

        return response()->json(['data' => $conversations->values()]);
    }

    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'body' => ['required', 'string', 'max:4096'],
        ]);
        $phone = WhatsappChatMessage::normalizePhone($data['phone']);
        abort_if(strlen($phone) < 8, 422, 'Ingresá un número de teléfono válido.');

        $message = WhatsappChatMessage::create([
            'phone' => $phone,
            'direction' => 'outbound',
            'body' => trim($data['body']),
            'status' => 'queued',
            'sent_by_user_id' => $request->user()->id,
            'metadata' => ['source' => 'android-app', 'conversation_started_by_agent' => true],
        ]);

        $client = Client::query()->get(['name', 'phone'])->first(
            fn (Client $candidate) => str_ends_with(
                preg_replace('/\D+/', '', (string) $candidate->phone),
                substr($phone, -8)
            )
        );

        return response()->json(['data' => [
            'phone' => $phone,
            'client_name' => $client?->name,
            'last_body' => $message->body,
            'last_message_id' => $message->id,
            'last_message_at' => $message->created_at?->toIso8601String(),
            'unread_count' => 0,
        ]], 201);
    }

    public function quickReplies(): JsonResponse
    {
        $replies = [];
        $paymentContact = trim((string) Setting::get('payment_contact', ''));
        $bankAccounts = trim((string) Setting::get('bank_accounts', ''));
        $beneficiary = trim((string) Setting::get('beneficiary_name', ''));

        if ($paymentContact !== '' || $bankAccounts !== '') {
            $lines = ['Podés realizar el pago mediante las siguientes opciones:'];
            if ($paymentContact !== '') {
                $lines[] = "SINPE Móvil: {$paymentContact}";
            }
            if ($bankAccounts !== '') {
                $lines[] = $bankAccounts;
            }
            if ($beneficiary !== '') {
                $lines[] = "A nombre de: {$beneficiary}";
            }
            $lines[] = 'Por favor enviá el comprobante cuando realicés el pago.';
            $replies[] = ['id' => 'payment_accounts', 'title' => 'Números de cuenta', 'body' => implode("\n", $lines), 'built_in' => true];
        }

        $replies[] = [
            'id' => 'not_continuing',
            'title' => 'No desea continuar',
            'body' => 'Entendemos que no deseás continuar con el servicio. Gracias por haber confiado en nosotros. Si más adelante necesitás ayuda, con gusto estaremos disponibles.',
            'built_in' => true,
        ];

        $custom = json_decode((string) Setting::get(self::QUICK_REPLIES_KEY, '[]'), true);
        if (is_array($custom)) {
            foreach ($custom as $index => $reply) {
                if (is_array($reply) && trim((string) ($reply['title'] ?? '')) !== '' && trim((string) ($reply['body'] ?? '')) !== '') {
                    $replies[] = [
                        'id' => 'custom_' . $index,
                        'title' => trim((string) $reply['title']),
                        'body' => trim((string) $reply['body']),
                        'built_in' => false,
                    ];
                }
            }
        }

        return response()->json(['data' => $replies]);
    }

    public function storeQuickReply(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:80'],
            'body' => ['required', 'string', 'max:4096'],
        ]);
        $custom = json_decode((string) Setting::get(self::QUICK_REPLIES_KEY, '[]'), true);
        $custom = is_array($custom) ? array_values($custom) : [];
        abort_if(count($custom) >= 30, 422, 'Ya alcanzaste el máximo de 30 respuestas rápidas.');
        $custom[] = ['title' => trim($data['title']), 'body' => trim($data['body'])];
        Setting::set(self::QUICK_REPLIES_KEY, json_encode($custom, JSON_UNESCAPED_UNICODE), 'Respuestas rápidas personalizadas del chat móvil');

        return $this->quickReplies();
    }

    public function show(string $phone): JsonResponse
    {
        $normalizedPhone = WhatsappChatMessage::normalizePhone($phone);

        WhatsappChatMessage::query()
            ->where('phone', $normalizedPhone)
            ->where('direction', 'inbound')
            ->where('status', 'received')
            ->update(['status' => 'read']);

        $messages = WhatsappChatMessage::query()
            ->where('phone', $normalizedPhone)
            ->orderByDesc('id')
            ->limit(100)
            ->get()
            ->sortBy('id')
            ->values()
            ->map(fn (WhatsappChatMessage $message) => [
                'id' => $message->id,
                'direction' => $message->direction,
                'body' => $message->body,
                'status' => $message->status,
                'whatsapp_message_id' => $message->whatsapp_message_id,
                // La hora visible debe coincidir con la web. sent_at histórico
                // puede contener una zona equivocada, por eso usamos created_at.
                'sent_at' => $message->created_at?->toIso8601String(),
                'media' => $message->metadata['media'] ?? null,
                'reaction' => data_get($message->metadata, 'meta_payload.reaction'),
            ]);

        return response()->json(['data' => $messages]);
    }

    public function store(Request $request, string $phone): JsonResponse
    {
        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:4096', 'required_without_all:image_data,file_data'],
            'image_data' => ['nullable', 'string', 'required_without_all:body,file_data'],
            'image_mimetype' => ['nullable', 'required_with:image_data', 'string', 'in:image/jpeg,image/png,image/webp,image/gif'],
            'image_filename' => ['nullable', 'string', 'max:255'],
            'file_data' => ['nullable', 'string', 'required_without_all:body,image_data'],
            'file_mimetype' => ['nullable', 'required_with:file_data', 'string', 'in:application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            'file_filename' => ['nullable', 'required_with:file_data', 'string', 'max:255'],
        ]);
        $normalizedPhone = WhatsappChatMessage::normalizePhone($phone);
        $conversation = WhatsappChatMessage::conversationSummaryForPhone($normalizedPhone);

        abort_unless(
            $conversation && (($conversation['is_service_window_open'] ?? false)
                || WhatsappChatMessage::isAssignedToAgent($normalizedPhone)
                || WhatsappChatMessage::hasRecentPlatformMessage($normalizedPhone)),
            422,
            'La ventana de respuesta de WhatsApp expiró.'
        );

        $body = trim((string) ($data['body'] ?? ''));
        $metadata = null;
        $mediaData = $data['image_data'] ?? $data['file_data'] ?? null;
        if (! empty($mediaData)) {
            $isImage = ! empty($data['image_data']);
            $binary = base64_decode((string) $mediaData, true);
            if ($binary === false || strlen($binary) > 10 * 1024 * 1024) {
                abort(422, 'El archivo no es válido o supera el límite de 10 MB.');
            }
            $metadata = ['source' => 'android-app', 'media' => [
                'kind' => $isImage ? 'image' : 'document',
                'mimetype' => $isImage ? $data['image_mimetype'] : $data['file_mimetype'],
                'filename' => $isImage ? ($data['image_filename'] ?? 'imagen.jpg') : $data['file_filename'],
                'data' => $mediaData,
                'size' => strlen($binary),
                'caption' => $body !== '' ? $body : null,
            ]];
        }

        $message = WhatsappChatMessage::create([
            'phone' => $normalizedPhone,
            'direction' => 'outbound',
            'body' => $body !== '' ? $body : null,
            'status' => 'queued',
            'sent_by_user_id' => $request->user()->id,
            'metadata' => $metadata,
        ]);

        return response()->json(['data' => $message], 201);
    }

    public function destroy(string $phone): JsonResponse
    {
        $normalizedPhone = WhatsappChatMessage::normalizePhone($phone);
        $deleted = WhatsappChatMessage::query()->where('phone', $normalizedPhone)->delete();

        return response()->json(['ok' => true, 'deleted_messages' => $deleted]);
    }
}
