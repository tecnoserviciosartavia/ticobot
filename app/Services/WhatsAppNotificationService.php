<?php

namespace App\Services;

use App\Models\Payment;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class WhatsAppNotificationService
{
    protected string $botWebhookUrl;

    public function __construct()
    {
        $this->botWebhookUrl = env('BOT_WEBHOOK_URL', 'http://localhost:3001');
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

            $pdfContent = file_get_contents($pdfPath);
            $pdfBase64 = base64_encode($pdfContent);

            // Obtener receipt_local_id del metadata si existe
            $receiptLocalId = null;
            if ($payment->metadata && isset($payment->metadata['local_receipt_id'])) {
                $receiptLocalId = $payment->metadata['local_receipt_id'];
            }

            // Preparar el payload para el webhook del bot
            $payload = [
                'backend_id' => $payment->id,
                'receipt_local_id' => $receiptLocalId,
                // Fallback: si el bot no tiene el receipt en su index, puede enviar directo al número.
                'phone' => $payment->client?->phone,
                'pdf_base64' => "data:application/pdf;base64,{$pdfBase64}",
                // Enviar también la ruta absoluta como respaldo (el bot la soporta)
                'pdf_path' => $pdfPath,
                'message' => $message,
            ];

            // Enviar al webhook del bot
            $response = Http::timeout(10)
                // Si el bot está levantando o WhatsApp aún no está listo, puede responder 503.
                // Reintentamos un par de veces para cubrir condiciones transitorias.
                ->retry(2, 500, function ($exception, $request) {
                    return $exception instanceof \Illuminate\Http\Client\RequestException
                        && $exception->response
                        && $exception->response->status() === 503;
                })
                ->post("{$this->botWebhookUrl}/webhook/receipt_reconciled", $payload);

            if ($response->successful()) {
                Log::info('PDF de conciliación enviado exitosamente', [
                    'payment_id' => $payment->id,
                    'receipt_local_id' => $receiptLocalId,
                ]);
                return true;
            }

            Log::warning('Error al enviar PDF de conciliación al bot', [
                'payment_id' => $payment->id,
                'status' => $response->status(),
                'response' => $response->body(),
            ]);

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

            $pdfContent = file_get_contents($pdfPath);
            $pdfBase64 = base64_encode($pdfContent);

            // Preparar el payload para envío directo al cliente
            $payload = [
                'phone' => $payment->client->phone,
                'message' => $message,
                'pdf_base64' => "data:application/pdf;base64,{$pdfBase64}",
                'pdf_path' => $pdfPath,
                'payment_id' => $payment->id,
            ];

            // Enviar al webhook del bot para envío directo
            $response = Http::timeout(10)
                ->post("{$this->botWebhookUrl}/webhook/send_pdf", $payload);

            if ($response->successful()) {
                Log::info('PDF de pago manual enviado exitosamente', [
                    'payment_id' => $payment->id,
                    'client_phone' => $payment->client->phone,
                ]);
                return true;
            }

            Log::warning('Error al enviar PDF de pago manual al bot', [
                'payment_id' => $payment->id,
                'status' => $response->status(),
                'response' => $response->body(),
            ]);

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
            $pin = $service['pin'] ?? null;

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

    /**
     * Envía un mensaje de texto simple por WhatsApp
     *
     * @param string $phone Número de teléfono del cliente
     * @param string $message Mensaje a enviar
     * @return bool
     */
    public function sendTextMessage(string $phone, string $message): bool
    {
        try {
            $attempt = 0;
            $response = null;

            do {
                $attempt++;
                $response = Http::timeout(10)
                    ->post("{$this->botWebhookUrl}/webhook/send_text", [
                        'phone' => $phone,
                        'message' => $message,
                    ]);

                if ($response->successful()) {
                    return true;
                }

                $body = (string) $response->body();
                $retryableLidError = $response->status() === 500
                    && str_contains(strtolower($body), 'lid is missing in chat table');

                if ($retryableLidError && $attempt < 3) {
                    usleep(600000);
                    continue;
                }

                break;
            } while ($attempt < 3);

            if ($response && $response->successful()) {
                return true;
            }

            Log::warning('Error al enviar mensaje de texto por bot webhook', [
                'phone' => $phone,
                'status' => $response?->status(),
                'response' => $response?->body(),
            ]);
            return false;
        } catch (\Exception $e) {
            Log::error('Error al enviar mensaje de texto', [
                'phone' => $phone,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
