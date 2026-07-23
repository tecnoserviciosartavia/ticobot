import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { registerPushDeviceForApp } from '@/mobile/registerPushDevice';
import type { PageProps } from '@/types';
import UpdatePushNotificationPreferencesForm from '@/Pages/Profile/Partials/UpdatePushNotificationPreferencesForm';
import LogsTab from '@/Pages/Settings/General/Partials/LogsTab';
import { useRef, useState } from 'react';
import { Settings, ArrowLeft, Save, RefreshCw, Download, Upload, Eye, EyeOff, Bell } from '@/Components/icons';

type ServiceItem = {
    id: number;
    name: string;
    price: string;
    currency: 'CRC' | 'USD';
    is_active: boolean;
    updated_at?: string | null;
};

type LogSource = {
    key: string;
    label: string;
    exists: boolean;
};

type Props = PageProps<{
    settings: Record<string, string>;
    pushNotificationPreferences: {
        daily_expected_payments: boolean;
        overdue_payments: boolean;
        platform_cost_due: boolean;
        conciliation_pending: boolean;
        whatsapp_manual_pause_events: boolean;
        whatsapp_help_requests: boolean;
        whatsapp_incoming_messages: boolean;
    };
    services: ServiceItem[];
    logSources: LogSource[];
    logDefaultSource: string;
}>;

const currencySymbol = (currency: string) => {
    switch (currency) {
        case 'CRC':
            return '₡';
        case 'USD':
            return '$';
        default:
            return currency;
    }
};

