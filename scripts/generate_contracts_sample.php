<?php
require __DIR__ . '/../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$sampleData = [
    ['phone', 'name', 'amount', 'currency', 'billing_cycle', 'dia_de_corte', 'reminder_date', 'notes'],
    ['+50671663113', 'Streaming Premium', 7000, 'CRC', 'monthly', 15, '2025-12-15', 'Renovación automática'],
    ['+50688974441', 'Spotify Duo', 2000, 'CRC', 'monthly', 5, '2025-12-05', 'Plan familiar'],
    ['+50672707228', 'TDMAX F2', 2000, 'CRC', 'monthly', 17, '2025-12-17', 'Suscripción mensual'],
    ['+50683677150', 'TDMAX Básico', 2000, 'CRC', 'monthly', 2, '2025-12-02', 'Cliente activo'],
];

$spreadsheet = new Spreadsheet();
$sheet = $spreadsheet->getActiveSheet();

$row = 1;
foreach ($sampleData as $rowData) {
    $col = 'A';
    foreach ($rowData as $cell) {
        $sheet->setCellValue($col . $row, $cell);
        $col++;
    }
    $row++;
}

// Autosize columns
foreach (range('A', 'H') as $columnID) {
    $sheet->getColumnDimension($columnID)->setAutoSize(true);
}

$out = __DIR__ . '/../public/samples/contracts-sample.xlsx';
@mkdir(dirname($out), 0755, true);

$writer = new Xlsx($spreadsheet);
$writer->save($out);

echo "WROTE: {$out}\n";
