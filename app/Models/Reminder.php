<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Reminder extends Model
{
    /** @use HasFactory<\Database\Factories\ReminderFactory> */
    use HasFactory;
    use SoftDeletes;

    /**
     * Serialize dates as ISO8601 with timezone so frontend parses them correctly.
     */
    protected $dateFormat = 'c';

    protected $fillable = [
        'contract_id',
        'client_id',
        'channel',
        'scheduled_for',
        'queued_at',
        'sent_at',
        'acknowledged_at',
        'status',
        'payload',
        'response_payload',
        'attempts',
        'last_attempt_at',
    ];

    protected $casts = [
        'scheduled_for' => 'datetime',
        'queued_at' => 'datetime',
        'sent_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'last_attempt_at' => 'datetime',
        'payload' => 'array',
        'response_payload' => 'array',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function messages()
    {
        return $this->hasMany(ReminderMessage::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }
}
