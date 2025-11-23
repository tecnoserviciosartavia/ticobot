import Pagination from '@/Components/Pagination';
import StatusBadge from '@/Components/StatusBadge';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { useState, useEffect, Fragment } from 'react';
import { FormEvent } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import axios from 'axios';

interface Payment {
    id: number;
    status: string;
    channel: string;
    amount: string | number;
    currency: string | null;
    reference: string | null;
    paid_at: string | null;
    receipts_count: number;
    client: { id: number; name: string } | null;
    contract: { id: number; name: string; amount: number; currency: string } | null;
    reminder: { id: number; status: string } | null;
    created_at: string | null;
}

interface Contract {
    id: number;
    name: string;
    amount: number;
    currency: string;
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

type PaymentsPageProps = PageProps<{
    payments: Paginated<Payment>;
    filters: {
        status?: string | null;
        channel?: string | null;
        paid_from?: string | null;
        paid_to?: string | null;
    };
    statuses: string[];
    channels: string[];
}>;

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

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatAmount = (amount: string | number, currency: string | null | undefined) =>
    new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
        minimumFractionDigits: 2,
    }).format(typeof amount === 'string' ? Number.parseFloat(amount) : amount);

export default function PaymentsIndex({ payments, filters, statuses, channels }: PaymentsPageProps) {
    const { data, setData } = useForm<{
        status: string;
        channel: string;
        paid_from: string;
        paid_to: string;
    }>({
        status: filters.status ?? '',
        channel: filters.channel ?? '',
        paid_from: filters.paid_from ?? '',
        paid_to: filters.paid_to ?? '',
    });

    // estado local para controlar cargas por fila
    const [loadingIds, setLoadingIds] = useState<number[]>([]);

    function setLoading(id: number, value: boolean) {
        setLoadingIds((prev) => {
            if (value) return Array.from(new Set([...prev, id]));
            return prev.filter((x) => x !== id);
        });
    }

    function isLoading(id: number) {
        return loadingIds.includes(id);
    }

    const paymentRows = payments?.data ?? [];
    const paginationLinks = payments?.links ?? [];
    const paginationMeta = payments?.meta ?? { from: 0, to: 0, total: 0 };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('payments.index'), { ...data }, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        setData('status', '');
        setData('channel', '');
        setData('paid_from', '');
        setData('paid_to', '');
        router.get(route('payments.index'), {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">
                        Pagos
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Controla los pagos recibidos, su verificación y los comprobantes asociados.
                    </p>
                </div>
            }
        >
            <Head title="Pagos" />

            <div className="py-12">
                <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-gray-800 dark:bg-gray-800 shadow-lg dark:shadow-gray-900/50">
                        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-6 py-4">
                            <form
                                onSubmit={submit}
                                className="grid grid-cols-1 gap-4 md:grid-cols-5 md:items-end"
                            >
                                <div>
                                    <label
                                        htmlFor="status"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Estado
                                    </label>
                                    <select
                                        id="status"
                                        name="status"
                                        value={data.status}
                                        onChange={(event) => setData('status', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {statuses.map((statusOption) => (
                                            <option key={statusOption} value={statusOption}>
                                                {statusOption.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="channel"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Canal
                                    </label>
                                    <select
                                        id="channel"
                                        name="channel"
                                        value={data.channel}
                                        onChange={(event) => setData('channel', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="">Todos</option>
                                        {channels.map((channelOption) => (
                                            <option key={channelOption} value={channelOption}>
                                                {channelOption.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="paid_from"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Pagado desde
                                    </label>
                                    <input
                                        id="paid_from"
                                        name="paid_from"
                                        type="date"
                                        value={data.paid_from}
                                        onChange={(event) => setData('paid_from', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:[color-scheme:dark] shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="paid_to"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Pagado hasta
                                    </label>
                                    <input
                                        id="paid_to"
                                        name="paid_to"
                                        type="date"
                                        value={data.paid_to}
                                        onChange={(event) => setData('paid_to', event.target.value)}
                                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:[color-scheme:dark] shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                    />
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Filtrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Pago
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Cliente
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Contrato
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Canal
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Estado
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Comprobantes
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Fechas
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white dark:bg-gray-800">
                                    {paymentRows.map((payment) => (
                                        <tr key={payment.id} className="hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    {formatAmount(payment.amount, payment.currency)}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    Ref: {payment.reference ?? '—'}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                {payment.client?.name ?? 'Cliente eliminado'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                {payment.contract?.name ?? '—'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                {payment.channel}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <StatusBadge status={payment.status} />
                                                    {payment.reminder && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            Recordatorio #{payment.reminder.id}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-700 dark:text-gray-300">
                                                {payment.receipts_count}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                <div>Pagado: {formatDate(payment.paid_at)}</div>
                                                <div>Registrado: {formatDate(payment.created_at)}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                                {/* Mostrar botón solo cuando no esté verificado */}
                                                {payment.status !== 'verified' && (
                                                    <ApplyAndConciliateButton 
                                                        paymentId={payment.id} 
                                                        receiptsCount={payment.receipts_count}
                                                        clientId={payment.client?.id || null}
                                                    />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Componente botón definido abajo en el archivo */}

                        <div className="px-6 pb-6">
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Mostrando {paginationMeta.from ?? 0} - {paginationMeta.to ?? 0} de {paginationMeta.total} pagos
                            </div>
                            <Pagination links={paginationLinks} />
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}

// Botón para aplicar y conciliar — componente con modal para seleccionar contrato y meses
function ApplyAndConciliateButton({ paymentId, receiptsCount, clientId }: { paymentId: number; receiptsCount: number; clientId: number | null }) {
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
    const [months, setMonths] = useState(1);
    const [loadingContracts, setLoadingContracts] = useState(false);

    const selectedContract = contracts.find(c => c.id === selectedContractId);
    const calculatedAmount = selectedContract ? selectedContract.amount * months : 0;

    useEffect(() => {
        if (isOpen && clientId && contracts.length === 0) {
            loadContracts();
        }
    }, [isOpen, clientId]);

    const loadContracts = async () => {
        if (!clientId) return;
        
        setLoadingContracts(true);
        try {
            const response = await axios.get(`/payments/client-contracts?client_id=${clientId}`);
            const clientContracts = response.data || [];
            setContracts(clientContracts);
            
            // Auto-seleccionar el primer contrato si solo hay uno
            if (clientContracts.length === 1) {
                setSelectedContractId(clientContracts[0].id);
            }
        } catch (error) {
            console.error('Error cargando contratos:', error);
            alert('Error al cargar los contratos del cliente');
        } finally {
            setLoadingContracts(false);
        }
    };

    const handleOpenModal = () => {
        if (!receiptsCount || receiptsCount <= 0) {
            if (!confirm('Este pago no tiene comprobantes adjuntos. ¿Deseas continuar y crear la conciliación de todas formas?')) {
                return;
            }
        }
        setIsOpen(true);
    };

    const handleConfirm = () => {
        if (!selectedContractId) {
            alert('Por favor selecciona un contrato');
            return;
        }

        if (months < 1) {
            alert('Los meses deben ser al menos 1');
            return;
        }

        setLoading(true);

        router.post(route('conciliations.store'), {
            payment_id: paymentId,
            status: 'approved',
            contract_id: selectedContractId,
            months: months,
            calculated_amount: calculatedAmount,
        }, {
            preserveState: false,
            onSuccess: () => {
                setIsOpen(false);
                router.get(route('payments.index'));
            },
            onError: (errors: any) => {
                alert('Error al conciliar: ' + JSON.stringify(errors));
                setLoading(false);
            },
            onFinish: () => setLoading(false),
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={handleOpenModal}
                disabled={loading}
                className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-green-300"
            >
                Aplicar y conciliar
            </button>

            <Transition appear show={isOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => !loading && setIsOpen(false)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black bg-opacity-25" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4 text-center">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                                    <Dialog.Title
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4"
                                    >
                                        Aplicar y conciliar pago
                                    </Dialog.Title>

                                    <div className="mt-4 space-y-4">
                                        {loadingContracts ? (
                                            <div className="text-center py-4">
                                                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent"></div>
                                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Cargando contratos...</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <label htmlFor="contract" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        Contrato
                                                    </label>
                                                    <select
                                                        id="contract"
                                                        value={selectedContractId || ''}
                                                        onChange={(e) => setSelectedContractId(Number(e.target.value))}
                                                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm dark:bg-gray-700 dark:text-gray-100"
                                                        disabled={loading}
                                                    >
                                                        <option value="">Selecciona un contrato</option>
                                                        {contracts.map((contract) => (
                                                            <option key={contract.id} value={contract.id}>
                                                                {contract.name} - {contract.currency} {contract.amount.toLocaleString('es-CR')}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label htmlFor="months" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        Meses a pagar
                                                    </label>
                                                    <input
                                                        type="number"
                                                        id="months"
                                                        min="1"
                                                        value={months}
                                                        onChange={(e) => setMonths(Math.max(1, parseInt(e.target.value) || 1))}
                                                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 sm:text-sm dark:bg-gray-700 dark:text-gray-100"
                                                        disabled={loading}
                                                    />
                                                </div>

                                                {selectedContract && (
                                                    <div className="rounded-md bg-indigo-50 dark:bg-indigo-900/30 p-4">
                                                        <div className="flex">
                                                            <div className="flex-1">
                                                                <h4 className="text-sm font-medium text-indigo-800">Monto calculado</h4>
                                                                <div className="mt-1 text-2xl font-bold text-indigo-900">
                                                                    {selectedContract.currency} {calculatedAmount.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                                                                </div>
                                                                <p className="mt-1 text-xs text-indigo-600">
                                                                    {selectedContract.currency} {selectedContract.amount.toLocaleString('es-CR')} × {months} {months === 1 ? 'mes' : 'meses'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {contracts.length === 0 && !loadingContracts && (
                                                    <div className="rounded-md bg-yellow-50 p-4">
                                                        <p className="text-sm text-yellow-800">
                                                            Este cliente no tiene contratos activos.
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <div className="mt-6 flex gap-3">
                                        <button
                                            type="button"
                                            className="flex-1 inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                                            onClick={() => setIsOpen(false)}
                                            disabled={loading}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            className="flex-1 inline-flex justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-green-300"
                                            onClick={handleConfirm}
                                            disabled={loading || !selectedContractId || contracts.length === 0}
                                        >
                                            {loading ? 'Aplicando...' : 'Confirmar y enviar'}
                                        </button>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    );
}
