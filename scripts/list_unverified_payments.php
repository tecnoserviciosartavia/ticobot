<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$payments = \App\Models\Payment::where('status', 'unverified')
    ->orderByDesc('created_at')
    ->take(20)
    ->get(['id','amount','reference','status','created_at'])
    ->toArray();

echo json_encode($payments, JSON_PRETTY_PRINT);
