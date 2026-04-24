import Pagination from '@/Components/Pagination';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent, useState } from 'react';
import { labelForBillingCycle } from '@/lib/labels';

interface ContractSummary {
    id: number;
    name: string;
    amount: string;
    currency: string | null;
    billing_cycle: string;
    next_due_date: string | null;
    client: { id: number; name: string } | null;
    reminders_count: number;
    payments_count: number;
    updated_at: string | null;
}

interface Paginated<T> {
    data: T[];
    links: Array<{ url: string | null; label: string; active: boolean }>;
    meta: { from: number | null; to: number | null; total: number };
}

interface ContractsPageProps extends PageProps<{
    contracts: Paginated<ContractSummary>;
    filters: { client_query?: string | null; client_id?: number | null; billing_cycle: string | null };
    billingCycles: string[];
}> {}

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatCurrency = (amount: string, currency: string | null | undefined) =>
    new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
        minimumFractionDigits: 2,
    }).format(Number.parseFloat(amount));

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

export default function ContractsIndex({ contracts, filters, billingCycles }: ContractsPageProps) {
    const initialClientQuery =
        (typeof filters.client_query === 'string' ? filters.client_query : '') ||
        (typeof filters.client_id === 'number' && Number.isFinite(filters.client_id) ? String(filters.client_id) : '');

    const { data, setData } = useForm({
        client_query: initialClientQuery,
        billing_cycle: filters.billing_cycle ?? '',
    });
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const contractRows = contracts?.data ?? [];
    const paginationLinks = contracts?.links ?? [];
    const paginationMeta = contracts?.meta ?? { from: 0, to: 0, total: 0 };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('contracts.index'), { ...data }, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const reset = () => {
        setData('client_query', '');
        setData('billing_cycle', '');
        router.get(route('contracts.index'), {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">Contratos</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Controla los contratos activos, ciclos de facturación y vencimientos próximos.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Link
                            href={route('contracts.import')}
                            className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-gray-800 dark:bg-indigo-900/30"
                        >
                            Importar
                        </Link>
                        <Link
                            href={route('contracts.create')}
                            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        >
                            Nuevo contrato
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title="Contratos" />

            <div className="py-12">
                <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-gray-800 dark:bg-gray-800 shadow-lg dark:shadow-gray-900/50">
                        <div className="border-b border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-700/50 sm:px-6">
                            <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Filtros</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{paginationMeta.total} contrato(s)</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowMobileFilters((value) => !value)}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-gray-600 dark:text-gray-300"
                                >
                                    {showMobileFilters ? 'Ocultar' : 'Mostrar'}
                                </button>
                            </div>
                            <form onSubmit={submit} className={`${showMobileFilters ? 'flex' : 'hidden'} flex-col gap-4 md:flex md:flex-row md:items-end`}>
                                <div className="w-full md:w-96">
                                    <label htmlFor="client_query" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Cliente
                                    </label>
                                    <input
                                        id="client_query"
                                        name="client_query"
                                        type="text"
                                        value={data.client_query}
                                        onChange={(event) => setData('client_query', event.target.value)}
                                        placeholder="Escribe el nombre del cliente"
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>
                                <div className="w-full md:w-64">
                                    <label htmlFor="billing_cycle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Ciclo
                                    </label>
                                    <select
                                        id="billing_cycle"
                                        name="billing_cycle"
                                        value={data.billing_cycle}
                                        onChange={(event) => setData('billing_cycle', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {billingCycles.map((cycle) => (
                                            <option key={cycle} value={cycle}>
                                                {labelForBillingCycle(cycle)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="submit"
                                        className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Filtrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={reset}
                                        className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="space-y-3 p-4 md:hidden">
                            {contractRows.map((contract) => (
                                <div key={contract.id} className="rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-700">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <Link href={route('contracts.show', contract.id)} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                                                {contract.name}
                                            </Link>
                                            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {formatCurrency(contract.amount, contract.currency)}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                Cliente: {contract.client?.name ?? 'Cliente eliminado'}
                                            </div>
                                        </div>
                                        <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                                            {labelForBillingCycle(contract.billing_cycle)}
                                        </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                                            <div className="text-gray-500 dark:text-gray-400">Próximo vencimiento</div>
                                            <div className="font-semibold text-gray-900 dark:text-gray-100">{formatDate(contract.next_due_date)}</div>
                                        </div>
                                        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                                            <div className="text-gray-500 dark:text-gray-400">Actualizado</div>
                                            <div className="font-semibold text-gray-900 dark:text-gray-100">{formatDate(contract.updated_at)}</div>
                                        </div>
                                        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                                            <div className="text-gray-500 dark:text-gray-400">Recordatorios</div>
                                            <div className="font-semibold text-gray-900 dark:text-gray-100">{contract.reminders_count}</div>
                                        </div>
                                        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                                            <div className="text-gray-500 dark:text-gray-400">Pagos</div>
                                            <div className="font-semibold text-gray-900 dark:text-gray-100">{contract.payments_count}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Contrato</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Cliente</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Ciclo</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Próximo vencimiento</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Recordatorios</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Pagos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white dark:bg-gray-800">
                                    {contractRows.map((contract) => (
                                        <tr key={contract.id} className="hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-indigo-600">
                                                <Link href={route('contracts.show', contract.id)} className="font-medium hover:text-indigo-500">
                                                    {contract.name}
                                                </Link>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{formatCurrency(contract.amount, contract.currency)}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                {contract.client?.name ?? 'Cliente eliminado'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                <div>{labelForBillingCycle(contract.billing_cycle)}</div>
                                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Actualizado: {formatDate(contract.updated_at)}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                {formatDate(contract.next_due_date)}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700 dark:text-gray-300">
                                                {contract.reminders_count}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700 dark:text-gray-300">
                                                {contract.payments_count}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-4 pb-6 sm:px-6">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Mostrando {paginationMeta.from ?? 0} - {paginationMeta.to ?? 0} de {paginationMeta.total} contratos
                            </div>
                            <Pagination links={paginationLinks} />
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
