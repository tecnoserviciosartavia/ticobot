<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ContractController extends Controller
{
    public function index(Request $request): Response
    {
        $clientId = (int) $request->query('client_id', 0) ?: null;
        $billingCycle = trim((string) $request->query('billing_cycle', ''));

        $query = Contract::query()
            ->with(['client:id,name'])
            ->withCount(['reminders', 'payments']);

        if ($clientId) {
            $query->where('client_id', $clientId);
        }

        if ($billingCycle !== '') {
            $query->where('billing_cycle', $billingCycle);
        }

        $contracts = $query
            ->orderByDesc('updated_at')
            ->paginate(15)
            ->withQueryString()
            ->through(fn (Contract $contract) => [
                'id' => $contract->id,
                'name' => $contract->name,
                'amount' => $contract->amount,
                'currency' => $contract->currency,
                'billing_cycle' => $contract->billing_cycle,
                'next_due_date' => $contract->next_due_date?->toDateString(),
                'client' => $contract->client?->only(['id', 'name']),
                'reminders_count' => $contract->reminders_count,
                'payments_count' => $contract->payments_count,
                'updated_at' => $contract->updated_at?->toIso8601String(),
            ]);

        $clients = Client::query()
            ->select('id', 'name')
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
                'client_id' => $clientId,
                'billing_cycle' => $billingCycle !== '' ? $billingCycle : null,
            ],
            'clients' => $clients,
            'billingCycles' => $billingCycles,
        ]);
    }

    public function create(): Response
    {
        $clients = Client::query()
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return Inertia::render('Contracts/Create', [
            'clients' => $clients,
            'defaultCurrency' => 'CRC',
            'defaultBillingCycle' => 'monthly',
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validatedData($request);

        $contract = Contract::create($data);

        return redirect()->route('contracts.show', $contract);
    }

    public function show(Contract $contract): Response
    {
        $contract->load(['client:id,name,email,phone']);

        $reminders = Reminder::query()
            ->where('contract_id', $contract->id)
            ->latest('scheduled_for')
            ->limit(10)
            ->get()
            ->map(fn (Reminder $reminder) => [
                'id' => $reminder->id,
                'status' => $reminder->status,
                'scheduled_for' => $reminder->scheduled_for?->toIso8601String(),
                'sent_at' => $reminder->sent_at?->toIso8601String(),
                'acknowledged_at' => $reminder->acknowledged_at?->toIso8601String(),
                'attempts' => $reminder->attempts,
            ]);

        $payments = Payment::query()
            ->where('contract_id', $contract->id)
            ->latest('created_at')
            ->limit(10)
            ->with('conciliation')
            ->get()
            ->map(fn (Payment $payment) => [
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
                'amount' => $contract->amount,
                'currency' => $contract->currency,
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

    public function edit(Contract $contract): Response
    {
        $clients = Client::query()
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return Inertia::render('Contracts/Edit', [
            'contract' => [
                'id' => $contract->id,
                'client_id' => $contract->client_id,
                'name' => $contract->name,
                'amount' => $contract->amount,
                'currency' => $contract->currency,
                'billing_cycle' => $contract->billing_cycle,
                'next_due_date' => $contract->next_due_date?->toDateString(),
                'grace_period_days' => $contract->grace_period_days,
                'metadata' => $contract->metadata,
            ],
            'clients' => $clients,
        ]);
    }

    public function update(Request $request, Contract $contract): RedirectResponse
    {
        $data = $this->validatedData($request, $contract);

        $contract->update($data);

        return redirect()->route('contracts.show', $contract);
    }

    private function validatedData(Request $request, ?Contract $contract = null): array
    {
        $data = $request->validate([
            'client_id' => ['required', Rule::exists('clients', 'id')],
            'name' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', 'string', 'size:3'],
            'billing_cycle' => ['required', 'string', 'max:50'],
            'next_due_date' => ['nullable', 'date'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:60'],
        ]);

        return [
            'client_id' => $data['client_id'],
            'name' => $data['name'],
            'amount' => $data['amount'],
            'currency' => strtoupper($data['currency']),
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'] ?? null,
            'grace_period_days' => $data['grace_period_days'] ?? 0,
        ];
    }
}
