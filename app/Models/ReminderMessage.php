<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReminderMessage extends Model
{
    /** @use HasFactory<\Database\Factories\ReminderMessageFactory> */
    use HasFactory;

    protected $fillable = [
        'reminder_id',
        'client_id',
        'direction',
        'message_type',
        'content',
        'whatsapp_message_id',
        'attachment_path',
        'metadata',
        'sent_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'sent_at' => 'datetime',
    ];

    public function reminder()
    {
        return $this->belongsTo(Reminder::class);
    }

    public function client()
    {
        return $this->belongsTo(Client::class);
    }
}
