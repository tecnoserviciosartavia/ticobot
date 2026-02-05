import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface ContractResource {
    id: number;
    client_id: number;
    notes?: string;
    name: string;
    amount: string;
    discount_amount?: string | number | null;
    currency: string;
    billing_cycle: string;
    next_due_date: string | null;
    grace_period_days: number;
    service_ids?: number[];
    service_quantities?: Record<string, number>;
}

interface ContractsEditProps extends PageProps<{
    contract: ContractResource;
    clients: Array<{ id: number; name: string }>;
    services: Array<{ id: number; name: string; price: string; currency: string }>;
}> {}

export default function ContractsEdit({ contract, clients, services }: ContractsEditProps) {
    const form = useForm({
        client_id: contract.client_id.toString(),
        notes: contract.notes ?? '',
        name: contract.name ?? '',
        amount: contract.amount?.toString() ?? '',
        currency: contract.currency ?? 'CRC',
        discount_amount: (contract.discount_amount ?? 0).toString(),
        billing_cycle: contract.billing_cycle ?? '',
        next_due_date: contract.next_due_date ?? '',
        grace_period_days: contract.grace_period_days?.toString() ?? '0',
        service_ids: (contract.service_ids ?? []) as number[],
        service_quantities: (contract.service_quantities ?? {}) as Record<string, number>,
    });

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.put(route('contracts.update', contract.id));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">Editar contrato</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Actualiza los términos para mantener los recordatorios al día.</p>
                </div>
            }
        >
            <Head title={`Editar ${contract.name}`} />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <ContractForm
                            data={form.data}
                            errors={form.errors}
                            clients={clients}
                            services={services}
                            processing={form.processing}
                            submitLabel="Actualizar contrato"
                            onSubmit={submit}
                            onChange={(key, value) => form.setData(key, value)}
                            cancelHref={route('contracts.show', contract.id)}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
