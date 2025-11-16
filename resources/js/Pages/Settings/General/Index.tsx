import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm } from '@inertiajs/react';
import type { PageProps } from '@/types';

type Props = PageProps<{ settings: Record<string, string> }>;

export default function SettingsIndex({ settings }: Props) {
    const form = useForm({
        service_name: settings.service_name ?? '',
        payment_contact: settings.payment_contact ?? '',
        bank_accounts: settings.bank_accounts ?? '',
        beneficiary_name: settings.beneficiary_name ?? '',
    });

    const submit: React.FormEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault();
        form.post(route('settings.update'));
    };

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-semibold">Configuración del sistema</h2>}>
            <Head title="Configuración" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white p-6 shadow">
                        <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nombre del servicio</label>
                                <input
                                    value={form.data.service_name}
                                    onChange={(e) => form.setData('service_name', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Sinpemóvil / Contacto de pago</label>
                                <input
                                    value={form.data.payment_contact}
                                    onChange={(e) => form.setData('payment_contact', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Beneficiario (nombre)</label>
                                <input
                                    value={form.data.beneficiary_name}
                                    onChange={(e) => form.setData('beneficiary_name', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Cuentas bancarias (separadas por nueva línea o ;) </label>
                                <textarea
                                    value={form.data.bank_accounts}
                                    onChange={(e) => form.setData('bank_accounts', e.target.value)}
                                    rows={6}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3">
                                <button type="submit" className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
