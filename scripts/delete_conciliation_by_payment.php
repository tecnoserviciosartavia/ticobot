<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$paymentId = $argv[1] ?? null;
if (! $paymentId) {
    echo "Usage: php scripts/delete_conciliation_by_payment.php <payment_id>\n";
    exit(1);
}

$conciliation = \App\Models\Conciliation::where('payment_id', $paymentId)->first();
if (! $conciliation) {
    echo "No conciliation found for payment_id={$paymentId}\n";
    exit(0);
}

$payment = $conciliation->payment;
$id = $conciliation->id;
$conciliation->delete();

if ($payment) {
    $payment->update(['status' => 'unverified']);
}

echo "Deleted conciliation id={$id} for payment_id={$paymentId}\n";
if ($payment) echo "Payment id={$payment->id} status={$payment->status}\n";
