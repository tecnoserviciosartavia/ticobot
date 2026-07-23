import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { MessageSquare, DollarSign, CheckCircle, X, BarChart3 } from '@/components/ui/icons';

export default function VerifyEmail({ status }: { status?: string }) {
    const { post, processing } = useForm({});

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('verification.send'));
    };

    return (
        <ResponsiveLayout>
            <Head title="Verificar Email" />

            <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                    <div className="text-center">
                        <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <MessageSquare className="h-6 w-6 text-blue-600" />
                        </div>
                        <h2 className="mt-6 text-3xl font-bold text-gray-900">
                            Verificar Email
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            ¡Gracias por registrarte! Antes de comenzar, por favor verifica tu dirección de email 
                            haciendo clic en el enlace que te acabamos de enviar por correo electrónico.
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                            Si no recibiste el email, te enviaremos uno nuevo con gusto.
                        </p>
                    </div>

                    <Card className="p-6">
                        {status === 'verification-link-sent' && (
                            <div className="mb-6 p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                                <div className="flex items-center space-x-2">
                                    <CheckCircle className="h-5 w-5 text-cyan-600" />
                                    <p className="text-sm font-medium text-cyan-800">
                                        Se ha enviado un nuevo enlace de verificación a la dirección de correo 
                                        electrónico que proporcionaste durante el registro.
                                    </p>
                                </div>
                            </div>
                        )}

                        <form onSubmit={submit} className="space-y-6">
                            <div className="text-center">
                                <div className="inline-flex items-center space-x-2 px-3 py-1 bg-blue-50 rounded-full">
                                    <BarChart3 className="h-4 w-4 text-blue-600" />
                                    <span className="text-xs font-medium text-blue-800">
                                        Verificación pendiente
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Button
                                    type="submit"
                                    disabled={processing}
                                    className="w-full flex items-center justify-center space-x-2"
                                >
                                    <DollarSign className="h-4 w-4" />
                                    <span>{processing ? 'Enviando...' : 'Reenviar Email de Verificación'}</span>
                                </Button>

                                <div className="flex items-center justify-center">
                                    <div className="text-xs text-gray-500">
                                        ¿No necesitas verificar? 
                                    </div>
                                    <Link
                                        href={route('logout')}
                                        method="post"
                                        as="button"
                                        className="ml-2 inline-flex items-center space-x-1 text-xs text-red-600 hover:text-red-800 font-medium"
                                    >
                                        <X className="h-3 w-3" />
                                        <span>Cerrar Sesión</span>
                                    </Link>
                                </div>
                            </div>
                        </form>
                    </Card>

                    <div className="text-center space-y-2">
                        <Badge variant="outline" className="text-xs">
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Revisa tu bandeja de entrada
                        </Badge>
                        <p className="text-xs text-gray-500">
                            El enlace de verificación expirará en 24 horas.
                        </p>
                    </div>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
