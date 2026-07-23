import axios from 'axios';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { router } from '@inertiajs/react';

type PermissionStatus = { receive: 'granted' | 'denied' | 'prompt' };

type PushNotificationActionData = {
    notification?: {
        data?: Record<string, string | undefined>;
        title?: string;
        body?: string;
    };
};

type PushNotificationsPlugin = {
    requestPermissions: () => Promise<PermissionStatus>;
    register: () => Promise<void>;
    createChannel: (channel: { id: string; name: string; description?: string; importance?: number; visibility?: number; vibration?: boolean; lights?: boolean }) => Promise<void>;
    addListener(eventName: 'registration', listenerFunc: (token: { value: string }) => void): Promise<{ remove: () => void }>;
    addListener(eventName: 'registrationError', listenerFunc: (error: unknown) => void): Promise<{ remove: () => void }>;
    addListener(eventName: 'pushNotificationActionPerformed', listenerFunc: (notification: PushNotificationActionData) => void): Promise<{ remove: () => void }>;
    addListener(eventName: 'pushNotificationReceived', listenerFunc: (notification: PushNotificationActionData) => void): Promise<{ remove: () => void }>;
};

const PushNotifications = registerPlugin<PushNotificationsPlugin>('PushNotifications');

let started = false;
let listenersAttached = false;

function shouldEnablePushRegistration(): boolean {
    const envValue = import.meta.env.VITE_ENABLE_PUSH_REGISTRATION;

    if (envValue === '0' || envValue === 'false') {
        return false;
    }

    return Capacitor.isNativePlatform();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

async function registerWebPushDevice(webPublicKey: string | null, force: boolean): Promise<boolean> {
    if (typeof window === 'undefined') {
        return false;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return false;
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        console.warn('Web push requiere HTTPS o localhost.');
        return false;
    }

    let permission = Notification.permission;
    if (permission !== 'granted') {
        if (!force) {
            return false;
        }

        permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return false;
        }
    }

    if (!webPublicKey) {
        console.warn('Falta PUSH_VAPID_PUBLIC_KEY para registrar la PWA.');
        return false;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(webPublicKey) as unknown as BufferSource,
        });
    }

    await axios.post('/api/push/web-subscription', {
        subscription: subscription.toJSON(),
        platform: 'web',
    });

    return true;
}

function extractNotificationPayload(notification: PushNotificationActionData): { title: string; body: string; url: string; phone: string } {
    const data = notification.notification?.data ?? {};
    return {
        title: notification.notification?.title ?? 'Nuevo mensaje',
        body: notification.notification?.body ?? '',
        url: (data.url ?? '').trim(),
        phone: (data.phone ?? '').trim(),
    };
}

function openChatFromNotification(notification: PushNotificationActionData): void {
    const payload = extractNotificationPayload(notification);

    if (payload.url !== '') {
        if (payload.url.startsWith('/')) {
            router.visit(payload.url);
            return;
        }

        window.location.assign(payload.url);
        return;
    }

    if (payload.phone !== '') {
        router.visit(`/chats/${encodeURIComponent(payload.phone)}`);
    }
}

function dispatchForegroundPushBanner(notification: PushNotificationActionData): void {
    const payload = extractNotificationPayload(notification);
    window.dispatchEvent(new CustomEvent('ticobot-push-received', { detail: payload }));
}

export async function registerPushDeviceForApp(options: { force?: boolean; webPublicKey?: string | null } = {}): Promise<boolean> {
    const force = options.force ?? false;

    if (!Capacitor.isNativePlatform()) {
        return registerWebPushDevice(options.webPublicKey ?? null, force);
    }

    if (!Capacitor.isPluginAvailable('PushNotifications')) {
        return false;
    }

    if (!force && started) {
        return true;
    }

    if (!shouldEnablePushRegistration() && !force) {
        console.info('Push deshabilitado: define VITE_ENABLE_PUSH_REGISTRATION=true cuando quieras habilitarlo.');
        return false;
    }

    if (!started) {
        started = true;
    }

    try {
        const permissions = await PushNotifications.requestPermissions();
        console.info('📍 Permisos solicitados:', permissions.receive);

        if (permissions.receive !== 'granted') {
            console.warn('❌ Permisos de notificación NO concedidos');
            return false;
        }

        if (!listenersAttached) {
            await PushNotifications.createChannel({
                id: 'ticobot-chat-messages',
                name: 'Mensajes de chat',
                description: 'Avisos de nuevos mensajes entrantes de WhatsApp',
                importance: 5,
                visibility: 1,
                vibration: true,
                lights: true,
            });

            await PushNotifications.addListener('registration', async (token) => {
                if (!token?.value) {
                    console.error('❌ Token vacío recibido de Firebase');
                    return;
                }

                console.info('✅ Token de Firebase recibido:', token.value.substring(0, 50) + '...');

                try {
                    const response = await axios.post('/api/push/device-token', {
                        token: token.value,
                        platform: Capacitor.getPlatform(),
                    });
                    console.info('✅ Token registrado exitosamente en servidor:', response.data);
                } catch (error: any) {
                    console.error('❌ Error registrando token:', {
                        message: error.message,
                        response: error.response?.data,
                        status: error.response?.status,
                        headers: error.response?.headers,
                    });
                }
            });

            await PushNotifications.addListener('registrationError', (error) => {
                console.error('❌ Error en Firebase registration:', error);
            });

            await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                openChatFromNotification(notification);
            });

            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                dispatchForegroundPushBanner(notification);
            });

            listenersAttached = true;
        }

        console.info('🚀 Iniciando registro con Firebase...');
        await PushNotifications.register();
        return true;
    } catch (error) {
        console.error('❌ No se pudo inicializar PushNotifications:', error);
        return false;
    }
}
