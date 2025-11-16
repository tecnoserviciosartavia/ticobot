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

        // Default recurrence to contract's cycle if not provided
        $recurrence = $payload['recurrence'] ?? $contract->billing_cycle ?? null;
        if (\in_array($recurrence, ['weekly', 'biweekly', 'monthly', 'one_time'], true)) {
            $payload['recurrence'] = $recurrence;
        }

        // For monthly we retained smart scheduling based on day/time in current/next month.
        // For other recurrences, use the provided scheduled datetime as-is.
        if ($recurrence === 'monthly') {
            // Extract requested day and time
            $day = (int) $requested->day;
            $timeString = $requested->format('H:i:s');

            $now = Carbon::now();
            $year = $now->year;
            $month = $now->month;

            $daysInMonth = Carbon::create($year, $month, 1)->daysInMonth;
            $useDay = min(max(1, $day), $daysInMonth);

            $candidate = Carbon::create($year, $month, $useDay)
                ->setTimeFromTimeString($timeString);

            if ($candidate->lessThanOrEqualTo($now)) {
                $nextMonth = $now->copy()->addMonthNoOverflow();
                $daysInNext = Carbon::create($nextMonth->year, $nextMonth->month, 1)->daysInMonth;
                $useDayNext = min(max(1, $day), $daysInNext);
                $candidate = Carbon::create($nextMonth->year, $nextMonth->month, $useDayNext)
                    ->setTimeFromTimeString($timeString);
            }

            $scheduled = $candidate;
        } else {
            $scheduled = $requested;
        }

        // Ensure payload exists (may have been mutated above)
        $payload = $payload ?? ($data['payload'] ?? []);

        // Ensure the reminder payload carries the contract amount so future
        // processing doesn't depend on embedding the contract in API responses.
        if (!isset($payload['amount']) || $payload['amount'] === null) {
            $payload['amount'] = (string) $contract->amount;
        }

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

        // If the client attempted to set 'sent' we will prefer the server time
        // to avoid timezone/clock skew issues. Normalize sent_at to server
        // now() when transitioning to 'sent'.
        if (isset($data['status']) && $data['status'] === 'sent') {
            $data['sent_at'] = Carbon::now();
        }

        $reminder->update($data);

        // If this reminder was just marked as sent and it carries a recurrence
        // flag (weekly, biweekly, monthly), create the next occurrence automatically.
        $reminder->refresh();
        if (isset($data['status']) && $data['status'] === 'sent' && $previousStatus !== 'sent') {
            $recurrence = $reminder->payload['recurrence']
                ?? optional($reminder->contract)->billing_cycle
                ?? null;

            if (\in_array($recurrence, ['weekly', 'biweekly', 'monthly'], true)) {
                try {
                    $currentScheduled = Carbon::parse($reminder->scheduled_for);
                    $next = match ($recurrence) {
                        'weekly' => $currentScheduled->copy()->addDays(7),
                        'biweekly' => $currentScheduled->copy()->addDays(14),
                        'monthly' => $currentScheduled->copy()->addMonthNoOverflow(),
                        default => $currentScheduled,
                    };

                    $nextPayload = array_merge($reminder->payload ?? [], ['recurrence' => $recurrence]);
                    // Ensure next reminder keeps the contract amount
                    if (!isset($nextPayload['amount']) || $nextPayload['amount'] === null) {
                        $nextPayload['amount'] = isset($reminder->payload['amount']) ? $reminder->payload['amount'] : optional($reminder->contract)->amount;
                    }

                    Reminder::create([
                        'contract_id' => $reminder->contract_id,
                        'client_id' => $reminder->client_id,
                        'channel' => $reminder->channel,
                        'scheduled_for' => $next,
                        'status' => 'pending',
                        'payload' => $nextPayload,
                    ]);

                    // Also advance contract next_due_date if linked
                    if ($reminder->contract) {
                        $reminder->contract->forceFill([
                            'next_due_date' => $next->toDateString(),
                        ])->save();
                    }
                } catch (\Throwable $e) {
                    logger()->error('Error creando próximo recordatorio recurrente: ' . $e->getMessage());
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

    /**
     * Utility to compute next due date based on cycle from a given date.
     */
    private function computeNextFrom(Carbon $date, string $cycle): Carbon
    {
        return match ($cycle) {
            'weekly' => $date->copy()->addDays(7),
            'biweekly' => $date->copy()->addDays(14),
            'monthly' => $date->copy()->addMonthNoOverflow(),
            default => $date,
        };
    }
}
