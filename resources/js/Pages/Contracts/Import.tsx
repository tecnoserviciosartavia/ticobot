import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import type { PageProps } from '@/types';
import { FormEvent, useState } from 'react';

export default function ContractsImport(_props: PageProps) {
    const { data, setData, post, processing, progress, errors, reset } = useForm<{ file: File | null }>({
        file: null,
    });

    const [message, setMessage] = useState<string | null>(null);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);
        const formData: Record<string, any> = {};
        if (data.file) formData.file = data.file;
        post(route('contracts.import.store'), {
            forceFormData: true,
            onSuccess: () => {
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
                        <h2 className="text-xl font-semibold leading-tight text-gray-800 dark:text-gray-100 dark:text-gray-100">Importar contratos</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Sube un archivo CSV o XLSX. Columnas soportadas: <strong>phone</strong> (o telefonos), <strong>name</strong>, <strong>amount</strong> (o monto), 
                            currency (o moneda), billing_cycle, next_due_date (o proxima_fecha), dia_de_corte, reminder_date (opcional), notes.
                        </p>
                    </div>
                    <Link
                        href={route('contracts.index')}
                        className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 shadow-sm transition hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        Volver a contratos
                    </Link>
                </div>
            }
        >
            <Head title="Importar contratos" />

            <div className="py-12">
                <div className="mx-auto max-w-3xl space-y-6 sm:px-6 lg:px-8">
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
                        <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label htmlFor="file" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Archivo (CSV o XLSX)
                                </label>
                                <input
                                    id="file"
                                    name="file"
                                    type="file"
                                    accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                                    onChange={(e) => setData('file', e.target.files?.[0] ?? null)}
                                    className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                                />
                                {errors.file && (
                                    <p className="mt-1 text-sm text-red-600">{errors.file}</p>
                                )}
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    Recomendado: CSV con encabezados o un archivo XLSX. Las columnas soportadas son mostradas arriba. Codificación UTF-8.
                                </p>
                                <div className="mt-3">
                                    <a
                                        href="/samples/contracts-sample.xlsx"
                                        download
                                        className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700"
                                    >
                                        Descargar ejemplo Excel (.xlsx)
                                    </a>
                                </div>
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
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{progress.percentage}%</span>
                                )}
                                {message && (
                                    <span className="text-sm text-emerald-700">{message}</span>
                                )}
                            </div>
                        </form>

                        <div className="mt-6 rounded-md bg-gray-50 dark:bg-gray-700/50 p-4 text-sm text-gray-700 dark:text-gray-300">
                            <p className="font-medium">Ejemplo de encabezados:</p>
                            <pre className="mt-2 overflow-x-auto rounded bg-white dark:bg-gray-800 p-3 text-xs shadow-inner">phone,name,amount,currency,billing_cycle,dia_de_corte,reminder_date,notes
+50671663113,Streaming Premium,7000,CRC,monthly,15,2025-12-15,Renovación automática
+50688974441,Spotify Duo,2000,CRC,monthly,5,2025-12-05,Plan familiar</pre>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
