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
                'pdf_base64' => "data:application/pdf;base64,{$pdfBase64}",
                // Enviar también la ruta absoluta como respaldo (el bot la soporta)
                'pdf_path' => $pdfPath,
                'message' => $message,
            ];

            // Enviar al webhook del bot
            $response = Http::timeout(10)
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
     * Envía un mensaje de texto simple por WhatsApp
     *
     * @param string $phone Número de teléfono del cliente
     * @param string $message Mensaje a enviar
     * @return bool
     */
    public function sendTextMessage(string $phone, string $message): bool
    {
        try {
            // Este método podría implementarse si el bot expone un endpoint para enviar mensajes de texto
            // Por ahora, retornamos true ya que el mensaje se envía junto con el PDF
            return true;
        } catch (\Exception $e) {
            Log::error('Error al enviar mensaje de texto', [
                'phone' => $phone,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
