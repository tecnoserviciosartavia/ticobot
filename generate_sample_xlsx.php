<?php
require __DIR__ . '/vendor/autoload.php';
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$sheetData = [
    ['name','email','phone','status','notes'],
    ['Juan Pérez','juan@example.com','8888-8888','active','Cliente VIP'],
    ['María Gómez','maria@example.com','7777-7777','inactive','']
];

$spreadsheet = new Spreadsheet();
$sheet = $spreadsheet->getActiveSheet();
$row = 1;
foreach ($sheetData as $r) {
    $col = 'A';
    foreach ($r as $c) {
        $sheet->setCellValue($col.$row, $c);
        $col++;
    }
    $row++;
}
$writer = new Xlsx($spreadsheet);
$out = __DIR__.'/public/samples/clients-sample.xlsx';
@mkdir(dirname($out), 0755, true);
$writer->save($out);
echo 'WROTE:'.$out.PHP_EOL;
