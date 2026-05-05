<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use Illuminate\Support\Facades\Log;

class SearchController extends Controller
{
    public function global(Request $request)
    {
        $query = $request->get('q', '');
        $limit = min($request->get('limit', 10), 50);
        
        Log::info('Search request', ['query' => $query, 'limit' => $limit]);
        
        if (strlen($query) < 2) {
            Log::info('Query too short');
            return response()->json([
                'clients' => [],
                'contracts' => [],
                'payments' => [],
            ]);
        }

        try {
            // Buscar clientes
            $clients = Client::where('name', 'like', "%{$query}%")
                ->orWhere('email', 'like', "%{$query}%")
                ->orWhere('phone', 'like', "%{$query}%")
                ->select('id', 'name', 'email', 'phone', 'status')
                ->limit($limit)
                ->get();

            Log::info('Clients found', ['count' => $clients->count()]);

            // Buscar contratos (usar name en lugar de contract_number)
            $contracts = Contract::where('name', 'like', "%{$query}%")
                ->orWhereHas('client', function ($q) use ($query) {
                    $q->where('name', 'like', "%{$query}%");
                })
                ->with('client:id,name')
                ->select('id', 'name', 'client_id', 'amount', 'currency', 'next_due_date')
                ->limit($limit)
                ->get();

            Log::info('Contracts found', ['count' => $contracts->count()]);

            // Buscar pagos (usar reference en lugar de payment_number)
            $payments = Payment::where('reference', 'like', "%{$query}%")
                ->orWhereHas('contract.client', function ($q) use ($query) {
                    $q->where('name', 'like', "%{$query}%");
                })
                ->with('contract.client:id,name')
                ->select('id', 'reference', 'contract_id', 'amount', 'status', 'paid_at')
                ->limit($limit)
                ->get();

            Log::info('Payments found', ['count' => $payments->count()]);

            return response()->json([
                'clients' => $clients,
                'contracts' => $contracts,
                'payments' => $payments,
            ]);
        } catch (\Exception $e) {
            Log::error('Search error', ['error' => $e->getMessage()]);
            return response()->json([
                'error' => $e->getMessage(),
                'clients' => [],
                'contracts' => [],
                'payments' => [],
            ], 500);
        }
    }
}
