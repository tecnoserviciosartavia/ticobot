<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

$paymentId = $argv[1] ?? null;
$status = $argv[2] ?? 'approved';
if (! $paymentId) {
    echo "Usage: php scripts/simulate_conciliation_api.php <payment_id> [status]\n";
    exit(1);
}

// login as user 1
Auth::loginUsingId(1);

$request = Request::create('/api/conciliations', 'POST', ['payment_id' => (int)$paymentId, 'status' => $status]);

$controller = new \App\Http\Controllers\Api\ConciliationController();
$response = $controller->store($request);

// $response is a JsonResponse
echo "Status: " . $response->getStatusCode() . "\n";
echo $response->getContent() . "\n";

// Show payment status after
$payment = \App\Models\Payment::find($paymentId);
echo "Payment status after: " . ($payment?->status ?? 'not found') . "\n";
