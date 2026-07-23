<?php

namespace App\Services;

use App\Models\Payment;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;

class ConciliationPdfService
{
    /**
     * Genera un PDF de recibo conciliado para un pago
     *
     * @return string Path absoluto del PDF generado
     */
    public function generateConciliationReceipt(Payment $payment, int $months = 1): string
    {
        $payment->loadMissing(['client', 'contract.services']);

        // Obtener el logo de la empresa si existe
        $logoPath = public_path('images/logo.png');
        $logoData = null;
        if (file_exists($logoPath)) {
            $logoData = base64_encode(file_get_contents($logoPath));
        }

        $paidAt = $payment->paid_at ? Carbon::parse($payment->paid_at) : Carbon::now();
        $contract = $payment->contract;
        $monthlyAmount = $contract ? (float) $contract->amount : ($months > 0 ? ((float) $payment->amount / max($months, 1)) : (float) $payment->amount);
        $total = (float) $payment->amount;

        $coveredMonths = $this->resolveCoveredYearMonths($payment, $months);
        $monthsCount = count($coveredMonths) > 0 ? count($coveredMonths) : max(1, $months);

        $servicesLabel = $contract ? $contract->servicesLabelForMessaging() : '';
        $periodLabel = $this->formatCoveredMonthsLabel($coveredMonths);

        $graceMonths = (int) (is_array($payment->metadata) ? ($payment->metadata['grace_months'] ?? 0) : 0);

        $data = [
            'client_name' => $payment->client ? $payment->client->name : 'Cliente',
            'balance' => 0.00,
            'ticket_id' => str_pad((string) $payment->id, 6, '0', STR_PAD_LEFT),
            'initial_balance' => $total,
            'total_transactions' => -$total,
            'final_balance' => 0.00,
            'date' => $paidAt->format('Y-m-d'),
            'concept' => $this->getPaymentConcept($payment, $monthsCount, $coveredMonths),
            'amount' => $total,
            'currency' => $payment->currency ?? 'CRC',
            'months' => $monthsCount,
            'logo_data' => $logoData,
            'services_label' => $servicesLabel,
            'period_label' => $periodLabel,
            'monthly_amount' => $monthlyAmount,
            'grace_months' => $graceMonths,
        ];

        $pdf = Pdf::loadView('pdf.conciliation-receipt', $data)
            ->setPaper('a6', 'portrait');

        $filename = "conciliation-{$payment->id}-" . time() . '.pdf';
        $path = "conciliations/{$filename}";

        Storage::disk('public')->put($path, $pdf->output());

        return Storage::disk('public')->path($path);
    }

    public function generateWhatsAppMessage(Payment $payment, int $months): string
    {
        $payment->loadMissing('contract.services');
        $meta = is_array($payment->metadata) ? $payment->metadata : [];
        $covered = $meta['covered_months'] ?? null;
        $coveredList = [];

        if (is_array($covered)) {
            foreach ($covered as $ym) {
                if (is_string($ym) && preg_match('/^\d{4}-\d{2}$/', $ym) === 1) {
                    $coveredList[] = $ym;
                }
            }
            sort($coveredList);
            $coveredList = array_values(array_unique($coveredList));
        }

        $period = $this->formatCoveredMonthsLabel($coveredList);
        $services = $payment->contract ? $payment->contract->servicesLabelForMessaging() : '';

        $monthText = $months === 1 ? '1 mes' : "{$months} meses";

        $msg = "¡Pago recibido! ";

        if ($period !== '') {
            $msg .= "Este pago aplica a los siguientes períodos: {$period}. ";
        } else {
            $msg .= "Tu suscripción actual cubre {$monthText}. ";
        }

        if ($services !== '') {
            $msg .= "Servicios: {$services}. ";
        }

        $msg .= 'Tres días antes de que finalice el período pagado, te escribiremos por si deseas renovar.';

        $grace = (int) ($meta['grace_months'] ?? 0);
        if ($grace > 0) {
            $msg .= " Incluye {$grace} mes(es) adicional(es) de cortesía.";
        }

        $msg .= "\n\n¡Gracias por tu preferencia!";

        return $msg;
    }

