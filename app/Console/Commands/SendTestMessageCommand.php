<?php

namespace App\Console\Commands;

use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use App\Models\ReminderMessage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class SendTestMessageCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'whatsapp:test {phone : Número de teléfono con código de país} {--message= : Mensaje personalizado}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Envía un mensaje de prueba a un número de WhatsApp';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $phone = $this->argument('phone');
        $customMessage = $this->option('message');

        // Validar formato de teléfono
        if (!preg_match('/^\d{10,15}$/', $phone)) {
            $this->error('Formato de teléfono inválido. Debe ser solo números (ej: 50672140974)');
            return self::FAILURE;
        }

        $this->info("Preparando mensaje de prueba para {$phone}...");

        // Buscar o crear cliente de prueba
        $client = Client::firstOrCreate(
            ['phone' => $phone],
            [
                'name' => 'Cliente de Prueba',
                'email' => "test_{$phone}@test.com",
                'address' => 'Dirección de prueba',
                'identification' => 'TEST-' . substr($phone, -8),
            ]
        );

        if ($client->wasRecentlyCreated) {
            $this->info("✓ Cliente de prueba creado: {$client->name}");
        } else {
            $this->info("✓ Cliente encontrado: {$client->name}");
        }

        // Buscar o crear contrato de prueba
        $contract = Contract::firstOrCreate(
            ['client_id' => $client->id],
            [
                'name' => 'Contrato de Prueba - Sistema',
                'amount' => 0.00,
                'currency' => 'CRC',
                'billing_cycle' => 'monthly',
                'next_due_date' => now()->addMonth(),
                'grace_period_days' => 0,
            ]
        );

        if ($contract->wasRecentlyCreated) {
            $this->info("✓ Contrato de prueba creado: {$contract->name}");
        }

        // Preparar el mensaje
        $messageText = $customMessage ?? "🤖 *Mensaje de Prueba - Ticobot*\n\nHola {$client->name}, este es un mensaje de prueba del sistema automatizado de recordatorios.\n\n✅ Sistema funcionando correctamente.\n\n_Enviado el " . now()->format('d/m/Y H:i') . "_";

        // Crear recordatorio de prueba. Normalizamos la hora al tiempo de envío
        // configurado para que coincida con el comportamiento real.
        $scheduledFor = now()->setTimeFromTimeString(config('reminders.send_time', '09:00'));

        $reminder = Reminder::create([
            'client_id' => $client->id,
            'contract_id' => $contract->id,
            'channel' => 'whatsapp',
            'scheduled_for' => $scheduledFor,
            'status' => 'pending',
            'payload' => [
                'message' => $messageText,
                'phone' => $phone,
            ],
        ]);

        $this->info("✓ Recordatorio de prueba creado");

        // Crear mensaje
        $message = ReminderMessage::create([
            'client_id' => $client->id,
            'reminder_id' => $reminder->id,
            'direction' => 'outbound',
            'message_type' => 'text',
            'content' => $messageText,
        ]);

        $this->info("✓ Mensaje preparado");
        $this->newLine();

        // Intentar enviar el mensaje
        $this->info("📤 Enviando mensaje...");
        $this->newLine();

        // Aquí normalmente el bot procesaría el mensaje
        // Por ahora solo mostramos el mensaje que se enviaría
        $this->line("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        $this->line("Para: +{$phone}");
        $this->line("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        $this->line($messageText);
        $this->line("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        $this->newLine();
        $this->info("✅ Mensaje creado en la base de datos");
        $this->info("El bot procesará este mensaje automáticamente");
        
        $this->newLine();
        $this->table(
            ['Campo', 'Valor'],
            [
                ['Cliente ID', $client->id],
                ['Contrato ID', $contract->id],
                ['Recordatorio ID', $reminder->id],
                ['Mensaje ID', $message->id],
                ['Teléfono', "+{$phone}"],
                ['Dirección', $message->direction],
            ]
        );

        return self::SUCCESS;
    }
}
