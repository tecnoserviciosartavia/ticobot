export interface AccountingSubmenuItem {
    label: string;
    routeName: string;
    /** Ziggy pattern for route().current() */
    routePattern: string;
}

export const ACCOUNTING_SUBMENU_ITEMS: AccountingSubmenuItem[] = [
    { label: 'Resumen', routeName: 'accounting.index', routePattern: 'accounting.index' },
    { label: 'Indicadores', routeName: 'accounting.indicators', routePattern: 'accounting.indicators' },
    { label: 'Conciliaciones', routeName: 'conciliations.index', routePattern: 'conciliations.*' },
    { label: 'Pagos', routeName: 'payments.index', routePattern: 'payments.*' },
    { label: 'Cobranzas', routeName: 'collections.index', routePattern: 'collections.*' },
    { label: 'Correos', routeName: 'sinpe-emails.index', routePattern: 'sinpe-emails.*' },
];
