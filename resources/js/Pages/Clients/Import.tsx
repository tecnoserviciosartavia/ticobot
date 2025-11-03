import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import type { PageProps } from '@/types';
import { FormEvent, useState } from 'react';

export default function ClientsImport(_props: PageProps) {
    const { data, setData, post, processing, progress, errors, reset } = useForm<{ file: File | null }>({
        file: null,
    });

    const [message, setMessage] = useState<string | null>(null);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);
        const formData: Record<string, any> = {};
        if (data.file) formData.file = data.file;
        post(route('clients.import.store'), {
            forceFormData: true,
            onSuccess: () => {
                // We will be redirected to index with flash; keep local message just in case
                setMessage('Importación enviada.');
                reset();
            },
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold leading-tight text-gray-800">Importar clientes (CSV)</h2>
                        <p className="text-sm text-gray-500">Sube un archivo CSV con las columnas: name, email, phone, legal_id, status, notes.</p>
                    </div>
                    <Link
                        href={route('clients.index')}
                        className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        Volver a clientes
                    </Link>
                </div>
            }
        >
            <Head title="Importar clientes" />

            <div className="py-12">
                <div className="mx-auto max-w-3xl space-y-6 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white p-6 shadow">
                        <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label htmlFor="file" className="block text-sm font-medium text-gray-700">
                                    Archivo CSV
                                </label>
                                <input
                                    id="file"
                                    name="file"
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={(e) => setData('file', e.target.files?.[0] ?? null)}
                                    className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                                {errors.file && (
                                    <p className="mt-1 text-sm text-red-600">{errors.file}</p>
                                )}
                                <p className="mt-2 text-xs text-gray-500">
                                    Recomendado: CSV con encabezados. Columnas soportadas: name (obligatorio), email, phone, legal_id, status, notes. Codificación UTF-8.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    type="submit"
                                    disabled={processing || !data.file}
                                    className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {processing ? 'Importando…' : 'Importar'}
                                </button>
                                {progress && (
                                    <span className="text-xs text-gray-500">{progress.percentage}%</span>
                                )}
                                {message && (
                                    <span className="text-sm text-emerald-700">{message}</span>
                                )}
                            </div>
                        </form>

                        <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
                            <p className="font-medium">Ejemplo de encabezados:</p>
                            <pre className="mt-2 overflow-x-auto rounded bg-white p-3 text-xs shadow-inner">name,email,phone,legal_id,status,notes
Juan Pérez,juan@example.com,8888-8888,1-2345-6789,active,Cliente VIP
María Gómez,maria@example.com,7777-7777,,inactive,
</pre>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
