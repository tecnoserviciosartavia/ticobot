<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentReceipt extends Model
{
    /** @use HasFactory<\Database\Factories\PaymentReceiptFactory> */
    use HasFactory;

    protected $fillable = [
        'payment_id',
        'file_path',
        'file_name',
        'file_size',
        'mime_type',
        'received_at',
        'metadata',
    ];

    protected $casts = [
        'received_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function payment()
    {
        return $this->belongsTo(Payment::class);
    }
}
