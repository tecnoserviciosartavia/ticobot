import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import Pagination from '@/Components/Pagination';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { labelForBillingCycle, labelForChannel, labelForStatus } from '@/lib/labels';
import { useState } from 'react';
import { 
  Clock, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  CheckCircle,
  XCircle,
  AlertCircle,
  Bell,
  Users,
  FileText,
  RefreshCw
} from '@/Components/icons';

interface Reminder {
    id: number;
    status: string;
    channel: string;
    scheduled_for: string | null;
    queued_at: string | null;
    sent_at: string | null;
    last_attempt_at: string | null;
    acknowledged_at: string | null;
    attempts: number;
    messages_count: number;
    client: { id: number; name: string; phone: string | null } | null;
    contract: { id: number; name: string; amount: string; currency: string } | null;
    recurrence: string | null;
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

interface RemindersPageProps extends PageProps {
    reminders: Paginated<Reminder>;
    filters: {
        status?: string;
        channel?: string;
        client_query?: string;
        recurrence?: string;
        scheduled_from?: string;
        scheduled_to?: string;
    };
    statuses: string[];
    channels: string[];
    recurrences: string[];
    stats: {
        total: number;
        pending: number;
        queued: number;
        sent: number;
        failed: number;
        paid: number;
        stuck_queued: number;
        overdue_open: number;
    };
    flashSuccess?: string;
    flashError?: string;
}

export default function RemindersIndex() {
    const { props } = usePage<RemindersPageProps>();
    const { reminders, filters, flashSuccess, flashError, statuses = [], channels = [], recurrences = [], stats } = props;
    
    const [search, setSearch] = useState(filters.client_query || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || '');
    const [channelFilter, setChannelFilter] = useState(filters.channel || '');
    const [recurrenceFilter, setRecurrenceFilter] = useState(filters.recurrence || '');
    const [scheduledFrom, setScheduledFrom] = useState(filters.scheduled_from || '');
    const [scheduledTo, setScheduledTo] = useState(filters.scheduled_to || '');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [retryingId, setRetryingId] = useState<number | null>(null);

    const applyFilters = () => {
        router.get(route('reminders.index'), {
            client_query: search || undefined,
            status: statusFilter || undefined,
            channel: channelFilter || undefined,
            recurrence: recurrenceFilter || undefined,
            scheduled_from: scheduledFrom || undefined,
            scheduled_to: scheduledTo || undefined,
        }, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('');
        setChannelFilter('');
        setRecurrenceFilter('');
        setScheduledFrom('');
        setScheduledTo('');
        router.get(route('reminders.index'), {}, { preserveScroll: true, replace: true });
    };

    const handleDelete = (reminderId: number, clientName: string) => {
        if (confirm(`⚠️ ¿Estás seguro de que deseas eliminar el recordatorio de "${clientName}"?\n\nEsta acción NO se puede deshacer.`)) {
            setDeletingId(reminderId);
            router.delete(route('reminders.destroy', reminderId), {
                preserveScroll: true,
                onFinish: () => setDeletingId(null),
            });
        }
    };

    const handleRetry = (reminderId: number) => {
        setRetryingId(reminderId);
        router.post(route('reminders.retry', reminderId), {}, {
            preserveScroll: true,
            onFinish: () => setRetryingId(null),
        });
    };

    const formatDateTime = (value: string | null) => {
        if (!value) return '—';
        return new Intl.DateTimeFormat('es-CR', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'sent':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'acknowledged':
                return <AlertCircle className="h-4 w-4 text-blue-500" />;
            default:
                return <Clock className="h-4 w-4 text-yellow-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'sent':
                return 'bg-green-100 text-green-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'acknowledged':
                return 'bg-blue-100 text-blue-800';
            default:
                return 'bg-yellow-100 text-yellow-800';
        }
    };

    const getScheduledStatus = (scheduledFor: string | null, sentAt: string | null) => {
        if (sentAt) return { text: 'Enviado', color: 'green' };
        if (!scheduledFor) return { text: 'Sin fecha', color: 'gray' };
        
        const today = new Date();
        const scheduled = new Date(scheduledFor);
        const diffDays = Math.ceil((scheduled.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return { text: 'Atrasado', color: 'red' };
        if (diffDays === 0) return { text: 'Hoy', color: 'orange' };
        if (diffDays <= 3) return { text: `${diffDays} días`, color: 'yellow' };
        return { text: `${diffDays} días`, color: 'green' };
    };

    return (
        <ResponsiveLayout title="Recordatorios">
            <Head title="Recordatorios" />
            
            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Recordatorios</h1>
                                <p className="mt-2 text-gray-600">
                                    Gestiona el envío automático de recordatorios a clientes
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={route('reminders.create')}>
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Recordatorio
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

                    {flashError && (
                        <div className="mb-6 rounded-md bg-red-50 p-4">
                            <div className="flex">
                                <XCircle className="h-5 w-5 text-red-400" />
                                <div className="ml-3">
                                    <p className="text-sm font-medium text-red-800">{flashError}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {(stats?.stuck_queued > 0 || stats?.overdue_open > 0) && (
                        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4">
                            <div className="flex gap-3">
                                <AlertCircle className="h-5 w-5 flex-none text-amber-600" />
                                <div>
                                    <p className="text-sm font-semibold text-amber-900">Hay recordatorios que requieren revisión</p>
                                    <p className="mt-1 text-sm text-amber-800">
                                        {stats.stuck_queued} en cola por más de 30 minutos y {stats.overdue_open} abiertos con fecha vencida. Usa el filtro de estado y la acción de reintento para devolverlos a pendientes.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Search and Filters */}
                    <Card className="mb-6 p-6">
                        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_repeat(5,minmax(140px,auto))_auto_auto] lg:items-end">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Cliente, teléfono o contrato</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar recordatorios..."
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') applyFilters();
                                        }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
                                <select
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="">Todos los estados</option>
                                    {statuses.map((status) => (
                                        <option key={status} value={status}>{labelForStatus(status)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Canal</label>
                                <select
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    value={channelFilter}
                                    onChange={(e) => setChannelFilter(e.target.value)}
                                >
                                    <option value="">Todos los canales</option>
                                    {channels.map((channel) => (
                                        <option key={channel} value={channel}>{labelForChannel(channel)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Recurrencia</label>
                                <select
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    value={recurrenceFilter}
                                    onChange={(e) => setRecurrenceFilter(e.target.value)}
                                >
                                    <option value="">Todas</option>
                                    {recurrences.map((recurrence) => (
                                        <option key={recurrence} value={recurrence}>{labelForBillingCycle(recurrence)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Desde</label>
                                <input
                                    type="date"
                                    value={scheduledFrom}
                                    onChange={(e) => setScheduledFrom(e.target.value)}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">Hasta</label>
                                <input
                                    type="date"
                                    value={scheduledTo}
                                    onChange={(e) => setScheduledTo(e.target.value)}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                            </div>
                            <Button variant="outline" size="sm" onClick={applyFilters}>
                                    <Filter className="w-4 h-4 mr-2" />
                                    Aplicar
                            </Button>
                            <Button variant="ghost" size="sm" onClick={clearFilters}>
                                Limpiar
                            </Button>
                        </div>
                    </Card>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <Bell className="h-8 w-8 text-blue-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Total Recordatorios</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.total ?? reminders.meta?.total ?? reminders.data.length}</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <CheckCircle className="h-8 w-8 text-green-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Enviados</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.sent ?? 0}</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <Clock className="h-8 w-8 text-orange-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Pendientes</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.pending ?? 0}</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <AlertCircle className="h-8 w-8 text-purple-600" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">En cola / fallidos</p>
                                    <p className="text-2xl font-bold text-gray-900">{(stats?.queued ?? 0) + (stats?.failed ?? 0)}</p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Reminders Table */}
                    <Card className="overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-medium text-gray-900">Lista de Recordatorios</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Recordatorio
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Contrato
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Canal
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Programación
                                        </th>
                                        <th className="relative px-6 py-3">
                                            <span className="sr-only">Acciones</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {reminders.data.map((reminder) => {
                                        const scheduledStatus = getScheduledStatus(reminder.scheduled_for, reminder.sent_at);
                                        return (
                                            <tr key={reminder.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="flex-shrink-0 h-10 w-10">
                                                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                                                <Bell className="h-5 w-5 text-blue-600" />
                                                            </div>
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-sm font-medium text-gray-900">
                                                                Recordatorio #{reminder.id}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                {reminder.attempts} intentos · {reminder.messages_count} mensajes
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <Users className="h-4 w-4 text-gray-400 mr-2" />
                                                        <span className="text-sm text-gray-900">
                                                            {reminder.client?.name || 'Sin cliente'}
                                                        </span>
                                                    </div>
                                                    {reminder.client?.phone && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {reminder.client.phone}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <FileText className="h-4 w-4 text-gray-400 mr-2" />
                                                        <span className="text-sm text-gray-900">
                                                            {reminder.contract?.name || 'Sin contrato'}
                                                        </span>
                                                    </div>
                                                    {reminder.contract && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {reminder.contract.amount} {reminder.contract.currency}
                                                        </div>
                                                    )}
                                                    {reminder.recurrence && (
                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {labelForBillingCycle(reminder.recurrence)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <Badge variant="outline">
                                                        {labelForChannel(reminder.channel)}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        {getStatusIcon(reminder.status)}
                                                        <Badge 
                                                            className={`ml-2 ${getStatusColor(reminder.status)}`}
                                                        >
                                                            {labelForStatus(reminder.status)}
                                                        </Badge>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {formatDateTime(reminder.scheduled_for)}
                                                    </div>
                                                    <Badge 
                                                        variant="outline"
                                                        className={`text-xs ${
                                                            scheduledStatus.color === 'red' ? 'text-red-600 border-red-200' :
                                                            scheduledStatus.color === 'orange' ? 'text-orange-600 border-orange-200' :
                                                            scheduledStatus.color === 'yellow' ? 'text-yellow-600 border-yellow-200' :
                                                            'text-green-600 border-green-200'
                                                        }`}
                                                    >
                                                        {scheduledStatus.text}
                                                    </Badge>
                                                    {(reminder.queued_at || reminder.last_attempt_at || reminder.sent_at) && (
                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {reminder.sent_at
                                                                ? `Enviado: ${formatDateTime(reminder.sent_at)}`
                                                                : reminder.queued_at
                                                                    ? `En cola: ${formatDateTime(reminder.queued_at)}`
                                                                    : `Último intento: ${formatDateTime(reminder.last_attempt_at)}`}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex items-center justify-end space-x-2">
                                                        {['queued', 'failed'].includes(reminder.status) && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleRetry(reminder.id)}
                                                                disabled={retryingId === reminder.id}
                                                                title="Devolver a pendiente para que el bot lo vuelva a tomar"
                                                            >
                                                                <RefreshCw className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                        <Link href={route('reminders.show', reminder.id)}>
                                                            <Button variant="outline" size="sm">
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                        <Link href={route('reminders.edit', reminder.id)}>
                                                            <Button variant="outline" size="sm">
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleDelete(reminder.id, reminder.client?.name || `#${reminder.id}`)}
                                                            disabled={deletingId === reminder.id}
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
                            Mostrando {reminders.meta?.from ?? 0} a {reminders.meta?.to ?? 0} de {reminders.meta?.total ?? stats?.total ?? 0} recordatorios
                        </div>
                        <Pagination links={reminders.links ?? []} />
                    </div>

                    {/* Empty State */}
                    {reminders.data.length === 0 && (
                        <Card className="text-center py-12">
                            <Bell className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron recordatorios</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Comienza creando un nuevo recordatorio o ajusta los filtros de búsqueda.
                            </p>
                            <div className="mt-6">
                                <Link href={route('reminders.create')}>
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nuevo Recordatorio
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
