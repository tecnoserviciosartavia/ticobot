import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent, useEffect, useState } from 'react';
import type { PageProps } from '@/types';

interface ClientWithPending {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    pending_payments_count: number;
    pending_amount: number;
    currency: string;
    created_at: string;
    updated_at: string;
}

interface PaginationMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
}

interface ApiResponse {
    success: boolean;
    data: ClientWithPending[];
    pagination: PaginationMeta;
}

interface SummaryResponse {
    success: boolean;
    total_clients_with_pending: number;
    total_pending_amount: number;
    by_currency: Array<{
        currency: string;
        total: number;
        count: number;
    }>;
}

export default function PendingPayments({}: PageProps) {
    const [clients, setClients] = useState<ClientWithPending[]>([]);
    const [summary, setSummary] = useState<SummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');

    const fetchData = async (page = 1) => {
        setLoading(true);
        try {
            const response = await fetch(
                `/api/clients/pending-payments?per_page=15&page=${page}&search=${encodeURIComponent(
                    search
                )}&sort_by=${sortBy}&sort_order=${sortOrder}`,
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                }
            );
            const data: ApiResponse = await response.json();
            if (data.success) {
                setClients(data.data);
                setPagination(data.pagination);
                setCurrentPage(page);
            }
        } catch (error) {
            console.error('Error fetching pending payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const response = await fetch('/api/summary/pending-payments', {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });
            const data: SummaryResponse = await response.json();
            if (data.success) {
                setSummary(data);
            }
        } catch (error) {
            console.error('Error fetching summary:', error);
        }
    };

    useEffect(() => {
        fetchData(1);
        fetchSummary();
    }, [search, sortBy, sortOrder]);

    const handleSearch = (value: string) => {
        setSearch(value);
    };

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const handlePageChange = (page: number) => {
        fetchData(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const formatCurrency = (amount: number, currency: string = 'CRC') => {
        if (currency === 'USD') {
            return `$${amount.toFixed(2)}`;
        }
        return `₡${amount.toLocaleString('es-CR')}`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-CR');
    };

    const sendReminder = async (clientId: number) => {
        if (!confirm('Enviar recordatorio por WhatsApp a este cliente?')) return;
        try {
            const resp = await fetch(`/api/clients/${clientId}/send-reminder`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({}),
            });
            if (resp.ok) {
                alert('Recordatorio creado correctamente');
                fetchData(currentPage);
                fetchSummary();
            } else {
                const err = await resp.json().catch(() => ({}));
                alert('Error creando recordatorio: ' + (err.message || resp.statusText));
            }
        } catch (e) {
            console.error(e);
            alert('Error creando recordatorio');
        }
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortBy !== field) return <span className="text-gray-400">↕</span>;
        return sortOrder === 'asc' ? <span>↑</span> : <span>↓</span>;
    };

    return (
        <AuthenticatedLayout>
            <Head title="Pagos Pendientes" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                    {/* Summary Cards */}
                    {summary && (
                        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="rounded-lg bg-white px-6 py-4 shadow">
                                <div className="text-sm font-medium text-gray-500">
                                    Clientes con pagos pendientes
                                </div>
                                <div className="mt-2 text-3xl font-bold text-gray-900">
                                    {summary.total_clients_with_pending}
                                </div>
                            </div>

                            <div className="rounded-lg bg-white px-6 py-4 shadow">
                                <div className="text-sm font-medium text-gray-500">
                                    Monto total pendiente (CRC)
                                </div>
                                <div className="mt-2 text-3xl font-bold text-red-600">
                                    {formatCurrency(
                                        summary.by_currency.find((c) => c.currency === 'CRC')?.total || 0,
                                        'CRC'
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg bg-white px-6 py-4 shadow">
                                <div className="text-sm font-medium text-gray-500">
                                    Total de pagos pendientes
                                </div>
                                <div className="mt-2 text-3xl font-bold text-gray-900">
                                    {summary.by_currency.reduce((sum, c) => sum + c.count, 0)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Card */}
                    <div className="bg-white shadow sm:rounded-lg">
                        {/* Header */}
                        <div className="border-b border-gray-200 px-6 py-4 sm:px-6">
                            <h3 className="text-lg font-medium leading-6 text-gray-900">
                                💰 Clientes con Pagos Pendientes
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Lista de clientes que tienen pagos sin completar
                            </p>
                        </div>

                        {/* Search */}
                        <div className="border-b border-gray-200 px-6 py-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, teléfono o email..."
                                    value={search}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left">
                                            <button
                                                onClick={() => handleSort('name')}
                                                className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-700 hover:text-gray-900"
                                            >
                                                Nombre <SortIcon field="name" />
                                            </button>
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                                            Teléfono
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                                            Email
                                        </th>
                                        <th className="px-6 py-3 text-center">
                                            <button
                                                onClick={() => handleSort('created_at')}
                                                className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-700 hover:text-gray-900"
                                            >
                                                Registrado <SortIcon field="created_at" />
                                            </button>
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700">
                                            Pagos Pendientes
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700">
                                            Monto Pendiente
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                                                Cargando...
                                            </td>
                                        </tr>
                                    ) : clients.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                                                No hay clientes con pagos pendientes
                                            </td>
                                        </tr>
                                    ) : (
                                        clients.map((client) => (
                                            <tr key={client.id} className="hover:bg-gray-50">
                                                <td className="whitespace-nowrap px-6 py-4">
                                                    <Link
                                                        href={route('clients.show', client.id)}
                                                        className="font-medium text-blue-600 hover:text-blue-800"
                                                    >
                                                        {client.name}
                                                    </Link>
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                                                    {client.phone || '-'}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                                                    {client.email || '-'}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-500">
                                                    {formatDate(client.created_at)}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-right">
                                                    <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                                                        {client.pending_payments_count}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-right font-semibold text-red-600">
                                                    {formatCurrency(
                                                        client.pending_amount,
                                                        client.currency
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Link
                                                            href={route('clients.show', client.id)}
                                                            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
                                                        >
                                                            Ver detalles
                                                        </Link>
                                                        <button
                                                            onClick={() => sendReminder(client.id)}
                                                            className="inline-flex items-center gap-1 rounded-md bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100"
                                                        >
                                                            Enviar recordatorio
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {pagination && pagination.last_page > 1 && (
                            <div className="border-t border-gray-200 px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-500">
                                        Mostrando {pagination.from} a {pagination.to} de{' '}
                                        {pagination.total} clientes
                                    </div>
                                    <div className="flex gap-2">
                                        {Array.from(
                                            { length: pagination.last_page },
                                            (_, i) => i + 1
                                        ).map((page) => (
                                            <button
                                                key={page}
                                                onClick={() => handlePageChange(page)}
                                                className={`rounded px-3 py-1 text-sm font-medium ${
                                                    currentPage === page
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                                }`}
                                            >
                                                {page}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
