<?php

namespace App\Services;

use App\Models\Client;
use App\Models\PayerAlias;
use App\Models\Payment;
use Illuminate\Support\Str;

class PayerAliasService
{
    public function learnFromVerifiedPayment(Payment $payment): ?PayerAlias
    {
        if ($payment->status !== 'verified') return null;
        $payment->loadMissing('client.company');
        $client = $payment->client;
        $metadata = is_array($payment->metadata) ? $payment->metadata : [];
        $originName = trim((string) ($metadata['sinpe_email_origin_name'] ?? ''));
        $companyId = (int) ($client?->company_id ?? 0);
        if (! $client || $companyId < 1 || $originName === '') return null;
        $normalized = $this->normalizeName($originName);
        if ($normalized === '') return null;

        $alias = PayerAlias::query()->firstOrNew([
            'company_id' => $companyId,
            'client_id' => $client->id,
            'normalized_name' => $normalized,
        ]);
        $phone = $this->digits((string) ($metadata['sinpe_email_origin_phone'] ?? ''));
        $alias->fill([
            'origin_name' => $originName,
            'origin_phone' => $phone !== '' ? $phone : $alias->origin_phone,
            'last_amount' => $payment->amount,
            'last_seen_at' => $payment->paid_at ?: now(),
            'is_active' => true,
            'match_count' => $alias->exists ? ((int) $alias->match_count + 1) : 1,
        ])->save();
        return $alias;
    }

    public function matchClient(string $originName, string $originPhone, float $amount, ?int $companyId = null): ?Client
    {
        $normalized = $this->normalizeName($originName);
        $phone = $this->digits($originPhone);
        if ($normalized === '' && $phone === '') return null;

        $aliases = PayerAlias::query()->where('is_active', true)
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where(function ($query) use ($normalized, $phone) {
                if ($normalized !== '') $query->where('normalized_name', $normalized);
                if ($phone !== '') $query->orWhere('origin_phone', $phone);
            })
            ->with(['client.contracts' => fn ($query) => $query->whereNull('deleted_at')])
            ->get();

        $matches = $aliases->filter(fn (PayerAlias $alias) => $alias->client
            && (int) $alias->client->company_id === (int) $alias->company_id
            && $alias->client->contracts->contains(fn ($contract) => abs((float) $contract->amount - $amount) < 0.009))
            ->values();

        return $matches->pluck('client_id')->unique()->count() === 1
            ? $matches->sortByDesc('match_count')->first()?->client
            : null;
    }

    public function normalizeName(string $value): string
    {
        $value = Str::lower(Str::ascii(trim($value)));
        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $value));
    }

    private function digits(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?: '';
    }
}
