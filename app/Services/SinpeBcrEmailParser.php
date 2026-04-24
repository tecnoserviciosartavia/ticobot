<?php

namespace App\Services;

use Carbon\Carbon;

class SinpeBcrEmailParser
{
    /**
     * @return array<string,mixed>|null
     */
    public function parse(string $rawBody): ?array
    {
        $text = $this->normalizeBody($rawBody);
        $scan = $this->stripAccents($text);

        if (! preg_match('/transaccion\s+sinpe\s+movil/i', $scan)) {
            return null;
        }

            // Solo procesar correos de acreditación (créditos), ignorar débitos.
            if (! preg_match('/acreditado/i', $scan)) {
                return null;
            }

        $reference = $this->extract('/Numero\s+de\s+referencia\s*:\s*([0-9]{10,})/i', $scan);
        $originPhoneRaw = $this->extract('/Telefono\s+origen\s*:\s*([0-9\s\-]+)/i', $scan);
        $originName = $this->extract('/Nombre\s+cliente\s+origen\s*:\s*(.+)/i', $scan);
        $motive = $this->extract('/Motivo\s*:\s*(.+)/i', $scan);
        $amountRaw = $this->extract('/Monto\s*:\s*([0-9\.,]+)/i', $scan);
        $performedAtRaw = $this->extract('/Esta\s+transaccion\s+fue\s+realizada\s+el\s+(.+)/i', $scan);

        if (! $reference || ! $amountRaw) {
            return null;
        }

        $amount = $this->normalizeAmount($amountRaw);
        $originPhone = preg_replace('/\D+/', '', (string) $originPhoneRaw);
        $performedAt = $this->parsePerformedAt($performedAtRaw);

        return [
            'reference' => trim($reference),
            'origin_phone' => $originPhone ?: null,
            'origin_name' => $originName ? trim($originName) : null,
            'motive' => $motive ? trim($motive) : null,
            'amount' => $amount,
            'performed_at' => $performedAt?->toDateTimeString(),
            'raw_excerpt' => mb_substr($text, 0, 1500),
        ];
    }

    private function normalizeBody(string $rawBody): string
    {
        $clean = strip_tags(html_entity_decode($rawBody, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $clean = preg_replace('/\r\n|\r/', "\n", $clean) ?? $clean;
        $clean = preg_replace('/[\t ]+/', ' ', $clean) ?? $clean;
        $clean = preg_replace('/\n{2,}/', "\n", $clean) ?? $clean;

        return trim($clean);
    }

    private function stripAccents(string $value): string
    {
        return str_replace(
            ['á', 'é', 'í', 'ó', 'ú', 'Á', 'É', 'Í', 'Ó', 'Ú', 'ä', 'ë', 'ï', 'ö', 'ü', 'Ä', 'Ë', 'Ï', 'Ö', 'Ü', 'ñ', 'Ñ'],
            ['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U', 'a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U', 'n', 'N'],
            $value
        );
    }

    private function extract(string $pattern, string $text): ?string
    {
        if (! preg_match($pattern, $text, $matches)) {
            return null;
        }

        return isset($matches[1]) ? trim((string) $matches[1]) : null;
    }

    private function normalizeAmount(string $value): float
    {
        $v = trim($value);
        // Formato esperado en correo BCR: 2,000.00
        $v = str_replace(',', '', $v);

        return round((float) $v, 2);
    }

    private function parsePerformedAt(?string $value): ?Carbon
    {
        if (! $value) {
            return null;
        }

        $raw = trim($value);
        $tz = (string) config('app.timezone', 'America/Costa_Rica');

        // Ejemplo: 22/04/2026 a las 11:00 AM
        if (preg_match('/(\d{2}\/\d{2}\/\d{4})\s+a\s+las\s+(\d{1,2}:\d{2})\s*([AP]M)/i', $raw, $m)) {
            $composed = strtoupper("{$m[1]} {$m[2]} {$m[3]}");
            try {
                return Carbon::createFromFormat('d/m/Y h:i A', $composed, $tz);
            } catch (\Throwable) {
                return null;
            }
        }

        return null;
    }
}
