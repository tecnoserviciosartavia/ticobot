<?php

namespace App\Services;

use App\Models\PushDeviceToken;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PushNotificationService
{
    public function sendToToken(string $token, string $title, string $body, array $data = []): bool
    {
        $serverKey = (string) config('services.fcm.server_key');
        if ($serverKey === '') {
            Log::warning('FCM no configurado: services.fcm.server_key está vacío.');
            return false;
        }

        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'Authorization' => 'key=' . $serverKey,
                    'Content-Type' => 'application/json',
                ])
                ->post('https://fcm.googleapis.com/fcm/send', [
                    'to' => $token,
                    'priority' => 'high',
                    'notification' => [
                        'title' => $title,
                        'body' => $body,
                    ],
                    'data' => $data,
                ]);

            if (! $response->successful()) {
                Log::warning('FCM respondió con error HTTP', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return false;
            }

            $json = $response->json();
            $failed = (int) ($json['failure'] ?? 0);
            if ($failed > 0) {
                $error = (string) ($json['results'][0]['error'] ?? 'unknown');
                if (in_array($error, ['NotRegistered', 'InvalidRegistration'], true)) {
                    PushDeviceToken::query()->where('token', $token)->update(['is_active' => false]);
                }
                Log::warning('FCM entregó error por token', [
                    'token' => substr($token, 0, 24) . '...',
                    'error' => $error,
                ]);
                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::error('Error enviando push FCM', [
                'message' => $e->getMessage(),
            ]);
            return false;
        }
    }
}
