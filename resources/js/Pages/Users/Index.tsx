import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, useForm, usePage } from '@inertiajs/react';
import { FormEvent } from 'react';

type ManagedUser = {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
    profile_type?: string | null;
    created_at: string;
};

function UserRow({ user }: { user: ManagedUser }) {
    const form = useForm({
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
        profile_type: user.profile_type ?? 'admin',
        password: '',
        password_confirmation: '',
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.patch(route('users.update', user.id));
    };

    const remove = () => {
        if (!confirm(`Eliminar usuario ${user.name}?`)) return;
        form.delete(route('users.destroy', user.id));
    };

    return (
        <form onSubmit={submit} className="grid gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="grid gap-3 md:grid-cols-4">
                <div>
                    <InputLabel htmlFor={`name-${user.id}`} value="Nombre" />
                    <TextInput
                        id={`name-${user.id}`}
                        className="mt-1 block w-full"
                        value={form.data.name}
                        onChange={(e) => form.setData('name', e.target.value)}
                        required
                    />
                    <InputError className="mt-1" message={form.errors.name} />
                </div>

                <div>
                    <InputLabel htmlFor={`email-${user.id}`} value="Email" />
                    <TextInput
                        id={`email-${user.id}`}
                        type="email"
                        className="mt-1 block w-full"
                        value={form.data.email}
                        onChange={(e) => form.setData('email', e.target.value)}
                        required
                    />
                    <InputError className="mt-1" message={form.errors.email} />
                </div>

                <div>
                    <InputLabel htmlFor={`phone-${user.id}`} value="Teléfono" />
                    <TextInput
                        id={`phone-${user.id}`}
                        className="mt-1 block w-full"
                        value={form.data.phone}
                        onChange={(e) => form.setData('phone', e.target.value)}
                        placeholder="50688887777"
                    />
                    <InputError className="mt-1" message={form.errors.phone} />
                </div>

                <div>
                    <InputLabel htmlFor={`role-${user.id}`} value="Rol" />
                    <select
                        id={`role-${user.id}`}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        value={form.data.profile_type}
                        onChange={(e) => form.setData('profile_type', e.target.value)}
                    >
                        <option value="admin">Admin</option>
                        <option value="agent">Agente</option>
                    </select>
                    <InputError className="mt-1" message={form.errors.profile_type} />
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div>
                    <InputLabel htmlFor={`password-${user.id}`} value="Nueva contraseña (opcional)" />
                    <TextInput
                        id={`password-${user.id}`}
                        type="password"
                        className="mt-1 block w-full"
                        value={form.data.password}
                        onChange={(e) => form.setData('password', e.target.value)}
                    />
                    <InputError className="mt-1" message={form.errors.password} />
                </div>
                <div>
                    <InputLabel htmlFor={`password-confirm-${user.id}`} value="Confirmar contraseña" />
                    <TextInput
                        id={`password-confirm-${user.id}`}
                        type="password"
                        className="mt-1 block w-full"
                        value={form.data.password_confirmation}
                        onChange={(e) => form.setData('password_confirmation', e.target.value)}
                    />
                </div>
            </div>

            <div className="flex gap-2 justify-end">
                <button
                    type="button"
                    onClick={remove}
                    disabled={form.processing}
                    className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                    Eliminar
                </button>
                <PrimaryButton disabled={form.processing}>Guardar</PrimaryButton>
            </div>
        </form>
    );
}

export default function UsersIndex({ users = [] }: { users?: ManagedUser[] }) {
    const page = usePage().props as {
        flash?: { success?: string; error?: string };
    };

    const createForm = useForm({
        name: '',
        email: '',
        phone: '',
        profile_type: 'agent',
        password: '',
        password_confirmation: '',
    });

    const createUser = (e: FormEvent) => {
        e.preventDefault();
        createForm.post(route('users.store'), {
            onSuccess: () => {
                createForm.reset('name', 'email', 'phone', 'profile_type', 'password', 'password_confirmation');
                createForm.setData('profile_type', 'agent');
            },
        });
    };

    return (
        <ResponsiveLayout title="Usuarios">
            <Head title="Usuarios" />

            <div className="py-8">
                <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 space-y-6">
                    {page.flash?.success && (
                        <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-700 dark:border-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300">
                            {page.flash.success}
                        </div>
                    )}
                    {page.flash?.error && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                            {page.flash.error}
                        </div>
                    )}

                    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Crear usuario</h3>
                        <form onSubmit={createUser} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                                <InputLabel htmlFor="new-name" value="Nombre" />
                                <TextInput id="new-name" className="mt-1 block w-full" value={createForm.data.name} onChange={(e) => createForm.setData('name', e.target.value)} required />
                                <InputError className="mt-1" message={createForm.errors.name} />
                            </div>
                            <div>
                                <InputLabel htmlFor="new-email" value="Email" />
                                <TextInput id="new-email" type="email" className="mt-1 block w-full" value={createForm.data.email} onChange={(e) => createForm.setData('email', e.target.value)} required />
                                <InputError className="mt-1" message={createForm.errors.email} />
                            </div>
                            <div>
                                <InputLabel htmlFor="new-phone" value="Teléfono" />
                                <TextInput id="new-phone" className="mt-1 block w-full" value={createForm.data.phone} onChange={(e) => createForm.setData('phone', e.target.value)} placeholder="50688887777" />
                                <InputError className="mt-1" message={createForm.errors.phone} />
                            </div>
                            <div>
                                <InputLabel htmlFor="new-role" value="Rol" />
                                <select
                                    id="new-role"
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    value={createForm.data.profile_type}
                                    onChange={(e) => createForm.setData('profile_type', e.target.value)}
                                >
                                    <option value="admin">Admin</option>
                                    <option value="agent">Agente</option>
                                </select>
                                <InputError className="mt-1" message={createForm.errors.profile_type} />
                            </div>
                            <div>
                                <InputLabel htmlFor="new-password" value="Contraseña" />
                                <TextInput id="new-password" type="password" className="mt-1 block w-full" value={createForm.data.password} onChange={(e) => createForm.setData('password', e.target.value)} required />
                                <InputError className="mt-1" message={createForm.errors.password} />
                            </div>
                            <div>
                                <InputLabel htmlFor="new-password-confirm" value="Confirmar contraseña" />
                                <TextInput id="new-password-confirm" type="password" className="mt-1 block w-full" value={createForm.data.password_confirmation} onChange={(e) => createForm.setData('password_confirmation', e.target.value)} required />
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                                <PrimaryButton disabled={createForm.processing}>Crear usuario</PrimaryButton>
                            </div>
                        </form>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Usuarios existentes</h3>
                        {users.length === 0 ? (
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 text-gray-500 dark:text-gray-400">
                                No hay usuarios.
                            </div>
                        ) : (
                            users.map((user) => <UserRow key={user.id} user={user} />)
                        )}
                    </section>
                </div>
            </div>
        </ResponsiveLayout>
    );
}
