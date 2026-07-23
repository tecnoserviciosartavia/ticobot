import StatusBadge from '@/Components/StatusBadge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { labelForChannel } from '@/lib/labels';
import { Send, RefreshCw } from '@/Components/icons';
import { useState } from 'react';

interface ReminderShowProps extends PageProps<{
    reminder: {
        id: number;
        client: { id: number; name: string; phone: string | null } | null;
        contract: { id: number; name: string } | null;
        channel: string;
        status: string;
        scheduled_for: string | null;
        sent_at: string | null;
        acknowledged_at: string | null;
        payload: Record<string, unknown> | null;
        response_payload: Record<string, unknown> | null;
    };
    messages: Array<{
        id: number;
        direction: string;
        message_type: string;
        content: string | null;
        sent_at: string | null;
        attachment: { path: string; url: string } | null;
    }>;
    payments: Array<{
        id: number;
        amount: string;
        currency: string | null;
        status: string;
        reference: string | null;
        paid_at: string | null;
    }>;
}> {}

const formatDateTime = (value: string | null) => {
    if (!value) {
        return '—';
    }

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
};

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatCurrency = (amount: string, currency: string | null | undefined) => {
    const parsed = Number.parseFloat(amount);
    if (Number.isNaN(parsed)) {
        return amount;
    }

    return new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
    }).format(parsed);
};

export default function RemindersShow({ reminder, messages, payments }: ReminderShowProps) {
    const [sendingId, setSendingId] = useState<number | null>(null);
    const canManualSend = reminder.channel === 'whatsapp' && ['pending', 'failed'].includes(reminder.status);

    const handleManualSend = () => {
        setSendingId(reminder.id);
        router.post(route('reminders.send-manually', reminder.id), {}, {
            preserveScroll: true,
            onFinish: () => setSendingId(null),
        });
    };

    return (
        <ResponsiveLayout title={`Recordatorio #${reminder.id}`}>
            <Head title={`Recordatorio ${reminder.id}`} />

            <div className="py-12">
                <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:px-8">
                    <section className="grid grid-cols-1 gap-6 rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50 md:grid-cols-3">
                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Cliente</h3>
                            <p className="mt-1 text-base text-gray-800 dark:text-gray-100">{reminder.client?.name ?? 'Cliente eliminado'}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{reminder.client?.phone ?? 'Sin teléfono'}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Contrato</h3>
                            <p className="mt-1 text-base text-gray-800 dark:text-gray-100">{reminder.contract?.name ?? 'No asociado'}</p>
                            {reminder.contract && (
                                <Link
                                    href={route('contracts.show', reminder.contract.id)}
                                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                    Ver contrato
                                </Link>
                            )}
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tiempos</h3>
                            <dl className="mt-1 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                                <div>
                                    <dt className="font-medium text-gray-500 dark:text-gray-400">Programado</dt>
                                    <dd>{formatDateTime(reminder.scheduled_for)}</dd>
                                </div>
                                <div>
                                    <dt className="font-medium text-gray-500 dark:text-gray-400">Enviado</dt>
                                    <dd>{formatDateTime(reminder.sent_at)}</dd>
                                </div>
                                <div>
                                    <dt className="font-medium text-gray-500 dark:text-gray-400">Confirmado</dt>
                                    <dd>{formatDateTime(reminder.acknowledged_at)}</dd>
                                </div>
                            </dl>
                        </div>
                    </section>

                    <section className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Detalle del mensaje</h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">{labelForChannel(reminder.channel)}</span>
                                {canManualSend && (
                                    <button
                                        type="button"
                                        onClick={handleManualSend}
                                        disabled={sendingId === reminder.id}
                                        className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-900/40 dark:bg-cyan-900/20 dark:text-cyan-300"
                                    >
                                        <Send className="h-4 w-4" />
                                        {sendingId === reminder.id ? 'Enviando...' : 'Enviar manualmente'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                            <article>
                                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Payload enviado</h4>
                                <pre className="mt-2 overflow-auto rounded-md bg-gray-50 dark:bg-gray-700/50 p-3 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                                    {reminder.payload && Object.keys(reminder.payload).length > 0 
                                        ? JSON.stringify(reminder.payload, null, 2)
                                        : '// Sin datos de payload'}
                                </pre>
                            </article>
                            <article>
                                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Respuesta recibida</h4>
                                <pre className="mt-2 overflow-auto rounded-md bg-gray-50 dark:bg-gray-700/50 p-3 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                                    {reminder.response_payload && Object.keys(reminder.response_payload).length > 0
                                        ? JSON.stringify(reminder.response_payload, null, 2)
                                        : '// Sin respuesta recibida'}
                                </pre>
                            </article>
                        </div>
                    </section>

                    <section className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Mensajes recientes</h3>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Máximo 20 últimos eventos</span>
                        </div>
                        <ul className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                            {messages.length === 0 && (
                                <li className="rounded-md border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center text-gray-500 dark:text-gray-400">
                                    Aún no hay mensajes asociados a este recordatorio.
                                </li>
                            )}
                            {messages.map((message) => (
                                <li
                                    key={message.id}
                                    className="rounded-md border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 p-4"
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                                        <span className="font-semibold text-gray-800 dark:text-gray-100">
                                            {formatDateTime(message.sent_at)} · {message.direction ? message.direction.toUpperCase() : 'N/D'}
                                        </span>
                                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-indigo-600">
                                            {message.message_type}
                                        </span>
                                    </div>
                                    {message.content && (
                                        <p className="mt-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{message.content}</p>
                                    )}
                                    {message.attachment && (
                                        <a
                                            href={message.attachment.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                        >
                                            Ver adjunto
                                        </a>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Pagos relacionados</h3>
                            <Link
                                href={route('payments.index', { reminder_id: reminder.id })}
                                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
                            >
                                Ver en módulo de pagos
                            </Link>
                        </div>
                        <div className="mt-4 space-y-3 md:hidden">
                            {payments.length === 0 && (
                                <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                    Sin pagos vinculados a este recordatorio.
                                </div>
                            )}
                            {payments.map((payment) => (
                                <div key={payment.id} className="rounded-lg border border-gray-100 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-800">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-medium text-gray-800 dark:text-gray-100">#{payment.id}</div>
                                            <div className="text-sm text-gray-700 dark:text-gray-300">{formatCurrency(payment.amount, payment.currency)}</div>
                                        </div>
                                        <StatusBadge status={payment.status} />
                                    </div>
                                    <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                        <div>Referencia: {payment.reference ?? '—'}</div>
                                        <div>Pagado: {formatDateTime(payment.paid_at)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 hidden overflow-hidden rounded-lg border border-gray-100 dark:border-gray-700 md:block">
                            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">ID</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Monto</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Estado</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Referencia</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Pagado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                    {payments.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                                            >
                                                Sin pagos vinculados a este recordatorio.
                                            </td>
                                        </tr>
                                    )}
                                    {payments.map((payment) => (
                                        <tr key={payment.id} className="bg-white dark:bg-gray-800">
                                            <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-100">#{payment.id}</td>
                                            <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                                                {formatCurrency(payment.amount, payment.currency)}
                                            </td>
                                            <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                                                <StatusBadge status={payment.status} />
                                            </td>
                                            <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{payment.reference ?? '—'}</td>
                                            <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{formatDateTime(payment.paid_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
