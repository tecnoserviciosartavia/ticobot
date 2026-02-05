<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use App\Models\Service;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;
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

        $services = Service::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (Service $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'price' => (string) $s->price,
                'currency' => $s->currency,
            ]);

        return Inertia::render('Clients/Create', [
            'statuses' => $statuses,
            'defaultStatus' => 'active',
            'services' => $services,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validatedData($request);
        $contractId = (int) $request->input('contract_id', 0) ?: null;

        unset($data['contract_id']);

        $client = Client::create($data);

        if ($contractId) {
            // Reasignar contrato temporal al cliente recién creado.
            $contract = Contract::query()
                ->whereKey($contractId)
                ->whereNull('client_id')
                ->first();

            if ($contract) {
                $contract->update(['client_id' => $client->id]);
            }
        }

        return redirect()->route('clients.show', $client);
    }

    public function show(Client $client): Response
    {
        $client->loadCount(['contracts', 'reminders', 'payments']);

        $contracts = Contract::query()
            ->where('client_id', $client->id)
            ->withCount(['payments'])
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
                'payments_count' => (int) $contract->payments_count,
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

        $services = Service::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (Service $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'price' => (string) $s->price,
                'currency' => $s->currency,
            ]);

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
            'services' => $services,
        ]);
    }

    public function update(Request $request, Client $client): RedirectResponse
    {
        $data = $this->validatedData($request, $client);

        $contractId = isset($data['contract_id']) ? (int) $data['contract_id'] : null;
        unset($data['contract_id']);

        $client->update($data);

        if ($contractId) {
            $contract = Contract::query()->whereKey($contractId)->first();
            if ($contract) {
                if ($contract->client_id !== null && (int) $contract->client_id !== (int) $client->id) {
                    return redirect()
                        ->back()
                        ->with('error', 'No se puede asignar el contrato porque ya está asignado a otro cliente.');
                }

                $contract->update(['client_id' => $client->id]);
            }
        }

        return redirect()
            ->route('clients.show', $client)
            ->with('success', 'Cliente actualizado.');
    }

    public function importForm(): Response
    {
        return Inertia::render('Clients/Import');
    }

    public function import(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimetypes:text/plain,text/csv,application/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
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

            $extension = strtolower($file->getClientOriginalExtension() ?? '');

            // Will hold header row and rows
            $headers = [];
            $rows = [];

            if (in_array($extension, ['xlsx', 'xls', 'ods'], true)) {
                // Parse spreadsheet using PhpSpreadsheet
                if (! class_exists(\PhpOffice\PhpSpreadsheet\IOFactory::class)) {
                    return redirect()->back()->withErrors(['file' => 'La librería para procesar archivos XLSX no está instalada. Ejecuta composer require phpoffice/phpspreadsheet']);
                }

                $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($path);
                $spreadsheet = $reader->load($path);
                $sheet = $spreadsheet->getActiveSheet();
                $data = $sheet->toArray(null, true, true, true);

                if (count($data) === 0) {
                    return redirect()->back()->withErrors(['file' => 'El archivo XLSX está vacío.']);
                }

                // First row: headers
                $first = array_shift($data);
                // Normalize headers - keys may be 'A','B',.. so cast to values
                $headers = array_map(function ($h) {
                    return strtolower(trim((string) $h));
                }, array_values($first));

                foreach ($data as $row) {
                    $rows[] = array_values($row);
                }
            } else {
                // CSV processing
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

                // Read all rows
                while (($row = fgetcsv($handle)) !== false) {
                    if (count($row) === 1 && trim((string) $row[0]) === '') {
                        // blank line
                        continue;
                    }
                    $rows[] = $row;
                }

                fclose($handle);
            }

            // Now process $headers and $rows (both CSV and XLSX normalized to arrays)
            foreach ($rows as $row) {
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
                    // Tomamos cualquier encabezado posible para teléfono
                    'phone' => $data['phone']
                        ?? $data['telefono']
                        ?? $data['teléfono']
                        ?? $data['telefonos']
                        ?? $data['teléfonos']
                        ?? null,
                    'status' => $data['status'] ?? 'active',
                    'notes' => $data['notes'] ?? null,
                ];

                // Buscar existente por email o por teléfono (normalizado / últimos 8 dígitos)
                $existing = null;
                if (! empty($attrs['email'])) {
                    $existing = Client::withTrashed()->where('email', $attrs['email'])->first();
                }

                if (! $existing && ! empty($attrs['phone'])) {
                    // Extraer posibles teléfonos del campo recibido
                    $phonesStr = (string) $attrs['phone'];
                    $candidates = $this->extractPhones($phonesStr);
                    foreach ($candidates as $cand) {
                        $normalized = $this->normalizePhone($cand);
                        $digits = preg_replace('/\D+/', '', $normalized);
                        $last8 = substr($digits, -8);

                        // Comparar contra phone tal cual, contra el normalizado y contra los últimos 8 dígitos
                        $query = Client::withTrashed()->where(function ($q) use ($normalized, $last8) {
                            $q->where('phone', $normalized)
                              ->orWhere('phone', 'like', "%{$normalized}")
                              ->orWhere('phone', 'like', "%{$last8}");
                        });

                        // También intentamos comparar por dígitos usando REGEXP_REPLACE si está disponible (MySQL 8+)
                        try {
                            $query->orWhereRaw("REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ?", ["%{$last8}"]);
                        } catch (\Throwable $e) {
                            // Fallback para bases sin REGEXP_REPLACE: quitamos algunos separadores comunes
                            $query->orWhereRaw(
                                "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ','') ,'-',''),'(',''),')',''),'+','') LIKE ?",
                                ["%{$last8}"]
                            );
                        }

                        $potential = $query->orderByDesc('id')->first();
                        if ($potential) { $existing = $potential; break; }
                    }
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
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
        ]);
    }

    private function normalizePhone(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw);
        if ($digits === '') return '';
        if (str_starts_with($digits, '506') && strlen($digits) === 11) {
            return '+' . $digits;
        }
        if (strlen($digits) === 8) {
            return '+506' . $digits;
        }
        if (strlen($digits) >= 7 && strlen($digits) <= 15) {
            return '+' . $digits;
        }
        return '+' . $digits;
    }

    private function extractPhones(string $phonesStr): array
    {
        $parts = preg_split('/[\s,;|]+/', trim($phonesStr)) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $n = $this->normalizePhone($p);
            if ($n !== '' && !in_array($n, $out, true)) {
                $out[] = $n;
            }
        }
        return $out;
    }

    /**
     * Remove the specified client from storage.
     * This will delete ALL associated data including contracts, payments, reminders, etc.
     */
    public function destroy(Client $client): RedirectResponse
    {
        try {
            DB::beginTransaction();

            $clientName = $client->name;

            // Get all payments to delete their receipts and conciliations
            $payments = $client->payments()->get();
            foreach ($payments as $payment) {
                // Delete payment receipts
                $payment->receipts()->delete();
                
                // Delete conciliations associated with this payment
                $payment->conciliation()->delete();
            }

            // Delete all payments
            $client->payments()->delete();

            // Get all contracts to delete their reminders
            $contracts = $client->contracts()->get();
            foreach ($contracts as $contract) {
                // Delete reminders associated with this contract
                $contract->reminders()->delete();
            }

            // Delete all contracts
            $client->contracts()->delete();

            // Delete any remaining reminders directly associated with the client
            $client->reminders()->delete();

            // Finally, delete the client
            $client->delete();

            DB::commit();

            return redirect()
                ->route('clients.index')
                ->with('success', "Cliente '{$clientName}' y todos sus datos asociados han sido eliminados correctamente.");
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->with('error', 'Error al eliminar el cliente: ' . $e->getMessage());
        }
    }
}
