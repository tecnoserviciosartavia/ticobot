<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Illuminate\Http\Request;
use App\Models\Setting;
use App\Models\Service;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Reminder;
use Carbon\Carbon;
use App\Support\WhatsAppStatus;

class SettingsController extends Controller
{
    public function index()
    {
        $all = Setting::all()->mapWithKeys(function ($s) {
            return [$s->key => $s->value];
        })->toArray();

        // Nunca exponer contraseñas reales al frontend.
        $all['sinpe_imap_password_configured'] = empty($all['sinpe_imap_password']) ? '0' : '1';
        $all['sinpe_smtp_password_configured'] = empty($all['sinpe_smtp_password']) ? '0' : '1';
        $all['sinpe_imap_password'] = '';
        $all['sinpe_smtp_password'] = '';

        $services = Service::query()
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get()
            ->map(fn (Service $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'price' => (string) $s->price,
                'currency' => $s->currency,
                'is_active' => (bool) $s->is_active,
                'updated_at' => $s->updated_at?->toIso8601String(),
            ]);

        return Inertia::render('Settings/General/Index', [
            'settings' => $all,
            'whatsapp' => WhatsAppStatus::snapshot(),
            'services' => $services,
            'logSources' => [
                [
                    'key' => 'laravel',
                    'label' => 'Laravel (storage/logs/laravel.log)',
                    'exists' => is_readable(env('WEB_LOG_LARAVEL_PATH', storage_path('logs/laravel.log'))),
                ],
                [
                    'key' => 'bot_local',
                    'label' => 'Bot local (bot/log.out)',
                    'exists' => is_readable(env('WEB_LOG_BOT_PATH', base_path('bot/log.out'))),
                ],
                [
                    'key' => 'pm2_out',
                    'label' => 'PM2 bot output (ticobot-out.log)',
                    'exists' => is_readable(env('WEB_LOG_PM2_OUT_PATH', '/home/fabian/.pm2/logs/ticobot-out.log')),
                ],
                [
                    'key' => 'pm2_error',
                    'label' => 'PM2 bot errors (ticobot-error.log)',
                    'exists' => is_readable(env('WEB_LOG_PM2_ERROR_PATH', '/home/fabian/.pm2/logs/ticobot-error.log')),
                ],
            ],
            'logDefaultSource' => 'pm2_out',
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            '_settings_section' => 'nullable|string|in:general,mail',
            // "service_name" se mantiene solo por compatibilidad; ya no se configura desde la UI.
            'service_name' => 'nullable|string',
            'company_name' => 'nullable|string',
            'reminder_template' => 'nullable|string',
            'payment_contact' => 'nullable|string',
            'bank_accounts' => 'nullable|string',
            'beneficiary_name' => 'nullable|string',
            'sinpe_auto_conciliation_enabled' => 'nullable|boolean',
            'sinpe_imap_folder' => 'nullable|string|max:255',
            'sinpe_imap_username' => 'nullable|string|max:255',
            'sinpe_imap_password' => 'nullable|string|max:255',
            'sinpe_smtp_password' => 'nullable|string|max:255',
        ]);

        $settingsSection = (string) ($data['_settings_section'] ?? 'general');
        unset($data['_settings_section']);

        if (array_key_exists('service_name', $data)) {
            Setting::set('service_name', $data['service_name'] ?? '');
        }
        if (array_key_exists('company_name', $data)) {
            Setting::set('company_name', $data['company_name'] ?? '');
        }
        if (array_key_exists('reminder_template', $data)) {
            Setting::set('reminder_template', $data['reminder_template'] ?? '');
        }
        if (array_key_exists('payment_contact', $data)) {
            Setting::set('payment_contact', $data['payment_contact'] ?? '');
        }
        if (array_key_exists('bank_accounts', $data)) {
            Setting::set('bank_accounts', $data['bank_accounts'] ?? '');
        }
        if (array_key_exists('beneficiary_name', $data)) {
            Setting::set('beneficiary_name', $data['beneficiary_name'] ?? '');
        }

        if (array_key_exists('sinpe_auto_conciliation_enabled', $data)) {
            Setting::set('sinpe_auto_conciliation_enabled', ! empty($data['sinpe_auto_conciliation_enabled']) ? '1' : '0');
        }

        // Configuración fija de DreamHost (IMAP entrada, SMTP salida).
        Setting::set('sinpe_imap_host', 'imap.dreamhost.com');
        Setting::set('sinpe_imap_port', '993');
        Setting::set('sinpe_imap_encryption', 'ssl');
        Setting::set('sinpe_smtp_host', 'smtp.dreamhost.com');
        Setting::set('sinpe_smtp_port', '587');
        Setting::set('sinpe_smtp_encryption', 'tls');

        foreach ([
            'sinpe_imap_folder',
            'sinpe_imap_username',
        ] as $simpleKey) {
            if (array_key_exists($simpleKey, $data)) {
                Setting::set($simpleKey, (string) ($data[$simpleKey] ?? ''));
            }
        }

        // SMTP usa el mismo correo de DreamHost para autenticación.
        if (array_key_exists('sinpe_imap_username', $data)) {
            Setting::set('sinpe_smtp_username', (string) ($data['sinpe_imap_username'] ?? ''));
        }

        // Contraseñas: solo actualizar si viene un valor no vacío.
        if (! empty($data['sinpe_imap_password'])) {
            Setting::set('sinpe_imap_password', (string) $data['sinpe_imap_password']);
        }

        if (! empty($data['sinpe_smtp_password'])) {
            Setting::set('sinpe_smtp_password', (string) $data['sinpe_smtp_password']);
        } elseif (! empty($data['sinpe_imap_password'])) {
            // Mantener IMAP/SMTP sincronizados cuando se cambia una sola contraseña.
            Setting::set('sinpe_smtp_password', (string) $data['sinpe_imap_password']);
        }

        if ($settingsSection === 'mail') {
            $imapPassword = ! empty($data['sinpe_imap_password'])
                ? (string) $data['sinpe_imap_password']
                : (string) Setting::get('sinpe_imap_password', '');

            [$ok, $message] = $this->verifyImapConnection([
                'host' => (string) Setting::get('sinpe_imap_host', ''),
                'port' => (int) Setting::get('sinpe_imap_port', 0),
                'encryption' => (string) Setting::get('sinpe_imap_encryption', 'ssl'),
                'folder' => (string) ($data['sinpe_imap_folder'] ?? Setting::get('sinpe_imap_folder', 'BCR')),
                'username' => (string) ($data['sinpe_imap_username'] ?? Setting::get('sinpe_imap_username', '')),
                'password' => $imapPassword,
            ]);

            return redirect()->back()->with('success', 'Configuración de correo guardada.')->with('mail_status', [
                'ok' => $ok,
                'message' => $message,
            ]);
        }

        return redirect()->back()->with('success', 'Configuración guardada.');
    }

