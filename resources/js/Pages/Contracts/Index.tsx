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
    services_label?: string;
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
        search?: string;
        billing_cycle?: string;
        status?: string;
    };
    flashSuccess?: string;
    flashError?: string;
}

export default function ContractsIndex() {
    const { props } = usePage<ContractsPageProps>();
    const { contracts, filters, flashSuccess, flashError } = props;
    
    const [search, setSearch] = useState(filters.search || '');
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

    const handleDelete = (contractId: number, contractName: string, servicesLabel?: string) => {
        const platforms = (servicesLabel ?? '').trim();
        const platformLine = platforms ? `\n\nPlataformas: ${platforms}` : '';
        if (
            confirm(
                `⚠️ ¿Estás seguro de que deseas eliminar el contrato "${contractName}"?${platformLine}\n\n` +
                    'Esta acción NO se puede deshacer. Si el cliente tiene teléfono, se enviará un WhatsApp de baja indicando las plataformas afectadas.',
            )
        ) {
            setDeletingId(contractId);
            router.delete(route('contracts.destroy', contractId), {
                preserveScroll: true,
                onFinish: () => setDeletingId(null),
            });
        }
    };

    const applyFilters = () => {
        router.get(route('contracts.index'), {
            search: search || undefined,
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
        return { text: `${diffDays} días`, color: 'cyan' };
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
                                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Contratos</h1>
                                <p className="mt-2 text-slate-600 dark:text-slate-300">
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
                        <div className="mb-6 rounded-md bg-cyan-50 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <CheckCircle className="h-5 w-5 text-cyan-400" />
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm font-medium text-cyan-800">
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
                                        <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar contratos..."
                                        className="block w-full bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
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
                                    className="block bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
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
                                    className="block bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <FileText className="h-8 w-8 text-cyan-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Total Contratos</p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{contracts.data.length}</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <Calendar className="h-8 w-8 text-orange-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Por Vencer</p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
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
                                    <Clock className="h-8 w-8 text-cyan-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Vencidos</p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
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
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">Lista de Contratos</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                                <thead className="bg-slate-50 dark:bg-slate-950">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Contrato
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Monto
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Ciclo
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Próximo Vencimiento
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Estadísticas
                                        </th>
                                        <th className="relative px-6 py-3">
                                            <span className="sr-only">Acciones</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                                    {filteredContracts.map((contract) => {
                                        const dueStatus = getDueDateStatus(contract.next_due_date);
                                        return (
                                            <tr key={contract.id} className="hover:bg-slate-50 dark:bg-slate-950">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="flex-shrink-0 h-10 w-10">
                                                            <div className="h-10 w-10 rounded-full bg-cyan-100 flex items-center justify-center">
                                                                <FileText className="h-5 w-5 text-cyan-600" />
                                                            </div>
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                {contract.name}
                                                            </div>
                                                            <div className="text-sm text-slate-500 dark:text-slate-400">
                                                                ID: #{contract.id}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <Users className="h-4 w-4 text-slate-400 dark:text-slate-500 mr-2" />
                                                        <span className="text-sm text-slate-900 dark:text-slate-100">
                                                            {contract.client?.name || 'Sin cliente'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
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
                                                        <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500 mr-2" />
                                                        <div>
                                                            <div className="text-sm text-slate-900 dark:text-slate-100">
                                                                {contract.next_due_date ? new Date(contract.next_due_date).toLocaleDateString('es-CR') : 'Sin fecha'}
                                                            </div>
                                                            <Badge 
                                                                variant="outline"
                                                                className={`text-xs ${
                                                                    dueStatus.color === 'red' ? 'text-red-600 border-red-200' :
                                                                    dueStatus.color === 'orange' ? 'text-orange-600 border-orange-200' :
                                                                    dueStatus.color === 'yellow' ? 'text-yellow-600 border-yellow-200' :
                                                                    'text-cyan-600 border-cyan-200'
                                                                }`}
                                                            >
                                                                {dueStatus.text}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-slate-900 dark:text-slate-100 space-y-1">
                                                        <div className="flex items-center">
                                                            <span className="font-medium">{contract.payments_count}</span>
                                                            <span className="ml-1 text-slate-500 dark:text-slate-400">pagos</span>
                                                        </div>
                                                        <div className="flex items-center">
                                                            <span className="font-medium">{contract.reminders_count}</span>
                                                            <span className="ml-1 text-slate-500 dark:text-slate-400">recordatorios</span>
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
                                                            onClick={() => handleDelete(contract.id, contract.name, contract.services_label)}
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
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                            Mostrando {contracts.meta?.from ?? 0} a {contracts.meta?.to ?? 0} de {contracts.meta?.total ?? filteredContracts.length} contratos
                        </div>
                        <Pagination links={contracts.links ?? []} />
                    </div>

                    {/* Empty State */}
                    {filteredContracts.length === 0 && (
                        <Card className="text-center py-12">
                            <FileText className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500" />
                            <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">No se encontraron contratos</h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
