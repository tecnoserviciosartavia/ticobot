<?php

namespace App\Console\Commands;

use App\Models\Payment;
use Illuminate\Console\Command;

class CleanPaymentsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:clean:payments {--days=90 : Días de antigüedad para pagos pendientes}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Limpia pagos pendientes antiguos y sin confirmar';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $days = (int) $this->option('days');
        
        if (! $this->confirm("¿Eliminar pagos pendientes de hace más de {$days} días?", true)) {
            $this->info('Operación cancelada.');
            return self::SUCCESS;
        }

        $this->info("Buscando pagos pendientes antiguos...");

        $count = Payment::where('status', 'pending')
            ->where('created_at', '<', now()->subDays($days))
            ->count();

        if ($count === 0) {
            $this->info('No hay pagos para limpiar.');
            return self::SUCCESS;
        }

        $this->line("Se encontraron {$count} pagos pendientes para eliminar.");

        Payment::where('status', 'pending')
            ->where('created_at', '<', now()->subDays($days))
            ->delete();

        $this->info("✓ {$count} pagos eliminados exitosamente.");

        return self::SUCCESS;
    }
}
