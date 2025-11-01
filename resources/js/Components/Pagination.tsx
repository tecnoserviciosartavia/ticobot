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
                                        ? 'border-indigo-500 bg-indigo-500 text-white'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                                dangerouslySetInnerHTML={{
                                    __html: sanitizeLabel(link.label),
                                }}
                            />
                        ) : (
                            <span
                                className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1 text-sm font-medium text-gray-400"
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
