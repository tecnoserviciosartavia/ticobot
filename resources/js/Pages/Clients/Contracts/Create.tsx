import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface CreateClientContractProps extends PageProps {
    client: { id: number; name: string };
    services: Array<{ id: number; name: string; price: string; currency: string }>;
    defaultCurrency: string;
    defaultBillingCycle: string;
    returnTo: string;
}

export default function CreateClientContract({ client, services, defaultCurrency, defaultBillingCycle, returnTo }: CreateClientContractProps) {
    const form = useForm({
        client_id: client.id,
        name: '',
        amount: '0.00',
        currency: defaultCurrency ?? 'CRC',
        billing_cycle: defaultBillingCycle ?? 'monthly',
        next_due_date: '',
        grace_period_days: '0',
        notes: '',
        service_ids: [] as number[],
    });

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.post(route('clients.contracts.store', client.id), {
            preserveScroll: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100">
                            Nuevo contrato
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Cliente: <span className="font-medium text-gray-800 dark:text-gray-100">{client.name}</span>
                        </p>
                    </div>
                </div>
            }
        >
            <Head title="Crear contrato" />

            <div className="py-8">
                <div className="mx-auto max-w-5xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white p-6 shadow-lg dark:bg-gray-800 dark:shadow-gray-900/50">
                        <ContractForm
                            data={form.data}
                            errors={form.errors}
                            clients={[{ id: client.id, name: client.name }]}
                            services={services}
                            processing={form.processing}
                            submitLabel="Guardar contrato"
                            onSubmit={handleSubmit}
                            onChange={form.setData as any}
                            cancelHref={returnTo}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
