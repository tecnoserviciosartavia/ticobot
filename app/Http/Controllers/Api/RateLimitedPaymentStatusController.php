<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\ApiRateLimitMiddleware;
use App\Models\Client;
use App\Models\Payment;
use App\Models\PausedContact;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RateLimitedPaymentStatusController extends Controller
{
    public function __construct()
    {
        // Apply rate limiting to all methods
        $this->middleware('api.rate.limit:30,1'); // 30 requests per minute per user/IP
    }

    /**
     * Get payment status by phone with rate limiting
     * POST /api/rate-limited/payment-status/{phone}
     */
    public function getByPhone($phone)
    {
        // Formatear el número (limpiar caracteres especiales)
        $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
        
        // Buscar cliente por teléfono (seguro con parameter binding)
        $client = Client::where('phone', 'like', '%' . $cleanPhone . '%')
            ->first();

        if (!$client) {
            return response()->json([
                'success' => false,
                'message' => 'Cliente no encontrado',
            ], 404);
        }

        // Obtener pagos del cliente con eager loading
        $payments = $client->payments()
            ->orderBy('created_at', 'desc')
            ->get(['id', 'amount', 'currency', 'status', 'paid_at', 'created_at']);

        // Contar pagos sin verificar y verificados
        $unverifiedPayments = $client->payments()->where('status', 'unverified')->count();
        $verifiedPayments = $client->payments()->where('status', 'verified')->count();

        return response()->json([
            'success' => true,
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
            ],
            'summary' => [
                'total_payments' => $payments->count(),
                'unverified' => $unverifiedPayments,
                'verified' => $verifiedPayments,
            ],
            'payments' => $payments,
        ]);
    }

    /**
     * Pause contact with rate limiting
     * POST /api/rate-limited/paused-contacts
     */
    public function pauseContact(Request $request)
    {
        $validated = $request->validate([
            'client_id' => 'nullable|exists:clients,id',
            'whatsapp_number' => 'required|string',
            'reason' => 'nullable|string',
        ]);

        // Normalize whatsapp_number to digits-only for consistent lookup.
        $validated['whatsapp_number'] = preg_replace('/[^0-9]/', '', $validated['whatsapp_number']);

        // If client_id is not provided, try to infer it from the client's phone.
        if (empty($validated['client_id'])) {
            $clean = preg_replace('/[^0-9]/', '', $validated['whatsapp_number']);
            $client = Client::where('phone', 'like', '%' . $clean . '%')->first();
            if ($client) {
                $validated['client_id'] = $client->id;
            }
        }

        $pausedContact = PausedContact::firstOrCreate(
            [
                'whatsapp_number' => $validated['whatsapp_number'],
            ],
            [
                'client_id' => $validated['client_id'] ?? null,
                'reason' => $validated['reason'] ?? null,
            ]
        );

        // If we created it without client_id but later inferred one, update it.
        if (!empty($validated['client_id']) && empty($pausedContact->client_id)) {
            $pausedContact->client_id = $validated['client_id'];
            $pausedContact->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Contacto agregado a la lista de pausa',
            'data' => $pausedContact,
        ]);
    }

    /**
     * Resume contact with rate limiting
     * DELETE /api/rate-limited/paused-contacts/{clientId}/{whatsappNumber}
     */
    public function resumeContact($clientId, $whatsappNumber)
    {
        $normalized = preg_replace('/[^0-9]/', '', $whatsappNumber);
        $last8 = substr($normalized, -8);

        $deleted = PausedContact::where('client_id', $clientId)
            ->where(function ($q) use ($normalized, $last8) {
                $q->where('whatsapp_number', $normalized)
                    ->orWhere('whatsapp_number', 'like', "%$last8");
            })
            ->delete();

        if (!$deleted) {
            return response()->json([
                'success' => false,
                'message' => 'Contacto no encontrado en lista de pausa',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'message' => 'Contacto removido de la lista de pausa',
        ]);
    }

    /**
     * Resume contact by number only with rate limiting
     * DELETE /api/rate-limited/paused-contacts/by-number/{whatsappNumber}
     */
    public function resumeContactByNumber($whatsappNumber)
    {
        $normalized = preg_replace('/[^0-9]/', '', $whatsappNumber);
        $last8 = substr($normalized, -8);
        
        $deleted = PausedContact::where('whatsapp_number', $normalized)
            ->orWhere('whatsapp_number', 'like', "%$last8")
            ->delete();

        if (!$deleted) {
            return response()->json([
                'success' => false,
                'message' => 'Contacto no encontrado en lista de pausa',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'message' => 'Contacto removido de la lista de pausa',
        ]);
    }

    /**
     * List paused contacts with rate limiting and pagination
     * GET /api/rate-limited/paused-contacts
     */
    public function listPaused(Request $request)
    {
        $perPage = $request->query('per_page', 15);
        $search = $request->query('search', '');

        $query = PausedContact::with('client:id,name,phone')
            ->orderByDesc('created_at');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('whatsapp_number', 'like', "%{$search}%")
                  ->orWhereHas('client', function ($subQ) use ($search) {
                      $subQ->where('name', 'like', "%{$search}%");
                  });
            });
        }

        $pausedContacts = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $pausedContacts->items(),
            'pagination' => [
                'total' => $pausedContacts->total(),
                'per_page' => $pausedContacts->perPage(),
                'current_page' => $pausedContacts->currentPage(),
                'last_page' => $pausedContacts->lastPage(),
                'from' => $pausedContacts->firstItem(),
                'to' => $pausedContacts->lastItem(),
            ],
        ]);
    }

    /**
     * Check if number is paused with rate limiting
     * GET /api/rate-limited/paused-contacts/check/{whatsappNumber}
     */
    public function isPaused($whatsappNumber)
    {
        $normalized = preg_replace('/[^0-9]/', '', $whatsappNumber);
        $last8 = substr($normalized, -8);
        
        $paused = PausedContact::where('whatsapp_number', $normalized)
            ->orWhere('whatsapp_number', 'like', "%$last8")
            ->exists();

        return response()->json([
            'success' => true,
            'whatsapp_number' => $normalized,
            'is_paused' => $paused,
        ]);
    }

    /**
     * Get clients with pending payments (rate limited)
     * GET /api/rate-limited/clients/pending-payments
     */
    public function clientsWithPendingPayments(Request $request)
    {
        $perPage = min($request->query('per_page', 15), 50); // Limit max per page
        $search = $request->query('search', '');
        $sortBy = $request->query('sort_by', 'created_at');
        $sortOrder = $request->query('sort_order', 'desc');

        // Optimized query with proper joins
        $query = Client::query()
            ->leftJoin('contracts', function ($join) {
                $join->on('clients.id', '=', 'contracts.client_id')
                     ->whereNull('contracts.deleted_at');
            })
            ->leftJoin('payments', function ($join) {
                $join->on('contracts.id', '=', 'payments.contract_id')
                     ->whereNull('payments.deleted_at');
            })
            ->select([
                'clients.id',
                'clients.name',
                'clients.phone',
                'clients.email',
                'clients.status',
                'clients.created_at',
                'clients.updated_at'
            ])
            ->selectRaw('COUNT(DISTINCT contracts.id) as contract_count')
            ->selectRaw('COUNT(DISTINCT CASE 
                WHEN payments.id IS NOT NULL THEN payments.id 
            END) as payment_count')
            ->selectRaw('SUM(CASE 
                WHEN contracts.next_due_date < CURDATE() 
                AND payments.id IS NULL 
                THEN contracts.amount 
                ELSE 0 
            END) as pending_amount')
            ->groupBy('clients.id', 'clients.name', 'clients.phone', 'clients.email', 'clients.status', 'clients.created_at', 'clients.updated_at')
            ->having('pending_amount', '>', 0);

        // Filtro de búsqueda
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('clients.name', 'like', "%{$search}%")
                  ->orWhere('clients.phone', 'like', "%{$search}%")
                  ->orWhere('clients.email', 'like', "%{$search}%");
            });
        }

        // Ordenamiento seguro
        $allowedSortFields = ['name', 'created_at', 'phone', 'pending_amount'];
        if (in_array($sortBy, $allowedSortFields)) {
            $order = in_array($sortOrder, ['asc', 'desc']) ? $sortOrder : 'desc';
            $query->orderBy($sortBy === 'pending_amount' ? DB::raw('pending_amount') : "clients.{$sortBy}", $order);
        }

        $clients = $query->paginate($perPage);

        // Transform data for frontend
        $data = collect($clients->items())->map(function ($client) {
            return [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
                'email' => $client->email,
                'status' => $client->status,
                'contract_count' => (int) $client->contract_count,
                'payment_count' => (int) $client->payment_count,
                'pending_amount' => (float) $client->pending_amount,
                'currency' => 'CRC', // Default currency
                'created_at' => $client->created_at,
                'updated_at' => $client->updated_at,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $data,
            'pagination' => [
                'total' => $clients->total(),
                'per_page' => $clients->perPage(),
                'current_page' => $clients->currentPage(),
                'last_page' => $clients->lastPage(),
                'from' => $clients->firstItem(),
                'to' => $clients->lastItem(),
            ],
        ]);
    }

    /**
     * Get summary of pending payments (rate limited)
     * GET /api/rate-limited/summary/pending-payments
     */
    public function summaryPendingPayments()
    {
        // Optimized aggregate query
        $summary = Client::query()
            ->join('contracts', function ($join) {
                $join->on('clients.id', '=', 'contracts.client_id')
                     ->whereNull('contracts.deleted_at');
            })
            ->leftJoin('payments', function ($join) {
                $join->on('contracts.id', '=', 'payments.contract_id')
                     ->whereNull('payments.deleted_at');
            })
            ->selectRaw('
                COUNT(DISTINCT clients.id) as total_clients_with_pending,
                SUM(CASE 
                    WHEN contracts.next_due_date < CURDATE() 
                    AND payments.id IS NULL 
                    THEN contracts.amount 
                    ELSE 0 
                END) as total_pending_amount,
                contracts.currency,
                COUNT(DISTINCT contracts.id) as pending_contracts
            ')
            ->where('contracts.next_due_date', '<', now())
            ->whereNull('payments.id')
            ->groupBy('contracts.currency')
            ->get();

        $totalClients = $summary->sum('total_clients_with_pending');
        $totalAmount = $summary->sum('total_pending_amount');

        return response()->json([
            'success' => true,
            'total_clients_with_pending' => $totalClients,
            'total_pending_amount' => $totalAmount,
            'by_currency' => $summary->map(function ($item) {
                return [
                    'currency' => $item->currency ?? 'CRC',
                    'total' => (float) ($item->total_pending_amount ?? 0),
                    'count' => (int) ($item->pending_contracts ?? 0),
                ];
            })->values(),
        ]);
    }
}
