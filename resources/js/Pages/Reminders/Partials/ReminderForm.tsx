import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Link } from '@inertiajs/react';
import type { FormEventHandler } from 'react';

interface ReminderClientOption {
    id: number;
    name: string;
    contracts: Array<{ id: number; name: string }>;
}

export interface ReminderFormData {
    client_id: string;
    contract_id: string;
    channel: string;
    scheduled_for: string;
    message: string;
    amount: string;
    due_date: string;
}

interface ReminderFormProps {
    data: ReminderFormData;
    errors: Record<string, string | undefined>;
    clients: ReminderClientOption[];
    channels: string[];
    processing: boolean;
    submitLabel: string;
    onSubmit: FormEventHandler<HTMLFormElement>;
    onChange: (key: keyof ReminderFormData, value: string) => void;
    cancelHref: string;
}

const formatLabel = (value: string) =>
    value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export default function ReminderForm({
    data,
    errors,
    clients,
    channels,
    processing,
    submitLabel,
    onSubmit,
    onChange,
    cancelHref,
}: ReminderFormProps) {
    const normalizedChannels = channels.length ? channels : ['whatsapp'];
    const selectedClient = clients.find((client) => String(client.id) === String(data.client_id));
    const contractOptions = selectedClient?.contracts ?? [];

    const handleClientChange = (value: string) => {
        onChange('client_id', value);
        onChange('contract_id', '');
    };

    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                    <InputLabel htmlFor="client_id" value="Cliente" />
                    <select
                        id="client_id"
                        name="client_id"
                        value={data.client_id}
                        onChange={(event) => handleClientChange(event.target.value)}
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="">Seleccione un cliente</option>
                        {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                                {client.name}
                            </option>
                        ))}
                    </select>
                    <InputError message={errors.client_id} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="contract_id" value="Contrato" />
                    <select
                        id="contract_id"
                        name="contract_id"
                        value={data.contract_id}
                        onChange={(event) => onChange('contract_id', event.target.value)}
                        required
                        disabled={!selectedClient}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="">Seleccione un contrato</option>
                        {contractOptions.map((contract) => (
                            <option key={contract.id} value={contract.id}>
                                {contract.name}
                            </option>
                        ))}
                    </select>
                    <InputError message={errors.contract_id} className="mt-2" />
                    {!selectedClient && (
                        <p className="mt-2 text-xs text-gray-500">
                            Seleccione un cliente para cargar sus contratos activos.
                        </p>
                    )}
                </div>

                <div>
                    <InputLabel htmlFor="channel" value="Canal" />
                    <select
                        id="channel"
                        name="channel"
                        value={data.channel}
                        onChange={(event) => onChange('channel', event.target.value)}
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        {normalizedChannels.map((channelOption) => (
                            <option key={channelOption} value={channelOption}>
                                {formatLabel(channelOption)}
                            </option>
                        ))}
                    </select>
                    <InputError message={errors.channel} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="scheduled_for" value="Programado para" />
                    <TextInput
                        id="scheduled_for"
                        name="scheduled_for"
                        type="datetime-local"
                        value={data.scheduled_for}
                        onChange={(event) => onChange('scheduled_for', event.target.value)}
                        className="mt-1 block w-full"
                        required
                    />
                    <InputError message={errors.scheduled_for} className="mt-2" />
                </div>

                <div className="md:col-span-2">
                    <InputLabel htmlFor="message" value="Mensaje" />
                    <textarea
                        id="message"
                        name="message"
                        value={data.message}
                        onChange={(event) => onChange('message', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        rows={4}
                        placeholder="Contenido personalizado que se enviará al cliente"
                    />
                    <InputError message={errors.message} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="amount" value="Monto a cobrar" />
                    <TextInput
                        id="amount"
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={data.amount}
                        onChange={(event) => onChange('amount', event.target.value)}
                        className="mt-1 block w-full"
                        placeholder="Opcional"
                    />
                    <InputError message={errors.amount} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="due_date" value="Fecha de vencimiento" />
                    <TextInput
                        id="due_date"
                        name="due_date"
                        type="date"
                        value={data.due_date}
                        onChange={(event) => onChange('due_date', event.target.value)}
                        className="mt-1 block w-full"
                        placeholder="Opcional"
                    />
                    <InputError message={errors.due_date} className="mt-2" />
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <Link
                    href={cancelHref}
                    className="text-sm font-medium text-gray-600 transition hover:text-gray-800"
                    preserveScroll
                >
                    Cancelar
                </Link>
                <PrimaryButton disabled={processing}>{submitLabel}</PrimaryButton>
            </div>
        </form>
    );
}