    /**
     * @param  array<int, string>  $coveredYms  Lista ordenada de YYYY-MM
     */
    private function getPaymentConcept(Payment $payment, int $months, array $coveredYms): string
    {
        if ($coveredYms !== []) {
            $period = $this->formatCoveredMonthsLabel($coveredYms);

            return $period !== '' ? "Pago — {$period}" : "Pago — {$months} meses";
        }

        $baseMonth = Carbon::now(config('app.timezone'))->startOfMonth();
        $paidForMonth = is_array($payment->metadata ?? null) ? ($payment->metadata['paid_for_month'] ?? null) : null;

        if (is_string($paidForMonth) && preg_match('/^\d{4}-\d{2}$/', $paidForMonth) === 1) {
            try {
                $baseMonth = Carbon::createFromFormat('Y-m-d', $paidForMonth . '-01', config('app.timezone'))->startOfMonth();
            } catch (\Throwable) {
                // fallback
            }
        }

        $currentMonth = mb_convert_case($baseMonth->copy()->locale('es')->isoFormat('MMMM'), MB_CASE_TITLE, 'UTF-8');

        if ($months === 1) {
            return "Pago de {$currentMonth}";
        }

        if ($months === 2) {
            $nextMonth = mb_convert_case(
                $baseMonth->copy()->addMonth()->locale('es')->isoFormat('MMMM'),
                MB_CASE_TITLE,
                'UTF-8',
            );

            return "Pago de {$currentMonth} y {$nextMonth}";
        }

        return "Pago de {$months} meses";
    }

    /**
     * @return array<int, string>
     */
    private function resolveCoveredYearMonths(Payment $payment, int $fallbackCount): array
    {
        $meta = $payment->metadata ?? [];

        if (! empty($meta['covered_months']) && is_array($meta['covered_months'])) {
            $clean = [];

            foreach ($meta['covered_months'] as $ym) {
                if (is_string($ym) && preg_match('/^\d{4}-\d{2}$/', $ym) === 1) {
                    $clean[] = $ym;
                }
            }

            if ($clean !== []) {
                $clean = array_values(array_unique($clean));
                sort($clean);

                return $clean;
            }
        }

        return [];
    }

    /**
     * @param  array<int, string>  $yMs
     */
    public function formatCoveredMonthsLabel(array $yMs): string
    {
        if ($yMs === []) {
            return '';
        }

        $tz = config('app.timezone');
        $parts = [];

        foreach ($yMs as $ym) {
            try {
                $d = Carbon::createFromFormat('Y-m-d', $ym . '-01', $tz);
                $parts[] = mb_convert_case($d->locale('es')->isoFormat('MMMM YYYY'), MB_CASE_TITLE, 'UTF-8');
            } catch (\Throwable) {
                $parts[] = $ym;
            }
        }

        return implode(', ', $parts);
    }

    public function calculateMonthsFromPayment(Payment $payment): int
    {
        $meta = is_array($payment->metadata) ? $payment->metadata : [];

        if (! empty($meta['covered_months']) && is_array($meta['covered_months'])) {
            $n = 0;

            foreach ($meta['covered_months'] as $ym) {
                if (is_string($ym) && preg_match('/^\d{4}-\d{2}$/', $ym) === 1) {
                    $n++;
                }
            }

            if ($n > 0) {
                return $n;
            }
        }

        if (isset($meta['months']) && is_numeric($meta['months'])) {
            return max(1, (int) $meta['months']);
        }

        $payment->loadMissing('contract');

        if ($payment->contract && (float) $payment->contract->amount > 0) {
            return max(1, (int) floor((float) $payment->amount / (float) $payment->contract->amount));
        }

        return 1;
    }
}
