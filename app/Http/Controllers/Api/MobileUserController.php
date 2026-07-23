<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MobileUserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => User::query()->orderBy('name')->get(['id', 'name', 'email', 'phone', 'profile_type'])]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'profile_type' => ['sometimes', 'nullable', Rule::in(['admin', 'agent'])],
        ]);
        $user->update($data);

        return response()->json(['data' => $user->only(['id', 'name', 'email', 'phone', 'profile_type'])]);
    }
}
