<?php

namespace App\Services;

use App\Models\Client;
use App\Models\Conciliation;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SinpeBcrEmailConciliationService
{
    public function __construct(private readonly SinpeBcrEmailParser $parser)
    {
    }

    /**
     * @return array<string,int>
     */
    public function run(): array
    {
        return $this->scanMailbox('UNSEEN', true);
    }

    /**
     * @return array<string,int>
     */
    public function syncMailbox(): array
    {
        return $this->scanMailbox('ALL', false);
    }

    /**
     * @return array<string,int>
     */
    private function scanMailbox(string $criteria, bool $markSeen): array
    {
        $stats = [
            'checked' => 0,
            'parsed' => 0,
            'conciliated' => 0,
            'skipped' => 0,
            'errors' => 0,
        ];

        if (! $this->isEnabled()) {
            return $stats;
        }

        if (! function_exists('imap_open')) {
            Log::warning('SINPE IMAP: extensión IMAP no disponible en PHP');
            $stats['errors']++;
            return $stats;
        }

        $config = $this->loadConfig();
        if (! $config['valid']) {
            Log::warning('SINPE IMAP: configuración incompleta, no se ejecuta conciliación automática');
            $stats['errors']++;
            return $stats;
        }

        $mailbox = $this->openMailboxImap($config['imap']);
        if (! $mailbox) {
            $stats['errors']++;
            return $stats;
        }

        try {
            $emails = imap_search($mailbox, $criteria) ?: [];
            foreach ($emails as $msgNo) {
                $stats['checked']++;
                $messageUid = (string) (@imap_uid($mailbox, (int) $msgNo) ?: $msgNo);
                $overview = $this->fetchOverviewImap($mailbox, (int) $msgNo);
                $mailSubject = $overview['subject'] ?? null;
                $isRead = (bool) ($overview['is_read'] ?? false);

                try {
                    $body = $this->fetchBodyImap($mailbox, (int) $msgNo, ! $markSeen);
                    $parsed = $this->parser->parse($body);

                    if (! $parsed) {
                        $stats['skipped']++;
                        if ($markSeen) {
                            $this->markSeenImap($mailbox, $msgNo);
                        }
                        continue;
                    }

                    $stats['parsed']++;

                    $result = $this->processParsedMessage($parsed, $messageUid, $mailSubject, $isRead);
                    if ($result) {
                        $stats['conciliated']++;
                    } else {
                        $stats['skipped']++;
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    Log::error('SINPE IMAP: error procesando correo', [
                        'message_no' => $msgNo,
                        'error' => $e->getMessage(),
                    ]);
                } finally {
                    if ($markSeen) {
                        $this->markSeenImap($mailbox, $msgNo);
                    }
                }
            }
        } finally {
            @imap_close($mailbox);
        }

        return $stats;
    }

    private function isEnabled(): bool
    {
        $raw = strtolower(trim((string) Setting::get('sinpe_auto_conciliation_enabled', '0')));

        return in_array($raw, ['1', 'true', 'yes', 'on'], true);
    }

    /**
     * @return array<string,mixed>
     */
    private function loadConfig(): array
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
            Log::error('SINPE IMAP: no se pudo abrir buzón', [
                'mailbox' => $mailboxPath,
                'errors' => imap_errors(),
            ]);
        }

        return $imap;
    }

    private function markSeenImap($mailbox, int|string $msgNo): void
    {
        @imap_setflag_full($mailbox, (string) $msgNo, '\\Seen');
    }

    /**
     * @return array{subject:?string,is_read:bool}
     */
    private function fetchOverviewImap($mailbox, int $msgNo): array
    {
        $overview = @imap_fetch_overview($mailbox, (string) $msgNo, 0);
        $item = $overview[0] ?? null;

        return [
            'subject' => $item ? imap_utf8((string) ($item->subject ?? '')) : null,
            'is_read' => (bool) ($item->seen ?? false),
        ];
    }

    private function fetchBodyImap($mailbox, int $msgNo, bool $peek = false): string
    {
        $structure = @imap_fetchstructure($mailbox, $msgNo);
        if (! $structure) {
            return (string) @imap_body($mailbox, $msgNo, $peek ? FT_PEEK : 0);
        }

        if (! empty($structure->parts) && is_array($structure->parts)) {
            foreach ($structure->parts as $index => $part) {
                $partNumber = (string) ($index + 1);
                $raw = (string) @imap_fetchbody($mailbox, $msgNo, $partNumber, $peek ? FT_PEEK : 0);
                if ($raw === '') {
                    continue;
                }

                $decoded = $this->decodePart($raw, (int) ($part->encoding ?? 0));
                if ((int) ($part->type ?? 0) === 0 || (int) ($part->type ?? 0) === 1) {
                    return $decoded;
                }
            }
        }

        return (string) @imap_body($mailbox, $msgNo, $peek ? FT_PEEK : 0);
    }

    /**
     * @param array<string,mixed> $parsed
     */
    private function processParsedMessage(array $parsed, string $messageUid, ?string $mailSubject, bool $isRead): bool
    {
        $reference = (string) ($parsed['reference'] ?? '');
        if ($reference === '') {
            return false;
        }

        $existing = DB::table('sinpe_email_transactions')->where('reference', $reference)->first();
        if ($existing) {
            DB::table('sinpe_email_transactions')
                ->where('reference', $reference)
                ->update([
                    'message_uid' => $messageUid,
                    'mail_subject' => $mailSubject,
                    'is_read' => $isRead,
                    'raw_excerpt' => (string) ($parsed['raw_excerpt'] ?? ''),
                    'updated_at' => now(),
                ]);

            return false;
        }

        $amount = (float) ($parsed['amount'] ?? 0);
        if ($amount <= 0) {
            $this->storeTransaction($parsed, $messageUid, $mailSubject, $isRead, 'skipped', null, null, null, 'Monto no válido');
            return false;
        }

        $client = $this->matchClient($parsed);
        if (! $client) {
            $this->storeTransaction($parsed, $messageUid, $mailSubject, $isRead, 'skipped', null, null, null, 'No se encontró cliente por origen/motivo');
            return false;
        }

        $contract = $this->matchContractByAmount((int) $client->id, $amount);
        if (! $contract) {
            $this->storeTransaction($parsed, $messageUid, $mailSubject, $isRead, 'skipped', (int) $client->id, null, null, 'Monto no coincide con contrato del cliente');
            return false;
        }

        $payment = $this->findOrCreatePaymentForManualReview($client, $contract, $parsed, $amount);
        if (! $payment) {
            $this->storeTransaction($parsed, $messageUid, $mailSubject, $isRead, 'error', (int) $client->id, (int) $contract->id, null, 'No se pudo crear/actualizar pago');
            return false;
        }

        $this->ensureConciliationInReview($payment);

        try {
            if (! empty($client->phone)) {
                $message = 'Nuestros agentes están verificando tu pago. Te contactaremos cuando esté listo.';
                app(WhatsAppNotificationService::class)->sendTextMessage($client->phone, $message);
            }
        } catch (\Throwable $e) {
            Log::warning('sinpe_email.auto_conciliation.notify_failed', [
                'payment_id' => $payment->id,
                'client_id' => $client->id,
                'error' => $e->getMessage(),
            ]);
        }

        $this->storeTransaction($parsed, $messageUid, $mailSubject, $isRead, 'in_review', (int) $client->id, (int) $contract->id, (int) $payment->id, 'Detectado por correo y enviado a revisión manual');

        return true;
    }

    /**
     * @param array<string,mixed> $parsed
     */
    private function matchClient(array $parsed): ?Client
    {
        $originPhone = $this->digits((string) ($parsed['origin_phone'] ?? ''));
        $motive = $this->normalizeText((string) ($parsed['motive'] ?? ''));
        $originName = $this->normalizeText((string) ($parsed['origin_name'] ?? ''));

        $clients = Client::query()->select('id', 'name', 'phone')->whereNull('deleted_at')->get();
        $best = null;
        $bestScore = -1;
        $secondScore = -1;

        foreach ($clients as $candidate) {
            $score = 0;
            $candidatePhone = $this->digits((string) $candidate->phone);
            $candidateName = $this->normalizeText((string) $candidate->name);
            $phoneMatches = false;
            $motiveMatches = false;
            $nameMatches = false;

            if ($originPhone !== '' && $candidatePhone !== '' && str_ends_with($candidatePhone, substr($originPhone, -8))) {
                $score += 100;
                $phoneMatches = true;
            }

            if ($motive !== '' && $candidateName !== '' && str_contains($motive, $candidateName)) {
                $score += 40;
                $motiveMatches = true;
            }

            // Nuevo: Comparar origin_name directamente con nombre del cliente
            if ($originName !== '' && $candidateName !== '') {
                if ($originName === $candidateName) {
                    $score += 120;
                    $nameMatches = true;
                } elseif (str_contains($originName, $candidateName) || str_contains($candidateName, $originName)) {
                    $score += 60;
                    $nameMatches = true;
                }
            }

            // Regla solicitada: validar por numero, motivo o nombre (al menos uno).
            if (! $phoneMatches && ! $motiveMatches && ! $nameMatches) {
                continue;
            }

            if ($score > $bestScore) {
                $secondScore = $bestScore;
                $bestScore = $score;
                $best = $candidate;
            } elseif ($score > $secondScore) {
                $secondScore = $score;
            }
        }

        if (! $best || $bestScore < 70) {
            return null;
        }

        // Evitar conciliaciones ambiguas cuando dos clientes quedan casi empatados.
        if ($secondScore >= 0 && ($bestScore - $secondScore) < 10) {
            return null;
        }

        return $best;
    }

    private function matchContractByAmount(int $clientId, float $amount): ?Contract
    {
        $contracts = Contract::query()
            ->where('client_id', $clientId)
            ->whereNull('deleted_at')
            ->orderBy('next_due_date')
            ->get();

        foreach ($contracts as $contract) {
            $contractAmount = round((float) $contract->amount, 2);
            if (abs($contractAmount - $amount) < 0.009) {
                return $contract;
            }
        }

        return null;
    }

    /**
     * @param array<string,mixed> $parsed
     */
    private function findOrCreatePaymentForManualReview(Client $client, Contract $contract, array $parsed, float $amount): ?Payment
    {
        $reference = (string) ($parsed['reference'] ?? '');
        $performedAt = ! empty($parsed['performed_at']) ? $parsed['performed_at'] : now();

        // Evitar duplicados entre canales: si ya existe un pago con la misma referencia,
        // reutilizarlo y solo enriquecer metadata del correo.
        $paymentByReference = Payment::query()
            ->where('reference', $reference)
            ->orderByDesc('created_at')
            ->first();

        if ($paymentByReference) {
            if ((int) $paymentByReference->client_id !== (int) $client->id) {
                return null;
            }

            if (abs(round((float) $paymentByReference->amount, 2) - $amount) >= 0.009) {
                return null;
            }

            $metadata = is_array($paymentByReference->metadata) ? $paymentByReference->metadata : [];
            $metadata['sinpe_email_reference'] = $reference;
            $metadata['sinpe_email_origin_name'] = $parsed['origin_name'] ?? null;
            $metadata['sinpe_email_origin_phone'] = $parsed['origin_phone'] ?? null;
            $metadata['sinpe_email_motive'] = $parsed['motive'] ?? null;
            $metadata['sinpe_email_detected_at'] = now()->toIso8601String();

            $update = [
                'metadata' => $metadata,
                'paid_at' => $paymentByReference->paid_at ?: $performedAt,
            ];

            if (in_array((string) $paymentByReference->status, ['unverified', 'pending', 'in_review'], true)) {
                $update['status'] = 'in_review';
            }

            $paymentByReference->forceFill($update)->save();

            return $paymentByReference->fresh();
        }

        // Fallback: clientes que envian comprobante por bot sin referencia.
        // Enlazar al pago abierto mas probable para evitar duplicados entre canales.
        $openPaymentWithoutReference = $this->findOpenPaymentWithoutReference($client, $contract, $amount, $performedAt);
        if ($openPaymentWithoutReference) {
            $metadata = is_array($openPaymentWithoutReference->metadata) ? $openPaymentWithoutReference->metadata : [];
            $metadata['sinpe_email_reference'] = $reference;
            $metadata['sinpe_email_origin_name'] = $parsed['origin_name'] ?? null;
            $metadata['sinpe_email_origin_phone'] = $parsed['origin_phone'] ?? null;
            $metadata['sinpe_email_motive'] = $parsed['motive'] ?? null;
            $metadata['sinpe_email_detected_at'] = now()->toIso8601String();
            $metadata['sinpe_email_linked_existing_payment_without_reference'] = true;

            $openPaymentWithoutReference->forceFill([
                'contract_id' => $openPaymentWithoutReference->contract_id ?: $contract->id,
                'status' => 'in_review',
                'channel' => 'sinpe',
                'reference' => $reference,
                'paid_at' => $openPaymentWithoutReference->paid_at ?: $performedAt,
                'metadata' => $metadata,
            ])->save();

            return $openPaymentWithoutReference->fresh();
        }

        $payment = Payment::query()
            ->where('client_id', $client->id)
            ->where('contract_id', $contract->id)
            ->whereIn('status', ['unverified', 'pending', 'in_review'])
            ->orderByDesc('created_at')
            ->first();

        if ($payment) {
            $existingAmount = round((float) $payment->amount, 2);
            if ($existingAmount < $amount) {
                // Regla solicitada: si el monto recibido es menor o distinto al esperado, no conciliar.
                return null;
            }

            if (abs($existingAmount - $amount) >= 0.009) {
                return null;
            }

            $metadata = is_array($payment->metadata) ? $payment->metadata : [];
            $metadata['sinpe_email_reference'] = $reference;
            $metadata['sinpe_email_origin_name'] = $parsed['origin_name'] ?? null;
            $metadata['sinpe_email_origin_phone'] = $parsed['origin_phone'] ?? null;
            $metadata['sinpe_email_motive'] = $parsed['motive'] ?? null;

            $payment->forceFill([
                'status' => 'in_review',
                'channel' => 'sinpe',
                'reference' => $reference,
                'paid_at' => $performedAt,
                'metadata' => $metadata,
            ])->save();

            return $payment->fresh();
        }

        return Payment::query()->create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'amount' => $amount,
            'currency' => 'CRC',
            'status' => 'in_review',
            'channel' => 'sinpe',
            'reference' => $reference,
            'paid_at' => $performedAt,
            'metadata' => [
                'auto_detected_from_email' => true,
                'sinpe_email_reference' => $reference,
                'sinpe_email_origin_name' => $parsed['origin_name'] ?? null,
                'sinpe_email_origin_phone' => $parsed['origin_phone'] ?? null,
                'sinpe_email_motive' => $parsed['motive'] ?? null,
            ],
        ]);
    }

    private function findOpenPaymentWithoutReference(Client $client, Contract $contract, float $amount, mixed $performedAt): ?Payment
    {
        $query = Payment::query()
            ->where('client_id', $client->id)
            ->whereIn('status', ['unverified', 'pending', 'in_review'])
            ->where(function ($q) {
                $q->whereNull('reference')->orWhere('reference', '');
            })
            ->whereRaw('ABS(amount - ?) < 0.009', [$amount])
            ->where(function ($q) use ($contract) {
                $q->where('contract_id', $contract->id)->orWhereNull('contract_id');
            });

        if ($performedAt) {
            try {
                $when = $performedAt instanceof Carbon ? $performedAt : Carbon::parse((string) $performedAt);
                $from = $when->copy()->subDays(7);
                $to = $when->copy()->addDays(7);

                $query->where(function ($q) use ($from, $to) {
                    $q->whereBetween('created_at', [$from->toDateTimeString(), $to->toDateTimeString()])
                        ->orWhereBetween('paid_at', [$from->toDateTimeString(), $to->toDateTimeString()]);
                });
            } catch (\Throwable) {
                // Si falla parseo de fecha, seguir con match por criterios base.
            }
        }

        return $query
            ->withCount('receipts')
            ->orderByDesc('receipts_count')
            ->orderByDesc('created_at')
            ->first();
    }

    private function ensureConciliationInReview(Payment $payment): void
    {
        $billingMonth = $payment->paid_at
            ? Carbon::parse($payment->paid_at)->format('Y-m')
            : now()->format('Y-m');
        $uniqueKey = ConciliationKeyService::generateKey($payment, $billingMonth);

        Conciliation::query()->firstOrCreate(
            ['payment_id' => $payment->id],
            [
                'status' => 'in_review',
                'notes' => 'Detectado por correo SINPE BCR. Pendiente de revisión manual.',
                'verified_at' => null,
                'unique_conciliation_key' => $uniqueKey,
                'channel' => 'sinpe_email',
            ]
        );
    }

    /**
     * @param array<string,mixed> $parsed
     */
    private function storeTransaction(
        array $parsed,
        string $messageUid,
        ?string $mailSubject,
        bool $isRead,
        string $status,
        ?int $clientId,
        ?int $contractId,
        ?int $paymentId,
        ?string $notes
    ): void {
        DB::table('sinpe_email_transactions')->insertOrIgnore([
            'reference' => (string) ($parsed['reference'] ?? ''),
            'origin_phone' => (string) ($parsed['origin_phone'] ?? ''),
            'origin_name' => (string) ($parsed['origin_name'] ?? ''),
            'motive' => (string) ($parsed['motive'] ?? ''),
            'amount' => (float) ($parsed['amount'] ?? 0),
            'performed_at' => $parsed['performed_at'] ?? null,
            'message_uid' => $messageUid,
            'mail_subject' => $mailSubject,
            'is_read' => $isRead,
            'status' => $status,
            'matched_client_id' => $clientId,
            'matched_contract_id' => $contractId,
            'payment_id' => $paymentId,
            'notes' => $notes,
            'raw_excerpt' => (string) ($parsed['raw_excerpt'] ?? ''),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function decodePart(string $raw, int $encoding): string
    {
        return match ($encoding) {
            3 => base64_decode($raw, true) ?: $raw,
            4 => quoted_printable_decode($raw),
            default => $raw,
        };
    }

    private function digits(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }

    private function normalizeText(string $value): string
    {
        $v = mb_strtolower(trim($value));
        $v = str_replace(
            ['á', 'é', 'í', 'ó', 'ú', 'ä', 'ë', 'ï', 'ö', 'ü', 'ñ'],
            ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'i', 'o', 'u', 'n'],
            $v
        );
        $v = preg_replace('/\s+/', ' ', $v) ?: $v;

        return trim($v);
    }
}
