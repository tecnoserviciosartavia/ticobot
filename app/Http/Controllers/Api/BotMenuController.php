<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BotMenu;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BotMenuController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = BotMenu::query()->where('active', true)->orderBy('keyword');

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'keyword' => ['required', 'string', 'max:100', 'unique:bot_menus,keyword'],
            'reply_message' => ['required', 'string'],
            'options' => ['nullable', 'array'],
            'active' => ['nullable', 'boolean'],
        ]);

        $menu = BotMenu::create($data);

        return response()->json($menu, 201);
    }

    public function update(Request $request, BotMenu $menu): JsonResponse
    {
        $data = $request->validate([
            'reply_message' => ['sometimes', 'required', 'string'],
            'options' => ['nullable', 'array'],
            'active' => ['nullable', 'boolean'],
        ]);

        $menu->update($data);

        return response()->json($menu->fresh());
    }

    public function destroy(BotMenu $menu): JsonResponse
    {
        $menu->delete();

        return response()->json(status: 204);
    }
}
