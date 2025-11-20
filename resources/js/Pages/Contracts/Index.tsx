import Pagination from '@/Components/Pagination';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

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
    filters: { client_id: number | null; billing_cycle: string | null };
    clients: Array<{ id: number; name: string }>;
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

export default function ContractsIndex({ contracts, filters, clients, billingCycles }: ContractsPageProps) {
    const { data, setData } = useForm({
        client_id: filters.client_id?.toString() ?? '',
        billing_cycle: filters.billing_cycle ?? '',
    });

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
        setData('client_id', '');
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
                        <h2 className="text-xl font-semibold leading-tight text-gray-800">Contratos</h2>
                        <p className="text-sm text-gray-500">
                            Controla los contratos activos, ciclos de facturación y vencimientos próximos.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href={route('contracts.import')}
                            className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        >
                            Importar
                        </Link>
                        <Link
                            href={route('contracts.create')}
                            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
                    <div className="overflow-hidden rounded-lg bg-white shadow">
                        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                            <form onSubmit={submit} className="flex flex-col gap-4 md:flex-row md:items-end">
                                <div className="w-full md:w-64">
                                    <label htmlFor="client_id" className="block text-sm font-medium text-gray-700">
                                        Cliente
                                    </label>
                                    <select
                                        id="client_id"
                                        name="client_id"
                                        value={data.client_id}
                                        onChange={(event) => setData('client_id', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    >
                                        <option value="">Todos</option>
                                        {clients.map((client) => (
                                            <option key={client.id} value={client.id}>
                                                {client.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-full md:w-64">
                                    <label htmlFor="billing_cycle" className="block text-sm font-medium text-gray-700">
                                        Ciclo
                                    </label>
                                    <select
                                        id="billing_cycle"
                                        name="billing_cycle"
                                        value={data.billing_cycle}
                                        onChange={(event) => setData('billing_cycle', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    >
                                        <option value="">Todos</option>
                                        {billingCycles.map((cycle) => (
                                            <option key={cycle} value={cycle}>
                                                {cycle}
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
                                        onClick={reset}
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
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contrato</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Cliente</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ciclo</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Próximo vencimiento</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Recordatorios</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Pagos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {contractRows.map((contract) => (
                                        <tr key={contract.id} className="hover:bg-gray-50">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-indigo-600">
                                                <Link href={route('contracts.show', contract.id)} className="font-medium hover:text-indigo-500">
                                                    {contract.name}
                                                </Link>
                                                <div className="text-xs text-gray-500">{formatCurrency(contract.amount, contract.currency)}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                {contract.client?.name ?? 'Cliente eliminado'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                <div>{contract.billing_cycle}</div>
                                                <div className="mt-1 text-xs text-gray-500">Actualizado: {formatDate(contract.updated_at)}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                {formatDate(contract.next_due_date)}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700">
                                                {contract.reminders_count}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700">
                                                {contract.payments_count}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 pb-6">
                            <div className="text-sm text-gray-500">
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
