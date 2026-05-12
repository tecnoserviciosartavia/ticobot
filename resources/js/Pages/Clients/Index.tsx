import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { Users, Plus, Search, Filter, Edit, Trash2, Eye, Mail, Phone, Calendar, TrendingUp, Clock, CheckCircle, DollarSign } from '@/Components/icons';

interface Client {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    contracts_count: number;
    reminders_count: number;
    payments_count: number;
    created_at: string | null;
    updated_at: string | null;
    total_revenue: number;
    last_payment_date: string | null;
}

interface ClientsPageProps extends PageProps {
    clients: {
        data: Client[];
        links: any[];
        meta: any;
    };
    filters: {
        search?: string;
        status?: string;
    };
    stats?: {
        total_clients: number;
        active_clients: number;
        total_contracts: number;
        total_revenue: number;
        total_payments: number;
        verified_payments: number;
        pending_payments: number;
        all_pending_payments: number;
        total_reminders: number;
        conversion_rate: number;
    };
}

export default function ClientsIndex() {
    const { props } = usePage<ClientsPageProps>();
    const { clients, filters, stats } = props;
    const [search, setSearch] = useState(filters.search || '');
    const [status, setStatus] = useState(filters.status || '');
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const handleDeleteClient = (client: Client) => {
        const msg =
            `¿Eliminar a "${client.name}" y todos sus datos asociados (contratos, pagos, recordatorios)?\n\n` +
            'Esta acción no se puede deshacer.';
        if (!confirm(msg)) {
            return;
        }
        setDeletingId(client.id);
        router.delete(route('clients.destroy', client.id), {
            preserveScroll: true,
            onFinish: () => setDeletingId(null),
        });
    };

    const applyFilters = () => {
        router.get(route('clients.index'), {
            search: search || undefined,
            status: status || undefined,
        }, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <ResponsiveLayout title="Clientes" contentWidth="full">
            <Head title="Clientes" />

            <div className="py-6">
                <div className="w-full max-w-none">
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
                                <p className="mt-2 text-gray-600">
                                    Gestiona los clientes, contratos asociados y su historial de recordatorios
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href="/clients/create">
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Cliente
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    <Card className="mb-8 p-6">
                        <div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_180px_auto_auto] md:items-end">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Buscar</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') applyFilters();
                                        }}
                                        placeholder="Nombre, teléfono o correo"
                                        className="block w-full rounded-lg border-gray-300 pl-10 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                >
                                    <option value="">Todos</option>
                                    <option value="active">Activos</option>
                                    <option value="inactive">Inactivos</option>
                                </select>
                            </div>
                            <Button variant="outline" onClick={applyFilters}>
                                <Filter className="mr-2 h-4 w-4" />
                                Aplicar
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setSearch('');
                                    setStatus('');
                                    router.get(route('clients.index'), {}, { preserveScroll: true, replace: true });
                                }}
                            >
                                Limpiar
                            </Button>
                        </div>
                    </Card>

                    {/* System Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <Card className="p-6 border-l-4 border-l-blue-500">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <Users className="h-8 w-8 text-blue-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Total Clientes</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.total_clients || clients?.data?.length || 0}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {stats?.active_clients || clients?.data?.filter(c => c.status === 'active').length || 0} activos
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6 border-l-4 border-l-green-500">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <TrendingUp className="h-8 w-8 text-green-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Total Contratos</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.total_contracts || 0}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        En todo el sistema
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6 border-l-4 border-l-purple-500">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <DollarSign className="h-8 w-8 text-purple-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Ingresos del Mes</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {new Intl.NumberFormat('es-CR', {
                                            style: 'currency',
                                            currency: 'CRC',
                                        }).format(stats?.total_revenue || 0)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Pagos verificados este mes
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6 border-l-4 border-l-yellow-500">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <CheckCircle className="h-8 w-8 text-yellow-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Tasa Conversión Mes</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.conversion_rate || 0}%</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {stats?.verified_payments || 0} de {stats?.total_payments || 0} pagos
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Additional Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card className="p-6 bg-gradient-to-r from-blue-50 to-blue-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-blue-600">Recordatorios del Mes</p>
                                    <p className="text-2xl font-bold text-blue-900">{stats?.total_reminders || 0}</p>
                                </div>
                                <Clock className="h-8 w-8 text-blue-500" />
                            </div>
                        </Card>
                        <Card className="p-6 bg-gradient-to-r from-green-50 to-green-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-green-600">Pagos Verificados Mes</p>
                                    <p className="text-2xl font-bold text-green-900">{stats?.verified_payments || 0}</p>
                                </div>
                                <CheckCircle className="h-8 w-8 text-green-500" />
                            </div>
                        </Card>
                        <Card className="p-6 bg-gradient-to-r from-purple-50 to-purple-100">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-purple-600">Pagos Pendientes Mes</p>
                                    <p className="text-2xl font-bold text-purple-900">{stats?.pending_payments || 0}</p>
                                </div>
                                <Clock className="h-8 w-8 text-purple-500" />
                            </div>
                        </Card>
                    </div>

                    {/* Clients Table */}
                    <Card className="overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">Lista de Clientes</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Contacto
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Estadísticas
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Ingresos
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actualización
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {clients?.data?.map((client) => (
                                        <tr key={client.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="flex-shrink-0 h-10 w-10">
                                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                                            <span className="text-blue-600 font-medium">
                                                                {client.name.charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {client.name}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            ID: #{client.id}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900 space-y-1">
                                                    {client.email && (
                                                        <div className="flex items-center">
                                                            <Mail className="h-4 w-4 text-gray-400 mr-2" />
                                                            {client.email}
                                                        </div>
                                                    )}
                                                    {client.phone && (
                                                        <div className="flex items-center">
                                                            <Phone className="h-4 w-4 text-gray-400 mr-2" />
                                                            {client.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                    client.status === 'active' 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {client.status === 'active' ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-900 space-y-1">
                                                    <div className="flex items-center">
                                                        <span className="font-medium">{client.contracts_count}</span>
                                                        <span className="ml-1 text-gray-500">contratos</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="font-medium">{client.payments_count}</span>
                                                        <span className="ml-1 text-gray-500">pagos</span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className="font-medium">{client.reminders_count}</span>
                                                        <span className="ml-1 text-gray-500">recordatorios</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {new Intl.NumberFormat('es-CR', {
                                                        style: 'currency',
                                                        currency: 'CRC',
                                                    }).format(client.total_revenue || 0)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <div className="space-y-1">
                                                    <div>Creado: {client.created_at ? new Date(client.created_at).toLocaleDateString('es-CR') : '—'}</div>
                                                    <div>Actualizado: {client.updated_at ? new Date(client.updated_at).toLocaleDateString('es-CR') : '—'}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end space-x-2">
                                                    <Link href={`/clients/${client.id}`}>
                                                        <Button variant="outline" size="sm">
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                    <Link href={`/clients/${client.id}/edit`}>
                                                        <Button variant="outline" size="sm">
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleDeleteClient(client)}
                                                        disabled={deletingId === client.id}
                                                        className="text-red-600 hover:text-red-700"
                                                        title="Eliminar cliente"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Pagination */}
                    {clients?.links && clients.links.length > 3 && (
                        <div className="mt-6">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-700">
                                    Mostrando {clients.meta?.from || 0} a {clients.meta?.to || 0} de {clients.meta?.total || 0} resultados
                                </div>
                                <div className="flex items-center space-x-1">
                                    {clients.links.map((link, index) => (
                                        <Link
                                            key={index}
                                            href={link.url || '#'}
                                            className={`px-3 py-2 text-sm font-medium rounded-md ${
                                                link.active
                                                    ? 'bg-blue-600 text-white'
                                                    : link.url
                                                    ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            }`}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                            preserveScroll={true}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {(!clients?.data || clients.data.length === 0) && (
                        <Card className="text-center py-12">
                            <Users className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron clientes</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Comienza creando un nuevo cliente.
                            </p>
                            <div className="mt-6">
                                <Link href="/clients/create">
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Cliente
                                    </Button>
                                </Link>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </ResponsiveLayout>
    );
}
