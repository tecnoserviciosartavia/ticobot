<?php

/**
 * Script de prueba para el envío de PDFs por WhatsApp
 * 
 * Uso: php scripts/test_pdf_sending.php [payment_id]
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Payment;
use App\Models\Conciliation;
use App\Services\ConciliationPdfService;
use App\Services\WhatsAppNotificationService;

// Obtener payment_id del argumento o usar el más reciente
$paymentId = $argv[1] ?? null;

if (!$paymentId) {
    $payment = Payment::where('status', 'verified')
        ->with('client', 'contract', 'conciliation')
        ->orderByDesc('id')
        ->first();
} else {
    $payment = Payment::with('client', 'contract', 'conciliation')
        ->find($paymentId);
}

if (!$payment) {
    echo "❌ No se encontró el pago\n";
    exit(1);
}

echo "🧪 TEST DE ENVÍO DE PDF POR WHATSAPP\n";
echo str_repeat("=", 60) . "\n\n";

echo "📋 Información del Pago:\n";
echo "   ID: {$payment->id}\n";
echo "   Cliente: {$payment->client->name}\n";
echo "   Teléfono: {$payment->client->phone}\n";
echo "   Monto: {$payment->currency} " . number_format($payment->amount, 2) . "\n";
echo "   Estado: {$payment->status}\n";
echo "   Fecha: {$payment->created_at}\n";

if (!$payment->client->phone) {
    echo "\n❌ Error: El cliente no tiene teléfono registrado\n";
    exit(1);
}

// Verificar si tiene conciliación
$conciliation = $payment->conciliation;
if (!$conciliation) {
    echo "\n⚠️  El pago no tiene conciliación. Creando una...\n";
    
    $conciliation = Conciliation::create([
        'payment_id' => $payment->id,
        'contract_id' => $payment->contract_id,
        'amount' => $payment->amount,
        'currency' => $payment->currency,
        'status' => 'verified',
        'conciliated_at' => now(),
        'notes' => 'Conciliación de prueba para test de PDF',
        'metadata' => [
            'test' => true,
            'created_by_script' => true,
        ],
    ]);
    
    echo "   ✅ Conciliación creada: ID {$conciliation->id}\n";
}

echo "\n📄 Generando PDF...\n";

try {
    $pdfService = new ConciliationPdfService();
    $whatsappService = new WhatsAppNotificationService();
    
    // Calcular meses
    $months = 1;
    if ($payment->contract && $payment->contract->amount > 0) {
        $months = max(1, floor($payment->amount / $payment->contract->amount));
    }
    
    echo "   Meses cubiertos: $months\n";
    
    // Generar PDF
    $pdfPath = $pdfService->generateConciliationReceipt($payment, $months);
    
    if (!file_exists($pdfPath)) {
        echo "   ❌ Error: PDF no se generó correctamente\n";
        exit(1);
    }
    
    $fileSize = filesize($pdfPath);
    echo "   ✅ PDF generado: $pdfPath\n";
    echo "   📏 Tamaño: " . number_format($fileSize / 1024, 2) . " KB\n";
    
    // Generar mensaje
    $message = $pdfService->generateWhatsAppMessage($months);
    echo "\n💬 Mensaje a enviar:\n";
    echo "   " . str_replace("\n", "\n   ", $message) . "\n";
    
    // Preguntar confirmación
    echo "\n🤔 ¿Deseas enviar este PDF al cliente?\n";
    echo "   Cliente: {$payment->client->name}\n";
    echo "   Teléfono: {$payment->client->phone}\n";
    echo "\n   Escribe 'SI' para confirmar: ";
    
    $handle = fopen("php://stdin", "r");
    $line = trim(fgets($handle));
    fclose($handle);
    
    if (strtoupper($line) !== 'SI') {
        echo "\n❌ Envío cancelado por el usuario\n";
        exit(0);
    }
    
    echo "\n📤 Enviando PDF por WhatsApp...\n";
    
    $sent = $whatsappService->sendManualPaymentReceipt($payment, $pdfPath, $message);
    
    if ($sent) {
        echo "   ✅ PDF enviado exitosamente!\n";
        echo "\n🎉 Test completado con éxito\n";
        
        // Mostrar logs recientes
        echo "\n📊 Logs recientes del envío:\n";
        $logFile = storage_path('logs/laravel.log');
        if (file_exists($logFile)) {
            $logs = shell_exec("tail -20 $logFile | grep -i 'pdf\|whatsapp' | tail -5");
            if ($logs) {
                echo "   " . str_replace("\n", "\n   ", trim($logs)) . "\n";
            }
        }
    } else {
        echo "   ❌ Error al enviar el PDF\n";
        echo "\n💡 Revisa los logs para más detalles:\n";
        echo "   tail -f storage/logs/laravel.log\n";
        echo "   pm2 logs ticobot-bot\n";
        exit(1);
    }
    
} catch (Exception $e) {
    echo "\n❌ Excepción: " . $e->getMessage() . "\n";
    echo "Stack trace:\n" . $e->getTraceAsString() . "\n";
    exit(1);
}

echo "\n" . str_repeat("=", 60) . "\n";
echo "✅ Test finalizado\n";
