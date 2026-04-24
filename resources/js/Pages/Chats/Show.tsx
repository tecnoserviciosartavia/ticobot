import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler, useEffect, useRef } from 'react';

interface ChatMessage {
    id: number;
    phone: string;
    direction: 'inbound' | 'outbound';
    body: string | null;
    status: string;
    sent_by_user_id: number | null;
    sent_at: string | null;
    created_at: string;
}

interface Client {
    id: number;
    name: string;
        phone: string;
}

interface Props {
    phone: string;
    client: Client | null;
    messages: ChatMessage[];
}

export default function ChatsShow({ phone, client, messages }: Props) {
    const { flash } = usePage().props as any;
    const bottomRef = useRef<HTMLDivElement>(null);

    const { data, setData, post, processing, reset, errors } = useForm({
        body: '',
    });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('chats.reply', phone), {
            onSuccess: () => reset('body'),
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center gap-3">
                    <Link
                        href={route('chats.index')}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                        ← Chats
                    </Link>
                    <div>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {client?.name ?? phone}
                        </span>
                        {client && (
                            <span className="ml-2 text-sm text-gray-400 dark:text-gray-500">{phone}</span>
                        )}
                    </div>
                    {client && (
                        <Link
                            href={route('clients.show', client.id)}
                            className="ml-auto text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                            Ver cliente
                        </Link>
                    )}
                </div>
            }
        >
            <Head title={`Chat — ${client?.name ?? phone}`} />

            <div className="flex flex-col" style={{ height: 'calc(100vh - 10rem)' }}>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {messages.length === 0 && (
                        <p className="text-center text-sm text-gray-400 dark:text-gray-500 mt-8">
                            No hay mensajes aún.
                        </p>
                    )}

                    {messages.map((msg) => {
                        const isOutbound = msg.direction === 'outbound';
                        return (
                            <div
                                key={msg.id}
                                className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2 text-sm shadow-sm ${
                                        isOutbound
                                            ? 'bg-indigo-600 text-white rounded-br-none'
                                            : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-200 dark:border-gray-600'
                                    }`}
                                >
                                    <p className="whitespace-pre-wrap break-words">{msg.body ?? '—'}</p>
                                    <div
                                        className={`mt-1 flex items-center gap-1 text-xs ${
                                            isOutbound ? 'text-indigo-200 justify-end' : 'text-gray-400 justify-end'
                                        }`}
                                    >
                                        <span>
                                            {new Date(msg.created_at).toLocaleTimeString('es-CR', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </span>
                                        {isOutbound && (
                                            <span title={msg.status}>
                                                {msg.status === 'sent' ? '✓✓' : msg.status === 'failed' ? '✗' : '⏳'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={bottomRef} />
                </div>

                {/* Flash */}
                {flash?.success && (
                    <p className="px-4 py-1 text-xs text-green-600 dark:text-green-400">{flash.success}</p>
                )}
                {flash?.error && (
                    <p className="px-4 py-1 text-xs text-red-600 dark:text-red-400">{flash.error}</p>
                )}

                {/* Reply box */}
                <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
                    <form onSubmit={submit} className="flex items-end gap-3">
                        <textarea
                            className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            rows={2}
                            placeholder="Escribe un mensaje..."
                            value={data.body}
                            onChange={(e) => setData('body', e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    submit(e as any);
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={processing || !data.body.trim()}
                            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                            Enviar
                        </button>
                    </form>
                    {errors.body && (
                        <p className="mt-1 text-xs text-red-500">{errors.body}</p>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
