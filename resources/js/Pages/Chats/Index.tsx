import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

interface Conversation {
    phone: string;
    client_name: string | null;
    client_id: number | null;
    last_body: string | null;
    last_direction: string;
    last_message_at: string;
    unread_count: number;
}

export default function ChatsIndex({ conversations }: { conversations: Conversation[] }) {
    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Chats WhatsApp</h2>}>
            <Head title="Chats" />

            <div className="py-8">
                <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                    {conversations.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
                            No hay conversaciones aún.
                        </div>
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
        </AuthenticatedLayout>
    );
}
