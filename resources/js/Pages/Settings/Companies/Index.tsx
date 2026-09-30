import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { useState } from 'react';

type Company = {
    id: number; name: string; slug: string; reminder_template?: string | null;
    payment_contact?: string | null; bank_accounts?: string | null;
    beneficiary_name?: string | null; is_active: boolean; sinpe_email_enabled: boolean;
    sinpe_imap_host?: string | null; sinpe_imap_port?: number | null; sinpe_imap_encryption?: string | null; sinpe_imap_folder?: string | null; sinpe_imap_username?: string | null; sinpe_imap_password_configured?: boolean;
    clients_count: number; services_count: number;
};
type FormData = {
    name: string; slug: string; reminder_template: string; payment_contact: string;
    bank_accounts: string; beneficiary_name: string; is_active: boolean; sinpe_email_enabled: boolean;
    sinpe_imap_host: string; sinpe_imap_port: string; sinpe_imap_encryption: string; sinpe_imap_folder: string; sinpe_imap_username: string; sinpe_imap_password: string; sinpe_imap_password_configured?: boolean;
};
const blank: FormData = { name: '', slug: '', reminder_template: '', payment_contact: '', bank_accounts: '', beneficiary_name: '', is_active: true, sinpe_email_enabled: false, sinpe_imap_host: 'imap.dreamhost.com', sinpe_imap_port: '993', sinpe_imap_encryption: 'ssl', sinpe_imap_folder: 'BCR', sinpe_imap_username: '', sinpe_imap_password: '' };
const variables = ['{client_name}', '{company_name}', '{due_date}', '{amount}', '{services}', '{contract_name}', '{payment_contact}', '{bank_accounts}', '{beneficiary_name}'];

function CompanyFields({ form }: { form: any }) {
    const insertVariable = (token: string) => form.setData('reminder_template', `${form.data.reminder_template}${form.data.reminder_template ? '\n' : ''}${token}`);
    return <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Nombre de la empresa<input className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} required /></label>
        <label className="text-sm font-medium">Identificador<input className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.slug} onChange={(e) => form.setData('slug', e.target.value)} placeholder="Se genera desde el nombre" /></label>
        <label className="text-sm font-medium">SINPE móvil / contacto de pago<input className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.payment_contact} onChange={(e) => form.setData('payment_contact', e.target.value)} /></label>
        <label className="text-sm font-medium">Beneficiario<input className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.beneficiary_name} onChange={(e) => form.setData('beneficiary_name', e.target.value)} /></label>
        <label className="text-sm font-medium md:col-span-2">Cuentas bancarias<textarea className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" rows={4} value={form.data.bank_accounts} onChange={(e) => form.setData('bank_accounts', e.target.value)} /></label>
        <div className="md:col-span-2">
            <label className="text-sm font-medium">Plantilla de recordatorio</label>
            <div className="my-2 flex flex-wrap gap-2">{variables.map((token) => <button key={token} type="button" onClick={() => insertVariable(token)} className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">+ {token}</button>)}</div>
            <textarea className="block w-full rounded-md border-gray-300 font-mono dark:border-gray-600 dark:bg-gray-700" rows={12} value={form.data.reminder_template} onChange={(e) => form.setData('reminder_template', e.target.value)} placeholder="Hola {client_name}..." />
        </div>
        <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4 md:col-span-2 dark:border-gray-700">
            <legend className="px-2 font-semibold">Buzón de comprobantes SINPE</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.data.sinpe_email_enabled} onChange={(e) => form.setData('sinpe_email_enabled', e.target.checked)} /> Activar lectura de correo para esta empresa</label>
            <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm">Servidor IMAP<input className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.sinpe_imap_host} onChange={(e) => form.setData('sinpe_imap_host', e.target.value)} /></label>
                <label className="text-sm">Puerto<input type="number" className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.sinpe_imap_port} onChange={(e) => form.setData('sinpe_imap_port', e.target.value)} /></label>
                <label className="text-sm">Seguridad<select className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.sinpe_imap_encryption} onChange={(e) => form.setData('sinpe_imap_encryption', e.target.value)}><option value="ssl">SSL</option><option value="tls">TLS</option><option value="none">Sin cifrado</option></select></label>
                <label className="text-sm">Carpeta<input className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.sinpe_imap_folder} onChange={(e) => form.setData('sinpe_imap_folder', e.target.value)} /></label>
                <label className="text-sm">Usuario / correo<input className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.sinpe_imap_username} onChange={(e) => form.setData('sinpe_imap_username', e.target.value)} /></label>
                <label className="text-sm">Contraseña<input type="password" autoComplete="new-password" className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" value={form.data.sinpe_imap_password} onChange={(e) => form.setData('sinpe_imap_password', e.target.value)} placeholder={form.data.sinpe_imap_password_configured ? 'Ya configurada; dejar vacío para conservar' : 'Contraseña del buzón'} /></label>
            </div>
            <p className="text-xs text-gray-500">La contraseña se guarda cifrada y nunca se vuelve a mostrar.</p>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.data.is_active} onChange={(e) => form.setData('is_active', e.target.checked)} /> Empresa activa</label>
    </div>;
}

