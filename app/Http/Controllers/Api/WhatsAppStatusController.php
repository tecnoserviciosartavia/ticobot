<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

class WhatsAppStatusController extends Controller
{
    public function getStatus(WhatsAppNotificationService $whatsApp): JsonResponse
    {
        if (! $whatsApp->isMetaConfigured()) {
            return response()->json([
                'status' => 'not_configured',
                'transport' => 'meta_cloud_api',
                'qr' => null,
                'is_restricted' => false,
                'balance_due' => null,
                'currency' => null,
            ]);
        }

        $accountStatus = $this->accountStatusFromMeta();

        return response()->json([
            'status' => $accountStatus['status'],
            'transport' => 'meta_cloud_api',
            'qr' => null,
            'is_restricted' => $accountStatus['is_restricted'],
            'balance_due' => $accountStatus['balance_due'],
            'currency' => $accountStatus['currency'],
            'message' => $accountStatus['message'],
        ]);
    }

    protected function cachedRestrictionStatus(): ?array
    {
        $cachePath = storage_path('app/whatsapp_meta_restriction.json');
        if (! is_file($cachePath)) {
            return null;
        }

        try {
            $payload = json_decode((string) file_get_contents($cachePath), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return null;
        }

        if (! is_array($payload) || empty($payload['status']) || ! ($payload['is_restricted'] ?? false)) {
            return null;
        }

        $updatedAt = $payload['updated_at'] ?? null;
        if (is_string($updatedAt) && ! empty($updatedAt)) {
            try {
                $dt = new \DateTimeImmutable($updatedAt);
                if ($dt->diff(new \DateTimeImmutable('now'))->days > 7) {
                    return null;
                }
            } catch (\Throwable) {
                // Ignorar tiempos inválidos.
            }
        }

        return [
            'status' => 'restricted',
            'is_restricted' => true,
            'balance_due' => isset($payload['balance_due']) && is_numeric($payload['balance_due']) ? (float) $payload['balance_due'] : null,
            'currency' => is_string($payload['currency'] ?? null) ? strtoupper($payload['currency']) : null,
            'message' => is_string($payload['message'] ?? null) ? $payload['message'] : 'Cuenta de WhatsApp Business restringida',
        ];
    }

    protected function mapMetaErrorToStatus(string $errorMessage): array
    {
        $message = trim($errorMessage);

        if ($message === '') {
            return ['status' => 'error', 'is_restricted' => false, 'balance_due' => null, 'currency' => null, 'message' => 'Meta respondió con error'];
        }

        $lower = strtolower($message);
        $balanceMatch = [];
        preg_match('/\$?([0-9]+(?:[.,][0-9]{2})?)\s*(USD|CRC|EUR|MXN)?/i', $message, $balanceMatch);

        $amount = null;
        $currency = null;
        if (isset($balanceMatch[1])) {
            $amount = (float) str_replace(',', '', $balanceMatch[1]);
            $currency = strtoupper((string) ($balanceMatch[2] ?? 'USD'));
        }

        if (str_contains($lower, 'restricted') || str_contains($lower, 'pending balance') || str_contains($lower, 'unpaid balance')) {
            return [
                'status' => 'restricted',
                'is_restricted' => true,
                'balance_due' => $amount,
                'currency' => $currency,
                'message' => $message,
            ];
        }

        if (str_contains($lower, 'session has expired') || str_contains($lower, 'invalid_token') || str_contains($lower, 'error validating access token') || str_contains($lower, 'oauthexception') && str_contains($lower, '190')) {
            return [
                'status' => 'token_expired',
                'is_restricted' => false,
                'balance_due' => null,
                'currency' => null,
                'message' => 'El token de Meta expiró o quedó inválido. Renueva la autenticación para volver a enviar mensajes.',
            ];
        }

        if (
            str_contains($lower, 'business solution provider')
            || str_contains($lower, 'do not have permission')
            || str_contains($lower, 'permission to perform this action')
            || str_contains($lower, 'missing permissions')
            || str_contains($lower, 'cannot be loaded due to missing permissions')
            || str_contains($lower, 'permission required')
            || str_contains($lower, 'not authorized')
            || str_contains($lower, 'not allowed')
            || str_contains($lower, 'bsp')
        ) {
            return [
                'status' => 'permission_required',
                'is_restricted' => false,
                'balance_due' => null,
                'currency' => null,
                'message' => 'La cuenta de Meta necesita permisos de Business Solution Provider para enviar mensajes.',
            ];
        }

        return [
            'status' => 'error',
            'is_restricted' => false,
            'balance_due' => null,
            'currency' => null,
            'message' => $message,
        ];
    }

    public function accountStatusFromMeta(): array
    {
        $cached = $this->cachedRestrictionStatus();
        if ($cached !== null) {
            return $cached;
        }

        $token = trim((string) config('services.whatsapp.token', ''));
        $phoneId = trim((string) config('services.whatsapp.phone_id', ''));
        $wabaId = trim((string) config('services.whatsapp.waba_id', ''));
        $version = trim((string) config('services.whatsapp.version', 'v18.0'));

        if ($token === '' || $phoneId === '') {
            return ['status' => 'not_configured', 'is_restricted' => false, 'balance_due' => null, 'currency' => null, 'message' => 'Meta no configurado'];
        }

        try {
            $metaBase = 'https://graph.facebook.com/'.$version;

            $phoneResponse = Http::timeout(20)
                ->withHeaders([
                    'Authorization' => 'Bearer '.$token,
                    'Accept' => 'application/json',
                ])
                ->get($metaBase.'/'.$phoneId, [
                    'fields' => 'id,display_phone_number,quality_rating,verified_name',
                ]);

            if (! $phoneResponse->successful()) {
                $payload = $phoneResponse->json();
                $errorMessage = (string) data_get($payload, 'error.message', '');

                return $this->mapMetaErrorToStatus($errorMessage);
            }

            if ($wabaId !== '') {
                $wabaResponse = Http::timeout(20)
                    ->withHeaders([
                        'Authorization' => 'Bearer '.$token,
                        'Accept' => 'application/json',
                    ])
                    ->get($metaBase.'/'.$wabaId, [
                        'fields' => 'id,name,owner_business,account_status',
                    ]);

                if (! $wabaResponse->successful()) {
                    $payload = $wabaResponse->json();
                    $errorMessage = (string) data_get($payload, 'error.message', '');

                    return $this->mapMetaErrorToStatus($errorMessage);
                }

                $wabaPayload = $wabaResponse->json();
                $accountStatus = data_get($wabaPayload, 'account_status');
                $ownerBusiness = data_get($wabaPayload, 'owner_business.id');

                if (is_string($accountStatus) && strtolower($accountStatus) === 'suspended') {
                    return [
                        'status' => 'restricted',
                        'is_restricted' => true,
                        'balance_due' => null,
                        'currency' => null,
                        'message' => 'La cuenta de WhatsApp Business está suspendida por Meta.',
                    ];
                }

                $billingResponse = Http::timeout(20)
                    ->withHeaders([
                        'Authorization' => 'Bearer '.$token,
                        'Accept' => 'application/json',
                    ])
                    ->get($metaBase.'/'.$wabaId.'/billing_and_payment');

                if (! $billingResponse->successful()) {
                    $payload = $billingResponse->json();
                    $errorMessage = (string) data_get($payload, 'error.message', '');

                    return $this->mapMetaErrorToStatus($errorMessage);
                }

                $billingPayload = $billingResponse->json();
                $billingStatus = data_get($billingPayload, 'status');
                $billingAmount = data_get($billingPayload, 'balance_due');

                if (is_string($billingStatus) && strtolower($billingStatus) === 'restricted') {
                    return [
                        'status' => 'restricted',
                        'is_restricted' => true,
                        'balance_due' => is_numeric($billingAmount) ? (float) $billingAmount : null,
                        'currency' => is_string(data_get($billingPayload, 'currency')) ? strtoupper((string) data_get($billingPayload, 'currency')) : null,
                        'message' => 'La cuenta de WhatsApp Business está restringida por pagos pendientes.',
                    ];
                }

                if (is_string($ownerBusiness) && $ownerBusiness !== '' && $ownerBusiness !== $wabaId) {
                    return [
                        'status' => 'permission_required',
                        'is_restricted' => false,
                        'balance_due' => null,
                        'currency' => null,
                        'message' => 'El token no tiene acceso al negocio correcto asociado a este WABA.',
                    ];
                }
            }

            return ['status' => 'ready', 'is_restricted' => false, 'balance_due' => null, 'currency' => null, 'message' => 'Cuenta activa'];
        } catch (\Throwable $e) {
            return ['status' => 'error', 'is_restricted' => false, 'balance_due' => null, 'currency' => null, 'message' => $e->getMessage()];
        }
    }
}
