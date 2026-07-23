<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    /**
     * Return a list of services (platforms) for internal use by the bot/admin clients.
     * NOTE: intentionally excludes internal `cost` field.
     */
    public function index(Request $request): JsonResponse
    {
        $services = Service::query()
            ->select('id', 'name', 'price', 'currency', 'is_active')
            ->orderBy('name')
            ->get();

        return response()->json($request->boolean('mobile') ? ['data' => $services] : $services);
    }
}
