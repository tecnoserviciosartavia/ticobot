<?php

namespace App\Services;

use App\Models\Payment;
use Carbon\Carbon;

class ConciliationKeyService
{
    /**
     * Genera un key único para evitar duplicados entre canales.
     * Usa centavos enteros para evitar pérdida de decimales.
     * Incluye referencia SINPE cuando está disponible para unicidad real por comprobante.
     *
     * Formato con referencia: {client_id}_{amount_cents}_{currency}_{billing_month}_{reference}
     * Formato sin referencia: {client_id}_{amount_cents}_{currency}_{billing_month}
     *
     * @param Payment $payment
     * @param string|null $billingMonth Formato Y-m (ej: 2026-04)
     * @return string
     */
    public static function generateKey(Payment $payment, ?string $billingMonth = null): string
    {
        $clientId = (int) $payment->client_id;
        // Usar centavos enteros para preservar decimales exactos (10500.50 → 1050050)
        $amountCents = (int) round((float) ($payment->amount ?? 0) * 100);
        $currency = $payment->currency ?? 'CRC';

        // Si no se proporciona billing_month, usar la fecha actual o la del pago
        if (!$billingMonth) {
            $paidAt = $payment->paid_at ? Carbon::parse($payment->paid_at) : now();
            $billingMonth = $paidAt->format('Y-m');
        }

        // Incluir referencia SINPE cuando existe para hacer la key verdaderamente única por comprobante
        $reference = self::extractSinpeReference($payment);
        if ($reference) {
            return "{$clientId}_{$amountCents}_{$currency}_{$billingMonth}_{$reference}";
        }

        return "{$clientId}_{$amountCents}_{$currency}_{$billingMonth}";
    }

    /**
     * Genera un key basado en parámetros individuales (útil en SINPE antes de crear Payment)
     *
     * @param int $clientId
     * @param float $amount
     * @param string $currency
     * @param string|null $billingMonth Formato Y-m
     * @param string|null $reference Referencia SINPE para unicidad por comprobante
     * @return string
     */
    public static function generateKeyFromParams(int $clientId, float $amount, string $currency = 'CRC', ?string $billingMonth = null, ?string $reference = null): string
    {
        // Usar centavos enteros para preservar decimales exactos
        $amountCents = (int) round($amount * 100);

        if (!$billingMonth) {
            $billingMonth = now()->format('Y-m');
        }

        if ($reference) {
            return "{$clientId}_{$amountCents}_{$currency}_{$billingMonth}_{$reference}";
        }

        return "{$clientId}_{$amountCents}_{$currency}_{$billingMonth}";
    }

    /**
     * Extrae la referencia SINPE del pago o su metadata
     */
    private static function extractSinpeReference(Payment $payment): ?string
    {
        // Primero buscar en la referencia directa del pago
        if (!empty($payment->reference) && preg_match('/^\d{10,}$/', (string) $payment->reference)) {
            return (string) $payment->reference;
        }

        // Luego en metadata
        $metadata = is_array($payment->metadata) ? $payment->metadata : [];
        if (!empty($metadata['sinpe_email_reference']) && preg_match('/^\d{10,}$/', (string) $metadata['sinpe_email_reference'])) {
            return (string) $metadata['sinpe_email_reference'];
        }

        return null;
    }
}
