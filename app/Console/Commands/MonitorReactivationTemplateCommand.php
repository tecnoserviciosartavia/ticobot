<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Models\WhatsappChatMessage;
use App\Services\WhatsAppNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class MonitorReactivationTemplateCommand extends Command
{
    protected $signature = 'whatsapp:monitor-reactivation-template';

    protected $description = 'Monitorea la aprobación de la plantilla de reactivación y ejecuta una vez la campaña pendiente';

    private const TEMPLATE = 'reactivacion_servicio_v1';
    private const CAMPAIGN = 'deleted_clients_reactivation_202608';
    private const STATE_KEY = 'whatsapp_reactivation_campaign_202608';

    /** @var list<int> */
    private const ORIGINAL_MESSAGE_IDS = [
        4080, 4081, 4089, 4091, 4092, 4093, 4097, 4109, 4110, 4113,
        4114, 4116, 4117, 4118, 4119, 4131, 4132, 4133, 4134, 4135,
        4136, 4137, 4138, 4139, 4140, 4141, 4142, 4143, 4144, 4145,
    ];

    public function handle(WhatsAppNotificationService $whatsApp): int
    {
        $logger = Log::build([
            'driver' => 'single',
            'path' => storage_path('logs/reactivation-template-monitor.log'),
            'level' => 'info',
        ]);

        $lock = Cache::lock('whatsapp:reactivation-template-monitor', 180);
        if (! $lock->get()) {
            $logger->info('Ejecución omitida: el monitor ya está trabajando en otro proceso.');
            return self::SUCCESS;
        }

        try {
            return $this->runMonitor($whatsApp, $logger);
        } finally {
            $lock->release();
        }
    }

    private function runMonitor(WhatsAppNotificationService $whatsApp, $logger): int
    {

        $state = json_decode((string) Setting::get(self::STATE_KEY, '{}'), true);
        $state = is_array($state) ? $state : [];
        $templateStatus = $this->templateStatus();

        if ($templateStatus === null) {
            $logger->error('No se pudo consultar el estado de la plantilla.', ['template' => self::TEMPLATE]);
            return self::FAILURE;
        }

        if (! ($state['campaign_started'] ?? false)) {
            $logger->info('Estado de plantilla consultado.', [
                'template' => self::TEMPLATE,
                'status' => $templateStatus,
            ]);
        }

        if ($templateStatus !== 'APPROVED') {
            return self::SUCCESS;
        }

        if (! ($state['campaign_started'] ?? false)) {
            $logger->info('Plantilla aprobada; iniciando campaña.', [
                'campaign' => self::CAMPAIGN,
                'recipients' => count(self::ORIGINAL_MESSAGE_IDS),
            ]);

            $sent = 0;
            $failed = 0;
            $messages = WhatsappChatMessage::query()
                ->whereIn('id', self::ORIGINAL_MESSAGE_IDS)
                ->orderBy('id')
                ->get()
                ->keyBy('id');

            foreach (self::ORIGINAL_MESSAGE_IDS as $originalId) {
                $original = $messages->get($originalId);
                if (! $original) {
                    $failed++;
                    $logger->error('Mensaje original no encontrado.', ['original_message_id' => $originalId]);
                    continue;
                }

                $alreadySent = WhatsappChatMessage::query()
                    ->where('metadata->campaign', self::CAMPAIGN)
                    ->where('metadata->original_message_id', $originalId)
                    ->exists();
                if ($alreadySent) {
                    $sent++;
                    continue;
                }

                $platforms = $this->extractPlatforms((string) $original->body);
                $ok = $whatsApp->sendTemplateMessage(
                    (string) $original->phone,
                    self::TEMPLATE,
                    [$platforms],
                    'es',
                    [
                        'source' => 'reactivation_template_campaign',
                        'campaign' => self::CAMPAIGN,
                        'original_message_id' => $originalId,
                        'platforms' => $platforms,
                    ]
                );

                $ok ? $sent++ : $failed++;
                $logger->{$ok ? 'info' : 'error'}($ok ? 'Plantilla aceptada por Meta.' : 'Meta rechazó el envío de plantilla.', [
                    'original_message_id' => $originalId,
                    'phone' => $original->phone,
                    'platforms' => $platforms,
                ]);
                usleep(500000);
            }

            $state = [
                'campaign_started' => true,
                'started_at' => now()->toIso8601String(),
                'accepted' => $sent,
                'failed_immediately' => $failed,
                'last_delivery_counts' => null,
            ];
            Setting::set(self::STATE_KEY, json_encode($state), 'Estado del monitor de plantilla de reactivación');
            $logger->info('Lote de campaña terminado.', ['accepted' => $sent, 'failed_immediately' => $failed]);
        }

        $counts = WhatsappChatMessage::query()
            ->where('metadata->campaign', self::CAMPAIGN)
            ->get(['status'])
            ->countBy('status')
            ->all();

        if (($state['last_delivery_counts'] ?? null) !== $counts) {
            $logger->info('Estados de entrega actualizados.', ['counts' => $counts]);
            $state['last_delivery_counts'] = $counts;
            $state['last_checked_at'] = now()->toIso8601String();
            Setting::set(self::STATE_KEY, json_encode($state), 'Estado del monitor de plantilla de reactivación');
        }

        return self::SUCCESS;
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

        if (! $response->successful()) {
            return null;
        }

        $status = $response->json('data.0.status');
        return is_string($status) ? strtoupper($status) : null;
    }

    private function extractPlatforms(string $body): string
    {
        $body = preg_replace('/\s+/u', ' ', trim($body)) ?: '';
        if (preg_match('/plataformas:\s*(.+?)\.\s*Si desea/u', $body, $matches) === 1) {
            return trim($matches[1]);
        }

        return 'los servicios asignados';
    }
}
