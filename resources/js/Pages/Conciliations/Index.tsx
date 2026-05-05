import Pagination from '@/Components/Pagination';
import StatusBadge from '@/Components/StatusBadge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { labelForStatus } from '@/lib/labels';
import { FormEvent } from 'react';
import { Button } from '@/Components/button';
import { CheckCircle, XCircle } from '@/Components/icons';

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

function ConciliationActions({ conciliation }: { conciliation: Conciliation }) {
    if (conciliation.status === 'pending' || conciliation.status === 'in_review') {
        return (
            <div className="flex flex-wrap justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        router.patch(`/conciliations/${conciliation.id}`, {
                            status: 'approved',
                            verified_at: new Date().toISOString(),
                        })
                    }
                >
                    <CheckCircle className="mr-1 h-4 w-4" />
                    Aprobar
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        router.patch(`/conciliations/${conciliation.id}`, {
                            status: 'rejected',
                        })
                    }
                >
                    <XCircle className="mr-1 h-4 w-4" />
                    Rechazar
                </Button>
            </div>
        );
    }

    return (
        <span className="text-sm text-gray-400 dark:text-gray-500">
            {conciliation.status === 'approved'
                ? 'Aprobada'
                : conciliation.status === 'rejected'
                  ? 'Rechazada'
                  : 'Desconocido'}
        </span>
    );
}

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
        <ResponsiveLayout title="Conciliaciones" contentWidth="full">
            <Head title="Conciliaciones" />

            <div className="w-full pb-6 pt-2">
                <div className="w-full space-y-4">

                    <div className="overflow-hidden rounded-lg bg-white shadow-lg dark:bg-gray-800 dark:shadow-gray-900/50">
                        <div className="border-b border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-700/50 sm:px-6">
                            <form onSubmit={submit} className="flex flex-col gap-4 md:flex-row md:items-end">
                                <div className="w-full md:w-60">
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
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
                                    >
                                        <option value="">Todos</option>
                                        {statuses.map((statusOption) => (
                                            <option key={statusOption} value={statusOption}>
                                                {labelForStatus(statusOption)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="submit"
                                        className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Filtrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Móvil: tarjetas */}
                        <div className="space-y-3 p-4 md:hidden">
                            {conciliationRows.length === 0 ? (
                                <div className="rounded-lg border border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
                                    No hay conciliaciones con los filtros seleccionados.
                                </div>
                            ) : (
                                conciliationRows.map((conciliation) => (
                                    <article
                                        key={conciliation.id}
                                        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                                    >
                                        <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-700">
                                            <div>
                                                <div className="font-semibold text-gray-900 dark:text-gray-100">
                                                    #{conciliation.id}
                                                </div>
                                                <div className="mt-1">
                                                    <StatusBadge status={conciliation.status} />
                                                </div>
                                            </div>
                                        </div>

                                        <dl className="mt-3 space-y-3 text-sm">
                                            <div>
                                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    Pago relacionado
                                                </dt>
                                                <dd className="mt-1 text-gray-900 dark:text-gray-100">
                                                    {conciliation.payment?.id ? `Pago #${conciliation.payment.id}` : '—'}
                                                    <div className="font-mono text-xs text-gray-600 dark:text-gray-300">
                                                        {formatAmount(conciliation.payment?.amount ?? null, conciliation.payment?.currency ?? null)}
                                                    </div>
                                                    <div className="break-all text-xs text-gray-500 dark:text-gray-400">
                                                        Ref: {conciliation.payment?.reference ?? '—'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        Comprobantes: {conciliation.payment?.receipts_count ?? 0}
                                                    </div>
                                                </dd>
                                            </div>

                                            <div>
                                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    Cliente / Contrato
                                                </dt>
                                                <dd className="mt-1 text-gray-900 dark:text-gray-100">
                                                    {conciliation.payment?.client?.name ?? 'Cliente eliminado'}
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {conciliation.payment?.contract?.name ?? '—'}
                                                    </div>
                                                </dd>
                                            </div>

                                            <div>
                                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    Auditor
                                                </dt>
                                                <dd className="mt-1 text-gray-900 dark:text-gray-100">
                                                    {conciliation.reviewer?.name ?? '—'}
                                                </dd>
                                            </div>

                                            <div>
                                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    Observaciones
                                                </dt>
                                                <dd className="mt-1 whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
                                                    {conciliation.notes ?? (
                                                        <span className="text-gray-400 dark:text-gray-500">Sin notas</span>
                                                    )}
                                                </dd>
                                            </div>

                                            <div>
                                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                    Fechas
                                                </dt>
                                                <dd className="mt-1 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                                                    <div>Actualizado: {formatDateTime(conciliation.updated_at)}</div>
                                                    <div>Verificado: {formatDateTime(conciliation.verified_at)}</div>
                                                </dd>
                                            </div>
                                        </dl>

                                        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                                            <ConciliationActions conciliation={conciliation} />
                                        </div>
                                    </article>
                                ))
                            )}
                        </div>

                        {/* Escritorio / tablet: tabla a ancho completo */}
                        <div className="hidden overflow-x-auto md:block">
                            <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="w-[100px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:px-4">
                                            Conciliación
                                        </th>
                                        <th className="w-[220px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:w-[260px] lg:px-4">
                                            Pago relacionado
                                        </th>
                                        <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:px-4">
                                            Cliente / Contrato
                                        </th>
                                        <th className="w-[110px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:px-4">
                                            Auditor
                                        </th>
                                        <th className="min-w-[180px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:px-4">
                                            Observaciones
                                        </th>
                                        <th className="w-[170px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 xl:w-[200px] lg:px-4">
                                            Actualización
                                        </th>
                                        <th className="w-[160px] px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:px-4">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                    {conciliationRows.map((conciliation) => (
                                        <tr
                                            key={conciliation.id}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/40"
                                        >
                                            <td className="px-3 py-4 align-top text-sm text-gray-700 dark:text-gray-300 lg:px-4">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    #{conciliation.id}
                                                </div>
                                                <StatusBadge status={conciliation.status} />
                                            </td>
                                            <td className="px-3 py-4 align-top text-sm text-gray-700 dark:text-gray-300 lg:px-4">
                                                <div>
                                                    {conciliation.payment?.id ? `Pago #${conciliation.payment.id}` : '—'}
                                                </div>
                                                <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                    {formatAmount(conciliation.payment?.amount ?? null, conciliation.payment?.currency ?? null)}
                                                </div>
                                                <div className="break-all text-xs leading-snug text-gray-500 dark:text-gray-400">
                                                    Ref: {conciliation.payment?.reference ?? '—'}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    Comprobantes: {conciliation.payment?.receipts_count ?? 0}
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 align-top text-sm text-gray-700 dark:text-gray-300 lg:px-4">
                                                <div className="break-words">{conciliation.payment?.client?.name ?? 'Cliente eliminado'}</div>
                                                <div className="break-words text-xs text-gray-500 dark:text-gray-400">
                                                    {conciliation.payment?.contract?.name ?? '—'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 align-top text-sm text-gray-700 dark:text-gray-300 lg:px-4">
                                                <span className="break-words">{conciliation.reviewer?.name ?? '—'}</span>
                                            </td>
                                            <td className="px-3 py-4 align-top text-sm text-gray-700 dark:text-gray-300 lg:px-4">
                                                {conciliation.notes ? (
                                                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">
                                                        {conciliation.notes}
                                                    </p>
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500">Sin notas</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-4 align-top text-xs text-gray-500 dark:text-gray-400 lg:px-4">
                                                <div>Act.: {formatDateTime(conciliation.updated_at)}</div>
                                                <div>Verif.: {formatDateTime(conciliation.verified_at)}</div>
                                            </td>
                                            <td className="px-3 py-4 align-top text-right text-sm font-medium lg:px-4">
                                                <ConciliationActions conciliation={conciliation} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {conciliationRows.length === 0 && (
                                <div className="border-t border-gray-200 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                    No hay conciliaciones con los filtros seleccionados.
                                </div>
                            )}
                        </div>

                        <div className="border-t border-gray-200 px-4 pb-6 pt-4 dark:border-gray-700 sm:px-6">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Mostrando {paginationMeta.from ?? 0} - {paginationMeta.to ?? 0} de {paginationMeta.total}{' '}
                                conciliaciones
                            </div>
                            <Pagination links={paginationLinks} />
                        </div>
                    </div>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
