<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class PaymentController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Payment::query()
            ->with(['client', 'contract', 'reminder', 'conciliation'])
            ->withCount('receipts');

        if ($request->filled('status')) {
            $statuses = collect($request->input('status'))
                ->flatten()
                ->map(fn ($value) => trim((string) $value))
                ->filter()
                ->all();

            if ($statuses) {
                $query->whereIn('status', $statuses);
            }
        }

        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        if ($request->filled('contract_id')) {
            $query->where('contract_id', $request->integer('contract_id'));
        }

        if ($request->filled('paid_from')) {
            $query->whereDate('paid_at', '>=', $request->date('paid_from'));
        }

        if ($request->filled('paid_to')) {
            $query->whereDate('paid_at', '<=', $request->date('paid_to'));
        }

        if ($reference = $request->string('reference')->trim()->toString()) {
            $query->where('reference', 'like', "%{$reference}%");
        }

        $payments = $query
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15))
            ->appends($request->query());

        return response()->json($payments);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'client_id' => ['required', 'exists:clients,id'],
            'contract_id' => ['nullable', 'exists:contracts,id'],
            'reminder_id' => ['nullable', 'exists:reminders,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency' => ['required', 'string', 'size:3'],
            'status' => ['nullable', 'string', 'max:50'],
            'channel' => ['required', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:100'],
            'paid_at' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        $contract = null;

        if (! empty($data['contract_id'])) {
            $contract = Contract::query()->find($data['contract_id']);

            if ($contract && (int) $contract->client_id !== (int) $data['client_id']) {
                throw ValidationException::withMessages([
                    'contract_id' => 'El contrato seleccionado no pertenece al cliente indicado.',
                ]);
            }
        }

        $reminder = null;

        if (! empty($data['reminder_id'])) {
            $reminder = Reminder::query()->find($data['reminder_id']);

            if ($reminder && (int) $reminder->client_id !== (int) $data['client_id']) {
                throw ValidationException::withMessages([
                    'reminder_id' => 'El recordatorio seleccionado no corresponde al cliente indicado.',
                ]);
            }
        }

        $contractId = $data['contract_id'] ?? $reminder?->contract_id;

        if ($reminder && $contract && (int) $reminder->contract_id !== (int) $contract->id) {
            throw ValidationException::withMessages([
                'reminder_id' => 'El recordatorio no pertenece al contrato seleccionado.',
            ]);
        }

        if ($contractId && ! $contract) {
            $contract = Contract::query()->find($contractId);

            if ($contract && (int) $contract->client_id !== (int) $data['client_id']) {
                throw ValidationException::withMessages([
                    'contract_id' => 'El contrato detectado no pertenece al cliente indicado.',
                ]);
            }
        }

        $payment = Payment::create([
            'client_id' => $data['client_id'],
            'contract_id' => $contractId,
            'reminder_id' => $data['reminder_id'] ?? null,
            'amount' => $data['amount'],
            'currency' => $data['currency'],
            'status' => $data['status'] ?? 'unverified',
            'channel' => $data['channel'],
            'reference' => $data['reference'] ?? null,
            'paid_at' => $data['paid_at'] ?? null,
            'metadata' => $data['metadata'] ?? [],
        ]);

        return response()->json($payment->load(['client', 'contract']), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Payment $payment): JsonResponse
    {
        return response()->json(
            $payment->load(['client', 'contract', 'reminder', 'receipts', 'conciliation'])
        );
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Payment $payment): JsonResponse
    {
        $data = $request->validate([
            'contract_id' => ['nullable', 'exists:contracts,id'],
            'reminder_id' => ['nullable', 'exists:reminders,id'],
            'amount' => ['sometimes', 'required', 'numeric', 'min:0'],
            'currency' => ['sometimes', 'required', 'string', 'size:3'],
            'channel' => ['sometimes', 'required', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:100'],
            'paid_at' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        $targetContractId = $data['contract_id'] ?? $payment->contract_id;

        if ($targetContractId) {
            $contract = Contract::query()->find($targetContractId);

            if ($contract && (int) $contract->client_id !== (int) $payment->client_id) {
                throw ValidationException::withMessages([
                    'contract_id' => 'El contrato seleccionado no pertenece al cliente del pago.',
                ]);
            }
        }

        $targetReminderId = $data['reminder_id'] ?? $payment->reminder_id;

        if ($targetReminderId) {
            $reminder = Reminder::query()->find($targetReminderId);

            if ($reminder && (int) $reminder->client_id !== (int) $payment->client_id) {
                throw ValidationException::withMessages([
                    'reminder_id' => 'El recordatorio seleccionado no corresponde al cliente del pago.',
                ]);
            }

            $expectedContractId = $targetContractId ?? $payment->contract_id;

            if ($reminder && $expectedContractId && (int) $reminder->contract_id !== (int) $expectedContractId) {
                throw ValidationException::withMessages([
                    'reminder_id' => 'El recordatorio no pertenece al contrato asociado.',
                ]);
            }
        }

        $payment->fill($data);

        if (array_key_exists('metadata', $data)) {
            $payment->metadata = array_merge($payment->metadata ?? [], $data['metadata'] ?? []);
        }

        $payment->save();

        return response()->json($payment->fresh());
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Payment $payment): JsonResponse
    {
        $payment->delete();

        return response()->json(status: 204);
    }

    public function updateStatus(Request $request, Payment $payment): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', 'max:50'],
            'paid_at' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        $payment->forceFill([
            'status' => $data['status'],
            'paid_at' => $data['paid_at'] ?? $payment->paid_at,
            'metadata' => array_merge($payment->metadata ?? [], $data['metadata'] ?? []),
        ])->save();

        return response()->json($payment->fresh());
    }

    public function attachReceipt(Request $request, Payment $payment): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf', 'max:5120'],
            'received_at' => ['nullable', 'date'],
            'metadata' => ['nullable', 'array'],
        ]);

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $data['file'];

        $path = $file->store('payment-receipts');

        $receipt = $payment->receipts()->create([
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getClientMimeType() ?? 'application/pdf',
            'received_at' => $data['received_at'] ?? now(),
            'metadata' => $data['metadata'] ?? [],
        ]);

        return response()->json($receipt, 201);
    }
}
