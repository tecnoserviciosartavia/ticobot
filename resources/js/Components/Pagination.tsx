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

    return (
        <nav className="mt-6" aria-label="Pagination">
            <ul className="flex flex-wrap gap-2">
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
