<?php

/**
 * Script de prueba para el endpoint de comprobantes del bot
 * 
 * Uso: php scripts/test_receipt_api.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Http;
use App\Models\Client;
use App\Models\Payment;
use App\Models\PaymentReceipt;

echo "🧪 Test del endpoint POST /api/payments/receipts/bot\n\n";

// Obtener un token de API válido desde el .env del bot
$botEnvPath = __DIR__ . '/../bot/.env';
$token = null;

if (file_exists($botEnvPath)) {
    $botEnv = file_get_contents($botEnvPath);
    if (preg_match('/BOT_API_TOKEN=(.+)/', $botEnv, $matches)) {
        $token = trim($matches[1]);
    }
}

if (!$token) {
    echo "❌ Error: No se encontró BOT_API_TOKEN\n";
    echo "   Verifica bot/.env\n";
    exit(1);
}

echo "🔑 Token encontrado: " . substr($token, 0, 20) . "...\n";

// Buscar un cliente de prueba
$client = Client::whereNotNull('phone')->first();

if (!$client) {
    echo "❌ Error: No hay clientes en la base de datos para probar\n";
    exit(1);
}

echo "📱 Cliente de prueba: {$client->name} ({$client->phone})\n";

// Crear una imagen de prueba en base64 (1x1 pixel PNG transparente)
$testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

echo "\n📤 Enviando comprobante de prueba...\n";

try {
    $response = Http::withToken($token)
        ->post(config('app.url') . '/api/payments/receipts/bot', [
            'client_phone' => $client->phone,
            'file_base64' => $testImageBase64,
            'file_name' => 'test-receipt-' . time() . '.png',
            'mime_type' => 'image/png',
            'metadata' => [
                'test' => true,
                'created_by_script' => true,
            ],
        ]);

    echo "\n📊 Respuesta del servidor:\n";
    echo "   Status: {$response->status()}\n";
    
    if ($response->successful()) {
        $data = $response->json();
        echo "   ✅ Success: " . ($data['success'] ? 'true' : 'false') . "\n";
        
        if (isset($data['receipt'])) {
            echo "   📄 Receipt ID: {$data['receipt']['id']}\n";
            echo "   💾 File Path: {$data['receipt']['file_path']}\n";
            echo "   📏 File Size: {$data['receipt']['file_size']} bytes\n";
            
            if (isset($data['payment_id'])) {
                echo "   🔗 Payment ID: {$data['payment_id']}\n";
            } else {
                echo "   ⚠️  Sin Payment ID (guardado sin asignar)\n";
            }
        }
        
        echo "\n✅ ¡Test exitoso!\n";
        
        // Verificar en la base de datos
        $count = PaymentReceipt::whereJsonContains('metadata->test', true)->count();
        echo "\n📊 Total de comprobantes de prueba en DB: $count\n";
        
    } else {
        echo "   ❌ Error: {$response->status()}\n";
        echo "   Respuesta: " . $response->body() . "\n";
    }
    
} catch (Exception $e) {
    echo "\n❌ Excepción: " . $e->getMessage() . "\n";
    exit(1);
}

echo "\n" . str_repeat("=", 50) . "\n";
echo "💡 Notas:\n";
echo "   - Los comprobantes de prueba tienen metadata->test = true\n";
echo "   - Puedes eliminarlos con:\n";
echo "     php artisan tinker --execute=\"App\\Models\\PaymentReceipt::whereJsonContains('metadata->test', true)->delete();\"\n";
echo str_repeat("=", 50) . "\n";
