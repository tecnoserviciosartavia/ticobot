import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { Mail, ArrowLeft, CheckCircle } from '@/Components/icons';

export default function ForgotPassword({ status }: { status?: string }) {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('password.email'));
    };

    return (
        <>
            <Head title="Forgot Password" />
            
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                    {/* Header */}
                    <div className="text-center">
                        <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center">
                            <Mail className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="mt-6 text-3xl font-bold text-gray-900">
                            ¿Olvidaste tu contraseña?
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            No hay problema. Solo dinos tu dirección de correo electrónico 
                            y te enviaremos un enlace para restablecer tu contraseña.
                        </p>
                    </div>

                    {/* Success Message */}
                    {status && (
                        <Card className="p-6 bg-green-50 border-green-200">
                            <div className="flex items-center">
                                <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
                                <p className="text-sm text-green-800">
                                    {status}
                                </p>
                            </div>
                        </Card>
                    )}

                    {/* Forgot Password Form */}
                    <Card className="p-8">
                        <form onSubmit={submit} className="space-y-6">
                            {/* Email Field */}
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                    Correo electrónico
                                </label>
                                <div className="mt-1 relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        value={data.email}
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="tu@email.com"
                                        autoComplete="email"
                                        onChange={(e) => setData('email', e.target.value)}
                                        required
                                    />
                                </div>
                                {errors.email && (
                                    <p className="mt-2 text-sm text-red-600">
                                        {errors.email}
                                    </p>
                                )}
                            </div>

                            {/* Submit Button */}
                            <div>
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={processing}
                                >
                                    {processing ? 'Enviando...' : 'Enviar enlace de recuperación'}
                                </Button>
                            </div>
                        </form>

                        {/* Back to Login */}
                        <div className="mt-6">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-300" />
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white text-gray-500">O</span>
                                </div>
                            </div>

                            <div className="mt-6 text-center">
                                <p className="text-sm text-gray-600">
                                    ¿Recuerdas tu contraseña?{' '}
                                    <Link
                                        href={route('login')}
                                        className="font-medium text-blue-600 hover:text-blue-500 inline-flex items-center"
                                    >
                                        <ArrowLeft className="h-4 w-4 mr-1" />
                                        Volver al inicio de sesión
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Help Section */}
                    <div className="mt-6">
                        <div className="text-center">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">¿Necesitas ayuda?</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-center text-sm text-gray-600">
                                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                                    Revisa tu carpeta de spam si no recibes el correo
                                </div>
                                <div className="flex items-center justify-center text-sm text-gray-600">
                                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                                    El enlace expirará en 60 minutos
                                </div>
                                <div className="flex items-center justify-center text-sm text-gray-600">
                                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                                    Solo puedes solicitar un enlace cada 5 minutos
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
