<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Models\WhatsappChatMessage;
use App\Services\WhatsAppNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MonitorBillingPriceNoticeTemplateCommand extends Command
{
    protected $signature = 'whatsapp:monitor-billing-price-notice';

    protected $description = 'Envía una vez el aviso de ajuste de tarifas cuando Meta aprueba la plantilla';

    private const TEMPLATE = 'aviso_ajuste_tarifas_facturacion_v1';
    private const CAMPAIGN = 'billing_price_notice_202609';
    private const STATE_KEY = 'whatsapp_billing_price_notice_202609';
    private const RECIPIENTS = [
        ['phone' => '50683190842', 'name' => 'Cati'],
        ['phone' => '50683387993', 'name' => 'Ricardo'],
    ];

    public function handle(WhatsAppNotificationService $whatsApp): int
    {
        $logger = Log::build([
            'driver' => 'single',
            'path' => storage_path('logs/billing-price-notice-monitor.log'),
            'level' => 'info',
        ]);
        $lock = Cache::lock('whatsapp:billing-price-notice-monitor', 120);
        if (! $lock->get()) {
            return self::SUCCESS;
        }

        try {
            $state = json_decode((string) Setting::get(self::STATE_KEY, '{}'), true);
            $state = is_array($state) ? $state : [];
            $status = $this->templateStatus();

            if ($status === null) {
                $logger->error('No se pudo consultar el estado de la plantilla.');
                return self::FAILURE;
            }

            if (! ($state['completed'] ?? false)) {
                $logger->info('Estado de plantilla consultado.', ['template' => self::TEMPLATE, 'status' => $status]);
            }
            if ($status !== 'APPROVED') {
                return self::SUCCESS;
            }

            foreach (self::RECIPIENTS as $recipient) {
                $exists = WhatsappChatMessage::query()
                    ->where('metadata->campaign', self::CAMPAIGN)
                    ->where('phone', $recipient['phone'])
                    ->exists();
                if ($exists) {
                    continue;
                }

                $sent = $whatsApp->sendTemplateMessage(
                    $recipient['phone'],
                    self::TEMPLATE,
                    [$recipient['name']],
                    'es',
                    ['source' => 'billing_price_notice', 'campaign' => self::CAMPAIGN]
                );
                $logger->{$sent ? 'info' : 'error'}($sent ? 'Aviso aceptado por Meta.' : 'Meta rechazó el aviso.', $recipient);
            }

            $count = WhatsappChatMessage::query()->where('metadata->campaign', self::CAMPAIGN)->count();
            $state['completed'] = $count === count(self::RECIPIENTS);
            $state['updated_at'] = now()->toIso8601String();
            Setting::set(self::STATE_KEY, json_encode($state), 'Estado del aviso de ajuste de tarifas de facturación');

            $counts = WhatsappChatMessage::query()
                ->where('metadata->campaign', self::CAMPAIGN)
                ->get(['status'])
                ->countBy('status')
                ->all();
            if (($state['delivery_counts'] ?? null) !== $counts) {
                $logger->info('Estados de entrega actualizados.', ['counts' => $counts]);
                $state['delivery_counts'] = $counts;
                Setting::set(self::STATE_KEY, json_encode($state), 'Estado del aviso de ajuste de tarifas de facturación');
            }

            return self::SUCCESS;
        } finally {
            $lock->release();
        }
    }

    private function templateStatus(): ?string
    {
        $wabaId = trim((string) config('services.whatsapp.waba_id', ''));
        $token = trim((string) config('services.whatsapp.token', ''));
        $version = trim((string) config('services.whatsapp.version', 'v18.0'));
        if ($wabaId === '' || $token === '') {
            return null;
        }

        $response = Http::timeout(20)->withToken($token)->get(
            "https://graph.facebook.com/{$version}/{$wabaId}/message_templates",
            ['name' => self::TEMPLATE, 'fields' => 'name,status']
        );

        $status = $response->successful() ? $response->json('data.0.status') : null;
        return is_string($status) ? strtoupper($status) : null;
    }
}
