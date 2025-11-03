import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ClientForm from '@/Pages/Clients/Partials/ClientForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface CreateClientPageProps extends PageProps {
    statuses: string[];
    defaultStatus: string;
}

export default function CreateClient({ statuses, defaultStatus }: CreateClientPageProps) {
    const form = useForm({
        name: '',
        email: '',
        phone: '',
        status: defaultStatus ?? 'active',
        notes: '',
    });

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.post(route('clients.store'));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">
                        Nuevo cliente
                    </h2>
                    <p className="text-sm text-gray-500">
                        Registra un cliente para programar recordatorios y controlar sus pagos.
                    </p>
                </div>
            }
        >
            <Head title="Crear cliente" />

            <div className="py-12">
                <div className="mx-auto max-w-5xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white p-6 shadow">
                        <ClientForm
                            data={form.data}
                            errors={form.errors}
                            statuses={statuses}
                            processing={form.processing}
                            submitLabel="Guardar cliente"
                            onSubmit={handleSubmit}
                            onChange={form.setData}
                            cancelHref={route('clients.index')}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
