<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Client::query()
            ->withCount(['contracts', 'reminders', 'payments']);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->trim()->toString());
        }

        if ($search = $request->string('search')->trim()->toString()) {
            $digits = preg_replace('/\D+/', '', $search);
            $last8 = $digits ? substr($digits, -8) : null;
            $query->where(function ($innerQuery) use ($search, $last8) {
                $innerQuery
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");

                if ($last8 && strlen($last8) >= 4) {
                    // Try digits-only comparison (MySQL 8+ REGEXP_REPLACE) with fallback to REPLACE cascade
                    try {
                        $innerQuery->orWhereRaw("REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ?", ["%{$last8}"]);
                    } catch (\Throwable $e) {
                        $innerQuery->orWhereRaw(
                            "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ','') ,'-',''),'(',''),')',''),'+','') LIKE ?",
                            ["%{$last8}"]
                        );
                    }
                }
            });
        }

        $clients = $query
            ->orderBy('name')
            ->paginate($request->integer('per_page', 15))
            ->appends($request->query());

        return response()->json($clients);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'status' => ['required', 'string', 'max:50'],
            'metadata' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
        ]);

        $client = Client::create($data);

        return response()->json($client, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Client $client): JsonResponse
    {
        return response()->json(
            $client->load(['contracts', 'reminders' => fn ($query) => $query->latest()->limit(10), 'payments' => fn ($query) => $query->latest()->limit(10)])
        );
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Client $client): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'status' => ['sometimes', 'required', 'string', 'max:50'],
            'metadata' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
        ]);

        $client->update($data);

        return response()->json($client->fresh());
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Client $client): JsonResponse
    {
        $client->delete();

        return response()->json(status: 204);
    }
}
