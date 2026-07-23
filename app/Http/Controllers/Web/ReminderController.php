<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Models\ReminderMessage;
use App\Services\WhatsAppNotificationService;
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
        $recurrence = trim((string) $request->query('recurrence', ''));
        $clientQuery = trim((string) $request->query('client_query', ''));
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

        if ($recurrence !== '') {
            // Try to match payload->recurrence or fallback to contract.billing_cycle
            $query->where(function ($q) use ($recurrence) {
                $q->where('payload->recurrence', $recurrence)
                  ->orWhereHas('contract', fn ($cq) => $cq->where('billing_cycle', $recurrence));
            });
        }

        if ($clientQuery !== '') {
            $query->where(function ($q) use ($clientQuery) {
                $q->whereHas('client', function ($clientQueryBuilder) use ($clientQuery) {
                    $clientQueryBuilder
                        ->where('name', 'like', "%{$clientQuery}%")
                        ->orWhere('phone', 'like', "%{$clientQuery}%");
                })->orWhereHas('contract', function ($contractQueryBuilder) use ($clientQuery) {
                    $contractQueryBuilder->where('name', 'like', "%{$clientQuery}%");
                });
            });
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

        $statsBase = clone $query;
        $stats = [
            'total' => (clone $statsBase)->count(),
            'pending' => (clone $statsBase)->where('status', 'pending')->count(),
            'queued' => (clone $statsBase)->where('status', 'queued')->count(),
            'sent' => (clone $statsBase)->where('status', 'sent')->count(),
            'failed' => (clone $statsBase)->where('status', 'failed')->count(),
            'paid' => (clone $statsBase)->where('status', 'paid')->count(),
            'stuck_queued' => (clone $statsBase)
                ->where('status', 'queued')
                ->where('queued_at', '<=', now(config('app.timezone'))->subMinutes(30))
                ->count(),
            'overdue_open' => (clone $statsBase)
                ->whereIn('status', ['pending', 'queued', 'failed'])
                ->where('scheduled_for', '<', now(config('app.timezone')))
                ->count(),
        ];

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
                'queued_at' => $reminder->queued_at?->toIso8601String(),
                'last_attempt_at' => $reminder->last_attempt_at?->toIso8601String(),
                'acknowledged_at' => $reminder->acknowledged_at?->toIso8601String(),
                'attempts' => $reminder->attempts,
                'messages_count' => $reminder->messages_count,
                'client' => $reminder->client?->only(['id', 'name', 'phone']),
                'contract' => $reminder->contract?->only(['id', 'name', 'amount', 'currency']),
                'recurrence' => $reminder->payload['recurrence'] ?? $reminder->contract?->billing_cycle ?? null,
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

    // Supported recurrence options (hard-coded to keep UI consistent)
        $recurrences = collect(['weekly', 'biweekly', 'monthly', 'one_time']);

        return Inertia::render('Reminders/Index', [
            'reminders' => $reminders,
            'filters' => [
                'status' => $status !== '' ? $status : null,
                'channel' => $channel !== '' ? $channel : null,
                'client_query' => $clientQuery !== '' ? $clientQuery : null,
                'client_id' => $clientId,
                'contract_id' => $contractId,
                'recurrence' => $recurrence !== '' ? $recurrence : null,
                'scheduled_from' => $scheduledFrom?->toDateString(),
                'scheduled_to' => $scheduledTo?->toDateString(),
            ],
            'statuses' => $statuses,
            'channels' => $channels,
            'clients' => $clients,
            'contracts' => $contracts,
            'recurrences' => $recurrences,
            'stats' => $stats,
        ]);
    }

    public function create(Request $request): Response
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

        $prefillClientId = (int) $request->query('client_id', 0) ?: null;
        $prefillContractId = (int) $request->query('contract_id', 0) ?: null;

        if ($prefillContractId && ! $prefillClientId) {
            $prefillClientId = Contract::query()->whereKey($prefillContractId)->value('client_id');
        }

        if ($prefillClientId && $prefillContractId) {
            $belongs = Contract::query()
                ->whereKey($prefillContractId)
                ->where('client_id', $prefillClientId)
                ->exists();

            if (! $belongs) {
                $prefillContractId = null;
            }
        }

        return Inertia::render('Reminders/Create', [
            'clients' => $clients,
            'channels' => Reminder::query()->select('channel')->distinct()->pluck('channel')->filter()->values(),
            'defaultChannel' => 'whatsapp',
            'prefill' => [
                'client_id' => $prefillClientId,
                'contract_id' => $prefillContractId,
            ],
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

        // Fill default message from contract type when message not provided
        $payloadData = $payload['payload'] ?? [];
        $contract->loadMissing(['contractType', 'services']);
        $payloadData['services'] = $contract->servicesForReminderPayload();
        $servicesLabel = $contract->servicesLabelForMessaging();

        if (empty($payloadData['message'])) {
            $template = $contract->contractType->default_message ?? null;
            if ($template) {
                $replacements = [
                    '{client_name}' => $contract->client?->name ?? '',
                    '{contract_name}' => $contract->name,
                    '{amount}' => $payloadData['amount'] ?? $contract->amount,
                    '{due_date}' => $payloadData['due_date'] ?? ($contract->next_due_date?->toDateString() ?? ''),
                    '{services}' => $servicesLabel,
                ];

                $payloadData['message'] = strtr($template, $replacements);
            }
        }

        $reminder = Reminder::createOpenUnique([
            'client_id' => $payload['client_id'],
            'contract_id' => $payload['contract_id'],
            'channel' => $payload['channel'],
            'scheduled_for' => $payload['scheduled_for'],
            'status' => 'pending',
            'payload' => $payloadData,
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
                'recurrence' => $payload['recurrence'] ?? null,
            ],
            'clients' => $clients,
            'channels' => Reminder::query()->select('channel')->distinct()->pluck('channel')->filter()->values(),
        ]);
    }

    public function sendManually(Reminder $reminder, WhatsAppNotificationService $whatsApp): RedirectResponse
    {
        if (! in_array($reminder->status, ['pending', 'failed'], true)) {
            return back()->with('error', 'Solo puedes enviar manualmente recordatorios pendientes o fallidos.');
        }

        if ($reminder->channel !== 'whatsapp') {
            return back()->with('error', 'El envío manual solo está disponible para recordatorios de WhatsApp.');
        }

        $reminder->loadMissing(['client:id,name,phone', 'contract.contractType']);
        $phone = trim((string) ($reminder->client?->phone ?? ''));
        if ($phone === '') {
            return back()->with('error', 'Este recordatorio no tiene un teléfono de cliente válido.');
        }

        $message = $this->buildManualReminderMessage($reminder);
        if ($message === '') {
            return back()->with('error', 'No se pudo construir el mensaje del recordatorio.');
        }

        $sent = $whatsApp->sendTextMessage($phone, $message);
        if (! $sent) {
            return back()->with('error', 'No se pudo enviar el recordatorio manual por WhatsApp.');
        }

        $now = now(config('app.timezone'));
        $reminder->forceFill([
            'status' => 'sent',
            'sent_at' => $now,
            'queued_at' => null,
            'last_attempt_at' => $now,
            'last_resend_at' => $now,
            'attempts' => ((int) ($reminder->attempts ?? 0)) + 1,
            'response_payload' => array_merge($reminder->response_payload ?? [], [
                'manual_send' => true,
                'manual_sent_at' => $now->toIso8601String(),
                'manual_sent_by' => auth()->id(),
            ]),
        ])->save();

        $reminder->messages()->create([
            'client_id' => (int) $reminder->client_id,
            'direction' => 'outbound',
            'message_type' => 'text',
            'content' => $message,
            'metadata' => [
                'manual_send' => true,
                'sent_by_user_id' => auth()->id(),
            ],
            'sent_at' => $now,
        ]);

        return back()->with('success', 'Recordatorio enviado manualmente por WhatsApp.');
    }

    private function buildManualReminderMessage(Reminder $reminder): string
    {
        $payload = is_array($reminder->payload) ? $reminder->payload : [];
        $customMessage = trim((string) ($payload['message'] ?? ''));
        if ($customMessage !== '') {
            return $customMessage;
        }

        $clientName = trim((string) ($reminder->client?->name ?? '')) ?: 'cliente';
        $contractName = trim((string) ($reminder->contract?->name ?? '')) ?: 'su contrato';
        $amount = trim((string) ($payload['amount'] ?? $reminder->contract?->amount ?? ''));
        $dueDate = trim((string) ($payload['due_date'] ?? ($reminder->contract?->next_due_date?->toDateString() ?? '')));

        $template = $reminder->contract?->contractType?->default_message;
        if (is_string($template) && trim($template) !== '') {
            return strtr($template, [
                '{client_name}' => $clientName,
                '{contract_name}' => $contractName,
                '{amount}' => $amount,
                '{due_date}' => $dueDate,
                '{services}' => '',
            ]);
        }

        $parts = [
            "Hola {$clientName}, te compartimos un recordatorio pendiente de {$contractName}.",
        ];

        if ($amount !== '') {
            $parts[] = "Monto: {$amount}.";
        }

        if ($dueDate !== '') {
            $parts[] = "Fecha de vencimiento: {$dueDate}.";
        }

        $parts[] = 'Si ya realizaste el pago, por favor envíanos el comprobante.';

        return implode(' ', $parts);
    }

    public function retry(Reminder $reminder): RedirectResponse
    {
        if (! in_array($reminder->status, ['queued', 'failed'], true)) {
            return back()->with('error', 'Solo se pueden reintentar recordatorios en cola o fallidos.');
        }

        $responsePayload = is_array($reminder->response_payload) ? $reminder->response_payload : [];
        $responsePayload['retried_from_status'] = $reminder->status;
        $responsePayload['retried_manually_at'] = now(config('app.timezone'))->toIso8601String();
        $responsePayload['retried_manually_by'] = auth()->id();

        $reminder->forceFill([
            'status' => 'pending',
            'queued_at' => null,
            'last_attempt_at' => null,
            'response_payload' => $responsePayload,
        ])->save();

        return back()->with('success', 'Recordatorio marcado para reintento.');
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
            'scheduled_for' => ['required', 'date_format:Y-m-d', 'after_or_equal:2000-01-01'],
            'recurrence' => ['nullable', 'string', Rule::in(['weekly', 'biweekly', 'monthly', 'one_time'])],
            'message' => ['nullable', 'string'],
            'amount' => ['nullable', 'string'],
            'due_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:2000-01-01'],
        ]);

        $payload = array_filter([
            'message' => $data['message'] ?? null,
            'amount' => $data['amount'] ?? null,
            'due_date' => isset($data['due_date']) ? Carbon::parse($data['due_date'])->toDateString() : null,
        ], fn ($value) => $value !== null && $value !== '');

        // The UI submits a calendar date. The backend owns the delivery hour,
        // preventing malformed mobile timestamps (for example dates in 1970).
        $scheduled = Carbon::createFromFormat('Y-m-d', $data['scheduled_for'], config('app.timezone'))
            ->startOfDay()
            ->setTimeFromTimeString((string) config('reminders.send_time', '12:00'));
        if (!empty($data['recurrence'])) {
            $payload['recurrence'] = $data['recurrence'];
        }

        return [
            'client_id' => (int) $data['client_id'],
            'contract_id' => (int) $data['contract_id'],
            'channel' => $data['channel'],
            'scheduled_for' => $scheduled,
            'payload' => $payload,
        ];
    }
}
