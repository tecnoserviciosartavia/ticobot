<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Conciliation;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\SinpeEmailTransaction;
use App\Models\Setting;
use App\Services\ConciliationPdfService;
use App\Services\SinpeBcrEmailParser;
use App\Services\SinpeBcrEmailConciliationService;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class SinpeEmailController extends Controller
{
    public function __construct(private readonly SinpeBcrEmailParser $parser)
    {
    }

    public function index(Request $request): Response
    {
        $status = trim((string) $request->query('status', ''));
        $read = trim((string) $request->query('read', ''));

        $query = SinpeEmailTransaction::query()
            ->with([
                'client:id,name',
                'contract:id,name',
                'payment:id,status',
            ]);

        if ($status !== '') {
            $query->where('status', $status);
        }

        if ($read === 'read') {
            $query->where('is_read', true);
        }

        if ($read === 'unread') {
            $query->where('is_read', false);
        }

        $transactions = $query
            ->orderBy('is_read')
            ->orderByDesc('performed_at')
            ->paginate(perPage: 20)
            ->withQueryString()
            ->through(fn (SinpeEmailTransaction $t) => [
                'id'           => $t->id,
                'reference'    => $t->reference,
                'origin_phone' => $t->origin_phone,
                'origin_name'  => $t->origin_name,
                'motive'       => $t->motive,
                'amount'       => $t->amount,
                'performed_at' => $t->performed_at?->toIso8601String(),
                'mail_subject' => $t->mail_subject,
                'is_read'      => (bool) $t->is_read,
                'status'       => $t->status,
                'notes'        => $t->notes,
                'client'       => $t->client?->only(['id', 'name']),
                'contract'     => $t->contract?->only(['id', 'name']),
                'payment'      => $t->payment ? ['id' => $t->payment->id, 'status' => $t->payment->status] : null,
            ]);

        $statuses = SinpeEmailTransaction::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        $clients = Client::query()
            ->select('id', 'name')
            ->whereNull('deleted_at')
            ->orderBy('name')
            ->get();

        return Inertia::render('SinpeEmails/Index', [
            'transactions' => $transactions,
            'filters'      => [
                'status' => $status !== '' ? $status : null,
                'read' => $read !== '' ? $read : null,
            ],
            'statuses'     => $statuses,
            'clients'      => $clients,
        ]);
    }

    public function sync(SinpeBcrEmailConciliationService $service): RedirectResponse
    {
        $service->syncMailbox();

        return redirect()->back();
    }

    public function clientContracts(Request $request): JsonResponse
    {
        $clientId = (int) $request->query('client_id', 0);
        if ($clientId <= 0) {
            return response()->json([]);
        }

        $contracts = Contract::query()
            ->select('id', 'name', 'amount', 'currency', 'billing_cycle')
            ->where('client_id', $clientId)
            ->whereNull('deleted_at')
            ->orderBy('name')
            ->get();

        return response()->json($contracts);
    }

    public function markRead(int $id): RedirectResponse
    {
        $transaction = SinpeEmailTransaction::query()->findOrFail($id);

        if (! $transaction->is_read) {
            $transaction->forceFill([
                'is_read' => true,
            ])->save();
        }

        return redirect()->back();
    }

    public function destroy(int $id): RedirectResponse
    {
        $transaction = SinpeEmailTransaction::query()->findOrFail($id);

        if (! $this->deleteMailboxMessage($transaction)) {
            return redirect()->back()->with('error', 'No se pudo eliminar el correo del buzón IMAP. El registro local no fue eliminado.');
        }

        $transaction->delete();

        return redirect()->back();
    }

    public function breakConciliation(int $id): RedirectResponse
    {
        $transaction = SinpeEmailTransaction::query()
            ->with(['payment'])
            ->findOrFail($id);

        DB::transaction(function () use ($transaction) {
            $payment = $transaction->payment;

            if ($payment) {
                $payment->forceFill([
                    'status' => 'in_review',
                ])->save();

                Conciliation::query()->updateOrCreate(
                    ['payment_id' => $payment->id],
                    [
                        'status' => 'in_review',
                        'notes' => 'Conciliación rota desde la interfaz de correos. Pendiente de verificar.',
                        'verified_at' => null,
                    ]
                );
            }

            $transaction->forceFill([
                'status' => 'in_review',
                'notes' => 'Conciliación rota, pendiente de verificar.',
            ])->save();

            Log::info('sinpe_email.break_conciliation', [
                'transaction_id' => $transaction->id,
                'payment_id' => $payment?->id,
            ]);
        });

        return redirect()->back()->with('success', 'La conciliación se rompió y quedó pendiente de verificación.');
    }

    public function conciliate(Request $request, int $id): RedirectResponse
    {
        $validated = $request->validate([
            'client_id'   => ['required', 'integer', 'exists:clients,id'],
            'contract_id' => ['required', 'integer', 'exists:contracts,id'],
            'update_client_name' => ['nullable', 'boolean'],
            'billing_month' => ['nullable', 'date_format:Y-m'],
        ]);

        $transaction = SinpeEmailTransaction::query()->findOrFail($id);

        if (in_array($transaction->status, ['approved', 'conciliated'], true)) {
            return redirect()->back()->with('error', 'Esta transacción ya fue conciliada.');
        }

        DB::transaction(function () use ($transaction, $validated) {
            $clientId   = (int) $validated['client_id'];
            $contractId = (int) $validated['contract_id'];
            $amount     = (float) $transaction->amount;
            $reference  = $transaction->reference;
            $performedAt = $transaction->performed_at ?? now();

            // Actualizar nombre del cliente solo si el usuario lo marcó
            if ((bool) ($validated['update_client_name'] ?? false) && ! empty($transaction->origin_name)) {
                $client = Client::query()->find($clientId);
                if ($client && trim($transaction->origin_name) !== trim((string) $client->name)) {
                    $oldName = $client->name;
                    $client->forceFill([
                        'name' => trim($transaction->origin_name),
                    ])->save();

                    Log::info('sinpe_email.client_name_updated', [
                        'client_id' => $clientId,
                        'old_name' => $oldName,
                        'new_name' => $transaction->origin_name,
                        'transaction_id' => $transaction->id,
                        'reference' => $reference,
                    ]);
                }
            }

            // Buscar pago existente por referencia para evitar duplicados.
            $payment = Payment::query()
                ->where('reference', $reference)
                ->where('client_id', $clientId)
                ->first();

            if (! $payment) {
                // Buscar pago abierto del cliente/contrato sin referencia con el mismo monto.
                $payment = Payment::query()
                    ->where('client_id', $clientId)
                    ->where('contract_id', $contractId)
                    ->whereIn('status', ['unverified', 'pending', 'in_review'])
                    ->whereNull('reference')
                    ->where('amount', $amount)
                    ->orderByDesc('created_at')
                    ->first();
            }

            $metadata = [];
            if ($payment) {
                $metadata = is_array($payment->metadata) ? $payment->metadata : [];
            }
            $metadata['sinpe_email_transaction_id'] = $transaction->id;
            $metadata['sinpe_email_reference']      = $reference;
            $metadata['sinpe_email_origin_name']    = $transaction->origin_name;
            $metadata['sinpe_email_origin_phone']   = $transaction->origin_phone;
            $metadata['sinpe_email_motive']         = $transaction->motive;
            $metadata['sinpe_email_conciliated_manually'] = true;

            $billingMonth = $validated['billing_month'] ?? null;
            if (is_string($billingMonth) && preg_match('/^\d{4}-\d{2}$/', $billingMonth) === 1) {
                $metadata['paid_for_month'] = $billingMonth;
                $metadata['months'] = max(1, (int) ($metadata['months'] ?? 1));
            }

            if ($payment) {
                $payment->forceFill([
                    'status'      => 'verified',
                    'channel'     => 'sinpe',
                    'reference'   => $reference ?: $payment->reference,
                    'paid_at'     => $payment->paid_at ?: $performedAt,
                    'metadata'    => $metadata,
                    'contract_id' => $payment->contract_id ?: $contractId,
                ])->save();
            } else {
                $payment = Payment::query()->create([
                    'client_id'   => $clientId,
                    'contract_id' => $contractId,
                    'amount'      => $amount,
                    'currency'    => 'CRC',
                    'status'      => 'verified',
                    'channel'     => 'sinpe',
                    'reference'   => $reference,
                    'paid_at'     => $performedAt,
                    'metadata'    => $metadata,
                ]);
            }

            Conciliation::query()->updateOrCreate(
                ['payment_id' => $payment->id],
                [
                    'status'      => 'approved',
                    'notes'       => 'Conciliado manualmente desde correo SINPE BCR.',
                    'verified_at' => now(),
                ]
            );

            $transaction->forceFill([
                'status'              => 'approved',
                'matched_client_id'   => $clientId,
                'matched_contract_id' => $contractId,
                'payment_id'          => $payment->id,
                'notes'               => 'Conciliado manualmente desde la interfaz.',
            ])->save();

            Log::info('sinpe_email.manual_conciliation', [
                'transaction_id' => $transaction->id,
                'payment_id'     => $payment->id,
                'client_id'      => $clientId,
                'contract_id'    => $contractId,
            ]);
        });

        try {
            $paymentForDelivery = Payment::query()
                ->with(['client', 'contract'])
                ->find($transaction->payment_id);

            if ($paymentForDelivery) {
                $pdfService = app(ConciliationPdfService::class);
                $whatsappService = app(WhatsAppNotificationService::class);

                $months = $pdfService->calculateMonthsFromPayment($paymentForDelivery);
                $pdfPath = $pdfService->generateConciliationReceipt($paymentForDelivery, $months);
                $message = $pdfService->generateWhatsAppMessage($months);

                $sent = $whatsappService->sendConciliationReceipt($paymentForDelivery, $pdfPath, $message);

                if (! $sent && $paymentForDelivery->client?->phone) {
                    $fallbackMessage = 'Tu pago SINPE fue conciliado correctamente. ¡Gracias!';
                    $whatsappService->sendTextMessage($paymentForDelivery->client->phone, $fallbackMessage);
                }

                Log::info('sinpe_email.manual_conciliation.delivery', [
                    'transaction_id' => $transaction->id,
                    'payment_id' => $paymentForDelivery->id,
                    'months' => $months,
                    'pdf_sent' => $sent,
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('sinpe_email.manual_conciliation.notify_failed', [
                'transaction_id' => $transaction->id,
                'client_id' => $validated['client_id'],
                'error' => $e->getMessage(),
            ]);
        }

        return redirect()->back()->with('success', 'Transacción conciliada correctamente.');
    }

    private function deleteMailboxMessage(SinpeEmailTransaction $transaction): bool
    {
        if (! function_exists('imap_open')) {
            Log::warning('sinpe_email.destroy.imap_missing_extension', [
                'transaction_id' => $transaction->id,
            ]);

            return false;
        }

        $config = $this->loadImapConfig();
        if (! $config['valid']) {
            Log::warning('sinpe_email.destroy.invalid_imap_config', [
                'transaction_id' => $transaction->id,
            ]);

            return false;
        }

        $mailbox = $this->openMailboxImap($config['imap']);
        if (! $mailbox) {
            return false;
        }

        try {
            $messageUid = trim((string) $transaction->message_uid);
            $deleted = false;

            if ($messageUid !== '' && ctype_digit($messageUid)) {
                $uidMessageNumber = (int) @imap_msgno($mailbox, (int) $messageUid);
                if ($uidMessageNumber > 0 && $this->messageMatchesTransaction($mailbox, $uidMessageNumber, $transaction)) {
                    $deleted = (bool) @imap_delete($mailbox, $messageUid, FT_UID);
                }

                if (! $deleted) {
                    $sequenceNumber = (int) $messageUid;
                    if ($sequenceNumber > 0 && $this->messageMatchesTransaction($mailbox, $sequenceNumber, $transaction)) {
                        // Compatibilidad con registros viejos donde se guardó el número secuencial y no el UID real.
                        $deleted = (bool) @imap_delete($mailbox, $messageUid);
                    }
                }
            }

            if (! $deleted && $transaction->reference) {
                $deleted = $this->deleteMailboxMessageByReference($mailbox, $transaction);
            }

            if (! $deleted) {
                Log::warning('sinpe_email.destroy.mailbox_delete_failed', [
                    'transaction_id' => $transaction->id,
                    'message_uid' => $transaction->message_uid,
                    'reference' => $transaction->reference,
                    'errors' => imap_errors(),
                ]);

                return false;
            }

            @imap_expunge($mailbox);

            return true;
        } finally {
            @imap_close($mailbox);
        }
    }

    /**
     * @return array<string,mixed>
     */
    private function loadImapConfig(): array
    {
        $host = trim((string) Setting::get('sinpe_imap_host', 'imap.dreamhost.com'));
        $port = (int) Setting::get('sinpe_imap_port', 993);
        $encryption = trim((string) Setting::get('sinpe_imap_encryption', 'ssl'));
        $folder = trim((string) Setting::get('sinpe_imap_folder', 'BCR'));
        $username = trim((string) Setting::get('sinpe_imap_username', ''));
        $password = (string) Setting::get('sinpe_imap_password', '');

        return [
            'imap' => [
                'host' => $host,
                'port' => $port,
                'encryption' => in_array($encryption, ['ssl', 'tls', 'none'], true) ? $encryption : 'ssl',
                'folder' => $folder,
                'username' => $username,
                'password' => $password,
                'valid' => $host !== '' && $port > 0 && $folder !== '' && $username !== '' && $password !== '',
            ],
            'valid' => $host !== '' && $port > 0 && $folder !== '' && $username !== '' && $password !== '',
        ];
    }

    /**
     * @param array<string,mixed> $config
     */
    private function openMailboxImap(array $config)
    {
        $flags = '/imap';
        if ($config['encryption'] === 'ssl') {
            $flags .= '/ssl';
        } elseif ($config['encryption'] === 'tls') {
            $flags .= '/tls';
        } else {
            $flags .= '/notls';
        }
        $flags .= '/novalidate-cert';

        $folder = ltrim((string) $config['folder']);
        $mailboxPath = sprintf('{%s:%d%s}%s', $config['host'], $config['port'], $flags, $folder);

        $imap = @imap_open($mailboxPath, (string) $config['username'], (string) $config['password']);
        if (! $imap) {
            Log::error('sinpe_email.destroy.mailbox_open_failed', [
                'mailbox' => $mailboxPath,
                'errors' => imap_errors(),
            ]);
        }

        return $imap;
    }

    private function deleteMailboxMessageByReference($mailbox, SinpeEmailTransaction $transaction): bool
    {
        $messageNumbers = @imap_search($mailbox, 'ALL') ?: [];

        foreach (array_reverse($messageNumbers) as $messageNumber) {
            if ($this->messageMatchesTransaction($mailbox, (int) $messageNumber, $transaction)) {
                return (bool) @imap_delete($mailbox, (string) $messageNumber);
            }
        }

        return false;
    }

    private function messageMatchesTransaction($mailbox, int $messageNumber, SinpeEmailTransaction $transaction): bool
    {
        if ($messageNumber <= 0) {
            return false;
        }

        $body = $this->fetchBodyImap($mailbox, $messageNumber);
        if ($body === '') {
            return false;
        }

        $parsed = $this->parser->parse($body);
        if (is_array($parsed) && (string) ($parsed['reference'] ?? '') === (string) $transaction->reference) {
            return true;
        }

        $normalizedBody = preg_replace('/\D+/', '', $body) ?? $body;
        $normalizedReference = preg_replace('/\D+/', '', (string) $transaction->reference) ?? (string) $transaction->reference;

        return $normalizedReference !== '' && str_contains($normalizedBody, $normalizedReference);
    }

    private function fetchBodyImap($mailbox, int $msgNo): string
    {
        $structure = @imap_fetchstructure($mailbox, $msgNo);
        if (! $structure) {
            return (string) @imap_body($mailbox, $msgNo);
        }

        if (! empty($structure->parts) && is_array($structure->parts)) {
            foreach ($structure->parts as $index => $part) {
                $partNumber = (string) ($index + 1);
                $raw = (string) @imap_fetchbody($mailbox, $msgNo, $partNumber);
                if ($raw === '') {
                    continue;
                }

                $decoded = $this->decodePart($raw, (int) ($part->encoding ?? 0));
                if ((int) ($part->type ?? 0) === 0 || (int) ($part->type ?? 0) === 1) {
                    return $decoded;
                }
            }
        }

        return (string) @imap_body($mailbox, $msgNo);
    }

    private function decodePart(string $raw, int $encoding): string
    {
        return match ($encoding) {
            3 => base64_decode($raw, true) ?: $raw,
            4 => quoted_printable_decode($raw),
            default => $raw,
        };
    }
}
