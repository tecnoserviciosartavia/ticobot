import { router } from '@inertiajs/react';
import { useEffect } from 'react';

type IntegrationStatus = 'pending' | 'ready' | 'disconnected';

export interface WhatsAppStatus {
    status: IntegrationStatus | string;
    qr: string | null;
    generated_at: string | null;
    last_ready_at: string | null;
    last_disconnected_at: string | null;
    last_disconnect_reason: string | null;
}

interface WhatsAppConnectionCardProps {
    data: WhatsAppStatus;
    className?: string;
}

const formatDateTime = (value: string | null) => {
    if (!value) {
        return '—';
    }

    try {
        const d = new Date(value);
        const date = d.toLocaleDateString('es-CR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'America/Costa_Rica',
        });
        const time = d.toLocaleTimeString('es-CR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Costa_Rica',
        });

        return `${date}, ${time}`;
    } catch (error) {
        return value;
    }
};

const statusLabel: Record<IntegrationStatus, string> = {
    pending: 'Esperando sincronización',
    ready: 'Sincronizado',
    disconnected: 'Desconectado',
};

export default function WhatsAppConnectionCard({ data, className }: WhatsAppConnectionCardProps) {
    useEffect(() => {
        if (data.status === 'pending') {
            const interval = window.setInterval(() => {
                router.reload({
                    only: ['whatsapp'],
                });
            }, 5000);

            return () => window.clearInterval(interval);
        }

        return undefined;
    }, [data.status]);

    const refresh = () => {
        router.reload({
            only: ['whatsapp'],
        });
    };

    const status = (statusLabel[data.status as IntegrationStatus] ?? 'Estado desconocido');

    return (
        <div className={`space-y-4 ${className ?? ''}`}>
            <div>
                <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-gray-100">Integración de WhatsApp</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Escanea el código QR con el dispositivo autorizado para vincular la cuenta de WhatsApp Business.
                    El código se renueva de forma periódica y desaparecerá automáticamente cuando la sesión esté activa.
                </p>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-4 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">Estado:</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                        {status}
                    </span>
                </div>

                <dl className="mt-3 space-y-2">
                    {data.generated_at && (
                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500 dark:text-gray-400">Último QR generado</dt>
                            <dd className="text-gray-900 dark:text-gray-100">{formatDateTime(data.generated_at)}</dd>
                        </div>
                    )}
                    {data.last_ready_at && (
                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500 dark:text-gray-400">Última conexión exitosa</dt>
                            <dd className="text-gray-900 dark:text-gray-100">{formatDateTime(data.last_ready_at)}</dd>
                        </div>
                    )}
                    {data.last_disconnect_reason && (
                        <div className="flex items-start justify-between gap-4">
                            <dt className="text-gray-500 dark:text-gray-400">Último error</dt>
                            <dd className="text-right text-gray-900 dark:text-gray-100">{data.last_disconnect_reason}</dd>
                        </div>
                    )}
                    {data.last_disconnected_at && (
                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500 dark:text-gray-400">Desconectado por última vez</dt>
                            <dd className="text-gray-900 dark:text-gray-100">{formatDateTime(data.last_disconnected_at)}</dd>
                        </div>
                    )}
                </dl>
            </div>

            {data.status === 'pending' && data.qr && (
                <div className="space-y-3 text-center">
                    <img
                        src={data.qr}
                        alt="Código QR para vincular WhatsApp"
                        className="mx-auto h-64 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow"
                    />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Abre WhatsApp &gt; Menú &gt; Dispositivos vinculados &gt; Vincular dispositivo.
                    </p>
                </div>
            )}

            {data.status === 'disconnected' && (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    En cuanto el bot vuelva a solicitar un inicio de sesión se mostrará un nuevo código QR aquí.
                </p>
            )}

            {data.status === 'ready' && (
                <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                    La sesión de WhatsApp está activa. Si deseas vincular un nuevo dispositivo, primero desconecta la sesión desde WhatsApp.
                </p>
            )}

            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={refresh}
                    className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    Actualizar estado
                </button>
            </div>
        </div>
    );
}
