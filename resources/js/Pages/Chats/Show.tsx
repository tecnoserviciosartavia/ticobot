import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import Modal from '@/Components/Modal';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle, Clock, MessageSquare, ArrowUpRight, Phone, Send, Plus, Upload, X, Trash2 } from '@/Components/icons';

interface ChatMessage {
    id: number;
    phone: string;
    direction: 'inbound' | 'outbound';
    body: string | null;
    status: string;
    whatsapp_message_id: string | null;
    sent_by_user_id: number | null;
    sent_at: string | null;
    created_at: string;
    metadata?: Record<string, unknown> | null;
    media?: {
        kind?: string | null;
        mimetype?: string | null;
        filename?: string | null;
        data?: string | null;
        size?: number | null;
        caption?: string | null;
    } | null;
    visibility?: string | null;
    is_visible?: boolean;
}

interface Conversation {
    phone: string;
    client_name: string | null;
    client_id: number | null;
    last_body: string | null;
    last_direction: string;
    last_message_at: string;
    unread_count: number;
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
    conversations: Conversation[];
}

const timelineFormatter = new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
});

const bubbleTimeFormatter = new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
});

function statusLabel(status: string) {
    if (status === 'sent') {
        return 'Enviado';
    }

    if (status === 'queued') {
        return 'En cola';
    }

    if (status === 'failed') {
        return 'Falló';
    }

    if (status === 'read') {
        return 'Leído';
    }

    if (status === 'delivered') {
        return 'Entregado';
    }

    return 'Recibido';
}

function statusClass(status: string) {
    if (status === 'failed') {
        return 'bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-300';
    }

    if (status === 'queued') {
        return 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300';
    }

    if (status === 'sent' || status === 'delivered' || status === 'read') {
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300';
    }

    return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200';
}

function getPreview(text: string | null) {
    if (!text) {
        return 'Sin mensajes todavía';
    }

    return text.length > 98 ? `${text.slice(0, 98)}…` : text;
}

function mediaPreviewLabel(media: ChatMessage['media']): string {
    if (!media) {
        return 'Adjunto';
    }

    switch (media.kind) {
        case 'image':
            return 'Imagen';
        case 'video':
            return 'Video';
        case 'audio':
            return 'Audio';
        case 'document':
            return 'Documento';
        default:
            return 'Adjunto';
    }
}

