<?php

namespace App\Services;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Service;
use Illuminate\Support\Collection;
use Carbon\Carbon;

class ContractService
{
    /**
     * Create a new contract with services
     */
    public function createContract(array $data, ?Client $client = null): Contract
    {
        $serviceIds = $data['service_ids'] ?? [];
        $serviceQuantities = $data['service_quantities'] ?? [];
        $servicePins = $data['service_pins'] ?? [];

        // Calculate amount from services
        $amount = $this->calculateContractAmount($serviceIds, $serviceQuantities, $data['discount_amount'] ?? 0);

        $contractData = [
            'client_id' => $client?->id,
            'amount' => $amount,
            'discount_amount' => max(0, (float) ($data['discount_amount'] ?? 0)),
            'currency' => strtoupper($data['currency']),
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'] ?? $this->computeNextDueDate($data['billing_cycle']),
            'grace_period_days' => $data['grace_period_days'] ?? 0,
            'notes' => $data['notes'] ?? null,
        ];

        $contract = Contract::create($contractData);

        // Attach services with pivot data
        $this->attachServicesToContract($contract, $serviceIds, $serviceQuantities, $servicePins, $client);

        return $contract;
    }

    /**
     * Update an existing contract
     */
    public function updateContract(Contract $contract, array $data): Contract
    {
        $serviceIds = $data['service_ids'] ?? [];
        $serviceQuantities = $data['service_quantities'] ?? [];
        $servicePins = $data['service_pins'] ?? [];

        // Calculate new amount
        $amount = $this->calculateContractAmount($serviceIds, $serviceQuantities, $data['discount_amount'] ?? 0);

        $contractData = [
            'amount' => $amount,
            'discount_amount' => max(0, (float) ($data['discount_amount'] ?? 0)),
            'currency' => strtoupper($data['currency']),
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'] ?? $contract->next_due_date,
            'grace_period_days' => $data['grace_period_days'] ?? $contract->grace_period_days,
            'notes' => $data['notes'] ?? $contract->notes,
        ];

        $contract->update($contractData);

        // Update services
        $this->attachServicesToContract($contract, $serviceIds, $serviceQuantities, $servicePins, $contract->client);

        return $contract->fresh();
    }

    /**
     * Calculate contract amount based on services
     */
    protected function calculateContractAmount(array $serviceIds, array $serviceQuantities, float $discountAmount): float
    {
        if (empty($serviceIds)) {
            return 0.0;
        }

        $qty = collect($serviceQuantities)
            ->mapWithKeys(fn ($v, $k) => [(int) $k => max(1, (int) $v)]);

        $services = Service::query()
            ->whereIn('id', $serviceIds)
            ->get(['id', 'name', 'price'])
            ->keyBy('id');

        $total = 0.0;
        foreach ($services as $service) {
            $quantity = (int) ($qty[(int) $service->id] ?? 1);
            $total += ((float) $service->price) * $quantity;
        }

        return max(0, $total - $discountAmount);
    }

    /**
     * Attach services to contract with pivot data
     */
    protected function attachServicesToContract(
        Contract $contract,
        array $serviceIds,
        array $serviceQuantities,
        array $servicePins,
        ?Client $client
    ): void {
        if (empty($serviceIds)) {
            return;
        }

        $qty = collect($serviceQuantities)
            ->mapWithKeys(fn ($v, $k) => [(int) $k => max(1, (int) $v)]);
            
        $servicePins = collect($servicePins)
            ->mapWithKeys(fn ($v, $k) => [(int) $k => trim((string) $v)]);

        $services = Service::query()
            ->whereIn('id', $serviceIds)
            ->get(['id', 'name', 'price', 'pin'])
            ->keyBy('id');

        $syncData = [];
        foreach ($serviceIds as $serviceId) {
            $serviceId = (int) $serviceId;
            if (!$serviceId) continue;

            $service = $services->get($serviceId);
            $syncData[$serviceId] = [
                'quantity' => (int) ($qty[$serviceId] ?? 1),
                'pin_override' => $this->resolveAccessPin(
                    $service?->name,
                    $client?->phone,
                    $servicePins[$serviceId] ?? null,
                    $service?->pin
                ),
            ];
        }

        $contract->services()->sync($syncData);
    }

    /**
     * Resolve access PIN for service
     */
    protected function resolveAccessPin(?string $serviceName, ?string $phone, ?string $providedPin, ?string $defaultPin): ?string
    {
        $serviceNameNorm = mb_strtolower((string) ($serviceName ?? ''));
        
        // Spotify doesn't use PIN
        if (str_contains($serviceNameNorm, 'spotify')) {
            return null;
        }

        // Use provided PIN if available
        $providedPin = trim((string) ($providedPin ?? ''));
        if ($providedPin !== '') {
            return $providedPin;
        }

        // Use default PIN if available
        $defaultPin = trim((string) ($defaultPin ?? ''));
        if ($defaultPin !== '') {
            return $defaultPin;
        }

        // Generate PIN from phone number
        if ($phone) {
            $digits = preg_replace('/\D+/', '', $phone);
            if ($digits !== '') {
                $lastFour = substr($digits, -4);
                if ($lastFour !== '') {
                    if (str_contains($serviceNameNorm, 'prime')) {
                        return $lastFour . substr($lastFour, -1);
                    }
                    return $lastFour;
                }
            }
        }

        return null;
    }

    /**
     * Compute next due date based on billing cycle
     */
    protected function computeNextDueDate(string $billingCycle): string
    {
        $today = Carbon::today(config('app.timezone'));
        
        return match ($billingCycle) {
            'weekly' => $today->copy()->addDays(7)->toDateString(),
            'biweekly' => $today->copy()->addDays(14)->toDateString(),
            'monthly' => $today->copy()->addMonthNoOverflow()->toDateString(),
            'one_time' => $today->toDateString(),
            default => $today->toDateString(),
        };
    }

    /**
     * Create a quick contract (for client creation flow)
     */
    public function createQuickContract(array $data): Contract
    {
        $contract = Contract::create([
            'client_id' => null, // Will be assigned later
            'amount' => $data['amount'],
            'discount_amount' => max(0, (float) ($data['discount_amount'] ?? 0)),
            'currency' => $data['currency'],
            'billing_cycle' => $data['billing_cycle'],
            'next_due_date' => $data['next_due_date'],
            'grace_period_days' => $data['grace_period_days'] ?? 0,
            'notes' => $data['notes'] ?? null,
        ]);

        // Attach services if provided
        if (!empty($data['service_ids'])) {
            $this->attachServicesToContract(
                $contract,
                $data['service_ids'],
                $data['service_quantities'] ?? [],
                $data['service_pins'] ?? [],
                null
            );

            // Recalculate amount
            $total = $this->calculateContractAmount(
                $data['service_ids'],
                $data['service_quantities'] ?? [],
                (float) ($data['discount_amount'] ?? 0)
            );
            
            $contract->forceFill(['amount' => $total])->save();
        }

        return $contract;
    }

    /**
     * Get contract statistics
     */
    public function getContractStats(): array
    {
        $stats = [
            'total_contracts' => Contract::count(),
            'active_contracts' => Contract::whereHas('client')->count(),
            'by_billing_cycle' => Contract::selectRaw('billing_cycle, COUNT(*) as count')
                ->groupBy('billing_cycle')
                ->get()
                ->pluck('count', 'billing_cycle')
                ->toArray(),
            'by_currency' => Contract::selectRaw('currency, COUNT(*) as count')
                ->groupBy('currency')
                ->get()
                ->pluck('count', 'currency')
                ->toArray(),
        ];

        return $stats;
    }
}
