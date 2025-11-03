<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ReminderController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Reminder::query()
            ->with(['client', 'contract'])
            ->withCount(['messages', 'payments']);

        if ($request->filled('status')) {
            $statuses = collect($request->input('status'))
                ->flatten()
                ->map(fn ($value) => trim((string) $value))
                ->filter()
                ->all();

            if ($statuses) {
                $query->whereIn('status', $statuses);
            }
        }

        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        if ($request->filled('contract_id')) {
            $query->where('contract_id', $request->integer('contract_id'));
        }

        if ($request->filled('scheduled_from')) {
            $query->where('scheduled_for', '>=', Carbon::parse($request->input('scheduled_from')));
        }

        if ($request->filled('scheduled_to')) {
            $query->where('scheduled_for', '<=', Carbon::parse($request->input('scheduled_to')));
        }

        $reminders = $query
            ->orderByDesc('scheduled_for')
            ->paginate($request->integer('per_page', 15))
            ->appends($request->query());

        return response()->json($reminders);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'contract_id' => ['required', 'exists:contracts,id'],
            'client_id' => ['required', 'exists:clients,id'],
            'channel' => ['required', 'string', 'max:50'],
            'scheduled_for' => ['required', 'date'],
            'monthly' => ['nullable', 'boolean'],
            'status' => ['nullable', 'string', 'max:50'],
            'payload' => ['nullable', 'array'],
        ]);

        $contract = Contract::query()->findOrFail($data['contract_id']);

        if ((int) $data['client_id'] !== (int) $contract->client_id) {
            throw ValidationException::withMessages([
                'client_id' => 'El cliente no coincide con el contrato proporcionado.',
            ]);
        }

        // If this reminder is marked as monthly recurrence, schedule the next
        // occurrence based only on the day-of-month and time provided by the
        // form (ignore year/month). Otherwise normalize to configured send time.
        $requested = Carbon::parse($data['scheduled_for']);
        $payload = $data['payload'] ?? [];

        if (!empty($data['monthly']) || isset($payload['recurrence']) && $payload['recurrence'] === 'monthly') {
            // Extract requested day and time
            $day = (int) $requested->day;
            $timeString = $requested->format('H:i:s');

            // compute next occurrence (this month or next) using requested day and time
            $now = Carbon::now();
            $year = $now->year;
            $month = $now->month;

            $daysInMonth = Carbon::create($year, $month, 1)->daysInMonth;
            $useDay = min(max(1, $day), $daysInMonth);

            $candidate = Carbon::create($year, $month, $useDay)
                ->setTimeFromTimeString($timeString);

            if ($candidate->lessThanOrEqualTo($now)) {
                // schedule next month
                $nextMonth = $now->copy()->addMonthNoOverflow();
                $daysInNext = Carbon::create($nextMonth->year, $nextMonth->month, 1)->daysInMonth;
                $useDayNext = min(max(1, $day), $daysInNext);
                $candidate = Carbon::create($nextMonth->year, $nextMonth->month, $useDayNext)
                    ->setTimeFromTimeString($timeString);
            }

            $scheduled = $candidate;

            // ensure payload marks recurrence so system can auto-create next one
            $payload['recurrence'] = 'monthly';
        } else {
            // Use the exact datetime provided by the caller. Do not force the
            // configured send_time so reminders are scheduled at the user
            // supplied hour.
            $scheduled = Carbon::parse($data['scheduled_for']);
        }

    // Ensure payload exists (may have been mutated above)
    $payload = $payload ?? ($data['payload'] ?? []);

        // If no custom message provided, use contract type default_message (with simple templating)
        if (empty($payload['message'])) {
            $contract->load('contractType');
            $template = $contract->contractType->default_message ?? null;
            if ($template) {
                $replacements = [
                    '{client_name}' => $contract->client?->name ?? '',
                    '{contract_name}' => $contract->name,
                    '{amount}' => isset($payload['amount']) ? $payload['amount'] : $contract->amount,
                    '{due_date}' => isset($payload['due_date']) ? $payload['due_date'] : ($contract->next_due_date?->toDateString() ?? ''),
                ];

                $payload['message'] = strtr($template, $replacements);
            }
        }

        $reminder = Reminder::create([
            ...$data,
            'scheduled_for' => $scheduled,
            'status' => $data['status'] ?? 'pending',
            'payload' => $payload,
        ]);

        return response()->json($reminder->load(['client', 'contract']), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Reminder $reminder): JsonResponse
    {
        return response()->json(
            $reminder->load([
                'client',
                'contract',
                'messages' => fn ($query) => $query->latest()->limit(25),
                'payments' => fn ($query) => $query->latest()->limit(5),
            ])
        );
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Reminder $reminder): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['sometimes', 'required', 'string', 'max:50'],
            'scheduled_for' => ['sometimes', 'required', 'date'],
            'status' => ['sometimes', 'required', 'string', 'max:50'],
            'payload' => ['nullable', 'array'],
            'response_payload' => ['nullable', 'array'],
            'queued_at' => ['nullable', 'date'],
            'sent_at' => ['nullable', 'date'],
            'acknowledged_at' => ['nullable', 'date'],
            'attempts' => ['nullable', 'integer', 'min:0'],
        ]);

        if (isset($data['scheduled_for'])) {
            // Preserve the provided scheduled datetime instead of normalizing
            // to a configured hour.
            $data['scheduled_for'] = Carbon::parse($data['scheduled_for']);
        }

        // Keep previous status to detect transitions
        $previousStatus = $reminder->status;

        $reminder->update($data);

        // If this reminder was just marked as sent and it carries a monthly
        // recurrence flag, create the next monthly occurrence automatically.
        $reminder->refresh();
        if (isset($data['status']) && $data['status'] === 'sent' && $previousStatus !== 'sent') {
            $recurrence = $reminder->payload['recurrence'] ?? null;
            if ($recurrence === 'monthly') {
                try {
                    $currentScheduled = Carbon::parse($reminder->scheduled_for);
                    // next occurrence: add month preserving day where possible
                    $next = $currentScheduled->copy()->addMonthNoOverflow();

                    Reminder::create([
                        'contract_id' => $reminder->contract_id,
                        'client_id' => $reminder->client_id,
                        'channel' => $reminder->channel,
                        'scheduled_for' => $next,
                        'status' => 'pending',
                        'payload' => $reminder->payload ?? [],
                    ]);
                } catch (\Throwable $e) {
                    logger()->error('Error creando próximo recordatorio mensual: ' . $e->getMessage());
                }
            }
        }

        return response()->json($reminder->fresh());
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Reminder $reminder): JsonResponse
    {
        $reminder->delete();

        return response()->json(status: 204);
    }

    public function pending(Request $request): JsonResponse
    {
        $lookAheadMinutes = max(1, $request->integer('look_ahead', 30));
        $limit = min(100, max(1, $request->integer('limit', 25)));

        $deadline = Carbon::now()->addMinutes($lookAheadMinutes);

        $reminders = Reminder::query()
            ->whereIn('status', ['pending', 'queued'])
            ->where('scheduled_for', '<=', $deadline)
            ->orderBy('scheduled_for')
            ->limit($limit)
            ->with(['client', 'contract'])
            ->get();

        return response()->json($reminders);
    }

    public function acknowledge(Request $request, Reminder $reminder): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', 'string', 'max:50'],
            'response_payload' => ['nullable', 'array'],
            'acknowledged_at' => ['nullable', 'date'],
        ]);

        $acknowledgedAt = isset($data['acknowledged_at'])
            ? Carbon::parse($data['acknowledged_at'])
            : Carbon::now();

        $reminder->forceFill([
            'status' => $data['status'] ?? 'acknowledged',
            'acknowledged_at' => $acknowledgedAt,
            'response_payload' => array_merge($reminder->response_payload ?? [], $data['response_payload'] ?? []),
        ])->save();

        return response()->json($reminder->fresh());
    }
}
