import { Link } from '@inertiajs/react';

type Tab = 'indicators' | 'accounting' | 'payments' | 'collections' | 'conciliations' | 'sinpe_emails';

interface Props {
    active: Tab;
}

const tabs: { id: Tab; label: string; routeName: string }[] = [
    { id: 'accounting',   label: 'Resumen',       routeName: 'accounting.index' },
    { id: 'indicators',   label: 'Indicadores',   routeName: 'accounting.indicators' },
    { id: 'payments',     label: 'Pagos',         routeName: 'payments.index' },
    { id: 'collections',   label: 'Cobranzas',     routeName: 'collections.index' },
    { id: 'conciliations', label: 'Conciliaciones', routeName: 'conciliations.index' },
    { id: 'sinpe_emails',  label: 'Correos',       routeName: 'sinpe-emails.index' },
];

export default function AccountingTabs({ active }: Props) {
    return (
        <div className="mb-6 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex min-w-max gap-6 sm:min-w-0 sm:flex-wrap" aria-label="Tabs">
                {tabs.map(tab => (
                    <Link
                        key={tab.id}
                        href={route(tab.routeName)}
                        className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                            active === tab.id
                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                        }`}
                    >
                        {tab.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
