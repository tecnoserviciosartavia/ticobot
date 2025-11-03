import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Link } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
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
    recurrence?: string;
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

    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const filtered = search
        ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
        : clients.slice(0, 8);

    const handleClientChange = (value: string) => {
        onChange('client_id', value);
        onChange('contract_id', '');
    };

    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div ref={containerRef}>
                    <InputLabel htmlFor="client_id" value="Cliente" />

                    <div className="relative">
                        <input
                            id="client_id"
                            name="client_id"
                            type="text"
                            value={selectedClient ? selectedClient.name : search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                handleClientChange('');
                                setOpen(true);
                            }}
                            onFocus={() => setOpen(true)}
                            placeholder="Seleccione un cliente"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            required
                        />

                        {selectedClient && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    handleClientChange('');
                                    setOpen(false);
                                }}
                                className="absolute right-2 top-2 text-sm text-gray-500 hover:text-gray-700"
                                aria-label="Eliminar selección"
                            >
                                ✕
                            </button>
                        )}

                        {open && (
                            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white border border-gray-200 shadow-sm">
                                {filtered.length === 0 && (
                                    <li className="px-3 py-2 text-sm text-gray-500">No hay resultados</li>
                                )}
                                {filtered.map((client) => (
                                    <li
                                        key={client.id}
                                        className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-50"
                                        onMouseDown={(ev) => ev.preventDefault()}
                                        onClick={() => {
                                            handleClientChange(String(client.id));
                                            setSearch('');
                                            setOpen(false);
                                        }}
                                    >
                                        {client.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

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

                <div>
                    <InputLabel htmlFor="recurrence" value="Recurrencia" />
                    <select
                        id="recurrence"
                        name="recurrence"
                        value={data.recurrence ?? ''}
                        onChange={(event) => onChange('recurrence', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="">Sin recurrencia (usar contrato)</option>
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Quincenal</option>
                        <option value="monthly">Mensual</option>
                        <option value="one_time">Un solo pago</option>
                    </select>
                    <InputError message={errors.recurrence} className="mt-2" />
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
