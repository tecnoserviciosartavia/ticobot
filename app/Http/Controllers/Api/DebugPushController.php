<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;

class DebugPushController extends Controller
{
    /**
     * Endpoint de prueba sin autenticación para debug
     */
    public function testRegister(Request $request): JsonResponse
    {
        \Illuminate\Support\Facades\Log::info('DEBUG: testRegister llamado', [
            'token' => $request->input('token'),
            'platform' => $request->input('platform'),
            'headers' => $request->headers->all(),
        ]);

        return response()->json([
            'ok' => true,
            'message' => 'Token recibido en endpoint de test',
            'received' => [
                'token' => $request->input('token'),
                'platform' => $request->input('platform'),
            ]
        ]);
    }
}
