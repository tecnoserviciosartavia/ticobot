<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\WhatsappChatMessage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppNotificationService
{
    protected string $metaToken;
    protected string $metaPhoneNumberId;
    protected string $metaApiVersion;

    public function __construct()
    {
        $this->metaToken = trim((string) config('services.whatsapp.token', ''));
        $this->metaPhoneNumberId = trim((string) config('services.whatsapp.phone_id', ''));
        $this->metaApiVersion = trim((string) config('services.whatsapp.version', 'v18.0'));
    }

    /**
     * Envía el PDF de conciliación al cliente por WhatsApp
     *
     * @param Payment $payment
     * @param string $pdfPath Path absoluto del PDF en el sistema de archivos
     * @param string $message Mensaje a enviar junto con el PDF
     * @return bool
     */
    public function sendConciliationReceipt(Payment $payment, string $pdfPath, string $message): bool
    {
        try {
            // Verificar que el archivo existe (ahora es un path absoluto)
            if (!file_exists($pdfPath)) {
                Log::error('PDF no encontrado en el sistema de archivos', ['path' => $pdfPath]);
                return false;
            }

            // Obtener receipt_local_id del metadata si existe
            $receiptLocalId = null;
            if ($payment->metadata && isset($payment->metadata['local_receipt_id'])) {
                $receiptLocalId = $payment->metadata['local_receipt_id'];
            }

            $phone = (string) ($payment->client?->phone ?? '');
            if ($phone === '') {
                Log::warning('Cliente sin teléfono registrado', ['payment_id' => $payment->id]);
                return false;
            }

            $ok = $this->sendViaMetaDocument($phone, $pdfPath, $message);
            if ($ok) {
                $this->logOutboundHistory($phone, null, [
                    'media' => [
                        'kind' => 'document',
                        'filename' => basename($pdfPath),
                        'mimetype' => 'application/pdf',
                    ],
                    'category' => 'conciliation_receipt',
                ]);
                if (trim($message) !== '') {
                    $this->logOutboundHistory($phone, $message, ['category' => 'conciliation_receipt']);
                }
                Log::info('PDF de conciliación enviado exitosamente', [
                    'payment_id' => $payment->id,
                    'receipt_local_id' => $receiptLocalId,
                ]);
                return true;
            }

            return false;
        } catch (\Exception $e) {
            Log::error('Excepción al enviar PDF de conciliación', [
                'payment_id' => $payment->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return false;
        }
    }

    /**
     * Envía un PDF directamente al cliente sin receipt_local_id (para pagos manuales)
     *
     * @param Payment $payment
     * @param string $pdfPath Path absoluto del PDF en el sistema de archivos
     * @param string $message Mensaje a enviar junto con el PDF
     * @return bool
     */
    public function sendManualPaymentReceipt(Payment $payment, string $pdfPath, string $message): bool
    {
        try {
            // Verificar que el archivo existe
            if (!file_exists($pdfPath)) {
                Log::error('PDF no encontrado en el sistema de archivos', ['path' => $pdfPath]);
                return false;
            }

            // Verificar que el cliente tenga teléfono
            if (!$payment->client || !$payment->client->phone) {
                Log::warning('Cliente sin teléfono registrado', ['payment_id' => $payment->id]);
                return false;
            }

            $ok = $this->sendViaMetaDocument($payment->client->phone, $pdfPath, $message);
            if ($ok) {
                $this->logOutboundHistory($payment->client->phone, null, [
                    'media' => [
                        'kind' => 'document',
                        'filename' => basename($pdfPath),
                        'mimetype' => 'application/pdf',
                    ],
                    'category' => 'manual_payment_receipt',
                ]);
                if (trim($message) !== '') {
                    $this->logOutboundHistory($payment->client->phone, $message, ['category' => 'manual_payment_receipt']);
                }
                Log::info('PDF de pago manual enviado exitosamente', [
                    'payment_id' => $payment->id,
                    'client_phone' => $payment->client->phone,
                ]);
                return true;
            }

            return false;
        } catch (\Exception $e) {
            Log::error('Excepción al enviar PDF de pago manual', [
                'payment_id' => $payment->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return false;
        }
    }

    /**
     * Envía credenciales de acceso a plataformas por WhatsApp al cliente.
     * Retorna la cantidad de mensajes enviados con éxito.
     *
     * @param string $phone
     * @param array<int, array{name:string, account_email:?string, password:?string, pin:?string}> $services
     */
    public function sendPlatformAccessMessages(string $phone, array $services): int
    {
        $sent = 0;
        $alreadySent = 0;
        foreach ($services as $service) {
            $name = strtoupper($service['name'] ?? '');
            $email = $service['account_email'] ?? null;
            $password = $service['password'] ?? null;
            $pin = $this->resolveAccessPinFromPhone($phone, $service['name'] ?? null, $service['pin'] ?? null);

            if (! $email && ! $password) {
                continue;
            }

            $lines = [];
            $lines[] = "Para acceder a la plataforma de {$name} por favor proporcione los siguientes datos:";
            $lines[] = '';
            if ($email) {
                $lines[] = "Correo electrónico: {$email}";
            }
            if ($password) {
                $lines[] = "Contraseña: {$password}";
            }
            $lines[] = '';
            $lines[] = 'Al ingresar a su cuenta, verá un perfil con su nombre';
            if ($pin) {
                $lines[] = '';
                $lines[] = "Para verificar el funcionamiento del servicio, se le solicitará ingresar un PIN: {$pin}";
            }

            $message = implode("\n", $lines);
            if ($this->sendTextMessage($phone, $message)) {
                $sent++;
                $alreadySent++;
                // Evita disparar mensajes consecutivos demasiado rápido al mismo chat.
                if ($alreadySent > 0) {
                    usleep(300000);
                }
            }
        }

        return $sent;
    }

    private function resolveAccessPinFromPhone(string $phone, ?string $serviceName, mixed $providedPin = null): ?string
    {
        $serviceNameNorm = mb_strtolower((string) ($serviceName ?? ''));
        if (str_contains($serviceNameNorm, 'spotify')) {
            return null;
        }

        $providedPin = trim((string) ($providedPin ?? ''));
        if ($providedPin !== '') {
            return $providedPin;
        }

        $digits = preg_replace('/\D+/', '', $phone);
        if ($digits === '') {
            return null;
        }

        $lastFour = substr($digits, -4);
        if ($lastFour === false || $lastFour === '') {
            return null;
        }

        if (str_contains($serviceNameNorm, 'prime')) {
            return $lastFour . substr($lastFour, -1);
        }

        return $lastFour;
    }

    private function metaApiBaseUrl(): string
    {
        return 'https://graph.facebook.com/'.$this->metaApiVersion;
    }

    private function metaHeaders(): array
    {
        return [
            'Authorization' => 'Bearer '.$this->metaToken,
            'Accept' => 'application/json',
        ];
    }

    private function metaConfigured(): bool
    {
        return $this->metaToken !== '' && $this->metaPhoneNumberId !== '';
    }

    private function normalizeMetaRecipient(string $recipient): ?string
    {
        $recipient = trim($recipient);
        if ($recipient === '') {
            return null;
        }

        // Los BSUID pueden ser opacos. Los teléfonos existentes conservan su
        // normalización histórica, incluidos espacios, + y guiones.
        if (preg_match('/[A-Za-z]/', $recipient) === 1) {
            return $recipient;
        }

        return WhatsappChatMessage::normalizePhone($recipient) ?: null;
    }

    public function isMetaConfigured(): bool
    {
        return $this->metaConfigured();
    }

    public function sendMediaMessage(string $phone, string $base64Data, string $mimeType, ?string $filename = null, ?string $caption = null): bool
    {
        $normalizedPhone = $this->normalizeMetaRecipient($phone);
        if (! $this->metaConfigured() || $normalizedPhone === null) return false;
        $mediaId = $this->uploadMetaMediaTemp($base64Data, $mimeType);
        if (! $mediaId) return false;
        $type = str_starts_with($mimeType, 'image/') ? 'image' : (str_starts_with($mimeType, 'video/') ? 'video' : (str_starts_with($mimeType, 'audio/') ? 'audio' : 'document'));
        $media = ['id' => $mediaId];
        if ($caption && in_array($type, ['image', 'video', 'document'], true)) $media['caption'] = $caption;
        if ($filename && $type === 'document') $media['filename'] = $filename;
        $response = Http::timeout(30)->withHeaders($this->metaHeaders())->post($this->metaApiBaseUrl().'/'.$this->metaPhoneNumberId.'/messages', ['messaging_product' => 'whatsapp', 'to' => $normalizedPhone, 'type' => $type, $type => $media]);
        if (! $response->successful()) Log::warning('Error al enviar media por Meta WhatsApp', ['phone' => $phone, 'status' => $response->status(), 'response' => $response->body()]);
        return $response->successful();
    }

    private function sendViaMetaText(string $phone, string $message): ?string
    {
        if (! $this->metaConfigured()) {
            Log::warning('Meta WhatsApp no configurado; no se pudo enviar texto', [
                'phone' => $phone,
            ]);
            return null;
        }

        $normalizedPhone = $this->normalizeMetaRecipient($phone);
        if ($normalizedPhone === null) {
            Log::warning('Número inválido para Meta WhatsApp', ['phone' => $phone]);
            return null;
        }

        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $normalizedPhone,
            'type' => 'text',
            'text' => [
                'preview_url' => false,
                'body' => $message,
            ],
        ];

        $response = Http::timeout(20)
            ->withHeaders($this->metaHeaders())
            ->post($this->metaApiBaseUrl().'/'.$this->metaPhoneNumberId.'/messages', $payload);

        if ($response->successful()) {
            $data = $response->json();
            $messageId = $data['messages'][0]['id'] ?? null;
            return $messageId;
        }

        Log::warning('Error al enviar mensaje por Meta WhatsApp', [
            'phone' => $phone,
            'status' => $response->status(),
            'response' => $response->body(),
        ]);

        return null;
    }

    private function uploadMetaMediaTemp(string $base64Data, string $mimeType): ?string
    {
        if (! $this->metaConfigured()) {
            return null;
        }

        $binary = base64_decode(preg_replace('/^data:[^;]+;base64,/', '', $base64Data) ?: '', true);
        if ($binary === false) {
            return null;
        }

        $response = Http::timeout(60)
            ->withHeaders($this->metaHeaders())
            ->attach('file', $binary, 'promo'.($mimeType === 'image/png' ? '.png' : '.jpg'))
            ->post($this->metaApiBaseUrl().'/'.$this->metaPhoneNumberId.'/media', [
                'messaging_product' => 'whatsapp',
                'type' => $mimeType,
            ]);

        if (! $response->successful()) {
            return null;
        }

        $mediaId = $response->json('id');
        return is_string($mediaId) && $mediaId !== '' ? $mediaId : null;
    }

    private function uploadMetaMedia(string $path, string $mimeType): ?string
    {
        if (! $this->metaConfigured()) {
            return null;
        }

        if (! file_exists($path)) {
            return null;
        }

        $response = Http::timeout(60)
            ->withHeaders($this->metaHeaders())
            ->attach('file', file_get_contents($path), basename($path))
            ->post($this->metaApiBaseUrl().'/'.$this->metaPhoneNumberId.'/media', [
                'messaging_product' => 'whatsapp',
                'type' => $mimeType,
            ]);

        if (! $response->successful()) {
            Log::warning('Error al subir media a Meta WhatsApp', [
                'path' => $path,
                'status' => $response->status(),
                'response' => $response->body(),
            ]);
            return null;
        }

        $mediaId = $response->json('id');
        return is_string($mediaId) && $mediaId !== '' ? $mediaId : null;
    }

    private function sendViaMetaDocument(string $phone, string $documentPath, string $message): bool
    {
        if (! $this->metaConfigured()) {
            Log::warning('Meta WhatsApp no configurado; no se pudo enviar documento', [
                'phone' => $phone,
                'path' => $documentPath,
            ]);
            return false;
        }

        $normalizedPhone = $this->normalizeMetaRecipient($phone);
        if ($normalizedPhone === null) {
            Log::warning('Número inválido para Meta WhatsApp', ['phone' => $phone]);
            return false;
        }

        if (! file_exists($documentPath)) {
            Log::warning('Documento no encontrado para Meta WhatsApp', ['path' => $documentPath]);
            return false;
        }

        $mediaId = $this->uploadMetaMedia($documentPath, 'application/pdf');
        if (! $mediaId) {
            return false;
        }

        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $normalizedPhone,
            'type' => 'document',
            'document' => [
                'id' => $mediaId,
                'filename' => basename($documentPath),
            ],
        ];

        $response = Http::timeout(20)
            ->withHeaders($this->metaHeaders())
            ->post($this->metaApiBaseUrl().'/'.$this->metaPhoneNumberId.'/messages', $payload);

        if ($response->successful()) {
            if (trim($message) !== '') {
                return $this->sendViaMetaText($phone, $message);
            }
            return true;
        }

        Log::warning('Error al enviar documento por Meta WhatsApp', [
            'phone' => $phone,
            'status' => $response->status(),
            'response' => $response->body(),
        ]);

        return false;
    }

    /**
     * Envía un mensaje de texto simple por WhatsApp
     *
     * @param string $phone Número de teléfono del cliente
     * @param string $message Mensaje a enviar
     * @return bool
     */
    public function sendTextMessage(
        string $phone,
        string $message,
        bool $logHistory = true,
        array $historyMetadata = []
    ): bool
    {
        try {
            $whatsappMessageId = $this->sendViaMetaText($phone, $message);
            if (! $whatsappMessageId) {
                return false;
            }

            if ($logHistory) {
                $historyMetadata['whatsapp_message_id'] = $whatsappMessageId;
                $this->logOutboundHistory($phone, $message, $historyMetadata);
            }

            return true;
        } catch (\Exception $e) {
            Log::error('Error al enviar mensaje de texto', [
                'phone' => $phone,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Envía una plantilla previamente aprobada por Meta y conserva el wamid
     * para que los webhooks puedan actualizar entrega, lectura o fallo.
     *
     * @param  list<string>  $bodyParameters
     */
    public function sendTemplateMessage(
        string $phone,
        string $templateName,
        array $bodyParameters,
        string $language = 'es',
        array $historyMetadata = []
    ): bool {
        $normalizedPhone = $this->normalizeMetaRecipient($phone);

        if (! $this->metaConfigured() || $normalizedPhone === null) {
            return false;
        }

        $components = [];
        if ($bodyParameters !== []) {
            $components[] = [
                'type' => 'body',
                'parameters' => array_map(
                    fn ($value) => ['type' => 'text', 'text' => (string) $value],
                    array_values($bodyParameters)
                ),
            ];
        }

        $response = Http::timeout(20)
            ->withHeaders($this->metaHeaders())
            ->post($this->metaApiBaseUrl().'/'.$this->metaPhoneNumberId.'/messages', [
                'messaging_product' => 'whatsapp',
                'to' => $normalizedPhone,
                'type' => 'template',
                'template' => [
                    'name' => $templateName,
                    'language' => ['code' => $language],
                    'components' => $components,
                ],
            ]);

        if (! $response->successful()) {
            Log::warning('Error al enviar plantilla por Meta WhatsApp', [
                'phone' => $phone,
                'template' => $templateName,
                'status' => $response->status(),
                'response' => $response->body(),
            ]);

            return false;
        }

        $messageId = data_get($response->json(), 'messages.0.id');
        $renderedBody = $this->renderTemplateBodyForHistory($templateName, $bodyParameters);
        $this->logOutboundHistory($phone, $renderedBody, array_merge([
            'source' => 'overdue_reminder_template',
            'transport' => 'meta_cloud_api',
            'template_name' => $templateName,
            'template_language' => $language,
            'whatsapp_message_id' => $messageId,
        ], $historyMetadata));

        return true;
    }

    /**
     * Refleja en el chat local el cuerpo que Meta renderiza para las plantillas
     * usadas por el sistema. Meta no devuelve el texto renderizado al enviar.
     *
     * @param  list<string>  $bodyParameters
     */
    private function renderTemplateBodyForHistory(string $templateName, array $bodyParameters): string
    {
        if ($templateName === 'aviso_ajuste_tarifas_facturacion_v1') {
            [$clientName] = array_pad(array_values($bodyParameters), 1, 'cliente');

            return "Hola, {$clientName}. Esperamos que se encuentre muy bien.\n\n"
                .'Queremos informarle que, a partir de septiembre de 2026, se aplicará un ajuste en las tarifas de todos nuestros servicios de facturación. '
                ."Este cambio nos permitirá continuar brindándole un servicio estable, atención oportuna y mejoras constantes.\n\n"
                ."Agradecemos mucho su comprensión y la confianza depositada en nosotros. Si tiene alguna consulta, con gusto estamos para ayudarle.\n\n"
                ."Saludos cordiales,\nEquipo TicoFac";
        }

        if ($templateName === 'reactivacion_servicio_v1') {
            [$platforms] = array_pad(array_values($bodyParameters), 1, 'los servicios asignados');

            return "Lamentamos que no quisieras renovar con nosotros. Hemos eliminado los perfiles de las siguientes plataformas: {$platforms}.\n\n"
                .'Si deseas renovar y volver a disfrutar de nuestros servicios, solamente escríbenos y activamos nuevamente tu perfil.';
        }

        if ($templateName === 'recordatorio_vencimiento_multiempresa') {
            [$clientName, $companyName, $dueDate, $amount, $paymentContact, $bankAccounts, $beneficiaryName] = array_pad(array_values($bodyParameters), 7, '');

            return "Estimad@ cliente {$clientName}\n\n"
                ."{$companyName} le informa que su suscripción de servicios ha vencido.\n\n"
                ."Fecha de vencimiento: {$dueDate}\n"
                ."Total: {$amount}\n\n"
                ."Por favor realice el pago correspondiente y envíenos el comprobante.\n\n"
                ."SINPE Móvil / contacto de pago: {$paymentContact}\n\n"
                ."Cuentas para depósitos:\n{$bankAccounts}\n\n"
                ."Beneficiario: {$beneficiaryName}\n\n"
                ."Si ya realizó el pago, omita este mensaje.";
        }

        if ($templateName !== 'recordatorio_vencimiento_v2') {
            return implode(' | ', array_map('strval', $bodyParameters));
        }

        [$clientName, $dueDate, $amount] = array_pad(array_values($bodyParameters), 3, '');

        return "Estimad@ cliente {$clientName}\n\n"
            ."TicoCast le informa que su suscripción de servicios de entretenimiento ha vencido.\n\n"
            ."Fecha de vencimiento: {$dueDate}\n"
            ."Total: {$amount}\n\n"
            ."En caso de no recibir respuesta, nos veremos en la necesidad de liberar el perfil de su suscripción.\n\n"
            ."Si desea volver a disfrutar de nuestros servicios, realice el pago correspondiente y envíenos el comprobante.\n\n"
            ."SINPE Móvil: 88525881\n\n"
            ."Cuentas para depósitos:\n"
            ."BCR: CR21015202001214583670\n"
            ."BAC: CR48010200009692963181\n"
            ."POPULAR: CR54016111152151714031\n"
            ."BCT: CR56010730101104454585\n"
            ."COOPENAE: CR84081400011024939855\n"
            ."MUTUAL ALAJUELA: CR98080348100999887871\n\n"
            ."Titular: Fabián Artavia Serrano\n\n"
            ."Si ya realizó el pago, omita este mensaje.";
    }

    private function logOutboundHistory(string $phone, ?string $body, array $metadata = []): void
    {
        $normalizedPhone = WhatsappChatMessage::normalizePhone($phone) ?: null;
        if ($normalizedPhone === null) {
            return;
        }

        try {
            $whatsappMessageId = $metadata['whatsapp_message_id'] ?? null;
            unset($metadata['whatsapp_message_id']);

            WhatsappChatMessage::query()->create([
                'phone' => $normalizedPhone,
                'direction' => 'outbound',
                'body' => $body,
                'status' => 'sent',
                'whatsapp_message_id' => $whatsappMessageId,
                'metadata' => array_merge([
                    'source' => 'platform',
                    'transport' => 'meta_cloud_api',
                ], $metadata),
                'sent_at' => now('UTC'),
            ]);
        } catch (\Throwable $e) {
            // El mensaje ya fue enviado: una falla de historial no debe provocar un reenvío.
            Log::error('No se pudo registrar el mensaje saliente de WhatsApp', [
                'phone' => $normalizedPhone,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
