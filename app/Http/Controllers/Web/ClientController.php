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

    public function importForm(): Response
    {
        return Inertia::render('Clients/Import');
    }

    public function import(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimetypes:text/plain,text/csv,application/csv,application/vnd.ms-excel'],
        ]);

        $file = $validated['file'];
        $created = 0;
        $updated = 0;
        $skipped = 0;

        try {
            $path = $file->getRealPath();
            if (! $path || ! is_readable($path)) {
                return redirect()->back()->withErrors(['file' => 'No se puede leer el archivo subido.']);
            }

            $handle = fopen($path, 'r');
            if ($handle === false) {
                return redirect()->back()->withErrors(['file' => 'No se pudo abrir el archivo para lectura.']);
            }

            // Read header row
            $headers = fgetcsv($handle);
            if (! $headers) {
                fclose($handle);
                return redirect()->back()->withErrors(['file' => 'El archivo CSV está vacío.']);
            }

            $headers = array_map(function ($h) {
                return strtolower(trim((string) $h));
            }, $headers);

            // Expected columns (any order). Unknown columns are ignored.
            // name (required), email, phone, status, notes

            while (($row = fgetcsv($handle)) !== false) {
                if (count($row) === 1 && trim((string) $row[0]) === '') {
                    // blank line
                    continue;
                }

                $data = [];
                foreach ($row as $idx => $value) {
                    $key = $headers[$idx] ?? null;
                    if ($key === null) {
                        continue;
                    }
                    $data[$key] = is_string($value) ? trim($value) : $value;
                }

                $name = $data['name'] ?? null;
                if (! $name) {
                    $skipped++;
                    continue;
                }

                $attrs = [
                    'name' => $name,
                    'email' => $data['email'] ?? null,
                    'phone' => $data['phone'] ?? null,
                    'status' => $data['status'] ?? 'active',
                    'notes' => $data['notes'] ?? null,
                ];

                // Find existing by email
                $existing = null;
                if (! empty($attrs['email'])) {
                    $existing = Client::withTrashed()->where('email', $attrs['email'])->first();
                }

                if ($existing) {
                    if ($existing->trashed()) {
                        $existing->restore();
                    }
                    $existing->fill($attrs);
                    if ($existing->isDirty()) {
                        $existing->save();
                        $updated++;
                    } else {
                        $skipped++;
                    }
                } else {
                    Client::create($attrs);
                    $created++;
                }
            }

            fclose($handle);
        } catch (\Throwable $e) {
            return redirect()->back()->withErrors(['file' => 'Ocurrió un error procesando el archivo: '.$e->getMessage()]);
        }

        return redirect()
            ->route('clients.index')
            ->with('success', "Importación completada: {$created} creados, {$updated} actualizados, {$skipped} omitidos.");
    }

    private function validatedData(Request $request, ?Client $client = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'status' => ['required', 'string', 'max:50'],
            'notes' => ['nullable', 'string'],
        ]);
    }
}
