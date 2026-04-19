<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contract extends Model
{
    /** @use HasFactory<\Database\Factories\ContractFactory> */
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'client_id',
        'amount',
        'discount_amount',
        'currency',
        'billing_cycle',
        'next_due_date',
        'grace_period_days',
        'metadata',
        'notes',
        'contract_type_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'next_due_date' => 'date',
        'metadata' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (Contract $contract): void {
            // Temporary placeholder until the database assigns the contract ID.
            $contract->name = 'TC-PENDING';
        });

        static::created(function (Contract $contract): void {
            $expectedCode = self::buildCodeFromId((int) $contract->id);

            if ($contract->name !== $expectedCode) {
                $contract->forceFill(['name' => $expectedCode])->saveQuietly();
            }
        });

        static::updating(function (Contract $contract): void {
            if ($contract->isDirty('name')) {
                $contract->name = (string) $contract->getOriginal('name');
            }
        });
    }

    public static function buildCodeFromId(int $id): string
    {
        $digits = (string) max(0, $id);
        $width = max(4, strlen($digits));

        return 'TC'.str_pad($digits, $width, '0', STR_PAD_LEFT);
    }

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function reminders()
    {
        return $this->hasMany(Reminder::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function contractType()
    {
        return $this->belongsTo(ContractType::class);
    }

    public function services()
    {
        return $this->belongsToMany(Service::class)
            ->withPivot(['quantity', 'pin_override', 'service_account_id'])
            ->withTimestamps();
    }
}
