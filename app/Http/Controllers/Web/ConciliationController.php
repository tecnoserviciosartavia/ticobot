<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Conciliation;
use App\Services\ConciliationPdfService;
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
            
            $payment->metadata = $metadata;
            $payment->save();
        }

        // Si la conciliación fue aprobada, generar y enviar el PDF
        if ($conciliation->status === 'approved' && $payment) {
            try {
                // Recargar el pago con todas las relaciones necesarias
                $payment->load(['client', 'contract']);
                
                $pdfService = new ConciliationPdfService();
                $whatsappService = new WhatsAppNotificationService();

                // Calcular los meses del pago
                $months = $pdfService->calculateMonthsFromPayment($payment);

                // Generar el PDF
                $pdfPath = $pdfService->generateConciliationReceipt($payment, $months);
                
                Log::info('PDF generado en', ['path' => $pdfPath, 'exists' => file_exists($pdfPath)]);

                // Generar el mensaje personalizado
                $message = $pdfService->generateWhatsAppMessage($months);

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

        return redirect()->route('payments.index')->with('success', 'Conciliación creada exitosamente.');
    }
}
