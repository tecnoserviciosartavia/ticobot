<?php

namespace App\Console\Commands;

use App\Models\ReminderMessage;
use Illuminate\Console\Command;

class CleanMessagesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:clean:messages {--days=60 : Días de antigüedad}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Limpia mensajes de recordatorios antiguos';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $days = (int) $this->option('days');
        
        if (! $this->confirm("¿Eliminar mensajes de hace más de {$days} días?", true)) {
            $this->info('Operación cancelada.');
            return self::SUCCESS;
        }

        $this->info("Buscando mensajes antiguos...");

        $count = ReminderMessage::where('created_at', '<', now()->subDays($days))
            ->count();

        if ($count === 0) {
            $this->info('No hay mensajes para limpiar.');
            return self::SUCCESS;
        }

        $this->line("Se encontraron {$count} mensajes para eliminar.");

        ReminderMessage::where('created_at', '<', now()->subDays($days))
            ->delete();

        $this->info("✓ {$count} mensajes eliminados exitosamente.");

        return self::SUCCESS;
    }
}
