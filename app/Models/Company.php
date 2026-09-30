<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Company extends Model
{
    protected $fillable = [
        'name', 'slug', 'reminder_template', 'payment_contact',
        'bank_accounts', 'beneficiary_name', 'is_active',
        'sinpe_email_enabled', 'sinpe_imap_host', 'sinpe_imap_port',
        'sinpe_imap_encryption', 'sinpe_imap_folder', 'sinpe_imap_username', 'sinpe_imap_password',
    ];

    protected $casts = ['is_active' => 'boolean', 'sinpe_email_enabled' => 'boolean', 'sinpe_imap_port' => 'integer', 'sinpe_imap_password' => 'encrypted'];

    protected static function booted(): void
    {
        static::saving(function (Company $company): void {
            $company->slug = Str::slug($company->slug ?: $company->name);
        });
    }

    public function clients() { return $this->hasMany(Client::class); }
    public function services() { return $this->hasMany(Service::class); }

    public function reminderPayload(): array
    {
        return array_filter([
            'company_id' => $this->id,
            'sender_company' => $this->slug,
            'company_name' => $this->name,
            'company_reminder_template' => $this->reminder_template,
            'payment_contact' => $this->payment_contact,
            'bank_accounts' => $this->bank_accounts,
            'beneficiary_name' => $this->beneficiary_name,
        ], fn ($value) => $value !== null && $value !== '');
    }
}
