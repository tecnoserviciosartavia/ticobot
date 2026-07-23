<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ContractController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Contract::query()
            ->with(['client', 'services:id,name,price,currency,is_active'])
            ->withCount(['reminders', 'payments']);

        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        if ($request->filled('billing_cycle')) {
            $query->where('billing_cycle', $request->string('billing_cycle')->trim()->toString());
        }

        if ($request->filled('status')) {
            $status = $request->string('status')->trim()->toString();
            if (in_array($status, ['active', 'paused', 'cancelled'], true)) {
                $query->where('status', $status);
            }
        }

        if ($request->boolean('only_trashed')) {
            $query->onlyTrashed();
        } elseif ($request->boolean('with_trashed')) {
            $query->withTrashed();
        }

        $contracts = $query
            ->orderByDesc('updated_at')
            ->paginate($request->integer('per_page', 15))
            ->appends($request->query());

        return response()->json($contracts);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'client_id' => ['required', 'exists:clients,id'],
            'contract_type_id' => ['nullable', 'exists:contract_types,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', 'string', 'size:3'],
            'billing_cycle' => ['required', 'string', 'max:50'],
            'status' => ['nullable', 'string', Rule::in(['active', 'paused', 'cancelled'])],
            'next_due_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:2000-01-01'],
            'notes' => ['nullable', 'string', 'max:65535'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:31'],
            'metadata' => ['nullable', 'array'],
            'service_ids' => ['required', 'array', 'min:1'],
            'service_ids.*' => ['integer', 'distinct', 'exists:services,id'],
        ]);

        if (! isset($data['status']) || $data['status'] === null || $data['status'] === '') {
            $data['status'] = 'active';
        }

        $serviceIds = $data['service_ids'];
        unset($data['service_ids']);
        $data['amount'] = $this->servicesAmount($serviceIds);
        $contract = Contract::create($data);
        $contract->services()->sync(collect($serviceIds)->mapWithKeys(fn ($id) => [(int) $id => ['quantity' => 1]])->all());

        return response()->json($contract->load(['client', 'services:id,name,price,currency,is_active']), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Contract $contract): JsonResponse
    {
        return response()->json(
            $contract->load([
                'client',
                'services:id,name,price,currency,is_active',
                'reminders' => fn ($query) => $query->latest()->limit(15),
                'payments' => fn ($query) => $query->latest()->limit(15),
            ])
        );
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Contract $contract): JsonResponse
    {
        $data = $request->validate([
            'client_id' => ['sometimes', 'required', 'exists:clients,id'],
            'contract_type_id' => ['nullable', 'exists:contract_types,id'],
            'amount' => ['sometimes', 'required', 'numeric', 'min:0'],
            'currency' => ['sometimes', 'required', 'string', 'size:3'],
            'billing_cycle' => ['sometimes', 'required', 'string', 'max:50'],
            'status' => ['sometimes', 'nullable', 'string', Rule::in(['active', 'paused', 'cancelled'])],
            'next_due_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:2000-01-01'],
            'notes' => ['nullable', 'string', 'max:65535'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:31'],
            'metadata' => ['nullable', 'array'],
            'service_ids' => ['sometimes', 'required', 'array', 'min:1'],
            'service_ids.*' => ['integer', 'distinct', 'exists:services,id'],
        ]);

        $serviceIds = $data['service_ids'] ?? null;
        unset($data['service_ids']);
        if ($serviceIds !== null) {
            $data['amount'] = $this->servicesAmount($serviceIds);
        }
        $contract->update($data);
        if ($serviceIds !== null) {
            $existing = $contract->services()->get()->keyBy('id');
            $syncData = collect($serviceIds)->mapWithKeys(function ($id) use ($existing) {
                $pivot = $existing->get((int) $id)?->pivot;
                return [(int) $id => [
                    'quantity' => (int) ($pivot?->quantity ?? 1),
                    'pin_override' => $pivot?->pin_override,
                    'service_account_id' => $pivot?->service_account_id,
                ]];
            })->all();
            $contract->services()->sync($syncData);
        }

        return response()->json($contract->fresh()->load(['client', 'services:id,name,price,currency,is_active']));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Contract $contract): JsonResponse
    {
        $contract->delete();

        return response()->json(status: 204);
    }

    private function servicesAmount(array $serviceIds): float
    {
        return (float) \App\Models\Service::query()->whereIn('id', $serviceIds)->sum('price');
    }
}
