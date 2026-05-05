import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent, useEffect, useState } from 'react';
import type { PageProps } from '@/types';
import { DollarSign, AlertCircle, ArrowLeft, Send, CheckCircle, Clock, User } from '@/Components/icons';

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
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');

    const fetchData = async (page = 1) => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const response = await fetch(
                `/web-api/clients/pending-payments?per_page=10000&page=${page}&search=${encodeURIComponent(
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
            if (!response.ok) {
                const raw = await response.text().catch(() => '');
                setClients([]);
                setPagination(null);
                setErrorMsg(`No se pudo cargar pendientes (HTTP ${response.status}). ${raw ? 'Detalle: ' + raw.slice(0, 200) : ''}`);
                return;
            }
            const data: ApiResponse = await response.json();
            if (data.success) {
                setClients(data.data);
                setPagination(null);
                setCurrentPage(1);
            } else {
                setClients([]);
                setPagination(null);
                setErrorMsg('La API respondió sin éxito al cargar pendientes.');
            }
        } catch (error) {
            console.error('Error fetching pending payments:', error);
            setErrorMsg('Error de red al cargar pendientes. Revisa la sesión o la conexión.');
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const response = await fetch('/web-api/summary/pending-payments', {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });
            if (!response.ok) {
                const raw = await response.text().catch(() => '');
                setSummary(null);
                setErrorMsg((prev) => prev || `No se pudo cargar resumen (HTTP ${response.status}). ${raw ? raw.slice(0, 200) : ''}`);
                return;
            }
            const data: SummaryResponse = await response.json();
            if (data.success) {
                setSummary(data);
            }
        } catch (error) {
            console.error('Error fetching summary:', error);
            setErrorMsg((prev) => prev || 'Error de red al cargar el resumen de pendientes.');
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
        router.post(
            route('webapi.clients.sendReminder', clientId),
            {},
            {
                preserveScroll: true,
                onSuccess: () => {
                    alert('Recordatorio creado correctamente');
                    fetchData(currentPage);
                    fetchSummary();
                },
                onError: (errors: any) => {
                    alert('Error creando recordatorio');
                },
            }
        );
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortBy !== field) return <span className="text-gray-400">↕</span>;
        return sortOrder === 'asc' ? <span>↑</span> : <span>↓</span>;
    };

    return (
        <ResponsiveLayout title="Pagos Pendientes" contentWidth="full">
            <Head title="Pagos Pendientes" />

            <div className="py-6">
                <div className="w-full max-w-none min-w-0">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Pagos Pendientes</h1>
                                <p className="mt-2 text-gray-600">
                                    Gestiona los pagos pendientes de los clientes y envía recordatorios.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Link href={route('payments.index')}>
                                    <Button variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver a Pagos
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    {summary && (
                        <div className="mb-8 grid gap-6 md:grid-cols-3">
                            <Card className="p-6">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0">
                                        <User className="w-8 h-8 text-blue-600" />
                                    </div>
                                    <div className="ml-4">
                                        <p className="text-sm font-medium text-gray-500">
                                            Clientes con pagos pendientes
                                        </p>
                                        <p className="text-2xl font-bold text-gray-900">
                                    {summary.total_clients_with_pending}
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            <Card className="p-6">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0">
                                        <DollarSign className="w-8 h-8 text-red-600" />
                                    </div>
                                    <div className="ml-4">
                                        <p className="text-sm font-medium text-gray-500">
                                            Monto total pendiente (CRC)
                                        </p>
                                        <p className="text-2xl font-bold text-red-600">
                                            {formatCurrency(
                                                summary.by_currency.find((c) => c.currency === 'CRC')?.total || 0,
                                                'CRC'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            <Card className="p-6">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0">
                                        <Clock className="w-8 h-8 text-orange-600" />
                                    </div>
                                    <div className="ml-4">
                                        <p className="text-sm font-medium text-gray-500">
                                            Total de pagos pendientes
                                        </p>
                                        <p className="text-2xl font-bold text-gray-900">
                                            {summary.by_currency.reduce((sum, c) => sum + c.count, 0)}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Card */}
                    <div className="min-w-0 bg-white shadow dark:bg-gray-800 dark:shadow-gray-900/50 sm:rounded-lg">
                        {errorMsg && (
                            <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                                {errorMsg}
                            </div>
                        )}
                        {/* Header */}
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700 sm:px-6">
                            <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
                                💰 Clientes con Pagos Pendientes
                            </h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Lista de clientes que tienen pagos sin completar
                            </p>
                        </div>

                        {/* Search */}
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, teléfono o email..."
                                    value={search}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                                />
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto overscroll-x-contain">
                            <table className="w-full min-w-[860px] divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left">
                                            <button
                                                onClick={() => handleSort('name')}
                                                className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                                            >
                                                Nombre <SortIcon field="name" />
                                            </button>
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                            Teléfono
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                            Email
                                        </th>
                                        <th className="px-6 py-3 text-center">
                                            <button
                                                onClick={() => handleSort('created_at')}
                                                className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                                            >
                                                Registrado <SortIcon field="created_at" />
                                            </button>
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                            Pagos Pendientes
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                            Monto Pendiente
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                                Cargando...
                                            </td>
                                        </tr>
                                    ) : clients.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                                No hay clientes con pagos pendientes
                                            </td>
                                        </tr>
                                    ) : (
                                        clients.map((client) => (
                                            <tr key={client.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                                <td className="whitespace-nowrap px-6 py-4">
                                                    <Link
                                                        href={route('clients.show', client.id)}
                                                        className="font-medium text-blue-600 hover:text-blue-800"
                                                    >
                                                        {client.name}
                                                    </Link>
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                                    {client.phone || '-'}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                                    {client.email || '-'}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                                    {formatDate(client.created_at)}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-right">
                                                    <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/20 dark:text-red-300">
                                                        {client.pending_payments_count}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-4 text-right font-semibold text-red-600">
                                                    {formatCurrency(
                                                        client.pending_amount,
                                                        client.currency
                                                    )}
                                                </td>
                                                <td className="px-3 py-4 text-center sm:px-6">
                                                    <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap">
                                                        <Link
                                                            href={route('clients.show', client.id)}
                                                            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
                                                        >
                                                            Ver detalles
                                                        </Link>
                                                        <button
                                                            onClick={() => sendReminder(client.id)}
                                                            className="inline-flex items-center gap-1 rounded-md bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:hover:bg-yellow-900/40"
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
                            <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
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
                                                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
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
        </ResponsiveLayout>
    );
}
