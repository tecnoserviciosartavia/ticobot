import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import Pagination from '@/Components/Pagination';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { labelForBillingCycle, labelForStatus } from '@/lib/labels';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  Users,
  Calendar,
  DollarSign,
  Clock,
  TrendingUp,
  CheckCircle
} from '@/Components/icons';

interface ContractSummary {
    id: number;
    name: string;
    amount: string;
    currency: string | null;
    billing_cycle: string;
    status: string;
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

interface ContractsPageProps extends PageProps {
    contracts: Paginated<ContractSummary>;
    filters: {
        client_query?: string;
        billing_cycle?: string;
        status?: string;
    };
    flashSuccess?: string;
    flashError?: string;
}

export default function ContractsIndex() {
    const { props } = usePage<ContractsPageProps>();
    const { contracts, filters, flashSuccess, flashError } = props;
    
    const [search, setSearch] = useState(filters.client_query || '');
    const [billingCycleFilter, setBillingCycleFilter] = useState(filters.billing_cycle || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || '');
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const filteredContracts = contracts.data.filter(contract => {
        const matchesSearch = !search || 
            contract.name.toLowerCase().includes(search.toLowerCase()) ||
            (contract.client?.name && contract.client.name.toLowerCase().includes(search.toLowerCase()));
        
        const matchesBillingCycle = !billingCycleFilter || contract.billing_cycle === billingCycleFilter;
        const matchesStatus = !statusFilter || (contract.status ?? 'active') === statusFilter;

        return matchesSearch && matchesBillingCycle && matchesStatus;
    });

    const handleDelete = (contractId: number, contractName: string) => {
        if (confirm(`⚠️ ¿Estás seguro de que deseas eliminar el contrato "${contractName}"?\n\nEsta acción NO se puede deshacer.`)) {
            setDeletingId(contractId);
            router.delete(route('contracts.destroy', contractId), {
                preserveScroll: true,
                onFinish: () => setDeletingId(null),
            });
        }
    };

    const applyFilters = () => {
        router.get(route('contracts.index'), {
            client_query: search || undefined,
            billing_cycle: billingCycleFilter || undefined,
            status: statusFilter || undefined,
        }, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const formatCurrency = (amount: string, currency: string | null) => {
        const num = parseFloat(amount);
        return new Intl.NumberFormat('es-CR', {
            style: 'currency',
            currency: currency === 'USD' ? 'USD' : 'CRC',
        }).format(num);
    };

    const getDueDateStatus = (dueDate: string | null) => {
        if (!dueDate) return { text: 'Sin fecha', color: 'gray' };
        
        const today = new Date();
        const due = new Date(dueDate);
        const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return { text: 'Vencido', color: 'red' };
        if (diffDays <= 7) return { text: `${diffDays} días`, color: 'orange' };
        if (diffDays <= 30) return { text: `${diffDays} días`, color: 'yellow' };
        return { text: `${diffDays} días`, color: 'green' };
    };

    return (
        <ResponsiveLayout title="Contratos" contentWidth="full">
            <Head title="Contratos" />

            <div className="py-6">
                <div className="w-full max-w-none">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Contratos</h1>
                                <p className="mt-2 text-gray-600">
                                    Controla los contratos activos, ciclos de facturación y vencimientos próximos
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={route('contracts.import')}>
                                    <Button variant="outline">
                                        <Filter className="w-4 h-4 mr-2" />
                                        Importar
                                    </Button>
                                </Link>
                                <Link href={route('contracts.create')}>
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Contrato
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Flash Messages */}
                    {flashSuccess && (
                        <div className="mb-6 rounded-md bg-green-50 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <CheckCircle className="h-5 w-5 text-green-400" />
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm font-medium text-green-800">
                                        {flashSuccess}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Search and Filters */}
                    <Card className="mb-6 p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex-1">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar contratos..."
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') applyFilters();
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <select
                                    className="block px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    value={billingCycleFilter}
                                    onChange={(e) => setBillingCycleFilter(e.target.value)}
                                >
                                    <option value="">Todos los ciclos</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="biweekly">Quincenal</option>
                                    <option value="monthly">Mensual</option>
                                    <option value="one_time">Una vez</option>
                                </select>
                                <select
                                    className="block px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="">Todos los estados</option>
                                    <option value="active">Activo</option>
                                    <option value="paused">Pausado</option>
                                    <option value="cancelled">Cancelado</option>
                                </select>
                                <Button variant="outline" size="sm" onClick={applyFilters}>
                                    <Filter className="w-4 h-4 mr-2" />
                                    Aplicar
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <FileText className="h-8 w-8 text-blue-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Total Contratos</p>
                                    <p className="text-2xl font-bold text-gray-900">{contracts.data.length}</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <DollarSign className="h-8 w-8 text-green-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Valor Total</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(
                                            contracts.data.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0).toString(),
                                            'CRC'
                                        )}
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <Calendar className="h-8 w-8 text-orange-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Por Vencer</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {contracts.data.filter(c => {
                                            if (!c.next_due_date) return false;
                                            const today = new Date();
                                            const due = new Date(c.next_due_date);
                                            const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                            return diffDays <= 30 && diffDays >= 0;
                                        }).length}
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <Clock className="h-8 w-8 text-purple-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Vencidos</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {contracts.data.filter(c => {
                                            if (!c.next_due_date) return false;
                                            const today = new Date();
                                            const due = new Date(c.next_due_date);
                                            return due < today;
                                        }).length}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Contracts Table */}
                    <Card className="overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">Lista de Contratos</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Contrato
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Monto
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Ciclo
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Próximo Vencimiento
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Estadísticas
                                        </th>
                                        <th className="relative px-6 py-3">
                                            <span className="sr-only">Acciones</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredContracts.map((contract) => {
                                        const dueStatus = getDueDateStatus(contract.next_due_date);
                                        return (
                                            <tr key={contract.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="flex-shrink-0 h-10 w-10">
                                                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                                                <FileText className="h-5 w-5 text-blue-600" />
                                                            </div>
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {contract.name}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                ID: #{contract.id}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <Users className="h-4 w-4 text-gray-400 mr-2" />
                                                        <span className="text-sm text-gray-900">
                                                            {contract.client?.name || 'Sin cliente'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {formatCurrency(contract.amount, contract.currency)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <Badge variant="outline">
                                                        {labelForBillingCycle(contract.billing_cycle)}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <Badge variant="outline">
                                                        {labelForStatus(contract.status ?? 'active')}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                                                        <div>
                                                            <div className="text-sm text-gray-900">
                                                                {contract.next_due_date ? new Date(contract.next_due_date).toLocaleDateString('es-CR') : 'Sin fecha'}
                                                            </div>
                                                            <Badge 
                                                                variant="outline"
                                                                className={`text-xs ${
                                                                    dueStatus.color === 'red' ? 'text-red-600 border-red-200' :
                                                                    dueStatus.color === 'orange' ? 'text-orange-600 border-orange-200' :
                                                                    dueStatus.color === 'yellow' ? 'text-yellow-600 border-yellow-200' :
                                                                    'text-green-600 border-green-200'
                                                                }`}
                                                            >
                                                                {dueStatus.text}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900 space-y-1">
                                                        <div className="flex items-center">
                                                            <span className="font-medium">{contract.payments_count}</span>
                                                            <span className="ml-1 text-gray-500">pagos</span>
                                                        </div>
                                                        <div className="flex items-center">
                                                            <span className="font-medium">{contract.reminders_count}</span>
                                                            <span className="ml-1 text-gray-500">recordatorios</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex items-center justify-end space-x-2">
                                                        <Link href={route('contracts.show', contract.id)}>
                                                            <Button variant="outline" size="sm">
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                        <Link href={route('contracts.edit', contract.id)}>
                                                            <Button variant="outline" size="sm">
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleDelete(contract.id, contract.name)}
                                                            disabled={deletingId === contract.id}
                                                            className="text-red-600 hover:text-red-700"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-gray-600">
                            Mostrando {contracts.meta?.from ?? 0} a {contracts.meta?.to ?? 0} de {contracts.meta?.total ?? filteredContracts.length} contratos
                        </div>
                        <Pagination links={contracts.links ?? []} />
                    </div>

                    {/* Empty State */}
                    {filteredContracts.length === 0 && (
                        <Card className="text-center py-12">
                            <FileText className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron contratos</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Comienza creando un nuevo contrato o ajusta los filtros de búsqueda.
                            </p>
                            <div className="mt-6">
                                <Link href={route('contracts.create')}>
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Contrato
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