export default function Companies({ companies, multiCompanyEnabled }: { companies: Company[]; multiCompanyEnabled: boolean }) {
    const create = useForm<FormData>(blank);
    const edit = useForm<FormData>(blank);
    const [editing, setEditing] = useState<number | null>(null);
    const [testPhones, setTestPhones] = useState<Record<number, string>>({});
    const [testingId, setTestingId] = useState<number | null>(null);

    const startEdit = (company: Company) => {
        setEditing(company.id);
        edit.setData({ name: company.name, slug: company.slug, reminder_template: company.reminder_template ?? '', payment_contact: company.payment_contact ?? '', bank_accounts: company.bank_accounts ?? '', beneficiary_name: company.beneficiary_name ?? '', is_active: company.is_active, sinpe_email_enabled: company.sinpe_email_enabled ?? false, sinpe_imap_host: company.sinpe_imap_host ?? 'imap.dreamhost.com', sinpe_imap_port: String(company.sinpe_imap_port ?? 993), sinpe_imap_encryption: company.sinpe_imap_encryption ?? 'ssl', sinpe_imap_folder: company.sinpe_imap_folder ?? 'BCR', sinpe_imap_username: company.sinpe_imap_username ?? '', sinpe_imap_password: '', sinpe_imap_password_configured: company.sinpe_imap_password_configured ?? false });
    };
    const sendTest = (company: Company) => {
        setTestingId(company.id);
        router.post(route('settings.companies.send-test', company.id), { phone: testPhones[company.id] ?? '' }, { preserveScroll: true, onFinish: () => setTestingId(null) });
    };

    return <ResponsiveLayout title="Empresas"><Head title="Configuración - Empresas" />
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
            <div className="flex justify-between gap-4"><div><h1 className="text-2xl font-bold">Configuración multiempresa</h1><p className="text-gray-500 dark:text-gray-400">Cada empresa administra sus servicios, datos de pago y plantilla.</p></div><Link href={route('settings.index')} className="text-indigo-600">Volver</Link></div>
            <section className="rounded-xl bg-white p-5 shadow dark:bg-gray-800"><label className="flex items-center gap-3"><input type="checkbox" checked={multiCompanyEnabled} onChange={(e) => router.patch(route('settings.companies.toggle'), { enabled: e.target.checked })} /><span><b>Modo multiempresa</b><small className="block text-gray-500">Al activarlo, cada cliente debe pertenecer a una empresa.</small></span></label></section>
            <form className="rounded-xl bg-white p-5 shadow dark:bg-gray-800" onSubmit={(e) => { e.preventDefault(); create.post(route('settings.companies.store'), { onSuccess: () => create.reset() }); }}><h2 className="mb-4 text-lg font-semibold">Agregar empresa</h2><CompanyFields form={create} /><button className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white">Guardar empresa</button></form>
            {companies.map((company) => <section key={company.id} className="rounded-xl bg-white p-5 shadow dark:bg-gray-800">
                {editing === company.id ? <form onSubmit={(e) => { e.preventDefault(); edit.put(route('settings.companies.update', company.id), { preserveScroll: true, onSuccess: () => setEditing(null) }); }}><CompanyFields form={edit} /><div className="mt-4 flex gap-3"><button className="rounded bg-indigo-600 px-4 py-2 text-white">Guardar cambios</button><button type="button" onClick={() => setEditing(null)}>Cancelar</button></div></form> : <>
                    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{company.name}</h2><p className="text-sm text-gray-500">{company.clients_count} clientes · {company.services_count} servicios · {company.is_active ? 'Activa' : 'Inactiva'}</p></div><div className="flex gap-3"><button className="text-indigo-600" onClick={() => startEdit(company)}>Editar configuración</button><button className="text-red-600" onClick={() => confirm('¿Eliminar empresa?') && router.delete(route('settings.companies.destroy', company.id))}>Eliminar</button></div></div>
                    <div className="mt-5 rounded-lg border border-gray-200 p-4 dark:border-gray-700"><h3 className="font-semibold">Enviar recordatorio de prueba de {company.name}</h3><p className="mt-1 text-xs text-gray-500">Usará exclusivamente la plantilla y datos de pago configurados para esta empresa.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={testPhones[company.id] ?? ''} onChange={(e) => setTestPhones((current) => ({ ...current, [company.id]: e.target.value }))} placeholder="Ej: 61784023 o 50661784023" className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700" /><button type="button" onClick={() => sendTest(company)} disabled={testingId === company.id} className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{testingId === company.id ? 'Enviando…' : 'Enviar prueba'}</button></div></div>
                </>}
            </section>)}
        </div>
    </ResponsiveLayout>;
}
