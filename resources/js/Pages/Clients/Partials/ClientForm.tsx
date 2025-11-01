import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Link } from '@inertiajs/react';
import { FormEventHandler } from 'react';

interface ClientFormData {
    name: string;
    legal_id: string;
    email: string;
    phone: string;
    status: string;
    notes: string;
}

interface ClientFormProps {
    data: ClientFormData;
    errors: Record<string, string | undefined>;
    statuses: string[];
    processing: boolean;
    submitLabel: string;
    onSubmit: FormEventHandler<HTMLFormElement>;
    onChange: (key: keyof ClientFormData, value: string) => void;
    cancelHref: string;
}

const formatStatusLabel = (value: string) =>
    value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

export default function ClientForm({
    data,
    errors,
    statuses,
    processing,
    submitLabel,
    onSubmit,
    onChange,
    cancelHref,
}: ClientFormProps) {
    const statusOptions = statuses.length ? statuses : ['active', 'inactive'];

    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                    <InputLabel htmlFor="name" value="Nombre" />
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
                    <InputLabel htmlFor="legal_id" value="Identificación legal" />
                    <TextInput
                        id="legal_id"
                        name="legal_id"
                        value={data.legal_id}
                        onChange={(event) => onChange('legal_id', event.target.value)}
                        className="mt-1 block w-full"
                        placeholder="Opcional"
                    />
                    <InputError message={errors.legal_id} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="email" value="Correo electrónico" />
                    <TextInput
                        id="email"
                        name="email"
                        type="email"
                        value={data.email}
                        onChange={(event) => onChange('email', event.target.value)}
                        className="mt-1 block w-full"
                        placeholder="cliente@dominio.com"
                    />
                    <InputError message={errors.email} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="phone" value="Teléfono" />
                    <TextInput
                        id="phone"
                        name="phone"
                        value={data.phone}
                        onChange={(event) => onChange('phone', event.target.value)}
                        className="mt-1 block w-full"
                        placeholder="Ej: 8888-8888"
                    />
                    <InputError message={errors.phone} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="status" value="Estado" />
                    <select
                        id="status"
                        name="status"
                        value={data.status}
                        onChange={(event) => onChange('status', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        {statusOptions.map((status) => (
                            <option key={status} value={status}>
                                {formatStatusLabel(status)}
                            </option>
                        ))}
                    </select>
                    <InputError message={errors.status} className="mt-2" />
                </div>

                <div className="md:col-span-2">
                    <InputLabel htmlFor="notes" value="Notas" />
                    <textarea
                        id="notes"
                        name="notes"
                        value={data.notes}
                        onChange={(event) => onChange('notes', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        rows={4}
                        placeholder="Información adicional relevante para las gestiones de cobro"
                    />
                    <InputError message={errors.notes} className="mt-2" />
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <Link
                    href={cancelHref}
                    className="text-sm font-medium text-gray-600 transition hover:text-gray-800"
                    preserveState
                    preserveScroll
                >
                    Cancelar y volver
                </Link>
                <PrimaryButton disabled={processing}>{submitLabel}</PrimaryButton>
            </div>
        </form>
    );
}
