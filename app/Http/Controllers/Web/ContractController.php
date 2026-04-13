<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Service;
use App\Models\Payment;
use App\Models\Reminder;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Carbon\Carbon;

class ContractController extends Controller
{
    public function quickStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', Rule::in(['CRC', 'USD'])],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'billing_cycle' => ['required', 'string', Rule::in(['weekly', 'biweekly', 'monthly', 'one_time'])],
            'next_due_date' => ['required', 'date'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'notes' => ['nullable', 'string'],
            'service_ids' => ['nullable', 'array'],
            'service_ids.*' => ['integer', 'exists:services,id'],
            // Opcional: cantidades por servicio. Ej: { "12": 2, "15": 1 }
            'service_quantities' => ['nullable', 'array'],
            'service_pins' => ['nullable', 'array'],
            'service_pins.*' => ['nullable', 'string', 'max:32'],
        ]);

        $discount = (float) ($data['discount_amount'] ?? 0);

        $contract = Contract::create([
            'client_id' => null,
            'name' => $data['name'],
            'amount' => $data['amount'],
            'discount_amount' => max(0, $discount),
            'currency' => $data['currency'],
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'],
            'grace_period_days' => $data['grace_period_days'] ?? 0,
            'notes' => $data['notes'] ?? null,
        ]);

        if (! empty($data['service_ids'])) {
            $serviceIds = collect($data['service_ids'])->map(fn ($v) => (int) $v)->filter()->values();
            $qty = collect(($data['service_quantities'] ?? []))
                ->mapWithKeys(fn ($v, $k) => [(int) $k => max(1, (int) $v)]);
            $servicePins = collect(($data['service_pins'] ?? []))
                ->mapWithKeys(fn ($v, $k) => [(int) $k => trim((string) $v)]);

            // Guardar pivot con quantity.
            $syncData = [];
            $services = Service::query()->whereIn('id', $serviceIds)->get(['id', 'name', 'price', 'pin'])->keyBy('id');
            foreach ($serviceIds as $sid) {
                $service = $services->get((int) $sid);
                $syncData[$sid] = [
                    'quantity' => (int) ($qty[$sid] ?? 1),
                    'pin_override' => $this->resolveAccessPin($service?->name, null, $servicePins[(int) $sid] ?? null, $service?->pin),
                ];
            }
            $contract->services()->sync($syncData);

            // Recalcular total: sum(price * quantity)
            $total = 0.0;
            foreach ($services as $s) {
                $q = (int) ($qty[(int) $s->id] ?? 1);
                $total += ((float) $s->price) * $q;
            }
            $net = max(0, (float) $total - (float) $contract->discount_amount);
            $contract->forceFill(['amount' => $net])->save();
        }

        // Devolver una vista compacta para UI
        return response()->json([
            'id' => $contract->id,
            'name' => $contract->name,
            'amount' => (string) $contract->amount,
            'currency' => $contract->currency,
            'billing_cycle' => $contract->billing_cycle,
            'next_due_date' => $contract->next_due_date?->toDateString(),
        ], 201);
    }

    public function createForClient(Client $client): Response
    {
        $services = $this->mapServices(
            Service::query()->where('is_active', true)->orderBy('name')->get(),
            $this->serviceUsageCounts()
        );

        return Inertia::render('Clients/Contracts/Create', [
            'client' => $client->only(['id', 'name', 'phone']),
            'services' => $services,
            'defaultCurrency' => 'CRC',
            'defaultBillingCycle' => 'monthly',
            'returnTo' => route('clients.show', $client),
        ]);
    }

    public function storeForClient(Request $request, Client $client): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', Rule::in(['CRC', 'USD'])],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'billing_cycle' => ['required', 'string', Rule::in(['weekly', 'biweekly', 'monthly', 'one_time'])],
            'next_due_date' => ['required', 'date'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'notes' => ['nullable', 'string'],
            'service_ids' => ['nullable', 'array'],
            'service_ids.*' => ['integer', 'exists:services,id'],
            // Opcional: cantidades por servicio. Ej: { "12": 2, "15": 1 }
            'service_quantities' => ['nullable', 'array'],
            'service_pins' => ['nullable', 'array'],
            'service_pins.*' => ['nullable', 'string', 'max:32'],
        ]);

        $discount = (float) ($data['discount_amount'] ?? 0);

        $contract = Contract::create([
            'client_id' => $client->id,
            'name' => $data['name'],
            'amount' => $data['amount'],
            'discount_amount' => max(0, $discount),
            'currency' => $data['currency'],
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'],
            'grace_period_days' => $data['grace_period_days'] ?? 0,
            'notes' => $data['notes'] ?? null,
        ]);

        if (! empty($data['service_ids'])) {
            $serviceIds = collect($data['service_ids'])->map(fn ($v) => (int) $v)->filter()->values();
            $qty = collect(($data['service_quantities'] ?? []))
                ->mapWithKeys(fn ($v, $k) => [(int) $k => max(1, (int) $v)]);
            $servicePins = collect(($data['service_pins'] ?? []))
                ->mapWithKeys(fn ($v, $k) => [(int) $k => trim((string) $v)]);

            $syncData = [];
            $services = Service::query()->whereIn('id', $serviceIds)->get(['id', 'name', 'price', 'pin'])->keyBy('id');
            foreach ($serviceIds as $sid) {
                $service = $services->get((int) $sid);
                $syncData[$sid] = [
                    'quantity' => (int) ($qty[$sid] ?? 1),
                    'pin_override' => $this->resolveAccessPin($service?->name, $client->phone, $servicePins[(int) $sid] ?? null, $service?->pin),
                ];
            }
            $contract->services()->sync($syncData);

            $total = 0.0;
            foreach ($services as $s) {
                $q = (int) ($qty[(int) $s->id] ?? 1);
                $total += ((float) $s->price) * $q;
            }
            $net = max(0, (float) $total - (float) $contract->discount_amount);
            $contract->forceFill(['amount' => $net])->save();
        }

        // Enviar credenciales de acceso al cliente por WhatsApp
        $this->sendAccessMessages($contract, app(WhatsAppNotificationService::class));

        return redirect()
            ->route('clients.show', $client)
            ->with('success', 'Contrato creado y asignado al cliente.');
    }

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

        $services = $this->mapServices(
            Service::query()->where('is_active', true)->orderBy('name')->get(),
            $this->serviceUsageCounts()
        );

        return Inertia::render('Contracts/Create', [
            'clients' => $clients,
            'services' => $services,
            'defaultCurrency' => 'CRC',
            'defaultBillingCycle' => 'monthly',
        ]);
    }

    public function importForm(): Response
    {
        return Inertia::render('Contracts/Import');
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

            $headers = [];
            $rows = [];

            if (in_array($extension, ['xlsx', 'xls', 'ods'], true)) {
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

                $first = array_shift($data);
                $headers = array_map(function ($h) { return strtolower(trim((string) $h)); }, array_values($first));
                foreach ($data as $row) {
                    $rows[] = array_values($row);
                }
            } else {
                $handle = fopen($path, 'r');
                if ($handle === false) {
                    return redirect()->back()->withErrors(['file' => 'No se pudo abrir el archivo para lectura.']);
                }

                $headers = fgetcsv($handle);
                if (! $headers) {
                    fclose($handle);
                    return redirect()->back()->withErrors(['file' => 'El archivo CSV está vacío.']);
                }

                $headers = array_map(function ($h) { return strtolower(trim((string) $h)); }, $headers);

                while (($row = fgetcsv($handle)) !== false) {
                    if (count($row) === 1 && trim((string) $row[0]) === '') {
                        continue;
                    }
                    $rows[] = $row;
                }

                fclose($handle);
            }

            foreach ($rows as $row) {
                $data = [];
                foreach ($row as $idx => $value) {
                    $key = $headers[$idx] ?? null;
                    if ($key === null) continue;
                    $data[$key] = is_string($value) ? trim($value) : $value;
                }

                // Identify client
                $client = null;
                if (! empty($data['client_id'])) {
                    $client = Client::find((int) $data['client_id']);
                } elseif (! empty($data['client_email'])) {
                    $client = Client::where('email', $data['client_email'])->first();
                } else {
                    // Try by phone numbers: support columns client_phone, phone, telefono, telefonos
                    $phonesStr = $data['client_phone']
                        ?? $data['phone']
                        ?? $data['telefono']
                        ?? $data['teléfono']
                        ?? $data['telefonos']
                        ?? $data['teléfonos']
                        ?? null;
                    if ($phonesStr) {
                        $candidatePhones = $this->extractPhones($phonesStr);
                        foreach ($candidatePhones as $cand) {
                            // Exact matches first
                            $normalized = $this->normalizePhone($cand);
                            $last8 = substr(preg_replace('/\D+/', '', $normalized), -8);
                            $potentialQuery = Client::query()
                                ->where(function ($q) use ($normalized, $last8) {
                                    $q->where('phone', $normalized)
                                      ->orWhere('phone', 'like', "%{$last8}")
                                      ->orWhere('phone', 'like', "%{$normalized}");
                                });

                            // Try digits-only comparison using REGEXP_REPLACE (MySQL 8+) with fallback
                            try {
                                $potentialQuery->orWhereRaw("REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ?", ["%{$last8}"]);
                            } catch (\Throwable $e) {
                                $potentialQuery->orWhereRaw(
                                    "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ','') ,'-',''),'(',''),')',''),'+','') LIKE ?",
                                    ["%{$last8}"]
                                );
                            }

                            $potential = $potentialQuery->orderByDesc('id')->first();
                            if ($potential) { $client = $potential; break; }
                        }
                    }
                }

                if (! $client) {
                    $skipped++;
                    continue;
                }

                $name = $data['name'] ?? $data['contract_name'] ?? 'Servicio';
                $amountRaw = $data['amount'] ?? $data['monto'] ?? null;
                $amount = isset($amountRaw) && $amountRaw !== '' ? (float) $amountRaw : null;
                if (! $name || $amount === null) {
                    $skipped++;
                    continue;
                }

                $attrs = [
                    'client_id' => $client->id,
                    'name' => $name,
                    'amount' => $amount,
                    'currency' => strtoupper($data['currency'] ?? $data['moneda'] ?? 'CRC'),
                    'billing_cycle' => $data['billing_cycle'] ?? 'monthly',
                    'next_due_date' => $data['next_due_date']
                        ?? $data['proxima_fecha']
                        ?? $data['próxima_fecha']
                        ?? null,
                    'grace_period_days' => isset($data['grace_period_days']) ? (int) $data['grace_period_days'] : 0,
                    'metadata' => $data['notes'] ?? null,
                    'notes' => $data['notes'] ?? null,
                ];

                // Try to find existing contract by name + client
                $existing = Contract::where('client_id', $client->id)->where('name', $attrs['name'])->first();
                if ($existing) {
                    $existing->fill($attrs);
                    if ($existing->isDirty()) { $existing->save(); $updated++; } else { $skipped++; }
                } else {
                    // compute next_due_date if empty
                    if (empty($attrs['next_due_date'])) {
                        // Try from day value columns
                        $dueDay = $data['due_day']
                            ?? $data['dia_de_corte']
                            ?? $data['día_de_corte']
                            ?? $data['dia de corte']
                            ?? null;
                        if ($dueDay !== null && is_numeric($dueDay)) {
                            $attrs['next_due_date'] = $this->computeNextDueDateFromDay((int) $dueDay);
                        } else {
                            $attrs['next_due_date'] = $this->computeNextDueDate($attrs['billing_cycle']);
                        }
                    }
                    $contract = Contract::create($attrs);
                    $created++;

                    // Observer will auto-create reminder, no need for manual creation here
                }
            }

        } catch (\Throwable $e) {
            return redirect()->back()->withErrors(['file' => 'Ocurrió un error procesando el archivo: '.$e->getMessage()]);
        }

        return redirect()->route('contracts.index')->with('success', "Importación completada: {$created} creados, {$updated} actualizados, {$skipped} omitidos.");
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validatedData($request);

        $serviceIds = $data['service_ids'] ?? [];
        $serviceQuantities = $data['service_quantities'] ?? [];
        $servicePins = $data['service_pins'] ?? [];
        unset($data['service_ids']);
        unset($data['service_quantities']);
        unset($data['service_pins']);

        // Calcular monto por suma de servicios (misma moneda en UI por ahora)
        $qty = collect($serviceQuantities)
            ->mapWithKeys(fn ($v, $k) => [(int) $k => max(1, (int) $v)]);
        $services = Service::query()->whereIn('id', $serviceIds)->get(['id', 'name', 'price', 'pin'])->keyBy('id');
        $amount = 0.0;
        foreach ($services as $s) {
            $q = (int) ($qty[(int) $s->id] ?? 1);
            $amount += ((float) $s->price) * $q;
        }
        $data['amount'] = max(0, (float) $amount - (float) ($data['discount_amount'] ?? 0));

        // If next_due_date is not provided, compute based on billing_cycle
        if (empty($data['next_due_date'])) {
            $data['next_due_date'] = $this->computeNextDueDate($data['billing_cycle']);
        }

        $contract = Contract::create($data);

        // Guardar pivot con quantity.
        $syncData = [];
        foreach ($serviceIds as $sid) {
            $sid = (int) $sid;
            if (! $sid) continue;
            $service = $services->get($sid);
            $syncData[$sid] = [
                'quantity' => (int) ($qty[$sid] ?? 1),
                'pin_override' => $this->resolveAccessPin($service?->name, $contract->client?->phone, $servicePins[$sid] ?? null, $service?->pin),
            ];
        }
        $contract->services()->sync($syncData);

        // Enviar credenciales de acceso al cliente por WhatsApp
        $this->sendAccessMessages($contract, app(WhatsAppNotificationService::class));

        return redirect()->route('contracts.show', $contract);
    }

    public function show(Contract $contract): Response
    {
        $contract->load(['client:id,name,email,phone', 'services:id,name,price,currency,account_email,password,pin']);

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

    public function edit(Contract $contract): Response
    {
        $clients = Client::query()
            ->select('id', 'name', 'phone')
            ->orderBy('name')
            ->get();

        $services = $this->mapServices(
            Service::query()->where('is_active', true)->orderBy('name')->get(),
            $this->serviceUsageCounts($contract->id)
        );

        $selectedServiceIds = $contract->services()->pluck('services.id')->values();
        $selectedServiceQuantities = $contract->services()
            ->pluck('contract_service.quantity', 'services.id')
            ->map(fn ($v) => (int) $v)
            ->toArray();
        $selectedServicePins = $contract->services()
            ->pluck('contract_service.pin_override', 'services.id')
            ->map(fn ($v) => $v !== null ? (string) $v : '')
            ->toArray();

        return Inertia::render('Contracts/Edit', [
            'contract' => [
                'id' => $contract->id,
                'client_id' => $contract->client_id,
                'notes' => $contract->notes,
                'name' => $contract->name,
                'amount' => $contract->amount,
                'discount_amount' => $contract->discount_amount,
                'currency' => $contract->currency,
                'billing_cycle' => $contract->billing_cycle,
                'next_due_date' => $contract->next_due_date?->toDateString(),
                'grace_period_days' => $contract->grace_period_days,
                'metadata' => $contract->metadata,
                'service_ids' => $selectedServiceIds,
                'service_quantities' => $selectedServiceQuantities,
                'service_pins' => $selectedServicePins,
            ],
            'clients' => $clients,
            'services' => $services,
        ]);
    }

    public function update(Request $request, Contract $contract): RedirectResponse
    {
        $data = $this->validatedData($request, $contract);

        $serviceIds = $data['service_ids'] ?? [];
        $serviceQuantities = $data['service_quantities'] ?? [];
        $servicePins = $data['service_pins'] ?? [];
        unset($data['service_ids']);
        unset($data['service_quantities']);
        unset($data['service_pins']);

        $qty = collect($serviceQuantities)
            ->mapWithKeys(fn ($v, $k) => [(int) $k => max(1, (int) $v)]);
        $services = Service::query()->whereIn('id', $serviceIds)->get(['id', 'name', 'price', 'pin'])->keyBy('id');
        $amount = 0.0;
        foreach ($services as $s) {
            $q = (int) ($qty[(int) $s->id] ?? 1);
            $amount += ((float) $s->price) * $q;
        }
        $data['amount'] = max(0, (float) $amount - (float) ($data['discount_amount'] ?? 0));

        $contract->update($data);

        $syncData = [];
        foreach ($serviceIds as $sid) {
            $sid = (int) $sid;
            if (! $sid) continue;
            $service = $services->get($sid);
            $syncData[$sid] = [
                'quantity' => (int) ($qty[$sid] ?? 1),
                'pin_override' => $this->resolveAccessPin($service?->name, $contract->client?->phone, $servicePins[$sid] ?? null, $service?->pin),
            ];
        }
        $contract->services()->sync($syncData);

        return redirect()->route('contracts.show', $contract);
    }

    public function destroy(Request $request, Contract $contract): RedirectResponse
    {
        $clientId = $contract->client_id;

        if ($contract->payments()->exists()) {
            return redirect()
                ->back()
                ->with('error', 'No se puede eliminar el contrato porque tiene pagos asociados.');
        }

        DB::transaction(function () use ($contract): void {
            // Soft-delete reminders first (so the client view stops counting them)
            $contract->reminders()->delete();
            // Remove service pivot rows
            $contract->services()->detach();
            // Soft-delete contract
            $contract->delete();
        });

        if ($clientId) {
            return redirect()
                ->route('clients.show', $clientId)
                ->with('success', 'Contrato eliminado.');
        }

        return redirect()
            ->route('contracts.index')
            ->with('success', 'Contrato eliminado.');
    }

    private function validatedData(Request $request, ?Contract $contract = null): array
    {
        $data = $request->validate([
            'client_id' => ['required', Rule::exists('clients', 'id')],
            'name' => ['required', 'string', 'max:255'],
            // amount se calcula a partir de service_ids
            'currency' => ['required', Rule::in(['CRC', 'USD'])],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'billing_cycle' => ['required', Rule::in(['weekly', 'biweekly', 'monthly', 'one_time'])],
            'next_due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:65535'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:60'],
            'service_ids' => ['required', 'array', 'min:1'],
            'service_ids.*' => ['integer', Rule::exists('services', 'id')],
            // Cantidad por servicio (para permitir repetir el mismo servicio en un contrato)
            'service_quantities' => ['nullable', 'array'],
            'service_quantities.*' => ['nullable', 'integer', 'min:1'],
            'service_pins' => ['nullable', 'array'],
            'service_pins.*' => ['nullable', 'string', 'max:32'],
        ]);

        $discount = (float) ($data['discount_amount'] ?? 0);

        return [
            'client_id' => $data['client_id'],
            'name' => $data['name'],
            'notes' => $data['notes'] ?? null,
            'amount' => 0,
            'discount_amount' => max(0, $discount),
            'currency' => strtoupper($data['currency']),
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'] ?? null,
            'grace_period_days' => $data['grace_period_days'] ?? 0,
            'service_ids' => $data['service_ids'],
            'service_quantities' => $data['service_quantities'] ?? [],
            'service_pins' => $data['service_pins'] ?? [],
        ];
    }

    private function computeNextDueDate(string $billingCycle): string
    {
        $today = Carbon::today(config('app.timezone'));
        return match ($billingCycle) {
            'weekly' => $today->copy()->addDays(7)->toDateString(),
            'biweekly' => $today->copy()->addDays(14)->toDateString(),
            'monthly' => $today->copy()->addMonthNoOverflow()->toDateString(),
            'one_time' => $today->toDateString(),
            default => $today->toDateString(),
        };
    }

    private function computeNextDueDateFromDay(int $dayOfMonth): string
    {
        $dayOfMonth = max(1, min(31, $dayOfMonth));
        $today = Carbon::today(config('app.timezone'));
        // Candidate in current month (no overflow)
        $candidate = $today->copy()->day(min($dayOfMonth, $today->daysInMonth));
        if ($candidate->lt($today)) {
            $nextMonth = $today->copy()->addMonthNoOverflow();
            $candidate = $nextMonth->copy()->day(min($dayOfMonth, $nextMonth->daysInMonth));
        }
        return $candidate->toDateString();
    }

    private function normalizePhone(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw);
        if ($digits === '') return '';
        // If already starts with 506 and length 11 treat as CR international without plus
        if (str_starts_with($digits, '506') && strlen($digits) === 11) {
            return '+'.$digits;
        }
        if (strlen($digits) === 8) {
            return '+506'.$digits; // assume Costa Rica local
        }
        if (strlen($digits) >= 7 && strlen($digits) <= 15) {
            return '+' . $digits; // fallback generic E.164 style
        }
        return '+' . $digits; // still return something
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

    public function resendAccess(Contract $contract): RedirectResponse
    {
        $sent = $this->sendAccessMessages($contract, app(WhatsAppNotificationService::class));
        if ($sent > 0) {
            return redirect()->back()->with('success', "Accesos reenviados ({$sent} mensaje(s) enviado(s)).");
        }
        return redirect()->back()->with('error', 'No se pudieron enviar los accesos. Verifique que el cliente tenga teléfono y los servicios tengan credenciales configuradas.');
    }

    private function sendAccessMessages(Contract $contract, WhatsAppNotificationService $whatsApp): int
    {
        $contract->loadMissing(['client:id,name,phone', 'services:id,name,account_email,password,pin']);

        $phone = $contract->client?->phone ?? null;
        if (! $phone) {
            return 0;
        }

        $servicesData = $contract->services
            ->map(fn (Service $s) => [
                'name' => $s->name,
                'account_email' => $s->account_email,
                'password' => $s->password,
                'pin' => $s->pivot?->pin_override ?? $this->resolveAccessPin($s->name, $phone, null, $s->pin),
            ])
            ->all();

        return $whatsApp->sendPlatformAccessMessages($phone, $servicesData);
    }

    private function resolveAccessPin(?string $serviceName, ?string $clientPhone, mixed $submittedPin = null, ?string $fallbackPin = null): ?string
    {
        $manualPin = trim((string) ($submittedPin ?? ''));
        if ($manualPin !== '') {
            return $manualPin;
        }

        $generatedPin = $this->buildAccessPinFromPhone($serviceName, $clientPhone);
        if ($generatedPin !== null) {
            return $generatedPin;
        }

        $fallbackPin = trim((string) ($fallbackPin ?? ''));

        return $fallbackPin !== '' ? $fallbackPin : null;
    }

    private function buildAccessPinFromPhone(?string $serviceName, ?string $clientPhone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) ($clientPhone ?? ''));
        if ($digits === '') {
            return null;
        }

        $lastFour = substr($digits, -4);
        if ($lastFour === false || $lastFour === '') {
            return null;
        }

        if (str_contains(mb_strtolower((string) ($serviceName ?? '')), 'prime')) {
            return $lastFour.substr($lastFour, -1);
        }

        return $lastFour;
    }

    /**
     * Excluye opcionalmente un contrato (cuando se está editando).
     */
    private function serviceUsageCounts(?int $excludeContractId = null): array
    {
        $query = DB::table('contract_service')
            ->join('contracts', 'contracts.id', '=', 'contract_service.contract_id')
            ->whereNull('contracts.deleted_at')
            ->select('contract_service.service_id', DB::raw('SUM(contract_service.quantity) as total_used'));

        if ($excludeContractId) {
            $query->where('contract_service.contract_id', '!=', $excludeContractId);
        }

        return $query
            ->groupBy('contract_service.service_id')
            ->pluck('total_used', 'service_id')
            ->map(fn ($v) => (int) $v)
            ->toArray();
    }

    private function mapServices(iterable $services, array $usageCounts): array
    {
        return collect($services)->map(fn (Service $s) => [
            'id' => $s->id,
            'name' => $s->name,
            'price' => (string) $s->price,
            'currency' => $s->currency,
            'account_email' => $s->account_email,
            'max_profiles' => $s->max_profiles,
            'profiles_used' => (int) ($usageCounts[$s->id] ?? 0),
        ])->values()->all();
    }
}

