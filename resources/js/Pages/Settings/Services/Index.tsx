import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import type { PageProps } from '@/types';

type ServiceItem = {
    id: number;
    name: string;
    price: string;
    currency: 'CRC' | 'USD';
    is_active: boolean;
    updated_at?: string | null;
};

type Props = PageProps<{ services: ServiceItem[] }>;

const currencySymbol = (currency: string) => {
    switch (currency) {
        case 'CRC':
            return '₡';
        case 'USD':
            return '$';
        default:
            return currency;
    }
};

export default function ServicesSettingsIndex({ services }: Props) {
    const createForm = useForm({
        name: '',
        price: '0',
        currency: 'CRC' as 'CRC' | 'USD',
        is_active: true,
    });

    const [editingId, setEditingId] = useState<number | null>(null);
    const editForm = useForm({
        name: '',
        price: '0',
        currency: 'CRC' as 'CRC' | 'USD',
        is_active: true,
    });

    const startEdit = (s: ServiceItem) => {
        setEditingId(s.id);
        editForm.setData({
            name: s.name,
            price: String(s.price ?? '0'),
            currency: s.currency,
            is_active: !!s.is_active,
        });
        editForm.clearErrors();
    };

    const cancelEdit = () => {
        setEditingId(null);
        editForm.reset();
        editForm.clearErrors();
    };

    const submitCreate: React.FormEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault();
        createForm.post(route('settings.services.store'), {
            preserveScroll: true,
            onSuccess: () => createForm.reset('name'),
        });
    };

    const submitEdit: React.FormEventHandler<HTMLFormElement> = (e) => {
        e.preventDefault();
        if (!editingId) return;
        editForm.put(route('settings.services.update', editingId), {
            preserveScroll: true,
            onSuccess: () => cancelEdit(),
        });
    };

    const remove = (id: number) => {
        if (!confirm('¿Eliminar este servicio?')) return;
        router.delete(route('settings.services.destroy', id), { preserveScroll: true });
    };

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-semibold">Configuración: Servicios</h2>}>
            <Head title="Configuración - Servicios" />

            <div className="py-12">
                <div className="mx-auto max-w-5xl sm:px-6 lg:px-8 space-y-6">
                    <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow">
                        <h3 className="text-lg font-semibold">Agregar servicio</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Estos servicios se podrán seleccionar dentro de un contrato y el monto del contrato será la suma.
                        </p>

                        <form onSubmit={submitCreate} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium">Nombre</label>
                                <input
                                    value={createForm.data.name}
                                    onChange={(e) => createForm.setData('name', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    placeholder="Ej: YouTube"
                                    required
                                />
                                {createForm.errors.name && <div className="mt-1 text-sm text-red-600">{createForm.errors.name}</div>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Monto</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={createForm.data.price}
                                    onChange={(e) => createForm.setData('price', e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    required
                                />
                                {createForm.errors.price && <div className="mt-1 text-sm text-red-600">{createForm.errors.price}</div>}
                            </div>
                            <div className="flex gap-3 items-center justify-between">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium">Moneda</label>
                                    <select
                                        value={createForm.data.currency}
                                        onChange={(e) => createForm.setData('currency', e.target.value as any)}
                                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                    >
                                        <option value="CRC">CRC</option>
                                        <option value="USD">USD</option>
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 text-sm mt-6">
                                    <input
                                        type="checkbox"
                                        checked={!!createForm.data.is_active}
                                        onChange={(e) => createForm.setData('is_active', e.target.checked)}
                                    />
                                    Activo
                                </label>
                            </div>

                            <div className="md:col-span-4 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={createForm.processing}
                                    className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-white font-semibold hover:bg-indigo-500 disabled:opacity-60"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow">
                        <div className="flex items-baseline justify-between">
                            <h3 className="text-lg font-semibold">Servicios existentes</h3>
                            <a
                                href={route('settings.index')}
                                className="text-sm text-indigo-600 hover:underline"
                            >
                                Volver a Configuración general
                            </a>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead>
                                    <tr className="text-left text-sm text-gray-600 dark:text-gray-300">
                                        <th className="py-2 pr-4">Nombre</th>
                                        <th className="py-2 pr-4">Monto</th>
                                        <th className="py-2 pr-4">Moneda</th>
                                        <th className="py-2 pr-4">Activo</th>
                                        <th className="py-2">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {services.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-6 text-sm text-gray-500">
                                                No hay servicios.
                                            </td>
                                        </tr>
                                    ) : (
                                        services.map((s) => {
                                            const isEditing = editingId === s.id;
                                            return (
                                                <tr key={s.id} className="text-sm">
                                                    <td className="py-2 pr-4">
                                                        {isEditing ? (
                                                            <input
                                                                value={editForm.data.name}
                                                                onChange={(e) => editForm.setData('name', e.target.value)}
                                                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                                            />
                                                        ) : (
                                                            <span className={!s.is_active ? 'text-gray-400 line-through' : ''}>{s.name}</span>
                                                        )}
                                                        {isEditing && editForm.errors.name && (
                                                            <div className="mt-1 text-xs text-red-600">{editForm.errors.name}</div>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={editForm.data.price}
                                                                onChange={(e) => editForm.setData('price', e.target.value)}
                                                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                                            />
                                                        ) : (
                                                            s.price
                                                        )}
                                                        {isEditing && editForm.errors.price && (
                                                            <div className="mt-1 text-xs text-red-600">{editForm.errors.price}</div>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        {isEditing ? (
                                                            <select
                                                                value={editForm.data.currency}
                                                                onChange={(e) => editForm.setData('currency', e.target.value as any)}
                                                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                                            >
                                                                <option value="CRC">CRC</option>
                                                                <option value="USD">USD</option>
                                                            </select>
                                                        ) : (
                                                            currencySymbol(s.currency)
                                                        )}
                                                        {isEditing && editForm.errors.currency && (
                                                            <div className="mt-1 text-xs text-red-600">{editForm.errors.currency}</div>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        {isEditing ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={!!editForm.data.is_active}
                                                                onChange={(e) => editForm.setData('is_active', e.target.checked)}
                                                            />
                                                        ) : (
                                                            s.is_active ? 'Sí' : 'No'
                                                        )}
                                                    </td>
                                                    <td className="py-2">
                                                        {isEditing ? (
                                                            <form onSubmit={submitEdit} className="flex gap-2">
                                                                <button
                                                                    type="submit"
                                                                    disabled={editForm.processing}
                                                                    className="rounded-md bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-500 disabled:opacity-60"
                                                                >
                                                                    Guardar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={cancelEdit}
                                                                    className="rounded-md bg-gray-200 px-3 py-1 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </form>
                                                        ) : (
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => startEdit(s)}
                                                                    className="rounded-md bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-100"
                                                                >
                                                                    Editar
                                                                </button>
                                                                <button
                                                                    onClick={() => remove(s.id)}
                                                                    className="rounded-md bg-red-50 px-3 py-1 text-red-700 hover:bg-red-100"
                                                                >
                                                                    Eliminar
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
