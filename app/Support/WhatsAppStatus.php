<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

class WhatsAppStatus
{
    private const STATUS_KEY = 'whatsapp:status';
    private const QR_KEY = 'whatsapp:qr';
    private const QR_GENERATED_AT_KEY = 'whatsapp:qr_generated_at';
    private const LAST_READY_AT_KEY = 'whatsapp:last_ready_at';
    private const LAST_DISCONNECTED_AT_KEY = 'whatsapp:last_disconnected_at';
    private const LAST_DISCONNECT_REASON_KEY = 'whatsapp:last_disconnect_reason';

    /**
     * Retrieve the current integration snapshot that will be shared with the UI.
     *
     * @return array{status:string,qr:?string,generated_at:?string,last_ready_at:?string,last_disconnected_at:?string,last_disconnect_reason:?string}
     */
    public static function snapshot(): array
    {
        return [
            'status' => Cache::get(self::STATUS_KEY, 'disconnected'),
            'qr' => Cache::get(self::QR_KEY),
            'generated_at' => Cache::get(self::QR_GENERATED_AT_KEY),
            'last_ready_at' => Cache::get(self::LAST_READY_AT_KEY),
            'last_disconnected_at' => Cache::get(self::LAST_DISCONNECTED_AT_KEY),
            'last_disconnect_reason' => Cache::get(self::LAST_DISCONNECT_REASON_KEY),
        ];
    }

    public static function storeQr(string $qr): void
    {
        Cache::forget(self::LAST_DISCONNECT_REASON_KEY);
        Cache::forget(self::LAST_DISCONNECTED_AT_KEY);

        Cache::forever(self::QR_KEY, $qr);
        Cache::forever(self::QR_GENERATED_AT_KEY, now()->toIso8601String());
        Cache::forever(self::STATUS_KEY, 'pending');
    }

    public static function markReady(): void
    {
        Cache::forget(self::QR_KEY);
        Cache::forget(self::QR_GENERATED_AT_KEY);
        Cache::forever(self::STATUS_KEY, 'ready');
        Cache::forever(self::LAST_READY_AT_KEY, now()->toIso8601String());
    }

    public static function markDisconnected(?string $reason = null): void
    {
        Cache::forget(self::QR_KEY);
        Cache::forget(self::QR_GENERATED_AT_KEY);
        Cache::forever(self::STATUS_KEY, 'disconnected');

        Cache::forever(self::LAST_DISCONNECTED_AT_KEY, now()->toIso8601String());

        if ($reason !== null && $reason !== '') {
            Cache::forever(self::LAST_DISCONNECT_REASON_KEY, $reason);
        }
    }
}
