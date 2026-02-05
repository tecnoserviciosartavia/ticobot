import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface ContractsCreateProps extends PageProps<{
    clients: Array<{ id: number; name: string }>;
    services: Array<{ id: number; name: string; price: string; currency: string }>;
    defaultCurrency: string;
    defaultBillingCycle: string;
}> {}

export default function ContractsCreate({ clients, services, defaultCurrency, defaultBillingCycle }: ContractsCreateProps) {
    const form = useForm({
        client_id: '',
        name: '',
        amount: '',
        currency: defaultCurrency ?? 'CRC',
        discount_amount: '0',
        billing_cycle: defaultBillingCycle ?? 'monthly',
        next_due_date: '',
        notes: '',
        grace_period_days: '0',
        service_ids: [] as number[],
    });

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.post(route('contracts.store'));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">Nuevo contrato</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Define los parámetros de cobro que el bot utilizará para programar recordatorios.</p>
                </div>
            }
        >
            <Head title="Crear contrato" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <ContractForm
                            data={form.data}
                            errors={form.errors}
                            clients={clients}
                            services={services}
                            processing={form.processing}
                            submitLabel="Guardar contrato"
                            onSubmit={submit}
                            onChange={(key, value) => form.setData(key, value)}
                            cancelHref={route('contracts.index')}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
