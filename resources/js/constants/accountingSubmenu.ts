export interface AccountingSubmenuItem {
    label: string;
    routeName: string;
    /** Ziggy pattern for route().current() */
    routePattern: string;
}

export const ACCOUNTING_SUBMENU_ITEMS: AccountingSubmenuItem[] = [
    { label: 'Resumen', routeName: 'accounting.index', routePattern: 'accounting.index' },
    { label: 'Indicadores', routeName: 'accounting.indicators', routePattern: 'accounting.indicators' },
    { label: 'Correos', routeName: 'sinpe-emails.index', routePattern: 'sinpe-emails.*' },
];
