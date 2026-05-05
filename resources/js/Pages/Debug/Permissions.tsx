import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, usePage } from '@inertiajs/react';

export default function DebugPermissions() {
    const { props } = usePage();
    const auth = props.auth as any;
    const user = auth?.user;

    return (
        <ResponsiveLayout title="Debug Permisos">
            <Head title="Debug Permisos" />
            
            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-8">Debug de Permisos</h1>
                    
                    <div className="bg-white shadow rounded-lg p-6">
                        <h2 className="text-lg font-semibold mb-4">Información del Usuario</h2>
                        
                        <div className="space-y-2">
                            <p><strong>ID:</strong> {user?.id || 'No disponible'}</p>
                            <p><strong>Nombre:</strong> {user?.name || 'No disponible'}</p>
                            <p><strong>Email:</strong> {user?.email || 'No disponible'}</p>
                            <p><strong>Profile Type:</strong> {user?.profile_type || 'No disponible'}</p>
                            <p><strong>Es Admin:</strong> {user?.isAdmin ? 'SÍ' : 'NO'}</p>
                        </div>

                        <div className="mt-6 p-4 bg-gray-100 rounded">
                            <h3 className="font-semibold mb-2">Rutas que deberías poder acceder:</h3>
                            <ul className="list-disc list-inside space-y-1">
                                <li>
                                    <a href="/chats" className="text-blue-600 hover:underline">
                                        /chats (Todos los autenticados)
                                    </a>
                                </li>
                                <li>
                                    <a href="/accounting" className="text-blue-600 hover:underline">
                                        /accounting (Solo administradores)
                                    </a>
                                </li>
                                <li>
                                    <a href="/users" className="text-blue-600 hover:underline">
                                        /users (Solo administradores)
                                    </a>
                                </li>
                                <li>
                                    <a href="/dashboard" className="text-blue-600 hover:underline">
                                        /dashboard (Solo administradores)
                                    </a>
                                </li>
                            </ul>
                        </div>

                        {user?.profile_type !== 'admin' && user?.profile_type !== null && (
                            <div className="mt-6 p-4 bg-yellow-100 border border-yellow-400 rounded">
                                <h3 className="font-semibold text-yellow-800">⚠️ Problema detectado</h3>
                                <p className="text-yellow-700">
                                    Tu perfil_type es "{user?.profile_type}". Para acceder a Contabilidad y Usuarios,
                                    necesitas que tu perfil_type sea "admin" o null.
                                </p>
                            </div>
                        )}

                        <div className="mt-6">
                            <h3 className="font-semibold mb-2">Solución:</h3>
                            <p>Actualiza tu perfil_type en la base de datos a 'admin' o null:</p>
                            <code className="block bg-gray-200 p-2 rounded mt-2 text-sm">
                                UPDATE users SET profile_type = 'admin' WHERE id = {user?.id};
                            </code>
                        </div>
                    </div>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
