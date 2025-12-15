<?php

/**
 * Script para migrar comprobantes del JSON del bot a la base de datos
 * 
 * Uso: php scripts/migrate_receipts_to_database.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\Payment;
use App\Models\PaymentReceipt;

$jsonPath = __DIR__ . '/../bot/data/receipts/index.json';

if (!file_exists($jsonPath)) {
    echo "❌ Error: No se encontró el archivo $jsonPath\n";
    exit(1);
}

echo "📂 Leyendo comprobantes del JSON...\n";
$jsonContent = file_get_contents($jsonPath);
$receipts = json_decode($jsonContent, true);

if (!is_array($receipts)) {
    echo "❌ Error: El JSON no contiene un array válido\n";
    exit(1);
}

echo "✅ Se encontraron " . count($receipts) . " comprobantes en el JSON\n\n";

$migrated = 0;
$skipped = 0;
$errors = 0;

DB::beginTransaction();

try {
    foreach ($receipts as $receipt) {
        $receiptId = $receipt['id'] ?? null;
        $backendId = $receipt['backend_id'] ?? $receipt['backend_payment_id'] ?? null;
        
        // Solo migrar si tiene backend_id (está vinculado a un pago)
        if (!$backendId) {
            echo "⏭️  Saltando comprobante $receiptId (sin backend_id)\n";
            $skipped++;
            continue;
        }
        
        // Verificar si el pago existe
        $payment = Payment::find($backendId);
        if (!$payment) {
            echo "⚠️  Saltando comprobante $receiptId (pago #$backendId no existe)\n";
            $skipped++;
            continue;
        }
        
        // Verificar si ya existe en payment_receipts
        $exists = PaymentReceipt::where('payment_id', $backendId)
            ->where('metadata->bot_receipt_id', $receiptId)
            ->exists();
            
        if ($exists) {
            echo "⏭️  Saltando comprobante $receiptId (ya existe en DB)\n";
            $skipped++;
            continue;
        }
        
        // Preparar datos
        $filePath = $receipt['filepath'] ?? null;
        $fileName = $receipt['filename'] ?? null;
        $mimeType = $receipt['mime'] ?? 'application/octet-stream';
        $receivedAt = isset($receipt['ts']) ? date('Y-m-d H:i:s', intval($receipt['ts']) / 1000) : now();
        
        // Calcular tamaño del archivo si existe
        $fileSize = 0;
        if ($filePath && file_exists($filePath)) {
            $fileSize = filesize($filePath);
        }
        
        // Metadata completa del bot
        $metadata = [
            'bot_receipt_id' => $receiptId,
            'chat_id' => $receipt['chatId'] ?? null,
            'status' => $receipt['status'] ?? 'unknown',
            'months' => $receipt['months'] ?? null,
            'monthly_amount' => $receipt['monthly_amount'] ?? null,
            'total_amount' => $receipt['total_amount'] ?? null,
            'reconciled' => $receipt['reconciled'] ?? false,
            'reconciled_pdf' => $receipt['reconciled_pdf'] ?? null,
            'reconciled_sent' => $receipt['reconciled_sent'] ?? false,
            'text' => $receipt['text'] ?? null,
            'migrated_from_json' => true,
            'migrated_at' => now()->toIso8601String(),
        ];
        
        // Crear el registro
        PaymentReceipt::create([
            'payment_id' => $backendId,
            'file_path' => $filePath,
            'file_name' => $fileName,
            'file_size' => $fileSize,
            'mime_type' => $mimeType,
            'received_at' => $receivedAt,
            'metadata' => $metadata,
        ]);
        
        echo "✅ Migrado comprobante $receiptId → pago #$backendId\n";
        $migrated++;
    }
    
    DB::commit();
    
    echo "\n" . str_repeat("=", 50) . "\n";
    echo "📊 RESUMEN DE MIGRACIÓN\n";
    echo str_repeat("=", 50) . "\n";
    echo "✅ Migrados:  $migrated\n";
    echo "⏭️  Saltados:  $skipped\n";
    echo "❌ Errores:   $errors\n";
    echo "📁 Total:     " . count($receipts) . "\n";
    echo str_repeat("=", 50) . "\n\n";
    
    if ($migrated > 0) {
        echo "🎉 ¡Migración completada exitosamente!\n";
        echo "\n💡 Recomendaciones:\n";
        echo "   1. Verifica los datos en la base de datos\n";
        echo "   2. Crea un backup del JSON: cp $jsonPath {$jsonPath}.backup\n";
        echo "   3. Actualiza el bot para usar la API en lugar del JSON\n";
    }
    
} catch (Exception $e) {
    DB::rollBack();
    echo "\n❌ ERROR: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
    exit(1);
}