function reactionData(message: ChatMessage): { emoji: string; targetId: string } | null {
    const payload = message.metadata?.meta_payload;
    if (!payload || typeof payload !== 'object') return null;

    const reaction = (payload as { reaction?: unknown }).reaction;
    if (!reaction || typeof reaction !== 'object') return null;

    const emoji = String((reaction as { emoji?: unknown }).emoji ?? '').trim();
    const targetId = String((reaction as { message_id?: unknown }).message_id ?? '').trim();
    return emoji && targetId ? { emoji, targetId } : null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function touchDistance(touches: ArrayLike<{ clientX: number; clientY: number }>): number {
    if (touches.length < 2) {
        return 0;
    }

    const first = touches[0];
    const second = touches[1];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

const QUICK_REPLIES_STORAGE_KEY = 'chats.quickReplies';

const DEFAULT_QUICK_REPLIES = [
    'Hola, gracias por escribirnos. En breve te atendemos.',
    '¿Me compartís tu número de cédula o número de contrato?',
    '¿Podés enviarme una captura o comprobante?',
    'Ya revisé tu caso, te confirmo en un momento.',
    'Tu pago quedó en revisión, apenas se confirme te aviso.',
    'Gracias, quedó registrado.',
];

const CHAT_EMOJIS = ['😀', '😂', '😊', '😍', '🥳', '😢', '🙏', '👍', '❤️', '✅', '🎉', '📌', '💳', '📄'];

export default function ChatsShow({
    phone,
    client,
    messages,
    conversations,
}: Props) {
    const { data, setData, post, delete: destroy, processing, reset, errors } = useForm<{ body: string; attachment: File | null }>({
        body: '',
        attachment: null,
    });
    const bodyRef = useRef<HTMLTextAreaElement | null>(null);
    const attachmentRef = useRef<HTMLInputElement | null>(null);
    const messagesViewportRef = useRef<HTMLDivElement | null>(null);
    const previousMessageCountRef = useRef(0);
    const previousPhoneRef = useRef<string | null>(null);
    const pinchStartDistanceRef = useRef<number | null>(null);
    const pinchStartScaleRef = useRef<number>(1);
    const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
    const [zoomScale, setZoomScale] = useState(1);
    const [quickReplies, setQuickReplies] = useState<string[]>(() => {
        if (typeof window === 'undefined') {
            return DEFAULT_QUICK_REPLIES;
        }

        try {
            const stored = window.localStorage.getItem(QUICK_REPLIES_STORAGE_KEY);
            if (!stored) {
                return DEFAULT_QUICK_REPLIES;
            }

            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) {
                return DEFAULT_QUICK_REPLIES;
            }

            const normalized = parsed
                .map((item) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean);

            return normalized.length > 0 ? Array.from(new Set(normalized)) : DEFAULT_QUICK_REPLIES;
        } catch {
            return DEFAULT_QUICK_REPLIES;
        }
    });
    const [quickReplyDraft, setQuickReplyDraft] = useState('');
    const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
    const reactionsByMessageId = useMemo(() => {
        const grouped = new Map<string, string[]>();
        messages.forEach((message) => {
            const reaction = reactionData(message);
            if (!reaction) return;
            grouped.set(reaction.targetId, [...(grouped.get(reaction.targetId) ?? []), reaction.emoji]);
        });
        return grouped;
    }, [messages]);

    useEffect(() => {
        window.localStorage.setItem(QUICK_REPLIES_STORAGE_KEY, JSON.stringify(quickReplies));
    }, [quickReplies]);

    useEffect(() => {
        setMobileConversationsOpen(false);
    }, [phone]);

    useEffect(() => {
        const viewport = messagesViewportRef.current;
        if (!viewport) return;

        const phoneChanged = previousPhoneRef.current !== phone;
        const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
        const newMessagesArrived = messages.length > previousMessageCountRef.current;

        if (phoneChanged || (newMessagesArrived && distanceFromBottom < 180)) {
            window.requestAnimationFrame(() => {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior: phoneChanged ? 'auto' : 'smooth' });
            });
        }

        previousMessageCountRef.current = messages.length;
        previousPhoneRef.current = phone;
    }, [messages.length, phone]);

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === 'visible') {
                router.reload({
                    only: ['messages', 'conversations', 'replyAllowed', 'serviceWindowExpiresAt'],
                });
            }
        };
        const interval = window.setInterval(refresh, 3_000);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [phone]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('chats.reply', phone), {
            forceFormData: true,
            onSuccess: () => {
                reset('body', 'attachment');
                if (attachmentRef.current) attachmentRef.current.value = '';
            },
        });
    };

    const activeConversation = conversations.find((conversation) => conversation.phone === phone) ?? null;
    const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unread_count, 0);
    const displayName = client?.name ?? activeConversation?.client_name ?? phone;
    const displayPhone = client?.phone ?? phone;

    const imageMessages = useMemo(() => {
        return messages
            .map((message) => {
                const media = message.media ?? null;
                const mediaUrl = media?.data && media?.mimetype ? `data:${media.mimetype};base64,${media.data}` : null;
                if (!media || media.kind !== 'image' || !mediaUrl) {
                    return null;
                }

                const bubbleTime = message.sent_at
                    ? bubbleTimeFormatter.format(new Date(message.sent_at))
                    : bubbleTimeFormatter.format(new Date(message.created_at));
                const bubbleLabel = message.direction === 'outbound' ? 'Tú' : 'Cliente';
                const mediaCaption = media?.caption ?? message.body ?? null;

                return {
                    key: message.id,
                    messageId: message.id,
                    src: mediaUrl,
                    alt: mediaCaption ?? 'Imagen enviada',
                    caption: mediaCaption,
                    author: bubbleLabel,
                    time: bubbleTime,
                    filename: media?.filename ?? null,
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);
    }, [messages]);

    const zoomedImage = zoomedImageIndex !== null ? imageMessages[zoomedImageIndex] ?? null : null;

    useEffect(() => {
        setZoomScale(1);
        pinchStartDistanceRef.current = null;
        pinchStartScaleRef.current = 1;
    }, [zoomedImageIndex]);

    useEffect(() => {
        if (zoomedImageIndex === null) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setZoomedImageIndex(null);
                return;
            }

            if (imageMessages.length === 0) {
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setZoomedImageIndex((current) => {
                    if (current === null) {
                        return current;
                    }

                    return (current - 1 + imageMessages.length) % imageMessages.length;
                });
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                setZoomedImageIndex((current) => {
                    if (current === null) {
                        return current;
                    }

                    return (current + 1) % imageMessages.length;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [imageMessages.length, zoomedImageIndex]);

    const openImageAt = (messageId: number) => {
        const nextIndex = imageMessages.findIndex((item) => item.messageId === messageId);
        if (nextIndex >= 0) {
            setZoomedImageIndex(nextIndex);
        }
    };

    const goToPreviousImage = () => {
        if (imageMessages.length === 0 || zoomedImageIndex === null) {
            return;
        }

        setZoomedImageIndex((current) => {
            if (current === null) {
                return current;
            }

            return (current - 1 + imageMessages.length) % imageMessages.length;
        });
    };

    const goToNextImage = () => {
        if (imageMessages.length === 0 || zoomedImageIndex === null) {
            return;
        }

        setZoomedImageIndex((current) => {
            if (current === null) {
                return current;
            }

            return (current + 1) % imageMessages.length;
        });
    };

    const handleZoomWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        if (!zoomedImage) {
            return;
        }

        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.15 : 0.15;
        setZoomScale((current) => clamp(current + delta, 0.75, 4));
    };

    const handleZoomTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        if (event.touches.length === 2) {
            pinchStartDistanceRef.current = touchDistance(event.touches);
            pinchStartScaleRef.current = zoomScale;
        }
    };

    const handleZoomTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        if (event.touches.length !== 2 || pinchStartDistanceRef.current === null) {
            return;
        }

        event.preventDefault();
        const currentDistance = touchDistance(event.touches);
        if (currentDistance <= 0) {
            return;
        }

        const nextScale = pinchStartScaleRef.current * (currentDistance / pinchStartDistanceRef.current);
        setZoomScale(clamp(nextScale, 0.75, 4));
    };

    const handleZoomTouchEnd = () => {
        pinchStartDistanceRef.current = null;
        pinchStartScaleRef.current = zoomScale;
    };

    const resetZoom = () => {
        setZoomScale(1);
    };

    const insertQuickReply = (reply: string) => {
        const el = bodyRef.current;
        if (!el) {
            setData('body', data.body ? `${data.body.trim()} ${reply}` : reply);
            return;
        }

        const start = el.selectionStart ?? data.body.length;
        const end = el.selectionEnd ?? data.body.length;
        const before = data.body.slice(0, start);
        const after = data.body.slice(end);
        const nextValue = `${before}${reply}${after}`;
        setData('body', nextValue);

        window.requestAnimationFrame(() => {
            el.focus();
            const nextCursor = start + reply.length;
            el.setSelectionRange(nextCursor, nextCursor);
        });
    };

    const addQuickReply = () => {
        const nextReply = quickReplyDraft.trim();
        if (!nextReply) {
            return;
        }

        setQuickReplies((current) => (current.includes(nextReply) ? current : [...current, nextReply]));
        setQuickReplyDraft('');
    };

    return (
        <ResponsiveLayout title={displayName}>
            <Head title={`Chat con ${displayName}`} />

            <div className="h-[calc(100svh-4.5rem)] min-h-[32rem] overflow-hidden py-1 sm:h-[calc(100svh-5.5rem)] sm:py-2">
                <div className="mx-auto h-full max-w-7xl px-1 sm:px-4 lg:px-6">
                    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
                        <aside className="hidden h-full min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex lg:flex-col dark:border-gray-700 dark:bg-gray-800">
                            <div className="border-b border-slate-100 p-4 dark:border-gray-700">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Chats</p>
                                        <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">Conversaciones</h2>
                                    </div>
                                    <Link
                                        href={route('chats.index')}
                                        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        Bandeja
                                    </Link>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-gray-700/60">
                                        <p className="uppercase tracking-wide">Chats</p>
                                        <p className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{conversations.length}</p>
                                    </div>
                                    <div className="rounded-2xl bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
                                        <p className="uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Sin leer</p>
                                        <p className="mt-1 text-base font-semibold text-emerald-700 dark:text-emerald-300">{totalUnread}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2">
                                <div className="space-y-1">
                                    {conversations.map((conversation) => {
                                        const active = conversation.phone === phone;

                                        return (
                                            <Link
                                                key={conversation.phone}
                                                href={route('chats.show', conversation.phone)}
                                                className={`flex items-start gap-3 rounded-2xl p-3 transition hover:bg-slate-50 dark:hover:bg-gray-700/60 ${
                                                    active ? 'bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-900/40' : ''
                                                }`}
                                            >
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-sm">
                                                    {(conversation.client_name ?? conversation.phone).charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                                {conversation.client_name ?? conversation.phone}
                                                            </p>
                                                            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                                                {conversation.phone}
                                                            </p>
                                                        </div>
                                                        <div className="text-right text-[11px] text-gray-500 dark:text-gray-400">
                                                            <p>{timelineFormatter.format(new Date(conversation.last_message_at))}</p>
                                                            {conversation.unread_count > 0 && (
                                                                <span className="mt-1 inline-flex min-w-5 justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                                                                    {conversation.unread_count}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex items-start gap-2">
                                                        <span
                                                            className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                                                conversation.last_direction === 'outbound'
                                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                                    : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-gray-300'
                                                            }`}
                                                        >
                                                            {conversation.last_direction === 'outbound' ? 'Tú' : 'Cliente'}
                                                        </span>
                                                        <p className="min-w-0 flex-1 truncate text-sm leading-5 text-gray-600 dark:text-gray-300">
                                                            {getPreview(conversation.last_body)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        </aside>

                        <section className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="shrink-0 border-b border-slate-100 px-3 py-2.5 dark:border-gray-700 sm:px-6 sm:py-3">
                                <div className="mb-2 flex items-center justify-between gap-3 lg:hidden">
                                    <Link href={route('chats.index')} className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
                                        <ArrowLeft className="h-4 w-4" />
                                        Volver
                                    </Link>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMobileConversationsOpen((current) => !current)}
                                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/35"
                                        >
                                            <MessageSquare className="h-3.5 w-3.5" />
                                            {mobileConversationsOpen ? 'Cerrar chats' : 'Ver chats'}
                                        </button>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Inbox</p>
                                    </div>
                                </div>

                                {mobileConversationsOpen && (
                                    <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:hidden">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Conversaciones</p>
                                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Cambiate entre chats sin salir del hilo actual.</p>
                                            </div>
                                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                                                {conversations.length}
                                            </span>
                                        </div>
                                        <div className="max-h-[42svh] space-y-2 overflow-y-auto pr-1">
                                            {conversations.map((conversation) => {
                                                const active = conversation.phone === phone;

                                                return (
                                                    <Link
                                                        key={conversation.phone}
                                                        href={route('chats.show', conversation.phone)}
                                                        onClick={() => setMobileConversationsOpen(false)}
                                                        className={`flex items-start gap-3 rounded-2xl p-3 transition hover:bg-slate-50 dark:hover:bg-gray-700/60 ${
                                                            active ? 'bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-900/40' : ''
                                                        }`}
                                                    >
                                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-sm">
                                                            {(conversation.client_name ?? conversation.phone).charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                                        {conversation.client_name ?? conversation.phone}
                                                                    </p>
                                                                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                                                        {conversation.phone}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right text-[11px] text-gray-500 dark:text-gray-400">
                                                                    {conversation.unread_count > 0 && (
                                                                        <span className="inline-flex min-w-5 justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                                                                            {conversation.unread_count}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-600 dark:text-gray-300">
                                                                {getPreview(conversation.last_body)}
                                                            </p>
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-sm">
                                                {displayName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <h1 className="truncate text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-2xl">
                                                    {displayName}
                                                </h1>
                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-gray-700">
                                                        <Phone className="h-3.5 w-3.5" />
                                                        {displayPhone}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                                        Mensajes salientes visibles
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        {!client && (
                                            <Link
                                                href={route('clients.create', { phone: displayPhone, from_chat: 1 })}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
                                            >
                                                <Plus className="h-4 w-4" />
                                                Crear cliente
                                            </Link>
                                        )}
                                        <Link
                                            href={route('chats.create', { phone: displayPhone })}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 dark:border-emerald-900/50 dark:bg-gray-900 dark:text-emerald-300 dark:hover:bg-gray-700"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Nuevo mensaje
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (window.confirm('¿Eliminar esta conversación? Se borrará el historial del chat, pero no el cliente, contratos ni pagos.')) {
                                                    destroy(route('chats.destroy', phone));
                                                }
                                            }}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 dark:border-rose-900/50 dark:bg-gray-900 dark:text-rose-300 dark:hover:bg-gray-700"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Eliminar chat
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="hidden shrink-0 border-b border-slate-100 px-3 py-2.5 dark:border-gray-700 sm:block sm:px-6">
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/15 dark:text-emerald-100">
                                    </div>
                                </div>

                                <div
                                    ref={messagesViewportRef}
                                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.07),_transparent_36%),linear-gradient(180deg,_rgba(248,250,252,1),_rgba(255,255,255,1))] px-2 py-2.5 [scrollbar-gutter:stable] dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.07),_transparent_36%),linear-gradient(180deg,_rgba(17,24,39,1),_rgba(31,41,55,1))] sm:px-6 sm:py-3"
                                    style={{ WebkitOverflowScrolling: 'touch' }}
                                >
                                    {messages.length === 0 ? (
                                        <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/80 p-6 text-center dark:border-gray-700 dark:bg-gray-800/70">
                                            <div className="max-w-md">
                                                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                    <MessageSquare className="h-7 w-7" />
                                                </div>
                                                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">Aún no hay mensajes en este chat</h3>
                                                <p className="mt-2 text-xs leading-6 text-gray-500 dark:text-gray-400 sm:text-sm">
                                                    Cuando el cliente o tu equipo escriban, el hilo aparecerá aquí con mensajes entrantes y salientes bien diferenciados.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5 sm:space-y-3">
                                            {messages.map((message) => {
                                                if (reactionData(message)) return null;
                                                const outbound = message.direction === 'outbound';
                                                const bubbleStatus = statusLabel(message.status);
                                                const media = message.media ?? null;
                                                const mediaCaption = media?.caption ?? message.body ?? null;
                                                const mediaUrl = media?.data && media?.mimetype ? `data:${media.mimetype};base64,${media.data}` : null;
                                                const reactions = message.whatsapp_message_id
                                                    ? reactionsByMessageId.get(message.whatsapp_message_id) ?? []
                                                    : [];
                                                return (
                                                    <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`flex max-w-[86%] flex-col sm:max-w-[58%] ${outbound ? 'items-end' : 'items-start'}`}>
                                                            <div
                                                                className={`rounded-3xl px-4 py-3 shadow-sm ring-1 ${
                                                                    outbound
                                                                        ? 'bg-emerald-600 text-white ring-emerald-500/20'
                                                                        : 'bg-white text-gray-900 ring-slate-200 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600'
                                                                }`}
                                                            >
                                                                {media && media.kind === 'image' && mediaUrl ? (
                                                                    <div className="space-y-1.5">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openImageAt(message.id)}
                                                                            className="block w-full overflow-hidden rounded-2xl outline-none ring-0 transition hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-emerald-400"
                                                                            aria-label="Abrir imagen en tamaño grande"
                                                                        >
                                                                            <img
                                                                                src={mediaUrl}
                                                                                alt={mediaCaption ?? 'Imagen enviada'}
                                                                                className="max-h-[320px] w-full cursor-zoom-in rounded-2xl object-cover"
                                                                            />
                                                                        </button>
                                                                        {mediaCaption && (
                                                                            <p className="whitespace-pre-wrap text-[13px] leading-6 sm:text-sm">
                                                                                {mediaCaption}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                ) : media && media.kind === 'video' && mediaUrl ? (
                                                                    <div className="space-y-1.5">
                                                                        <video
                                                                            controls
                                                                            preload="metadata"
                                                                            playsInline
                                                                            className="max-h-[360px] w-full rounded-2xl bg-black"
                                                                        >
                                                                            <source src={mediaUrl} type={media.mimetype ?? undefined} />
                                                                            Tu dispositivo no puede reproducir este video.
                                                                        </video>
                                                                        {mediaCaption && (
                                                                            <p className="whitespace-pre-wrap text-[13px] leading-6 sm:text-sm">{mediaCaption}</p>
                                                                        )}
                                                                    </div>
                                                                ) : media && media.kind === 'audio' && mediaUrl ? (
                                                                    <div className="min-w-[240px] space-y-2">
                                                                        <p className="text-xs font-semibold opacity-80">Mensaje de audio</p>
                                                                        <audio controls preload="metadata" className="w-full max-w-[340px]">
                                                                            <source src={mediaUrl} type={media.mimetype ?? undefined} />
                                                                            Tu dispositivo no puede reproducir este audio.
                                                                        </audio>
                                                                        {mediaCaption && (
                                                                            <p className="whitespace-pre-wrap text-[13px] leading-6 sm:text-sm">{mediaCaption}</p>
                                                                        )}
                                                                    </div>
                                                                ) : media ? (
                                                                    <div className="space-y-1.5">
                                                                        <a
                                                                            href={mediaUrl ?? undefined}
                                                                            download={media.filename ?? 'archivo'}
                                                                            className="block rounded-2xl border border-dashed border-current/20 bg-black/5 px-3 py-2 text-sm transition hover:bg-black/10"
                                                                        >
                                                                            <p className="font-semibold">{mediaPreviewLabel(media)}</p>
                                                                            <p className="mt-1 text-xs opacity-80">{media.filename ?? media.mimetype ?? 'Archivo adjunto'}</p>
                                                                            {media.size ? <p className="mt-1 text-[10px] opacity-70">{(media.size / 1024 / 1024).toFixed(1)} MB · Tocar para descargar</p> : null}
                                                                        </a>
                                                                        {mediaCaption && (
                                                                            <p className="whitespace-pre-wrap text-[13px] leading-6 sm:text-sm">
                                                                                {mediaCaption}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <p className="whitespace-pre-wrap text-[13px] leading-6 sm:text-sm">
                                                                        {message.body ?? 'Sin contenido'}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {reactions.length > 0 && (
                                                                <div className="-mt-2 z-10 flex gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-base shadow-sm dark:border-gray-600 dark:bg-gray-700">
                                                                    {reactions.map((emoji, index) => <span key={`${emoji}-${index}`}>{emoji}</span>)}
                                                                </div>
                                                            )}

                                                            <div className="mt-1 flex flex-wrap items-center gap-2 px-2 text-[10px] text-gray-500 dark:text-gray-400 sm:text-[11px]">
                                                                <Clock className="h-3.5 w-3.5" />
                                                                <span>{timelineFormatter.format(new Date(message.created_at))}</span>
                                                                {outbound && (
                                                                    <>
                                                                        <span>•</span>
                                                                        {message.status === 'failed' ? (
                                                                            <span className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400">
                                                                                <AlertCircle className="h-3.5 w-3.5" />
                                                                                {bubbleStatus}
                                                                            </span>
                                                                        ) : (
                                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${statusClass(message.status)}`}>
                                                                                <CheckCircle className="h-3.5 w-3.5" />
                                                                                {bubbleStatus}
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="shrink-0 border-t border-slate-100 bg-white/95 px-2 py-2 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 sm:px-4">
                                    <Card className="border-0 bg-transparent p-0 shadow-none">
                                        <form onSubmit={submit} className="space-y-2">

                                            <button
                                                type="button"
                                                onClick={() => setQuickRepliesOpen((open) => !open)}
                                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                                            >
                                                {quickRepliesOpen ? 'Ocultar respuestas rápidas' : 'Respuestas rápidas'}
                                            </button>

                                            {quickRepliesOpen && <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-gray-700 dark:bg-gray-900/50">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Respuestas rápidas</p>
                                                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Tocá una para insertarla</p>
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                                                    {quickReplies.map((reply) => (
                                                        <button
                                                            key={reply}
                                                            type="button"
                                                            onClick={() => insertQuickReply(reply)}
                                                            className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-medium leading-5 text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/35"
                                                        >
                                                            {reply}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex flex-col gap-2 sm:flex-row">
                                                    <input
                                                        type="text"
                                                        value={quickReplyDraft}
                                                        onChange={(e) => setQuickReplyDraft(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                addQuickReply();
                                                            }
                                                        }}
                                                        placeholder="Agregar respuesta rápida personalizada"
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={addQuickReply}
                                                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/35"
                                                    >
                                                        Agregar
                                                    </button>
                                                </div>
                                            </div>}

                                            {errors.body && <p className="text-sm text-red-600">{errors.body}</p>}
                                            {errors.attachment && <p className="text-sm text-red-600">{errors.attachment}</p>}

                                            {data.attachment && (
                                                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                                                    {data.attachment.type.startsWith('image/') ? (
                                                        <img src={URL.createObjectURL(data.attachment)} alt="Vista previa" className="h-14 w-14 rounded-xl object-cover" />
                                                    ) : (
                                                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-emerald-700 dark:bg-gray-800 dark:text-emerald-300"><Upload className="h-6 w-6" /></div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{data.attachment.name}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">{(data.attachment.size / 1024 / 1024).toFixed(1)} MB</p>
                                                    </div>
                                                    <button type="button" aria-label="Quitar archivo" onClick={() => { setData('attachment', null); if (attachmentRef.current) attachmentRef.current.value = ''; }} className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 active:bg-emerald-100 dark:text-gray-300 dark:active:bg-gray-700">
                                                        <X className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            )}

                                            <textarea
                                                ref={bodyRef}
                                                className="max-h-28 min-h-[46px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
                                                rows={1}
                                                placeholder="Escribe una respuesta..."
                                                value={data.body}
                                                onChange={(e) => setData('body', e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        submit(e as any);
                                                    }
                                                }}
                                            />

                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="relative flex flex-wrap gap-2">
                                                    <input ref={attachmentRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.doc,.docx,.xls,.xlsx" onChange={(event) => setData('attachment', event.target.files?.[0] ?? null)} />
                                                    <button type="button" onClick={() => attachmentRef.current?.click()} aria-label="Adjuntar archivo" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-gray-700 transition active:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:active:bg-gray-700">
                                                        <Upload className="h-5 w-5" />
                                                        <span className="hidden sm:inline">Adjuntar</span>
                                                    </button>
                                                    <button type="button" onClick={() => setEmojiPickerOpen((open) => !open)} aria-label="Agregar emoji" className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-gray-700 transition active:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:active:bg-gray-700">
                                                        <span className="text-xl">😊</span>
                                                    </button>
                                                    {emojiPickerOpen && (
                                                        <div className="absolute bottom-12 left-0 z-20 grid w-64 grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-gray-600 dark:bg-gray-800">
                                                            {CHAT_EMOJIS.map((emoji) => (
                                                                <button
                                                                    key={emoji}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setData('body', `${data.body}${emoji}`);
                                                                        bodyRef.current?.focus();
                                                                    }}
                                                                    className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-slate-100 dark:hover:bg-gray-700"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <Button
                                                    type="submit"
                                                    disabled={processing || (!data.body.trim() && !data.attachment)}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-white hover:bg-emerald-700"
                                                >
                                                    <Send className="h-4 w-4" />
                                                    {processing ? 'Enviando...' : 'Enviar mensaje'}
                                                </Button>
                                            </div>
                                        </form>
                                    </Card>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
            <Modal
                show={zoomedImage !== null}
                maxWidth="7xl"
                closeable
                onClose={() => {
                    setZoomedImageIndex(null);
                    resetZoom();
                }}
            >
                {zoomedImage && (
                    <div className="flex min-h-[60vh] flex-col bg-gray-950 text-white">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">{zoomedImage.author}</p>
                                <p className="truncate text-xs text-white/60">{zoomedImage.caption ?? zoomedImage.alt}</p>
                                <p className="mt-1 text-[11px] text-white/40">{zoomedImageIndex !== null ? `${zoomedImageIndex + 1} / ${imageMessages.length}` : ''}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <a
                                    href={zoomedImage.src}
                                    download={zoomedImage.filename ?? `chat-image-${zoomedImageIndex !== null ? zoomedImageIndex + 1 : 'image'}.jpg`}
                                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
                                >
                                    Descargar
                                </a>
                                <button
                                    type="button"
                                    onClick={resetZoom}
                                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
                                >
                                    1x
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setZoomedImageIndex(null)}
                                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>

                        <div
                            className="flex flex-1 items-center justify-center gap-3 p-4 sm:p-6"
                            onWheel={handleZoomWheel}
                            onTouchStart={handleZoomTouchStart}
                            onTouchMove={handleZoomTouchMove}
                            onTouchEnd={handleZoomTouchEnd}
                            onTouchCancel={handleZoomTouchEnd}
                            style={{ touchAction: 'none' }}
                        >
                            <button
                                type="button"
                                onClick={goToPreviousImage}
                                disabled={imageMessages.length <= 1}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-2xl font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Imagen anterior"
                            >
                                {'<'}
                            </button>

                            <div className="flex max-h-[75vh] w-full items-center justify-center overflow-hidden">
                                <img
                                    src={zoomedImage.src}
                                    alt={zoomedImage.alt}
                                    className="max-h-[75vh] w-full max-w-[min(100%,1100px)] rounded-2xl object-contain shadow-2xl transition-transform duration-150 ease-out"
                                    style={{ transform: `scale(${zoomScale})` }}
                                />
                            </div>

                            <button
                                type="button"
                                onClick={goToNextImage}
                                disabled={imageMessages.length <= 1}
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-2xl font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Imagen siguiente"
                            >
                                {'>'}
                            </button>
                        </div>

                        <div className="border-t border-white/10 px-4 py-3 text-xs text-white/60 sm:px-6">
                            <p>{zoomedImage.time}</p>
                        </div>
                    </div>
                )}
            </Modal>

        </ResponsiveLayout>
    );
}
