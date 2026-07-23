import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import Pagination from '@/Components/Pagination';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import StatusBadge from '@/Components/StatusBadge';
import DatePickerInput from '@/Components/DatePickerInput';
import type { PageProps } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { labelForBillingCycle, labelForChannel, labelForStatus } from '@/lib/labels';
import { useEffect, useMemo, useState } from 'react';
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
    RefreshCw,
    Calendar,
    Send,
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

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calendarDiffDays(from: Date, to: Date): number {
    const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
    return Math.round(ms / 86400000);
}

/** Texto corto relativo a “hoy” para la fecha programada (zona local). */
function relativeScheduleLabel(scheduledFor: string | null): string | null {
    if (!scheduledFor) return null;
    const diff = calendarDiffDays(new Date(), new Date(scheduledFor));
    if (diff < -1) return `Hace ${Math.abs(diff)} días`;
    if (diff === -1) return 'Ayer';
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    return `En ${diff} días`;
}

function rowAccentClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'failed') return 'border-l-4 border-l-rose-500';
    if (s === 'queued') return 'border-l-4 border-l-amber-400';
    if (s === 'pending') return 'border-l-4 border-l-amber-500';
    if (s === 'sent') return 'border-l-4 border-l-cyan-500';
    if (s === 'acknowledged') return 'border-l-4 border-l-sky-500';
    if (s === 'paid') return 'border-l-4 border-l-cyan-600';
    return 'border-l-4 border-l-transparent';
}

