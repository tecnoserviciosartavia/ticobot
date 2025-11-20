#!/usr/bin/env php
<?php

/**
 * Proxy Diagnostics Script
 * 
 * Validates reverse proxy headers, Laravel configuration, and backend Apache setup.
 * Run: php scripts/diagnose_proxy.php
 */

echo "═══════════════════════════════════════════════\n";
echo "  TicoBOT Proxy Diagnostics\n";
echo "═══════════════════════════════════════════════\n\n";

// 1. Check if running via web or CLI
if (php_sapi_name() !== 'cli') {
    echo "⚠️  This script must run from CLI, not web.\n\n";
    
    echo "📊 REQUEST HEADERS (from proxy):\n";
    echo str_repeat('─', 47) . "\n";
    
    $headers = [
        'HTTP_HOST' => 'Host',
        'HTTP_X_FORWARDED_FOR' => 'X-Forwarded-For',
        'HTTP_X_FORWARDED_HOST' => 'X-Forwarded-Host',
        'HTTP_X_FORWARDED_PORT' => 'X-Forwarded-Port',
        'HTTP_X_FORWARDED_PROTO' => 'X-Forwarded-Proto',
        'HTTP_X_REAL_IP' => 'X-Real-IP',
        'REMOTE_ADDR' => 'Remote Address',
        'SERVER_ADDR' => 'Server Address',
        'SERVER_PORT' => 'Server Port',
        'HTTPS' => 'HTTPS',
        'REQUEST_SCHEME' => 'Request Scheme',
    ];
    
    foreach ($headers as $key => $label) {
        $value = $_SERVER[$key] ?? '(not set)';
        printf("%-20s : %s\n", $label, $value);
    }
    
    echo "\n📍 Request Info:\n";
    echo str_repeat('─', 47) . "\n";
    printf("Request URI        : %s\n", $_SERVER['REQUEST_URI'] ?? 'N/A');
    printf("Request Method     : %s\n", $_SERVER['REQUEST_METHOD'] ?? 'N/A');
    printf("Query String       : %s\n", $_SERVER['QUERY_STRING'] ?? '(empty)');
    
    if (function_exists('request')) {
        echo "\n🔐 Laravel Request Detection:\n";
        echo str_repeat('─', 47) . "\n";
        printf("Detected URL       : %s\n", request()->url());
        printf("Detected Scheme    : %s\n", request()->getScheme());
        printf("Is Secure          : %s\n", request()->isSecure() ? 'YES' : 'NO');
        printf("Client IP          : %s\n", request()->ip());
    }
    
    echo "\n";
    exit(0);
}

// CLI mode - run system checks

echo "1️⃣  LARAVEL CONFIGURATION\n";
echo str_repeat('─', 47) . "\n";

// Load Laravel
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$appUrl = config('app.url');
$appEnv = config('app.env');
$appDebug = config('app.debug') ? 'true' : 'false';

echo "APP_URL            : {$appUrl}\n";
echo "APP_ENV            : {$appEnv}\n";
echo "APP_DEBUG          : {$appDebug}\n";

// Warn if not production ready
if ($appEnv === 'local' && strpos($appUrl, 'localhost') !== false) {
    echo "⚠️  APP_URL still set to localhost - update to https://ticocast.com\n";
}

echo "\n2️⃣  PROXY MIDDLEWARE CHECK\n";
echo str_repeat('─', 47) . "\n";

$middlewareClass = 'App\\Http\\Middleware\\TrustProxies';
if (class_exists($middlewareClass)) {
    echo "✅ TrustProxies middleware exists\n";
    
    $middleware = new $middlewareClass($app);
    $reflection = new ReflectionClass($middleware);
    
    if ($reflection->hasProperty('proxies')) {
        $proxiesProp = $reflection->getProperty('proxies');
        $proxiesProp->setAccessible(true);
        $proxies = $proxiesProp->getValue($middleware);
        
        if ($proxies === '*') {
            echo "✅ Trusting all proxies (proxies = '*')\n";
        } elseif (is_array($proxies)) {
            echo "⚠️  Trusting specific IPs: " . implode(', ', $proxies) . "\n";
        } else {
            echo "⚠️  Proxies setting: " . var_export($proxies, true) . "\n";
        }
    }
} else {
    echo "❌ TrustProxies middleware NOT found\n";
    echo "   Create: app/Http/Middleware/TrustProxies.php\n";
}

echo "\n3️⃣  FILE PERMISSIONS\n";
echo str_repeat('─', 47) . "\n";

$storagePath = base_path('storage');
$bootstrapCache = base_path('bootstrap/cache');

$storageWritable = is_writable($storagePath);
$cacheWritable = is_writable($bootstrapCache);

echo "storage/           : " . ($storageWritable ? '✅ writable' : '❌ NOT writable') . "\n";
echo "bootstrap/cache/   : " . ($cacheWritable ? '✅ writable' : '❌ NOT writable') . "\n";

