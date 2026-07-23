import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';
import { Transition } from '@headlessui/react';
import { useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';

type PushPreferences = {
    daily_expected_payments: boolean;
    overdue_payments: boolean;
    platform_cost_due: boolean;
    conciliation_pending: boolean;
    whatsapp_manual_pause_events: boolean;
    whatsapp_help_requests: boolean;
    whatsapp_incoming_messages: boolean;
};

export default function UpdatePushNotificationPreferencesForm({
    preferences,
    className = '',
}: {
    preferences: PushPreferences;
    className?: string;
}) {
    const { data, setData, patch, errors, processing, recentlySuccessful } = useForm<PushPreferences>({
        daily_expected_payments: !!preferences.daily_expected_payments,
        overdue_payments: !!preferences.overdue_payments,
        platform_cost_due: !!preferences.platform_cost_due,
        conciliation_pending: !!preferences.conciliation_pending,
        whatsapp_manual_pause_events: !!preferences.whatsapp_manual_pause_events,
        whatsapp_help_requests: !!preferences.whatsapp_help_requests,
        whatsapp_incoming_messages: !!preferences.whatsapp_incoming_messages,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        patch(route('profile.push-notifications.update'), {
            preserveScroll: true,
        });
    };

    return (
        <section className={className}>
            <header>
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Notificaciones Push
                </h2>

                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Elegí qué alertas querés recibir en tu dispositivo.
                </p>
            </header>

            <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={data.daily_expected_payments}
                        onChange={(e) => setData('daily_expected_payments', e.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            Resumen diario de pagos esperados
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Cantidad y total de pagos esperados para hoy.
                        </span>
                    </span>
                </label>

                <label className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={data.overdue_payments}
                        onChange={(e) => setData('overdue_payments', e.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            Pagos vencidos
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Avisos cuando existan cobros pendientes fuera de fecha.
                        </span>
                    </span>
                </label>

                <label className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={data.platform_cost_due}
                        onChange={(e) => setData('platform_cost_due', e.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            Vencimiento de costo de plataforma
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Alertas del cobro mensual por servicio.
                        </span>
                    </span>
                </label>

                <label className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={data.conciliation_pending}
                        onChange={(e) => setData('conciliation_pending', e.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            Conciliaciones pendientes
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Recordatorios para revisar pagos sin conciliar.
                        </span>
                    </span>
                </label>

                <label className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={data.whatsapp_manual_pause_events}
                        onChange={(e) => setData('whatsapp_manual_pause_events', e.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            Eventos de pausa manual de WhatsApp
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Notifica cuando el bot entra o sale de pausa por atención manual.
                        </span>
                    </span>
                </label>

                <label className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={data.whatsapp_help_requests}
                        onChange={(e) => setData('whatsapp_help_requests', e.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            Solicitudes de ayuda de WhatsApp
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Notifica cuando un cliente escribe pidiendo asistencia o agente.
                        </span>
                    </span>
                </label>

                <label className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={data.whatsapp_incoming_messages}
                        onChange={(e) => setData('whatsapp_incoming_messages', e.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            Mensajes entrantes de WhatsApp
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Notifica cada mensaje nuevo que llegue a la app para que puedas responderlo al instante.
                        </span>
                    </span>
                </label>

                {Object.keys(errors).length > 0 && (
                    <InputError
                        className="mt-2"
                        message="No se pudieron guardar algunas preferencias. Revisá e intentá de nuevo."
                    />
                )}

                <div className="flex items-center gap-4 pt-2">
                    <PrimaryButton disabled={processing}>Guardar Preferencias</PrimaryButton>

                    <Transition
                        show={recentlySuccessful}
                        enter="transition ease-in-out"
                        enterFrom="opacity-0"
                        leave="transition ease-in-out"
                        leaveTo="opacity-0"
                    >
                        <p className="text-sm text-gray-600 dark:text-gray-400">Guardado.</p>
                    </Transition>
                </div>
            </form>
        </section>
    );
}
