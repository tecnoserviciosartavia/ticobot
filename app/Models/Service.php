<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    /** @use HasFactory<\Database\Factories\ServiceFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'price',
        'cost',
        'payment_day',
        'account_email',
        'password',
        'pin',
        'max_profiles',
        'currency',
        'is_active',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'cost' => 'decimal:2',
        'payment_day' => 'integer',
        'max_profiles' => 'integer',
        'is_active' => 'bool',
    ];

    public function contracts()
    {
        return $this->belongsToMany(Contract::class)->withTimestamps();
    }

    public function accounts()
    {
        return $this->hasMany(ServiceAccount::class);
    }
}
