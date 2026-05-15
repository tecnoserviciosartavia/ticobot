<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Services\PaymentSettlementService;
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
            ->with(['client:id,name', 'contract:id,name,amount,currency', 'reminder:id,status', 'conciliation:id,payment_id'])
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
                'has_conciliation' => $payment->conciliation !== null,
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
     * Show the form for creating a new payment.
     */
    public function create(Request $request): Response
    {
        $clients = \App\Models\Client::query()
            ->select('id', 'name', 'phone')
            ->orderBy('name')
            ->get();

        $channels = Payment::query()
            ->select('channel')
            ->distinct()
            ->orderBy('channel')
            ->pluck('channel')
            ->filter()
            ->values();

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

        return Inertia::render('Payments/Create', [
            'clients' => $clients,
            'channels' => $channels->isEmpty() ? ['sinpe', 'transferencia', 'efectivo', 'manual'] : $channels,
            'prefill' => [
                'client_id' => $prefillClientId,
                'contract_id' => $prefillContractId,
            ],
        ]);
    }

    /**
     * Store a newly created payment in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', 'string', 'in:CRC,USD'],
            'channel' => ['required', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:255'],
            'status' => ['required', 'string', 'in:unverified,verified,pending,rejected'],
            'paid_at' => ['nullable', 'date'],
            'billing_month' => ['nullable', 'date_format:Y-m'],
            'grace_months' => ['nullable', 'integer', 'min:0', 'max:12'],
            'covered_months' => ['nullable', 'array'],
            'covered_months.*' => ['required', 'date_format:Y-m'],
        ]);

        $contract = null;
        if (!empty($validated['contract_id'])) {
            $contract = Contract::query()->find($validated['contract_id']);

            if ($contract && (int) $contract->client_id !== (int) $validated['client_id']) {
                return back()->withErrors([
                    'contract_id' => 'El contrato no pertenece al cliente seleccionado.',
                ])->withInput();
            }
        }

        $isMonthlyContract = $contract?->billing_cycle === 'monthly';

        $coveredMonthsInput = $validated['covered_months'] ?? [];
        unset($validated['covered_months']);

        if (! is_array($coveredMonthsInput)) {
            $coveredMonthsInput = [];
        }

        $coveredMonthsInput = array_values(array_unique(array_filter($coveredMonthsInput, fn ($v) => is_string($v) && preg_match('/^\d{4}-\d{2}$/', $v) === 1)));
        sort($coveredMonthsInput);

        // Add metadata to track manual creation
        $paidForMonth = $isMonthlyContract
            ? ($validated['billing_month']
                ?? Carbon::parse($validated['paid_at'] ?? now(), config('app.timezone'))->format('Y-m'))
            : null;

        if ($isMonthlyContract && $coveredMonthsInput === [] && is_string($paidForMonth) && preg_match('/^\d{4}-\d{2}$/', $paidForMonth) === 1) {
            $coveredMonthsInput = [$paidForMonth];
        }

        $validated['metadata'] = [
            'created_manually' => true,
            'created_by' => auth()->id(),
            'created_at' => now()->toIso8601String(),
            'grace_months' => (int) ($validated['grace_months'] ?? 0),
        ];

        if ($isMonthlyContract && $coveredMonthsInput !== []) {
            $validated['metadata']['covered_months'] = $coveredMonthsInput;
            $validated['metadata']['paid_for_month'] = $coveredMonthsInput[0];
            $validated['billing_month'] = $coveredMonthsInput[0];
        } elseif ($paidForMonth !== null) {
            $validated['metadata']['paid_for_month'] = $paidForMonth;
        }

        // Set paid_at to now if not provided
        if (empty($validated['paid_at'])) {
            $validated['paid_at'] = now();
        }

        $payment = Payment::create($validated);
        
        // Load relationships
        $payment->load(['client', 'contract']);

        // Auto-create conciliation if payment is verified
        if ($validated['status'] === 'verified') {
            // Detener envíos/reenvíos: liquidar recordatorios relacionados
            app(PaymentSettlementService::class)->settleVerifiedPayment($payment);

            $conciliation = \App\Models\Conciliation::create([
                'payment_id' => $payment->id,
                'contract_id' => $validated['contract_id'] ?? null,
                'amount' => $validated['amount'],
                'currency' => $validated['currency'],
                'status' => 'verified',
                'conciliated_at' => now(),
                'notes' => 'Conciliación automática - Pago manual verificado',
                'metadata' => [
                    'auto_conciliated' => true,
                    'conciliated_by' => auth()->id(),
                ],
            ]);

            // Generate and send PDF receipt via WhatsApp
            try {
                $pdfService = app(\App\Services\ConciliationPdfService::class);
                $whatsappService = app(\App\Services\WhatsAppNotificationService::class);
                
                $months = $pdfService->calculateMonthsFromPayment($payment);
                $graceMonths = (int) ($validated['grace_months'] ?? 0);

                $pdfPath = $pdfService->generateConciliationReceipt($payment, max(1, $months));

                $message = $pdfService->generateWhatsAppMessage($payment, max(1, $months));

                $sent = $whatsappService->sendManualPaymentReceipt($payment, $pdfPath, $message);

                if ($sent) {
                    \Log::info('Recibo de pago manual enviado por WhatsApp', [
                        'payment_id' => $payment->id,
                        'conciliation_id' => $conciliation->id,
                        'months_paid' => $months,
                        'grace_months' => $graceMonths,
                    ]);
                }
            } catch (\Exception $e) {
                \Log::error('Error al generar/enviar recibo de pago manual', [
                    'payment_id' => $payment->id,
                    'error' => $e->getMessage(),
                ]);
                // No detenemos el proceso aunque falle el envío
            }
        }

        // Build success message
        $successMessage = 'Pago creado correctamente.';
        if ($validated['status'] === 'verified') {
            $successMessage .= ' Recibo enviado por WhatsApp.';
        }

        return redirect()
            ->route('payments.index')
            ->with('success', $successMessage);
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
            ->select('id', 'name', 'amount', 'currency', 'billing_cycle')
            ->orderBy('name')
            ->get();

        return response()->json($contracts);
    }

    /**
     * Remove the specified payment.
     * Only allows deletion if payment is not conciliated.
     */
    public function destroy(Payment $payment)
    {
        // Check if payment has a conciliation
        if ($payment->conciliation()->exists()) {
            return back()->with('error', 'No se puede eliminar un pago que ya tiene una conciliación. Primero elimina la conciliación.');
        }

        // Delete associated receipts first
        $payment->receipts()->delete();

        // Delete the payment
        $payment->delete();

        return redirect()->route('payments.index')->with('success', 'Pago eliminado correctamente.');
    }
}
