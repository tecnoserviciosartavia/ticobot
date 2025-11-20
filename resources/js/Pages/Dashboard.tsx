import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';

type DashboardPageProps = PageProps<{
    metrics: {
        clients: { total: number; active: number };
        contracts: { active: number; dueSoon: number };
        reminders: { pending: number; scheduledToday: number; sentToday: number };
        payments: { unverified: number; verified: number; receivedToday: number };
        conciliations: { pending: number; approved: number };
    };
    recentReminders: Array<{
        id: number;
        status: string;
        scheduled_for: string | null;
        client: { id: number; name: string } | null;
        contract: { id: number; name: string } | null;
    }>;
    pendingConciliations: Array<{
        id: number;
        status: string;
        payment: {
            id: number | null;
            amount: string | number | null;
            currency: string | null;
            reference: string | null;
        };
        client: { id: number; name: string } | null;
        contract: { id: number; name: string } | null;
        updated_at: string | null;
    }>;
}>;

const formatDateTime = (value: string | null) => {
    if (!value) {
        return '—';
    }

    const d = new Date(value);
    const date = d.toLocaleDateString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Costa_Rica',
    });
    const time = d.toLocaleTimeString('es-CR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Costa_Rica',
    });

    return `${date}, ${time}`;
};

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatAmount = (amount: string | number | null, currency: string | null | undefined) => {
    if (amount === null) {
        return '—';
    }

    return new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
    }).format(typeof amount === 'string' ? Number.parseFloat(amount) : amount);
};

export default function Dashboard({ metrics, recentReminders, pendingConciliations }: DashboardPageProps) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">
                        Panel de control
                    </h2>
                    <p className="text-sm text-gray-500">
                        Visión general del estado de cobranza y conciliaciones en curso.
                    </p>
                </div>
            }
        >
            <Head title="Dashboard" />

            <div className="py-12">
                <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
                    <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        <article className="rounded-xl bg-white p-6 shadow">
                            <h3 className="text-sm font-medium text-gray-500">Clientes</h3>
                            <div className="mt-3 flex items-end gap-4">
                                <span className="text-3xl font-semibold text-gray-900">{metrics.clients.total}</span>
                                <span className="text-sm text-gray-500">{metrics.clients.active} activos</span>
                            </div>
                            <Link
                                href={route('clients.index')}
                                className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                                Ver clientes
                            </Link>
                        </article>

                        <article className="rounded-xl bg-white p-6 shadow">
                            <h3 className="text-sm font-medium text-gray-500">Contratos</h3>
                            <div className="mt-3 flex items-end gap-4">
                                <span className="text-3xl font-semibold text-gray-900">{metrics.contracts.active}</span>
                                <span className="text-sm text-gray-500">{metrics.contracts.dueSoon} vencen pronto</span>
                            </div>
                            <Link
                                href={route('reminders.index')}
                                className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                                Administrar recordatorios
                            </Link>
                        </article>

                        <article className="rounded-xl bg-white p-6 shadow">
                            <h3 className="text-sm font-medium text-gray-500">Recordatorios</h3>
                            <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-xs text-gray-500">Pendientes</p>
                                    <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.reminders.pending}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Hoy</p>
                                    <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.reminders.scheduledToday}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Enviados hoy</p>
                                    <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.reminders.sentToday}</p>
                                </div>
                            </div>
                        </article>

                        <article className="rounded-xl bg-white p-6 shadow">
                            <h3 className="text-sm font-medium text-gray-500">Pagos</h3>
                            <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-xs text-gray-500">Por conciliar</p>
                                    <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.payments.unverified}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Verificados</p>
                                    <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.payments.verified}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Recibidos hoy</p>
                                    <p className="mt-1 text-xl font-semibold text-gray-900">{metrics.payments.receivedToday}</p>
                                </div>
                            </div>
                            <Link
                                href={route('payments.index')}
                                className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                                Revisar pagos
                            </Link>
                        </article>

                        <article className="rounded-xl bg-white p-6 shadow">
                            <h3 className="text-sm font-medium text-gray-500">Conciliaciones</h3>
                            <div className="mt-3 flex items-end gap-4">
                                <span className="text-3xl font-semibold text-gray-900">{metrics.conciliations.pending}</span>
                                <span className="text-sm text-gray-500">{metrics.conciliations.approved} aprobadas</span>
                            </div>
                            <Link
                                href={route('conciliations.index')}
                                className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                                Ir a conciliaciones
                            </Link>
                        </article>
                    </section>

                    <section className="grid gap-6 lg:grid-cols-2">
                        <article className="rounded-xl bg-white p-6 shadow">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-gray-900">
                                    Próximos recordatorios
                                </h3>
                                <Link
                                    href={route('reminders.index')}
                                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                    Ver todos
                                </Link>
                            </div>
                            <ul className="mt-4 space-y-4">
                                {recentReminders.length ? (
                                    recentReminders.map((reminder) => (
                                        <li key={reminder.id} className="flex items-start justify-between rounded-lg border border-gray-100 p-4">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">
                                                    {reminder.client?.name ?? 'Cliente eliminado'}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    {reminder.contract?.name ?? 'Sin contrato'}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    Programado: {formatDateTime(reminder.scheduled_for)}
                                                </p>
                                            </div>
                                            <StatusBadge status={reminder.status} />
                                        </li>
                                    ))
                                ) : (
                                    <li className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                        No hay recordatorios programados recientemente.
                                    </li>
                                )}
                            </ul>
                        </article>

                        <article className="rounded-xl bg-white p-6 shadow">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-gray-900">
                                    Conciliaciones en revisión
                                </h3>
                                <Link
                                    href={route('conciliations.index')}
                                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                >
                                    Gestionar
                                </Link>
                            </div>
                            <ul className="mt-4 space-y-4">
                                {pendingConciliations.length ? (
                                    pendingConciliations.map((item) => (
                                        <li key={item.id} className="flex items-start justify-between rounded-lg border border-gray-100 p-4">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">
                                                    {item.client?.name ?? 'Cliente eliminado'}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    {item.contract?.name ?? 'Sin contrato asociado'}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    Pago: {formatAmount(item.payment.amount, item.payment.currency)} ({item.payment.reference ?? 'sin ref'})
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    Actualizado: {formatDateTime(item.updated_at)}
                                                </p>
                                            </div>
                                            <StatusBadge status={item.status} />
                                        </li>
                                    ))
                                ) : (
                                    <li className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                        No hay conciliaciones pendientes.
                                    </li>
                                )}
                            </ul>
                        </article>
                    </section>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
