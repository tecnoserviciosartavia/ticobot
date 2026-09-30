<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class PausedContact extends Model
{
    use HasFactory;
    protected $fillable = [
        'client_id',
        'whatsapp_number',
        'reason',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }
}

