import Pagination from '@/Components/Pagination';
import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

interface Conciliation {
    id: number;
    status: string;
    notes: string | null;
    verified_at: string | null;
    updated_at: string | null;
    payment: {
        id: number | null;
        amount: string | number | null;
        currency: string | null;
        status: string | null;
        reference: string | null;
        receipts_count: number | null;
        client: { id: number; name: string } | null;
        contract: { id: number; name: string } | null;
    } | null;
    reviewer: { id: number; name: string } | null;
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

type ConciliationsPageProps = PageProps<{
    conciliations: Paginated<Conciliation>;
    filters: {
        status?: string | null;
    };
    statuses: string[];
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

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatAmount = (amount: string | number | null, currency: string | null | undefined) => {
    if (amount === null) {
        return '—';
    }

    return new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
    }).format(typeof amount === 'string' ? Number.parseFloat(amount) : amount);
};

export default function ConciliationsIndex({ conciliations, filters, statuses }: ConciliationsPageProps) {
    const { data, setData } = useForm<{ status: string }>({
        status: filters.status ?? '',
    });

    const conciliationRows = conciliations?.data ?? [];
    const paginationLinks = conciliations?.links ?? [];
    const paginationMeta = conciliations?.meta ?? { from: 0, to: 0, total: 0 };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('conciliations.index'), { ...data }, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        setData('status', '');
        router.get(route('conciliations.index'), {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">
                        Conciliaciones
                    </h2>
                    <p className="text-sm text-gray-500">
                        Administra la verificación de pagos y registra observaciones de los comprobantes.
                    </p>
                </div>
            }
        >
            <Head title="Conciliaciones" />

            <div className="py-12">
                <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white shadow">
                        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                            <form onSubmit={submit} className="flex flex-col gap-4 md:flex-row md:items-end">
                                <div className="w-full md:w-60">
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
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Filtrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
                                            Conciliación
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Pago relacionado
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Cliente / Contrato
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Auditor
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Observaciones
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Actualización
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {conciliationRows.map((conciliation) => (
                                        <tr key={conciliation.id} className="hover:bg-gray-50">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                <div className="font-medium text-gray-900">
                                                    #{conciliation.id}
                                                </div>
                                                <StatusBadge status={conciliation.status} />
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                <div>
                                                    {conciliation.payment?.id ? `Pago #${conciliation.payment.id}` : '—'}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {formatAmount(conciliation.payment?.amount ?? null, conciliation.payment?.currency ?? null)}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Ref: {conciliation.payment?.reference ?? '—'}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Comprobantes: {conciliation.payment?.receipts_count ?? 0}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                <div>{conciliation.payment?.client?.name ?? 'Cliente eliminado'}</div>
                                                <div className="text-xs text-gray-500">
                                                    {conciliation.payment?.contract?.name ?? '—'}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                {conciliation.reviewer?.name ?? '—'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700">
                                                {conciliation.notes ? (
                                                    <p className="max-w-xs whitespace-pre-line text-sm text-gray-700">
                                                        {conciliation.notes}
                                                    </p>
                                                ) : (
                                                    <span className="text-gray-400">Sin notas</span>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                                <div>Actualizado: {formatDateTime(conciliation.updated_at)}</div>
                                                <div>Verificado: {formatDateTime(conciliation.verified_at)}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 pb-6">
                            <div className="text-sm text-gray-500">
                                Mostrando {paginationMeta.from ?? 0} - {paginationMeta.to ?? 0} de {paginationMeta.total} conciliaciones
                            </div>
                            <Pagination links={paginationLinks} />
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
