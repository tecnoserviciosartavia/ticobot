import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import type { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LogSource = {
    key: string;
    label: string;
    exists: boolean;
};

type LogsPageProps = PageProps<{
    sources: LogSource[];
    defaultSource: string;
}>;

type FetchResponse = {
    ok: boolean;
    source: string;
    label: string;
    path: string;
    exists: boolean;
    lines: string[];
    updated_at: string | null;
    error?: string;
};

export default function LogsIndex({ sources, defaultSource }: LogsPageProps) {
    const [source, setSource] = useState<string>(defaultSource);
    const [lineLimit, setLineLimit] = useState<number>(250);
    const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
    const [autoScroll, setAutoScroll] = useState<boolean>(true);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lines, setLines] = useState<string[]>([]);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [activeLabel, setActiveLabel] = useState<string>('');
    const [activePath, setActivePath] = useState<string>('');

    const viewportRef = useRef<HTMLDivElement | null>(null);

    const selectedSource = useMemo(
        () => sources.find((item) => item.key === source),
        [sources, source],
    );

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const url = new URL(route('logs.fetch'), window.location.origin);
            url.searchParams.set('source', source);
            url.searchParams.set('lines', String(lineLimit));

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
            });

            const payload: FetchResponse = await response.json();
            if (!response.ok || !payload.ok) {
                throw new Error(payload.error || 'No se pudieron obtener los logs.');
            }

            setLines(Array.isArray(payload.lines) ? payload.lines : []);
            setUpdatedAt(payload.updated_at);
            setActiveLabel(payload.label || 'Logs');
            setActivePath(payload.path || '');

            if (!payload.exists) {
                setError('El archivo de logs no existe o no es legible con el usuario actual del servidor.');
            }
        } catch (err: any) {
            setError(String(err?.message || err || 'Error inesperado leyendo logs.'));
        } finally {
            setLoading(false);
        }
    }, [lineLimit, source]);

    useEffect(() => {
        void fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (!autoRefresh) return;

        const id = window.setInterval(() => {
            void fetchLogs();
        }, 2000);

        return () => window.clearInterval(id);
    }, [autoRefresh, fetchLogs]);

    useEffect(() => {
        if (!autoScroll) return;
        const el = viewportRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [autoScroll, lines]);

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-semibold">Logs en tiempo real</h2>}>
            <Head title="Logs en tiempo real" />

            <div className="py-8">
                <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
                    <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:grid-cols-2 lg:grid-cols-4">
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Fuente</span>
                            <select
                                value={source}
                                onChange={(e) => setSource(e.target.value)}
                                className="rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                            >
                                {sources.map((item) => (
                                    <option key={item.key} value={item.key}>
                                        {item.label}{item.exists ? '' : ' (sin acceso)'}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Líneas</span>
                            <select
                                value={lineLimit}
                                onChange={(e) => setLineLimit(Number(e.target.value))}
                                className="rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                            >
                                {[100, 250, 500, 1000].map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded border-gray-300"
                            />
                            <span className="text-gray-700 dark:text-gray-300">Auto-recarga (2s)</span>
                        </label>

                        <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={(e) => setAutoScroll(e.target.checked)}
                                className="rounded border-gray-300"
                            />
                            <span className="text-gray-700 dark:text-gray-300">Seguir al final</span>
                        </label>

                        <div className="md:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-700 dark:text-gray-200">
                                {activeLabel || selectedSource?.label || 'Fuente de logs'}
                            </span>
                            <span>
                                Última lectura: {updatedAt ? new Date(updatedAt).toLocaleString('es-CR') : 'N/A'}
                            </span>
                            {activePath && <span className="truncate">Archivo: {activePath}</span>}
                            <button
                                type="button"
                                onClick={() => void fetchLogs()}
                                className="ml-auto rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                            >
                                Refrescar ahora
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <div
                        ref={viewportRef}
                        className="h-[68vh] overflow-auto rounded-lg border border-gray-200 bg-black p-4 font-mono text-xs leading-5 text-green-200 dark:border-gray-700"
                    >
                        {loading && lines.length === 0 ? (
                            <div className="text-gray-300">Cargando logs...</div>
                        ) : lines.length === 0 ? (
                            <div className="text-gray-300">No hay líneas para mostrar en esta fuente.</div>
                        ) : (
                            lines.map((line, index) => (
                                <div key={`${index}-${line.slice(0, 30)}`}>{line}</div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
