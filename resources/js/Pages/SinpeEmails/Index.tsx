import AccountingTabs from '@/Components/AccountingTabs';
import Pagination from '@/Components/Pagination';
import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { labelForStatus } from '@/lib/labels';
import { Fragment, FormEvent, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import axios from 'axios';

interface SinpeEmailTransaction {
    id: number;
    reference: string | null;
    origin_phone: string | null;
    origin_name: string | null;
    motive: string | null;
    amount: string | number;
    performed_at: string | null;
    mail_subject: string | null;
    is_read: boolean;
    status: string;
    notes: string | null;
    client: { id: number; name: string } | null;
    contract: { id: number; name: string } | null;
    payment: { id: number; status: string } | null;
}

interface ClientOption {
    id: number;
    name: string;
}

interface ContractOption {
    id: number;
    name: string;
    amount: number;
    currency: string;
    billing_cycle?: string | null;
}

interface Paginated<T> {
    data: T[];
    links: Array<{ url: string | null; label: string; active: boolean }>;
    meta: { from: number | null; to: number | null; total: number };
}

type PageData = PageProps<{
    transactions: Paginated<SinpeEmailTransaction>;
    filters: { status?: string | null; read?: string | null };
    statuses: string[];
    clients: ClientOption[];
}>;

const formatDateTime = (value: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    return d.toLocaleString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Costa_Rica',
    });
};

