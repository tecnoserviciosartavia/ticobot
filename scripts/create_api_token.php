<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$user = \App\Models\User::find(1);
if (! $user) {
    echo "User 1 not found\n";
    exit(1);
}
$token = $user->createToken('cli-test-token');
echo $token->plainTextToken . PHP_EOL;
