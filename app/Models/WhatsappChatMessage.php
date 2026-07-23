<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

class WhatsappChatMessage extends Model
{
    public const SERVICE_WINDOW_HOURS = 24;

    protected $fillable = [
        'phone',
        'direction',
        'body',
        'status',
        'whatsapp_message_id',
        'sent_by_user_id',
        'metadata',
        'sent_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'sent_at' => 'datetime',
    ];

    public static function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?: '';

        // Los números nacionales de Costa Rica tienen 8 dígitos. Guardarlos
        // siempre con 506 evita dividir un mismo hilo entre dos conversaciones.
        return strlen($digits) === 8 ? '506'.$digits : $digits;
    }

    public function setPhoneAttribute(mixed $value): void
    {
        $this->attributes['phone'] = static::normalizePhone((string) $value);
    }

    public function sentByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }

    public static function latestPerPhone(bool $onlyOpenWindow = false): Collection
    {
        $now = Carbon::now('UTC');

        // Obtener primero solo los IDs evita que MySQL ordene body/metadata (que puede
        // contener imágenes base64) dentro de un GROUP BY y agote sort_buffer_size.
        $visibleMessages = static fn ($query) => $query
            ->whereNull('metadata')
            ->orWhere('metadata', 'not like', '%"unresolved_lid": true%');

        $latestIds = static::query()
            ->where($visibleMessages)
            ->get(['id', 'phone', 'created_at'])
            ->sortByDesc(function (self $message): string {
                $timestamp = $message->created_at?->format('Y-m-d H:i:s.u') ?? '';

                return $timestamp.'-'.str_pad((string) $message->id, 20, '0', STR_PAD_LEFT);
            })
            ->unique('phone')
            ->pluck('id');
        $inboundStats = static::query()
            ->where($visibleMessages)
            ->select('phone')
            ->selectRaw('MAX(COALESCE(sent_at, created_at)) as last_inbound_at')
            ->selectRaw('SUM(CASE WHEN status = "received" THEN 1 ELSE 0 END) as unread_count')
            ->where('direction', 'inbound')
            ->groupBy('phone')
            ->get()
            ->keyBy('phone');

        $rows = static::query()
            ->whereIn('id', $latestIds)
            ->get(['id', 'phone', 'body', 'direction', 'metadata', 'sent_at', 'created_at'])
            ->map(function (self $row) use ($now, $inboundStats) {
                $stats = $inboundStats->get($row->phone);
                // Algunos registros históricos tienen sent_at almacenado con una
                // zona incorrecta. created_at es la hora estable de recepción en
                // el sistema y debe ser la fuente visible en web y móvil.
                $lastMessageAt = $row->created_at;
                $lastInboundAt = static::parseTimestamp($stats?->last_inbound_at ?? null);
                $serviceWindowExpiresAt = $lastInboundAt?->copy()->addHours(self::SERVICE_WINDOW_HOURS);
                $isServiceWindowOpen = $serviceWindowExpiresAt !== null && $serviceWindowExpiresAt->greaterThan($now);
                $lastMetadata = is_array($row->metadata) ? $row->metadata : [];

                $preview = $row->body;
                if (($preview === null || $preview === '') && is_array($lastMetadata)) {
                    $reactionEmoji = trim((string) data_get($lastMetadata, 'meta_payload.reaction.emoji', ''));
                    if ($reactionEmoji !== '') {
                        $preview = 'Reacción '.$reactionEmoji;
                    }

                    $media = $lastMetadata['media'] ?? null;
                    if (($preview === null || $preview === '') && is_array($media)) {
                        $preview = match ((string) ($media['kind'] ?? '')) {
                            'image' => 'Imagen',
                            'video' => 'Video',
                            'audio' => 'Audio',
                            'document' => 'Documento',
                            default => 'Adjunto',
                        };
                    }
                }

                return [
                    'phone' => (string) $row->phone,
                    'last_message_id' => (int) $row->id,
                    'last_message_at' => $lastMessageAt?->toIso8601String(),
                    'last_inbound_at' => $lastInboundAt?->toIso8601String(),
                    'service_window_expires_at' => $serviceWindowExpiresAt?->toIso8601String(),
                    'is_service_window_open' => $isServiceWindowOpen,
                    'last_body' => $preview,
                    'last_direction' => $row->direction ?? 'inbound',
                    'unread_count' => (int) ($stats?->unread_count ?? 0),
                ];
            })
            ->sortByDesc('last_message_at')
            ->values();

        if ($onlyOpenWindow) {
            $rows = $rows->filter(static fn (array $conversation) => $conversation['is_service_window_open']);
        }

        return $rows->values();
    }

    public static function openConversations(): Collection
    {
        return static::latestPerPhone(true);
    }

    public static function agentConversations(): Collection
    {
        return static::latestPerPhone(false)
            ->filter(static fn (array $conversation) => static::isAssignedToAgent($conversation['phone'])
                || static::hasRecentPlatformMessage($conversation['phone']))
            ->values();
    }

    public static function hasRecentPlatformMessage(string $phone): bool
    {
        $since = Carbon::now('UTC')->subHours(self::SERVICE_WINDOW_HOURS);

        return static::query()
            ->where('phone', preg_replace('/\D+/', '', $phone))
            ->where('direction', 'outbound')
            ->where(fn ($query) => $query
                ->where('created_at', '>=', $since)
                ->orWhere('sent_at', '>=', $since))
            ->get(['metadata'])
            ->contains(static fn (self $message) => data_get($message->metadata, 'source') === 'platform');
    }

    public static function isAssignedToAgent(string $phone): bool
    {
        $since = Carbon::now('UTC')->subHours(self::SERVICE_WINDOW_HOURS);

        return static::query()
            ->where('phone', preg_replace('/\D+/', '', $phone))
            ->where(fn ($query) => $query
                ->whereNotNull('sent_by_user_id')
                ->orWhereNotNull('metadata'))
            ->where(fn ($query) => $query
                ->where('created_at', '>=', $since)
                ->orWhere('sent_at', '>=', $since))
            ->get(['sent_by_user_id', 'metadata'])
            ->contains(static fn (self $message) => $message->sent_by_user_id !== null
                || (bool) data_get($message->metadata, 'help_requested', false));
    }

    public static function conversationSummaryForPhone(string $phone): ?array
    {
        return static::latestPerPhone(false)->firstWhere('phone', $phone);
    }

    private static function parseTimestamp(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Carbon::parse((string) $value, 'UTC');
    }
}
