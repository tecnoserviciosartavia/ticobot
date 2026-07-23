import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { Lock, CheckCircle, ArrowLeft } from '@/Components/icons';

export default function ResetPassword({
    token,
    email,
}: {
    token: string;
    email: string;
}) {
    const { data, setData, post, processing, errors, reset } = useForm({
        token: token,
        email: email,
        password: '',
        password_confirmation: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('password.store'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <>
            <Head title="Reset Password" />
            
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                    {/* Header */}
                    <div className="text-center">
                        <div className="mx-auto h-16 w-16 bg-cyan-600 rounded-full flex items-center justify-center">
                            <Lock className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="mt-6 text-3xl font-bold text-gray-900">
                            Restablecer contraseña
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Crea una nueva contraseña segura para tu cuenta
                        </p>
                    </div>

                    {/* Reset Password Form */}
                    <Card className="p-8">
                        <form onSubmit={submit} className="space-y-6">
                            {/* Email Field (Readonly) */}
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                    Correo electrónico
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        value={data.email}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 sm:text-sm"
                                        readOnly
                                    />
                                </div>
                            </div>

                            {/* Password Field */}
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                    Nueva contraseña
                                </label>
                                <div className="mt-1 relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        id="password"
                                        type="password"
                                        name="password"
                                        value={data.password}
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                        onChange={(e) => setData('password', e.target.value)}
                                        required
                                    />
                                </div>
                                {errors.password && (
                                    <p className="mt-2 text-sm text-red-600">
                                        {errors.password}
                                    </p>
                                )}
                            </div>

                            {/* Confirm Password Field */}
                            <div>
                                <label htmlFor="password_confirmation" className="block text-sm font-medium text-gray-700">
                                    Confirmar nueva contraseña
                                </label>
                                <div className="mt-1 relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        id="password_confirmation"
                                        type="password"
                                        name="password_confirmation"
                                        value={data.password_confirmation}
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                        onChange={(e) => setData('password_confirmation', e.target.value)}
                                        required
                                    />
                                </div>
                                {errors.password_confirmation && (
                                    <p className="mt-2 text-sm text-red-600">
                                        {errors.password_confirmation}
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
                                    {processing ? 'Restableciendo...' : 'Restablecer contraseña'}
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
                                <Link
                                    href={route('login')}
                                    className="font-medium text-cyan-600 hover:text-cyan-500 inline-flex items-center"
                                >
                                    <ArrowLeft className="h-4 w-4 mr-1" />
                                    Volver al inicio de sesión
                                </Link>
                            </div>
                        </div>
                    </Card>

                    {/* Security Tips */}
                    <div className="mt-6">
                        <div className="text-center">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">Consejos de seguridad</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-center text-sm text-gray-600">
                                    <CheckCircle className="h-4 w-4 text-cyan-500 mr-2" />
                                    Usa al menos 8 caracteres
                                </div>
                                <div className="flex items-center justify-center text-sm text-gray-600">
                                    <CheckCircle className="h-4 w-4 text-cyan-500 mr-2" />
                                    Incluye números y símbolos
                                </div>
                                <div className="flex items-center justify-center text-sm text-gray-600">
                                    <CheckCircle className="h-4 w-4 text-cyan-500 mr-2" />
                                    No uses contraseñas fáciles de adivinar
                                </div>
                                <div className="flex items-center justify-center text-sm text-gray-600">
                                    <CheckCircle className="h-4 w-4 text-cyan-500 mr-2" />
                                    Guarda tu contraseña en un lugar seguro
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
