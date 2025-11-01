<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    /** @use HasFactory<\Database\Factories\PaymentFactory> */
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'client_id',
        'contract_id',
        'reminder_id',
        'amount',
        'currency',
        'status',
        'channel',
        'reference',
        'paid_at',
        'metadata',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'date',
        'metadata' => 'array',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function reminder()
    {
        return $this->belongsTo(Reminder::class);
    }

    public function receipts()
    {
        return $this->hasMany(PaymentReceipt::class);
    }

    public function conciliation()
    {
        return $this->hasOne(Conciliation::class);
    }
}
