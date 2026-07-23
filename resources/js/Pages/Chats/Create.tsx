import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { ArrowLeft, Send, Phone } from '@/Components/icons';

interface Client {
    id: number;
    name: string;
    phone: string;
}

interface ChatCreatePageProps extends PageProps {
    initialPhone: string;
    client: Client | null;
}

export default function ChatsCreate({ initialPhone, client }: ChatCreatePageProps) {
    const page = usePage();
    const flash = (page.props as { flash?: { success?: string; error?: string } }).flash;

    const form = useForm({
        phone: initialPhone || '',
        body: '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route('chats.store'), {
            preserveScroll: true,
            onSuccess: () => form.reset('body'),
        });
    };

    return (
        <ResponsiveLayout title="Nuevo mensaje">
            <Head title="Nuevo mensaje" />

            <div className="py-4 sm:py-6">
                <div className="mx-auto max-w-3xl px-3 sm:px-6 lg:px-8">
                    <div className="mb-6 flex items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">Nuevo mensaje</h1>
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                Escribí un número y un mensaje para crear la conversación saliente desde cero.
                            </p>
                        </div>
                        <Link href={route('chats.index')} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:border-gray-700 dark:bg-gray-800 dark:text-emerald-300 dark:hover:bg-gray-700">
                            <ArrowLeft className="h-4 w-4" />
                            Volver
                        </Link>
                    </div>

                    {flash?.success && (
                        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
                            {flash.success}
                        </div>
                    )}
                    {flash?.error && (
                        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
                            {flash.error}
                        </div>
                    )}

                    <Card className="border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
                        <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/15 dark:text-emerald-100">
                            <p className="font-semibold">Crear conversación manual</p>
                            <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-100/80">
                                El mensaje se guardará en la cola de salida y aparecerá en el historial del chat.
                            </p>
                        </div>

                        {client && (
                            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Cliente detectado</p>
                                <div className="mt-2 flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-semibold text-white">
                                        {client.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{client.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{client.phone}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Número de WhatsApp</label>
                                <div className="relative mt-1">
                                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={form.data.phone}
                                        onChange={(e) => form.setData('phone', e.target.value)}
                                        placeholder="50672140974"
                                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                                    />
                                </div>
                                {form.errors.phone && <p className="mt-1 text-sm text-red-600">{form.errors.phone}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mensaje</label>
                                <textarea
                                    rows={8}
                                    value={form.data.body}
                                    onChange={(e) => form.setData('body', e.target.value)}
                                    placeholder="Escribe el mensaje inicial que quieres enviar..."
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                                />
                                {form.errors.body && <p className="mt-1 text-sm text-red-600">{form.errors.body}</p>}
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                                    Al guardar, el mensaje quedará en cola para que el bot lo envíe y se registrará en el hilo del chat.
                                </p>
                                <Button type="submit" disabled={form.processing} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                                    <Send className="h-4 w-4" />
                                    {form.processing ? 'Guardando…' : 'Crear mensaje'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
