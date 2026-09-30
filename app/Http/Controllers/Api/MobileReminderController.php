<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\ReminderController as WebReminderController;
use App\Models\Reminder;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\JsonResponse;
class MobileReminderController extends Controller {
 public function retry(Reminder $reminder, WebReminderController $web): JsonResponse { $web->retry($reminder); return response()->json(['ok'=>true,'message'=>'Recordatorio preparado para reintento.']); }
 public function send(Reminder $reminder, WebReminderController $web, WhatsAppNotificationService $whatsApp): JsonResponse { $response=$web->sendManually($reminder,$whatsApp); return $response instanceof JsonResponse?$response:response()->json(['ok'=>true,'message'=>'Recordatorio enviado manualmente.']); }
}
