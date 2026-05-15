<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Conciliation;
use App\Services\ConciliationPdfService;
use App\Services\PaymentSettlementService;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Http\RedirectResponse;

class ConciliationController extends Controller
{
    public function index(Request $request): Response
    {
        $status = trim((string) $request->query('status', ''));

        $query = Conciliation::query()
            ->with([
                'payment.client:id,name',
                'payment.contract:id,name',
                'payment' => fn ($paymentQuery) => $paymentQuery->withCount('receipts'),
                'reviewer:id,name',
            ]);

        if ($status !== '') {
            $query->where('status', $status);
        }

        $conciliations = $query
            ->orderByDesc('updated_at')
            ->paginate(perPage: 15)
            ->withQueryString()
            ->through(fn (Conciliation $conciliation) => [
                'id' => $conciliation->id,
                'status' => $conciliation->status,
                'notes' => $conciliation->notes,
                'verified_at' => $conciliation->verified_at?->toIso8601String(),
                'updated_at' => $conciliation->updated_at?->toIso8601String(),
                'payment' => [
                    'id' => $conciliation->payment?->id,
                    'amount' => $conciliation->payment?->amount,
                    'currency' => $conciliation->payment?->currency,
                    'status' => $conciliation->payment?->status,
                    'reference' => $conciliation->payment?->reference,
                    'receipts_count' => $conciliation->payment?->receipts_count,
                    'client' => $conciliation->payment?->client?->only(['id', 'name']),
                    'contract' => $conciliation->payment?->contract?->only(['id', 'name']),
                ],
                'reviewer' => $conciliation->reviewer?->only(['id', 'name']),
            ]);

        $statuses = Conciliation::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        return Inertia::render('Conciliations/Index', [
            'conciliations' => $conciliations,
            'filters' => [
                'status' => $status !== '' ? $status : null,
            ],
            'statuses' => $statuses,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        // DEBUG: registrar incoming payload y usuario para ayudar a depurar problemas desde la UI
        try {
            Log::info('conciliation.store.web.incoming', [
                'payload' => $request->all(),
                'user_id' => Auth::id(),
                'ip' => $request->ip(),
            ]);
        } catch (\Throwable $e) {
            // no bloquear la operación si logging falla
        }

        $data = $request->validate([
            'payment_id' => ['required', 'exists:payments,id'],
            'status' => ['nullable', 'in:pending,in_review,approved,rejected'],
            'notes' => ['nullable', 'string'],
            'verified_at' => ['nullable', 'date'],
            'contract_id' => ['nullable', 'exists:contracts,id'],
            'months' => ['nullable', 'integer', 'min:1'],
            'calculated_amount' => ['nullable', 'numeric', 'min:0'],
            'billing_month' => ['nullable', 'date_format:Y-m'],
        ]);

        $existing = Conciliation::query()->where('payment_id', $data['payment_id'])->first();

        if ($existing) {
            return back()->withErrors([
                'payment_id' => 'La conciliación para este pago ya existe.',
            ]);
        }

        $conciliation = Conciliation::create([
            ...$data,
            'status' => $data['status'] ?? 'pending',
            'reviewed_by' => Auth::id(),
            'verified_at' => $data['verified_at'] ?? null,
        ]);

        $paymentStatus = match ($conciliation->status) {
            'approved' => 'verified',
            'rejected' => 'rejected',
            'in_review' => 'in_review',
            default => 'in_review',
        };

        $payment = $conciliation->payment;
        $payment?->update(['status' => $paymentStatus]);

        // Actualizar el metadata del pago con los meses y contrato si se proporcionaron
        if ($payment && isset($data['months'])) {
            $metadata = $payment->metadata ?? [];
            $metadata['months'] = (int) $data['months'];
            
            if (isset($data['contract_id'])) {
                $metadata['conciliation_contract_id'] = $data['contract_id'];
            }
            
            if (isset($data['calculated_amount'])) {
                $metadata['calculated_amount'] = $data['calculated_amount'];
            }

            // Guardar el período pagado solo para contratos mensuales.
            if (isset($data['contract_id'])) {
                $contract = \App\Models\Contract::query()->find($data['contract_id']);
                if ($contract && $contract->billing_cycle === 'monthly') {
                    $metadata['paid_for_month'] = $data['billing_month']
                        ?? \Carbon\Carbon::parse($payment->paid_at ?? now(), config('app.timezone'))->format('Y-m');
                }
            }
            
            $payment->metadata = $metadata;
            $payment->save();
        }

        // Si la conciliación fue aprobada, ajustar monto (si falta), generar y enviar el PDF
        if ($conciliation->status === 'approved' && $payment) {
            try {
                // Recargar el pago con todas las relaciones necesarias
                $payment->load(['client', 'contract']);
                
                $pdfService = new ConciliationPdfService();
                $whatsappService = new WhatsAppNotificationService();

                // Calcular los meses del pago
                $months = $pdfService->calculateMonthsFromPayment($payment);

                // Si el pago aún está en 0, intentar calcularlo con base en el contrato y los meses
                if ((float) ($payment->amount ?? 0) <= 0) {
                    $calculated = null;
                    if ($payment->contract && (float) $payment->contract->amount > 0) {
                        $calculated = (float) $payment->contract->amount * max(1, (int) $months);
                    } elseif (is_array($payment->metadata ?? null) && isset($payment->metadata['calculated_amount'])) {
                        $calculated = (float) $payment->metadata['calculated_amount'];
                    }

                    if ($calculated !== null && $calculated > 0) {
                        $before = $payment->amount;
                        $payment->forceFill(['amount' => $calculated])->save();
                        try {
                            Log::info('Conciliation: monto de pago ajustado automáticamente', [
                                'payment_id' => $payment->id,
                                'before' => $before,
                                'after' => $calculated,
                                'months' => $months,
                            ]);
                        } catch (\Throwable $e) {
                            // ignore logging failure
                        }
                    }
                }

                // Recordatorios y next_due_date: PaymentSettlementService al final del store (pago verified).

                // Generar el PDF
                $pdfPath = $pdfService->generateConciliationReceipt($payment, $months);
                
                Log::info('PDF generado en', ['path' => $pdfPath, 'exists' => file_exists($pdfPath)]);

                // Generar el mensaje personalizado
                $message = $pdfService->generateWhatsAppMessage($payment, $months);

                // Enviar el PDF y el mensaje por WhatsApp
                $sent = $whatsappService->sendConciliationReceipt($payment, $pdfPath, $message);

                if ($sent) {
                    Log::info('PDF de conciliación enviado exitosamente', [
                        'payment_id' => $payment->id,
                        'conciliation_id' => $conciliation->id,
                        'months' => $months,
                    ]);
                } else {
                    Log::warning('No se pudo enviar el PDF de conciliación', [
                        'payment_id' => $payment->id,
                        'conciliation_id' => $conciliation->id,
                    ]);
                }
            } catch (\Exception $e) {
                Log::error('Error al generar/enviar PDF de conciliación', [
                    'payment_id' => $payment->id,
                    'conciliation_id' => $conciliation->id,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ]);
                // No fallar la conciliación si falla el envío del PDF
            }
        }

        $paymentSettle = $payment ? $payment->fresh(['contract']) : null;
        if ($paymentSettle && $paymentSettle->status === 'verified') {
            app(PaymentSettlementService::class)->settleVerifiedPayment($paymentSettle);
        }

        return redirect()->route('payments.index')->with('success', 'Conciliación creada exitosamente.');
    }

    public function update(Request $request, Conciliation $conciliation): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:pending,in_review,approved,rejected'],
            'verified_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $previousConciliationStatus = $conciliation->status;

        $conciliation->update($data);

        // Update payment status based on conciliation status
        $paymentStatus = match ($data['status']) {
            'approved' => 'verified',
            'rejected' => 'rejected',
            'in_review' => 'in_review',
            default => 'in_review',
        };

        $payment = $conciliation->payment;
        $payment?->update(['status' => $paymentStatus]);

        // If approved, generate PDF and send notification
        if ($data['status'] === 'approved' && $payment) {
            try {
                $payment->load(['client', 'contract']);
                
                $pdfService = new ConciliationPdfService();
                $whatsappService = new WhatsAppNotificationService();

                $months = $pdfService->calculateMonthsFromPayment($payment);

                // If payment amount is 0, try to calculate it
                if ((float) ($payment->amount ?? 0) <= 0) {
                    $calculated = null;
                    if ($payment->contract && (float) $payment->contract->amount > 0) {
                        $calculated = (float) $payment->contract->amount * max(1, (int) $months);
                    } elseif (is_array($payment->metadata ?? null) && isset($payment->metadata['calculated_amount'])) {
                        $calculated = (float) $payment->metadata['calculated_amount'];
                    }

                    if ($calculated !== null && $calculated > 0) {
                        $before = $payment->amount;
                        $payment->forceFill(['amount' => $calculated])->save();
                    }
                }

                // Generate PDF
                $pdfPath = $pdfService->generateConciliationReceipt($payment, $months);
                
                // Generate message
                $message = $pdfService->generateWhatsAppMessage($payment, $months);

                // Send PDF and message via WhatsApp
                $sent = $whatsappService->sendConciliationReceipt($payment, $pdfPath, $message);

                if ($sent) {
                    Log::info('PDF de conciliación enviado exitosamente', [
                        'payment_id' => $payment->id,
                        'conciliation_id' => $conciliation->id,
                        'months' => $months,
                    ]);
                }
            } catch (\Exception $e) {
                Log::error('Error al generar/enviar PDF de conciliación', [
                    'payment_id' => $payment->id,
                    'conciliation_id' => $conciliation->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $paymentSettle = $payment ? $payment->fresh(['contract']) : null;
        $justApproved = $data['status'] === 'approved' && $previousConciliationStatus !== 'approved';
        if ($justApproved && $paymentSettle && $paymentSettle->status === 'verified') {
            app(PaymentSettlementService::class)->settleVerifiedPayment($paymentSettle);
        }

        return redirect()->route('conciliations.index')->with('success', 'Conciliación actualizada exitosamente.');
    }
}
