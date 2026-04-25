<?php

namespace App\Services;

use App\Models\PushDeviceToken;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PushNotificationService
{
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
                        'token'        => $token,
                        'notification' => [
                            'title' => $title,
                            'body'  => $body,
                        ],
                        'android' => [
                            'priority' => 'high',
                        ],
                        'data' => array_map('strval', $data),
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
