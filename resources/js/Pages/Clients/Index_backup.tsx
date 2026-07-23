import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { usePage } from '@inertiajs/react';
import type { PageProps } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
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
}

export default function ClientsIndex() {
    const { props } = usePage<ClientsPageProps>();
    const { clients, filters } = props;
    
    console.log('Clients page loaded', { clients, filters });

    return (
        <ResponsiveLayout title="Clientes">
            <Head title="Clientes" />
            
            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

                    {/* Simple Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card className="p-6">
                            <div className="text-center">
                                <Users className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                                <p className="text-sm font-medium text-gray-600">Total Clientes</p>
                                <p className="text-2xl font-bold text-gray-900">{clients?.data?.length || 0}</p>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="text-center">
                                <TrendingUp className="h-8 w-8 text-cyan-600 mx-auto mb-2" />
                                <p className="text-sm font-medium text-gray-600">Activos</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {clients?.data?.filter(c => c.status === 'active').length || 0}
                                </p>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="text-center">
                                <DollarSign className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                                <p className="text-sm font-medium text-gray-600">Total Contratos</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {clients?.data?.reduce((sum, c) => sum + c.contracts_count, 0) || 0}
                                </p>
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
                                            Contratos
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
                                                        ? 'bg-cyan-100 text-cyan-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {client.status === 'active' ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {client.contracts_count}
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
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

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
