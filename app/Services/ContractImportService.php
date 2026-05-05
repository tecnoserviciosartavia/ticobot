<?php

namespace App\Services;

use App\Models\Client;
use App\Models\Contract;
use Illuminate\Support\Collection;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;

class ContractImportService
{
    /**
     * Import contracts from file (CSV/XLSX)
     */
    public function importFromFile(UploadedFile $file): array
    {
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        try {
            $data = $this->parseFile($file);
            
            foreach ($data as $index => $row) {
                try {
                    $result = $this->processImportRow($row, $index + 1);
                    
                    $created += $result['created'];
                    $updated += $result['updated'];
                    $skipped += $result['skipped'];
                    
                    if (!empty($result['errors'])) {
                        $errors = array_merge($errors, $result['errors']);
                    }
                } catch (\Exception $e) {
                    $errors[] = "Fila " . ($index + 1) . ": " . $e->getMessage();
                    $skipped++;
                }
            }

        } catch (\Exception $e) {
            throw new \Exception('Error procesando archivo: ' . $e->getMessage());
        }

        return [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => $errors,
        ];
    }

    /**
     * Parse file and return array of rows
     */
    protected function parseFile(UploadedFile $file): array
    {
        $path = $file->getRealPath();
        if (!$path || !is_readable($path)) {
            throw new \Exception('No se puede leer el archivo subido.');
        }

        $extension = strtolower($file->getClientOriginalExtension() ?? '');

        if (in_array($extension, ['xlsx', 'xls', 'ods'], true)) {
            return $this->parseExcelFile($path);
        } else {
            return $this->parseCsvFile($path);
        }
    }

    /**
     * Parse Excel file
     */
    protected function parseExcelFile(string $path): array
    {
        if (!class_exists(\PhpOffice\PhpSpreadsheet\IOFactory::class)) {
            throw new \Exception('La librería para procesar archivos XLSX no está instalada.');
        }

        $reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($path);
        $spreadsheet = $reader->load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $data = $sheet->toArray(null, true, true, true);

        if (count($data) === 0) {
            throw new \Exception('El archivo XLSX está vacío.');
        }

        // Remove header row
        array_shift($data);

        // Convert to indexed array
        $rows = [];
        foreach ($data as $row) {
            $rows[] = array_values($row);
        }

        return $rows;
    }

    /**
     * Parse CSV file
     */
    protected function parseCsvFile(string $path): array
    {
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw new \Exception('No se pudo abrir el archivo para lectura.');
        }

        $headers = fgetcsv($handle);
        if (!$headers) {
            fclose($handle);
            throw new \Exception('El archivo CSV está vacío.');
        }

        $headers = array_map(fn ($h) => strtolower(trim((string) $h)), $headers);
        $rows = [];

        while (($row = fgetcsv($handle)) !== false) {
            if (count($row) === 1 && trim((string) $row[0]) === '') {
                continue;
            }
            $rows[] = $row;
        }

        fclose($handle);