const formatAmount = (amount: string | number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(
        typeof amount === 'string' ? parseFloat(amount) : amount,
    );

const currentBillingMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const labelForEmailStatus = (status: string) => {
    switch (status) {
        case 'skipped':     return 'Sin conciliar';
        case 'in_review':   return 'En revisión';
        case 'approved':
        case 'conciliated': return 'Conciliado';
        case 'error':       return 'Error';
        default:            return labelForStatus(status);
    }
};

const classForEmailStatus = (status: string) => {
    switch (status) {
        case 'skipped':     return 'bg-amber-100 text-amber-800 ring-amber-500/40';
        case 'in_review':   return 'bg-blue-100 text-blue-800 ring-blue-500/40';
        case 'approved':
        case 'conciliated': return 'bg-emerald-100 text-emerald-800 ring-emerald-500/40';
        case 'error':       return 'bg-rose-100 text-rose-800 ring-rose-500/40';
        default:            return 'bg-slate-100 text-slate-800 ring-slate-500/40';
    }
};

export default function SinpeEmailsIndex({ transactions, filters, statuses, clients }: PageData) {
    const { data, setData } = useForm<{ status: string; read: string }>({
        status: filters.status ?? '',
        read: filters.read ?? '',
    });

    const rows = transactions?.data ?? [];
    const paginationLinks = transactions?.links ?? [];
    const paginationMeta = transactions?.meta ?? { from: 0, to: 0, total: 0 };

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState<SinpeEmailTransaction | null>(null);
    const [clientId, setClientId] = useState('');
    const [contractId, setContractId] = useState('');
    const [contracts, setContracts] = useState<ContractOption[]>([]);
    const [loadingContracts, setLoadingContracts] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [updateClientName, setUpdateClientName] = useState(false);
    const [billingMonth, setBillingMonth] = useState(currentBillingMonth());

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<SinpeEmailTransaction | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('sinpe-emails.index'), { ...data }, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        setData('status', '');
        setData('read', '');
        router.get(route('sinpe-emails.index'), {}, { preserveScroll: true, replace: true });
    };

    const openConciliate = (tx: SinpeEmailTransaction) => {
        setSelected(tx);
        setClientId('');
        setContractId('');
        setContracts([]);
        setFormError(null);
        setBillingMonth(currentBillingMonth());
        setModalOpen(true);
    };

    const handleClientChange = async (newClientId: string) => {
        setClientId(newClientId);
        setContractId('');
        setContracts([]);
        setBillingMonth(currentBillingMonth());
        if (!newClientId) return;
        setLoadingContracts(true);
        try {
            const res = await axios.get(route('sinpe-emails.client-contracts'), { params: { client_id: newClientId } });
            setContracts(res.data as ContractOption[]);
        } finally {
            setLoadingContracts(false);
        }
    };

    const handleConciliate = () => {
        if (!selected || !clientId || !contractId) {
            setFormError('Debes seleccionar cliente y contrato.');
            return;
        }

        if (!billingMonth) {
            setFormError('Debes seleccionar el mes a conciliar.');
            return;
        }
        setSubmitting(true);
        setFormError(null);
        router.post(
            route('sinpe-emails.conciliate', { id: selected.id }),
            { 
                client_id: clientId, 
                contract_id: contractId,
                update_client_name: updateClientName,
                billing_month: billingMonth || null,
            },
            {
                onSuccess: () => { setModalOpen(false); setSubmitting(false); },
                onError: (errors) => {
                    setFormError(Object.values(errors).join(' ') || 'Error al conciliar.');
                    setSubmitting(false);
                },
            },
        );
    };

    const handleDelete = () => {
        if (!deleteTarget) {
            return;
        }

        const deleteId = deleteTarget.id;
        setDeleteTarget(null);

        router.delete(route('sinpe-emails.destroy', { id: deleteId }), {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const handleBreakConciliation = (tx: SinpeEmailTransaction) => {
        router.post(route('sinpe-emails.break-conciliation', { id: tx.id }), {}, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const handleSync = () => {
        setSyncing(true);
        router.post(route('sinpe-emails.sync'), {}, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
            onFinish: () => setSyncing(false),
        });
    };

    const markAsRead = (tx: SinpeEmailTransaction) => {
        if (tx.is_read) {
            return;
        }

        router.patch(route('sinpe-emails.mark-read', { id: tx.id }), {}, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100">
                    Correos
                </h2>
            }
        >
            <Head title="Correos" />

            <div className="py-12">
                <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
                    <AccountingTabs active="sinpe_emails" />

                    {/* Filtros */}
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-lg">
                        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-4 py-4 sm:px-6">
                            <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Filtros</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{paginationMeta.total} transacción(es)</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowMobileFilters((value) => !value)}
                                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-gray-600 dark:text-gray-300"
                                >
                                    {showMobileFilters ? 'Ocultar' : 'Mostrar'}
                                </button>
                            </div>
                            <form onSubmit={submit} className={`${showMobileFilters ? 'flex' : 'hidden'} flex-col gap-4 lg:flex lg:flex-row lg:flex-wrap lg:items-end`}>
                                <div className="w-full sm:w-auto">
                                    <label htmlFor="read" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Bandeja
                                    </label>
                                    <select
                                        id="read"
                                        value={data.read}
                                        onChange={(e) => setData('read', e.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-auto"
                                    >
                                        <option value="">Todos</option>
                                        <option value="unread">No leídos</option>
                                        <option value="read">Leídos</option>
                                    </select>
                                </div>
                                <div className="w-full sm:w-auto">
                                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Estado
                                    </label>
                                    <select
                                        id="status"
                                        value={data.status}
                                        onChange={(e) => setData('status', e.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-auto"
                                    >
                                        <option value="">Todos</option>
                                        {statuses.map((s) => (
                                            <option key={s} value={s}>{labelForEmailStatus(s)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="submit"
                                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                                    >
                                        Filtrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        Limpiar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSync}
                                        disabled={syncing}
                                        className="rounded-md border border-indigo-300 dark:border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50"
                                    >
                                        {syncing ? 'Recargando…' : 'Recargar correos'}
                                    </button>
                                </div>
                                <span className="text-sm text-gray-500 dark:text-gray-400 lg:ml-auto">
                                    {paginationMeta.total} transacci{paginationMeta.total === 1 ? 'ón' : 'ones'}
                                </span>
                            </form>
                        </div>

                        <div className="space-y-3 p-4 md:hidden">
                            {rows.length === 0 && (
                                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                                    No hay transacciones para mostrar.
                                </div>
                            )}
                            {rows.map((tx) => (
                                <div
                                    key={tx.id}
                                    onClick={() => markAsRead(tx)}
                                    className={`cursor-pointer rounded-lg border p-4 shadow-sm ${tx.is_read ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800' : 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2 text-xs font-semibold">
                                                <span className={`inline-block h-2.5 w-2.5 rounded-full ${tx.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-indigo-500'}`} />
                                                <span className={tx.is_read ? 'text-gray-500 dark:text-gray-400' : 'text-indigo-700 dark:text-indigo-300'}>
                                                    {tx.is_read ? 'Leído' : 'No leído'}
                                                </span>
                                            </div>
                                            <div className={`mt-2 text-sm ${tx.is_read ? 'font-medium text-gray-900 dark:text-gray-100' : 'font-semibold text-gray-950 dark:text-white'}`}>
                                                {tx.mail_subject || tx.origin_name || 'Correo SINPE'}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(tx.performed_at)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold text-gray-900 dark:text-gray-100">{formatAmount(tx.amount)}</div>
                                            <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classForEmailStatus(tx.status)}`}>
                                                {labelForEmailStatus(tx.status)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                        <div>Origen: {tx.origin_name || '—'}{tx.origin_phone && tx.origin_phone !== '00000000' ? ` · ${tx.origin_phone}` : ''}</div>
                                        <div>Motivo: {tx.motive || '—'}</div>
                                        <div>Referencia: {tx.reference || '—'}</div>
                                        <div>Cliente: {tx.client?.name || '—'}</div>
                                        {tx.contract && <div>Contrato: {tx.contract.name}</div>}
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {['skipped', 'in_review'].includes(tx.status) && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openConciliate(tx);
                                                }}
                                                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                                            >
                                                Conciliar
                                            </button>
                                        )}
                                        {['approved', 'conciliated'].includes(tx.status) && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleBreakConciliation(tx);
                                                }}
                                                className="rounded-md border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                            >
                                                Romper conciliación
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteTarget(tx);
                                            }}
                                            className="rounded-md border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Tabla */}
                        <div className="hidden overflow-x-auto md:block">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Bandeja</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Fecha</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Origen</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Motivo</th>
                                        <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">Monto</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Estado</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Cliente / Contrato</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Acción</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                    {rows.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                                                No hay transacciones para mostrar.
                                            </td>
                                        </tr>
                                    )}
                                    {rows.map((tx) => (
                                        <tr
                                            key={tx.id}
                                            onClick={() => markAsRead(tx)}
                                            className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 ${tx.is_read ? 'bg-white dark:bg-gray-800' : 'bg-indigo-50/40 dark:bg-indigo-950/20'}`}
                                        >
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex min-w-[120px] items-center gap-2">
                                                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${tx.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-indigo-500'}`} />
                                                    <span className={`text-xs font-semibold ${tx.is_read ? 'text-gray-500 dark:text-gray-400' : 'text-indigo-700 dark:text-indigo-300'}`}>
                                                        {tx.is_read ? 'Leído' : 'No leído'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                                {formatDateTime(tx.performed_at)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className={`text-sm ${tx.is_read ? 'font-medium text-gray-900 dark:text-gray-100' : 'font-semibold text-gray-950 dark:text-white'}`}>
                                                    {tx.mail_subject || tx.origin_name || 'Correo SINPE'}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {tx.origin_name || '—'}
                                                </div>
                                                {tx.origin_phone && tx.origin_phone !== '00000000' && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {tx.origin_phone}
                                                    </div>
                                                )}
                                                {tx.reference && (
                                                    <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                                        {tx.reference}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate">
                                                <div className={`${tx.is_read ? '' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
                                                    {tx.motive || '—'}
                                                </div>
                                                {tx.notes && (
                                                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 line-clamp-2">
                                                        {tx.notes}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                                {formatAmount(tx.amount)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classForEmailStatus(tx.status)}`}>
                                                    {labelForEmailStatus(tx.status)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {tx.client ? (
                                                    <div>
                                                        <div className="text-gray-900 dark:text-gray-100">{tx.client.name}</div>
                                                        {tx.contract && (
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">{tx.contract.name}</div>
                                                        )}
                                                        {tx.payment && (
                                                            <a
                                                                href={route('payments.index')}
                                                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                                                            >
                                                                Pago #{tx.payment.id}
                                                                {' '}
                                                                <StatusBadge status={tx.payment.status} />
                                                            </a>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {['skipped', 'in_review'].includes(tx.status) && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openConciliate(tx);
                                                        }}
                                                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                                                    >
                                                        Conciliar
                                                    </button>
                                                )}
                                                {['approved', 'conciliated'].includes(tx.status) && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-emerald-600 dark:text-emerald-400">Conciliado</span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleBreakConciliation(tx);
                                                            }}
                                                            className="rounded-md border border-amber-300 dark:border-amber-700 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                                        >
                                                            Romper conciliación
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteTarget(tx);
                                                    }}
                                                    className="rounded-md border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                                >
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {paginationLinks.length > 3 && (
                            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4">
                                <Pagination links={paginationLinks} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal conciliar */}
            <Transition show={modalOpen} as={Fragment}>
                <Dialog onClose={() => !submitting && setModalOpen(false)} className="relative z-50">
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/40" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl space-y-5 dark:bg-gray-800 sm:rounded-xl sm:p-6">
                                <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    Conciliar transacción SINPE
                                </Dialog.Title>

                                {selected && (
                                    <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-4 text-sm space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 dark:text-gray-400">Monto</span>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatAmount(selected.amount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 dark:text-gray-400">Origen</span>
                                            <span className="text-gray-900 dark:text-gray-100">{selected.origin_name || '—'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 dark:text-gray-400">Motivo</span>
                                            <span className="text-gray-700 dark:text-gray-300">{selected.motive || '—'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 dark:text-gray-400">Fecha</span>
                                            <span className="text-gray-700 dark:text-gray-300">{formatDateTime(selected.performed_at)}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Cliente
                                        </label>
                                        <select
                                            value={clientId}
                                            onChange={(e) => handleClientChange(e.target.value)}
                                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        >
                                            <option value="">Seleccionar cliente…</option>
                                            {clients.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {clientId && selected?.origin_name && (
                                        <div className="flex items-start gap-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 p-3">
                                            <input
                                                type="checkbox"
                                                id="update_client_name"
                                                checked={updateClientName}
                                                onChange={(e) => setUpdateClientName(e.target.checked)}
                                                className="mt-1 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-indigo-500"
                                            />
                                            <label htmlFor="update_client_name" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                                <span className="font-medium">Actualizar nombre del cliente</span>
                                                <br />
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    Cambiar de "{clients.find(c => c.id === Number(clientId))?.name}" a <strong>{selected.origin_name}</strong>
                                                </span>
                                            </label>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Contrato
                                        </label>
                                        <select
                                            value={contractId}
                                            onChange={(e) => {
                                                setContractId(e.target.value);
                                                setBillingMonth(currentBillingMonth());
                                            }}
                                            disabled={!clientId || loadingContracts}
                                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                                        >
                                            <option value="">
                                                {loadingContracts ? 'Cargando…' : 'Seleccionar contrato…'}
                                            </option>
                                            {contracts.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} — {new Intl.NumberFormat('es-CR', { style: 'currency', currency: c.currency || 'CRC' }).format(c.amount)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Mes a conciliar
                                        </label>
                                        <input
                                            type="month"
                                            value={billingMonth}
                                            onChange={(e) => setBillingMonth(e.target.value)}
                                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        />
                                    </div>

                                    {formError && (
                                        <p className="text-sm text-rose-600 dark:text-rose-400">{formError}</p>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalOpen(false)}
                                        disabled={submitting}
                                        className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConciliate}
                                        disabled={submitting || !clientId || !contractId}
                                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                                    >
                                        {submitting ? 'Guardando…' : 'Confirmar conciliación'}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
            {/* Modal eliminar */}
            <Transition show={deleteTarget !== null} as={Fragment}>
                <Dialog onClose={() => deleteTarget && setDeleteTarget(null)} className="relative z-50">
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
                        leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/40" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto p-4">
                        <div className="flex min-h-full items-center justify-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl space-y-4 dark:bg-gray-800">
                                <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    ¿Eliminar registro?
                                </Dialog.Title>
                                {deleteTarget && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Se eliminará el correo de <strong>{deleteTarget.origin_name || 'desconocido'}</strong> por{' '}
                                        <strong>{formatAmount(deleteTarget.amount)}</strong>. Esta acción no se puede deshacer.
                                    </p>
                                )}
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setDeleteTarget(null)}
                                        className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </AuthenticatedLayout>
    );
}
