<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Conciliation;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ConciliationController extends Controller
{
    public function index(Request $request): Response
    {
        $status = trim((string) $request->query('status', ''));

        $query = Conciliation::query()
            ->with([
                'payment.client:id,name',
                'payment.contract:id,name',
                'payment' => fn ($paymentQuery) => $paymentQuery->withCount('receipts'),
                'reviewer:id,name',
            ]);

        if ($status !== '') {
            $query->where('status', $status);
        }

        $conciliations = $query
            ->orderByDesc('updated_at')
            ->paginate(perPage: 15)
            ->withQueryString()
            ->through(fn (Conciliation $conciliation) => [
                'id' => $conciliation->id,
                'status' => $conciliation->status,
                'notes' => $conciliation->notes,
                'verified_at' => $conciliation->verified_at?->toIso8601String(),
                'updated_at' => $conciliation->updated_at?->toIso8601String(),
                'payment' => [
                    'id' => $conciliation->payment?->id,
                    'amount' => $conciliation->payment?->amount,
                    'currency' => $conciliation->payment?->currency,
                    'status' => $conciliation->payment?->status,
                    'reference' => $conciliation->payment?->reference,
                    'receipts_count' => $conciliation->payment?->receipts_count,
                    'client' => $conciliation->payment?->client?->only(['id', 'name']),
                    'contract' => $conciliation->payment?->contract?->only(['id', 'name']),
                ],
                'reviewer' => $conciliation->reviewer?->only(['id', 'name']),
            ]);

        $statuses = Conciliation::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        return Inertia::render('Conciliations/Index', [
            'conciliations' => $conciliations,
            'filters' => [
                'status' => $status !== '' ? $status : null,
            ],
            'statuses' => $statuses,
        ]);
    }
}
