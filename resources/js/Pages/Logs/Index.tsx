import ResponsiveLayout from '@/Components/ResponsiveLayout';
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
        <ResponsiveLayout title="Logs en tiempo real">
            <Head title="Logs en tiempo real" />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="bg-white shadow sm:rounded-lg">
                        <div className="px-4 py-5 sm:p-6">
                            <div className="mb-4">
                                <label htmlFor="source" className="block text-sm font-medium text-gray-700">
                                    Origen de logs
                                </label>
                                <select
                                    id="source"
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                >
                                    {sources.map((source) => (
                                        <option key={source.key} value={source.key} disabled={!source.exists}>
                                            {source.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="mb-4 flex items-center space-x-4">
                                <button
                                    onClick={() => setAutoScroll(!autoScroll)}
                                    className={`px-3 py-1 rounded text-sm font-medium ${
                                        autoScroll
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}
                                >
                                    Auto-scroll {autoScroll ? 'ON' : 'OFF'}
                                </button>
                                <button
                                    onClick={() => setLines([])}
                                    className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm font-medium"
                                >
                                    Limpiar
                                </button>
                            </div>
                            <div
                                ref={viewportRef}
                                className="bg-black text-green-400 p-4 rounded font-mono text-sm overflow-auto"
                                style={{ height: '500px' }}
                            >
                                {loading && lines.length === 0 ? (
                                    <div className="text-gray-300">Cargando logs...</div>
                                ) : lines.length === 0 ? (
                                    <div className="text-gray-300">No hay líneas para mostrar en esta fuente.</div>
                                ) : (
                                    lines.map((line, index) => (
                                        <div key={index} className="mb-1">
                                            {line}
                                        </div>
                                    ))
                                )}
                            </div>
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
        </ResponsiveLayout>
    );
}
