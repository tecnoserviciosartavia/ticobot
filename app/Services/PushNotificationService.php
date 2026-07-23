<?php

namespace App\Services;

use App\Models\PushDeviceToken;
use App\Models\PushWebSubscription;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\WebPush;

class PushNotificationService
{
    /**
     * Send a push notification to every active device whose owner has the given
     * preference enabled. If the preference is missing, it is treated as enabled
     * so older accounts keep receiving the alert by default.
     *
     * @return int number of successful deliveries
     */
    public function sendToActiveUsersWithPreference(
        string $preferenceKey,
        string $title,
        string $body,
        array $data = [],
    ): int {
        $sent = 0;

        $nativeDevices = PushDeviceToken::query()
            ->with('user:id,push_notification_preferences')
            ->where('is_active', true)
            ->get();

        foreach ($nativeDevices as $device) {
            $prefs = $device->user?->push_notification_preferences;
            if (is_array($prefs) && array_key_exists($preferenceKey, $prefs) && ! (bool) $prefs[$preferenceKey]) {
                continue;
            }

            if ($this->sendToToken((string) $device->token, $title, $body, $data)) {
                $sent++;
            }
        }

        $webSubscriptions = PushWebSubscription::query()
            ->with('user:id,push_notification_preferences')
            ->where('is_active', true)
            ->get();

        foreach ($webSubscriptions as $subscription) {
            $prefs = $subscription->user?->push_notification_preferences;
            if (is_array($prefs) && array_key_exists($preferenceKey, $prefs) && ! (bool) $prefs[$preferenceKey]) {
                continue;
            }

            if ($this->sendToWebSubscription($subscription, $title, $body, $data)) {
                $sent++;
            }
        }

        return $sent;
    }

    public function sendToToken(string $token, string $title, string $body, array $data = []): bool
    {
        $projectId = $this->projectId();
        if ($projectId === '') {
            Log::warning('FCM v1: no se pudo leer project_id del service account.');
            return false;
        }

        $accessToken = $this->accessToken();
        if ($accessToken === '') {
            Log::warning('FCM v1: no se pudo obtener access token del service account.');
            return false;
        }

        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'Authorization' => 'Bearer ' . $accessToken,
                    'Content-Type'  => 'application/json',
                ])
                ->post("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send", [
                    'message' => [
                        'token' => $token,
                        'android' => [
                            'priority' => 'high',
                        ],
                        'data' => $this->normalizeDataPayload([
                            ...$data,
                            'title' => $title,
                            'body' => $body,
                        ]),
                    ],
                ]);

            if ($response->successful()) {
                return true;
            }

            $json = $response->json();
            $status = (string) ($json['error']['status'] ?? '');

            if (in_array($status, ['UNREGISTERED', 'INVALID_ARGUMENT'], true)) {
                PushDeviceToken::query()->where('token', $token)->update(['is_active' => false]);
            }

            Log::warning('FCM v1 error', [
                'status'  => $response->status(),
                'error'   => $status,
                'token'   => substr($token, 0, 24) . '...',
            ]);

            return false;
        } catch (\Throwable $e) {
            Log::error('Error enviando push FCM v1', ['message' => $e->getMessage()]);
            return false;
        }
    }

    public function sendToWebSubscription(PushWebSubscription $subscription, string $title, string $body, array $data = []): bool
    {
        $webPush = $this->webPush();
        if (! $webPush) {
            Log::warning('Web push no configurado.');
            return false;
        }

        $browserSubscription = $subscription->subscription;
        if (! is_array($browserSubscription) || empty($browserSubscription['endpoint'])) {
            Log::warning('Web push: suscripción inválida.', ['subscription_id' => $subscription->id]);
            return false;
        }

        $payload = json_encode([
            'title' => $title,
            'body' => $body,
            'tag' => (string) ($data['tag'] ?? 'ticobot-push'),
            'data' => $this->normalizeDataPayload($data),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($payload === false) {
            Log::warning('Web push: no se pudo serializar el payload.', ['subscription_id' => $subscription->id]);
            return false;
        }

        try {
            $report = $webPush->sendOneNotification($browserSubscription, $payload, [
                'TTL' => 300,
                'urgency' => 'high',
            ]);

            if ($report->isSuccess()) {
                return true;
            }

            if ($report->isSubscriptionExpired()) {
                $subscription->update([
                    'is_active' => false,
                    'last_seen_at' => now(),
                ]);
            }

            Log::warning('Web push error', [
                'subscription_id' => $subscription->id,
                'endpoint' => $report->getEndpoint(),
                'reason' => $report->getReason(),
            ]);

            return false;
        } catch (\Throwable $e) {
            Log::error('Error enviando web push', [
                'subscription_id' => $subscription->id,
                'message' => $e->getMessage(),
            ]);
            return false;
        }
    }

    private function webPush(): ?WebPush
    {
        $subject = (string) config('services.webpush.subject', '');
        $publicKey = (string) config('services.webpush.public_key', '');
        $privateKey = (string) config('services.webpush.private_key', '');

        if ($subject === '' || $publicKey === '' || $privateKey === '') {
            return null;
        }

        return new WebPush([
            'VAPID' => [
                'subject' => $subject,
                'publicKey' => $publicKey,
                'privateKey' => $privateKey,
            ],
        ]);
    }

    private function normalizeDataPayload(array $data): array
    {
        return array_map(static fn ($value) => (string) $value, $data);
    }

    // -------------------------------------------------------------------------
    // Internals: OAuth2 via service account JWT (sin dependencias externas)
    // -------------------------------------------------------------------------

    private function serviceAccount(): array
    {
        $path = (string) config('services.fcm.service_account_path', '');
        if ($path === '' || ! file_exists($path)) {
            return [];
        }

        $content = file_get_contents($path);
        if ($content === false) {
            return [];
        }

        $decoded = json_decode($content, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function projectId(): string
    {
        $sa = $this->serviceAccount();
        return (string) ($sa['project_id'] ?? '');
    }

    private function accessToken(): string
    {
        return Cache::remember('fcm_v1_access_token', 3000, function () {
            return $this->fetchAccessToken();
        });
    }

    private function fetchAccessToken(): string
    {
        $sa = $this->serviceAccount();
        if (empty($sa['client_email']) || empty($sa['private_key'])) {
            return '';
        }

        $now = time();
        $payload = [
            'iss'   => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'iat'   => $now,
            'exp'   => $now + 3600,
        ];

        $jwt = $this->buildJwt($payload, $sa['private_key']);
        if ($jwt === '') {
            return '';
        }

        try {
            $response = Http::timeout(10)->asForm()->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ]);

            if (! $response->successful()) {
                Log::warning('FCM v1: error obteniendo access token', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                return '';
            }

            return (string) ($response->json('access_token') ?? '');
        } catch (\Throwable $e) {
            Log::error('FCM v1: excepción obteniendo access token', ['message' => $e->getMessage()]);
            return '';
        }
    }

    private function buildJwt(array $payload, string $privateKey): string
    {
        try {
            $header = $this->base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']) ?: '');
            $claims = $this->base64url(json_encode($payload) ?: '');
            $signingInput = $header . '.' . $claims;

            $signature = '';
            $ok = openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
            if (! $ok) {
                return '';
            }

            return $signingInput . '.' . $this->base64url($signature);
        } catch (\Throwable $e) {
            Log::error('FCM v1: error construyendo JWT', ['message' => $e->getMessage()]);
            return '';
        }
    }

    private function base64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
