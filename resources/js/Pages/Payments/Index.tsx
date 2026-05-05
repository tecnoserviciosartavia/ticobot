import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import Pagination from '@/Components/Pagination';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, Link, usePage, router } from '@inertiajs/react';
import { useState } from 'react';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  FileText
} from '@/Components/icons';

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
    contract: { id: number; name: string; amount: number; currency: string } | null;
    reminder: { id: number; status: string } | null;
    has_conciliation: boolean;
    created_at: string | null;
    updated_at: string | null;
}

interface Paginated<T> {
    data: T[];
    links: Array<{ url: string | null; label: string; active: boolean }>;
    meta?: { from: number | null; to: number | null; total: number };
}

interface PaymentsPageProps extends PageProps {
    payments: Paginated<Payment>;
    filters: {
        status?: string;
        channel?: string;
        client_query?: string;
    };
    flashSuccess?: string;
    flashError?: string;
}

export default function PaymentsIndex() {
    const { props } = usePage<PaymentsPageProps>();
    const { payments, filters = {}, flashSuccess, flashError } = props;
    
    const [search, setSearch] = useState(filters.client_query || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || '');
    const [channelFilter, setChannelFilter] = useState(filters.channel || '');
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const filteredPayments = (payments?.data || []).filter(payment => {
        const matchesSearch = !search || 
            (payment.reference && payment.reference.toLowerCase().includes(search.toLowerCase())) ||
            (payment.client?.name && payment.client.name.toLowerCase().includes(search.toLowerCase()));
        
        const matchesStatus = !statusFilter || payment.status === statusFilter;
        const matchesChannel = !channelFilter || payment.channel === channelFilter;
        
        return matchesSearch && matchesStatus && matchesChannel;
    });

    const formatCurrency = (amount: string | number, currency: string | null) => {
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        return new Intl.NumberFormat('es-CR', {
            style: 'currency',
            currency: currency === 'USD' ? 'USD' : 'CRC',
        }).format(num);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'verified':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-500" />;
            default:
                return <Clock className="h-4 w-4 text-yellow-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'verified':
                return 'bg-green-100 text-green-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-yellow-100 text-yellow-800';
        }
    };

    const handleDelete = (payment: Payment) => {
        if (!confirm(`¿Eliminar el pago #${payment.id}${payment.client?.name ? ` de ${payment.client.name}` : ''}?`)) {
            return;
        }

        setDeletingId(payment.id);
        router.delete(route('payments.destroy', payment.id), {
            preserveScroll: true,
            onFinish: () => setDeletingId(null),
        });
    };

    return (
        <ResponsiveLayout title="Pagos" contentWidth="full">
            <Head title="Pagos" />

            <div className="py-6">
                <div className="w-full max-w-none min-w-0">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Pagos</h1>
                                <p className="mt-2 text-gray-600">
                                    Gestiona los pagos recibidos, verificación y conciliación bancaria
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/payments/create">
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Pago
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <Card className="mb-8 p-4 sm:p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
                            <div className="min-w-0 w-full md:flex-1 md:min-w-[min(100%,220px)]">
                                <input
                                    type="text"
                                    placeholder="Buscar por referencia o cliente..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="w-full md:w-auto md:min-w-[11rem] md:max-w-[14rem]">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                >
                                    <option value="">Todos los estados</option>
                                    <option value="verified">Verificados</option>
                                    <option value="unverified">No verificados</option>
                                    <option value="failed">Fallidos</option>
                                </select>
                            </div>
                            <div className="w-full md:w-auto md:min-w-[11rem] md:max-w-[14rem]">
                                <select
                                    value={channelFilter}
                                    onChange={(e) => setChannelFilter(e.target.value)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                >
                                    <option value="">Todos los canales</option>
                                    <option value="sinpe_móvil">Sinpe Móvil</option>
                                    <option value="sinpe_email">Sinpe Email</option>
                                    <option value="transfer">Transferencia</option>
                                    <option value="cash">Efectivo</option>
                                </select>
                            </div>
                        </div>
                    </Card>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <CreditCard className="h-8 w-8 text-blue-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Total Pagos</p>
                                    <p className="text-2xl font-bold text-gray-900">{(payments?.data || []).length}</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <CheckCircle className="h-8 w-8 text-green-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Verificados</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {(payments?.data || []).filter((p: Payment) => p.status === 'verified').length}
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <DollarSign className="h-8 w-8 text-green-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Monto Total</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(
                                            (payments?.data || []).reduce((sum: number, p: Payment) => sum + Number(p.amount), 0),
                                            'CRC'
                                        )}
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <Clock className="h-8 w-8 text-yellow-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Pendientes</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {(payments?.data || []).filter((p: Payment) => p.status !== 'verified').length}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Payments Table */}
                    <Card className="min-w-0 overflow-hidden">
                        <div className="overflow-x-auto overscroll-x-contain -mx-px">
                            <table className="w-full min-w-[720px] divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                                            Referencia
                                        </th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                                            Cliente
                                        </th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                                            Monto
                                        </th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                                            Canal
                                        </th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                                            Estado
                                        </th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                                            Fecha
                                        </th>
                                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredPayments.map((payment) => (
                                        <tr key={payment.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-4 sm:px-6">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                                                    <span className="truncate text-sm font-medium text-gray-900">
                                                        {payment.reference || 'N/A'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4 sm:px-6">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <Users className="h-4 w-4 shrink-0 text-gray-400" />
                                                    <span className="truncate text-sm text-gray-900">
                                                        {payment.client?.name || 'N/A'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                                                <div className="flex items-center">
                                                    <DollarSign className="h-4 w-4 text-gray-400 mr-2" />
                                                    <span className="text-sm font-medium text-gray-900">
                                                        {formatCurrency(payment.amount, payment.currency)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                                                <Badge variant="outline">
                                                    {payment.channel.replace('_', ' ').toUpperCase()}
                                                </Badge>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                                                <div className="flex items-center">
                                                    {getStatusIcon(payment.status)}
                                                    <Badge className={`ml-2 ${getStatusColor(payment.status)}`}>
                                                        {payment.status === 'verified' ? 'Verificado' : 
                                                         payment.status === 'failed' ? 'Fallido' : 'Pendiente'}
                                                    </Badge>
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 sm:px-6">
                                                {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString('es-CR') : 'N/A'}
                                            </td>
                                            <td className="px-3 py-4 text-right text-sm font-medium sm:px-6">
                                                <div className="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                                    {payment.status !== 'verified' && !payment.has_conciliation && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm"
                                                            onClick={() => {
                                                                router.post(route('conciliations.store'), {
                                                                    payment_id: payment.id,
                                                                    status: 'pending'
                                                                });
                                                            }}
                                                        >
                                                            <CheckCircle className="w-4 h-4 mr-1" />
                                                            Conciliar
                                                        </Button>
                                                    )}
                                                    {!payment.has_conciliation && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleDelete(payment)}
                                                            disabled={deletingId === payment.id}
                                                            className="text-red-600 hover:text-red-700"
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-1" />
                                                            Eliminar
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="text-sm text-gray-600">
                            Mostrando {payments?.meta?.from ?? 0} a {payments?.meta?.to ?? 0} de {payments?.meta?.total ?? filteredPayments.length} pagos
                        </div>
                        <Pagination links={payments?.links ?? []} />
                    </div>

                    {/* Empty State */}
                    {filteredPayments.length === 0 && (
                        <Card className="text-center py-12">
                            <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron pagos</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Comienza registrando un nuevo pago o ajusta los filtros de búsqueda.
                            </p>
                            <div className="mt-6">
                                <Link href="/payments/create">
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Pago
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
