import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ReminderForm, { ReminderFormData } from '@/Pages/Reminders/Partials/ReminderForm';
import type { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';

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

const toDatetimeLocal = (value: string | null) => {
    if (!value) {
        return '';
    }

    return value.replace(' ', 'T').slice(0, 16);
};

export default function RemindersEdit({ reminder, clients, channels }: RemindersEditProps) {
    const form = useForm<ReminderFormData>({
        client_id: String(reminder.client_id ?? ''),
        contract_id: String(reminder.contract_id ?? ''),
        channel: reminder.channel,
        scheduled_for: toDatetimeLocal(reminder.scheduled_for),
        message: reminder.message ?? '',
        amount: reminder.amount ?? '',
        due_date: reminder.due_date ?? '',
        recurrence: (reminder as any).recurrence ?? '',
    });

    const statusLabel = reminder.status
        ? reminder.status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
        : 'Desconocido';

    const handleChange = (field: keyof ReminderFormData, value: string) => {
        form.setData(field as never, value as never);
    };

    const submit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        form.put(route('reminders.update', reminder.id));
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">
                        Editar recordatorio
                    </h2>
                    <span className="text-sm text-gray-500 uppercase tracking-wide">
                        Estado actual: {statusLabel}
                    </span>
                </div>
            }
        >
            <Head title="Editar recordatorio" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white p-6 shadow">
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
        </AuthenticatedLayout>
    );
}
