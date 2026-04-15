<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LogsController extends Controller
{
    public function index(): Response
    {
        $sources = $this->sources();

        return Inertia::render('Logs/Index', [
            'sources' => collect($sources)->map(fn (array $meta, string $key) => [
                'key' => $key,
                'label' => $meta['label'],
                'exists' => is_readable($meta['path']),
            ])->values()->all(),
            'defaultSource' => 'bot_local',
        ]);
    }

    public function fetch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source' => ['required', 'string'],
            'lines' => ['nullable', 'integer', 'min:50', 'max:1000'],
        ]);

        $sources = $this->sources();
        $sourceKey = $validated['source'];

        if (!array_key_exists($sourceKey, $sources)) {
            return response()->json([
                'ok' => false,
                'error' => 'Fuente de logs no válida.',
            ], 422);
        }

        $path = $sources[$sourceKey]['path'];
        $lineCount = (int) ($validated['lines'] ?? 250);

        if (!is_readable($path)) {
            return response()->json([
                'ok' => true,
                'source' => $sourceKey,
                'label' => $sources[$sourceKey]['label'],
                'path' => $path,
                'exists' => false,
                'lines' => [],
                'updated_at' => null,
            ]);
        }

        return response()->json([
            'ok' => true,
            'source' => $sourceKey,
            'label' => $sources[$sourceKey]['label'],
            'path' => $path,
            'exists' => true,
            'lines' => $this->tailFile($path, $lineCount),
            'updated_at' => @date(DATE_ATOM, (int) @filemtime($path)) ?: null,
        ]);
    }

    /**
     * @return array<string, array{label: string, path: string}>
     */
    private function sources(): array
    {
        return [
            'laravel' => [
                'label' => 'Laravel (storage/logs/laravel.log)',
                'path' => env('WEB_LOG_LARAVEL_PATH', storage_path('logs/laravel.log')),
            ],
            'bot_local' => [
                'label' => 'Bot local (bot/log.out)',
                'path' => env('WEB_LOG_BOT_PATH', base_path('bot/log.out')),
            ],
            'pm2_out' => [
                'label' => 'PM2 bot output (ticobot-out.log)',
                'path' => env('WEB_LOG_PM2_OUT_PATH', '/home/fabian/.pm2/logs/ticobot-out.log'),
            ],
            'pm2_error' => [
                'label' => 'PM2 bot errors (ticobot-error.log)',
                'path' => env('WEB_LOG_PM2_ERROR_PATH', '/home/fabian/.pm2/logs/ticobot-error.log'),
            ],
        ];
    }

    /**
     * Lee las últimas N líneas sin cargar el archivo completo a memoria.
     *
     * @return array<int, string>
     */
    private function tailFile(string $path, int $lines = 250, int $maxBytes = 262144): array
    {
        $handle = @fopen($path, 'rb');
        if ($handle === false) {
            return [];
        }

        $chunkSize = 4096;
        $buffer = '';
        $lineBreaks = 0;

        @fseek($handle, 0, SEEK_END);
        $fileSize = @ftell($handle);
        if (!is_int($fileSize) || $fileSize <= 0) {
            @fclose($handle);
            return [];
        }

        $position = $fileSize;
        $bytesRead = 0;

        while ($position > 0 && $lineBreaks <= $lines + 1 && $bytesRead < $maxBytes) {
            $readSize = min($chunkSize, $position);
            $position -= $readSize;

            @fseek($handle, $position);
            $chunk = @fread($handle, $readSize);
            if ($chunk === false || $chunk === '') {
                break;
            }

            $buffer = $chunk . $buffer;
            $bytesRead += $readSize;
            $lineBreaks += substr_count($chunk, "\n");
        }

        @fclose($handle);

        $allLines = preg_split('/\r\n|\n|\r/', trim($buffer));
        if (!is_array($allLines)) {
            return [];
        }

        return array_values(array_slice($allLines, -$lines));
    }
}
