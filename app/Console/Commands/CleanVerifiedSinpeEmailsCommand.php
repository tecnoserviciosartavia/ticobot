<?php

namespace App\Console\Commands;

use App\Models\SinpeEmailTransaction;
use Illuminate\Console\Command;

class CleanVerifiedSinpeEmailsCommand extends Command
{
    protected $signature = 'sinpe-emails:clean-verified {--dry-run : Solo muestra cuántos registros se eliminarían}';

    protected $description = 'Elimina transacciones SINPE verificadas sin tocar el historial de pagos';

    public function handle(): int
    {
        $query = SinpeEmailTransaction::query()
            ->where('status', 'verified')
            ->orWhereHas('payment', fn ($q) => $q->where('status', 'verified'));

        $count = (clone $query)->count();

        if ($count === 0) {
            $this->info('No hay correos SINPE verificados para limpiar.');
            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->info("Se eliminarían {$count} correos SINPE verificados.");
            return self::SUCCESS;
        }

        $deleted = $query->delete();

        $this->info("Se eliminaron {$deleted} correos SINPE verificados. Los pagos se conservaron intactos.");

        return self::SUCCESS;
    }
}
