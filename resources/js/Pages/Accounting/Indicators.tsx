import AccountingTabs from '@/Components/AccountingTabs';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';

interface ServiceProfit {
    id: number | null;
    name: string;
    revenue: number;
    cost: number;
    net: number;
    monthly_total?: number;
    currency?: string;
    account_email?: string | null;
}

interface Props {
    selected_month: string;
    selected_month_label: string;
    services_profit: ServiceProfit[];
}

export default function AccountingIndicators({ selected_month, selected_month_label, services_profit }: Props) {
    const formatMoney = (value: number) => value.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalPeriodPayments = services_profit.reduce((acc, service) => acc + (service.revenue || 0), 0);
    const totalPeriodCost = services_profit.reduce((acc, service) => acc + (service.cost || 0), 0);
    const totalPeriodMargin = totalPeriodPayments - totalPeriodCost;

    return (
        <AuthenticatedLayout header={<h2 className="text-xl font-semibold leading-tight text-gray-800">Indicadores</h2>}>
            <Head title="Indicadores" />

            <div className="py-6">
                <div className="mx-auto max-w-7xl space-y-8 sm:px-6 lg:px-8">
                    <AccountingTabs active="indicators" />

                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Indicadores por plataforma</p>
                                <h3 className="text-lg font-semibold text-gray-900">Periodo visible: {selected_month_label}</h3>
                                <p className="text-sm text-gray-500">Los montos se calculan con pagos verificados dentro del mes seleccionado.</p>
                            </div>

                            <div className="w-full md:w-auto">
                                <label htmlFor="month" className="mb-1 block text-sm font-medium text-gray-700">
                                    Filtrar por mes
                                </label>
                                <input
                                    id="month"
                                    type="month"
                                    value={selected_month}
                                    onChange={(event) => {
                                        router.get(route('accounting.indicators'), { month: event.target.value }, {
                                            preserveState: true,
                                            preserveScroll: true,
                                            replace: true,
                                        });
                                    }}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 md:w-52"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4 shadow">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-500">Total todas las plataformas</div>
                                <div className="text-lg font-bold text-gray-800">Pagos de {selected_month_label}: CRC {formatMoney(totalPeriodPayments)}</div>
                                <div className="text-sm text-gray-600">Costo del período: CRC {formatMoney(totalPeriodCost)}</div>
                            </div>
                            <div className={`text-2xl font-bold ${totalPeriodMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                Margen total: CRC {formatMoney(totalPeriodMargin)}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {services_profit.map((service) => {
                            const gain = (service.revenue || 0) - (service.cost || 0);

                            return (
                                <div key={String(service.id) + service.name} className="rounded-lg border bg-white p-4 shadow">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{service.name}</div>
                                    {service.account_email && (
                                        <div className="text-xs text-gray-400 mt-0.5">{service.account_email}</div>
                                    )}
                                    <div className="mt-1 text-lg font-bold text-gray-800">Pagos de {selected_month_label}: CRC {formatMoney(service.revenue || 0)}</div>
                                    <div className="text-sm text-gray-600">Costo del período: CRC {formatMoney(service.cost || 0)}</div>
                                    <div className={`text-sm font-semibold ${gain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        Margen: CRC {formatMoney(gain)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}