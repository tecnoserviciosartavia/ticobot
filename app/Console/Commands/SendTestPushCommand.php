<?php

namespace App\Console\Commands;

use App\Models\PushDeviceToken;
use App\Models\User;
use App\Services\PushNotificationService;
use Illuminate\Console\Command;

class SendTestPushCommand extends Command
{
    protected $signature = 'push:test
        {--token= : Token específico del dispositivo}
        {--user= : ID de usuario para usar sus tokens activos}
        {--title=Prueba Push : Título de la notificación}
        {--body=Mensaje de prueba desde Ticobot : Cuerpo de la notificación}';

    protected $description = 'Envía una notificación push de prueba usando FCM';

    public function handle(PushNotificationService $push): int
    {
        $title = (string) $this->option('title');
        $body = (string) $this->option('body');

        $tokens = $this->resolveTokens();
        if (count($tokens) === 0) {
            $this->error('No hay tokens destino. Usa --token=... o --user=...');
            return self::FAILURE;
        }

        $sent = 0;
        foreach ($tokens as $token) {
            $ok = $push->sendToToken($token, $title, $body, [
                'type' => 'manual_test',
                'at' => now()->toIso8601String(),
            ]);

            if ($ok) {
                $sent++;
                $this->info('OK: ' . $this->maskToken($token));
                continue;
            }

            $this->warn('FAIL: ' . $this->maskToken($token));
        }

        $this->newLine();
        $this->line("Resultado: {$sent}/" . count($tokens) . ' enviados.');

        return $sent > 0 ? self::SUCCESS : self::FAILURE;
    }

    /**
     * @return array<int,string>
     */
    private function resolveTokens(): array
    {
        $token = (string) ($this->option('token') ?? '');
        if ($token !== '') {
            return [$token];
        }

        $userId = $this->option('user');
        if ($userId !== null && $userId !== '') {
            $user = User::query()->find($userId);
            if (! $user) {
                $this->error("No existe el usuario ID {$userId}.");
                return [];
            }

            return PushDeviceToken::query()
                ->where('user_id', $user->id)
                ->where('is_active', true)
                ->pluck('token')
                ->filter(fn ($value) => is_string($value) && $value !== '')
                ->values()
                ->all();
        }

        return PushDeviceToken::query()
            ->where('is_active', true)
            ->pluck('token')
            ->filter(fn ($value) => is_string($value) && $value !== '')
            ->values()
            ->all();
    }

    private function maskToken(string $token): string
    {
        if (strlen($token) <= 14) {
            return $token;
        }

        return substr($token, 0, 7) . '...' . substr($token, -7);
    }
}
