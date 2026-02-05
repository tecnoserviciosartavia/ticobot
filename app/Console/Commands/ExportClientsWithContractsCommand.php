<?php

namespace App\Console\Commands;

use App\Models\Client;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class ExportClientsWithContractsCommand extends Command
{
    protected $signature = 'clients:export
                            {--dir= : Directorio en storage/ donde guardar (default: exports/clients-<timestamp>)}
                            {--delimiter=, : Delimitador CSV (default: ,)}
                            {--with-trashed : Incluye clientes eliminados (soft delete)}
                            {--contracts-with-trashed : Incluye contratos eliminados (soft delete)}';

    protected $description = 'Exporta clientes y sus contratos a CSV (clients.csv y client_contracts.csv)';

    public function handle(): int
    {
        $timestamp = Carbon::now()->format('Ymd_His');
        $baseDir = trim((string) ($this->option('dir') ?: "exports/clients-{$timestamp}"));
        $delimiter = (string) ($this->option('delimiter') ?: ',');

        $disk = Storage::disk('local');
        $disk->makeDirectory($baseDir);

        $clientsPath = "{$baseDir}/clients.csv";
        $contractsPath = "{$baseDir}/client_contracts.csv";

        $this->info("Exportando clientes/contratos a storage/app/{$baseDir} ...");

        $clientsQ = Client::query();
        if ($this->option('with-trashed')) {
            $clientsQ->withTrashed();
        }

        $clients = $clientsQ->orderBy('id')->get();

        // clients.csv
        $clientsHandle = fopen($disk->path($clientsPath), 'w');
        if (! $clientsHandle) {
            $this->error("No se pudo escribir {$clientsPath}");
            return self::FAILURE;
        }

        fputcsv($clientsHandle, [
            'client_id',
            'name',
            'phone',
            'email',
            'status',
            'notes',
            'metadata_json',
            'created_at',
            'updated_at',
            'deleted_at',
        ], $delimiter);

        foreach ($clients as $c) {
            fputcsv($clientsHandle, [
                $c->id,
                $c->name,
                $c->phone,
                $c->email,
                $c->status,
                $c->notes,
                json_encode($c->metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $c->created_at?->toIso8601String(),
                $c->updated_at?->toIso8601String(),
                $c->deleted_at?->toIso8601String(),
            ], $delimiter);
        }

        fclose($clientsHandle);
        $this->info('✓ clients.csv exportado ('.count($clients).' filas)');

        // client_contracts.csv (flatten)
        $contractsHandle = fopen($disk->path($contractsPath), 'w');
        if (! $contractsHandle) {
            $this->error("No se pudo escribir {$contractsPath}");
            return self::FAILURE;
        }

        fputcsv($contractsHandle, [
            'client_id',
            'client_name',
            'client_phone',
            'contract_id',
            'contract_name',
            'amount',
            'discount_amount',
            'currency',
            'billing_cycle',
            'next_due_date',
            'grace_period_days',
            'deleted_at',
        ], $delimiter);

        $totalContracts = 0;
        foreach ($clients as $c) {
            $contractsQ = $c->contracts();
            if ($this->option('contracts-with-trashed')) {
                $contractsQ->withTrashed();
            }
            $contracts = $contractsQ->orderBy('id')->get();

            foreach ($contracts as $ct) {
                $totalContracts++;
                fputcsv($contractsHandle, [
                    $c->id,
                    $c->name,
                    $c->phone,
                    $ct->id,
                    $ct->name,
                    (string) $ct->amount,
                    (string) ($ct->discount_amount ?? 0),
                    $ct->currency,
                    $ct->billing_cycle,
                    $ct->next_due_date?->toDateString(),
                    $ct->grace_period_days,
                    $ct->deleted_at?->toIso8601String(),
                ], $delimiter);
            }
        }

        fclose($contractsHandle);
        $this->info('✓ client_contracts.csv exportado ('.$totalContracts.' filas)');

        $this->newLine();
        $this->info('Archivos generados:');
        $this->line("- {$clientsPath}");
        $this->line("- {$contractsPath}");

        return self::SUCCESS;
    }
}
