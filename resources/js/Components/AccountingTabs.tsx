import { Link } from '@inertiajs/react';

type Tab = 'indicators' | 'accounting' | 'payments' | 'collections';

interface Props {
    active: Tab;
}

const tabs: { id: Tab; label: string; routeName: string }[] = [
    { id: 'accounting',  label: 'Resumen',      routeName: 'accounting.index' },
    { id: 'indicators',  label: 'Indicadores', routeName: 'accounting.indicators' },
    { id: 'payments',    label: 'Pagos',      routeName: 'payments.index' },
    { id: 'collections', label: 'Cobranzas',  routeName: 'collections.index' },
];

export default function AccountingTabs({ active }: Props) {
    return (
        <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                {tabs.map(tab => (
                    <Link
                        key={tab.id}
                        href={route(tab.routeName)}
                        className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                            active === tab.id
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        {tab.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
