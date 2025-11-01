import Pagination from '@/Components/Pagination';
import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

interface Payment {
    id: number;
    status: string;
    channel: string;
    amount: string | number;
    currency: string | null;
    reference: string | null;
    paid_at: string | null;
    receipts_count: number;
    client: { id: number; name: string } | null;
    contract: { id: number; name: string } | null;
    reminder: { id: number; status: string } | null;
    created_at: string | null;
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

type PaymentsPageProps = PageProps<{
    payments: Paginated<Payment>;
    filters: {
        status?: string | null;
        channel?: string | null;
        paid_from?: string | null;
        paid_to?: string | null;
    };
    statuses: string[];
    channels: string[];
}>;

const formatDate = (value: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleDateString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatAmount = (amount: string | number, currency: string | null | undefined) =>
    new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
        minimumFractionDigits: 2,
    }).format(typeof amount === 'string' ? Number.parseFloat(amount) : amount);

export default function PaymentsIndex({ payments, filters, statuses, channels }: PaymentsPageProps) {
    const { data, setData } = useForm<{
        status: string;
        channel: string;
        paid_from: string;
        paid_to: string;
    }>({
        status: filters.status ?? '',
        channel: filters.channel ?? '',
        paid_from: filters.paid_from ?? '',
        paid_to: filters.paid_to ?? '',
    });

    const paymentRows = payments?.data ?? [];
    const paginationLinks = payments?.links ?? [];
    const paginationMeta = payments?.meta ?? { from: 0, to: 0, total: 0 };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('payments.index'), { ...data }, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        setData('status', '');
        setData('channel', '');
        setData('paid_from', '');
        setData('paid_to', '');
        router.get(route('payments.index'), {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">
                        Pagos
                    </h2>
                    <p className="text-sm text-gray-500">
                        Controla los pagos recibidos, su verificación y los comprobantes asociados.
                    </p>
                </div>
            }
        >
            <Head title="Pagos" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-6 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white shadow">
                        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                            <form
                                onSubmit={submit}
                                className="grid grid-cols-1 gap-4 md:grid-cols-5 md:items-end"
                            >
                                <div>
                                    <label
                                        htmlFor="status"
                                        className="block text-sm font-medium text-gray-700"
                                    >
                                        Estado
                                    </label>
                                    <select
                                        id="status"
                                        name="status"
                                        value={data.status}
                                        onChange={(event) => setData('status', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                                        htmlFor="channel"
                                        className="block text-sm font-medium text-gray-700"
                                    >
                                        Canal
                                    </label>
                                    <select
                                        id="channel"
                                        name="channel"
                                        value={data.channel}
                                        onChange={(event) => setData('channel', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                                        htmlFor="paid_from"
                                        className="block text-sm font-medium text-gray-700"
                                    >
                                        Pagado desde
                                    </label>
                                    <input
                                        id="paid_from"
                                        name="paid_from"
                                        type="date"
                                        value={data.paid_from}
                                        onChange={(event) => setData('paid_from', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="paid_to"
                                        className="block text-sm font-medium text-gray-700"
                                    >
                                        Pagado hasta
                                    </label>
                                    <input
                                        id="paid_to"
                                        name="paid_to"
                                        type="date"
                                        value={data.paid_to}
                                        onChange={(event) => setData('paid_to', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Filtrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Pago
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Contrato
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Canal
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Comprobantes
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Fechas
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {paymentRows.map((payment) => (
                                        <tr key={payment.id} className="hover:bg-gray-50">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                <div className="font-medium text-gray-900">
                                                    {formatAmount(payment.amount, payment.currency)}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Ref: {payment.reference ?? '—'}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                {payment.client?.name ?? 'Cliente eliminado'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                {payment.contract?.name ?? '—'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                {payment.channel}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <StatusBadge status={payment.status} />
                                                    {payment.reminder && (
                                                        <span className="text-xs text-gray-500">
                                                            Recordatorio #{payment.reminder.id}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700">
                                                {payment.receipts_count}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                                <div>Pagado: {formatDate(payment.paid_at)}</div>
                                                <div>Registrado: {formatDate(payment.created_at)}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 pb-6">
                            <div className="text-sm text-gray-500">
                                Mostrando {paginationMeta.from ?? 0} - {paginationMeta.to ?? 0} de {paginationMeta.total} pagos
                            </div>
                            <Pagination links={paginationLinks} />
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
