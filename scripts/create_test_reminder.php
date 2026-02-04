<?php

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Client;
use App\Models\Reminder;

$client = Client::whereHas('payments', function ($q) {
    $q->where('status', 'unverified');
})->first();

if (!$client) {
    echo "NO CLIENT WITH UNVERIFIED\n";
    exit(0);
}

$contractId = $client->contracts()->value('id');

if (!$contractId) {
    // Crear un contrato mínimo si el cliente no tiene ninguno
    $contract = \App\Models\Contract::create([
        'client_id' => $client->id,
        'name' => 'Contrato de prueba (asistente)',
        'amount' => 1000,
        'currency' => 'CRC',
    ]);
    $contractId = $contract->id;
}

$rem = Reminder::create([
    'contract_id' => $contractId,
    'client_id' => $client->id,
    'channel' => 'whatsapp',
    'scheduled_for' => now(),
    'status' => 'pending',
    'payload' => ['message' => 'Recordatorio prueba desde asistente'],
]);

echo "CREATED: {$rem->id}\n";
