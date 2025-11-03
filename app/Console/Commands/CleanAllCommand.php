<?php

namespace App\Console\Commands;

use App\Models\Client;
use App\Models\Conciliation;
use App\Models\Payment;
use App\Models\PaymentReceipt;
use App\Models\Reminder;
use App\Models\ReminderMessage;
use App\Models\User;
use Illuminate\Console\Command;

class CleanAllCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:clean:all 
                            {--keep-users : Mantener usuarios}
                            {--keep-clients : Mantener clientes activos}
                            {--preserve-admin : Mantener al usuario admin (id=1) y sus tokens}
                            {--force : No pedir confirmación}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Limpia toda la base de datos excepto configuraciones críticas';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
    $keepUsers = $this->option('keep-users');
        $keepClients = $this->option('keep-clients');
    $preserveAdmin = $this->option('preserve-admin');
        $force = $this->option('force');

        $this->warn('⚠️  ADVERTENCIA: Esta operación eliminará datos de forma permanente.');
        $this->line('');

        $stats = $this->getStats();
        $this->displayStats($stats);

        if (! $force && ! $this->confirm('¿Continuar con la limpieza?', false)) {
            $this->info('Operación cancelada.');
            return self::SUCCESS;
        }

        $this->info('Iniciando limpieza de base de datos...');
        $this->newLine();

        // Limpiar en orden de dependencias
        $this->cleanTable('reminder_messages', ReminderMessage::class);
        $this->cleanTable('reminders', Reminder::class);
        $this->cleanTable('payment_receipts', PaymentReceipt::class);
        $this->cleanTable('payments', Payment::class);
        $this->cleanTable('conciliations', Conciliation::class);

        if (! $keepClients) {
            $this->cleanTable('contracts', null, 'DELETE FROM contracts');
            $this->cleanTable('clients', Client::class);
        }

        if (! $keepUsers) {
            if ($preserveAdmin) {
                // Remove tokens for users except admin (id=1), keep admin user
                $this->cleanTable('personal_access_tokens', null, 'DELETE FROM personal_access_tokens WHERE tokenable_id IS NULL OR tokenable_id > 1');
                // Delete users except admin
                $this->cleanTable('users', User::class, 'DELETE FROM users WHERE id > 1');
                $this->info('Se preservó al usuario admin (id=1) y sus tokens.');
            } else {
                $this->cleanTable('personal_access_tokens', null, 'DELETE FROM personal_access_tokens');
                $this->cleanTable('users', User::class, 'DELETE FROM users WHERE id > 1');
            }
        }

        // Limpiar cache
        $this->call('cache:clear');
        $this->call('config:clear');
        $this->call('view:clear');

        $this->newLine();
        $this->info('✓ Limpieza completada exitosamente.');

        return self::SUCCESS;
    }

    private function getStats(): array
    {
        return [
            'reminders' => Reminder::count(),
            'messages' => ReminderMessage::count(),
            'payments' => Payment::count(),
            'receipts' => PaymentReceipt::count(),
            'conciliations' => Conciliation::count(),
            'clients' => Client::count(),
            'users' => User::count(),
        ];
    }

    private function displayStats(array $stats): void
    {
        $this->table(
            ['Tabla', 'Registros'],
            [
                ['Recordatorios', $stats['reminders']],
                ['Mensajes', $stats['messages']],
                ['Pagos', $stats['payments']],
                ['Recibos', $stats['receipts']],
                ['Conciliaciones', $stats['conciliations']],
                ['Clientes', $stats['clients']],
                ['Usuarios', $stats['users']],
            ]
        );
        $this->newLine();
    }

    private function cleanTable(string $name, ?string $model = null, ?string $query = null): void
    {
        $count = $model ? $model::count() : 0;

        if ($count === 0 && ! $query) {
            $this->line("  Tabla '{$name}' ya está vacía.");
            return;
        }

        if ($query) {
            \DB::statement($query);
            $this->info("  ✓ Tabla '{$name}' limpiada.");
        } elseif ($model) {
            $model::query()->delete();
            $this->info("  ✓ {$count} registros eliminados de '{$name}'.");
        }
    }
}
