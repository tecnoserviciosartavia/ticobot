import Pagination from '@/Components/Pagination';
import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

interface Reminder {
    id: number;
    status: string;
    channel: string;
    scheduled_for: string | null;
    sent_at: string | null;
    acknowledged_at: string | null;
    attempts: number;
    messages_count: number;
    client: { id: number; name: string; phone: string | null } | null;
    contract: { id: number; name: string; amount: string; currency: string } | null;
}

interface Paginated<T> {
    data: T[];
    links: Array<{ url: string | null; label: string; active: boolean }>;
    meta: {
        from: number | null;
        to: number | null;
        total: number;
    };
}

type RemindersPageProps = PageProps<{
    reminders: Paginated<Reminder>;
    filters: {
        status?: string | null;
        channel?: string | null;
        recurrence?: string | null;
        client_id?: number | null;
        contract_id?: number | null;
        scheduled_from?: string | null;
        scheduled_to?: string | null;
    };
    statuses: string[];
    channels: string[];
    clients: Array<{ id: number; name: string }>;
    contracts: Array<{ id: number; name: string; client_id?: number | null }>;
    recurrences: string[];
}>;

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

export default function RemindersIndex({ reminders, filters, statuses, channels, clients, contracts, recurrences }: RemindersPageProps) {
    const { data, setData } = useForm<{
        status: string;
        channel: string;
        recurrence: string;
        client_id: string;
        contract_id: string;
        scheduled_from: string;
        scheduled_to: string;
    }>({
        status: filters.status ?? '',
        channel: filters.channel ?? '',
        recurrence: filters.recurrence ?? '',
        client_id: filters.client_id ? String(filters.client_id) : '',
        contract_id: filters.contract_id ? String(filters.contract_id) : '',
        scheduled_from: filters.scheduled_from ?? '',
        scheduled_to: filters.scheduled_to ?? '',
    });

    const contractOptions = data.client_id
        ? contracts.filter((contract) => String(contract.client_id ?? '') === data.client_id)
        : contracts;

    const reminderRows = reminders?.data ?? [];
    const paginationLinks = reminders?.links ?? [];
    const paginationMeta = reminders?.meta ?? { from: 0, to: 0, total: 0 };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('reminders.index'), { ...data }, {
            preserveScroll: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        setData('status', '');
        setData('channel', '');
        setData('recurrence', '');
        setData('client_id', '');
        setData('contract_id', '');
        setData('scheduled_from', '');
        setData('scheduled_to', '');
        router.get(route('reminders.index'), {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">
                        Recordatorios
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Revisa el estado de los recordatorios programados y su seguimiento.
                    </p>
                </div>
            }
        >
            <Head title="Recordatorios" />
            <div className="py-12">
                <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-gray-800 dark:bg-gray-800 shadow-lg dark:shadow-gray-900/50">
                        <div className="flex flex-col gap-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-6 py-4 md:flex-row md:items-center md:justify-between">
                            <form
                                onSubmit={submit}
                                className="grid w-full grid-cols-1 gap-4 md:grid-cols-7 md:items-end"
                            >
                                <div>
                                    <label
                                        htmlFor="status"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Estado
                                    </label>
                                    <select
                                        id="status"
                                        name="status"
                                        value={data.status}
                                        onChange={(event) => setData('status', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {statuses.map((statusOption) => (
                                            <option key={statusOption} value={statusOption}>
                                                {statusOption.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="recurrence"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Recurrencia
                                    </label>
                                    <select
                                        id="recurrence"
                                        name="recurrence"
                                        value={data.recurrence}
                                        onChange={(event) => setData('recurrence', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {(recurrences ?? ['weekly', 'biweekly', 'monthly', 'one_time']).map((r) => (
                                            <option key={r} value={r}>
                                                {r === 'weekly' ? 'Semanal' : r === 'biweekly' ? 'Quincenal' : r === 'monthly' ? 'Mensual' : 'Un solo pago'}
                                            </option>
                                        ))}
                                    </select>
                                </div>


                                <div>
                                    <label
                                        htmlFor="channel"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Canal
                                    </label>
                                    <select
                                        id="channel"
                                        name="channel"
                                        value={data.channel}
                                        onChange={(event) => setData('channel', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {channels.map((channelOption) => (
                                            <option key={channelOption} value={channelOption}>
                                                {channelOption.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="client_id"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Cliente
                                    </label>
                                    <select
                                        id="client_id"
                                        name="client_id"
                                        value={data.client_id}
                                        onChange={(event) => {
                                            setData('client_id', event.target.value);
                                            setData('contract_id', '');
                                        }}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {clients.map((client) => (
                                            <option key={client.id} value={client.id}>
                                                {client.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="contract_id"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Contrato
                                    </label>
                                    <select
                                        id="contract_id"
                                        name="contract_id"
                                        value={data.contract_id}
                                        onChange={(event) => setData('contract_id', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {contractOptions.map((contract) => (
                                            <option key={contract.id} value={contract.id}>
                                                {contract.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="scheduled_from"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Programado desde
                                    </label>
                                    <input
                                        id="scheduled_from"
                                        name="scheduled_from"
                                        type="date"
                                        value={data.scheduled_from}
                                        onChange={(event) => setData('scheduled_from', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="scheduled_to"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Programado hasta
                                    </label>
                                    <input
                                        id="scheduled_to"
                                        name="scheduled_to"
                                        type="date"
                                        value={data.scheduled_to}
                                        onChange={(event) => setData('scheduled_to', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>

                                    <div className="flex gap-2 md:col-span-7">
                                    <button
                                        type="submit"
                                        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 md:w-auto"
                                    >
                                        Filtrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 md:w-auto"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </form>

                            <Link
                                href={route('reminders.create')}
                                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                                Nuevo recordatorio
                            </Link>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Programación
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Contrato
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Recurrencia
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Canal
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Intentos
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Mensajes
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Último evento
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white dark:bg-gray-800">
                                    {reminderRows.map((reminder) => (
                                        <tr key={reminder.id} className="hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    {formatDateTime(reminder.scheduled_for)}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    Enviado: {formatDateTime(reminder.sent_at)}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    {reminder.client?.name ?? 'Cliente eliminado'}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {reminder.client?.phone ?? 'Sin teléfono'}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                <div>{reminder.contract?.name ?? '—'}</div>
                                                {reminder.contract?.amount && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {new Intl.NumberFormat('es-CR', {
                                                            style: 'currency',
                                                            currency: reminder.contract.currency ?? 'CRC',
                                                        }).format(Number.parseFloat(reminder.contract.amount))}
                                                    </div>
                                                )}
                                            </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                    {(() => {
                                                        const r: string | null | undefined = (reminder as any).recurrence;
                                                        if (!r) return '—';
                                                        return r === 'weekly' ? 'Semanal' : r === 'biweekly' ? 'Quincenal' : r === 'monthly' ? 'Mensual' : r === 'one_time' ? 'Un solo pago' : r;
                                                    })()}
                                                </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                {reminder.channel}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4">
                                                <StatusBadge status={reminder.status} />
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700 dark:text-gray-300">
                                                {reminder.attempts}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700 dark:text-gray-300">
                                                {reminder.messages_count}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                {reminder.acknowledged_at
                                                    ? `Respuesta: ${formatDateTime(reminder.acknowledged_at)}`
                                                    : 'Sin respuesta'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                                <Link
                                                    href={route('reminders.show', reminder.id)}
                                                    className="text-indigo-600 hover:text-indigo-500"
                                                >
                                                    Ver detalle
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 pb-6">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Mostrando {paginationMeta.from ?? 0} - {paginationMeta.to ?? 0} de {paginationMeta.total} recordatorios
                            </div>
                            <Pagination links={paginationLinks} />
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
