import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Head, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { Settings, Shield, CheckCircle } from '@/components/ui/icons';

export default function ConfirmPassword() {
    const { data, setData, post, processing, errors, reset } = useForm({
        password: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('password.confirm'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <>
            <Head title="Confirmar Contraseña" />

            <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                    <div className="text-center">
                        <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Settings className="h-6 w-6 text-blue-600" />
                        </div>
                        <h2 className="mt-6 text-3xl font-bold text-gray-900">
                            Confirmar Contraseña
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Esta es un área segura de la aplicación. Por favor confirma tu contraseña antes de continuar.
                        </p>
                    </div>

                    <Card className="p-6">
                        <form onSubmit={submit} className="space-y-6">
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                    Contraseña
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    name="password"
                                    value={data.password}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    autoFocus
                                    onChange={(e) => setData('password', e.target.value)}
                                    placeholder="Ingresa tu contraseña"
                                />
                                {errors.password && (
                                    <p className="mt-2 text-sm text-red-600">
                                        {errors.password}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <Shield className="h-4 w-4 text-cyan-500" />
                                    <span className="text-xs text-gray-500">Conexión segura</span>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                    Requerido
                                </Badge>
                            </div>

                            <div className="flex items-center justify-end space-x-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => window.history.back()}
                                    disabled={processing}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={processing}
                                    className="flex items-center space-x-2"
                                >
                                    <CheckCircle className="h-4 w-4" />
                                    <span>{processing ? 'Confirmando...' : 'Confirmar'}</span>
                                </Button>
                            </div>
                        </form>
                    </Card>

                    <div className="text-center">
                        <p className="text-xs text-gray-500">
                            Al confirmar, verificaremos tu identidad para proteger tu cuenta.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
