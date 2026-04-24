import axios from 'axios';
import { Capacitor, registerPlugin } from '@capacitor/core';

type PermissionStatus = { receive: 'granted' | 'denied' | 'prompt' };

type PushNotificationsPlugin = {
    requestPermissions: () => Promise<PermissionStatus>;
    register: () => Promise<void>;
    addListener(eventName: 'registration', listenerFunc: (token: { value: string }) => void): Promise<{ remove: () => void }>;
    addListener(eventName: 'registrationError', listenerFunc: (error: unknown) => void): Promise<{ remove: () => void }>;
};

const PushNotifications = registerPlugin<PushNotificationsPlugin>('PushNotifications');

let started = false;

export async function registerPushDeviceForApp(): Promise<void> {
    if (started || !Capacitor.isNativePlatform()) {
        return;
    }
    started = true;

    try {
        const permissions = await PushNotifications.requestPermissions();
        if (permissions.receive !== 'granted') {
            return;
        }

        await PushNotifications.addListener('registration', async (token) => {
            if (!token?.value) {
                return;
            }

            await axios.post('/api/push/device-token', {
                token: token.value,
                platform: Capacitor.getPlatform(),
            });
        });

        await PushNotifications.addListener('registrationError', (error) => {
            console.error('Error registrando push:', error);
        });

        await PushNotifications.register();
    } catch (error) {
        console.error('No se pudo inicializar PushNotifications:', error);
    }
}
