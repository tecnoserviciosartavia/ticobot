<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class PaymentController extends Controller
{
    /**
     * Al verificar un pago, marcar como "paid" (o al menos no enviables) los
     * recordatorios pendientes relacionados para evitar reenvíos/duplicados.
     */
    private function settleRemindersForVerifiedPayment(Payment $payment): void
    {
        if ($payment->status !== 'verified') {
            return;
        }

        // Si el pago ya está ligado a un recordatorio específico, liquidarlo.
        if ($payment->reminder_id) {
            Reminder::query()
                ->whereKey($payment->reminder_id)
                ->whereIn('status', ['pending', 'queued', 'sent'])
                ->update([
                    'status' => 'paid',
                    'acknowledged_at' => now(config('app.timezone')),
                ]);
            return;
        }

        // Caso común: pago manual/conciliado sin reminder_id.
        // Estrategia conservadora: para el mismo cliente/contrato, marcar como "paid"
        // el próximo recordatorio pendiente/queued y cualquier recordatorio "sent" del día
        // (para que el bot no lo reenvíe como impago).
        $query = Reminder::query()->where('client_id', $payment->client_id);
        if ($payment->contract_id) {
            $query->where('contract_id', $payment->contract_id);
        }

        // 1) Liquidar el recordatorio pendiente más cercano (si existe)
        $nextPending = (clone $query)
            ->whereIn('status', ['pending', 'queued'])
            ->orderBy('scheduled_for')
            ->first();

        if ($nextPending) {
            $nextPending->forceFill([
                'status' => 'paid',
                'acknowledged_at' => now(config('app.timezone')),
            ])->save();
        }

        // 2) Si hoy se envió un recordatorio y se verificó el pago el mismo día, marcarlo paid
        $todayStart = Carbon::today(config('app.timezone'))->startOfDay();
        $todayEnd = Carbon::today(config('app.timezone'))->endOfDay();
        (clone $query)
            ->where('status', 'sent')
            ->whereBetween('sent_at', [$todayStart, $todayEnd])
            ->update([
                'status' => 'paid',
                'acknowledged_at' => now(config('app.timezone')),
            ]);
    }

    public function index(Request $request): Response
    {
        $status = trim((string) $request->query('status', ''));
        $channel = trim((string) $request->query('channel', ''));
        $paidFrom = $this->parseDate($request->query('paid_from'));
        $paidTo = $this->parseDate($request->query('paid_to'));

        $query = Payment::query()
            ->with(['client:id,name', 'contract:id,name,amount,currency', 'reminder:id,status', 'conciliation:id,payment_id'])
            ->withCount('receipts');

        if ($status !== '') {
            $query->where('status', $status);
        }

        if ($channel !== '') {
            $query->where('channel', $channel);
        }

        if ($paidFrom) {
            $query->whereDate('paid_at', '>=', $paidFrom);
        }

        if ($paidTo) {
            $query->whereDate('paid_at', '<=', $paidTo);
        }

        $payments = $query
            ->orderByDesc('created_at')
            ->paginate(perPage: 15)
            ->withQueryString()
            ->through(fn (Payment $payment) => [
                'id' => $payment->id,
                'status' => $payment->status,
                'channel' => $payment->channel,
                'amount' => $payment->amount,
                'currency' => $payment->currency,
                'reference' => $payment->reference,
                'paid_at' => $payment->paid_at?->toDateString(),
                'receipts_count' => $payment->receipts_count,
                'client' => $payment->client?->only(['id', 'name']),
                'contract' => $payment->contract?->only(['id', 'name', 'amount', 'currency']),
                'reminder' => $payment->reminder?->only(['id', 'status']),
                'created_at' => $payment->created_at?->toIso8601String(),
                'has_conciliation' => $payment->conciliation !== null,
            ]);

        $statuses = Payment::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        $channels = Payment::query()
            ->select('channel')
            ->distinct()
            ->orderBy('channel')
            ->pluck('channel')
            ->filter()
            ->values();

        return Inertia::render('Payments/Index', [
            'payments' => $payments,
            'filters' => [
                'status' => $status !== '' ? $status : null,
                'channel' => $channel !== '' ? $channel : null,
                'paid_from' => $paidFrom?->toDateString(),
                'paid_to' => $paidTo?->toDateString(),
            ],
            'statuses' => $statuses,
            'channels' => $channels,
        ]);
    }

    private function parseDate(?string $value): ?Carbon
    {
        if (empty($value)) {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Show the form for creating a new payment.
     */
    public function create(): Response
    {
        $clients = \App\Models\Client::query()
            ->select('id', 'name', 'phone')
            ->orderBy('name')
            ->get();

        $channels = Payment::query()
            ->select('channel')
            ->distinct()
            ->orderBy('channel')
            ->pluck('channel')
            ->filter()
            ->values();

        return Inertia::render('Payments/Create', [
            'clients' => $clients,
            'channels' => $channels->isEmpty() ? ['sinpe', 'transferencia', 'efectivo', 'manual'] : $channels,
        ]);
    }

    /**
     * Store a newly created payment in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', 'string', 'in:CRC,USD'],
            'channel' => ['required', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:255'],
            'status' => ['required', 'string', 'in:unverified,verified,pending,rejected'],
            'paid_at' => ['nullable', 'date'],
            'grace_months' => ['nullable', 'integer', 'min:0', 'max:12'],
        ]);

        // Add metadata to track manual creation
        $validated['metadata'] = [
            'created_manually' => true,
            'created_by' => auth()->id(),
            'created_at' => now()->toIso8601String(),
            'grace_months' => (int) ($validated['grace_months'] ?? 0),
        ];

        // Set paid_at to now if not provided
        if (empty($validated['paid_at'])) {
            $validated['paid_at'] = now();
        }

        $payment = Payment::create($validated);
        
        // Load relationships
        $payment->load(['client', 'contract']);

        // Auto-create conciliation if payment is verified
        if ($validated['status'] === 'verified') {
            // Detener envíos/reenvíos: liquidar recordatorios relacionados
            $this->settleRemindersForVerifiedPayment($payment);

            $conciliation = \App\Models\Conciliation::create([
                'payment_id' => $payment->id,
                'contract_id' => $validated['contract_id'] ?? null,
                'amount' => $validated['amount'],
                'currency' => $validated['currency'],
                'status' => 'verified',
                'conciliated_at' => now(),
                'notes' => 'Conciliación automática - Pago manual verificado',
                'metadata' => [
                    'auto_conciliated' => true,
                    'conciliated_by' => auth()->id(),
                ],
            ]);

            // Generate and send PDF receipt via WhatsApp
            try {
                $pdfService = app(\App\Services\ConciliationPdfService::class);
                $whatsappService = app(\App\Services\WhatsAppNotificationService::class);
                
                // Calculate months covered (default to 1 for manual payments)
                $months = 1;
                if ($payment->contract_id) {
                    $contract = \App\Models\Contract::find($payment->contract_id);
                    if ($contract && $contract->amount > 0) {
                        $months = max(1, floor($payment->amount / $contract->amount));
                    }
                }
                
                // Add grace months if provided
                $graceMonths = (int) ($validated['grace_months'] ?? 0);
                $totalMonths = $months + $graceMonths;
                
                // Reschedule reminders if payment covers multiple months
                // Using the paid_at date from the payment as the base date
                $rescheduled = false;
                if ($totalMonths > 1 && $payment->contract_id) {
                    $paidAt = $payment->paid_at ? \Carbon\Carbon::parse($payment->paid_at) : now();
                    $this->rescheduleReminders($payment->contract_id, $totalMonths, $paidAt);
                    $rescheduled = true;
                }
                
                // Generate PDF
                $pdfPath = $pdfService->generateConciliationReceipt($payment, $months);
                
                // Generate WhatsApp message
                $message = $pdfService->generateWhatsAppMessage($months);
                
                // Send via WhatsApp (usar método específico para pagos manuales)
                $sent = $whatsappService->sendManualPaymentReceipt($payment, $pdfPath, $message);
                
                if ($sent) {
                    \Log::info('Recibo de pago manual enviado por WhatsApp', [
                        'payment_id' => $payment->id,
                        'conciliation_id' => $conciliation->id,
                        'months_paid' => $months,
                        'grace_months' => $graceMonths,
                        'total_months' => $totalMonths,
                        'reminders_rescheduled' => $rescheduled,
                    ]);
                }
            } catch (\Exception $e) {
                \Log::error('Error al generar/enviar recibo de pago manual', [
                    'payment_id' => $payment->id,
                    'error' => $e->getMessage(),
                ]);
                // No detenemos el proceso aunque falle el envío
                $rescheduled = false;
            }
        }

        // Build success message
        $successMessage = 'Pago creado correctamente.';
        if ($validated['status'] === 'verified') {
            $successMessage .= ' Recibo enviado por WhatsApp.';
            if (isset($rescheduled) && $rescheduled && isset($totalMonths)) {
                if ($graceMonths > 0) {
                    $successMessage .= " Recordatorios reprogramados por {$totalMonths} meses ({$months} pagados + {$graceMonths} de gracia).";
                } else {
                    $successMessage .= " Recordatorios reprogramados por {$totalMonths} meses.";
                }
            }
        }

        return redirect()
            ->route('payments.index')
            ->with('success', $successMessage);
    }

    /**
     * Get contracts for a specific client (used by frontend for payment conciliation)
     */
    public function getClientContracts(Request $request)
    {
        $clientId = $request->query('client_id');
        
        if (!$clientId) {
            return response()->json(['error' => 'client_id is required'], 400);
        }

        $contracts = \App\Models\Contract::where('client_id', $clientId)
            ->select('id', 'name', 'amount', 'currency')
            ->orderBy('name')
            ->get();

        return response()->json($contracts);
    }

    /**
     * Remove the specified payment.
     * Only allows deletion if payment is not conciliated.
     */
    public function destroy(Payment $payment)
    {
        // Check if payment has a conciliation
        if ($payment->conciliation()->exists()) {
            return back()->with('error', 'No se puede eliminar un pago que ya tiene una conciliación. Primero elimina la conciliación.');
        }

        // Delete associated receipts first
        $payment->receipts()->delete();

        // Delete the payment
        $payment->delete();

        return redirect()->route('payments.index')->with('success', 'Pago eliminado correctamente.');
    }

    /**
     * Reschedule pending reminders for a contract by adding months from a specific date
     *
     * @param int $contractId
     * @param int $monthsPaid
     * @param \Carbon\Carbon $paidAt The date from which to calculate the months
     * @return void
     */
    private function rescheduleReminders(int $contractId, int $monthsPaid, \Carbon\Carbon $paidAt): void
    {
        // Obtener recordatorios pendientes del contrato
        $reminders = Reminder::where('contract_id', $contractId)
            ->where('status', 'pending')
            ->get();

        foreach ($reminders as $reminder) {
            $currentScheduled = \Carbon\Carbon::parse($reminder->scheduled_for);
            
            // Si el recordatorio es anterior o igual a la fecha de pago:
            // - Si el cliente paga ANTES (o el mismo día) de la fecha del recordatorio actual,
            //   el próximo recordatorio debe caer en el siguiente ciclo (mesesPaid meses adelante).
            // - Si el cliente paga DESPUÉS de la fecha del recordatorio (atrasado), entonces sí
            //   movemos desde la fecha de pago.
            // Esto evita el bug común de “se fue al siguiente mes” cuando el pago manual
            // se registra antes de la fecha de cobro del mes corriente.
            if ($currentScheduled->lte($paidAt)) {
                if ($paidAt->toDateString() <= $currentScheduled->toDateString()) {
                    $newScheduled = $currentScheduled->copy()->addMonthsNoOverflow($monthsPaid);
                } else {
                    $newScheduled = $paidAt->copy()->addMonthsNoOverflow($monthsPaid);
                }
            } else {
                // Si el recordatorio ya está en el futuro, simplemente lo adelantamos
                $newScheduled = $currentScheduled->copy()->addMonthsNoOverflow($monthsPaid);
            }
            
            $reminder->update([
                'scheduled_for' => $newScheduled,
            ]);

            \Log::info('Recordatorio reprogramado por pago manual de múltiples meses', [
                'reminder_id' => $reminder->id,
                'contract_id' => $contractId,
                'months_paid' => $monthsPaid,
                'paid_at' => $paidAt->toDateString(),
                'old_date' => $currentScheduled->toDateString(),
                'new_date' => $newScheduled->toDateString(),
            ]);
        }

        // También actualizar el next_due_date del contrato basándose en la fecha de pago
        $contract = Contract::find($contractId);
        if ($contract) {
            // Mantener coherencia con reprogramación: si el pago se registra antes de que venza el mes,
            // avanzar desde el vencimiento actual; si fue después (atrasado), avanzar desde paidAt.
            // addMonthsNoOverflow evita saltos a meses siguientes por días inexistentes.
            $base = $contract->next_due_date
                ? \Carbon\Carbon::parse($contract->next_due_date, config('app.timezone'))
                : $paidAt;

            $newDueDate = ($paidAt->toDateString() <= $base->toDateString())
                ? $base->copy()->addMonthsNoOverflow($monthsPaid)
                : $paidAt->copy()->addMonthsNoOverflow($monthsPaid);
            $contract->update(['next_due_date' => $newDueDate]);
            
            \Log::info('Contrato actualizado con nueva fecha de vencimiento por pago manual', [
                'contract_id' => $contractId,
                'months_paid' => $monthsPaid,
                'paid_at' => $paidAt->toDateString(),
                'new_due_date' => $newDueDate->toDateString(),
            ]);
        }
    }

}
