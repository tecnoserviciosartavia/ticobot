<?php

namespace App\Models;

use Carbon\Carbon;
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
        'last_resend_at',
        'acknowledged_at',
        'status',
        'notes',
        'payload',
        'response_payload',
        'attempts',
        'last_attempt_at',
    ];

    protected $casts = [
        'scheduled_for' => 'datetime',
        'queued_at' => 'datetime',
        'sent_at' => 'datetime',
        'last_resend_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'last_attempt_at' => 'datetime',
        'payload' => 'array',
        'response_payload' => 'array',
    ];

    public static function createOpenUnique(array $attributes): self
    {
        $scheduledFor = static::normalizeScheduledForValue($attributes['scheduled_for'] ?? null);

        $query = static::query()
            ->where('client_id', $attributes['client_id'])
            ->whereIn('status', ['pending', 'queued', 'sent']);

        if (array_key_exists('contract_id', $attributes)) {
            if ($attributes['contract_id']) {
                $query->where('contract_id', $attributes['contract_id']);
            } else {
                $query->whereNull('contract_id');
            }
        }

        $existing = $query
            ->latest('id')
            ->get()
            ->first(function (self $candidate) use ($scheduledFor) {
                if (! $candidate->scheduled_for) {
                    return false;
                }

                return $candidate->scheduled_for
                    ->copy()
                    ->setTimezone(config('app.timezone'))
                    ->equalTo($scheduledFor);
            });

        if ($existing) {
            $existing->mergeMissingPayload($attributes['payload'] ?? null);

            return $existing;
        }

        $attributes['scheduled_for'] = $scheduledFor;

        return static::create($attributes);
    }

    private static function normalizeScheduledForValue(mixed $value): Carbon
    {
        if ($value instanceof \DateTimeInterface) {
            return Carbon::instance($value)->setTimezone(config('app.timezone'));
        }

        return Carbon::parse((string) $value, config('app.timezone'));
    }

    private function mergeMissingPayload(?array $incomingPayload): void
    {
        if (! is_array($incomingPayload) || $incomingPayload === []) {
            return;
        }

        $payload = is_array($this->payload) ? $this->payload : [];
        $changed = false;

        foreach ($incomingPayload as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            if (! array_key_exists($key, $payload) || $payload[$key] === null || $payload[$key] === '') {
                $payload[$key] = $value;
                $changed = true;
            }
        }

        if ($changed) {
            $this->forceFill(['payload' => $payload])->save();
        }
    }

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
