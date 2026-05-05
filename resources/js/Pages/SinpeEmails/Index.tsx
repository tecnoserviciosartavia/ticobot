import Pagination from '@/Components/Pagination';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Fragment, FormEvent, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import axios from 'axios';
import { formatDateTime, formatAmount, labelForEmailStatus, classForEmailStatus } from './utils';
import FiltersBar from './Partials/FiltersBar';
import MobileTransactionCard from './Partials/MobileTransactionCard';
import DesktopTransactionsTable from './Partials/DesktopTransactionsTable';

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
    const [billingMonth, setBillingMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [formError, setFormError] = useState<string | null>(null);

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
        setBillingMonth(new Date().toISOString().slice(0, 7));
        setFormError(null);
        setModalOpen(true);
    };

    const handleClientChange = async (newClientId: string) => {
        setClientId(newClientId);
        setContractId('');
        setContracts([]);
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

        const selectedContract = contracts.find((c) => String(c.id) === String(contractId));
        const isMonthlyContract = selectedContract?.billing_cycle === 'monthly';
        if (isMonthlyContract && !billingMonth) {
            setFormError('Debes seleccionar el mes que estás pagando.');
            return;
        }

        setSubmitting(true);
        setFormError(null);
        router.post(
            route('sinpe-emails.conciliate', { id: selected.id }),
            {
                client_id: clientId,
                contract_id: contractId,
                billing_month: isMonthlyContract ? billingMonth : null,
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
        <ResponsiveLayout title="Correos" contentWidth="full">
            <Head title="Correos" />

            <div className="w-full pb-6 pt-2">
                <div className="w-full space-y-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                            Correos
                        </h1>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            Notificaciones SINPE recibidas por correo y conciliación con clientes.
                        </p>
                    </div>

                    {/* Filtros */}
                    <div className="overflow-hidden rounded-lg bg-white shadow-lg dark:bg-gray-800 dark:shadow-gray-900/50">
                        <FiltersBar
                            data={data}
                            setData={setData}
                            submit={submit}
                            resetFilters={resetFilters}
                            handleSync={handleSync}
                            syncing={syncing}
                            statuses={statuses}
                            showMobileFilters={showMobileFilters}
                            setShowMobileFilters={setShowMobileFilters}
                            paginationMeta={paginationMeta}
                            labelForEmailStatus={labelForEmailStatus}
                        />

                        <MobileTransactionCard
                            rows={rows}
                            markAsRead={markAsRead}
                            openConciliate={openConciliate}
                            setDeleteTarget={setDeleteTarget}
                        />

                        <DesktopTransactionsTable
                            rows={rows}
                            markAsRead={markAsRead}
                            openConciliate={openConciliate}
                            setDeleteTarget={setDeleteTarget}
                        />

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

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Contrato
                                        </label>
                                        <select
                                            value={contractId}
                                            onChange={(e) => setContractId(e.target.value)}
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

                                    {contracts.length > 0 && contractId && contracts.find((c) => String(c.id) === String(contractId))?.billing_cycle === 'monthly' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Mes que está pagando
                                            </label>
                                            <input
                                                id="billing_month"
                                                name="billing_month"
                                                type="month"
                                                value={billingMonth}
                                                onChange={(e) => setBillingMonth(e.target.value)}
                                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            />
                                        </div>
                                    )}

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
                <Dialog onClose={() => setDeleteTarget(null)} className="relative z-50">
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
        </ResponsiveLayout>
    );
}
