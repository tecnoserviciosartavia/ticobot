<?php

namespace App\Console\Commands;

use App\Services\SinpeBcrEmailConciliationService;
use Illuminate\Console\Command;

class ReconcileSinpeBcrEmailsCommand extends Command
{
    protected $signature = 'emails:reconcile-sinpe-bcr';

    protected $description = 'Lee correos SINPE BCR por IMAP (configuración clásica) y concilia pagos automáticamente';

    public function handle(SinpeBcrEmailConciliationService $service): int
    {
        $stats = $service->run();

        $this->info('Resultado conciliación SINPE por correo:');
        $this->line(' - Correos revisados: ' . ($stats['checked'] ?? 0));
        $this->line(' - Correos parseados: ' . ($stats['parsed'] ?? 0));
        $this->line(' - Pagos conciliados: ' . ($stats['conciliated'] ?? 0));
        $this->line(' - Omitidos: ' . ($stats['skipped'] ?? 0));
        $this->line(' - Errores: ' . ($stats['errors'] ?? 0));

        return self::SUCCESS;
    }
}
