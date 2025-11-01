<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Client extends Model
{
    /** @use HasFactory<\Database\Factories\ClientFactory> */
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'name',
        'legal_id',
        'email',
        'phone',
        'status',
        'metadata',
        'notes',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function contracts()
    {
        return $this->hasMany(Contract::class);
    }

    public function reminders()
    {
        return $this->hasMany(Reminder::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }
}
