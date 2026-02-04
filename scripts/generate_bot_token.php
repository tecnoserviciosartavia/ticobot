<?php

declare(strict_types=1);

// Usage:
//   php scripts/generate_bot_token.php
// Prints a Sanctum token for the first user (creates one if missing).

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;

$user = User::query()->first();
if (!$user) {
    $user = User::query()->create([
        'name' => 'Staging Bot',
        'email' => 'bot-staging@local',
        'password' => 'staging',
    ]);
}

$token = $user->createToken('ticobot_2_bot');

fwrite(STDOUT, $token->plainTextToken . PHP_EOL);
