<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\WhatsappChatMessage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ChatController extends Controller
{
    private function normalizePhone(string $phone): string
    {
        return WhatsappChatMessage::normalizePhone($phone);
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

    private function clientsByPhone(Collection $phones): Collection
    {
        $clients = Client::query()
            ->select('id', 'name', 'phone')
            ->get();

        $lookup = collect();
        foreach ($clients as $client) {
            foreach ($this->phoneLookupKeys((string) $client->phone) as $key) {
                $lookup->put($key, $client);
            }
        }

        return $lookup;
    }

    private function resolveClientByPhone(Collection $clients, string $phone): ?Client
    {
        foreach ($this->phoneLookupKeys($phone) as $key) {
            $client = $clients->get($key);
            if ($client instanceof Client) {
                return $client;
            }
        }

        return null;
    }

    private function conversations(): Collection
    {
        // Mostrar el historial completo. La ventana de 24 horas solo controla
        // si se puede responder con texto libre, no la visibilidad del chat.
        $conversations = WhatsappChatMessage::latestPerPhone(false);
        $clients = $this->clientsByPhone($conversations->pluck('phone'));

        return $conversations->map(function (array $row) use ($clients) {
            $client = $this->resolveClientByPhone($clients, (string) $row['phone']);

            return [
                'phone' => $row['phone'],
                'client_name' => $client?->name,
                'client_id' => $client?->id,
                'last_body' => $row['last_body'],
                'last_direction' => $row['last_direction'],
                'last_message_at' => $row['last_message_at'],
                'unread_count' => (int) $row['unread_count'],
                'is_service_window_open' => (bool) $row['is_service_window_open'],
                'service_window_expires_at' => $row['service_window_expires_at'],
                'last_inbound_at' => $row['last_inbound_at'],
            ];
        });
    }

    public function index(): Response
    {
        return Inertia::render('Chats/Index', [
            'conversations' => $this->conversations()->values(),
        ]);
    }

    public function create(Request $request): Response
    {
        $phone = $this->normalizePhone((string) $request->query('phone', ''));
        $client = null;

        if ($phone !== '') {
            $client = $this->resolveClientByPhone($this->clientsByPhone(collect([$phone])), $phone);
        }

        return Inertia::render('Chats/Create', [
            'initialPhone' => $phone,
            'client' => $client ? [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
            ] : null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'body' => ['required', 'string', 'max:4096'],
        ]);

        $phone = $this->normalizePhone($data['phone']);
        $body = trim((string) $data['body']);

        if ($phone === '') {
            throw ValidationException::withMessages([
                'phone' => 'Ingresá un número válido.',
            ]);
        }

        if ($body === '') {
            throw ValidationException::withMessages([
                'body' => 'Escribí un mensaje antes de guardar.',
            ]);
        }

        WhatsappChatMessage::create([
            'phone' => $phone,
            'direction' => 'outbound',
            'body' => $body,
            'status' => 'queued',
            'sent_by_user_id' => $request->user()->id,
            'sent_at' => null,
            'metadata' => [
                'source' => 'manual-compose',
                'origin' => 'chats.create',
            ],
        ]);

        return redirect()->route('chats.show', $phone)->with('success', 'Mensaje nuevo en cola para enviar.');
    }

    public function show(string $phone): Response
    {
        $phone = $this->normalizePhone($phone);

        WhatsappChatMessage::query()
            ->where('phone', $phone)
            ->where('direction', 'inbound')
            ->where('status', 'received')
            ->update(['status' => 'read']);

        $messages = WhatsappChatMessage::where('phone', $phone)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'phone', 'direction', 'body', 'status', 'whatsapp_message_id', 'sent_by_user_id', 'sent_at', 'created_at', 'metadata'])
            ->map(fn (WhatsappChatMessage $message) => [
                'id' => $message->id,
                'phone' => $message->phone,
                'direction' => $message->direction,
                'body' => $message->body,
                'status' => $message->status,
                'whatsapp_message_id' => $message->whatsapp_message_id,
                'sent_by_user_id' => $message->sent_by_user_id,
                'sent_at' => $message->sent_at?->toIso8601String(),
                'created_at' => $message->created_at?->toIso8601String(),
                'metadata' => $message->metadata ?? [],
                'media' => $this->normalizeMedia($message->metadata ?? []),
                // La UI móvil necesita un valor estable para no dejar el hilo en estado nulo.
                'visibility' => 'visible',
                'is_visible' => true,
            ]);

        $conversation = WhatsappChatMessage::conversationSummaryForPhone($phone);
        $clients = $this->clientsByPhone(collect([$phone]));
        $client = $this->resolveClientByPhone($clients, $phone);
        $conversations = $this->conversations();
        $sentCount = $messages->where('direction', 'outbound')->count();
        $receivedCount = $messages->where('direction', 'inbound')->count();
        $unreadCount = $messages->where('direction', 'inbound')->where('status', 'received')->count();

        return Inertia::render('Chats/Show', [
            'phone' => $phone,
            'client' => $client,
            'messages' => $messages->values(),
            'conversations' => $conversations->values(),
            'sentCount' => $sentCount,
            'receivedCount' => $receivedCount,
            'unreadCount' => $unreadCount,
            'replyAllowed' => (bool) ($conversation['is_service_window_open'] ?? false),
            'serviceWindowExpiresAt' => $conversation['service_window_expires_at'] ?? null,
        ]);
    }


    private function normalizeMedia(array $metadata): ?array
    {
        $media = $metadata['media'] ?? null;

        if (! is_array($media)) {
            return null;
        }

        $mimetype = isset($media['mimetype']) ? trim((string) $media['mimetype']) : '';
        $filename = isset($media['filename']) ? trim((string) $media['filename']) : '';
        $data = isset($media['data']) ? trim((string) $media['data']) : '';

        if ($mimetype === '' || $data === '') {
            return null;
        }

        $kind = isset($media['kind']) ? trim((string) $media['kind']) : '';
        if ($kind === '') {
            $kind = str_starts_with($mimetype, 'image/') ? 'image' : (str_starts_with($mimetype, 'video/') ? 'video' : (str_starts_with($mimetype, 'audio/') ? 'audio' : 'document'));
        }

        return [
            'kind' => $kind,
            'mimetype' => $mimetype,
            'filename' => $filename !== '' ? $filename : null,
            'data' => $data,
            'size' => isset($media['size']) && is_numeric($media['size']) ? (int) $media['size'] : null,
            'caption' => isset($media['caption']) ? trim((string) $media['caption']) : null,
        ];
    }

    public function markSelectedAsRead(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'phones' => ['required', 'array', 'min:1'],
            'phones.*' => ['required', 'string', 'max:20'],
        ]);

        $phones = array_values(array_unique($data['phones']));

        $updated = WhatsappChatMessage::query()
            ->whereIn('phone', $phones)
            ->where('direction', 'inbound')
            ->where('status', 'received')
            ->update(['status' => 'read']);

        return back()->with('success', $updated > 0
            ? "Se marcaron {$updated} mensajes como leídos."
            : 'No había mensajes pendientes por leer.');
    }

    public function reply(Request $request, string $phone): RedirectResponse
    {
        $phone = $this->normalizePhone($phone);

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:4096', 'required_without:attachment'],
            'attachment' => [
                'nullable',
                'file',
                'max:10240',
                'mimetypes:image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'required_without:body',
            ],
        ]);

        $conversation = WhatsappChatMessage::conversationSummaryForPhone($phone);
        if (! $conversation || ! ($conversation['is_service_window_open'] ?? false)) {
            throw ValidationException::withMessages([
                'body' => 'La ventana de WhatsApp de 24 horas ya expiró. Esperá un nuevo mensaje del cliente para responder sin plantilla.',
            ]);
        }

        $body = trim((string) ($data['body'] ?? ''));
        $attachment = $request->file('attachment');
        $metadata = null;

        if ($attachment instanceof UploadedFile) {
            $mimetype = $attachment->getMimeType() ?: $attachment->getClientMimeType() ?: 'application/octet-stream';
            $contents = file_get_contents($attachment->getRealPath());

            if ($contents === false) {
                throw ValidationException::withMessages([
                    'attachment' => 'No se pudo leer el archivo seleccionado.',
                ]);
            }

            $metadata = [
                'source' => 'manual-reply',
                'media' => [
                    'kind' => str_starts_with($mimetype, 'image/') ? 'image' : 'document',
                    'mimetype' => $mimetype,
                    'filename' => $attachment->getClientOriginalName(),
                    'data' => base64_encode($contents),
                    'size' => $attachment->getSize(),
                    'caption' => $body !== '' ? $body : null,
                ],
            ];
        }

        WhatsappChatMessage::create([
            'phone' => $phone,
            'direction' => 'outbound',
            'body' => $body !== '' ? $body : null,
            'status' => 'queued',
            'sent_by_user_id' => $request->user()->id,
            'sent_at' => null,
            'metadata' => $metadata,
        ]);

        return back()->with('success', $attachment ? 'Archivo en cola para enviar.' : 'Mensaje en cola para enviar.');
    }

    public function destroy(string $phone): RedirectResponse
    {
        $phone = $this->normalizePhone($phone);
        WhatsappChatMessage::query()->where('phone', $phone)->delete();

        return redirect()->route('chats.index')->with('success', 'Conversación eliminada. El cliente y sus datos se conservaron.');
    }
}
