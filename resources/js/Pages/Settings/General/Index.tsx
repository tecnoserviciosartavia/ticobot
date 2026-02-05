import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm } from '@inertiajs/react';
import type { PageProps } from '@/types';
import WhatsAppConnectionCard, { WhatsAppStatus } from '@/Pages/Profile/Partials/WhatsAppConnectionCard';
import { useRef, useState } from 'react';

type ServiceItem = {
    id: number;
    name: string;
    price: string;
    currency: 'CRC' | 'USD';
    is_active: boolean;
    updated_at?: string | null;
};

type Props = PageProps<{ settings: Record<string, string>; whatsapp?: WhatsAppStatus; services: ServiceItem[] }>;

const currencySymbol = (currency: string) => {
    switch (currency) {
        case 'CRC':
            return '₡';
        case 'USD':
            return '$';
        default:
            return currency;
    }
};

export default function SettingsIndex({ settings, whatsapp, services }: Props) {
    const [activeTab, setActiveTab] = useState<'whatsapp' | 'general' | 'services'>(() => (whatsapp ? 'whatsapp' : 'general'));

    const form = useForm({
        company_name: settings.company_name ?? '',
        reminder_template: settings.reminder_template ?? '',
        payment_contact: settings.payment_contact ?? '',
        bank_accounts: settings.bank_accounts ?? '',
        beneficiary_name: settings.beneficiary_name ?? '',
    });

    const templateRef = useRef<HTMLTextAreaElement | null>(null);

    const insertPlaceholder = (placeholder: string) => {
        const el = templateRef.current;
        const current = String(form.data.reminder_template ?? '');

        if (!el) {
            const next = current ? `${current}${placeholder}` : placeholder;
            form.setData('reminder_template', next);
            return;
        }

        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? current.length;
        const next = `${current.slice(0, start)}${placeholder}${current.slice(end)}`;
        const caret = start + placeholder.length;

        form.setData('reminder_template', next);
        // Esperar a que React pinte el nuevo valor antes de restaurar cursor/foco
        queueMicrotask(() => {
            el.focus();
            el.setSelectionRange(caret, caret);
        });
    };

    const submit: React.FormEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault();
        form.post(route('settings.update'));
    };

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-semibold">Configuración del sistema</h2>}>
            <Head title="Configuración" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="rounded-xl bg-white dark:bg-gray-800 dark:bg-gray-800 shadow-lg dark:shadow-gray-900/50">
                        <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-6">
                            <div className="flex flex-wrap gap-2">
                                {whatsapp && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('whatsapp')}
                                        className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                            activeTab === 'whatsapp'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        Integración WhatsApp
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('general')}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                        activeTab === 'general'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    General
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('services')}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${
                                        activeTab === 'services'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Servicios
                                </button>
                            </div>

  
                        </div>

                        {activeTab === 'whatsapp' && whatsapp && (
                            <div className="p-6">
                                <div className="mb-4">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Integración WhatsApp</h3>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Estado de conexión y vinculación con WhatsApp Web.</p>
                                </div>
                                <WhatsAppConnectionCard data={whatsapp} />
                            </div>
                        )}

                        {activeTab === 'general' && (
                            <div className="p-6">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">General</h3>
                                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajustes generales del sistema.</p>
                                    </div>
                                </div>

                                <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de la empresa</label>
                                <input
                                    value={form.data.company_name}
                                    onChange={(e) => form.setData('company_name', e.target.value)}
                                    placeholder="Ej: TecnoServicios Artavia"
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Este nombre se usará como remitente en los recordatorios enviados por WhatsApp.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Plantilla global de recordatorio</label>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Personalizá el mensaje completo. Usá las variables para insertar datos como nombre del cliente, fecha y monto.
                                </p>

                                <div className="mt-2 flex flex-wrap gap-2">
                                    {[
                                        { label: 'Cliente', key: '{client_name}' },
                                        { label: 'Empresa', key: '{company_name}' },
                                        { label: 'Vence', key: '{due_date}' },
                                        { label: 'Monto', key: '{amount}' },
                                        { label: 'Servicios', key: '{services}' },
                                        { label: 'Contrato', key: '{contract_name}' },
                                        { label: 'Sinpe', key: '{payment_contact}' },
                                        { label: 'Cuentas', key: '{bank_accounts}' },
                                        { label: 'Beneficiario', key: '{beneficiary_name}' },
                                    ].map((p) => (
                                        <button
                                            key={p.key}
                                            type="button"
                                            onClick={() => insertPlaceholder(p.key)}
                                            className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-200"
                                        >
                                            + {p.label}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    ref={templateRef}
                                    value={form.data.reminder_template}
                                    onChange={(e) => form.setData('reminder_template', e.target.value)}
                                    rows={10}
                                    placeholder={
                                        'Ejemplo:\n\n' +
                                        '{company_name}, le informa a {client_name} que:\n' +
                                        'Ha vencido el {due_date}\n' +
                                        'Servicios: {services}\n' +
                                        'Total: ₡{amount}\n\n' +
                                        'Sinpemóvil: {payment_contact}\n' +
                                        '{bank_accounts}\n' +
                                        'Todas a nombre de {beneficiary_name}\n\n' +
                                        'Si ya canceló, omita el mensaje'
                                    }
                                    className="mt-2 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    La plantilla es obligatoria: si está vacía, el bot no enviará recordatorios.
                                </p>
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
                        )}

                        {activeTab === 'services' && (
                            <div className="p-6">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Servicios</h3>
                                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Servicios disponibles para seleccionar en contratos.</p>
                                    </div>
                                    <a
                                        href={route('settings.services.index')}
                                        className="inline-flex items-center rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-200"
                                    >
                                        Administrar servicios
                                    </a>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead>
                                            <tr className="text-left text-sm text-gray-600 dark:text-gray-300">
                                                <th className="py-2 pr-4">Nombre</th>
                                                <th className="py-2 pr-4">Monto</th>
                                                <th className="py-2 pr-4">Moneda</th>
                                                <th className="py-2">Activo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {services.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="py-6 text-sm text-gray-500">
                                                        No hay servicios configurados.
                                                    </td>
                                                </tr>
                                            ) : (
                                                services.map((s) => (
                                                    <tr key={s.id} className="text-sm">
                                                        <td className="py-2 pr-4">
                                                            <span className={!s.is_active ? 'text-gray-400 line-through' : ''}>{s.name}</span>
                                                        </td>
                                                        <td className="py-2 pr-4">{s.price}</td>
                                                        <td className="py-2 pr-4">{currencySymbol(s.currency)}</td>
                                                        <td className="py-2">{s.is_active ? 'Sí' : 'No'}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
