<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SearchController extends Controller
{
    public function global(Request $request)
    {
        $query = trim((string) $request->get('q', ''));
        $limit = min(max((int) $request->get('limit', 10), 1), 50);

        if (mb_strlen($query) < 2) {
            return response()->json(['clients' => [], 'contracts' => [], 'payments' => []]);
        }

        $clients = Client::query()
            ->where(function ($clientQuery) use ($query): void {
                $clientQuery->where('name', 'like', "%{$query}%")
                    ->orWhere('email', 'like', "%{$query}%")
                    ->orWhere('phone', 'like', "%{$query}%")
                    ->orWhereHas('contracts.services', fn ($serviceQuery) => $serviceQuery->where('account_email', 'like', "%{$query}%"));
            })
            ->select('id', 'name', 'email', 'phone', 'status')
            ->limit($limit)
            ->get();

        $contracts = Contract::query()
            ->where('name', 'like', "%{$query}%")
            ->orWhereHas('client', fn ($clientQuery) => $clientQuery->where('name', 'like', "%{$query}%"))
            ->orWhereHas('services', fn ($serviceQuery) => $serviceQuery->where('account_email', 'like', "%{$query}%"))
            ->with('client:id,name')
            ->select('id', 'name', 'client_id', 'amount', 'currency', 'next_due_date')
            ->limit($limit)
            ->get();

        $payments = Payment::query()
            ->where('reference', 'like', "%{$query}%")
            ->orWhereHas('contract.client', fn ($clientQuery) => $clientQuery->where('name', 'like', "%{$query}%"))
            ->with('contract.client:id,name')
            ->select('id', 'reference', 'contract_id', 'amount', 'status', 'paid_at')
            ->limit($limit)
            ->get();

        return response()->json(compact('clients', 'contracts', 'payments'));
    }
}
