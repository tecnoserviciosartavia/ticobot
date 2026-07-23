<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Service;
use App\Services\ContractService;
use App\Services\ContractImportService;
use App\Services\ContractNotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class OptimizedContractController extends Controller
{
    protected ContractService $contractService;
    protected ContractImportService $importService;
    protected ContractNotificationService $notificationService;

    public function __construct(
        ContractService $contractService,
        ContractImportService $importService,
        ContractNotificationService $notificationService
    ) {
        $this->contractService = $contractService;
        $this->importService = $importService;
        $this->notificationService = $notificationService;
    }

    /**
     * Display a listing of contracts with optimized queries
     */
    public function index(Request $request): Response
    {
        $clientQuery = trim((string) $request->query('client_query', ''));
        $billingCycle = trim((string) $request->query('billing_cycle', ''));

        $query = Contract::query()
            ->with(['client:id,name,phone'])  // Optimized: only select needed columns
            ->withCount(['reminders', 'payments']);

        if ($clientQuery !== '') {
            // Optimized: use join instead of whereHas to avoid subquery
            $query->join('clients', 'contracts.client_id', '=', 'clients.id')
                ->where('clients.name', 'like', "%{$clientQuery}%")
                ->select('contracts.*');  // Ensure we only get contract columns
        }

        if ($billingCycle !== '') {
            $query->where('contracts.billing_cycle', $billingCycle);
        }

        $contracts = $query
            ->orderByDesc('contracts.updated_at')
            ->paginate(15)
            ->withQueryString()
            ->through(fn (Contract $contract) => [
                'id' => $contract->id,
                'name' => $contract->name,
                'amount' => $contract->amount,
                'currency' => $contract->currency,
                'billing_cycle' => $contract->billing_cycle,
                'next_due_date' => $contract->next_due_date?->toDateString(),
                'client' => $contract->client?->only(['id', 'name', 'phone']),
                'reminders_count' => $contract->reminders_count,
                'payments_count' => $contract->payments_count,
                'updated_at' => $contract->updated_at?->toIso8601String(),
            ]);

        // Optimized: get clients and billing cycles in single queries
        $clients = Client::query()
            ->select('id', 'name', 'phone')
            ->orderBy('name')
            ->get();

        $billingCycles = Contract::query()
            ->select('billing_cycle')
            ->distinct()
            ->orderBy('billing_cycle')
            ->pluck('billing_cycle')
            ->filter()
            ->values();

        return Inertia::render('Contracts/Index', [
            'contracts' => $contracts,
            'filters' => [
                'client_query' => $clientQuery !== '' ? $clientQuery : null,
                'client_id' => null,
                'billing_cycle' => $billingCycle !== '' ? $billingCycle : null,
            ],
            'clients' => $clients,
            'billingCycles' => $billingCycles,
        ]);
    }

    /**
     * Show contract details with optimized eager loading
     */
    public function show(Contract $contract): Response
    {
        // Optimized: load all related data in single queries
        $contract->load([
            'client:id,name,email,phone',
            'services:id,name,price,currency,account_email,password,pin',
            'reminders' => function ($query) {
                $query->latest('scheduled_for')
                    ->limit(10)
                    ->select('id', 'contract_id', 'status', 'scheduled_for', 'sent_at', 'acknowledged_at', 'attempts');
            },
            'payments' => function ($query) {
                $query->latest('created_at')
                    ->limit(10)
                    ->with('conciliation:id,status')
                    ->select('id', 'contract_id', 'amount', 'currency', 'status', 'reference', 'paid_at', 'conciliation_id');
            }
        ]);

        // Transform data to minimize payload
        $reminders = $contract->reminders->map(fn ($reminder) => [
            'id' => $reminder->id,
            'status' => $reminder->status,
            'scheduled_for' => $reminder->scheduled_for?->toIso8601String(),
            'sent_at' => $reminder->sent_at?->toIso8601String(),
            'acknowledged_at' => $reminder->acknowledged_at?->toIso8601String(),
            'attempts' => $reminder->attempts,
        ]);

        $payments = $contract->payments->map(fn ($payment) => [
            'id' => $payment->id,
            'amount' => $payment->amount,
            'currency' => $payment->currency,
            'status' => $payment->status,
            'reference' => $payment->reference,
            'paid_at' => $payment->paid_at?->toDateString(),
            'conciliation_status' => $payment->conciliation?->status,
        ]);

        return Inertia::render('Contracts/Show', [
            'contract' => [
                'id' => $contract->id,
                'client' => $contract->client?->only(['id', 'name', 'email', 'phone']),
                'name' => $contract->name,
                'notes' => $contract->notes,
                'amount' => $contract->amount,
                'discount_amount' => $contract->discount_amount,
                'currency' => $contract->currency,
                'services' => $contract->services
                    ->sortBy('name')
                    ->values()
                    ->map(fn (Service $s) => [
                        'id' => $s->id,
                        'name' => $s->name,
                        'price' => (string) $s->price,
                        'currency' => $s->currency,
                        'account_email' => $s->account_email,
                        'password' => $s->password,
                        'pin' => $s->pivot?->pin_override ?? $this->resolveAccessPin($s->name, $contract->client?->phone, null, $s->pin),
                        'quantity' => (int) ($s->pivot?->quantity ?? 1),
                    ]),
                'billing_cycle' => $contract->billing_cycle,
                'next_due_date' => $contract->next_due_date?->toDateString(),
                'grace_period_days' => $contract->grace_period_days,
                'metadata' => $contract->metadata,
                'created_at' => $contract->created_at?->toIso8601String(),
                'updated_at' => $contract->updated_at?->toIso8601String(),
            ],
            'reminders' => $reminders,
            'payments' => $payments,
        ]);
    }

    /**
     * Store a new contract using the service
     */
    public function store(Request $request): RedirectResponse
    {
        $data = $this->validatedData($request);

        DB::transaction(function () use ($data) {
            $contract = $this->contractService->createContract($data);

            // Send notifications
            $this->notificationService->sendAccessMessages($contract);
            $this->notificationService->sendContractCreatedNotification($contract);
        });

        return redirect()->route('contracts.index')
            ->with('success', 'Contrato creado exitosamente.');
    }

    /**
     * Update contract using the service
     */
    public function update(Request $request, Contract $contract): RedirectResponse
    {
        $data = $this->validatedData($request, $contract);

        DB::transaction(function () use ($contract, $data) {
            $updatedContract = $this->contractService->updateContract($contract, $data);

            // Send notification if significant changes
            if ($this->hasSignificantChanges($contract, $data)) {
                $this->notificationService->sendContractUpdatedNotification($updatedContract);
            }
        });

        return redirect()->route('contracts.show', $contract)
            ->with('success', 'Contrato actualizado exitosamente.');
    }

    /**
     * Import contracts from file using the service
     */
    public function import(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimetypes:text/plain,text/csv,application/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ]);

        try {
            $result = $this->importService->importFromFile($validated['file']);

            $message = "Importación completada: {$result['created']} creados, {$result['updated']} actualizados, {$result['skipped']} omitidos.";
            
            if (!empty($result['errors'])) {
                $message .= " Errores: " . implode(', ', array_slice($result['errors'], 0, 3));
                if (count($result['errors']) > 3) {
                    $message .= " y " . (count($result['errors']) - 3) . " errores más.";
                }
            }

            return redirect()->route('contracts.index')->with('success', $message);
        } catch (\Exception $e) {
            return redirect()->back()->withErrors(['file' => $e->getMessage()]);
        }
    }

    /**
     * Create contract for specific client
     */
    public function storeForClient(Request $request, Client $client): RedirectResponse
    {
        $data = $this->validatedData($request);
        $data['client_id'] = $client->id;

        DB::transaction(function () use ($data) {
            $contract = $this->contractService->createContract($data);

            // Send notifications
            $this->notificationService->sendAccessMessages($contract);
            $this->notificationService->sendContractCreatedNotification($contract);
        });

        return redirect()
            ->route('clients.show', $client)
            ->with('success', 'Contrato creado y asignado al cliente.');
    }

    /**
     * Resend access messages
     */
    public function resendAccess(Contract $contract): RedirectResponse
    {
        $result = $this->notificationService->resendAccessMessages($contract);

        return redirect()->back()->with(
            $result['success'] ? 'success' : 'error',
            $result['message']
        );
    }

    /**
     * Get contract statistics (optimized)
     */
    public function stats(): JsonResponse
    {
        // Optimized: use single queries with aggregates
        $stats = [
            'total_contracts' => Contract::count(),
            'active_contracts' => Contract::whereHas('client')->count(),
            'total_value' => Contract::sum('amount'),
            'by_billing_cycle' => Contract::selectRaw('billing_cycle, COUNT(*) as count, SUM(amount) as total')
                ->groupBy('billing_cycle')
                ->get()
                ->keyBy('billing_cycle'),
            'by_currency' => Contract::selectRaw('currency, COUNT(*) as count, SUM(amount) as total')
                ->groupBy('currency')
                ->get()
                ->keyBy('currency'),
            'recent_activity' => Contract::with('client:id,name')
                ->orderByDesc('updated_at')
                ->limit(5)
                ->get(['id', 'name', 'client_id', 'updated_at']),
        ];

        return response()->json($stats);
    }

    /**
     * Validate contract data
     */
    private function validatedData(Request $request, ?Contract $contract = null): array
    {
        $rules = [
            'client_id' => ['required', Rule::exists('clients', 'id')],
            'currency' => ['required', Rule::in(['CRC', 'USD'])],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'billing_cycle' => ['required', Rule::in(['weekly', 'biweekly', 'monthly', 'one_time'])],
            'next_due_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:2000-01-01'],
            'notes' => ['nullable', 'string', 'max:65535'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:60'],
            'service_ids' => ['required', 'array', 'min:1'],
            'service_ids.*' => ['integer', Rule::exists('services', 'id')],
            'service_quantities' => ['nullable', 'array'],
            'service_quantities.*' => ['nullable', 'integer', 'min:1'],
            'service_pins' => ['nullable', 'array'],
            'service_pins.*' => ['nullable', 'string', 'max:32'],
        ];

        $data = $request->validate($rules);

        return [
            'client_id' => $data['client_id'],
            'notes' => $data['notes'] ?? null,
            'amount' => 0, // Will be calculated by service
            'discount_amount' => max(0, (float) ($data['discount_amount'] ?? 0)),
            'currency' => strtoupper($data['currency']),
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'] ?? null,
            'grace_period_days' => $data['grace_period_days'] ?? 0,
            'service_ids' => $data['service_ids'],
            'service_quantities' => $data['service_quantities'] ?? [],
            'service_pins' => $data['service_pins'] ?? [],
        ];
    }

    /**
     * Check if contract has significant changes for notification
     */
    private function hasSignificantChanges(Contract $contract, array $data): bool
    {
        $significantFields = ['amount', 'currency', 'billing_cycle', 'next_due_date'];
        
        foreach ($significantFields as $field) {
            if (isset($data[$field]) && $data[$field] != $contract->$field) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Resolve access PIN (moved from original controller)
     */
    private function resolveAccessPin(?string $serviceName, ?string $phone, ?string $providedPin, ?string $defaultPin): ?string
    {
        $serviceNameNorm = mb_strtolower((string) ($serviceName ?? ''));
        
        if (str_contains($serviceNameNorm, 'spotify')) {
            return null;
        }

        $providedPin = trim((string) ($providedPin ?? ''));
        if ($providedPin !== '') {
            return $providedPin;
        }

        $defaultPin = trim((string) ($defaultPin ?? ''));
        if ($defaultPin !== '') {
            return $defaultPin;
        }

        if ($phone) {
            $digits = preg_replace('/\D+/', '', $phone);
            if ($digits !== '') {
                $lastFour = substr($digits, -4);
                if ($lastFour !== '') {
                    if (str_contains($serviceNameNorm, 'prime')) {
                        return $lastFour . substr($lastFour, -1);
                    }
                    return $lastFour;
                }
            }
        }

        return null;
    }
}
