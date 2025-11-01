<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conciliation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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
     * Remove the specified resource from storage.
     */
    public function destroy(Conciliation $conciliation): JsonResponse
    {
        $conciliation->delete();

        $conciliation->payment?->update(['status' => 'unverified']);

        return response()->json(status: 204);
    }
}
