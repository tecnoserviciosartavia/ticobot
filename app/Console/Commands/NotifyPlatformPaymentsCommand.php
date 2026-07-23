<?php

namespace App\Console\Commands;

use App\Models\Contract;
use App\Models\PushDeviceToken;
use App\Models\PushWebSubscription;
use App\Models\Service;
use App\Models\User;
use App\Services\PushNotificationService;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NotifyPlatformPaymentsCommand extends Command
{
    protected $signature = 'services:notify-platform-payments';

    protected $description = 'Envía recordatorios a admins cuando vence el costo fijo mensual de una plataforma';

    public function handle(WhatsAppNotificationService $whatsApp, PushNotificationService $push): int
    {
        $tz = (string) config('app.timezone', 'America/Costa_Rica');
        $today = Carbon::today($tz);
        $todayDate = $today->toDateString();

        $phones = $this->adminPhones();
        if (count($phones) === 0) {
            $this->warn('No hay teléfonos de admin configurados en BOT_ADMIN_PHONES.');
            return self::SUCCESS;
        }

        $services = Service::query()
            ->where('is_active', true)
            ->whereNotNull('payment_day')
            ->where('cost', '>', 0)
            ->orderBy('name')
            ->get();

        $sent = 0;
        $pushSent = 0;
        foreach ($services as $service) {
            $paymentDay = (int) ($service->payment_day ?? 0);
            if ($paymentDay < 1) {
                continue;
            }

            $dueDayThisMonth = min($paymentDay, (int) $today->copy()->endOfMonth()->day);
            if ((int) $today->day !== $dueDayThisMonth) {
                continue;
            }

            $dueDate = $todayDate;
            foreach ($phones as $phone) {
                $alreadySent = DB::table('service_payment_notifications')
                    ->where('service_id', $service->id)
                    ->where('due_date', $dueDate)
                    ->where('phone', $phone)
                    ->exists();

                if ($alreadySent) {
                    continue;
                }

                $message = $this->buildMessage($service->name, (float) $service->cost, (string) $service->currency, $dueDate, $service->account_email);
                $ok = $whatsApp->sendTextMessage($phone, $message);
                if (! $ok) {
                    $this->warn("No se pudo notificar {$phone} para servicio {$service->name}.");
                    continue;
                }

                DB::table('service_payment_notifications')->insert([
                    'service_id' => $service->id,
                    'due_date' => $dueDate,
                    'phone' => $phone,
                    'sent_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $sent++;
            }

            $pushTokens = PushDeviceToken::query()
                ->where('is_active', true)
                ->pluck('token');
            $webSubscriptions = PushWebSubscription::query()
                ->with('user:id,push_notification_preferences')
                ->where('is_active', true)
                ->get();

            foreach ($pushTokens as $token) {
                $alreadyPushSent = DB::table('service_payment_push_notifications')
                    ->where('service_id', $service->id)
                    ->where('due_date', $dueDate)
                    ->where('token', $token)
                    ->exists();

                if ($alreadyPushSent) {
                    continue;
                }

                $title = 'Costo mensual por pagar';
                $body = sprintf(
                    '%s · %s%s · vence %s',
                    $service->name,
                    strtoupper((string) $service->currency) === 'USD' ? '$' : 'CRC ',
                    number_format((float) $service->cost, 2, '.', ','),
                    $dueDate
                );

                $ok = $push->sendToToken((string) $token, $title, $body, [
                    'type' => 'platform_cost_due',
                    'service_id' => (string) $service->id,
                    'due_date' => $dueDate,
                ]);

                if (! $ok) {
                    continue;
                }

                DB::table('service_payment_push_notifications')->insert([
                    'service_id' => $service->id,
                    'due_date' => $dueDate,
                    'token' => (string) $token,
                    'sent_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $pushSent++;
            }

            foreach ($webSubscriptions as $subscription) {
                $subscriptionKey = $this->webSubscriptionNotificationKey($subscription);
                $alreadyPushSent = DB::table('service_payment_push_notifications')
                    ->where('service_id', $service->id)
                    ->where('due_date', $dueDate)
                    ->where('token', $subscriptionKey)
                    ->exists();

                if ($alreadyPushSent) {
                    continue;
                }

                $title = 'Costo mensual por pagar';
                $body = sprintf(
                    '%s · %s%s · vence %s',
                    $service->name,
                    strtoupper((string) $service->currency) === 'USD' ? '$' : 'CRC ',
                    number_format((float) $service->cost, 2, '.', ','),
                    $dueDate
                );

                $ok = $push->sendToWebSubscription($subscription, $title, $body, [
                    'type' => 'platform_cost_due',
                    'service_id' => (string) $service->id,
                    'due_date' => $dueDate,
                    'url' => route('settings.index'),
                ]);

                if (! $ok) {
                    continue;
                }

                DB::table('service_payment_push_notifications')->insert([
                    'service_id' => $service->id,
                    'due_date' => $dueDate,
                    'token' => $subscriptionKey,
                    'sent_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $pushSent++;
            }
        }

        $dailyExpectedPushSent = $this->sendDailyExpectedPaymentsSummary($push, $today);

        $this->info("Recordatorios de costos de plataforma enviados: {$sent} (WhatsApp), {$pushSent} (Push app), {$dailyExpectedPushSent} (Resumen diario esperado)");
        return self::SUCCESS;
    }

    private function sendDailyExpectedPaymentsSummary(PushNotificationService $push, Carbon $today): int
    {
        $summaryDate = $today->toDateString();
        $sent = 0;

        $contractsDueToday = Contract::query()
            ->whereNotNull('next_due_date')
            ->whereDate('next_due_date', $summaryDate)
            ->get(['id', 'amount', 'currency', 'next_due_date']);

        $count = 0;
        $totalsByCurrency = [];

        foreach ($contractsDueToday as $contract) {
            $dueDate = Carbon::parse((string) $contract->next_due_date);
            $monthStart = $dueDate->copy()->startOfMonth();
            $monthEnd = $dueDate->copy()->endOfMonth();

            // Si ya existe un pago registrado en el mes del due, no contamos este cobro como esperado.
            $hasPaymentForDueMonth = DB::table('payments')
                ->where('contract_id', $contract->id)
                ->whereBetween('created_at', [$monthStart, $monthEnd])
                ->exists();

            if ($hasPaymentForDueMonth) {
                continue;
            }

            $currency = strtoupper((string) ($contract->currency ?: 'CRC'));
            if (! isset($totalsByCurrency[$currency])) {
                $totalsByCurrency[$currency] = 0.0;
            }

            $totalsByCurrency[$currency] += (float) ($contract->amount ?? 0);
            $count++;
        }

        $title = 'Resumen diario de pagos esperados';
        $body = $this->buildDailyExpectedSummaryBody($count, $totalsByCurrency);

        $tokens = PushDeviceToken::query()
            ->with('user:id,push_notification_preferences')
            ->where('is_active', true)
            ->get(['user_id', 'token']);
        $webSubscriptions = PushWebSubscription::query()
            ->with('user:id,push_notification_preferences')
            ->where('is_active', true)
            ->get();

        foreach ($tokens as $device) {
            $token = (string) $device->token;
            if ($token === '') {
                continue;
            }

            if (! $this->shouldReceiveDailyExpectedPush($device)) {
                continue;
            }

            $alreadySent = DB::table('daily_expected_payment_push_notifications')
                ->where('summary_date', $summaryDate)
                ->where('token', $token)
                ->exists();

            if ($alreadySent) {
                continue;
            }

            $ok = $push->sendToToken($token, $title, $body, [
                'type' => 'daily_expected_payments',
                'summary_date' => $summaryDate,
                'count' => (string) $count,
                'totals' => json_encode(array_map(fn ($value) => round((float) $value, 2), $totalsByCurrency), JSON_UNESCAPED_UNICODE),
            ]);

            if (! $ok) {
                continue;
            }

            DB::table('daily_expected_payment_push_notifications')->insert([
                'summary_date' => $summaryDate,
                'token' => $token,
                'sent_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $sent++;
        }

        foreach ($webSubscriptions as $subscription) {
            if (! $this->shouldReceiveDailyExpectedPush($subscription)) {
                continue;
            }

            $subscriptionKey = $this->webSubscriptionNotificationKey($subscription);
            $alreadySent = DB::table('daily_expected_payment_push_notifications')
                ->where('summary_date', $summaryDate)
                ->where('token', $subscriptionKey)
                ->exists();

            if ($alreadySent) {
                continue;
            }

            $ok = $push->sendToWebSubscription($subscription, $title, $body, [
                'type' => 'daily_expected_payments',
                'summary_date' => $summaryDate,
                'count' => (string) $count,
                'totals' => json_encode(array_map(fn ($value) => round((float) $value, 2), $totalsByCurrency), JSON_UNESCAPED_UNICODE),
                'url' => route('dashboard'),
            ]);

            if (! $ok) {
                continue;
            }

            DB::table('daily_expected_payment_push_notifications')->insert([
                'summary_date' => $summaryDate,
                'token' => $subscriptionKey,
                'sent_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $sent++;
        }
        return $sent;
    }

    private function shouldReceiveDailyExpectedPush(object $device): bool
    {
        $prefs = $device->user?->push_notification_preferences;
        if (! is_array($prefs)) {
            return true;
        }

        return (bool) ($prefs['daily_expected_payments'] ?? true);
    }


    private function webSubscriptionNotificationKey(PushWebSubscription $subscription): string
    {
        return 'web:' . $subscription->endpoint_hash;
    }

    /**
     * @param array<string,float> $totalsByCurrency
     */
    private function buildDailyExpectedSummaryBody(int $count, array $totalsByCurrency): string
    {
        if ($count <= 0) {
            return 'Hoy no hay pagos esperados.';
        }

        ksort($totalsByCurrency);

        $parts = [];
        foreach ($totalsByCurrency as $currency => $amount) {
            $symbol = $currency === 'USD' ? '$' : ($currency === 'CRC' ? 'CRC ' : $currency . ' ');
            $parts[] = $currency . ' ' . $symbol . number_format((float) $amount, 2, '.', ',');
        }

        if (count($parts) === 1) {
            return sprintf('Hoy: %d pagos esperados por %s.', $count, $parts[0]);
        }

        return sprintf('Hoy: %d pagos esperados. Totales: %s.', $count, implode(' | ', $parts));
    }

    private function adminPhones(): array
    {
        $phones = [];

        // Primero: teléfonos de usuarios con profile_type = 'admin' en la BD
        $adminUsers = User::whereIn('profile_type', ['admin', null])
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->pluck('phone');

        foreach ($adminUsers as $phone) {
            $digits = preg_replace('/\D+/', '', (string) $phone);
            if (! $digits) {
                continue;
            }
            if (strlen($digits) === 8) {
                $digits = '506' . $digits;
            }
            if (strlen($digits) < 8 || strlen($digits) > 15) {
                continue;
            }
            $phones[] = $digits;
        }

        // Fallback: variable de entorno BOT_ADMIN_PHONES si no hay admins con teléfono
        if (empty($phones)) {
            $raw = (string) env('BOT_ADMIN_PHONES', '');
            foreach (explode(',', $raw) as $item) {
                $digits = preg_replace('/\D+/', '', (string) $item);
                if (! $digits) {
                    continue;
                }
                if (strlen($digits) === 8) {
                    $digits = '506' . $digits;
                }
                if (strlen($digits) < 8 || strlen($digits) > 15) {
                    continue;
                }
                $phones[] = $digits;
            }
        }

        return array_values(array_unique($phones));
    }

    private function buildMessage(string $serviceName, float $cost, string $currency, string $dueDate, ?string $accountEmail = null): string
    {
        $symbol = strtoupper($currency) === 'USD' ? '$' : 'CRC '; 
        $amount = number_format($cost, 2, '.', ',');
        $emailLine = $accountEmail ? "\nCuenta: {$accountEmail}" : '';

        return "Recordatorio de costo mensual de plataforma\n\nServicio: {$serviceName}{$emailLine}\nTipo: costo fijo mensual de la plataforma\nCosto fijo mensual: {$symbol}{$amount}\nFecha de pago: {$dueDate}.\nNo corresponde al cobro por uso al cliente.";
    }
}
