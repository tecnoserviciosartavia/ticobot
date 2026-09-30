<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayerAlias extends Model
{
    protected $fillable = ['company_id', 'client_id', 'origin_name', 'normalized_name', 'origin_phone', 'last_amount', 'match_count', 'last_seen_at', 'is_active'];
    protected $casts = ['last_amount' => 'decimal:2', 'match_count' => 'integer', 'last_seen_at' => 'datetime', 'is_active' => 'boolean'];
    public function company() { return $this->belongsTo(Company::class); }
    public function client() { return $this->belongsTo(Client::class); }
}
