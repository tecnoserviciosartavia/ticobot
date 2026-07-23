import { Button } from '@/Components/button';
import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt: () => Promise<void>;
};

const DISMISS_KEY = 'ticobot:pwa-install-dismissed';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function isIosDevice(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
        return false;
    }

    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

function isStandaloneMode(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function PwaInstallPrompt() {
    const [visible, setVisible] = useState(false);
    const [isIos, setIsIos] = useState(false);
    const [hasPrompt, setHasPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (isStandaloneMode()) {
            return;
        }

        const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) ?? '0');
        const dismissExpired = !dismissedAt || Number.isNaN(dismissedAt) || Date.now() - dismissedAt > DISMISS_TTL_MS;
        const ios = isIosDevice();

        setIsIos(ios);

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setDeferredPrompt(event as BeforeInstallPromptEvent);
            setHasPrompt(true);
            setVisible(dismissExpired);
        };

        const handleAppInstalled = () => {
            setVisible(false);
            setDeferredPrompt(null);
            setHasPrompt(false);
            window.localStorage.removeItem(DISMISS_KEY);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        if (ios) {
            setVisible(dismissExpired);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    if (!visible) {
        return null;
    }

    const closePrompt = () => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
        }

        setVisible(false);
    };

    const installApp = async () => {
        if (!deferredPrompt) {
            closePrompt();
            return;
        }

        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        closePrompt();
    };

    return (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur dark:border-slate-700">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 3H6a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V9l-5-6z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 3v6h6" />
                        </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">Instala TicoBOT en tu celular</p>
                        <p className="mt-1 text-sm text-slate-300">
                            Ábrelo como una app desde la pantalla de inicio y contesta chats más rápido.
                        </p>
                        {isIos ? (
                            <p className="mt-2 text-xs text-slate-400">
                                En iPhone: toca Compartir y luego "Añadir a pantalla de inicio".
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-3">
                    <Button type="button" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={closePrompt}>
                        Ahora no
                    </Button>
                    {hasPrompt && deferredPrompt ? (
                        <Button type="button" onClick={installApp}>
                            Instalar app
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
