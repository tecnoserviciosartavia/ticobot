import Pagination from '@/Components/Pagination';
import FinanceNav from '@/Components/FinanceNav';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { ChevronDown } from '@/Components/icons';
import type { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Fragment, FormEvent, useState } from 'react';
import { Dialog, Listbox, Transition } from '@headlessui/react';
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
    services_label?: string | null;
}

function addMonthsYm(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map((v) => Number(v));
    if (!y || !m) {
        return ym;
    }
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function consecutiveMonthsFromAnchor(anchor: string, count: number): string[] {
    const n = Math.min(36, Math.max(1, count));
    return Array.from({ length: n }, (_, i) => addMonthsYm(anchor, i));
}

function contractSupportsMonthlyCoverage(c: ContractOption | undefined): boolean {
    if (!c) {
        return false;
    }
    const raw = c.billing_cycle;
    if (raw == null || raw === '') {
        return true;
    }
    const cycle = String(raw).trim().toLowerCase();
    return cycle === 'monthly' || cycle === 'mensual';
}

function formatYmLabel(ym: string): string {
    const [y, mo] = ym.split('-').map((v) => Number(v));
    const d = new Date(y, (mo || 1) - 1, 1);
    return d.toLocaleDateString('es-CR', { month: 'short', year: 'numeric' });
}

function formatContractAmount(amount: number, currency: string): string {
    return new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: currency || 'CRC',
    }).format(amount);
}

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function tokenSet(value: string): Set<string> {
    return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

function scoreClientMatch(originName: string | null | undefined, clientName: string): number {
    const origin = normalizeText(originName ?? '');
    const client = normalizeText(clientName);
    if (!origin || !client) {
        return 0;
    }

    if (origin === client) {
        return 1000;
    }

    let score = 0;
    if (origin.includes(client)) {
        score += 500;
    }

    const originTokens = tokenSet(origin);
    const clientTokens = Array.from(tokenSet(client));
    const allTokensPresent = clientTokens.length > 0 && clientTokens.every((token) => originTokens.has(token));
    const anyTokenPresent = clientTokens.some((token) => originTokens.has(token));

    if (allTokensPresent) {
        score += 300 + clientTokens.length * 10;
    } else if (anyTokenPresent) {
        score += 100;
    }

    if (clientTokens[0] && origin.startsWith(clientTokens[0])) {
        score += 25;
    }

    return score;
}

function sortClientsByOrigin(originName: string | null | undefined, list: ClientOption[]): ClientOption[] {
    return [...list].sort((a, b) => {
        const scoreA = scoreClientMatch(originName, a.name);
        const scoreB = scoreClientMatch(originName, b.name);
        if (scoreA !== scoreB) {
            return scoreB - scoreA;
        }
        return a.name.localeCompare(b.name, 'es');
    });
}

function findBestClient(originName: string | null | undefined, list: ClientOption[]): ClientOption | null {
    const ordered = sortClientsByOrigin(originName, list);
    const best = ordered[0];
    if (!best) {
        return null;
    }

    const bestScore = scoreClientMatch(originName, best.name);
    return bestScore >= 300 ? best : null;
}

interface Paginated<T> {
    data: T[];
    links: Array<{ url: string | null; label: string; active: boolean }>;
    meta: { from: number | null; to: number | null; total: number };
}

type PageData = PageProps<{
    transactions: Paginated<SinpeEmailTransaction>;
    filters: { status?: string | null; read?: string | null; search?: string | null };
    statuses: string[];
    clients: ClientOption[];
}>;

export default function SinpeEmailsIndex({ transactions, filters, statuses, clients }: PageData) {
    const { data, setData } = useForm<{ status: string; read: string; search: string }>({
        status: filters.status ?? '',
        read: filters.read ?? '',
        search: filters.search ?? '',
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
    const [monthsCount, setMonthsCount] = useState('1');
    const [formError, setFormError] = useState<string | null>(null);

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<SinpeEmailTransaction | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const orderedClients = sortClientsByOrigin(selected?.origin_name, clients);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('sinpe-emails.index'), { ...data }, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        setData({ status: '', read: '', search: '' });
        router.get(route('sinpe-emails.index'), {}, { preserveScroll: true, replace: true });
    };

    const openConciliate = (tx: SinpeEmailTransaction) => {
        setSelected(tx);
        setClientId('');
        setContractId('');
        setContracts([]);
        setBillingMonth(new Date().toISOString().slice(0, 7));
        setMonthsCount('1');
        setFormError(null);
        setModalOpen(true);

        const suggestedClient = findBestClient(tx.origin_name, clients);
        if (suggestedClient) {
            void handleClientChange(String(suggestedClient.id));
        }
    };

    const handleClientChange = async (newClientId: string) => {
        setClientId(newClientId);
        setContractId('');
        setContracts([]);
        setMonthsCount('1');
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
        const isMonthlyLike = contractSupportsMonthlyCoverage(selectedContract);
        if (isMonthlyLike && !billingMonth) {
            setFormError('Debes seleccionar el primer mes que cubre el pago.');
            return;
        }

        const n = Math.min(36, Math.max(1, parseInt(monthsCount, 10) || 1));
        const coveredMonths =
            isMonthlyLike && billingMonth ? consecutiveMonthsFromAnchor(billingMonth, n) : [];

        setSubmitting(true);
        setFormError(null);
        router.post(
            route('sinpe-emails.conciliate', { id: selected.id }),
            {
                client_id: clientId,
                contract_id: contractId,
                billing_month: isMonthlyLike ? billingMonth : null,
                covered_months: coveredMonths,
                months_count: isMonthlyLike ? n : null,
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

    const selectedContract = contracts.find((c) => String(c.id) === String(contractId));

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

            <div className="w-full space-y-5 pb-6 pt-5">
                <FinanceNav active="emails" />
                <div className="w-full space-y-4">
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
                            <Dialog.Panel className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl space-y-5 dark:bg-gray-800 sm:rounded-xl sm:p-6">
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
                                            {orderedClients.map((c) => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Contrato
                                        </label>
                                        <Listbox
                                            value={contractId}
                                            onChange={(value: string) => {
                                                setContractId(String(value));
                                                setMonthsCount('1');
                                                setBillingMonth(new Date().toISOString().slice(0, 7));
                                            }}
                                            disabled={!clientId || loadingContracts}
                                        >
                                            <div className="relative">
                                                <Listbox.Button
                                                    className="flex w-full items-center justify-between gap-3 rounded-md border border-gray-300 bg-white px-3 py-2 text-left shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                                >
                                                    {selectedContract ? (
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                                                                {selectedContract.name} — {formatContractAmount(selectedContract.amount, selectedContract.currency)}
                                                            </div>
                                                            <div className="mt-0.5 break-words text-xs leading-5 text-gray-500 dark:text-gray-400">
                                                                {selectedContract.services_label?.trim()
                                                                    ? selectedContract.services_label
                                                                    : 'Sin servicios registrados'}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-500 dark:text-gray-400">
                                                            {loadingContracts ? 'Cargando…' : 'Seleccionar contrato…'}
                                                        </span>
                                                    )}
                                                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                                                </Listbox.Button>

                                                <Transition
                                                    as={Fragment}
                                                    leave="transition ease-in duration-100"
                                                    leaveFrom="opacity-100"
                                                    leaveTo="opacity-0"
                                                >
                                                    <Listbox.Options className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg ring-1 ring-black/5 focus:outline-none dark:border-gray-700 dark:bg-gray-800">
                                                        <Listbox.Option
                                                            value=""
                                                            className={({ active }) =>
                                                                `cursor-pointer px-3 py-2 ${active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-100' : 'text-gray-700 dark:text-gray-200'}`
                                                            }
                                                        >
                                                            {({ selected }) => (
                                                                <span className={selected ? 'font-semibold' : 'font-normal'}>
                                                                    {loadingContracts ? 'Cargando…' : 'Seleccionar contrato…'}
                                                                </span>
                                                            )}
                                                        </Listbox.Option>
                                                        {contracts.map((c) => (
                                                            <Listbox.Option
                                                                key={c.id}
                                                                value={String(c.id)}
                                                                className={({ active, selected }) =>
                                                                    `cursor-pointer px-3 py-2 ${
                                                                        active
                                                                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-100'
                                                                            : 'text-gray-700 dark:text-gray-200'
                                                                    } ${selected ? 'bg-gray-50 dark:bg-gray-700/60' : ''}`
                                                                }
                                                            >
                                                                {({ selected }) => (
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <span className={`min-w-0 flex-1 truncate ${selected ? 'font-semibold' : 'font-medium'}`}>
                                                                                {c.name}
                                                                            </span>
                                                                            <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                                                {formatContractAmount(c.amount, c.currency)}
                                                                            </span>
                                                                        </div>
                                                                        <p className="break-words text-xs leading-5 text-gray-500 dark:text-gray-400">
                                                                            {c.services_label?.trim()
                                                                                ? c.services_label
                                                                                : 'Sin servicios registrados'}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </Listbox.Option>
                                                        ))}
                                                    </Listbox.Options>
                                                </Transition>
                                            </div>
                                        </Listbox>
                                    </div>

                                    {contracts.length > 0 &&
                                        contractId &&
                                        contractSupportsMonthlyCoverage(
                                            contracts.find((c) => String(c.id) === String(contractId)),
                                        ) && (
                                            <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/30">
                                                <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                                                    Meses que cubre este pago
                                                </p>
                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Primer mes cubierto
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
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                            Cantidad de meses
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={36}
                                                            value={monthsCount}
                                                            onChange={(e) => setMonthsCount(e.target.value)}
                                                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                </div>
                                                {billingMonth && (
                                                    <p className="text-xs text-gray-700 dark:text-gray-300">
                                                        <span className="font-medium">Vista previa:</span>{' '}
                                                        {consecutiveMonthsFromAnchor(
                                                            billingMonth,
                                                            Math.min(36, Math.max(1, parseInt(monthsCount, 10) || 1)),
                                                        )
                                                            .map(formatYmLabel)
                                                            .join(' · ')}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                    {contracts.length > 0 &&
                                        contractId &&
                                        !contractSupportsMonthlyCoverage(
                                            contracts.find((c) => String(c.id) === String(contractId)),
                                        ) && (
                                            <p className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/40">
                                                Este contrato no es de facturación mensual; no se aplican períodos por
                                                meses aquí.
                                            </p>
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
