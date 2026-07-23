<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\JsonResponse;

class WhatsAppStatusController extends Controller
{
    public function getStatus(WhatsAppNotificationService $whatsApp): JsonResponse
    {
        return response()->json(['status' => $whatsApp->isMetaConfigured() ? 'ready' : 'not_configured', 'transport' => 'meta_cloud_api', 'qr' => null]);
    }
}
