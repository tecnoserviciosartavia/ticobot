<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'service_id',
        'name',
        'identifier',
        'metadata',
        'is_active',
    ];

    protected $casts = [
        'metadata' => 'array',
        'is_active' => 'bool',
    ];

    public function service()
    {
        return $this->belongsTo(Service::class);
    }
}
