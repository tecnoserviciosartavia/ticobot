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

class ClientController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->query('search', ''));
        $status = trim((string) $request->query('status', ''));

        $query = Client::query()->withCount(['contracts', 'reminders', 'payments']);

        if ($search !== '') {
            $query->where(function ($innerQuery) use ($search) {
                $innerQuery
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('legal_id', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if ($status !== '') {
            $query->where('status', $status);
        }

        $clients = $query
            ->orderBy('name')
            ->paginate(perPage: 15)
            ->withQueryString()
            ->through(fn (Client $client) => [
                'id' => $client->id,
                'name' => $client->name,
                'legal_id' => $client->legal_id,
                'email' => $client->email,
                'phone' => $client->phone,
                'status' => $client->status,
                'contracts_count' => $client->contracts_count,
                'reminders_count' => $client->reminders_count,
                'payments_count' => $client->payments_count,
                'updated_at' => $client->updated_at?->toIso8601String(),
            ]);

        $statuses = Client::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        return Inertia::render('Clients/Index', [
            'clients' => $clients,
            'filters' => [
                'search' => $search !== '' ? $search : null,
                'status' => $status !== '' ? $status : null,
            ],
            'statuses' => $statuses,
        ]);
    }

    public function create(): Response
    {
        $statuses = Client::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        if (! $statuses->contains('active')) {
            $statuses->prepend('active');
        }

        return Inertia::render('Clients/Create', [
            'statuses' => $statuses,
            'defaultStatus' => 'active',
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validatedData($request);

        $client = Client::create($data);

        return redirect()->route('clients.show', $client);
    }

    public function show(Client $client): Response
    {
        $client->loadCount(['contracts', 'reminders', 'payments']);

        $contracts = Contract::query()
            ->where('client_id', $client->id)
            ->latest('updated_at')
            ->limit(5)
            ->get()
            ->map(fn (Contract $contract) => [
                'id' => $contract->id,
                'name' => $contract->name,
                'amount' => $contract->amount,
                'currency' => $contract->currency,
                'billing_cycle' => $contract->billing_cycle,
                'next_due_date' => $contract->next_due_date?->toDateString(),
                'updated_at' => $contract->updated_at?->toIso8601String(),
            ]);

        $reminders = Reminder::query()
            ->where('client_id', $client->id)
            ->with(['contract:id,name'])
            ->latest('scheduled_for')
            ->limit(5)
            ->get()
            ->map(fn (Reminder $reminder) => [
                'id' => $reminder->id,
                'status' => $reminder->status,
                'scheduled_for' => $reminder->scheduled_for?->toIso8601String(),
                'sent_at' => $reminder->sent_at?->toIso8601String(),
                'acknowledged_at' => $reminder->acknowledged_at?->toIso8601String(),
                'contract' => $reminder->contract?->only(['id', 'name']),
            ]);

        $payments = Payment::query()
            ->where('client_id', $client->id)
            ->latest()
            ->limit(5)
            ->with(['conciliation'])
            ->get()
            ->map(fn (Payment $payment) => [
                'id' => $payment->id,
                'amount' => $payment->amount,
                'currency' => $payment->currency,
                'status' => $payment->status,
                'paid_at' => $payment->paid_at?->toDateString(),
                'reference' => $payment->reference,
                'conciliation_status' => $payment->conciliation?->status,
            ]);

        return Inertia::render('Clients/Show', [
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'legal_id' => $client->legal_id,
                'email' => $client->email,
                'phone' => $client->phone,
                'status' => $client->status,
                'notes' => $client->notes,
                'metadata' => $client->metadata,
                'created_at' => $client->created_at?->toIso8601String(),
                'updated_at' => $client->updated_at?->toIso8601String(),
            ],
            'stats' => [
                'contracts' => $client->contracts_count,
                'reminders' => $client->reminders_count,
                'payments' => $client->payments_count,
            ],
            'contracts' => $contracts,
            'reminders' => $reminders,
            'payments' => $payments,
        ]);
    }

    public function edit(Client $client): Response
    {
        $statuses = Client::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        if (! $statuses->contains('active')) {
            $statuses->prepend('active');
        }

        return Inertia::render('Clients/Edit', [
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'legal_id' => $client->legal_id,
                'email' => $client->email,
                'phone' => $client->phone,
                'status' => $client->status,
                'notes' => $client->notes,
            ],
            'statuses' => $statuses,
        ]);
    }

    public function update(Request $request, Client $client): RedirectResponse
    {
        $data = $this->validatedData($request, $client);

        $client->update($data);

        return redirect()->route('clients.show', $client);
    }

    private function validatedData(Request $request, ?Client $client = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'legal_id' => ['nullable', 'string', 'max:50', Rule::unique('clients', 'legal_id')->ignore($client)],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'status' => ['required', 'string', 'max:50'],
            'notes' => ['nullable', 'string'],
        ]);
    }
}