        return array_map(fn ($row) => array_combine($headers, $row), $rows);
    }

    /**
     * Process a single import row
     */
    protected function processImportRow(array $row, int $rowNumber): array
    {
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        // Find client
        $client = $this->findClientFromRow($row);
        if (!$client) {
            $errors[] = "Fila {$rowNumber}: Cliente no encontrado";
            $skipped++;
            return compact('created', 'updated', 'skipped', 'errors');
        }

        // Extract contract data
        $contractData = $this->extractContractData($row);
        if (!$contractData) {
            $errors[] = "Fila {$rowNumber}: Datos de contrato inválidos";
            $skipped++;
            return compact('created', 'updated', 'skipped', 'errors');
        }

        $contractData['client_id'] = $client->id;

        // Check for existing contract
        $existing = $this->findExistingContract($client, $contractData);

        if ($existing) {
            $existing->update($contractData);
            $updated++;
        } else {
            // Set next_due_date if not provided
            if (empty($contractData['next_due_date'])) {
                $contractData['next_due_date'] = $this->computeNextDueDate($contractData['billing_cycle']);
            }
            
            Contract::create($contractData);
            $created++;
        }

        return compact('created', 'updated', 'skipped', 'errors');
    }

    /**
     * Find client from import row
     */
    protected function findClientFromRow(array $row): ?Client
    {
        // Try by client_id first
        if (!empty($row['client_id'])) {
            $client = Client::find((int) $row['client_id']);
            if ($client) return $client;
        }

        // Try by email
        if (!empty($row['client_email'])) {
            $client = Client::where('email', $row['client_email'])->first();
            if ($client) return $client;
        }

        // Try by phone
        $phonesStr = $row['client_phone'] ?? $row['phone'] ?? $row['telefono'] ?? null;
        if ($phonesStr) {
            $candidatePhones = $this->extractPhones($phonesStr);
            foreach ($candidatePhones as $phone) {
                $client = $this->findClientByPhone($phone);
                if ($client) return $client;
            }
        }

        return null;
    }

    /**
     * Find client by phone number
     */
    protected function findClientByPhone(string $phone): ?Client
    {
        $normalized = $this->normalizePhone($phone);
        $last8 = substr(preg_replace('/\D+/', '', $normalized), -8);

        return Client::query()
            ->where(function ($q) use ($normalized, $last8) {
                $q->where('phone', $normalized)
                  ->orWhere('phone', 'like', "%{$last8}")
                  ->orWhere('phone', 'like', "%{$normalized}");
            })
            ->orderByDesc('id')
            ->first();
    }

    /**
     * Extract contract data from row
     */
    protected function extractContractData(array $row): ?array
    {
        $amount = $row['amount'] ?? $row['monto'] ?? null;
        if ($amount === null || $amount === '') {
            return null;
        }

        return [
            'name' => trim($row['name'] ?? $row['contract_name'] ?? ''),
            'amount' => (float) $amount,
            'currency' => strtoupper($row['currency'] ?? $row['moneda'] ?? 'CRC'),
            'billing_cycle' => $row['billing_cycle'] ?? 'monthly',
            'next_due_date' => $row['next_due_date'] ?? $row['proxima_fecha'] ?? null,
            'grace_period_days' => isset($row['grace_period_days']) ? (int) $row['grace_period_days'] : 0,
            'notes' => $row['notes'] ?? null,
        ];
    }

    /**
     * Find existing contract
     */
    protected function findExistingContract(Client $client, array $contractData): ?Contract
    {
        $query = Contract::where('client_id', $client->id);

        // Try by name if provided
        if (!empty($contractData['name'])) {
            return $query->where('name', $contractData['name'])->first();
        }

        // Try by amount and due date combination
        return $query
            ->where('amount', $contractData['amount'])
            ->where('currency', $contractData['currency'])
            ->where('billing_cycle', $contractData['billing_cycle'])
            ->first();
    }

    /**
     * Extract phone numbers from string
     */
    protected function extractPhones(string $phonesStr): array
    {
        $parts = preg_split('/[\s,;|]+/', trim($phonesStr)) ?: [];
        $out = [];
        
        foreach ($parts as $part) {
            $phone = $this->normalizePhone($part);
            if ($phone !== '' && !in_array($phone, $out, true)) {
                $out[] = $phone;
            }
        }
        
        return $out;
    }

    /**
     * Normalize phone number
     */
    protected function normalizePhone(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw);
        if ($digits === '') return '';

        // If already starts with 506 and length 11 treat as CR international without plus
        if (str_starts_with($digits, '506') && strlen($digits) === 11) {
            return '+' . $digits;
        }
        
        if (strlen($digits) === 8) {
            return '+506' . $digits; // assume Costa Rica local
        }
        
        if (strlen($digits) >= 7 && strlen($digits) <= 15) {
            return '+' . $digits; // fallback generic E.164 style
        }
        
        return '+' . $digits; // still return something
    }

    /**
     * Compute next due date
     */
    protected function computeNextDueDate(string $billingCycle): string
    {
        $today = Carbon::today(config('app.timezone'));
        
        return match ($billingCycle) {
            'weekly' => $today->copy()->addDays(7)->toDateString(),
            'biweekly' => $today->copy()->addDays(14)->toDateString(),
            'monthly' => $today->copy()->addMonthNoOverflow()->toDateString(),
            'one_time' => $today->toDateString(),
            default => $today->toDateString(),
        };
    }
}
