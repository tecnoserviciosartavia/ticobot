import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm, Link } from '@inertiajs/react';
import { ArrowLeft, Save, FileText, User, DollarSign } from '@/Components/icons';

interface CreateClientContractProps extends PageProps {
    client: { id: number; name: string; phone?: string | null };
    services: Array<{ id: number; name: string; price: string; currency: string; account_email?: string | null; max_profiles?: number | null; profiles_used?: number }>;
    defaultCurrency: string;
    defaultBillingCycle: string;
    returnTo: string;
}

export default function CreateClientContract({ client, services, defaultCurrency, defaultBillingCycle, returnTo }: CreateClientContractProps) {
    const form = useForm({
        client_id: client.id,
        amount: '0.00',
        currency: defaultCurrency ?? 'CRC',
        discount_amount: '0',
        billing_cycle: defaultBillingCycle ?? 'monthly',
        next_due_date: '',
        grace_period_days: '0',
        notes: '',
        service_ids: [] as number[],
        service_quantities: {} as Record<string, number>,
        service_pins: {} as Record<string, string>,
    });

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.post(route('clients.contracts.store', client.id), {
            preserveScroll: true,
        });
    };

    return (
        <ResponsiveLayout title="Crear Contrato">
            <Head title="Crear contrato" />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Nuevo Contrato</h1>
                                <p className="mt-2 text-gray-600">
                                    Crear contrato para: <span className="font-medium text-gray-900">{client.name}</span>
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={returnTo}>
                                    <Button variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Client Info Card */}
                    <Card className="p-6 mb-8">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <User className="h-8 w-8 text-blue-600" />
                            </div>
                            <div className="ml-4">
                                <h3 className="text-lg font-medium text-gray-900">Información del Cliente</h3>
                                <div className="mt-1 space-y-1">
                                    <p className="text-sm text-gray-600">
                                        <span className="font-medium">Nombre:</span> {client.name}
                                    </p>
                                    {client.phone && (
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">Teléfono:</span> {client.phone}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Contract Form */}
                    <Card className="p-6">
                        <div className="flex items-center mb-6">
                            <FileText className="h-6 w-6 text-gray-600 mr-2" />
                            <h3 className="text-lg font-medium text-gray-900">Detalles del Contrato</h3>
                        </div>
                        
                        <ContractForm
                            data={form.data}
                            errors={form.errors}
                            clients={[{ id: client.id, name: client.name, phone: client.phone ?? null }]}
                            services={services}
                            processing={form.processing}
                            submitLabel="Guardar contrato"
                            onSubmit={handleSubmit}
                            onChange={form.setData as any}
                            cancelHref={returnTo}
                        />
                    </Card>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
