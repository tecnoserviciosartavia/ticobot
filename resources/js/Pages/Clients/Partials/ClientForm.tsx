import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import PhoneNumberInput from '@/Components/PhoneNumberInput';
import { Link } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { labelForStatus } from '@/lib/labels';

interface ContractOption {
    id: number;
    name: string;
}

interface ClientFormData {
    company_id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    notes: string;
    contract_id?: number | string | null;
}

interface ClientFormProps {
    data: ClientFormData;
    errors: Record<string, string | undefined>;
    statuses: string[];
    companies: Array<{ id: number; name: string }>;
    multiCompanyEnabled: boolean;
    contracts?: ContractOption[];
    onCreateContract?: () => void;
    processing: boolean;
    submitLabel: string;
    onSubmit: FormEventHandler<HTMLFormElement>;
    onChange: (key: keyof ClientFormData, value: string) => void;
    cancelHref: string;
}

export default function ClientForm({
    data,
    errors,
    statuses,
    companies,
    multiCompanyEnabled,
    contracts,
    onCreateContract,
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
                {multiCompanyEnabled && <div>
                    <InputLabel htmlFor="company_id" value="Empresa" />
                    <select id="company_id" name="company_id" value={data.company_id} onChange={(event) => onChange('company_id', event.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                        <option value="">Seleccione una empresa</option>
                        {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
                    </select>
                    <InputError message={errors.company_id} className="mt-2" />
                    {multiCompanyEnabled && <p className="mt-1 text-xs text-gray-500">Define los servicios y mensajes disponibles para este cliente.</p>}
                </div>}

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

                {/* Removed legal_id field as requested */}


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
                    <PhoneNumberInput value={data.phone} onChange={(value) => onChange('phone', value)} />
                    <InputError message={errors.phone} className="mt-2" />
                </div>

                <div>
                    <InputLabel htmlFor="status" value="Estado" />
                    <select
                        id="status"
                        name="status"
                        value={data.status}
                        onChange={(event) => onChange('status', event.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                    >
                        {statusOptions.map((status) => (
                            <option key={status} value={status}>
                                {labelForStatus(status)}
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
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                        rows={4}
                        placeholder="Información adicional relevante para las gestiones de cobro"
                    />
                    <InputError message={errors.notes} className="mt-2" />
                </div>

                {(contracts || onCreateContract) && (
                    <div className="md:col-span-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div className="flex-1">
                                <InputLabel htmlFor="contract_id" value="Contrato (opcional)" />
                                <select
                                    id="contract_id"
                                    name="contract_id"
                                    value={data.contract_id ? String(data.contract_id) : ''}
                                    onChange={(event) => onChange('contract_id', event.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                >
                                    <option value="">Sin contrato asignado</option>
                                    {(contracts ?? []).map((c) => (
                                        <option key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <InputError message={errors.contract_id} className="mt-2" />
                            </div>

                            {onCreateContract && (
                                <button
                                    type="button"
                                    onClick={onCreateContract}
                                    className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    + Crear contrato
                                </button>
                            )}
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Si no existe el contrato, créalo aquí. Luego terminas de llenar el cliente y al final guardas el cliente.
                        </p>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
                <Link
                    href={cancelHref}
                    className="text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:text-gray-800 dark:text-gray-100"
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
