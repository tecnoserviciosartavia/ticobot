<?php
require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Setting;
use Illuminate\Support\Facades\DB;

$host = Setting::get('sinpe_imap_host', 'imap.dreamhost.com');
$port = (int) Setting::get('sinpe_imap_port', 993);
$folder = Setting::get('sinpe_imap_folder', 'BCR');
$user = Setting::get('sinpe_imap_username', '');
$pass = Setting::get('sinpe_imap_password', '');

echo "Host: $host:$port\n";
echo "Carpeta: $folder\n";
echo "Usuario: $user\n";
echo "IMAP disponible: " . (function_exists('imap_open') ? 'SI' : 'NO') . "\n";

if (!function_exists('imap_open')) {
    echo "ERROR: extensión IMAP no disponible\n";
    exit(1);
}

$mailboxPath = sprintf('{%s:%d/imap/ssl/novalidate-cert}%s', $host, $port, $folder);
echo "Conectando a: $mailboxPath\n";

$conn = @imap_open($mailboxPath, $user, $pass);
if (!$conn) {
    $errors = imap_errors() ?: [];
    echo "ERROR al conectar: " . implode(', ', $errors) . "\n";
    exit(1);
}

echo "Conexion exitosa!\n";

$check = imap_check($conn);
echo "Mensajes totales: " . $check->Nmsgs . "\n";
echo "Mensajes recientes: " . $check->Recent . "\n";

$unseen = imap_search($conn, 'UNSEEN');
echo "No leidos: " . count($unseen ?: []) . "\n";

$all = imap_search($conn, 'ALL');
echo "Todos: " . count($all ?: []) . "\n";

// Mostrar los ultimos 5 asuntos si hay mensajes
if ($all) {
    $recent = array_slice($all, -5);
    echo "\nUltimos 5 mensajes:\n";
    foreach ($recent as $msgNo) {
        $overview = imap_fetch_overview($conn, (string)$msgNo);
        $ov = $overview[0] ?? null;
        $subject = $ov ? imap_utf8($ov->subject ?? '(sin asunto)') : '(sin asunto)';
        $seen = $ov ? ($ov->seen ? 'SI' : 'NO') : '?';
        $date = $ov ? ($ov->date ?? '') : '';
        echo "  [{$msgNo}] Subject: $subject\n";
        echo "         Date: $date | Leido: $seen\n";
    }
}

// Ver cuantos hay en BD
$dbCount = DB::table('sinpe_email_transactions')->count();
echo "\nTransacciones en sinpe_email_transactions: $dbCount\n";
if ($dbCount > 0) {
    $last = DB::table('sinpe_email_transactions')->orderBy('id', 'desc')->limit(3)->get();
    foreach ($last as $row) {
        echo "  ref={$row->reference} monto={$row->amount} fecha={$row->transaction_date}\n";
    }
}

imap_close($conn);
