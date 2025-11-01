<?php

namespace App\Console\Commands;

use App\Models\Reminder;
use Illuminate\Console\Command;

class CleanRemindersCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:clean:reminders {--days=30 : Días desde envío para considerar antiguo}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Limpia recordatorios antiguos que ya fueron enviados';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $days = (int) $this->option('days');
        
        if (! $this->confirm("¿Eliminar recordatorios enviados hace más de {$days} días?", true)) {
            $this->info('Operación cancelada.');
            return self::SUCCESS;
        }

        $this->info("Buscando recordatorios antiguos...");

        $count = Reminder::where('status', 'sent')
            ->where('sent_at', '<', now()->subDays($days))
            ->count();

        if ($count === 0) {
            $this->info('No hay recordatorios para limpiar.');
            return self::SUCCESS;
        }

        $this->line("Se encontraron {$count} recordatorios para eliminar.");

        Reminder::where('status', 'sent')
            ->where('sent_at', '<', now()->subDays($days))
            ->delete();

        $this->info("✓ {$count} recordatorios eliminados exitosamente.");

        return self::SUCCESS;
    }
}
