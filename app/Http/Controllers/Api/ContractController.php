<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Contract::query()
            ->with(['client'])
            ->withCount(['reminders', 'payments']);

        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        if ($request->filled('billing_cycle')) {
            $query->where('billing_cycle', $request->string('billing_cycle')->trim()->toString());
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
            'name' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', 'string', 'size:3'],
            'billing_cycle' => ['required', 'string', 'max:50'],
            'next_due_date' => ['nullable', 'date'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:31'],
            'metadata' => ['nullable', 'array'],
        ]);

        $contract = Contract::create($data);

        return response()->json($contract->load('client'), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Contract $contract): JsonResponse
    {
        return response()->json(
            $contract->load([
                'client',
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
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'amount' => ['sometimes', 'required', 'numeric', 'min:0'],
            'currency' => ['sometimes', 'required', 'string', 'size:3'],
            'billing_cycle' => ['sometimes', 'required', 'string', 'max:50'],
            'next_due_date' => ['nullable', 'date'],
            'grace_period_days' => ['nullable', 'integer', 'min:0', 'max:31'],
            'metadata' => ['nullable', 'array'],
        ]);

        $contract->update($data);

        return response()->json($contract->fresh()->load('client'));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Contract $contract): JsonResponse
    {
        $contract->delete();

        return response()->json(status: 204);
    }
}
