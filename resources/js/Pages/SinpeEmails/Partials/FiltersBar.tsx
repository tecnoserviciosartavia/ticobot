import { FormEvent } from 'react';

interface FiltersBarProps {
    data: { status: string; read: string };
    setData: (key: 'status' | 'read', value: string) => void;
    submit: (event: FormEvent) => void;
    resetFilters: () => void;
    handleSync: () => void;
    syncing: boolean;
    statuses: string[];
    showMobileFilters: boolean;
    setShowMobileFilters: (value: boolean) => void;
    paginationMeta: { total: number };
    labelForEmailStatus: (status: string) => string;
}

export default function FiltersBar({
    data,
    setData,
    submit,
    resetFilters,
    handleSync,
    syncing,
    statuses,
    showMobileFilters,
    setShowMobileFilters,
    paginationMeta,
    labelForEmailStatus,
}: FiltersBarProps) {
    return (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
                <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Filtros</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{paginationMeta.total} transacción(es)</div>
                </div>
                <button
                    type="button"
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-gray-600 dark:text-gray-300"
                >
                    {showMobileFilters ? 'Ocultar' : 'Mostrar'}
                </button>
            </div>
            <form onSubmit={submit} className={`${showMobileFilters ? 'flex' : 'hidden'} flex-col gap-4 lg:flex lg:flex-row lg:flex-wrap lg:items-end`}>
                <div className="w-full sm:w-auto">
                    <label htmlFor="read" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Bandeja
                    </label>
                    <select
                        id="read"
                        value={data.read}
                        onChange={(e) => setData('read', e.target.value)}
                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-auto"
                    >
                        <option value="">Todos</option>
                        <option value="unread">No leídos</option>
                        <option value="read">Leídos</option>
                    </select>
                </div>
                <div className="w-full sm:w-auto">
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Estado
                    </label>
                    <select
                        id="status"
                        value={data.status}
                        onChange={(e) => setData('status', e.target.value)}
                        className="mt-1 w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-auto"
                    >
                        <option value="">Todos</option>
                        {statuses.map((s) => (
                            <option key={s} value={s}>{labelForEmailStatus(s)}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="submit"
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                        Filtrar
                    </button>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                        Limpiar
                    </button>
                    <button
                        type="button"
                        onClick={handleSync}
                        disabled={syncing}
                        className="rounded-md border border-indigo-300 dark:border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50"
                    >
                        {syncing ? 'Recargando…' : 'Recargar correos'}
                    </button>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400 lg:ml-auto">
                    {paginationMeta.total} transacci{paginationMeta.total === 1 ? 'ón' : 'ones'}
                </span>
            </form>
        </div>
    );
}