import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ReminderForm, { ReminderFormData } from '@/Pages/Reminders/Partials/ReminderForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

interface ReminderCreateProps extends PageProps<{
    clients: Array<{
        id: number;
        name: string;
        contracts: Array<{ id: number; name: string }>;
    }>;
    channels: string[];
    defaultChannel: string;
}> {}

export default function RemindersCreate({ clients, channels, defaultChannel }: ReminderCreateProps) {
    const form = useForm<ReminderFormData>({
        client_id: '',
        contract_id: '',
        channel: defaultChannel ?? channels[0] ?? 'whatsapp',
        scheduled_for: '',
        message: '',
        amount: '',
        due_date: '',
        recurrence: '',
    });

    const handleChange = (field: keyof ReminderFormData, value: string) => {
        form.setData(field as never, value as never);
    };

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.post(route('reminders.store'));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">Programar recordatorio</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Define el mensaje y momento en que el bot enviará el recordatorio al cliente.
                    </p>
                </div>
            }
        >
            <Head title="Programar recordatorio" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <ReminderForm
                            data={form.data}
                            errors={form.errors}
                            clients={clients}
                            channels={channels}
                            processing={form.processing}
                            submitLabel="Guardar recordatorio"
                            onSubmit={submit}
                            onChange={handleChange}
                            cancelHref={route('reminders.index')}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