export default function SettingsIndex({ settings, services, logSources, logDefaultSource, pushNotificationPreferences }: Props) {
    const page = usePage();
    const flash = (page.props as any)?.flash ?? {};
    const webPushPublicKey = (page.props as any)?.push?.web_public_key ?? null;
    const [activeTab, setActiveTab] = useState<'general' | 'mail' | 'services' | 'logs' | 'notifications'>('general');
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [pushGuide, setPushGuide] = useState<'android' | 'ios'>('android');
    const [pushActivationStatus, setPushActivationStatus] = useState<string | null>(null);
    const [pushActivationBusy, setPushActivationBusy] = useState(false);

    const form = useForm({
        company_name: settings.company_name ?? '',
        reminder_template: settings.reminder_template ?? '',
        payment_contact: settings.payment_contact ?? '',
        bank_accounts: settings.bank_accounts ?? '',
        beneficiary_name: settings.beneficiary_name ?? '',
        sinpe_auto_conciliation_enabled: settings.sinpe_auto_conciliation_enabled ?? '0',
        sinpe_imap_host: settings.sinpe_imap_host ?? 'imap.dreamhost.com',
        sinpe_imap_port: settings.sinpe_imap_port ?? '993',
        sinpe_imap_encryption: settings.sinpe_imap_encryption ?? 'ssl',
        sinpe_imap_folder: settings.sinpe_imap_folder ?? 'BCR',
        sinpe_imap_username: settings.sinpe_imap_username ?? '',
        sinpe_imap_password: '',
        sinpe_smtp_host: settings.sinpe_smtp_host ?? 'smtp.dreamhost.com',
        sinpe_smtp_port: settings.sinpe_smtp_port ?? '587',
        sinpe_smtp_encryption: settings.sinpe_smtp_encryption ?? 'tls',
        sinpe_smtp_username: settings.sinpe_smtp_username ?? '',
        sinpe_smtp_password: '',
    });

    const testForm = useForm({
        phone: '',
    });

    const templateRef = useRef<HTMLTextAreaElement | null>(null);

    const insertPlaceholder = (placeholder: string) => {
        const el = templateRef.current;
        const current = String(form.data.reminder_template ?? '');

        if (!el) {
            const next = current ? `${current}${placeholder}` : placeholder;
            form.setData('reminder_template', next);
            return;
        }

        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? current.length;
        const next = `${current.slice(0, start)}${placeholder}${current.slice(end)}`;
        const caret = start + placeholder.length;

        form.setData('reminder_template', next);
        // Esperar a que React pinte el nuevo valor antes de restaurar cursor/foco
        queueMicrotask(() => {
            el.focus();
            el.setSelectionRange(caret, caret);
        });
    };

    const submit: React.FormEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault();
        form.post(route('settings.update'));
    };

    const sendTest = async () => {
        setTestResult(null);
        const phone = String(testForm.data.phone || '').trim();
        if (!phone) {
            setTestResult({ type: 'error', message: 'Ingresá un número para enviar la prueba.' });
            return;
        }

        testForm.setData('phone', phone);

        setTestSending(true);
        try {
            await testForm.post(route('settings.sendTestReminder'), {
                preserveScroll: true,
                onSuccess: () => {
                    setTestResult({ type: 'success', message: 'Prueba encolada. El bot la enviará en segundos.' });
                },
                onError: (errors: Record<string, unknown>) => {
                    const msg = (errors as any)?.phone ? String((errors as any).phone) : 'No se pudo encolar la prueba.';
                    setTestResult({ type: 'error', message: msg });
                },
            } as any);
        } finally {
            setTestSending(false);
        }
    };

    return (
        <ResponsiveLayout title="Configuración del sistema">
            <Head title="Configuración" />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Configuración del sistema</h1>
                                <p className="mt-2 text-gray-600">
                                    Administra la configuración general, correo, notificaciones y servicios del sistema.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={route('dashboard')}>
                                    <Button type="button" variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    <Card className="p-6">
                        <div className="mb-6 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 dark:border-cyan-900/40 dark:bg-cyan-900/15">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200 dark:bg-gray-800/80 dark:text-cyan-300 dark:ring-cyan-900/40">
                                        <Bell className="h-3.5 w-3.5" />
                                        Push del dispositivo
                                    </div>
                                    <p className="mt-2 text-sm text-cyan-900/80 dark:text-cyan-100/80">
                                        Configura Android o iPhone para que las notificaciones lleguen correctamente.
                                    </p>
                                </div>
                                <Button type="button" variant="outline" onClick={() => setActiveTab('notifications')} className="gap-2 border-cyan-200 bg-white/85 dark:border-cyan-900/40 dark:bg-gray-800/85">
                                    <Bell className="h-4 w-4" />
                                    Ver guía
                                </Button>
                            </div>
                        </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Activar notificaciones en la PWA</p>
                                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                En iPhone y Android instalados, presioná este botón para suscribir el navegador y empezar a recibir avisos.
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-start gap-2 sm:items-end">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={pushActivationBusy}
                                                onClick={async () => {
                                                    setPushActivationBusy(true);
                                                    setPushActivationStatus(null);
                                                    try {
                                                        const ok = await registerPushDeviceForApp({ force: true, webPublicKey: webPushPublicKey });
                                                        setPushActivationStatus(ok ? 'Notificaciones activadas en este navegador.' : 'No se pudieron activar las notificaciones.');
                                                    } catch (error) {
                                                        setPushActivationStatus('No se pudieron activar las notificaciones.');
                                                    } finally {
                                                        setPushActivationBusy(false);
                                                    }
                                                }}
                                                className="gap-2 border-cyan-200 bg-white/85 dark:border-cyan-900/40 dark:bg-gray-800/85"
                                            >
                                                <Bell className="h-4 w-4" />
                                                {pushActivationBusy ? 'Activando…' : 'Activar notificaciones'}
                                            </Button>
                                            {pushActivationStatus && (
                                                <p className="max-w-xs text-right text-xs text-gray-500 dark:text-gray-400">{pushActivationStatus}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                        <div className="border-b border-gray-200 pb-6 mb-6 dark:border-gray-700">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('general')}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                        activeTab === 'general'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    General
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('notifications')}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                        activeTab === 'notifications'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Notificaciones
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('mail')}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                        activeTab === 'mail'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Configuración de correo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('services')}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                        activeTab === 'services'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Servicios
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('logs')}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                        activeTab === 'logs'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Logs
                                </button>
                            </div>

  
                        </div>
                        {activeTab === 'notifications' && (
                            <div className="space-y-6 p-6">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-900/25 dark:text-cyan-300">
                                                <Bell className="h-3.5 w-3.5" />
                                                Guía de notificaciones push
                                            </div>
                                            <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
                                                Activa los avisos en Android o iPhone
                                            </h3>
                                            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                                                Si no te aparecen los avisos, revisa los permisos del dispositivo y abre la app instalada desde la pantalla de inicio.
                                            </p>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setPushGuide('android')}
                                                    className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition ${
                                                        pushGuide === 'android'
                                                            ? 'bg-cyan-600 text-white'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    Android
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPushGuide('ios')}
                                                    className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition ${
                                                        pushGuide === 'ios'
                                                            ? 'bg-cyan-600 text-white'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    iPhone
                                                </button>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl bg-cyan-50 px-4 py-3 text-sm text-cyan-900 dark:bg-cyan-900/20 dark:text-cyan-100">
                                            {pushGuide === 'android' ? (
                                                <ol className="space-y-2">
                                                    <li>1. Abre la app instalada en Android.</li>
                                                    <li>2. Acepta el permiso de notificaciones cuando aparezca.</li>
                                                    <li>3. Si no aparece el aviso, entra a Ajustes del sistema y habilita notificaciones para la app.</li>
                                                </ol>
                                            ) : (
                                                <ol className="space-y-2">
                                                    <li>1. Abre la app desde la pantalla de inicio de iPhone.</li>
                                                    <li>2. Permite las notificaciones cuando iPhone lo solicite.</li>
                                                    <li>3. Si no ves avisos, revisa Ajustes &gt; Notificaciones y actívalas para la app.</li>
                                                </ol>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Preferencias push</h3>
                                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Elegí qué avisos querés recibir en tu dispositivo.</p>
                                        </div>
                                    </div>
                                    <div className="max-w-2xl">
                                        <UpdatePushNotificationPreferencesForm preferences={pushNotificationPreferences} />
                                    </div>
                                </div>
                            </div>
                        )}



                        {activeTab === 'general' && (
                            <div className="p-6">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">General</h3>
                                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajustes generales del sistema.</p>
                                    </div>
                                </div>

                                <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la empresa</label>
                                <input
                                    value={form.data.company_name}
                                    onChange={(e) => form.setData('company_name', e.target.value)}
                                    placeholder="Ej: TecnoServicios Artavia"
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Este nombre se usará como remitente en los recordatorios enviados por WhatsApp.
                                </p>
                            </div>

                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <div className="mb-2">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Enviar recordatorio de prueba</h4>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Encola un recordatorio inmediato usando la <strong>plantilla global</strong> actual. Útil para probar sin usar tinker.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                        value={testForm.data.phone}
                                        onChange={(e) => testForm.setData('phone', e.target.value)}
                                        placeholder="Ej: 61784023 o 50661784023"
                                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={sendTest}
                                        disabled={testSending}
                                        className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-white font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                            testSending ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                                        }`}
                                    >
                                        {testSending ? 'Enviando…' : 'Enviar prueba'}
                                    </button>
                                </div>

                                {testResult && (
                                    <div
                                        className={`mt-3 rounded-md px-3 py-2 text-sm ${
                                            testResult.type === 'success'
                                                ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200'
                                                : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200'
                                        }`}
                                    >
                                        {testResult.message}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Plantilla global de recordatorio</label>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Personalizá el mensaje completo. Usá las variables para insertar datos como nombre del cliente, fecha y monto.
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                    {[
                                        { label: 'Cliente', key: '{client_name}' },
                                        { label: 'Empresa', key: '{company_name}' },
                                        { label: 'Vence', key: '{due_date}' },
                                        { label: 'Monto', key: '{amount}' },
                                        { label: 'Servicios', key: '{services}' },
                                        { label: 'Contrato', key: '{contract_name}' },
                                        { label: 'Sinpe', key: '{payment_contact}' },
                                        { label: 'Cuentas', key: '{bank_accounts}' },
                                        { label: 'Beneficiario', key: '{beneficiary_name}' },
                                    ].map((p) => (
                                        <button
                                            key={p.key}
                                            type="button"
                                            onClick={() => insertPlaceholder(p.key)}
                                            className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-200"
                                        >
                                            + {p.label}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    ref={templateRef}
                                    value={form.data.reminder_template}
                                    onChange={(e) => form.setData('reminder_template', e.target.value)}
                                    rows={10}
                                    placeholder={
                                        'Ejemplo:\n\n' +
                                        '{company_name}, le informa a {client_name} que:\n' +
                                        'Ha vencido el {due_date}\n' +
                                        'Servicios: {services}\n' +
                                        'Total: ₡{amount}\n\n' +
                                        'Sinpemóvil: {payment_contact}\n' +
                                        '{bank_accounts}\n' +
                                        'Todas a nombre de {beneficiary_name}\n\n' +
                                        'Si ya canceló, omita el mensaje'
                                    }
                                    className="mt-2 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    La plantilla es obligatoria: si está vacía, el bot no enviará recordatorios.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sinpemóvil / Contacto de pago</label>
                                <input
                                    value={form.data.payment_contact}
                                    onChange={(e) => form.setData('payment_contact', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Beneficiario (nombre)</label>
                                <input
                                    value={form.data.beneficiary_name}
                                    onChange={(e) => form.setData('beneficiary_name', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cuentas bancarias (separadas por nueva línea o ;) </label>
                                <textarea
                                    value={form.data.bank_accounts}
                                    onChange={(e) => form.setData('bank_accounts', e.target.value)}
                                    rows={6}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3">
                                <button type="submit" className="inline-flex items-center rounded-md bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 px-4 py-2 text-white font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Guardar</button>
                            </div>
                                </form>
                            </div>
                        )}

                        {activeTab === 'mail' && (
                            <div className="p-6">
                                <div className="mb-4">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Configuración de correo</h3>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        Configura IMAP/SMTP para leer correos SINPE y conciliar pagos automáticamente.
                                    </p>
                                </div>

                                <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                                    Esta sección usa configuración fija de DreamHost. IMAP es entrada y SMTP es salida. Solo debes ingresar correo y contraseña de aplicación.
                                </div>

                                {flash.mail_status && (
                                    <div
                                        className={`mb-4 rounded-md px-3 py-2 text-sm ${flash.mail_status.ok
                                            ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200'
                                            : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200'}`}
                                    >
                                        {String(flash.mail_status.message || '')}
                                    </div>
                                )}

                                <form onSubmit={submit} className="space-y-4">
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                            <input
                                                type="checkbox"
                                                checked={String(form.data.sinpe_auto_conciliation_enabled) === '1'}
                                                onChange={(e) => form.setData('sinpe_auto_conciliation_enabled', e.target.checked ? '1' : '0')}
                                                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500"
                                            />
                                            Habilitar conciliación automática desde correo
                                        </label>
                                    </div>

                                    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300">
                                        <div>IMAP: imap.dreamhost.com | Puerto 993 | SSL</div>
                                        <div>SMTP: smtp.dreamhost.com | Puerto 587 | TLS</div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Correo DreamHost</label>
                                            <input
                                                value={form.data.sinpe_imap_username}
                                                onChange={(e) => form.setData('sinpe_imap_username', e.target.value)}
                                                placeholder="correo@tudominio.com"
                                                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contraseña DreamHost</label>
                                            <input
                                                type="password"
                                                value={form.data.sinpe_imap_password}
                                                onChange={(e) => form.setData('sinpe_imap_password', e.target.value)}
                                                placeholder={String(settings.sinpe_imap_password_configured) === '1' ? 'Ya configurada (dejar vacío para no cambiar)' : 'Ingresar contraseña'}
                                                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Carpeta IMAP</label>
                                            <input
                                                value={form.data.sinpe_imap_folder}
                                                onChange={(e) => form.setData('sinpe_imap_folder', e.target.value)}
                                                placeholder="BCR"
                                                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                form.post(`${route('settings.update')}?_settings_section=mail`);
                                            }}
                                            className="inline-flex items-center rounded-md bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 px-4 py-2 text-white font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                        >
                                            Guardar y verificar conexión
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {activeTab === 'services' && (
                            <div className="p-6">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Servicios</h3>
                                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Servicios disponibles para seleccionar en contratos.</p>
                                    </div>
                                    <a
                                        href={route('settings.services.index')}
                                        className="inline-flex items-center rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-200"
                                    >
                                        Administrar servicios
                                    </a>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead>
                                            <tr className="text-left text-sm text-gray-600 dark:text-gray-300">
                                                <th className="py-2 pr-4">Nombre</th>
                                                <th className="py-2 pr-4">Monto</th>
                                                <th className="py-2 pr-4">Moneda</th>
                                                <th className="py-2">Activo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {services.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="py-6 text-sm text-gray-500">
                                                        No hay servicios configurados.
                                                    </td>
                                                </tr>
                                            ) : (
                                                services.map((s) => (
                                                    <tr key={s.id} className="text-sm">
                                                        <td className="py-2 pr-4">
                                                            <span className={!s.is_active ? 'text-gray-400 line-through' : ''}>{s.name}</span>
                                                        </td>
                                                        <td className="py-2 pr-4">{s.price}</td>
                                                        <td className="py-2 pr-4">{currencySymbol(s.currency)}</td>
                                                        <td className="py-2">{s.is_active ? 'Sí' : 'No'}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'logs' && (
                            <LogsTab
                                sources={logSources}
                                defaultSource={logDefaultSource}
                            />
                        )}
                    </Card>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
