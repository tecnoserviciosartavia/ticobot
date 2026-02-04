<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContractType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractTypeController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(ContractType::orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:100', 'unique:contract_types,key'],
            'name' => ['required', 'string', 'max:255'],
            'default_message' => ['nullable', 'string'],
            'active' => ['nullable', 'boolean'],
        ]);

        $type = ContractType::create($data);

        return response()->json($type, 201);
    }

    public function update(Request $request, ContractType $contractType): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'default_message' => ['nullable', 'string'],
            'active' => ['nullable', 'boolean'],
        ]);

        $contractType->update($data);

        return response()->json($contractType->fresh());
    }

    public function destroy(ContractType $contractType): JsonResponse
    {
        $contractType->delete();

        return response()->json(status: 204);
    }
}
