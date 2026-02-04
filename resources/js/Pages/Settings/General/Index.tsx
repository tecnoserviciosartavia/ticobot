import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm } from '@inertiajs/react';
import type { PageProps } from '@/types';
import WhatsAppConnectionCard, { WhatsAppStatus } from '@/Pages/Profile/Partials/WhatsAppConnectionCard';

type Props = PageProps<{ settings: Record<string, string>; whatsapp?: WhatsAppStatus }>;

export default function SettingsIndex({ settings, whatsapp }: Props) {
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
                    {whatsapp && (
                        <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50 mb-6">
                            <WhatsAppConnectionCard data={whatsapp} />
                        </div>
                    )}

                    <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 p-6 shadow-lg dark:shadow-gray-900/50">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">General</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajustes generales del sistema.</p>
                            </div>
                            <a
                                href={route('settings.services.index')}
                                className="inline-flex items-center rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-200"
                            >
                                Configurar servicios
                            </a>
                        </div>
                        <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del servicio</label>
                                <input
                                    value={form.data.service_name}
                                    onChange={(e) => form.setData('service_name', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sinpemóvil / Contacto de pago</label>
                                <input
                                    value={form.data.payment_contact}
                                    onChange={(e) => form.setData('payment_contact', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Beneficiario (nombre)</label>
                                <input
                                    value={form.data.beneficiary_name}
                                    onChange={(e) => form.setData('beneficiary_name', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cuentas bancarias (separadas por nueva línea o ;) </label>
                                <textarea
                                    value={form.data.bank_accounts}
                                    onChange={(e) => form.setData('bank_accounts', e.target.value)}
                                    rows={6}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3">
                                <button type="submit" className="inline-flex items-center rounded-md bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 px-4 py-2 text-white font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