    /**
     * @param array<string,mixed> $config
     * @return array{0:bool,1:string}
     */
    private function verifyImapConnection(array $config): array
    {
        if (! function_exists('imap_open')) {
            return [false, 'No se pudo verificar: la extensión IMAP no está habilitada en PHP.'];
        }

        $host = trim((string) ($config['host'] ?? ''));
        $port = (int) ($config['port'] ?? 0);
        $folder = trim((string) ($config['folder'] ?? 'BCR'));
        $username = trim((string) ($config['username'] ?? ''));
        $password = (string) ($config['password'] ?? '');
        $encryption = trim((string) ($config['encryption'] ?? 'ssl'));

        if ($host === '' || $port <= 0 || $folder === '' || $username === '' || $password === '') {
            return [false, 'Configuración incompleta: revisa host, puerto, carpeta, usuario y contraseña IMAP.'];
        }

        $flags = '/imap';
        if ($encryption === 'ssl') {
            $flags .= '/ssl';
        } elseif ($encryption === 'tls') {
            $flags .= '/tls';
        } else {
            $flags .= '/notls';
        }
        $flags .= '/novalidate-cert';

        $mailboxPath = sprintf('{%s:%d%s}%s', $host, $port, $flags, ltrim($folder));
        $imap = @imap_open($mailboxPath, $username, $password);
        if (! $imap) {
            $errors = imap_errors();
            $detail = is_array($errors) && count($errors) > 0 ? (string) end($errors) : 'No fue posible abrir el buzón.';

            $normalizedDetail = strtolower($detail);
            if (str_contains($normalizedDetail, 'basicauthblocked') || str_contains($normalizedDetail, 'authfailed') || str_contains($normalizedDetail, 'logondenied')) {
                return [
                    false,
                    'Conexión IMAP fallida: autenticación bloqueada por el proveedor. Verifica correo y contraseña de aplicación de DreamHost.',
                ];
            }

            return [false, 'Conexión IMAP fallida: ' . $detail];
        }

        @imap_close($imap);

        return [true, 'Conexión IMAP exitosa. La carpeta de correo está accesible.'];
    }

    public function sendTestReminder(Request $request)
    {
        $data = $request->validate([
            // Permite 8 dígitos (CR) o 10+ con código país (ej 506XXXXXXXX)
            'phone' => ['required', 'string', 'regex:/^\d{8,15}$/'],
        ]);

        $raw = preg_replace('/[^0-9]/', '', $data['phone'] ?? '');
        // Si viene como 8 dígitos, asumimos CR y agregamos 506.
        $phone = strlen($raw) === 8 ? ('506' . $raw) : $raw;

        // Crear/obtener cliente de prueba por teléfono
        $client = Client::firstOrCreate(
            ['phone' => $raw],
            [
                'name' => 'Cliente de Prueba',
                'email' => "test_{$raw}@test.com",
                'address' => 'Dirección de prueba',
                'identification' => 'TEST-' . substr($raw, -8),
            ]
        );

        // Crear/obtener contrato de prueba para ese cliente
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

        // Crear recordatorio inmediato. El bot se encarga del contenido vía reminder_template.
        $reminder = Reminder::create([
            'contract_id' => $contract->id,
            'client_id' => $client->id,
            'channel' => 'whatsapp',
            'scheduled_for' => Carbon::now(),
            'status' => 'pending',
            'payload' => [
                // Importante: guardamos el teléfono con código país por si el bot lo usa.
                'phone' => $phone,
            ],
        ]);

        return redirect()->back()->with('success', "Recordatorio de prueba encolado para +{$phone}.")->with('reminder_id', $reminder->id);
    }
}
