import { Card } from '@/Components/card';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import type { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';
import {
    BarChart3,
    Users,
    FileText,
    CreditCard,
    MessageSquare,
    Mail,
    CheckCircle,
    Activity,
    Calendar,
    TrendingUp,
} from '@/Components/icons';

type ReportsPageProps = PageProps<{
    snapshot: {
        clients_total: number;
        contracts_with_client: number;
        payments_verified_month_crc: number;
        payments_verified_month_usd: number;
        payments_unverified_open: number;
        reminders_sent_month: number;
    };
    generated_at: string;
}>;

type ReportTile = {
    title: string;
    description: string;
    href: string;
    icon: typeof BarChart3;
};

const destinations: ReportTile[] = [
    {
        title: 'Dashboard',
        description: 'KPIs, ingresos del período y actividad reciente.',
        href: 'dashboard',
        icon: BarChart3,
    },
    {
        title: 'Contabilidad — Resumen',
        description: 'Montos por estado de pago y conciliación del mes.',
        href: 'accounting.index',
        icon: TrendingUp,
    },
    {
        title: 'Indicadores',
        description: 'Rentabilidad por servicio y mes.',
        href: 'accounting.indicators',
        icon: BarChart3,
    },
    {
        title: 'Clientes',
        description: 'Listado y búsqueda de clientes.',
        href: 'clients.index',
        icon: Users,
    },
    {
        title: 'Contratos',
        description: 'Contratos activos, importación y montos.',
        href: 'contracts.index',
        icon: FileText,
    },
    {
        title: 'Pagos',
        description: 'Pagos registrados y conciliar desde cada fila.',
        href: 'payments.index',
        icon: CreditCard,
    },
    {
        title: 'Cobranzas',
        description: 'Vencidos, hoy y próximos cobros pendientes.',
        href: 'collections.index',
        icon: Calendar,
    },
    {
        title: 'Conciliaciones',
        description: 'Aprobar o rechazar conciliaciones bancarias.',
        href: 'conciliations.index',
        icon: CheckCircle,
    },
    {
        title: 'Correos SINPE',
        description: 'Notificaciones entrantes para conciliar.',
        href: 'sinpe-emails.index',
        icon: Mail,
    },
    {
        title: 'Recordatorios',
        description: 'Crear y seguir envíos automáticos.',
        href: 'reminders.index',
        icon: MessageSquare,
    },
    {
        title: 'Registros (logs)',
        description: 'Eventos del sistema para diagnóstico.',
        href: 'logs.index',
        icon: Activity,
    },
];

function formatMoneyCrs(amount: number) {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 2 }).format(
        amount,
    );
}

function formatMoneyUsd(amount: number) {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
        amount,
    );
}

export default function ReportsIndex({ snapshot, generated_at }: ReportsPageProps) {
    const s = snapshot ?? {
        clients_total: 0,
        contracts_with_client: 0,
        payments_verified_month_crc: 0,
        payments_verified_month_usd: 0,
        payments_unverified_open: 0,
        reminders_sent_month: 0,
    };

    return (
        <ResponsiveLayout title="Reportes" contentWidth="full">
            <Head title="Reportes" />

            <div className="w-full max-w-none min-w-0 py-6">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Reportes</h1>
                    <p className="mt-2 max-w-3xl text-gray-600">
                        Centro para métricas del mes y enlaces rápidos a cada módulo con datos exportables o tablas
                        detalladas. Resumen al {generated_at}.
                    </p>
                </div>

                <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                    <Card className="border-l-4 border-l-blue-500 p-4">
                        <div className="text-xs font-medium uppercase text-gray-500">Clientes</div>
                        <div className="mt-1 text-2xl font-bold text-gray-900">{s.clients_total}</div>
                    </Card>
                    <Card className="border-l-4 border-l-indigo-500 p-4">
                        <div className="text-xs font-medium uppercase text-gray-500">Contratos</div>
                        <div className="mt-1 text-2xl font-bold text-gray-900">{s.contracts_with_client}</div>
                    </Card>
                    <Card className="border-l-4 border-l-green-500 p-4 sm:col-span-2">
                        <div className="text-xs font-medium uppercase text-gray-500">Ingresos verificados (mes)</div>
                        <div className="mt-1 text-lg font-bold text-gray-900">{formatMoneyCrs(s.payments_verified_month_crc)}</div>
                        {s.payments_verified_month_usd > 0 && (
                            <div className="mt-0.5 text-sm text-gray-600">{formatMoneyUsd(s.payments_verified_month_usd)}</div>
                        )}
                    </Card>
                    <Card className="border-l-4 border-l-amber-500 p-4">
                        <div className="text-xs font-medium uppercase text-gray-500">Pagos no verificados</div>
                        <div className="mt-1 text-2xl font-bold text-gray-900">{s.payments_unverified_open}</div>
                    </Card>
                    <Card className="border-l-4 border-l-purple-500 p-4">
                        <div className="text-xs font-medium uppercase text-gray-500">Recordatorios enviados (mes)</div>
                        <div className="mt-1 text-2xl font-bold text-gray-900">{s.reminders_sent_month}</div>
                    </Card>
                </div>

                <h2 className="mb-4 text-lg font-semibold text-gray-900">Ir al detalle</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {destinations.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link key={item.href} href={route(item.href)}>
                                <Card className="h-full p-5 transition-shadow hover:shadow-md">
                                    <div className="flex gap-4">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium text-gray-900">{item.title}</div>
                                            <p className="mt-1 text-sm text-gray-500">{item.description}</p>
                                        </div>
                                    </div>
                                </Card>
                            </Link>
                        );
                    })}
                </div>

                <p className="mt-10 text-xs text-gray-400">
                    Para datos históricos por período use el Dashboard (selector 7 / 30 / 90 días) o exporte CSV desde ahí.
                </p>
            </div>
        </ResponsiveLayout>
    );
}
