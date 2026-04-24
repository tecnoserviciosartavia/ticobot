<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SinpeEmailTransaction extends Model
{
    protected $table = 'sinpe_email_transactions';

    protected $fillable = [
        'reference',
        'origin_phone',
        'origin_name',
        'motive',
        'amount',
        'performed_at',
        'message_uid',
        'mail_subject',
        'is_read',
        'status',
        'matched_client_id',
        'matched_contract_id',
        'payment_id',
        'notes',
        'raw_excerpt',
    ];

    protected $casts = [
        'amount'       => 'decimal:2',
        'performed_at' => 'datetime',
        'is_read'      => 'boolean',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class, 'matched_client_id');
    }

    public function contract()
    {
        return $this->belongsTo(Contract::class, 'matched_contract_id');
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }
}
