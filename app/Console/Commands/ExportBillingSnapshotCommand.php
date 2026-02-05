<?php

namespace App\Console\Commands;

use App\Models\Contract;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ExportBillingSnapshotCommand extends Command
{
    protected $signature = 'billing:export
                            {--dir= : Directorio en storage/ donde guardar (default: exports/billing-<timestamp>)}
                            {--delimiter=, : Delimitador CSV (default: ,)}';

    protected $description = 'Exporta contratos/servicios y relaciones a CSV para backup o reinicio de cobros';

    public function handle(): int
    {
        $timestamp = Carbon::now()->format('Ymd_His');
        $baseDir = trim((string) ($this->option('dir') ?: "exports/billing-{$timestamp}"));
        $delimiter = (string) ($this->option('delimiter') ?: ',');

        if ($baseDir === '') {
            $this->error('El directorio de export no puede ser vacío.');
            return self::FAILURE;
        }

        $disk = Storage::disk('local');
        $disk->makeDirectory($baseDir);

        $this->info("Exportando snapshot de cobros a storage/app/{$baseDir} ...");

        $contractsPath = "{$baseDir}/contracts.csv";
        $servicesPath = "{$baseDir}/services.csv";
        $pivotPath = "{$baseDir}/contract_service.csv";

        $this->exportContractsCsv($contractsPath, $delimiter);
        $this->exportServicesCsv($servicesPath, $delimiter);
        $this->exportContractServicePivotCsv($pivotPath, $delimiter);

        $this->newLine();
        $this->info('✓ Export completado:');
        $this->line("- {$contractsPath}");
        $this->line("- {$servicesPath}");
        $this->line("- {$pivotPath}");

        return self::SUCCESS;
    }

    private function exportContractsCsv(string $path, string $delimiter): void
    {
        $disk = Storage::disk('local');

        $contracts = Contract::query()
            ->withTrashed()
            ->orderBy('id')
            ->get();

        $handle = fopen($disk->path($path), 'w');
        if (! $handle) {
            throw new \RuntimeException("No se pudo escribir {$path}");
        }

        fputcsv($handle, [
            'id',
            'client_id',
            'contract_type_id',
            'name',
            'amount',
            'discount_amount',
            'currency',
            'billing_cycle',
            'next_due_date',
            'grace_period_days',
            'notes',
            'metadata_json',
            'created_at',
            'updated_at',
            'deleted_at',
        ], $delimiter);

        foreach ($contracts as $c) {
            fputcsv($handle, [
                $c->id,
                $c->client_id,
                $c->contract_type_id,
                $c->name,
                (string) $c->amount,
                (string) ($c->discount_amount ?? 0),
                $c->currency,
                $c->billing_cycle,
                $c->next_due_date?->toDateString(),
                $c->grace_period_days,
                $c->notes,
                json_encode($c->metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $c->created_at?->toIso8601String(),
                $c->updated_at?->toIso8601String(),
                $c->deleted_at?->toIso8601String(),
            ], $delimiter);
        }

        fclose($handle);
        $this->info('✓ contracts.csv exportado ('.count($contracts).' filas)');
    }

    private function exportServicesCsv(string $path, string $delimiter): void
    {
        $disk = Storage::disk('local');

        $services = Service::query()
            ->orderBy('id')
            ->get();

        $handle = fopen($disk->path($path), 'w');
        if (! $handle) {
            throw new \RuntimeException("No se pudo escribir {$path}");
        }

        fputcsv($handle, [
            'id',
            'name',
            'price',
            'currency',
            'is_active',
            'created_at',
            'updated_at',
        ], $delimiter);

        foreach ($services as $s) {
            fputcsv($handle, [
                $s->id,
                $s->name,
                (string) $s->price,
                $s->currency,
                (int) $s->is_active,
                $s->created_at?->toIso8601String(),
                $s->updated_at?->toIso8601String(),
            ], $delimiter);
        }

        fclose($handle);
        $this->info('✓ services.csv exportado ('.count($services).' filas)');
    }

    private function exportContractServicePivotCsv(string $path, string $delimiter): void
    {
        $disk = Storage::disk('local');

        $rows = DB::table('contract_service')
            ->orderBy('contract_id')
            ->orderBy('service_id')
            ->get();

        $handle = fopen($disk->path($path), 'w');
        if (! $handle) {
            throw new \RuntimeException("No se pudo escribir {$path}");
        }

        fputcsv($handle, [
            'contract_id',
            'service_id',
            'created_at',
            'updated_at',
        ], $delimiter);

        foreach ($rows as $r) {
            fputcsv($handle, [
                $r->contract_id,
                $r->service_id,
                $r->created_at,
                $r->updated_at,
            ], $delimiter);
        }

        fclose($handle);
        $this->info('✓ contract_service.csv exportado ('.count($rows).' filas)');
    }
}
