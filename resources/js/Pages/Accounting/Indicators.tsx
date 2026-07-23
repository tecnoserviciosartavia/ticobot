import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import FinanceNav from '@/Components/FinanceNav';
import { Head, router } from '@inertiajs/react';
import { Dialog, Transition } from '@headlessui/react';
import axios from 'axios';
import { Fragment, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, PieChart, Activity, Users, Settings, Eye } from '@/Components/icons';

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

interface ServiceClientsResponse {
    service: {
        id: number;
        name: string;
        currency: string;
        account_email?: string;
    };
    selected_month_label: string;
    rows: Array<{
        client_id: number;
        client_name: string;
        client_email: string;
        client_phone: string;
        payments_count: number;
        revenue: number;
        cost: number;
        margin: number;
    }>;
    summary: {
        clients_count: number;
        payments_count: number;
        total_revenue: number;
        total_cost: number;
        total_margin: number;
    };
}

export default function AccountingIndicators({ selected_month, selected_month_label, services_profit }: Props) {
    const formatMoney = (value: number) => value.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalPeriodPayments = services_profit.reduce((acc, service) => acc + (service.revenue || 0), 0);
    const totalPeriodCost = services_profit.reduce((acc, service) => acc + (service.cost || 0), 0);
    const totalPeriodMargin = totalPeriodPayments - totalPeriodCost;
    const [selectedService, setSelectedService] = useState<ServiceProfit | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [details, setDetails] = useState<ServiceClientsResponse | null>(null);
    const [clientSearch, setClientSearch] = useState('');

    const filteredRows = useMemo(() => {
        if (!details) {
            return [] as ServiceClientsResponse['rows'];
        }

        const needle = clientSearch.trim().toLowerCase();
        if (!needle) {
            return details.rows;
        }

        return details.rows.filter((row) =>
            row.client_name.toLowerCase().includes(needle)
            || row.client_email.toLowerCase().includes(needle)
            || row.client_phone.toLowerCase().includes(needle)
        );
    }, [details, clientSearch]);

    const openServiceDetails = async (service: ServiceProfit) => {
        if (!service.id) {
            return;
        }

        setSelectedService(service);
        setLoadingDetails(true);
        setDetails(null);
        setClientSearch('');

        try {
            const res = await axios.get(route('accounting.indicators.service-clients'), {
                params: {
                    service_id: service.id,
                    month: selected_month,
                },
            });

            setDetails(res.data as ServiceClientsResponse);
        } finally {
            setLoadingDetails(false);
        }
    };

    return (
        <ResponsiveLayout title="Indicadores" contentWidth="full">
            <Head title="Indicadores" />

            <div className="space-y-5 py-5">
                <FinanceNav active="indicators" periodLabel={selected_month_label} />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="space-y-8">

                        <Card className="p-6">
                            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Indicadores por plataforma</p>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Periodo visible: {selected_month_label}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Los montos se calculan con pagos verificados dentro del mes seleccionado.</p>
                            </div>

                            <div className="w-full md:w-auto">
                                <label htmlFor="month" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 md:w-52"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card className="border-2 border-indigo-300 bg-indigo-50 p-4 shadow dark:border-indigo-800 dark:bg-indigo-950/30 dark:shadow-gray-900/50">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-500">Total todas las plataformas</div>
                                <div className="text-lg font-bold text-gray-800 dark:text-gray-100">Pagos de {selected_month_label}: CRC {formatMoney(totalPeriodPayments)}</div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">Costo del período: CRC {formatMoney(totalPeriodCost)}</div>
                            </div>
                            <div className={`text-2xl font-bold ${totalPeriodMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                Margen total: CRC {formatMoney(totalPeriodMargin)}
                            </div>
                        </div>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {services_profit.map((service) => {
                            const gain = (service.revenue || 0) - (service.cost || 0);

                            return (
                                <button
                                    key={String(service.id) + service.name}
                                    type="button"
                                    onClick={() => openServiceDetails(service)}
                                    className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow transition hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:shadow-gray-900/50 dark:hover:border-indigo-700"
                                >
                                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{service.name}</div>
                                    {service.account_email && (
                                        <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{service.account_email}</div>
                                    )}
                                    <div className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">Pagos de {selected_month_label}: CRC {formatMoney(service.revenue || 0)}</div>
                                    <div className="text-sm text-gray-600 dark:text-gray-300">Costo del período: CRC {formatMoney(service.cost || 0)}</div>
                                    <div className={`text-sm font-semibold ${gain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        Margen: CRC {formatMoney(gain)}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    </div>
                </div>
            </div>

            <Transition show={selectedService !== null} as={Fragment}>
                <Dialog onClose={() => setSelectedService(null)} className="relative z-50">
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/40" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-gray-800 sm:max-w-5xl sm:rounded-xl sm:p-6">
                                <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {selectedService?.name} · Clientes que pagaron ({selected_month_label})
                                </Dialog.Title>

                                {loadingDetails && (
                                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Cargando detalle…</p>
                                )}

                                {!loadingDetails && details && (
                                    <>
                                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                {filteredRows.length} cliente(s) mostrado(s) de {details.rows.length}
                                            </div>
                                            <input
                                                type="text"
                                                value={clientSearch}
                                                onChange={(event) => setClientSearch(event.target.value)}
                                                placeholder="Buscar cliente, correo o teléfono..."
                                                className="w-full max-w-sm rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            />
                                        </div>

                                        <div className="mt-4 space-y-3 md:hidden">
                                            {filteredRows.length === 0 && (
                                                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                    No hay coincidencias para la búsqueda en este período.
                                                </div>
                                            )}
                                            {filteredRows.map((row) => (
                                                <div key={row.client_id} className="rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="font-medium text-gray-900 dark:text-gray-100">{row.client_name}</div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">{row.client_phone || row.client_email || '—'}</div>
                                                        </div>
                                                        <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                                                            {row.payments_count} pago(s)
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                                        <div>
                                                            <div className="text-gray-500 dark:text-gray-400">Ingresos</div>
                                                            <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">{details.service.currency} {formatMoney(row.revenue)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500 dark:text-gray-400">Costo</div>
                                                            <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">{details.service.currency} {formatMoney(row.cost)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500 dark:text-gray-400">Margen</div>
                                                            <div className={`font-mono font-semibold ${row.margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                                {details.service.currency} {formatMoney(row.margin)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-700/50">
                                                <div className="font-semibold text-gray-800 dark:text-gray-100">Resumen total</div>
                                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                                    <div>
                                                        <div className="text-gray-500 dark:text-gray-400">Clientes</div>
                                                        <div className="font-semibold text-gray-900 dark:text-gray-100">{details.summary.clients_count}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-500 dark:text-gray-400">Pagos</div>
                                                        <div className="font-semibold text-gray-900 dark:text-gray-100">{details.summary.payments_count}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-500 dark:text-gray-400">Ingresos</div>
                                                        <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">{details.service.currency} {formatMoney(details.summary.total_revenue)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-gray-500 dark:text-gray-400">Margen</div>
                                                        <div className={`font-mono font-semibold ${details.summary.total_margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                            {details.service.currency} {formatMoney(details.summary.total_margin)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 hidden overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 md:block">
                                            <table className="min-w-full text-sm text-gray-700 dark:text-gray-300">
                                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left">Cliente</th>
                                                        <th className="px-3 py-2 text-left">Contacto</th>
                                                        <th className="px-3 py-2 text-right">Pagos</th>
                                                        <th className="px-3 py-2 text-right">Ingresos</th>
                                                        <th className="px-3 py-2 text-right">Costo</th>
                                                        <th className="px-3 py-2 text-right">Margen</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredRows.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                                                                No hay coincidencias para la búsqueda en este período.
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {filteredRows.map((row) => (
                                                        <tr key={row.client_id} className="border-t border-gray-200 dark:border-gray-700">
                                                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{row.client_name}</td>
                                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.client_phone || row.client_email || '—'}</td>
                                                            <td className="px-3 py-2 text-right">{row.payments_count}</td>
                                                            <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{details.service.currency} {formatMoney(row.revenue)}</td>
                                                            <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{details.service.currency} {formatMoney(row.cost)}</td>
                                                            <td className={`px-3 py-2 text-right font-mono font-semibold ${row.margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                                {details.service.currency} {formatMoney(row.margin)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
                                                    <tr>
                                                        <td className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-100" colSpan={2}>Resumen total</td>
                                                        <td className="px-3 py-2 text-right font-semibold">{details.summary.payments_count}</td>
                                                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">{details.service.currency} {formatMoney(details.summary.total_revenue)}</td>
                                                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">{details.service.currency} {formatMoney(details.summary.total_cost)}</td>
                                                        <td className={`px-3 py-2 text-right font-mono font-semibold ${details.summary.total_margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                            {details.service.currency} {formatMoney(details.summary.total_margin)}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </>
                                )}

                                        <div className="mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedService(null)}
                                        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </ResponsiveLayout>
    );
}
