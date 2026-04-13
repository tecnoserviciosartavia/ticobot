<?php

namespace App\Console\Commands;

use App\Models\Service;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NotifyPlatformPaymentsCommand extends Command
{
    protected $signature = 'services:notify-platform-payments';

    protected $description = 'Envía recordatorios a admins cuando toca pagar costos de plataformas';

    public function handle(WhatsAppNotificationService $whatsApp): int
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
        }

        $this->info("Recordatorios de costos de plataforma enviados: {$sent}");
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

        return "Recordatorio de pago de plataforma\n\nServicio: {$serviceName}{$emailLine}\nCosto: {$symbol}{$amount}\nFecha de pago: {$dueDate}\n\nEste aviso se envía automaticamente el dia configurado del servicio.";
    }
}
