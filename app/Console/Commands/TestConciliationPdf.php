<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Services\ConciliationPdfService;
use App\Services\WhatsAppNotificationService;
use Illuminate\Console\Command;

class TestConciliationPdf extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'test:conciliation-pdf {payment_id}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Genera y envía un PDF de conciliación de prueba';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $paymentId = $this->argument('payment_id');
        
        $payment = Payment::with(['client', 'contract'])->find($paymentId);
        
        if (!$payment) {
            $this->error("Pago #{$paymentId} no encontrado");
            return 1;
        }

        $this->info("Generando PDF para pago #{$payment->id}...");
        $this->info("Cliente: {$payment->client?->name}");
        $this->info("Monto: {$payment->currency} {$payment->amount}");

        $pdfService = new ConciliationPdfService();
        $whatsappService = new WhatsAppNotificationService();

        // Calcular los meses del pago
        $months = $pdfService->calculateMonthsFromPayment($payment);
        $this->info("Meses calculados: {$months}");

        try {
            // Generar el PDF
            $pdfPath = $pdfService->generateConciliationReceipt($payment, $months);
            $this->info("PDF generado en: storage/app/{$pdfPath}");

            // Generar el mensaje personalizado
            $message = $pdfService->generateWhatsAppMessage($months);
            $this->info("Mensaje:");
            $this->line($message);

            // Preguntar si enviar por WhatsApp
            if ($this->confirm('¿Deseas enviar el PDF por WhatsApp?', false)) {
                $sent = $whatsappService->sendConciliationReceipt($payment, $pdfPath, $message);
                
                if ($sent) {
                    $this->info('✓ PDF enviado exitosamente por WhatsApp');
                } else {
                    $this->error('✗ No se pudo enviar el PDF por WhatsApp');
                    $this->warn('Revisa los logs para más detalles');
                }
            }

            $this->info('✓ Comando completado exitosamente');
            return 0;
        } catch (\Exception $e) {
            $this->error("Error: {$e->getMessage()}");
            $this->line($e->getTraceAsString());
            return 1;
        }
    }
}

