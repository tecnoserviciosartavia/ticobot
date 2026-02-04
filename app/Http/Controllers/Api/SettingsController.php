<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Setting;

class SettingsController extends Controller
{
    public function index()
    {
        $all = Setting::all()->mapWithKeys(function ($s) {
            return [$s->key => $s->value];
        })->toArray();

        return response()->json($all);
    }

    public function show($key)
    {
        $s = Setting::where('key', $key)->first();
        if (!$s) return response()->json(['value' => null], 404);
        return response()->json(['key' => $s->key, 'value' => $s->value]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'key' => 'required|string',
            'value' => 'nullable|string',
            'description' => 'nullable|string'
        ]);

        $s = Setting::updateOrCreate(['key' => $data['key']], ['value' => $data['value'] ?? null, 'description' => $data['description'] ?? null]);

        return response()->json(['key' => $s->key, 'value' => $s->value], 201);
    }

    public function update(Request $request, $key)
    {
        $data = $request->validate([
            'value' => 'nullable|string',
            'description' => 'nullable|string'
        ]);

        $s = Setting::updateOrCreate(['key' => $key], ['value' => $data['value'] ?? null, 'description' => $data['description'] ?? null]);

        return response()->json(['key' => $s->key, 'value' => $s->value]);
    }

    public function destroy($key)
    {
        Setting::where('key', $key)->delete();
        return response()->json(['deleted' => true]);
    }
}
