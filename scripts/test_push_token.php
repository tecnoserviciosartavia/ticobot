<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\PushDeviceToken;
use App\Models\User;
use App\Services\PushNotificationService;
use Carbon\Carbon;

$action = $argv[1] ?? 'list';

echo "═══════════════════════════════════════════════════════════════\n";
echo "   🧪 TEST PUSH NOTIFICATIONS\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

switch ($action) {
    case 'list':
        listTokens();
        break;
    
    case 'send':
        sendTestPush($argv[2] ?? null);
        break;
    
    case 'clean':
        cleanInactiveTokens();
        break;
    
    case 'info':
        showEnvironmentInfo();
        break;
    
    default:
        showHelp();
}

function listTokens(): void {
    $tokens = PushDeviceToken::query()
        ->with('user')
        ->orderBy('created_at', 'desc')
        ->get();

    if ($tokens->isEmpty()) {
        echo "❌ No hay tokens registrados en la BD.\n\n";
        echo "📱 Si estás usando la app Android, asegúrate de:\n";
        echo "   1. Que VITE_ENABLE_PUSH_REGISTRATION=true en el .env\n";
        echo "   2. Que Firebase esté configurado en android/\n";
        echo "   3. Que la app solicite permisos de notificación\n";
        return;
    }

    echo "📋 TOKENS REGISTRADOS:\n";
    echo str_repeat("─", 67) . "\n";
    foreach ($tokens as $token) {
        $userId = $token->user_id ?? '(sin usuario)';
        $userName = $token->user?->name ?? 'N/A';
        $status = $token->is_active ? '✅ ACTIVO' : '⚠️  INACTIVO';
        $lastSeen = $token->last_seen_at?->diffForHumans() ?? 'Nunca';
        
        echo "ID: {$token->id}\n";
        echo "Token: {$token->token}\n";
        echo "Usuario ID: {$userId} ({$userName})\n";
        echo "Platform: {$token->platform}\n";
        echo "Estado: {$status}\n";
        echo "Último acceso: {$lastSeen}\n";
        echo "Registrado: {$token->created_at}\n";
        echo str_repeat("─", 67) . "\n";
    }

    echo "\nℹ️  Total: " . $tokens->count() . " token(s)\n";
    echo "✅ Activos: " . $tokens->where('is_active', true)->count() . "\n";
    echo "⚠️  Inactivos: " . $tokens->where('is_active', false)->count() . "\n";
}

function sendTestPush(?string $tokenOrUserId): void {
    if (!$tokenOrUserId) {
        echo "❌ Debes especificar un token o user_id.\n\n";
        echo "Uso:\n";
        echo "  php scripts/test_push_token.php send <token_completo>\n";
        echo "  php scripts/test_push_token.php send user:<user_id>\n\n";
        echo "Ejemplo:\n";
        echo "  php scripts/test_push_token.php send dJ4a1b2c3d4e5f6...\n";
        echo "  php scripts/test_push_token.php send user:1\n";
        return;
    }

    $token = null;
    
    // Si es "user:N", buscar el token del usuario
    if (str_starts_with($tokenOrUserId, 'user:')) {
        $userId = substr($tokenOrUserId, 5);
        $record = PushDeviceToken::query()
            ->where('user_id', $userId)
            ->where('is_active', true)
            ->first();
        if (!$record) {
            echo "❌ No hay token activo para user_id={$userId}\n";
            return;
        }
        $token = $record->token;
        echo "📌 Usando token del usuario {$userId}\n\n";
    } else {
        $token = $tokenOrUserId;
    }

    echo "🚀 Enviando notificación de prueba...\n";
    echo "Token: " . substr($token, 0, 24) . "...\n\n";

    try {
        $pushService = app(PushNotificationService::class);
        $success = $pushService->sendToToken(
            $token,
            '🧪 Prueba de Notificación',
            'Si ves este mensaje, ¡las notificaciones push funcionan! ✅',
            [
                'type' => 'test',
                'timestamp' => now()->toIso8601String(),
                'platform' => 'android',
            ]
        );

        if ($success) {
            echo "✅ Notificación enviada exitosamente!\n";
            echo "\n📱 Revisa tu teléfono en los próximos segundos.\n";
        } else {
            echo "❌ Error al enviar la notificación.\n";
            echo "Revisa los logs en: storage/logs/laravel.log\n";
        }
    } catch (Exception $e) {
        echo "❌ Excepción: " . $e->getMessage() . "\n";
        echo "Detalles: " . $e->getFile() . ":" . $e->getLine() . "\n";
    }
}

function cleanInactiveTokens(): void {
    $deleted = PushDeviceToken::query()
        ->where('is_active', false)
        ->delete();

    echo "🗑️  Se eliminaron {$deleted} token(s) inactivo(s).\n";
}

function showEnvironmentInfo(): void {
    echo "🔧 INFORMACIÓN DE CONFIGURACIÓN:\n\n";
    
    $configPath = env('GOOGLE_APPLICATION_CREDENTIALS', 'NO CONFIGURADO');
    echo "Firebase Service Account: {$configPath}\n";
    
    if ($configPath !== 'NO CONFIGURADO' && file_exists($configPath)) {
        echo "✅ Archivo encontrado\n";
        $config = json_decode(file_get_contents($configPath), true);
        if ($config && isset($config['project_id'])) {
            echo "Project ID: {$config['project_id']}\n";
        }
    } else {
        echo "⚠️  Archivo NO encontrado\n";
    }
    
    echo "\nVITE_ENABLE_PUSH_REGISTRATION: " . env('VITE_ENABLE_PUSH_REGISTRATION', 'NO CONFIGURADO') . "\n";
    
    $dbCheck = PushDeviceToken::count();
    echo "Tokens en BD: {$dbCheck}\n";
}

function showHelp(): void {
    echo "COMANDOS DISPONIBLES:\n\n";
    echo "  1️⃣  php scripts/test_push_token.php list\n";
    echo "     → Listar todos los tokens registrados\n\n";
    
    echo "  2️⃣  php scripts/test_push_token.php send <token>\n";
    echo "     → Enviar notificación de prueba a un token específico\n\n";
    
    echo "  3️⃣  php scripts/test_push_token.php send user:<user_id>\n";
    echo "     → Enviar notificación de prueba al token de un usuario\n\n";
    
    echo "  4️⃣  php scripts/test_push_token.php clean\n";
    echo "     → Limpiar tokens inactivos de la BD\n\n";
    
    echo "  5️⃣  php scripts/test_push_token.php info\n";
    echo "     → Mostrar información de configuración\n\n";
    
    echo "EJEMPLOS:\n";
    echo "  php scripts/test_push_token.php list\n";
    echo "  php scripts/test_push_token.php send user:1\n";
    echo "  php scripts/test_push_token.php info\n";
}
