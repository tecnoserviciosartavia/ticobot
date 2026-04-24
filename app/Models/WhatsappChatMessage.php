<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappChatMessage extends Model
{
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

    public function sentByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }

    public static function latestPerPhone(): \Illuminate\Support\Collection
    {
        return static::query()
            ->select('phone')
            ->selectRaw('MAX(created_at) as last_message_at')
            ->selectRaw('(SELECT body FROM whatsapp_chat_messages m2 WHERE m2.phone = whatsapp_chat_messages.phone ORDER BY m2.created_at DESC LIMIT 1) as last_body')
            ->selectRaw('(SELECT direction FROM whatsapp_chat_messages m3 WHERE m3.phone = whatsapp_chat_messages.phone ORDER BY m3.created_at DESC LIMIT 1) as last_direction')
            ->selectRaw('SUM(CASE WHEN direction = "inbound" AND status = "received" THEN 1 ELSE 0 END) as unread_count')
            ->groupBy('phone')
            ->orderByDesc('last_message_at')
            ->get();
    }
}
