<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$payments = [2,1];
$out = [];
foreach ($payments as $p) {
    $c = \App\Models\Conciliation::where('payment_id', $p)->get();
    $out[$p] = $c->map(fn($x)=>[
        'id'=>$x->id,
        'status'=>$x->status,
        'reviewed_by'=>$x->reviewed_by,
        'notes'=>$x->notes,
        'created_at'=>$x->created_at,
    ])->toArray();
}

echo json_encode($out, JSON_PRETTY_PRINT);
