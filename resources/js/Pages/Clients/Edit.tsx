import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ClientForm from '@/Pages/Clients/Partials/ClientForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface ClientResource {
    id: number;
    name: string;
    // legal_id removed
    email: string | null;
    phone: string | null;
    status: string;
    notes: string | null;
}

interface EditClientPageProps extends PageProps {
    client: ClientResource;
    statuses: string[];
}

export default function EditClient({ client, statuses }: EditClientPageProps) {
    const form = useForm({
        name: client.name ?? '',
        email: client.email ?? '',
        phone: client.phone ?? '',
        status: client.status ?? 'active',
        notes: client.notes ?? '',
    });

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.put(route('clients.update', client.id));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">
                        Editar cliente
                    </h2>
                    <p className="text-sm text-gray-500">
                        Actualiza la información de contacto y el estado para coordinar los recordatorios correctamente.
                    </p>
                </div>
            }
        >
            <Head title={`Editar ${client.name}`} />

            <div className="py-12">
                <div className="mx-auto max-w-5xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white p-6 shadow">
                        <ClientForm
                            data={form.data}
                            errors={form.errors}
                            statuses={statuses}
                            processing={form.processing}
                            submitLabel="Guardar cambios"
                            onSubmit={handleSubmit}
                            onChange={form.setData}
                            cancelHref={route('clients.show', client.id)}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