const QUICK_STATUS_FILTERS: { label: string; value: string }[] = [
    { label: 'Pendientes', value: 'pending' },
    { label: 'En cola', value: 'queued' },
    { label: 'Fallidos', value: 'failed' },
    { label: 'Enviados', value: 'sent' },
    { label: 'Pagados', value: 'paid' },
];

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
    const [sendingId, setSendingId] = useState<number | null>(null);

    useEffect(() => {
        setSearch(filters.client_query || '');
        setStatusFilter(filters.status || '');
        setChannelFilter(filters.channel || '');
        setRecurrenceFilter(filters.recurrence || '');
        setScheduledFrom(filters.scheduled_from || '');
        setScheduledTo(filters.scheduled_to || '');
    }, [
        filters.client_query,
        filters.status,
        filters.channel,
        filters.recurrence,
        filters.scheduled_from,
        filters.scheduled_to,
    ]);

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filters.client_query) n++;
        if (filters.status) n++;
        if (filters.channel) n++;
        if (filters.recurrence) n++;
        if (filters.scheduled_from) n++;
        if (filters.scheduled_to) n++;
        return n;
    }, [filters]);

    const navigateWithFilters = (overrides: Record<string, string | undefined>) => {
        router.get(
            route('reminders.index'),
            {
                client_query: search || undefined,
                status: statusFilter || undefined,
                channel: channelFilter || undefined,
                recurrence: recurrenceFilter || undefined,
                scheduled_from: scheduledFrom || undefined,
                scheduled_to: scheduledTo || undefined,
                ...overrides,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const applyFilters = () => navigateWithFilters({});

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('');
        setChannelFilter('');
        setRecurrenceFilter('');
        setScheduledFrom('');
        setScheduledTo('');
        router.get(route('reminders.index'), {}, { preserveScroll: true, replace: true });
    };

    const applyQuickStatus = (value: string) => {
        const current = filters.status || '';
        const next = current === value ? '' : value;
        setStatusFilter(next);
        router.get(
            route('reminders.index'),
            {
                client_query: search || undefined,
                status: next || undefined,
                channel: channelFilter || undefined,
                recurrence: recurrenceFilter || undefined,
                scheduled_from: scheduledFrom || undefined,
                scheduled_to: scheduledTo || undefined,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const handleDelete = (reminderId: number, clientName: string) => {
        if (
            confirm(
                `¿Eliminar el recordatorio de «${clientName}»?\n\nEsta acción no se puede deshacer.`,
            )
        ) {
            setDeletingId(reminderId);
            router.delete(route('reminders.destroy', reminderId), {
                preserveScroll: true,
                onFinish: () => setDeletingId(null),
            });
        }
    };

    const handleRetry = (reminderId: number) => {
        setRetryingId(reminderId);
        router.post(
            route('reminders.retry', reminderId),
            {},
            {
                preserveScroll: true,
                onFinish: () => setRetryingId(null),
            },
        );
    };

    const handleManualSend = (reminderId: number) => {
        setSendingId(reminderId);
        router.post(
            route('reminders.send-manually', reminderId),
            {},
            {
                preserveScroll: true,
                onFinish: () => setSendingId(null),
            },
        );
    };

    const formatDateTime = (value: string | null) => {
        if (!value) return '—';
        return new Intl.DateTimeFormat('es-CR', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    };

    const getScheduledStatus = (scheduledFor: string | null, sentAt: string | null) => {
        if (sentAt) return { text: 'Enviado', color: 'green' as const };
        if (!scheduledFor) return { text: 'Sin fecha', color: 'gray' as const };
        const diffDays = calendarDiffDays(new Date(), new Date(scheduledFor));
        if (diffDays < 0) return { text: 'Atrasado', color: 'red' as const };
        if (diffDays === 0) return { text: 'Hoy', color: 'orange' as const };
        if (diffDays <= 3) return { text: `${diffDays} días`, color: 'yellow' as const };
        return { text: `${diffDays} días`, color: 'green' as const };
    };

    const statItems = [
        {
            key: 'total',
            label: 'Total',
            value: stats?.total ?? reminders.meta?.total ?? reminders.data.length,
            icon: Bell,
            className: 'text-cyan-700 bg-cyan-50 ring-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-300 dark:ring-cyan-900',
        },
        {
            key: 'pending',
            label: 'Pendientes',
            value: stats?.pending ?? 0,
            icon: Clock,
            className: 'text-amber-700 bg-amber-50 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900',
        },
        {
            key: 'queued',
            label: 'En cola',
            value: stats?.queued ?? 0,
            icon: Send,
            className: 'text-orange-700 bg-orange-50 ring-orange-100 dark:bg-orange-950/30 dark:text-orange-300 dark:ring-orange-900',
        },
        {
            key: 'sent',
            label: 'Enviados',
            value: stats?.sent ?? 0,
            icon: CheckCircle,
            className: 'text-cyan-700 bg-cyan-50 ring-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-300 dark:ring-cyan-900',
        },
        {
            key: 'failed',
            label: 'Fallidos',
            value: stats?.failed ?? 0,
            icon: XCircle,
            className: 'text-rose-700 bg-rose-50 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900',
        },
        {
            key: 'paid',
            label: 'Pagados',
            value: stats?.paid ?? 0,
            icon: CheckCircle,
            className: 'text-cyan-700 bg-cyan-50 ring-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-300 dark:ring-cyan-900',
        },
    ];

    return (
        <ResponsiveLayout title="Recordatorios" contentWidth="full">
            <Head title="Recordatorios" />

            <div className="py-6">
                <div className="w-full max-w-none px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8 border-b border-slate-200 dark:border-slate-800 pb-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Recordatorios</h1>
                                <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">
                                    Programación de avisos por WhatsApp y otros canales. Filtra por estado, revisa cola y
                                    reintenta envíos atascados.
                                </p>
                            </div>
                            <Link href={route('reminders.create')} className="shrink-0">
                                <Button className="w-full sm:w-auto">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Nuevo recordatorio
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {flashSuccess && (
                        <div className="mb-6 rounded-lg border border-cyan-200 bg-cyan-50 p-4 shadow-sm dark:border-cyan-900/60 dark:bg-cyan-950/30">
                            <div className="flex gap-3">
                                <CheckCircle className="h-5 w-5 shrink-0 text-cyan-500" />
                                <p className="text-sm font-medium text-cyan-900 dark:text-cyan-200">{flashSuccess}</p>
                            </div>
                        </div>
                    )}

                    {flashError && (
                        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-sm">
                            <div className="flex gap-3">
                                <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
                                <p className="text-sm font-medium text-rose-900">{flashError}</p>
                            </div>
                        </div>
                    )}

                    {(stats?.stuck_queued > 0 || stats?.overdue_open > 0) && (
                        <div className="mb-6 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm dark:border-amber-900/60 dark:from-amber-950/50 dark:to-orange-950/30">
                            <div className="flex gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                                <div>
                                    <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">Revisión sugerida</p>
                                    <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-300">
                                        <span className="font-medium">{stats.stuck_queued}</span> en cola más de 30
                                        minutos · <span className="font-medium">{stats.overdue_open}</span> abiertos con
                                        fecha vencida. Usa <strong>Reintentar</strong> o filtra por estado para
                                        localizarlos.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Quick filters */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Vista rápida</span>
                        {QUICK_STATUS_FILTERS.map(({ label, value }) => {
                            const active = (filters.status || '') === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => applyQuickStatus(value)}
                                    className={[
                                        'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                                        active
                                            ? 'border-cyan-600 bg-cyan-600 text-white shadow-sm'
                                            : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-cyan-800 dark:hover:bg-slate-900',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Filters */}
                    <Card className="mb-8 overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Filter className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>
                                {activeFilterCount > 0 && (
                                    <Badge variant="outline" className="ml-1 text-xs">
                                        {activeFilterCount} activo{activeFilterCount !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div className="p-5">
                            <div className="flex flex-col gap-5">
                                <div className="w-full max-w-xl">
                                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                                        Cliente, teléfono o contrato
                                    </label>
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                        <input
                                            type="text"
                                            placeholder="Buscar…"
                                            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') applyFilters();
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Estado</label>
                                        <select
                                            className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:border-cyan-500 focus:ring-cyan-500"
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                        >
                                            <option value="">Todos los estados</option>
                                            {statuses.map((status) => (
                                                <option key={status} value={status}>
                                                    {labelForStatus(status)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Canal</label>
                                        <select
                                            className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:border-cyan-500 focus:ring-cyan-500"
                                            value={channelFilter}
                                            onChange={(e) => setChannelFilter(e.target.value)}
                                        >
                                            <option value="">Todos los canales</option>
                                            {channels.map((channel) => (
                                                <option key={channel} value={channel}>
                                                    {labelForChannel(channel)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                                            Recurrencia
                                        </label>
                                        <select
                                            className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 focus:border-cyan-500 focus:ring-cyan-500"
                                            value={recurrenceFilter}
                                            onChange={(e) => setRecurrenceFilter(e.target.value)}
                                        >
                                            <option value="">Todas</option>
                                            {recurrences.map((recurrence) => (
                                                <option key={recurrence} value={recurrence}>
                                                    {labelForBillingCycle(recurrence)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                                            Programado desde
                                        </label>
                                        <DatePickerInput
                                            type="date"
                                            value={scheduledFrom}
                                            onChange={(e) => setScheduledFrom(e.target.value)}
                                            className="w-full min-w-0 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                                            Programado hasta
                                        </label>
                                        <DatePickerInput
                                            type="date"
                                            value={scheduledTo}
                                            onChange={(e) => setScheduledTo(e.target.value)}
                                            className="w-full min-w-0 text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-4 sm:flex-row sm:justify-end">
                                    <Button variant="outline" className="w-full sm:w-auto" onClick={clearFilters}>
                                        Limpiar todo
                                    </Button>
                                    <Button className="w-full sm:w-auto" onClick={applyFilters}>
                                        <Filter className="mr-2 h-4 w-4" />
                                        Aplicar filtros
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Stats */}
                    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        {statItems.map(({ key, label, value, icon: Icon, className }) => (
                            <Card
                                key={key}
                                className={`rounded-xl border-0 p-4 shadow-sm ring-1 ring-inset ${className}`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2 ring-1 ring-black/5">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
                                        <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {reminders.data.length === 0 ? (
                        <Card className="border-dashed py-16 text-center shadow-sm">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                                <Bell className="h-7 w-7 text-slate-400 dark:text-slate-500" />
                            </div>
                            <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">No hay resultados</h3>
                            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                                No hay recordatorios con los filtros actuales. Prueba otra vista rápida o amplía el rango de
                                fechas.
                            </p>
                            <div className="mt-8 flex flex-wrap justify-center gap-3">
                                <Button variant="outline" onClick={clearFilters}>
                                    Quitar filtros
                                </Button>
                                <Link href={route('reminders.create')}>
                                    <Button>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Crear recordatorio
                                    </Button>
                                </Link>
                            </div>
                        </Card>
                    ) : (
                        <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex flex-col gap-1 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Listado</h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {reminders.meta?.total ?? stats?.total ?? reminders.data.length} registro
                                        {(reminders.meta?.total ?? 0) !== 1 ? 's' : ''} · orden por más recientes
                                    </p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-[920px] divide-y divide-slate-200 dark:divide-slate-800">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-950/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            <th className="px-5 py-3">Recordatorio</th>
                                            <th className="px-5 py-3">Cliente</th>
                                            <th className="px-5 py-3">Contrato</th>
                                            <th className="px-5 py-3">Canal</th>
                                            <th className="px-5 py-3">Estado</th>
                                            <th className="px-5 py-3">Programación</th>
                                            <th className="px-5 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                                        {reminders.data.map((reminder) => {
                                            const scheduledStatus = getScheduledStatus(
                                                reminder.scheduled_for,
                                                reminder.sent_at,
                                            );
                                            const rel = relativeScheduleLabel(reminder.scheduled_for);
                                            return (
                                                <tr
                                                    key={reminder.id}
                                                    className={`transition-colors hover:bg-slate-50 dark:bg-slate-950/90 ${rowAccentClass(reminder.status)}`}
                                                >
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 ring-1 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900">
                                                                <Bell className="h-5 w-5" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                                    #{reminder.id}
                                                                </div>
                                                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                                                    {reminder.attempts} intento
                                                                    {reminder.attempts !== 1 ? 's' : ''} ·{' '}
                                                                    {reminder.messages_count} mensaje
                                                                    {reminder.messages_count !== 1 ? 's' : ''}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <Users className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                                                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                {reminder.client?.name || 'Sin cliente'}
                                                            </span>
                                                        </div>
                                                        {reminder.client?.phone && (
                                                            <div className="mt-1 pl-6 text-xs text-slate-500 dark:text-slate-400">
                                                                {reminder.client.phone}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-start gap-2">
                                                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                                                            <div>
                                                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                    {reminder.contract?.name || '—'}
                                                                </span>
                                                                {reminder.contract && (
                                                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                                                        {reminder.contract.amount}{' '}
                                                                        {reminder.contract.currency}
                                                                    </div>
                                                                )}
                                                                {reminder.recurrence && (
                                                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                        {labelForBillingCycle(reminder.recurrence)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <Badge variant="outline" className="font-normal">
                                                            {labelForChannel(reminder.channel)}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <StatusBadge status={reminder.status} />
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                            {formatDateTime(reminder.scheduled_for)}
                                                        </div>
                                                        {rel && !reminder.sent_at && (
                                                            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{rel}</div>
                                                        )}
                                                        <Badge
                                                            variant="outline"
                                                            className={`mt-1 text-xs font-medium ${
                                                                scheduledStatus.color === 'red'
                                                                    ? 'border-rose-200 text-rose-700'
                                                                    : scheduledStatus.color === 'orange'
                                                                      ? 'border-orange-200 text-orange-700'
                                                                      : scheduledStatus.color === 'yellow'
                                                                        ? 'border-amber-200 text-amber-800'
                                                                        : scheduledStatus.color === 'green'
                                                                          ? 'border-cyan-200 text-cyan-700'
                                                                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                                                            }`}
                                                        >
                                                            {scheduledStatus.text}
                                                        </Badge>
                                                        {(reminder.queued_at || reminder.last_attempt_at || reminder.sent_at) && (
                                                            <div className="mt-1.5 max-w-[14rem] text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                                                {reminder.sent_at
                                                                    ? `Enviado: ${formatDateTime(reminder.sent_at)}`
                                                                    : reminder.queued_at
                                                                      ? `En cola: ${formatDateTime(reminder.queued_at)}`
                                                                      : `Último intento: ${formatDateTime(reminder.last_attempt_at)}`}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                            {['queued', 'failed'].includes(reminder.status) && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleRetry(reminder.id)}
                                                                    disabled={retryingId === reminder.id}
                                                                    title="Volver a pendiente para reintento"
                                                                    className="shrink-0"
                                                                >
                                                                    <RefreshCw className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            {reminder.channel === 'whatsapp' && ['pending', 'failed'].includes(reminder.status) && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleManualSend(reminder.id)}
                                                                    disabled={sendingId === reminder.id}
                                                                    title="Enviar manualmente por WhatsApp"
                                                                    className="shrink-0 text-cyan-700 hover:text-cyan-800"
                                                                >
                                                                    <Send className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            <Link href={route('reminders.show', reminder.id)}>
                                                                <Button variant="outline" size="sm" title="Ver detalle">
                                                                    <Eye className="h-4 w-4" />
                                                                </Button>
                                                            </Link>
                                                            <Link href={route('reminders.edit', reminder.id)}>
                                                                <Button variant="outline" size="sm" title="Editar">
                                                                    <Edit className="h-4 w-4" />
                                                                </Button>
                                                            </Link>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() =>
                                                                    handleDelete(
                                                                        reminder.id,
                                                                        reminder.client?.name || `#${reminder.id}`,
                                                                    )
                                                                }
                                                                disabled={deletingId === reminder.id}
                                                                className="shrink-0 text-rose-600 hover:text-rose-700"
                                                                title="Eliminar"
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
                    )}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Mostrando {reminders.meta?.from ?? 0} – {reminders.meta?.to ?? 0} de{' '}
                            {reminders.meta?.total ?? stats?.total ?? 0}
                        </p>
                        <Pagination links={reminders.links ?? []} />
                    </div>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
