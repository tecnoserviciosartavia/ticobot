import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';

interface ContractResource {
    id: number;
    client: { id: number; name: string; email: string | null; phone: string | null } | null;
    name: string;
    amount: string;
    currency: string | null;
    billing_cycle: string;
    next_due_date: string | null;
    grace_period_days: number;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
}

interface ReminderSummary {
    id: number;
    status: string;
    scheduled_for: string | null;
    sent_at: string | null;
    acknowledged_at: string | null;
    attempts: number;
}

interface PaymentSummary {
    id: number;
    amount: string;
    currency: string | null;
    status: string;
    reference: string | null;
    paid_at: string | null;
    conciliation_status: string | null;
}

interface ContractShowProps extends PageProps<{
    contract: ContractResource;
    reminders: ReminderSummary[];
    payments: PaymentSummary[];
}> {}

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatCurrency = (amount: string, currency: string | null | undefined) =>
    new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
        minimumFractionDigits: 2,
    }).format(Number.parseFloat(amount));

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

    return new Date(value).toLocaleString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function ContractsShow({ contract, reminders, payments }: ContractShowProps) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold leading-tight text-gray-800">{contract.name}</h2>
                        <p className="text-sm text-gray-500">
                            Detalles del contrato y seguimiento de recordatorios y pagos vinculados.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href={route('contracts.index')}
                            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                        >
                            ← Volver
                        </Link>
                        <Link
                            href={route('contracts.edit', contract.id)}
                            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                        >
                            Editar
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title={`Contrato ${contract.name}`} />
            <div className="py-12">
                <div className="mx-auto max-w-6xl space-y-6 sm:px-6 lg:px-8">
                    <section className="grid gap-6 md:grid-cols-2">
                        <article className="rounded-xl bg-white p-6 shadow">
                            <h3 className="text-base font-semibold text-gray-900">Información general</h3>
                            <dl className="mt-4 space-y-3 text-sm text-gray-700">
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Cliente</dt>
                                    <dd className="font-medium text-indigo-600">
                                        {contract.client ? (
                                            <Link href={route('clients.show', contract.client.id)} className="hover:text-indigo-500">
                                                {contract.client.name}
                                            </Link>
                                        ) : (
                                            '—'
                                        )}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Monto</dt>
                                    <dd className="font-medium text-gray-900">{formatCurrency(contract.amount, contract.currency)}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Ciclo</dt>
                                    <dd className="font-medium text-gray-900">{contract.billing_cycle}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Próximo vencimiento</dt>
                                    <dd className="font-medium text-gray-900">{formatDate(contract.next_due_date)}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Días de gracia</dt>
                                    <dd className="font-medium text-gray-900">{contract.grace_period_days}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Creado</dt>
                                    <dd className="font-medium text-gray-900">{formatDate(contract.created_at)}</dd>
                                </div>
                            </dl>
                        </article>
                        <article className="rounded-xl bg-white p-6 shadow">
                            <h3 className="text-base font-semibold text-gray-900">Contacto del cliente</h3>
                            <dl className="mt-4 space-y-3 text-sm text-gray-700">
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Correo</dt>
                                    <dd className="font-medium text-gray-900">{contract.client?.email ?? '—'}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Teléfono</dt>
                                    <dd className="font-medium text-gray-900">{contract.client?.phone ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-gray-500">Metadatos</dt>
                                    <dd className="mt-1 whitespace-pre-line text-xs text-gray-500">
                                        {contract.metadata ? JSON.stringify(contract.metadata, null, 2) : 'Sin metadatos registrados.'}
                                    </dd>
                                </div>
                            </dl>
                        </article>
                    </section>

                    <section className="grid gap-6 md:grid-cols-2">
                        <article className="rounded-xl bg-white p-6 shadow">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-gray-900">Recordatorios recientes</h3>
                                <Link href={route('reminders.index', { contract_id: contract.id })} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                                    Ver listado
                                </Link>
                            </div>
                            <ul className="mt-4 space-y-3">
                                {reminders.length ? (
                                    reminders.map((reminder) => (
                                        <li key={reminder.id} className="flex items-start justify-between rounded-lg border border-gray-200 p-3">
                                            <div className="text-sm text-gray-700">
                                                <p className="font-semibold text-gray-900">Programado: {formatDateTime(reminder.scheduled_for)}</p>
                                                <p className="text-xs text-gray-500">Enviado: {formatDateTime(reminder.sent_at)}</p>
                                                <p className="text-xs text-gray-500">Respuesta: {formatDateTime(reminder.acknowledged_at)}</p>
                                                <p className="text-xs text-gray-500">Intentos: {reminder.attempts}</p>
                                            </div>
                                            <StatusBadge status={reminder.status} />
                                        </li>
                                    ))
                                ) : (
                                    <li className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-gray-400">
                                        Sin recordatorios asociados.
                                    </li>
                                )}
                            </ul>
                        </article>

                        <article className="rounded-xl bg-white p-6 shadow">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-gray-900">Pagos recientes</h3>
                                <Link href={route('payments.index', { contract_id: contract.id })} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                                    Ver listado
                                </Link>
                            </div>
                            <ul className="mt-4 space-y-3">
                                {payments.length ? (
                                    payments.map((payment) => (
                                        <li key={payment.id} className="rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
                                            <div className="flex items-center justify-between">
                                                <p className="font-semibold text-gray-900">{formatCurrency(payment.amount, payment.currency)}</p>
                                                <StatusBadge status={payment.status} />
                                            </div>
                                            <p className="text-xs text-gray-500">Pagado: {formatDate(payment.paid_at)}</p>
                                            <p className="text-xs text-gray-500">Referencia: {payment.reference ?? '—'}</p>
                                            {payment.conciliation_status && (
                                                <p className="text-xs text-gray-500">Conciliación: {payment.conciliation_status}</p>
                                            )}
                                        </li>
                                    ))
                                ) : (
                                    <li className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-gray-400">
                                        Sin pagos asociados.
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
