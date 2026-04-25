<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Services\PushNotificationService;
use Illuminate\Support\Facades\Log;

echo "═══════════════════════════════════════════════════════════════\n";
echo "   🔍 DIAGNÓSTICO FIREBASE / PUSH NOTIFICATIONS\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

// 1. Verificar service account
echo "1️⃣  VERIFICAR SERVICE ACCOUNT\n";
echo str_repeat("─", 63) . "\n";

$credPath = env('GOOGLE_APPLICATION_CREDENTIALS');
if (!$credPath) {
    echo "❌ GOOGLE_APPLICATION_CREDENTIALS no está configurada\n";
    echo "   Solución: Agrega en .env\n";
    echo "   GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/service-account.json\n";
} else if (!file_exists($credPath)) {
    echo "❌ Archivo no encontrado: {$credPath}\n";
    echo "   Verifica que la ruta sea correcta\n";
} else {
    echo "✅ Archivo encontrado: {$credPath}\n";
    
    $creds = json_decode(file_get_contents($credPath), true);
    if (!$creds) {
        echo "❌ JSON inválido en el archivo\n";
    } else {
        echo "   Project ID: " . ($creds['project_id'] ?? 'NO ENCONTRADO') . "\n";
        echo "   Type: " . ($creds['type'] ?? 'NO ENCONTRADO') . "\n";
        echo "   Client Email: " . ($creds['client_email'] ?? 'NO ENCONTRADO') . "\n";
    }
}

echo "\n";

// 2. Verificar si la BD tiene tokens
echo "2️⃣  VERIFICAR BD - PUSH_DEVICE_TOKENS\n";
echo str_repeat("─", 63) . "\n";

$tokenCount = \App\Models\PushDeviceToken::count();
$activeCount = \App\Models\PushDeviceToken::where('is_active', true)->count();

echo "Total de registros: {$tokenCount}\n";
echo "Registros activos: {$activeCount}\n";

if ($tokenCount === 0) {
    echo "\n⚠️  ADVERTENCIA: No hay tokens registrados en la BD\n";
    echo "   Esto significa que la app NO está enviando tokens al servidor.\n";
    echo "   Verifica:\n";
    echo "   - VITE_ENABLE_PUSH_REGISTRATION=true en .env\n";
    echo "   - Archivo google-services.json en android/app/\n";
    echo "   - Permisos de notificación en AndroidManifest.xml\n";
} else {
    echo "\n✅ Hay " . $activeCount . " token(s) activo(s)\n";
    
    $latestToken = \App\Models\PushDeviceToken::latest()->first();
    if ($latestToken) {
        echo "\nÚltimo token registrado hace: " . $latestToken->created_at->diffForHumans() . "\n";
    }
}

echo "\n";

// 3. Verificar configuración del proyecto
echo "3️⃣  VERIFICAR VARIABLES DE ENTORNO\n";
echo str_repeat("─", 63) . "\n";

$envVars = [
    'VITE_ENABLE_PUSH_REGISTRATION' => env('VITE_ENABLE_PUSH_REGISTRATION', 'NO DEFINIDA'),
    'GOOGLE_APPLICATION_CREDENTIALS' => env('GOOGLE_APPLICATION_CREDENTIALS', 'NO DEFINIDA'),
    'APP_ENV' => env('APP_ENV', 'NO DEFINIDA'),
];

foreach ($envVars as $key => $value) {
    $icon = ($value === 'NO DEFINIDA') ? '⚠️ ' : '✅';
    echo "{$icon} {$key}: {$value}\n";
}

echo "\n";

// 4. Test rápido del servicio
echo "4️⃣  TEST DEL SERVICIO PUSHNOTIFICATION\n";
echo str_repeat("─", 63) . "\n";

try {
    $pushService = app(PushNotificationService::class);
    
    // Usar reflexión para acceder a métodos privados
    $reflection = new ReflectionClass($pushService);
    $projectIdMethod = $reflection->getMethod('projectId');
    $projectIdMethod->setAccessible(true);
    
    $projectId = $projectIdMethod->invoke($pushService);
    
    if ($projectId) {
        echo "✅ Project ID obtenido: {$projectId}\n";
    } else {
        echo "❌ No se pudo obtener el Project ID\n";
    }
    
    // Intentar obtener access token
    $accessTokenMethod = $reflection->getMethod('accessToken');
    $accessTokenMethod->setAccessible(true);
    $accessToken = $accessTokenMethod->invoke($pushService);
    
    if ($accessToken) {
        echo "✅ Access Token obtenido (primera 20 chars): " . substr($accessToken, 0, 20) . "...\n";
    } else {
        echo "❌ No se pudo obtener el Access Token\n";
    }
    
} catch (Exception $e) {
    echo "❌ Error al testear servicio: " . $e->getMessage() . "\n";
}

echo "\n";

// 5. Instrucciones siguientes
echo "5️⃣  PRÓXIMOS PASOS\n";
echo str_repeat("─", 63) . "\n";

if ($tokenCount === 0) {
    echo "❌ Problema detectado: No hay tokens en la BD\n\n";
    echo "SOLUCIÓN:\n";
    echo "1. Abre la app en tu dispositivo Android\n";
    echo "2. Inicia sesión\n";
    echo "3. Ve a tu perfil/dashboard\n";
    echo "4. Debería solicitar permisos de notificación\n";
    echo "5. Acepta los permisos\n";
    echo "6. Espera 5 segundos\n";
    echo "7. Ejecuta de nuevo: php scripts/test_push_token.php list\n";
} else if ($activeCount > 0) {
    echo "✅ Hay tokens registrados. Puedes enviar una prueba:\n\n";
    echo "php scripts/test_push_token.php send user:1\n";
} else {
    echo "⚠️  Todos los tokens están inactivos\n";
    echo "Intenta reabrir la app para re-registrar un token activo\n";
}

echo "\n";
echo "📋 Para más detalles, ejecuta:\n";
echo "   php scripts/test_push_token.php list\n";
echo "   php scripts/test_push_token.php send user:1\n";
echo "   php scripts/test_push_token.php info\n\n";
