import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import PrimaryButton from '@/Components/PrimaryButton';
import type { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';

interface ClientResource {
    id: number;
    name: string;
    // legal_id removed
    email: string | null;
    phone: string | null;
    status: string;
    notes: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
}

interface ContractSummary {
    id: number;
    name: string;
    amount: string;
    currency: string | null;
    billing_cycle: string;
    next_due_date: string | null;
    updated_at: string | null;
}

interface ReminderSummary {
    id: number;
    status: string;
    scheduled_for: string | null;
    sent_at: string | null;
    acknowledged_at: string | null;
    contract: { id: number; name: string } | null;
}

interface PaymentSummary {
    id: number;
    amount: string;
    currency: string | null;
    status: string;
    paid_at: string | null;
    reference: string | null;
    conciliation_status: string | null;
}

interface ClientShowPageProps extends PageProps<{
    client: ClientResource;
    stats: {
        contracts: number;
        reminders: number;
        payments: number;
    };
    contracts: ContractSummary[];
    reminders: ReminderSummary[];
    payments: PaymentSummary[];
}> {}

const formatDate = (value: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleDateString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

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

const formatAmount = (amount: string, currency: string | null | undefined) =>
    new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
        minimumFractionDigits: 2,
    }).format(Number.parseFloat(amount));

export default function ClientShow({ client, stats, contracts, reminders, payments }: ClientShowPageProps) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">
                            {client.name}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Seguimiento detallado del cliente y sus operaciones de cobranza.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={client.status} />
                        <Link href={route('clients.contracts.create', client.id)}>
                            <PrimaryButton>+ Contrato</PrimaryButton>
                        </Link>
                        <Link
                            href={route('clients.edit', client.id)}
                            className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700"
                        >
                            Editar
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title={`Cliente ${client.name}`} />

            <div className="py-12">
                <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
                    <section className="grid gap-6 md:grid-cols-3">
                        <article className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Contratos</h3>
                            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{stats.contracts}</p>
                            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                                Última actualización: {formatDate(client.updated_at)}
                            </p>
                        </article>
                        <article className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Recordatorios</h3>
                            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{stats.reminders}</p>
                            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                                Próximo recordatorio registrado en el listado inferior.
                            </p>
                        </article>
                        <article className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Pagos</h3>
                            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{stats.payments}</p>
                            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Incluye pagos pendientes de conciliación.</p>
                        </article>
                    </section>

                    <section className="grid gap-6 lg:grid-cols-2">
                        <article className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Información de contacto</h3>
                            <dl className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                <div className="flex justify-between">
                                    <dt className="text-gray-500 dark:text-gray-400">Correo</dt>
                                    <dd className="font-medium text-gray-900 dark:text-gray-100">{client.email ?? '—'}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500 dark:text-gray-400">Teléfono</dt>
                                    <dd className="font-medium text-gray-900 dark:text-gray-100">{client.phone ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Notas</dt>
                                    <dd className="mt-1 whitespace-pre-line text-sm text-gray-900 dark:text-gray-100">
                                        {client.notes ? client.notes : 'Sin notas registradas.'}
                                    </dd>
                                </div>
                            </dl>
                        </article>

                        <article className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Resumen reciente</h3>
                            <ul className="mt-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                                <li>
                                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Próximos recordatorios</p>
                                    <ul className="mt-2 space-y-2">
                                        {reminders.length ? (
                                            reminders.map((reminder) => (
                                                <li key={reminder.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                                                    <div>
                                                        <p className="font-medium text-gray-900 dark:text-gray-100">
                                                            {reminder.contract?.name ?? 'Recordatorio general'}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Programado: {formatDateTime(reminder.scheduled_for)}</p>
                                                    </div>
                                                    <StatusBadge status={reminder.status} />
                                                </li>
                                            ))
                                        ) : (
                                            <li className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-6 text-center text-gray-400">
                                                Sin recordatorios recientes
                                            </li>
                                        )}
                                    </ul>
                                </li>

                                <li>
                                    <p className="mt-4 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Pagos asociados</p>
                                    <ul className="mt-2 space-y-2">
                                        {payments.length ? (
                                            payments.map((payment) => (
                                                <li key={payment.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium text-gray-900 dark:text-gray-100">
                                                            {formatAmount(payment.amount, payment.currency)}
                                                        </p>
                                                        <StatusBadge status={payment.status} />
                                                    </div>
                                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                        Pagado: {formatDate(payment.paid_at)} · Ref: {payment.reference ?? '—'}
                                                    </p>
                                                    {payment.conciliation_status && (
                                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            Conciliación: {payment.conciliation_status}
                                                        </p>
                                                    )}
                                                </li>
                                            ))
                                        ) : (
                                            <li className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-6 text-center text-gray-400">
                                                Sin pagos recientes
                                            </li>
                                        )}
                                    </ul>
                                </li>
                            </ul>
                        </article>
                    </section>

                    <section className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Contratos recientes</h3>
                            <Link
                                href={route('reminders.index', { client_id: client.id })}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            >
                                Ver recordatorios del cliente
                            </Link>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Contrato</th>
                                        <th className="px-4 py-2 text-left font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Monto</th>
                                        <th className="px-4 py-2 text-left font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Ciclo</th>
                                        <th className="px-4 py-2 text-left font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Próximo vencimiento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {contracts.length ? (
                                        contracts.map((contract) => (
                                            <tr key={contract.id} className="hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700">
                                                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{contract.name}</td>
                                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                                    {formatAmount(contract.amount, contract.currency)}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{contract.billing_cycle}</td>
                                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{contract.next_due_date ? formatDate(contract.next_due_date) : '—'}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td className="px-4 py-6 text-center text-gray-400" colSpan={4}>
                                                Aún no hay contratos registrados para este cliente.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
