<?php

namespace App\Console\Commands;

use App\Models\PaymentReceipt;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class CleanReceiptsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:clean:receipts {--orphaned : Solo recibos huérfanos sin pago}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Limpia recibos de pagos huérfanos o archivos sin referencia';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $orphanedOnly = $this->option('orphaned');

        if ($orphanedOnly) {
            return $this->cleanOrphanedReceipts();
        }

        $this->info('Limpiando archivos de recibos sin referencia...');
        
        $receipts = PaymentReceipt::all();
        $deletedFiles = 0;

        foreach ($receipts as $receipt) {
            if ($receipt->file_path && ! Storage::exists($receipt->file_path)) {
                $this->line("Archivo faltante para recibo #{$receipt->id}");
            }
        }

        $this->info("✓ Verificación completada.");

        return self::SUCCESS;
    }

    private function cleanOrphanedReceipts(): int
    {
        $this->info("Buscando recibos huérfanos...");

        $count = PaymentReceipt::whereNull('payment_id')
            ->orWhereDoesntHave('payment')
            ->count();

        if ($count === 0) {
            $this->info('No hay recibos huérfanos.');
            return self::SUCCESS;
        }

        if (! $this->confirm("¿Eliminar {$count} recibos huérfanos?", true)) {
            $this->info('Operación cancelada.');
            return self::SUCCESS;
        }

        $receipts = PaymentReceipt::whereNull('payment_id')
            ->orWhereDoesntHave('payment')
            ->get();

        foreach ($receipts as $receipt) {
            if ($receipt->file_path && Storage::exists($receipt->file_path)) {
                Storage::delete($receipt->file_path);
            }
            $receipt->delete();
        }

        $this->info("✓ {$count} recibos huérfanos eliminados exitosamente.");

        return self::SUCCESS;
    }
}
