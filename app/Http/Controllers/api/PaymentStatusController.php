<?php

namespace App\Http\Controllers\api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Payment;
use App\Models\PausedContact;
use App\Models\Reminder;
use Carbon\Carbon;
use Illuminate\Http\Request;

class PaymentStatusController extends Controller
{
    /**
     * Obtener estado de pagos de un cliente por teléfono.
     * POST /api/payment-status/{phone}
     */
    public function getByPhone($phone)
    {
        // Formatear el número (limpiar caracteres especiales)
        $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
        
        // Buscar cliente por teléfono
        $client = Client::where('phone', 'like', "%$cleanPhone%")
            ->first();

        if (!$client) {
            return response()->json([
                'success' => false,
                'message' => 'Cliente no encontrado',
            ], 404);
        }

        // Obtener pagos del cliente
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
     * Pausar un contacto (agregar a lista blanca).
     * POST /api/paused-contacts
     */
    public function pauseContact(Request $request)
    {
        $validated = $request->validate([
            'client_id' => 'required|exists:clients,id',
            'whatsapp_number' => 'required|string',
            'reason' => 'nullable|string',
        ]);

        $pausedContact = PausedContact::firstOrCreate(
            [
                'client_id' => $validated['client_id'],
                'whatsapp_number' => $validated['whatsapp_number'],
            ],
            [
                'reason' => $validated['reason'] ?? null,
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Contacto agregado a la lista de pausa',
            'data' => $pausedContact,
        ]);
    }

    /**
     * Reanudar un contacto (remover de lista blanca).
     * DELETE /api/paused-contacts/{clientId}/{whatsappNumber}
     */
    public function resumeContact($clientId, $whatsappNumber)
    {
        $deleted = PausedContact::where('client_id', $clientId)
            ->where('whatsapp_number', $whatsappNumber)
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
     * Listar todos los contactos pausados.
     * GET /api/paused-contacts
     */
    public function listPaused()
    {
        $pausedContacts = PausedContact::with('client')
            ->get(['id', 'client_id', 'whatsapp_number', 'reason', 'created_at']);

        return response()->json([
            'success' => true,
            'total' => $pausedContacts->count(),
            'data' => $pausedContacts,
        ]);
    }

    /**
     * Verificar si un número está pausado.
     * GET /api/paused-contacts/check/{whatsappNumber}
     */
    public function isPaused($whatsappNumber)
    {
        $paused = PausedContact::where('whatsapp_number', $whatsappNumber)->exists();

        return response()->json([
            'success' => true,
            'whatsapp_number' => $whatsappNumber,
            'is_paused' => $paused,
        ]);
    }

    /**
     * Obtener clientes con pagos pendientes.
     * GET /api/clients/pending-payments
     */
    public function clientsWithPendingPayments(Request $request)
    {
        $perPage = $request->query('per_page', 15);
        $search = $request->query('search', '');
        $sortBy = $request->query('sort_by', 'created_at');
        $sortOrder = $request->query('sort_order', 'desc');

        $query = Client::whereHas('payments', function ($q) {
            $q->where('status', 'unverified');
        })->with(['payments' => function ($q) {
            $q->where('status', 'unverified')->orderBy('created_at', 'desc');
        }]);

        // Filtro de búsqueda
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                    ->orWhere('phone', 'like', "%$search%")
                    ->orWhere('email', 'like', "%$search%");
            });
        }

        // Ordenamiento
        if (in_array($sortBy, ['name', 'created_at', 'phone'])) {
            $query->orderBy($sortBy, in_array($sortOrder, ['asc', 'desc']) ? $sortOrder : 'desc');
        }

        $clients = $query->paginate($perPage);

        // Mapear datos para el frontend
        $data = $clients->map(function ($client) {
            $pendingAmount = $client->payments->sum('amount');
            $pendingCount = $client->payments->count();

            return [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
                'email' => $client->email,
                'status' => $client->status,
                'pending_payments_count' => $pendingCount,
                'pending_amount' => $pendingAmount,
                'currency' => $client->payments->first()?->currency ?? 'CRC',
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
     * Obtener un resumen de clientes con pagos pendientes.
     * GET /api/summary/pending-payments
     */
    public function summaryPendingPayments()
    {
        $clientsWithPending = Client::whereHas('payments', function ($q) {
            $q->where('status', 'unverified');
        })->count();

        $totalPendingAmount = Payment::where('status', 'unverified')->sum('amount');

        $byStatus = Payment::where('status', 'unverified')
            ->groupBy('currency')
            ->selectRaw('currency, SUM(amount) as total, COUNT(*) as count')
            ->get();

        return response()->json([
            'success' => true,
            'total_clients_with_pending' => $clientsWithPending,
            'total_pending_amount' => $totalPendingAmount,
            'by_currency' => $byStatus,
        ]);
    }

    /**
     * Crear y encolar un recordatorio simple para un cliente.
     * POST /api/clients/{client}/send-reminder
     */
    public function sendReminder(Request $request, Client $client)
    {
        $request->validate([
            'message' => 'nullable|string',
            'contract_id' => 'nullable|exists:contracts,id',
            'scheduled_for' => 'nullable|date',
            'due_date' => 'nullable|date',
        ]);

        $contractId = $request->input('contract_id') ?? optional($client->contracts()->first())->id;

        $scheduled = $request->filled('scheduled_for') ? Carbon::parse($request->input('scheduled_for')) : Carbon::now();

        $payload = [
            'message' => $request->input('message') ?? null,
        ];

        // If caller provided a due_date, include it in the payload so the
        // reminder message will reference the supplied date instead of the
        // contract's stored next_due_date (which may point to the next month).
        if ($request->filled('due_date')) {
            $payload['due_date'] = Carbon::parse($request->input('due_date'))->toDateString();
        }

        $reminder = Reminder::create([
            'contract_id' => $contractId,
            'client_id' => $client->id,
            'channel' => 'whatsapp',
            'scheduled_for' => $scheduled,
            'status' => 'pending',
            'payload' => $payload,
        ]);

        return response()->json([
            'success' => true,
            'reminder' => $reminder,
        ], 201);
    }
}

