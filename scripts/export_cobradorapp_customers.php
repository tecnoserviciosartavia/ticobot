<?php
require __DIR__ . '/../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$csvPath = $argv[1] ?? (__DIR__ . '/../cobradorapp.csv');
if (!file_exists($csvPath)) {
    fwrite(STDERR, "CSV no encontrado: {$csvPath}\n");
    exit(1);
}

$handle = fopen($csvPath, 'r');
if (!$handle) {
    fwrite(STDERR, "No se pudo abrir el CSV.\n");
    exit(1);
}

$customers = [];
$customerHeader = [];

while (($line = fgets($handle)) !== false) {
    $line = rtrim($line, "\r\n");
    if ($line === '') continue;

    // Parse as CSV preserving quoted fields
    $row = str_getcsv($line, ',', '"');
    if (!$row || count($row) === 0) continue;

    $tag = $row[0] ?? '';

    // Customer header mapping
    if ($tag === '{Customer:Header}') {
        $customerHeader = array_slice($row, 1); // skip tag
        continue;
    }

    // Customer row
    if ($tag === '{Customer}') {
        if (empty($customerHeader)) {
            // If header wasn't found yet, derive minimal mapping
            $customerHeader = ['_id','name','address','map_latitude','map_longitude','mobile','mail','credit_balance','payment_method','payment_day','scheduled_payment','quantity_hits','status','scheduled_date','rescheduled_date','last_transaction','currency','group_name','sort_number','image','reference','created_date','is_deleted','uid','cloud_last_modified_date','cloud_company','cloud_sync'];
        }
        $data = array_slice($row, 1);
        $assoc = [];
        foreach ($customerHeader as $i => $key) {
            $assoc[$key] = $data[$i] ?? null;
        }

        // Pick desired fields
        $name = $assoc['name'] ?? '';
        $amount = $assoc['scheduled_payment'] ?? '';
        $currency = $assoc['currency'] ?? '';
        $paymentDay = $assoc['payment_day'] ?? '';
        $scheduledDate = $assoc['scheduled_date'] ?? '';
        $mobileRaw = $assoc['mobile'] ?? '';

        // Extract phone numbers (normalize CR by default)
        $phones = [];
        if (is_string($mobileRaw) && $mobileRaw !== '') {
            // Replace non-digit with space, split, then normalize
            $pieces = preg_split('/\s+/', preg_replace('/[^\d+]+/', ' ', trim($mobileRaw)) ?? '');
            foreach ($pieces as $p) {
                if ($p === '') continue;
                $digits = preg_replace('/\D+/', '', $p);
                if ($digits === '') continue;

                // Heuristics: if 8 digits -> assume Costa Rica and prefix 506
                if (strlen($digits) === 8) {
                    $e164 = '+506' . $digits;
                } elseif (strlen($digits) === 11 && str_starts_with($digits, '506')) {
                    $e164 = '+' . $digits;
                } elseif (str_starts_with($p, '+') && strlen($digits) >= 8 && strlen($digits) <= 15) {
                    $e164 = '+' . $digits;
                } else {
                    // Skip unlikely fragments
                    continue;
                }

                $phones[$e164] = true; // unique
            }
        }
        $phonesStr = implode(', ', array_keys($phones));

        $customers[] = [
            'Nombre' => $name,
            'Monto' => is_null($amount) || $amount === '' ? null : (float)$amount,
            'Moneda' => $currency ?: 'CRC',
            'Telefonos' => $phonesStr,
            'Dia de corte' => $paymentDay,
            'Proxima fecha' => $scheduledDate,
        ];
    }
}

fclose($handle);

if (count($customers) === 0) {
    fwrite(STDERR, "No se encontraron clientes en el CSV.\n");
    exit(2);
}

$spreadsheet = new Spreadsheet();
$sheet = $spreadsheet->getActiveSheet();

// Headers
$headers = ['Nombre','Monto','Moneda','Telefonos','Dia de corte','Proxima fecha'];
$col = 'A';
foreach ($headers as $h) {
    $sheet->setCellValue($col.'1', $h);
    $col++;
}

// Rows
$r = 2;
foreach ($customers as $c) {
    $sheet->setCellValue('A'.$r, $c['Nombre']);
    $sheet->setCellValue('B'.$r, $c['Monto']);
    $sheet->setCellValue('C'.$r, $c['Moneda']);
    $sheet->setCellValue('D'.$r, $c['Telefonos']);
    $sheet->setCellValue('E'.$r, $c['Dia de corte']);
    $sheet->setCellValue('F'.$r, $c['Proxima fecha']);
    $r++;
}

// Autosize columns
foreach (range('A','F') as $columnID) {
    $sheet->getColumnDimension($columnID)->setAutoSize(true);
}

$out = __DIR__ . '/../public/samples/cobradorapp-clientes.xlsx';
@mkdir(dirname($out), 0755, true);
$writer = new Xlsx($spreadsheet);
$writer->save($out);

echo "WROTE: {$out}\n";
