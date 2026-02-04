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
        'name',
        'amount',
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
        'next_due_date' => 'date',
        'metadata' => 'array',
    ];

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
        return $this->belongsToMany(Service::class)->withTimestamps();
    }
}
