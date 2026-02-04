<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$all = \App\Models\Conciliation::all();
$out = $all->map(fn($c)=>[
    'id'=>$c->id,
    'payment_id'=>$c->payment_id,
    'status'=>$c->status,
    'reviewed_by'=>$c->reviewed_by,
    'created_at'=>$c->created_at,
])->toArray();

echo json_encode($out, JSON_PRETTY_PRINT);
