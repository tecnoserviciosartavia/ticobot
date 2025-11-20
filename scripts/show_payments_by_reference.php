<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$ref = $argv[1] ?? 'bot-test-50661784023';
$payments = \App\Models\Payment::where('reference', $ref)->get();
$out = $payments->map(fn($p)=>[
    'id'=>$p->id,
    'reference'=>$p->reference,
    'amount'=>$p->amount,
    'status'=>$p->status,
    'receipts_count'=>$p->receipts()->count(),
    'created_at'=>$p->created_at,
])->toArray();

echo json_encode($out, JSON_PRETTY_PRINT);
