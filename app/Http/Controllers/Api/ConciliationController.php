<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conciliation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use App\Models\Payment;
use App\Models\Reminder as ReminderModel;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ConciliationController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Conciliation::query()
            ->with(['payment.client', 'payment.contract', 'payment.receipts', 'reviewer']);

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

        if ($request->filled('reviewed_by')) {
            $query->where('reviewed_by', $request->integer('reviewed_by'));
        }

        if ($request->filled('payment_id')) {
            $query->where('payment_id', $request->integer('payment_id'));
        }

        $conciliations = $query
            ->orderByDesc('updated_at')
            ->paginate($request->integer('per_page', 15))
            ->appends($request->query());

        return response()->json($conciliations);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        // DEBUG: registrar incoming payload y usuario para ayudar a depurar problemas desde la UI
        try {
            Log::info('conciliation.store.incoming', [
                'payload' => $request->all(),
                'user_id' => Auth::id(),
                'ip' => $request->ip(),
            ]);
        } catch (\Throwable $e) {
            // no bloquear la operación si logging falla
        }

        $data = $request->validate([
            'payment_id' => ['required', 'exists:payments,id'],
            'status' => ['nullable', 'in:pending,in_review,approved,rejected'],
            'notes' => ['nullable', 'string'],
            'verified_at' => ['nullable', 'date'],
        ]);

        $existing = Conciliation::query()->where('payment_id', $data['payment_id'])->first();

        if ($existing) {
            return response()->json([
                'message' => 'La conciliación para este pago ya existe.',
            ], 422);
        }

        $conciliation = Conciliation::create([
            ...$data,
            'status' => $data['status'] ?? 'pending',
            'reviewed_by' => Auth::id(),
            'verified_at' => $data['verified_at'] ?? null,
        ]);

        $paymentStatus = match ($conciliation->status) {
            'approved' => 'verified',
            'rejected' => 'rejected',
            'in_review' => 'in_review',
            default => 'in_review',
        };

        $conciliation->payment?->update(['status' => $paymentStatus]);

        // If approved and payment contains 'months' metadata, materialize per-month payments
        if ($conciliation->status === 'approved') {
            try {
                $this->applyMonthsToReminders($conciliation, $conciliation->payment);
            } catch (\Throwable $e) {
                Log::warning('applyMonthsToReminders failed: ' . $e->getMessage(), ['conciliation_id' => $conciliation->id]);
            }
        }

        return response()->json($conciliation->load(['payment', 'reviewer']), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Conciliation $conciliation): JsonResponse
    {
        return response()->json($conciliation->load(['payment.client', 'payment.contract', 'payment.receipts', 'reviewer']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Conciliation $conciliation): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', 'required', 'in:pending,in_review,approved,rejected'],
            'notes' => ['nullable', 'string'],
            'verified_at' => ['nullable', 'date'],
            'reviewed_by' => ['nullable', 'exists:users,id'],
        ]);

        $conciliation->fill($data);

        if (isset($data['status'])) {
            $conciliation->verified_at = match ($data['status']) {
                'approved', 'rejected' => $data['verified_at'] ?? now(),
                default => $conciliation->verified_at,
            };

            match ($data['status']) {
                'approved' => $conciliation->payment?->update(['status' => 'verified']),
                'rejected' => $conciliation->payment?->update(['status' => 'rejected']),
                'pending', 'in_review' => $conciliation->payment?->update(['status' => 'in_review']),
                default => null,
            };
        }

        if (! $conciliation->reviewed_by) {
            $conciliation->reviewed_by = Auth::id();
        }

        $conciliation->save();

        return response()->json($conciliation->fresh()->load(['payment', 'reviewer']));
    }

    /**
     * If the conciliated payment carries metadata.months, create per-month verified Payment
     * records and associate them to the next N reminders (so those reminders are considered paid).
     *
     * Logic summary:
     * - Read $conciliation->payment and metadata.months
     * - Find next N reminders for the same contract/client ordered by scheduled_for
     * - For each reminder without a verified payment, create a Payment with status 'verified'
     *   linked to that reminder. Amount is computed as payment.amount / months when possible.
     */
    protected function applyMonthsToReminders(Conciliation $conciliation, ?Payment $payment): void
    {
        if (! $payment) return;

        $meta = $payment->metadata ?? [];
        $months = isset($meta['months']) ? (int) $meta['months'] : 0;
        if ($months <= 0) return;

        // Determine start date: prefer payment.paid_at, fallback to now
        $startDate = $payment->paid_at ? Carbon::parse($payment->paid_at) : Carbon::now();

        // Find candidate reminders for this client/contract from startDate onwards
        $query = ReminderModel::query()
            ->where('client_id', $payment->client_id);

        if ($payment->contract_id) {
            $query->where('contract_id', $payment->contract_id);
        }

        $reminders = $query
            ->whereDate('scheduled_for', '>=', $startDate->toDateString())
            ->orderBy('scheduled_for')
            ->get();

        if ($reminders->isEmpty()) return;

        // Compute per-month amount if possible
        $perMonth = null;
        if ($payment->amount && $months > 0) {
            try {
                $perMonth = round((float) $payment->amount / $months, 2);
            } catch (\Throwable $e) {
                $perMonth = null;
            }
        }

        // Create payments for the first N reminders that do not already have a verified payment
        $toCreate = $reminders->filter(function ($r) use (&$months) {
            if ($months <= 0) return false;
            // if reminder already has a verified payment, skip
            $hasVerified = $r->payments()->where('status', 'verified')->exists();
            if ($hasVerified) return false;
            // reserve one slot
            $months--;
            return true;
        });

        if ($toCreate->isEmpty()) return;

        DB::transaction(function () use ($toCreate, $payment, $perMonth, $conciliation) {
            foreach ($toCreate as $idx => $reminder) {
                try {
                    $payData = [
                        'client_id' => $payment->client_id,
                        'contract_id' => $payment->contract_id,
                        'reminder_id' => $reminder->id,
                        'amount' => $perMonth ?? ($payment->amount ?? 0),
                        'currency' => $payment->currency ?? 'CRC',
                        'status' => 'verified',
                        'channel' => $payment->channel ?? 'conciliation',
                        'reference' => 'conciliation:' . $conciliation->id,
                        'paid_at' => $conciliation->verified_at ?? now(),
                        'metadata' => array_merge($payment->metadata ?? [], ['source_payment_id' => $payment->id, 'source_conciliation_id' => $conciliation->id, 'month_index' => $idx + 1]),
                    ];

                    Payment::create($payData);
                } catch (\Throwable $e) {
                    Log::warning('failed creating per-month payment', ['err' => $e->getMessage(), 'reminder_id' => $reminder->id, 'payment_id' => $payment->id]);
                    // continue with next
                }
            }
        });
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Conciliation $conciliation): JsonResponse
    {
        $conciliation->delete();

        $conciliation->payment?->update(['status' => 'unverified']);

        return response()->json(status: 204);
    }
}
