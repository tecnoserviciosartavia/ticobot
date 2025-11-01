import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface ContractResource {
    id: number;
    client_id: number;
    name: string;
    amount: string;
    currency: string;
    billing_cycle: string;
    next_due_date: string | null;
    grace_period_days: number;
}

interface ContractsEditProps extends PageProps<{
    contract: ContractResource;
    clients: Array<{ id: number; name: string }>;
}> {}

export default function ContractsEdit({ contract, clients }: ContractsEditProps) {
    const form = useForm({
        client_id: contract.client_id.toString(),
        name: contract.name ?? '',
        amount: contract.amount?.toString() ?? '',
        currency: contract.currency ?? 'CRC',
        billing_cycle: contract.billing_cycle ?? '',
        next_due_date: contract.next_due_date ?? '',
        grace_period_days: contract.grace_period_days?.toString() ?? '0',
    });

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.put(route('contracts.update', contract.id));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">Editar contrato</h2>
                    <p className="text-sm text-gray-500">Actualiza los términos para mantener los recordatorios al día.</p>
                </div>
            }
        >
            <Head title={`Editar ${contract.name}`} />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white p-6 shadow">
                        <ContractForm
                            data={form.data}
                            errors={form.errors}
                            clients={clients}
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
