import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePushNotificationPreferencesForm from './Partials/UpdatePushNotificationPreferencesForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import WhatsAppConnectionCard, { WhatsAppStatus } from './Partials/WhatsAppConnectionCard';
import { 
  User, 
  Settings, 
  Bell, 
  Lock, 
  Shield, 
  MessageSquare,
  Smartphone,
  Key,
  CheckCircle,
  AlertCircle
} from '@/Components/icons';

export default function Edit({
    mustVerifyEmail,
    pushNotificationPreferences,
    status,
    whatsapp,
}: PageProps<{
    mustVerifyEmail: boolean;
    pushNotificationPreferences: {
        daily_expected_payments: boolean;
        overdue_payments: boolean;
        platform_cost_due: boolean;
        conciliation_pending: boolean;
        whatsapp_manual_pause_events: boolean;
    };
    status?: string;
    whatsapp: WhatsAppStatus;
}>) {
    return (
        <ResponsiveLayout title="Perfil">
            <Head title="Profile" />
            
            <div className="py-6">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center">
                                <User className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Configuración del Perfil</h1>
                                <p className="mt-2 text-gray-600">
                                    Gestiona tu información personal, seguridad y preferencias
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Status Message */}
                    {status && (
                        <div className="mb-6 rounded-md bg-green-50 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <CheckCircle className="h-5 w-5 text-green-400" />
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm font-medium text-green-800">
                                        {status}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        {/* Profile Information */}
                        <Card>
                            <div className="p-6">
                                <div className="flex items-center mb-6">
                                    <User className="h-6 w-6 text-blue-600 mr-3" />
                                    <h2 className="text-xl font-semibold text-gray-900">Información del Perfil</h2>
                                </div>
                                <UpdateProfileInformationForm
                                    mustVerifyEmail={mustVerifyEmail}
                                    status={status}
                                    className="max-w-2xl"
                                />
                            </div>
                        </Card>

                        {/* Password */}
                        <Card>
                            <div className="p-6">
                                <div className="flex items-center mb-6">
                                    <Lock className="h-6 w-6 text-green-600 mr-3" />
                                    <h2 className="text-xl font-semibold text-gray-900">Contraseña</h2>
                                </div>
                                <UpdatePasswordForm className="max-w-2xl" />
                            </div>
                        </Card>

                        {/* WhatsApp Connection */}
                        <Card>
                            <div className="p-6">
                                <div className="flex items-center mb-6">
                                    <MessageSquare className="h-6 w-6 text-green-600 mr-3" />
                                    <h2 className="text-xl font-semibold text-gray-900">Conexión WhatsApp</h2>
                                </div>
                                <WhatsAppConnectionCard data={whatsapp} />
                            </div>
                        </Card>

                        {/* Notification Preferences */}
                        <Card>
                            <div className="p-6">
                                <div className="flex items-center mb-6">
                                    <Bell className="h-6 w-6 text-purple-600 mr-3" />
                                    <h2 className="text-xl font-semibold text-gray-900">Preferencias de Notificación</h2>
                                </div>
                                <UpdatePushNotificationPreferencesForm 
                                    preferences={pushNotificationPreferences}
                                    className="max-w-2xl"
                                />
                            </div>
                        </Card>

                        {/* Danger Zone */}
                        <Card className="border-red-200">
                            <div className="p-6">
                                <div className="flex items-center mb-6">
                                    <Shield className="h-6 w-6 text-red-600 mr-3" />
                                    <h2 className="text-xl font-semibold text-gray-900">Zona de Peligro</h2>
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <AlertCircle className="h-5 w-5 text-red-400" />
                                        </div>
                                        <div className="ml-3">
                                            <h3 className="text-sm font-medium text-red-800">
                                                Eliminar cuenta permanentemente
                                            </h3>
                                            <div className="mt-2 text-sm text-red-700">
                                                <p>
                                                    Una vez que elimines tu cuenta, no hay vuelta atrás. Por favor, ten cuidado.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <DeleteUserForm className="max-w-2xl" />
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
