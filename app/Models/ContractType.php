<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ContractType extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'name',
        'default_message',
        'active',
    ];

    protected $casts = [
        'active' => 'boolean',
    ];
}
