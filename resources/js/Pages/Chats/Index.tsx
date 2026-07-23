import { Button } from '@/Components/button';
import Dropdown from '@/Components/Dropdown';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, router } from '@inertiajs/react';
import { MessageSquare, User, Clock, Menu, CheckCircle, ChevronDown, XCircle, Plus } from '@/Components/icons';
import { useEffect, useRef, useState } from 'react';

interface Conversation {
    phone: string;
    client_name: string | null;
    client_id: number | null;
    last_body: string | null;
    last_direction: string;
    last_message_at: string;
    unread_count: number;
}

const timeFormatter = new Intl.DateTimeFormat('es-CR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

function getPreview(text: string | null) {
    if (!text) {
        return 'Sin mensajes todavía';
    }

    return text.length > 110 ? `${text.slice(0, 110)}…` : text;
}

export default function ChatsIndex({ conversations = [] }: { conversations?: Conversation[] }) {
    const total = conversations.length;
    const unread = conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
    const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
    const longPressTimer = useRef<number | null>(null);
    const longPressTriggered = useRef(false);

    const isSelectionMode = selectedPhones.length > 0;

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === 'visible') {
                router.reload({ only: ['conversations'] });
            }
        };
        const interval = window.setInterval(refresh, 4_000);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);

    const clearLongPressTimer = () => {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const clearSelection = () => setSelectedPhones([]);

    const toggleSelected = (phone: string) => {
        setSelectedPhones((current) =>
            current.includes(phone) ? current.filter((item) => item !== phone) : [...current, phone],
        );
    };

    const handleCardPointerDown = (phone: string) => {
        clearLongPressTimer();
        longPressTriggered.current = false;
        longPressTimer.current = window.setTimeout(() => {
            longPressTriggered.current = true;
            setSelectedPhones((current) =>
                current.includes(phone) ? current : [...current, phone],
            );
        }, 450);
    };

    const handleCardPointerUp = () => {
        clearLongPressTimer();
    };

    const handleCardClick = (phone: string) => {
        if (longPressTriggered.current) {
            longPressTriggered.current = false;
            return;
        }

        if (isSelectionMode) {
            toggleSelected(phone);
            return;
        }

        router.visit(route('chats.show', phone));
    };

    const markSelectedAsRead = () => {
        if (selectedPhones.length === 0) {
            return;
        }

        router.patch(route('chats.mark-selected-read'), { phones: selectedPhones }, {
            preserveScroll: true,
            onSuccess: () => clearSelection(),
        });
    };

    return (
        <ResponsiveLayout title="Chats WhatsApp">
            <Head title="Chats" />

            <div className="py-6">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mb-6 overflow-hidden rounded-3xl border border-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 shadow-sm dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
                        <div className="relative px-5 py-5 sm:px-8">
                            <div className="absolute inset-0 opacity-60">
                                <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl" />
                                <div className="absolute left-1/3 top-8 h-28 w-28 rounded-full bg-cyan-200/40 blur-3xl" />
                            </div>
                            <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                                <div className="max-w-2xl">
                                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 backdrop-blur dark:bg-gray-800/80 dark:text-emerald-300 dark:ring-emerald-900/40">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        Bandeja de conversaciones
                                    </div>
                                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
                                        Chats WhatsApp
                                    </h1>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
                                    <div className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-white/80 backdrop-blur dark:bg-gray-800/85 dark:ring-gray-700 sm:min-w-28">
                                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Chats</p>
                                        <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{total}</p>
                                    </div>
                                    <div className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-white/80 backdrop-blur dark:bg-gray-800/85 dark:ring-gray-700 sm:min-w-28">
                                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Sin leer</p>
                                        <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{unread}</p>
                                    </div>

                                    {isSelectionMode ? (
                                        <Button type="button" variant="outline" onClick={clearSelection} className="h-11 w-full gap-2 border-emerald-200 bg-white/85 text-sm backdrop-blur sm:w-auto dark:border-gray-700 dark:bg-gray-800/85">
                                            <XCircle className="h-4 w-4" />
                                            Salir
                                        </Button>
                                    ) : (
                                        <>
                                            <Link
                                                href={route('chats.create')}
                                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white/85 px-4 text-sm font-medium text-emerald-700 shadow-sm backdrop-blur transition hover:bg-emerald-50 hover:text-emerald-800 sm:w-auto dark:border-gray-700 dark:bg-gray-800/85 dark:text-emerald-300 dark:hover:bg-gray-700"
                                            >
                                                <Plus className="h-4 w-4" />
                                                Nuevo mensaje
                                            </Link>
                                            <div className="sm:hidden">
                                                <Dropdown>
                                                    <Dropdown.Trigger>
                                                        <Button type="button" variant="outline" className="h-11 w-full gap-2 border-emerald-200 bg-white/85 text-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/85">
                                                            <Menu className="h-4 w-4" />
                                                            Menú
                                                            <ChevronDown className="h-4 w-4" />
                                                        </Button>
                                                    </Dropdown.Trigger>
                                                    <Dropdown.Content width="48" contentClasses="py-2 bg-white dark:bg-gray-800">
                                                        <Dropdown.Link
                                                            href={route('chats.mark-all-read')}
                                                            method="patch"
                                                            as="button"
                                                            className="flex items-center gap-2"
                                                        >
                                                            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                            Marcar todos como leídos
                                                        </Dropdown.Link>
                                                    </Dropdown.Content>
                                                </Dropdown>
                                            </div>

                                            <div className="hidden sm:flex sm:flex-wrap sm:gap-3">
                                                <Dropdown>
                                                    <Dropdown.Trigger>
                                                        <Button type="button" variant="outline" className="h-full gap-2 border-emerald-200 bg-white/85 backdrop-blur dark:border-gray-700 dark:bg-gray-800/85">
                                                            <Menu className="h-4 w-4" />
                                                            Acciones
                                                            <ChevronDown className="h-4 w-4" />
                                                        </Button>
                                                    </Dropdown.Trigger>
                                                    <Dropdown.Content width="48" contentClasses="py-2 bg-white dark:bg-gray-800">
                                                        <Dropdown.Link
                                                            href={route('chats.mark-all-read')}
                                                            method="patch"
                                                            as="button"
                                                            className="flex items-center gap-2"
                                                        >
                                                            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                            Marcar todos como leídos
                                                        </Dropdown.Link>
                                                    </Dropdown.Content>
                                                </Dropdown>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {conversations.length === 0 ? (
                        <Card className="border-2 border-dashed border-gray-200 bg-white/90 p-10 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                <MessageSquare className="h-8 w-8" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Aún no hay chats para mostrar</h3>
                            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
                                En cuanto lleguen mensajes de WhatsApp, aparecerán aquí para que puedas responderlos con rapidez.
                            </p>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {isSelectionMode && (
                                <div className="fixed inset-x-4 bottom-4 z-30 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-2xl backdrop-blur sm:static sm:mb-0 sm:shadow-sm dark:border-emerald-900/40 dark:bg-gray-800/95">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {selectedPhones.length} chat{selectedPhones.length === 1 ? '' : 's'} seleccionado{selectedPhones.length === 1 ? '' : 's'}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Mantén presionado un chat para entrar en este modo.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                onClick={markSelectedAsRead}
                                                disabled={selectedPhones.length === 0}
                                                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                                            >
                                                <CheckCircle className="h-4 w-4" />
                                                Marcar leídos
                                            </Button>
                                            <Button type="button" variant="outline" onClick={clearSelection} className="gap-2">
                                                <XCircle className="h-4 w-4" />
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-3 sm:gap-4">
                                {conversations.map((conv) => {
                                    const selected = selectedPhones.includes(conv.phone);

                                    return (
                                        <button
                                            key={conv.phone}
                                            type="button"
                                            onClick={() => handleCardClick(conv.phone)}
                                            onPointerDown={() => handleCardPointerDown(conv.phone)}
                                            onPointerUp={handleCardPointerUp}
                                            onPointerLeave={handleCardPointerUp}
                                            onPointerCancel={handleCardPointerUp}
                                            className={`group relative mx-0.5 rounded-2xl border bg-white p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800 sm:p-4 ${selected ? 'border-emerald-400 ring-2 ring-emerald-200 dark:border-emerald-500 dark:ring-emerald-900/50' : 'border-gray-200 hover:border-emerald-200 dark:border-gray-700 dark:hover:border-emerald-900/60'} ${isSelectionMode ? 'pl-12 sm:pl-14' : ''}`}
                                            aria-pressed={selected}
                                        >
                                            {isSelectionMode && (
                                                <span className={`absolute left-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-transparent dark:border-gray-600 dark:bg-gray-700'}`}>
                                                    <CheckCircle className="h-5 w-5" />
                                                </span>
                                            )}
                                            <div className="flex items-start gap-4">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-sm sm:h-12 sm:w-12 sm:rounded-2xl">
                                                    {(conv.client_name ?? conv.phone).charAt(0).toUpperCase()}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">
                                                                {conv.client_name ?? conv.phone}
                                                            </p>
                                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 sm:gap-2 sm:text-sm">
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-700">
                                                                    <User className="h-3.5 w-3.5" />
                                                                    {conv.client_name ? conv.phone : 'Cliente'}
                                                                </span>
                                                                <span className="inline-flex items-center gap-1">
                                                                    <Clock className="h-3.5 w-3.5" />
                                                                    {timeFormatter.format(new Date(conv.last_message_at))}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {conv.unread_count > 0 && (
                                                                <Badge className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white sm:px-2.5 sm:py-1 sm:text-xs">
                                                                    {conv.unread_count}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="mt-2.5 flex items-start gap-2">
                                                        <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-700 dark:text-gray-300 sm:py-1 sm:text-[11px]">
                                                            {conv.last_direction === 'outbound' ? 'Tú' : 'Cliente'}
                                                        </span>
                                                        <p className="min-w-0 flex-1 truncate text-xs leading-5 text-gray-600 dark:text-gray-300 sm:text-sm sm:leading-6">
                                                            {getPreview(conv.last_body)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ResponsiveLayout>
    );
}
