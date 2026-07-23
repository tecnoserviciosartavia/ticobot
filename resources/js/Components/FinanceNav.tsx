import { Link } from '@inertiajs/react';
import { BarChart3, CreditCard, Plus, Users } from '@/Components/icons';

type FinanceSection = 'overview' | 'payments' | 'collections' | 'indicators' | 'emails';

export default function FinanceNav({ active, periodLabel }: { active: FinanceSection; periodLabel?: string }) {
    const items = [
        { id: 'overview', label: 'Resumen', href: route('finance.index', { tab: 'overview' }), icon: BarChart3 },
        { id: 'payments', label: 'Movimientos', href: route('finance.index', { tab: 'payments' }), icon: CreditCard },
        { id: 'collections', label: 'Cobranzas', href: route('finance.index', { tab: 'collections' }), icon: Users },
        { id: 'indicators', label: 'Indicadores', href: route('accounting.indicators'), icon: BarChart3 },
        { id: 'emails', label: 'Correos', href: route('sinpe-emails.index'), icon: CreditCard },
    ] as const;

    return (
        <div className="space-y-5">
            <div className="rounded-2xl bg-gradient-to-r from-cyan-700 to-cyan-600 p-5 text-white shadow-sm sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-cyan-100">
                            Centro financiero{periodLabel ? ` · ${periodLabel}` : ''}
                        </p>
                        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Pagos y cobros</h1>
                        <p className="mt-2 max-w-2xl text-sm text-cyan-50">Registrá, revisá y administrá las finanzas desde un solo lugar.</p>
                    </div>
                    <Link href={route('payments.create')} className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-cyan-800 shadow-sm">
                        <Plus className="mr-2 h-4 w-4" /> Registrar pago
                    </Link>
                </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
                {items.map(({ id, label, href, icon: Icon }) => (
                    <Link key={id} href={href} preserveState className={`inline-flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${active === id ? 'bg-cyan-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
                        <Icon className="h-4 w-4" /> {label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
