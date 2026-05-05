import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler, useEffect, useRef } from 'react';
import { MessageSquare, ArrowLeft, Send, User, Clock, CheckCircle, AlertCircle } from '@/Components/icons';

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
        <ResponsiveLayout title={client?.name ?? phone}>
            <Head title={`Chat con ${client?.name ?? phone}`} />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">{client?.name ?? phone}</h1>
                                <p className="mt-2 text-gray-600">
                                    Conversación de WhatsApp con el cliente.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={route('chats.index')}>
                                    <Button variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver a Chats
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-xs rounded-lg px-4 py-2 ${
                                        message.direction === 'outbound'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                                    }`}
                                >
                                    <p className="text-sm">{message.body}</p>
                                    <p className="text-xs opacity-70 mt-1">
                                        {new Date(message.created_at).toLocaleTimeString('es-CR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                {/* Reply Form */}
                <Card className="p-4">
                    <form onSubmit={submit} className="space-y-4">
                        <div>
                            <textarea
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                rows={3}
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
                            {errors.body && (
                                <p className="mt-1 text-sm text-red-600">{errors.body}</p>
                            )}
                        </div>
                        <div className="flex justify-end">
                            <Button 
                                type="submit" 
                                disabled={processing || !data.body.trim()}
                                className="flex items-center gap-2"
                            >
                                <Send className="w-4 h-4" />
                                {processing ? 'Enviando...' : 'Enviar'}
                            </Button>
                        </div>
                    </form>
                </Card>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
