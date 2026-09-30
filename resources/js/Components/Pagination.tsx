import { Link } from '@inertiajs/react';

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

interface PaginationProps {
    links: PaginationLink[];
}

const sanitizeLabel = (label: string) =>
    label
        .replace(/&laquo;/g, '«')
        .replace(/&raquo;/g, '»')
        .replace(/&nbsp;/g, ' ');

export default function Pagination({ links }: PaginationProps) {
    if (!links.length || links.every((link) => link.url === null)) {
        return null;
    }

    const prev = links[0];
    const next = links[links.length - 1];
    const pageLinks = links.slice(1, -1);
    const currentPage = pageLinks.findIndex((link) => link.active) + 1;
    const totalPages = pageLinks.filter((link) => link.label !== '...').length;

    return (
        <nav aria-label="Pagination">
            {/* Mobile: solo anterior/siguiente + indicador de página */}
            <div className="flex items-center justify-between gap-3 md:hidden">
                {prev.url ? (
                    <Link
                        href={prev.url}
                        preserveScroll
                        className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                        « Anterior
                    </Link>
                ) : (
                    <span className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-300 dark:border-slate-800 dark:text-slate-700">
                        « Anterior
                    </span>
                )}
                {currentPage > 0 && totalPages > 0 && (
                    <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {currentPage} / {totalPages}
                    </span>
                )}
                {next.url ? (
                    <Link
                        href={next.url}
                        preserveScroll
                        className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                        Siguiente »
                    </Link>
                ) : (
                    <span className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-300 dark:border-slate-800 dark:text-slate-700">
                        Siguiente »
                    </span>
                )}
            </div>

            {/* Desktop: listado numerado completo */}
            <ul className="hidden flex-wrap gap-2 md:flex">
                {links.map((link, index) => (
                    <li key={`${link.label}-${index}`}>
                        {link.url ? (
                            <Link
                                href={link.url}
                                preserveScroll
                                className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium transition-colors ${
                                    link.active
                                        ? 'border-cyan-500 bg-cyan-500 text-white'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                                dangerouslySetInnerHTML={{
                                    __html: sanitizeLabel(link.label),
                                }}
                            />
                        ) : (
                            <span
                                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1 text-sm font-medium text-slate-400 dark:border-slate-800 dark:text-slate-600"
                                dangerouslySetInnerHTML={{
                                    __html: sanitizeLabel(link.label),
                                }}
                            />
                        )}
                    </li>
                ))}
            </ul>
        </nav>
    );
}
