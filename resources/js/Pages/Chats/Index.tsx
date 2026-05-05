import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link } from '@inertiajs/react';
import { MessageSquare, ArrowLeft, User, Clock, Send } from '@/Components/icons';

interface Conversation {
    phone: string;
    client_name: string | null;
    client_id: number | null;
    last_body: string | null;
    last_direction: string;
    last_message_at: string;
    unread_count: number;
}

export default function ChatsIndex({ conversations = [] }: { conversations?: Conversation[] }) {
    return (
        <ResponsiveLayout title="Chats WhatsApp">
            <Head title="Chats" />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Chats WhatsApp</h1>
                                <p className="mt-2 text-gray-600">
                                    Gestiona las conversaciones con los clientes a través de WhatsApp.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline">
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Volver
                                </Button>
                            </div>
                        </div>
                    </div>

                    {conversations.length === 0 ? (
                        <Card className="p-8 text-center">
                            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay conversaciones aún</h3>
                            <p className="text-gray-500">
                                Cuando los clientes envíen mensajes, aparecerán aquí.
                            </p>
                        </Card>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                            {conversations.map((conv) => (
                                <Link
                                    key={conv.phone}
                                    href={route('chats.show', conv.phone)}
                                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                                >
                                    {/* Avatar */}
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 font-semibold text-sm">
                                        {(conv.client_name ?? conv.phone).charAt(0).toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                                                {conv.client_name ?? conv.phone}
                                            </p>
                                            <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                                                {new Date(conv.last_message_at).toLocaleString('es-CR', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                                                {conv.last_direction === 'outbound' && (
                                                    <span className="mr-1 text-blue-500">↗</span>
                                                )}
                                                {conv.last_body ?? '—'}
                                            </p>
                                            {conv.unread_count > 0 && (
                                                <span className="ml-auto shrink-0 rounded-full bg-green-500 px-2 py-0.5 text-xs font-semibold text-white">
                                                    {conv.unread_count}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </ResponsiveLayout>
    );
}
