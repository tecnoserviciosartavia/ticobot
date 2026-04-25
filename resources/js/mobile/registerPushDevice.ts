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

function shouldEnablePushRegistration(): boolean {
    // Safety switch: keep Android stable if Firebase is not configured yet.
    const envValue = import.meta.env.VITE_ENABLE_PUSH_REGISTRATION;

    if (envValue === '1' || envValue === 'true') {
        return true;
    }

    if (Capacitor.getPlatform() === 'android') {
        return false;
    }

    return false;
}

export async function registerPushDeviceForApp(): Promise<void> {
    if (started || !Capacitor.isNativePlatform()) {
        return;
    }

    if (!Capacitor.isPluginAvailable('PushNotifications')) {
        return;
    }

    if (!shouldEnablePushRegistration()) {
        console.info('Push deshabilitado: define VITE_ENABLE_PUSH_REGISTRATION=true cuando Firebase Android esté configurado.');
        return;
    }

    started = true;

    try {
        const permissions = await PushNotifications.requestPermissions();
        console.info('📍 Permisos solicitados:', permissions.receive);
        
        if (permissions.receive !== 'granted') {
            console.warn('❌ Permisos de notificación NO concedidos');
            return;
        }

        await PushNotifications.addListener('registration', async (token) => {
            if (!token?.value) {
                console.error('❌ Token vacío recibido de Firebase');
                return;
            }

            console.info('✅ Token de Firebase recibido:', token.value.substring(0, 50) + '...');

            try {
                // INTENTA PRIMERO CON ENDPOINT DE DEBUG (sin CSRF)
                console.info('🔄 Intentando registrar con endpoint de debug...');
                try {
                    const debugResponse = await axios.post('/debug/push/register', {
                        token: token.value,
                        platform: Capacitor.getPlatform(),
                    });
                    console.info('✅ DEBUG response:', debugResponse.data);
                } catch (debugError: any) {
                    console.error('⚠️  Debug endpoint error:', debugError.response?.data);
                }

                // LUEGO INTENTA CON ENDPOINT DE PRODUCCIÓN
                console.info('🔄 Intentando registrar con endpoint de producción...');
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

        console.info('🚀 Iniciando registro con Firebase...');
        await PushNotifications.register();
    } catch (error) {
        console.error('❌ No se pudo inicializar PushNotifications:', error);
    }
}