if (!$storageWritable || !$cacheWritable) {
    echo "\n💡 Fix with:\n";
    echo "   sudo chown -R www-data:www-data storage bootstrap/cache\n";
    echo "   sudo chmod -R ug+rwx storage bootstrap/cache\n";
}

echo "\n4️⃣  ASSETS CHECK\n";
echo str_repeat('─', 47) . "\n";

$manifestPath = public_path('build/manifest.json');
if (file_exists($manifestPath)) {
    echo "✅ Vite manifest found: build/manifest.json\n";
    
    $manifest = json_decode(file_get_contents($manifestPath), true);
    $entryCount = count($manifest ?? []);
    echo "   Entries: {$entryCount}\n";
} else {
    echo "❌ Vite manifest NOT found\n";
    echo "   Run: npm run build\n";
}

echo "\n5️⃣  APACHE BACKEND (this server)\n";
echo str_repeat('─', 47) . "\n";

// Check if Apache is running
exec('pidof apache2 2>/dev/null', $apachePid, $apacheReturn);
$apacheRunning = $apacheReturn === 0;

echo "Apache Status      : " . ($apacheRunning ? '✅ running' : '⚠️  not detected') . "\n";

// Check if port 80 or 8080 is listening
exec("ss -tlnp 2>/dev/null | grep -E ':(80|8080)\\s' | head -1", $portCheck);
if (!empty($portCheck)) {
    echo "Listening          : " . trim($portCheck[0]) . "\n";
} else {
    echo "Listening          : ⚠️  Port 80/8080 not detected\n";
}

echo "\n6️⃣  RECOMMENDED APACHE CONFIG\n";
echo str_repeat('─', 47) . "\n";
echo <<<APACHE
<VirtualHost *:80>
    DocumentRoot /home/fabian/ticobot/public
    
    <Directory /home/fabian/ticobot/public>
        AllowOverride All
        Require all granted
        Options -Indexes +FollowSymLinks
        
        # Laravel rewrite
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteRule ^ index.php [L]
    </Directory>
    
    # Handle proxy headers
    SetEnvIf X-Forwarded-Proto https HTTPS=on
    
    ErrorLog \${APACHE_LOG_DIR}/ticobot-error.log
    CustomLog \${APACHE_LOG_DIR}/ticobot-access.log combined
</VirtualHost>

APACHE;

echo "\n7️⃣  RECOMMENDED PROXY SERVER CONFIG\n";
echo str_repeat('─', 47) . "\n";
echo <<<PROXY
# Apache Proxy (on proxy server)
<VirtualHost *:80>
    ServerName ticocast.com
    ServerAlias www.ticocast.com
    
    ProxyPreserveHost On
    ProxyPass / http://<BACKEND_IP>:80/
    ProxyPassReverse / http://<BACKEND_IP>:80/
    
    # Forward headers
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"
    
    ErrorLog \${APACHE_LOG_DIR}/ticocast-proxy-error.log
    CustomLog \${APACHE_LOG_DIR}/ticocast-proxy-access.log combined
</VirtualHost>

<VirtualHost *:443>
    ServerName ticocast.com
    ServerAlias www.ticocast.com
    
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    ProxyPreserveHost On
    ProxyPass / http://<BACKEND_IP>:80/
    ProxyPassReverse / http://<BACKEND_IP>:80/
    
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"
    
    ErrorLog \${APACHE_LOG_DIR}/ticocast-ssl-error.log
    CustomLog \${APACHE_LOG_DIR}/ticocast-ssl-access.log combined
</VirtualHost>

# Enable modules: a2enmod proxy proxy_http headers ssl rewrite

PROXY;

echo "\n8️⃣  QUICK TESTS\n";
echo str_repeat('─', 47) . "\n";
echo "Run these from proxy server:\n\n";
echo "# Test DNS resolution\n";
echo "dig +short ticocast.com\n\n";
echo "# Test backend Apache directly\n";
echo "curl -I http://<BACKEND_IP>/\n\n";
echo "# Test through proxy\n";
echo "curl -I https://ticocast.com/\n\n";
echo "# View headers sent by proxy\n";
echo "curl -H 'X-Test: Debug' https://ticocast.com/up\n\n";
echo "# Check this diagnostic via web\n";
echo "curl https://ticocast.com/scripts/diagnose_proxy.php\n";

echo "\n9️⃣  LARAVEL COMMANDS\n";
echo str_repeat('─', 47) . "\n";
echo "# Clear all caches\n";
echo "php artisan optimize:clear\n\n";
echo "# Update .env then recache\n";
echo "php artisan config:cache\n";
echo "php artisan route:cache\n";
echo "php artisan view:cache\n\n";

echo "═══════════════════════════════════════════════\n";
echo "  Diagnostics Complete\n";
echo "═══════════════════════════════════════════════\n\n";

if (!$storageWritable || !$cacheWritable) {
    exit(1);
}

exit(0);
