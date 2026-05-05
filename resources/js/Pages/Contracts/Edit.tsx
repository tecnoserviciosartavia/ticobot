import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { FileText, Edit, ArrowLeft } from '@/Components/icons';

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
    service_pins?: Record<string, string>;
}

interface ContractsEditProps extends PageProps<{
    contract: ContractResource;
    clients: Array<{ id: number; name: string; phone?: string | null }>;
    services: Array<{ id: number; name: string; price: string; currency: string; account_email?: string | null; max_profiles?: number | null; profiles_used?: number }>;
}> {}

export default function ContractsEdit({ contract, clients, services }: ContractsEditProps) {
    const form = useForm({
        client_id: contract.client_id.toString(),
        notes: contract.notes ?? '',
        amount: contract.amount?.toString() ?? '',
        currency: contract.currency ?? 'CRC',
        discount_amount: (contract.discount_amount ?? 0).toString(),
        billing_cycle: contract.billing_cycle ?? '',
        next_due_date: contract.next_due_date ?? '',
        grace_period_days: contract.grace_period_days?.toString() ?? '0',
        service_ids: (contract.service_ids ?? []) as number[],
        service_quantities: (contract.service_quantities ?? {}) as Record<string, number>,
        service_pins: (contract.service_pins ?? {}) as Record<string, string>,
    });

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.put(route('contracts.update', contract.id));
    };

    return (
        <ResponsiveLayout title="Editar Contrato">
            <Head title={`Editar ${contract.name}`} />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Editar Contrato</h1>
                                <p className="mt-2 text-gray-600">
                                    Actualiza los términos para mantener los recordatorios al día.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Volver
                                </Button>
                            </div>
                        </div>
                    </div>

                    <Card className="p-6">
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
                    </Card>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
