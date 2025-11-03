import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Link } from '@inertiajs/react';
import type { FormEventHandler } from 'react';

interface ClientOption {
    id: number;
    name: string;
}

interface ContractFormData {
    client_id: number | string;
    name: string;
    amount: string;
    currency: string;
    billing_cycle: string;
    next_due_date: string;
    grace_period_days: string;
}

interface ContractFormProps {
    data: ContractFormData;
    errors: Record<string, string | undefined>;
    clients: ClientOption[];
    processing: boolean;
    submitLabel: string;
    onSubmit: FormEventHandler<HTMLFormElement>;
    onChange: (key: keyof ContractFormData, value: string) => void;
    cancelHref: string;
}

const formatValue = (value: string) =>
    value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export default function ContractForm({
    data,
    errors,
    clients,
    processing,
    submitLabel,
    onSubmit,
    onChange,
    cancelHref,
}: ContractFormProps) {
    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                    <InputLabel htmlFor="client_id" value="Cliente" />
                    <select
                        id="client_id"
                        name="client_id"
                        value={data.client_id}
                        onChange={(event) => onChange('client_id', event.target.value)}
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="">Seleccione</option>
                        {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                                {client.name}
                            </option>
                        ))}
                    </select>
                    <InputError message={errors.client_id} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="name" value="Nombre del contrato" />
                    <TextInput
                        id="name"
                        name="name"
                        value={data.name}
                        onChange={(event) => onChange('name', event.target.value)}
                        className="mt-1 block w-full"
                        required
                        autoFocus
                    />
                    <InputError message={errors.name} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="amount" value="Monto" />
                    <TextInput
                        id="amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={data.amount}
                        onChange={(event) => onChange('amount', event.target.value)}
                        className="mt-1 block w-full"
                        required
                    />
                    <InputError message={errors.amount} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="currency" value="Moneda" />
                    <select
                        id="currency"
                        name="currency"
                        value={data.currency}
                        onChange={(event) => onChange('currency', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        required
                    >
                        <option value="CRC">CRC — Colón costarricense</option>
                        <option value="USD">USD — Dólar estadounidense</option>
                    </select>
                    <InputError message={errors.currency} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="billing_cycle" value="Ciclo de facturación" />
                    <select
                        id="billing_cycle"
                        name="billing_cycle"
                        value={data.billing_cycle}
                        onChange={(event) => {
                            const value = event.target.value;
                            onChange('billing_cycle', value);
                            // Auto-sugerir fecha si está vacía
                            if (!data.next_due_date) {
                                const today = new Date();
                                const pad = (n: number) => String(n).padStart(2, '0');
                                const addDays = (d: Date, days: number) => {
                                    const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                    nd.setDate(nd.getDate() + days);
                                    return nd;
                                };
                                const addMonths = (d: Date, months: number) => {
                                    // Adjust by month while keeping the day when possible
                                    const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                    nd.setMonth(nd.getMonth() + months);
                                    return nd;
                                };
                                let suggested: Date = today;
                                switch (value) {
                                    case 'weekly':
                                        suggested = addDays(today, 7);
                                        break;
                                    case 'biweekly':
                                        suggested = addDays(today, 14);
                                        break;
                                    case 'monthly':
                                        suggested = addMonths(today, 1);
                                        break;
                                    case 'one_time':
                                        suggested = today;
                                        break;
                                }
                                const yyyy = suggested.getFullYear();
                                const mm = pad(suggested.getMonth() + 1);
                                const dd = pad(suggested.getDate());
                                onChange('next_due_date', `${yyyy}-${mm}-${dd}`);
                            }
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        required
                    >
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Quincenal</option>
                        <option value="monthly">Mensual</option>
                        <option value="one_time">Un solo pago</option>
                    </select>
                    <InputError message={errors.billing_cycle} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="next_due_date" value="Próxima fecha de cobro" />
                    <TextInput
                        id="next_due_date"
                        name="next_due_date"
                        type="date"
                        value={data.next_due_date}
                        onChange={(event) => onChange('next_due_date', event.target.value)}
                        className="mt-1 block w-full"
                    />
                    <InputError message={errors.next_due_date} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="grace_period_days" value="Días de gracia" />
                    <TextInput
                        id="grace_period_days"
                        name="grace_period_days"
                        type="number"
                        min="0"
                        max="60"
                        value={data.grace_period_days}
                        onChange={(event) => onChange('grace_period_days', event.target.value)}
                        className="mt-1 block w-full"
                    />
                    <InputError message={errors.grace_period_days} className="mt-2" />
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <Link
                    href={cancelHref}
                    className="text-sm font-medium text-gray-600 transition hover:text-gray-800"
                    preserveState
                    preserveScroll
                >
                    Cancelar
                </Link>
                <PrimaryButton disabled={processing}>{formatValue(submitLabel)}</PrimaryButton>
            </div>
        </form>
    );
}
