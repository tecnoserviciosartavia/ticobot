<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ResetBillingCommand extends Command
{
    protected $signature = 'billing:reset
                            {--yes : Confirmar que se ejecutará el borrado}
                            {--confirm= : Texto de confirmación (debe ser RESET)}
                            {--keep-contracts : No borra contratos ni contract_service}
                            {--keep-services : No borra el catálogo de servicios}
                            {--dry-run : Solo muestra lo que haría (no borra nada)}';

    protected $description = 'Reset completo de cobros (payments/reminders/conciliations/contracts/services) para iniciar de cero';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $keepContracts = (bool) $this->option('keep-contracts');
        $keepServices = (bool) $this->option('keep-services');

        $plan = [
            'reminder_messages',
            'reminders',
            'payment_receipts',
            'payments',
            'conciliations',
        ];

        if (! $keepContracts) {
            $plan[] = 'contract_service';
            $plan[] = 'contracts';
        }

        if (! $keepServices) {
            $plan[] = 'services';
        }

        $this->warn('ATENCIÓN: esto borrará información en la base de datos.');
        $this->line('Tablas a limpiar (orden):');
        foreach ($plan as $t) {
            $this->line("- {$t}");
        }
        $this->newLine();

        if (! $dryRun) {
            $yes = (bool) $this->option('yes');
            $confirm = (string) ($this->option('confirm') ?? '');

            if (! $yes || strtoupper(trim($confirm)) !== 'RESET') {
                $this->error('Falta confirmación. Ejecutá con: --yes --confirm=RESET');
                return self::FAILURE;
            }
        }

        $countsBefore = $this->counts($plan);
        $this->info('Conteos actuales:');
        foreach ($countsBefore as $table => $count) {
            $this->line(sprintf('- %-20s %s', $table, number_format($count)));
        }

        if ($dryRun) {
            $this->newLine();
            $this->info('Dry-run: no se borró nada.');
            return self::SUCCESS;
        }

        // Nota: en MySQL, TRUNCATE hace un commit implícito. Si lo envolvemos en
        // una transacción, puede romper el estado ("There is no active transaction").
        // Por eso lo ejecutamos fuera de DB::transaction y solo protegemos FK checks.
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach ($plan as $table) {
                DB::table($table)->truncate();
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        $countsAfter = $this->counts($plan);
        $this->newLine();
        $this->info('✓ Reset completado. Conteos final:');
        foreach ($countsAfter as $table => $count) {
            $this->line(sprintf('- %-20s %s', $table, number_format($count)));
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<int, string>  $tables
     * @return array<string, int>
     */
    private function counts(array $tables): array
    {
        $out = [];
        foreach ($tables as $t) {
            try {
                $out[$t] = (int) DB::table($t)->count();
            } catch (\Throwable $e) {
                $out[$t] = -1;
            }
        }
        return $out;
    }
}
