import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ClientForm from '@/Pages/Clients/Partials/ClientForm';
import Modal from '@/Components/Modal';
import ContractForm from '@/Pages/Contracts/Partials/ContractForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import axios from 'axios';
import { useMemo, useState } from 'react';

interface CreateClientPageProps extends PageProps {
    statuses: string[];
    defaultStatus: string;
    services: Array<{ id: number; name: string; price: string; currency: string }>;
}

export default function CreateClient({ statuses, defaultStatus, services }: CreateClientPageProps) {
    const form = useForm({
        name: '',
        email: '',
        phone: '',
        status: defaultStatus ?? 'active',
        notes: '',
        contract_id: '',
    });

    const [contractModalOpen, setContractModalOpen] = useState(false);
    const [contractForm, setContractForm] = useState({
        client_id: '',
        name: '',
        amount: '0.00',
        currency: 'CRC',
        billing_cycle: 'monthly',
        next_due_date: '',
        grace_period_days: '0',
        notes: '',
        service_ids: [] as number[],
    });
    const [contractErrors, setContractErrors] = useState<Record<string, string | undefined>>({});
    const [contractProcessing, setContractProcessing] = useState(false);
    const [contracts, setContracts] = useState<Array<{ id: number; name: string }>>([]);

    const clientsForContractForm = useMemo(() => [{ id: 0, name: 'Nuevo cliente' }], []);

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.post(route('clients.store'));
    };

    const openCreateContract = () => {
        setContractErrors({});
        setContractModalOpen(true);
    };

    const saveContract = async () => {
        setContractProcessing(true);
        setContractErrors({});
        try {
            const response = await axios.post(route('webapi.contracts.quick'), contractForm);
            const data = response.data as { id: number; name: string };
            setContracts((prev) => [{ id: data.id, name: data.name }, ...prev]);
            form.setData('contract_id', String(data.id));
            setContractModalOpen(false);
        } catch (err: any) {
            if (err?.response?.status === 422) {
                setContractErrors(err.response.data?.errors ?? {});
            } else {
                setContractErrors({ name: 'No se pudo guardar el contrato. Intente de nuevo.' });
            }
        } finally {
            setContractProcessing(false);
        }
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">
                        Nuevo cliente
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Registra un cliente para programar recordatorios y controlar sus pagos.
                    </p>
                </div>
            }
        >
            <Head title="Crear cliente" />

            <div className="py-12">
                <div className="mx-auto max-w-5xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <ClientForm
                            data={form.data}
                            errors={form.errors}
                            statuses={statuses}
                            processing={form.processing}
                            submitLabel="Guardar cliente"
                            onSubmit={handleSubmit}
                            onChange={form.setData}
                            contracts={contracts}
                            onCreateContract={openCreateContract}
                            cancelHref={route('clients.index')}
                        />
                    </div>
                </div>
            </div>

            <Modal
                show={contractModalOpen}
                maxWidth="2xl"
                closeable={!contractProcessing}
                onClose={() => setContractModalOpen(false)}
            >
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Crear contrato</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Guardas el contrato, se cierra este formulario y vuelves al cliente para terminar y guardar.
                        </p>
                    </div>

                    <ContractForm
                        data={contractForm}
                        errors={contractErrors}
                        clients={clientsForContractForm}
                        services={services}
                        processing={contractProcessing}
                        submitLabel="Guardar contrato"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void saveContract();
                        }}
                        onChange={(key: any, value: any) => setContractForm((prev) => ({ ...prev, [key]: value }))}
                        cancelHref={route('clients.create')}
                        onCancel={() => setContractModalOpen(false)}
                    />
                </div>
            </Modal>
        </AuthenticatedLayout>
    );
}
