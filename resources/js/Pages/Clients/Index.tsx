import Pagination from '@/Components/Pagination';
import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

interface Client {
    id: number;
    name: string;
    legal_id: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    contracts_count: number;
    reminders_count: number;
    payments_count: number;
    updated_at: string | null;
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

type ClientsPageProps = PageProps<{
    clients: Paginated<Client>;
    filters: {
        search?: string | null;
        status?: string | null;
    };
    statuses: string[];
}>;

export default function ClientsIndex({ clients, filters, statuses }: ClientsPageProps) {
    const { data, setData } = useForm<{ search: string; status: string }>({
        search: filters.search ?? '',
        status: filters.status ?? '',
    });

    const page = usePage();
    const flashSuccess = (page.props as any)?.flash?.success as string | undefined;

    const clientRows = clients?.data ?? [];
    const paginationLinks = clients?.links ?? [];
    const paginationMeta = clients?.meta ?? { from: 0, to: 0, total: 0 };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('clients.index'), { ...data }, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        setData('search', '');
        setData('status', '');
        router.get(route('clients.index'), {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold leading-tight text-gray-800">
                            Clientes
                        </h2>
                        <p className="text-sm text-gray-500">
                            Gestiona los clientes, contratos asociados y su historial de recordatorios.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href={route('clients.import')}
                            className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        >
                            Importar CSV
                        </Link>
                        <Link
                            href={route('clients.create')}
                            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        >
                            Nuevo cliente
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title="Clientes" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-6 sm:px-6 lg:px-8">
                    {flashSuccess && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                            {flashSuccess}
                        </div>
                    )}
                    <div className="overflow-hidden rounded-lg bg-white shadow">
                        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                            <form
                                onSubmit={submit}
                                className="flex flex-col gap-4 md:flex-row md:items-end"
                            >
                                <div className="flex-1">
                                    <label
                                        htmlFor="search"
                                        className="block text-sm font-medium text-gray-700"
                                    >
                                        Búsqueda
                                    </label>
                                    <input
                                        id="search"
                                        name="search"
                                        type="search"
                                        value={data.search}
                                        onChange={(event) => setData('search', event.target.value)}
                                        placeholder="Nombre, identificación, email o teléfono"
                                        className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div className="w-full md:w-56">
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
                                        {statuses.map((status) => (
                                            <option key={status} value={status}>
                                                {status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
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
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Contacto
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Contratos
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Recordatorios
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Pagos
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                            Actualizado
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {clientRows.map((client) => (
                                        <tr key={client.id} className="hover:bg-gray-50">
                                            <td className="whitespace-nowrap px-6 py-4">
                                                <div className="text-sm font-medium text-indigo-600">
                                                    <Link href={route('clients.show', client.id)} className="hover:text-indigo-500">
                                                        {client.name}
                                                    </Link>
                                                </div>
                                                {client.legal_id && (
                                                    <div className="text-sm text-gray-500">
                                                        {client.legal_id}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                                <div>{client.email ?? '—'}</div>
                                                <div>{client.phone ?? '—'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700">
                                                {client.contracts_count}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700">
                                                {client.reminders_count}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700">
                                                {client.payments_count}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4">
                                                <StatusBadge status={client.status} />
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                                {client.updated_at
                                                    ? new Date(client.updated_at).toLocaleDateString('es-CR', {
                                                          day: '2-digit',
                                                          month: 'short',
                                                          year: 'numeric',
                                                      })
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 pb-6">
                            <div className="text-sm text-gray-500">
                                Mostrando {paginationMeta.from ?? 0} - {paginationMeta.to ?? 0} de {paginationMeta.total} clientes
                            </div>
                            <Pagination links={paginationLinks} />
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
