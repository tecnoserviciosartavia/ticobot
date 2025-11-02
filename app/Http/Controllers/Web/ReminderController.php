<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Models\ReminderMessage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ReminderController extends Controller
{
    public function index(Request $request): Response
    {
        $status = trim((string) $request->query('status', ''));
        $channel = trim((string) $request->query('channel', ''));
        $clientId = (int) $request->query('client_id', 0) ?: null;
        $contractId = (int) $request->query('contract_id', 0) ?: null;
        $scheduledFrom = $this->parseDate($request->query('scheduled_from'));
        $scheduledTo = $this->parseDate($request->query('scheduled_to'));

        $query = Reminder::query()
            ->with(['client:id,name,phone', 'contract:id,name,amount,currency'])
            ->withCount('messages');

        if ($status !== '') {
            $query->where('status', $status);
        }

        if ($channel !== '') {
            $query->where('channel', $channel);
        }

        if ($clientId) {
            $query->where('client_id', $clientId);
        }

        if ($contractId) {
            $query->where('contract_id', $contractId);
        }

        if ($scheduledFrom) {
            $query->where('scheduled_for', '>=', $scheduledFrom);
        }

        if ($scheduledTo) {
            $query->where('scheduled_for', '<=', $scheduledTo->endOfDay());
        }

        $reminders = $query
            ->orderByDesc('scheduled_for')
            ->paginate(perPage: 15)
            ->withQueryString()
            ->through(fn (Reminder $reminder) => [
                'id' => $reminder->id,
                'status' => $reminder->status,
                'channel' => $reminder->channel,
                'scheduled_for' => $reminder->scheduled_for?->toIso8601String(),
                'sent_at' => $reminder->sent_at?->toIso8601String(),
                'acknowledged_at' => $reminder->acknowledged_at?->toIso8601String(),
                'attempts' => $reminder->attempts,
                'messages_count' => $reminder->messages_count,
                'client' => $reminder->client?->only(['id', 'name', 'phone']),
                'contract' => $reminder->contract?->only(['id', 'name', 'amount', 'currency']),
            ]);

        $statuses = Reminder::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        $channels = Reminder::query()
            ->select('channel')
            ->distinct()
            ->orderBy('channel')
            ->pluck('channel')
            ->filter()
            ->values();

        $clients = Client::query()
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        $contracts = Contract::query()
            ->select('id', 'name', 'client_id')
            ->orderBy('name')
            ->get();

        return Inertia::render('Reminders/Index', [
            'reminders' => $reminders,
            'filters' => [
                'status' => $status !== '' ? $status : null,
                'channel' => $channel !== '' ? $channel : null,
                'client_id' => $clientId,
                'contract_id' => $contractId,
                'scheduled_from' => $scheduledFrom?->toDateString(),
                'scheduled_to' => $scheduledTo?->toDateString(),
            ],
            'statuses' => $statuses,
            'channels' => $channels,
            'clients' => $clients,
            'contracts' => $contracts,
        ]);
    }

    public function create(): Response
    {
        $clients = Client::query()
            ->with(['contracts:id,client_id,name'])
            ->select('id', 'name')
            ->orderBy('name')
            ->get()
            ->map(fn (Client $client) => [
                'id' => $client->id,
                'name' => $client->name,
                'contracts' => $client->contracts->map(fn (Contract $contract) => [
                    'id' => $contract->id,
                    'name' => $contract->name,
                ])->values(),
            ])->values();

        return Inertia::render('Reminders/Create', [
            'clients' => $clients,
            'channels' => Reminder::query()->select('channel')->distinct()->pluck('channel')->filter()->values(),
            'defaultChannel' => 'whatsapp',
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $payload = $this->validatedData($request);

        $contract = Contract::query()->findOrFail($payload['contract_id']);

        if ((int) $contract->client_id !== (int) $payload['client_id']) {
            throw ValidationException::withMessages([
                'contract_id' => 'El contrato seleccionado no pertenece al cliente indicado.',
            ]);
        }

        $reminder = Reminder::create([
            'client_id' => $payload['client_id'],
            'contract_id' => $payload['contract_id'],
            'channel' => $payload['channel'],
            'scheduled_for' => $payload['scheduled_for'],
            'status' => 'pending',
            'payload' => $payload['payload'],
        ]);

        return redirect()->route('reminders.show', $reminder);
    }

    public function show(Reminder $reminder): Response
    {
        $reminder->load(['client:id,name,phone', 'contract:id,name', 'payments', 'messages']);

        $messages = $reminder->messages
            ->sortByDesc('sent_at')
            ->take(20)
            ->values()
            ->map(fn (ReminderMessage $message) => [
                'id' => $message->id,
                'direction' => $message->direction,
                'message_type' => $message->message_type,
                'content' => $message->content,
                'sent_at' => $message->sent_at?->toIso8601String(),
                'attachment' => $message->attachment_path ? [
                    'path' => $message->attachment_path,
                    'url' => Storage::url($message->attachment_path),
                ] : null,
            ]);

        $payments = $reminder->payments
            ->sortByDesc('created_at')
            ->take(10)
            ->values()
            ->map(fn (Payment $payment) => [
                'id' => $payment->id,
                'amount' => $payment->amount,
                'currency' => $payment->currency,
                'status' => $payment->status,
                'reference' => $payment->reference,
                'paid_at' => $payment->paid_at?->toDateString(),
            ]);

        return Inertia::render('Reminders/Show', [
            'reminder' => [
                'id' => $reminder->id,
                'client' => $reminder->client?->only(['id', 'name', 'phone']),
                'contract' => $reminder->contract?->only(['id', 'name']),
                'channel' => $reminder->channel,
                'status' => $reminder->status,
                'scheduled_for' => $reminder->scheduled_for?->toIso8601String(),
                'sent_at' => $reminder->sent_at?->toIso8601String(),
                'acknowledged_at' => $reminder->acknowledged_at?->toIso8601String(),
                'payload' => $reminder->payload,
                'response_payload' => $reminder->response_payload,
            ],
            'messages' => $messages,
            'payments' => $payments,
        ]);
    }

    public function edit(Reminder $reminder): Response
    {
        $clients = Client::query()
            ->with(['contracts:id,client_id,name'])
            ->select('id', 'name')
            ->orderBy('name')
            ->get()
            ->map(fn (Client $client) => [
                'id' => $client->id,
                'name' => $client->name,
                'contracts' => $client->contracts->map(fn (Contract $contract) => [
                    'id' => $contract->id,
                    'name' => $contract->name,
                ])->values(),
            ])->values();

        $payload = $reminder->payload ?? [];

        return Inertia::render('Reminders/Edit', [
            'reminder' => [
                'id' => $reminder->id,
                'client_id' => $reminder->client_id,
                'contract_id' => $reminder->contract_id,
                'channel' => $reminder->channel,
                'scheduled_for' => $reminder->scheduled_for?->toDateTimeString(),
                'status' => $reminder->status,
                'message' => $payload['message'] ?? '',
                'amount' => $payload['amount'] ?? '',
                'due_date' => $payload['due_date'] ?? '',
            ],
            'clients' => $clients,
            'channels' => Reminder::query()->select('channel')->distinct()->pluck('channel')->filter()->values(),
        ]);
    }

    public function update(Request $request, Reminder $reminder): RedirectResponse
    {
        $payload = $this->validatedData($request, $reminder);

        $contract = Contract::query()->findOrFail($payload['contract_id']);

        if ((int) $contract->client_id !== (int) $payload['client_id']) {
            throw ValidationException::withMessages([
                'contract_id' => 'El contrato seleccionado no pertenece al cliente indicado.',
            ]);
        }

        $reminder->forceFill([
            'client_id' => $payload['client_id'],
            'contract_id' => $payload['contract_id'],
            'channel' => $payload['channel'],
            'scheduled_for' => $payload['scheduled_for'],
            'payload' => $payload['payload'],
        ])->save();

        return redirect()->route('reminders.show', $reminder);
    }

    private function parseDate(?string $value): ?Carbon
    {
        if (empty($value)) {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }

    private function validatedData(Request $request, ?Reminder $reminder = null): array
    {
        $data = $request->validate([
            'client_id' => ['required', Rule::exists('clients', 'id')],
            'contract_id' => ['required', Rule::exists('contracts', 'id')],
            'channel' => ['required', 'string', 'max:50'],
            'scheduled_for' => ['required', 'date'],
            'message' => ['nullable', 'string'],
            'amount' => ['nullable', 'string'],
            'due_date' => ['nullable', 'date'],
        ]);

        $payload = array_filter([
            'message' => $data['message'] ?? null,
            'amount' => $data['amount'] ?? null,
            'due_date' => isset($data['due_date']) ? Carbon::parse($data['due_date'])->toDateString() : null,
        ], fn ($value) => $value !== null && $value !== '');

        // Normalize scheduled_for to application configured reminder send time
        $scheduled = Carbon::parse($data['scheduled_for'])
            ->setTimeFromTimeString(config('reminders.send_time', '09:00'));

        return [
            'client_id' => (int) $data['client_id'],
            'contract_id' => (int) $data['contract_id'],
            'channel' => $data['channel'],
            'scheduled_for' => $scheduled,
            'payload' => $payload,
        ];
    }
}
