<?php

namespace App\Console\Commands;

use App\Models\PushDeviceToken;
use App\Models\Service;
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

            $dueDate = $today->toDateString();
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
        }

        $this->info("Recordatorios de costos de plataforma enviados: {$sent} (WhatsApp), {$pushSent} (Push app)");
        return self::SUCCESS;
    }

    private function adminPhones(): array
    {
        $raw = (string) env('BOT_ADMIN_PHONES', '50672140974');
        if (trim($raw) === '') {
            return [];
        }

        $phones = [];
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
