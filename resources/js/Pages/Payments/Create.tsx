import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { labelForChannel } from '@/lib/labels';
import { FormEventHandler, useEffect, useState } from 'react';
import axios from 'axios';

interface Client {
    id: number;
    name: string;
    phone: string;
}

interface Contract {
    id: number;
    name: string;
    amount: number;
    currency: string;
}

type CreatePaymentPageProps = PageProps<{
    clients: Client[];
    channels: string[];
}>;

interface PaymentFormData {
    client_id: string;
    contract_id: string;
    amount: string;
    currency: string;
    channel: string;
    reference: string;
    status: string;
    paid_at: string;
    grace_months: string;
}

export default function CreatePayment({ clients, channels }: CreatePaymentPageProps) {
    const form = useForm<PaymentFormData>({
        client_id: '',
        contract_id: '',
        amount: '',
        currency: 'CRC',
        channel: channels[0] || 'manual',
        reference: '',
        status: 'verified',
        paid_at: new Date().toISOString().split('T')[0],
        grace_months: '0',
    });

    const { data, setData, post, processing } = form;
    const errors = form.errors as Record<string, string>;

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loadingContracts, setLoadingContracts] = useState(false);

    // Load contracts when client is selected
    useEffect(() => {
        if (data.client_id) {
            setLoadingContracts(true);
            axios
                .get(route('payments.client-contracts'), {
                    params: { client_id: data.client_id },
                })
                .then((response) => {
                    setContracts(response.data);
                    // Auto-select contract if client has only one
                    if (response.data.length === 1) {
                        setData((prev) => ({
                            ...prev,
                            contract_id: response.data[0].id.toString(),
                            amount: response.data[0].amount.toString(),
                            currency: response.data[0].currency,
                        }));
                    } else {
                        setData((prev) => ({ ...prev, contract_id: '' }));
                    }
                })
                .catch((error) => {
                    console.error('Error loading contracts:', error);
                    setContracts([]);
                })
                .finally(() => {
                    setLoadingContracts(false);
                });
        } else {
            setContracts([]);
            setData((prev) => ({ ...prev, contract_id: '' }));
        }
    }, [data.client_id]);

    // Update amount and currency when contract is selected
    useEffect(() => {
        if (data.contract_id) {
            const contract = contracts.find((c) => c.id.toString() === data.contract_id);
            if (contract) {
                setData((prev) => ({
                    ...prev,
                    amount: contract.amount.toString(),
                    currency: contract.currency,
                }));
            }
        }
    }, [data.contract_id, contracts]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('payments.store'));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100">
                        Crear Pago Manual
                    </h2>
                    <Link
                        href={route('payments.index')}
                        className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                        ← Volver a Pagos
                    </Link>
                </div>
            }
        >
            <Head title="Crear Pago Manual" />

            <div className="py-12">
                <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-lg">
                        <form onSubmit={submit} className="space-y-6 p-6">
                            {/* Client Selection */}
                            <div>
                                <label
                                    htmlFor="client_id"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Cliente <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="client_id"
                                    name="client_id"
                                    value={data.client_id}
                                    onChange={(e) => setData((prev) => ({ ...prev, client_id: e.target.value }))}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    required
                                >
                                    <option value="">Seleccionar cliente...</option>
                                    {clients.map((client) => (
                                        <option key={client.id} value={client.id}>
                                            {client.name} ({client.phone})
                                        </option>
                                    ))}
                                </select>
                                {errors.client_id && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                        {errors.client_id}
                                    </p>
                                )}
                            </div>

                            {/* Contract Selection (optional) */}
                            {data.client_id && (
                                <div>
                                    <label
                                        htmlFor="contract_id"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Contrato (opcional)
                                    </label>
                                    <select
                                        id="contract_id"
                                        name="contract_id"
                                        value={data.contract_id}
                                        onChange={(e) => setData((prev) => ({ ...prev, contract_id: e.target.value }))}
                                        disabled={loadingContracts}
                                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                                    >
                                        <option value="">Sin contrato asociado</option>
                                        {contracts.map((contract) => (
                                            <option key={contract.id} value={contract.id}>
                                                {contract.name} - {contract.currency}{' '}
                                                {Number(contract.amount).toLocaleString('es-CR')}
                                            </option>
                                        ))}
                                    </select>
                                    {loadingContracts && (
                                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                            Cargando contratos...
                                        </p>
                                    )}
                                    {errors.contract_id && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                            {errors.contract_id}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Amount and Currency */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="sm:col-span-2">
                                    <label
                                        htmlFor="amount"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Monto <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        id="amount"
                                        name="amount"
                                        min="0"
                                        step="0.01"
                                        value={data.amount}
                                        onChange={(e) => setData((prev) => ({ ...prev, amount: e.target.value }))}
                                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        required
                                    />
                                    {errors.amount && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                            {errors.amount}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label
                                        htmlFor="currency"
                                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Moneda <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        id="currency"
                                        name="currency"
                                        value={data.currency}
                                        onChange={(e) => setData((prev) => ({ ...prev, currency: e.target.value }))}
                                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        required
                                    >
                                        <option value="CRC">CRC</option>
                                        <option value="USD">USD</option>
                                    </select>
                                    {errors.currency && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                            {errors.currency}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Channel */}
                            <div>
                                <label
                                    htmlFor="channel"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Canal de Pago <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="channel"
                                    name="channel"
                                    value={data.channel}
                                    onChange={(e) => setData((prev) => ({ ...prev, channel: e.target.value }))}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    required
                                >
                                    {channels.map((channel) => (
                                        <option key={channel} value={channel}>
                                            {labelForChannel(channel)}
                                        </option>
                                    ))}
                                </select>
                                {errors.channel && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                        {errors.channel}
                                    </p>
                                )}
                            </div>

                            {/* Reference */}
                            <div>
                                <label
                                    htmlFor="reference"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Referencia (opcional)
                                </label>
                                <input
                                    type="text"
                                    id="reference"
                                    name="reference"
                                    value={data.reference}
                                    onChange={(e) => setData((prev) => ({ ...prev, reference: e.target.value }))}
                                    maxLength={255}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    placeholder="Número de transacción, comprobante, etc."
                                />
                                {errors.reference && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                        {errors.reference}
                                    </p>
                                )}
                            </div>

                            {/* Status */}
                            <div>
                                <label
                                    htmlFor="status"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Estado <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="status"
                                    name="status"
                                    value={data.status}
                                    onChange={(e) => setData((prev) => ({ ...prev, status: e.target.value }))}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    required
                                >
                                    <option value="unverified">Sin Verificar</option>
                                    <option value="verified">Verificado</option>
                                    <option value="pending">Pendiente</option>
                                    <option value="rejected">Rechazado</option>
                                </select>
                                {errors.status && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                        {errors.status}
                                    </p>
                                )}
                            </div>

                            {/* Paid At */}
                            <div>
                                <label
                                    htmlFor="paid_at"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Fecha de Pago
                                </label>
                                <input
                                    type="date"
                                    id="paid_at"
                                    name="paid_at"
                                    value={data.paid_at}
                                    onChange={(e) => setData((prev) => ({ ...prev, paid_at: e.target.value }))}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                                {errors.paid_at && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                        {errors.paid_at}
                                    </p>
                                )}
                            </div>

                            {/* Grace Months */}
                            <div>
                                <label
                                    htmlFor="grace_months"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Meses de Gracia Adicionales
                                </label>
                                <input
                                    type="number"
                                    id="grace_months"
                                    name="grace_months"
                                    min="0"
                                    max="12"
                                    value={data.grace_months}
                                    onChange={(e) => setData((prev) => ({ ...prev, grace_months: e.target.value }))}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    placeholder="0"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Meses adicionales de cortesía por pago adelantado (opcional)
                                </p>
                                {errors.grace_months && (
                                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                        {errors.grace_months}
                                    </p>
                                )}
                            </div>

                            {/* Submit Buttons */}
                            <div className="flex items-center justify-end gap-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                                <Link
                                    href={route('payments.index')}
                                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                >
                                    Cancelar
                                </Link>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
                                >
                                    {processing ? (
                                        <>
                                            <svg
                                                className="mr-2 h-4 w-4 animate-spin"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                />
                                            </svg>
                                            Guardando...
                                        </>
                                    ) : (
                                        'Crear Pago'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
