import ResponsiveLayout from '@/Components/ResponsiveLayout';
import ReminderForm, { ReminderFormData } from '@/Pages/Reminders/Partials/ReminderForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { labelForStatus } from '@/lib/labels';

interface RemindersEditProps extends PageProps<{
    reminder: {
        id: number;
        client_id: number;
        contract_id: number;
        channel: string;
        scheduled_for: string | null;
        status: string;
        message: string;
        amount: string;
        due_date: string | null;
    };
    clients: Array<{
        id: number;
        name: string;
        contracts: Array<{ id: number; name: string }>;
    }>;
    channels: string[];
}> {}

const toDateInput = (value: string | null) => {
    if (!value) {
        return '';
    }

    return value.slice(0, 10);
};

export default function RemindersEdit({ reminder, clients, channels }: RemindersEditProps) {
    const form = useForm<ReminderFormData>({
        client_id: String(reminder.client_id ?? ''),
        contract_id: String(reminder.contract_id ?? ''),
        channel: reminder.channel,
        scheduled_for: toDateInput(reminder.scheduled_for),
        message: reminder.message ?? '',
        amount: reminder.amount ?? '',
        due_date: reminder.due_date ?? '',
        recurrence: (reminder as any).recurrence ?? '',
    });

    const statusLabel = reminder.status ? labelForStatus(reminder.status) : 'Desconocido';

    const handleChange = (field: keyof ReminderFormData, value: string) => {
        form.setData(field as never, value as never);
    };

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.put(route('reminders.update', reminder.id));
    };

    return (
        <ResponsiveLayout title="Editar recordatorio">
            <Head title="Editar recordatorio" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <ReminderForm
                            data={form.data}
                            errors={form.errors}
                            clients={clients}
                            channels={channels}
                            processing={form.processing}
                            submitLabel="Actualizar recordatorio"
                            onSubmit={submit}
                            onChange={handleChange}
                            cancelHref={route('reminders.show', reminder.id)}
                        />
                    </div>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
