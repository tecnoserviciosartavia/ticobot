<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class PaymentController extends Controller
{
    public function index(Request $request): Response
    {
        $status = trim((string) $request->query('status', ''));
        $channel = trim((string) $request->query('channel', ''));
        $paidFrom = $this->parseDate($request->query('paid_from'));
        $paidTo = $this->parseDate($request->query('paid_to'));

        $query = Payment::query()
            ->with(['client:id,name', 'contract:id,name,amount,currency', 'reminder:id,status'])
            ->withCount('receipts');

        if ($status !== '') {
            $query->where('status', $status);
        }

        if ($channel !== '') {
            $query->where('channel', $channel);
        }

        if ($paidFrom) {
            $query->whereDate('paid_at', '>=', $paidFrom);
        }

        if ($paidTo) {
            $query->whereDate('paid_at', '<=', $paidTo);
        }

        $payments = $query
            ->orderByDesc('created_at')
            ->paginate(perPage: 15)
            ->withQueryString()
            ->through(fn (Payment $payment) => [
                'id' => $payment->id,
                'status' => $payment->status,
                'channel' => $payment->channel,
                'amount' => $payment->amount,
                'currency' => $payment->currency,
                'reference' => $payment->reference,
                'paid_at' => $payment->paid_at?->toDateString(),
                'receipts_count' => $payment->receipts_count,
                'client' => $payment->client?->only(['id', 'name']),
                'contract' => $payment->contract?->only(['id', 'name', 'amount', 'currency']),
                'reminder' => $payment->reminder?->only(['id', 'status']),
                'created_at' => $payment->created_at?->toIso8601String(),
            ]);

        $statuses = Payment::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        $channels = Payment::query()
            ->select('channel')
            ->distinct()
            ->orderBy('channel')
            ->pluck('channel')
            ->filter()
            ->values();

        return Inertia::render('Payments/Index', [
            'payments' => $payments,
            'filters' => [
                'status' => $status !== '' ? $status : null,
                'channel' => $channel !== '' ? $channel : null,
                'paid_from' => $paidFrom?->toDateString(),
                'paid_to' => $paidTo?->toDateString(),
            ],
            'statuses' => $statuses,
            'channels' => $channels,
        ]);
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

    /**
     * Get contracts for a specific client (used by frontend for payment conciliation)
     */
    public function getClientContracts(Request $request)
    {
        $clientId = $request->query('client_id');
        
        if (!$clientId) {
            return response()->json(['error' => 'client_id is required'], 400);
        }

        $contracts = \App\Models\Contract::where('client_id', $clientId)
            ->select('id', 'name', 'amount', 'currency')
            ->orderBy('name')
            ->get();

        return response()->json($contracts);
    }
}
