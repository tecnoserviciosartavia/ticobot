import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import type { PageProps } from '@/types';
import { FormEvent, useState } from 'react';
import { Upload, ArrowLeft, FileText, AlertCircle } from '@/Components/icons';

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
        <ResponsiveLayout title="Importar Contratos">
            <Head title="Importar contratos" />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Importar Contratos</h1>
                                <p className="mt-2 text-gray-600">
                                    Sube un archivo CSV o XLSX. Columnas soportadas: <strong>phone</strong> (o telefonos), <strong>name</strong>, <strong>amount</strong> (o monto), 
                                    currency (o moneda), billing_cycle, next_due_date (o proxima_fecha), dia_de_corte, reminder_date (opcional), notes.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={route('contracts.index')}>
                                    <Button variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    <Card className="p-6">
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
                                    className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                                {errors.file && (
                                    <p className="mt-1 text-sm text-red-600">{errors.file}</p>
                                )}
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    Máximo 10MB. Formatos: CSV, XLSX
                                </p>
                            </div>

                            {message && (
                                <div className="rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                    {message}
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button type="submit" disabled={processing}>
                                    <Upload className="w-4 h-4 mr-2" />
                                    {processing ? 'Importando...' : 'Importar'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
