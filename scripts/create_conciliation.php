<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$paymentId = $argv[1] ?? null;
if (! $paymentId) {
    echo "Usage: php scripts/create_conciliation.php <payment_id>\n";
    exit(1);
}

$payment = \App\Models\Payment::find($paymentId);
if (! $payment) {
    echo "Payment not found\n";
    exit(1);
}

$conciliation = \App\Models\Conciliation::create([
    'payment_id' => $payment->id,
    'status' => 'approved',
    'reviewed_by' => 1,
    'notes' => 'Created via CLI test',
]);

$payment->refresh();

echo "Created conciliation id={$conciliation->id}\n";
echo "Payment status is now: {$payment->status}\n";
