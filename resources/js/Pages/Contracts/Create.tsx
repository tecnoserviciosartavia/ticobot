import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm, Link } from '@inertiajs/react';
import { FileText, Plus, ArrowLeft } from '@/Components/icons';

interface ContractsCreateProps extends PageProps<{
    clients: Array<{ id: number; name: string; phone?: string | null }>;
    services: Array<{
        id: number;
        name: string;
        price: string;
        currency: string;
        account_email?: string | null;
        max_profiles?: number | null;
        profiles_used?: number;
        accounts?: Array<{ id: number; name?: string | null; identifier: string; is_active: boolean }>;
    }>;
    defaultCurrency: string;
    defaultBillingCycle: string;
}> {}

export default function ContractsCreate({ clients, services, defaultCurrency, defaultBillingCycle }: ContractsCreateProps) {
    const form = useForm({
        client_id: '',
        amount: '',
        currency: defaultCurrency ?? 'CRC',
        discount_amount: '0',
        billing_cycle: defaultBillingCycle ?? 'monthly',
        next_due_date: '',
        notes: '',
        grace_period_days: '0',
        status: 'active',
        service_ids: [] as number[],
        service_quantities: {} as Record<string, number>,
        service_pins: {} as Record<string, string>,
        service_account_ids: {} as Record<string, number>,
    });

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.post(route('contracts.store'));
    };

    return (
        <ResponsiveLayout title="Nuevo Contrato">
            <Head title="Crear contrato" />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Nuevo Contrato</h1>
                                <p className="mt-2 text-gray-600">
                                    Define los parámetros de cobro que el bot utilizará para programar recordatorios.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={route('contracts.index')}>
                                    <Button variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver
                                    </Button>
                                </Link>
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
                            submitLabel="Guardar contrato"
                            onSubmit={submit}
                            onChange={(key, value) => form.setData(key, value)}
                            cancelHref={route('contracts.index')}
                        />
                    </Card>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
