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
            'status' => ['nullable', 'string', 'max:50'],
            'payload' => ['nullable', 'array'],
        ]);

        $contract = Contract::query()->findOrFail($data['contract_id']);

        if ((int) $data['client_id'] !== (int) $contract->client_id) {
            throw ValidationException::withMessages([
                'client_id' => 'El cliente no coincide con el contrato proporcionado.',
            ]);
        }

        $reminder = Reminder::create([
            ...$data,
            'status' => $data['status'] ?? 'pending',
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

        $reminder->update($data);

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
