<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PausedContact extends Model
{
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

