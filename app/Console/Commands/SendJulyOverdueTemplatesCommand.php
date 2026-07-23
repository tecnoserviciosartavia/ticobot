<?php

namespace App\Console\Commands;

use App\Models\Reminder;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendJulyOverdueTemplatesCommand extends Command
{
    protected $signature = 'billing:send-july-overdue-template
                            {--send : Envía; sin esta opción solo muestra el plan}
                            {--year=2026 : Año de los recordatorios}
                            {--exclude-client=187 : Cliente que nunca debe incluirse}';

    protected $description = 'Envía la plantilla Meta de pago vencido a recordatorios vencidos y no pagados de julio';

    public function handle(WhatsAppNotificationService $whatsApp): int
    {
        $year = max(2000, (int) $this->option('year'));
        $excludedClientId = (int) $this->option('exclude-client');
        $timezone = config('app.timezone', 'America/Costa_Rica');
        $start = Carbon::create($year, 7, 1, 0, 0, 0, $timezone);
        $end = Carbon::now($timezone)->min($start->copy()->endOfMonth())->endOfDay();

        $reminders = Reminder::query()
            ->with(['client:id,name,phone', 'contract:id,name,amount,currency'])
            ->whereBetween('scheduled_for', [$start, $end])
            ->where('client_id', '!=', $excludedClientId)
            ->whereNotIn('status', ['paid', 'duplicate'])
            ->whereDoesntHave('payments', fn ($query) => $query->where('status', 'verified'))
            ->orderBy('scheduled_for')
            ->get();

        $this->info(sprintf(
            '%d recordatorio(s) elegible(s), %d cliente(s). Cliente excluido: %d.',
            $reminders->count(),
            $reminders->pluck('client_id')->unique()->count(),
            $excludedClientId
        ));

        if (! $this->option('send')) {
            $this->comment('Simulación: no se enviaron mensajes. Usa --send después de que Meta apruebe la plantilla.');
            return self::SUCCESS;
        }

        $sent = 0;
        $failed = 0;

        foreach ($reminders as $reminder) {
            $client = $reminder->client;
            $contract = $reminder->contract;
            $phone = trim((string) ($client?->phone ?? ''));

            if ($phone === '' || ! $contract) {
                $failed++;
                continue;
            }

            $currency = strtoupper((string) ($contract->currency ?: 'CRC'));
            $amount = number_format((float) $contract->amount, 0, ',', '.');
            $formattedAmount = $currency === 'USD' ? '$'.$amount : '₡'.$amount;

            $ok = $whatsApp->sendTemplateMessage(
                $phone,
                'pago_vencido_perfil',
                [(string) $client->name, (string) $contract->name, $formattedAmount],
                'es',
                ['reminder_id' => $reminder->id, 'client_id' => $reminder->client_id]
            );

            if ($ok) {
                $sent++;
            } else {
                $failed++;
            }

            usleep(750000);
        }

        $this->info("Enviados: {$sent}. Fallidos: {$failed}.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
