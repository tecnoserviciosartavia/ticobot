import React, { useState, useEffect } from 'react';
import { Head, router, Link } from '@inertiajs/react';
import { Card } from './card';
import { Badge } from './badge';
import { Button } from './button';
import ResponsiveLayout from '../../Components/ResponsiveLayout';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from './icons';

interface DashboardStats {
  totalContracts: number;
  activeContracts: number;
  totalRevenue: number;
  pendingPayments: number;
  conversionRate: number;
  recentActivity: Array<{
    id: number;
    type: string;
    description: string;
    created_at: string;
  }>;
  paymentStats: {
    verified: number;
    unverified: number;
    total: number;
    failed: number;
  };
  reminderStats: {
    sent: number;
    pending: number;
    failed: number;
  };
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    contracts: number;
  }>;
  period?: string;
  changes?: {
    contracts: number;
    activeContracts: number;
    revenue: number;
    pendingPayments: number;
    conversionRate: number;
  };
  recentSentReminders?: Array<{
    id: number;
    client_name: string | null;
    client_phone: string | null;
    contract_name: string | null;
    channel: string | null;
    sent_at: string | null;
  }>;
  upcomingCollections?: {
    as_of: string;
    window_days: number;
    overdue: { count: number; by_currency: Record<string, number> };
    due_today: { count: number; by_currency: Record<string, number> };
    due_soon: { count: number; by_currency: Record<string, number> };
    total_by_currency: Record<string, number>;
  };
}

interface DashboardProps {
  stats: DashboardStats;
}

export default function Dashboard({ stats }: DashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState(stats?.period || '30d');
  const [isLoading, setIsLoading] = useState(false);

  // Handle period change
  const handlePeriodChange = (period: string) => {
    if (period === selectedPeriod) return; // Don't request if same period
    
    setIsLoading(true);
    setSelectedPeriod(period);
    
    // Make request to backend with new period
    router.get('/dashboard', { period }, {
      preserveState: true,
      onFinish: () => setIsLoading(false),
    });
  };

  // Handle export functionality
  const handleExport = () => {
    // Create CSV data from current stats
    const csvData = [
      ['Métrica', 'Valor Actual', 'Cambio %'],
      ['Contratos Activos', stats.activeContracts?.toString() || '0', `${stats.changes?.activeContracts || 0}%`],
      ['Ingresos Totales', formatCurrency(stats.totalRevenue), `${stats.changes?.revenue || 0}%`],
      ['Pagos Pendientes', stats.pendingPayments?.toString() || '0', `${stats.changes?.pendingPayments || 0}%`],
      ['Tasa de Conversión', `${stats.conversionRate || 0}%`, `${stats.changes?.conversionRate || 0}%`],
      ['Pagos Verificados', stats.paymentStats?.verified?.toString() || '0', ''],
      ['Pagos No Verificados', stats.paymentStats?.unverified?.toString() || '0', ''],
      ['Recordatorios Enviados', stats.reminderStats?.sent?.toString() || '0', ''],
      ['Recordatorios Pendientes', stats.reminderStats?.pending?.toString() || '0', ''],
    ];

    // Convert to CSV string
    const csvString = csvData.map(row => row.join(',')).join('\n');
    
    // Create blob and download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dashboard_${selectedPeriod}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle missing stats data
  const safeStats = {
    totalContracts: stats?.totalContracts || 0,
    activeContracts: stats?.activeContracts || 0,
    totalRevenue: stats?.totalRevenue || 0,
    pendingPayments: stats?.pendingPayments || 0,
    recentActivity: stats?.recentActivity || [],
    paymentStats: stats?.paymentStats || { verified: 0, unverified: 0, total: 0, failed: 0 },
    reminderStats: stats?.reminderStats || { sent: 0, pending: 0, failed: 0 },
    revenueByMonth: stats?.revenueByMonth || [],
    recentSentReminders: stats?.recentSentReminders ?? [],
    upcomingCollections: stats?.upcomingCollections,
  };

  const formatCurrency = (amount: number, currency = 'CRC') => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'CRC',
    }).format(amount);
  };

  const getChangePercentage = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const formatBucketMoney = (byCurrency: Record<string, number>) => {
    const entries = Object.entries(byCurrency);
    if (entries.length === 0) {
      return '—';
    }
    return entries
      .map(([cur, amt]) => formatCurrency(amt, cur === 'USD' ? 'USD' : 'CRC'))
      .join(' · ');
  };

  const StatCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    color = 'blue',
    format = 'number'
  }: {
    title: string;
    value: number;
    change?: number;
    icon: any;
    color?: string;
    format?: 'number' | 'currency' | 'percentage';
  }) => {
    const colorClasses: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-600 border-blue-200',
      green: 'bg-green-500/10 text-green-600 border-green-200',
      yellow: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
      red: 'bg-red-500/10 text-red-600 border-red-200',
    };

    const displayValue = format === 'currency' 
      ? formatCurrency(value)
      : format === 'percentage'
      ? `${value}%`
      : value.toLocaleString();

    return (
      <Card className={`p-6 border-2 ${colorClasses[color]}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{displayValue}</p>
            {change !== undefined && (
              <div className={`flex items-center mt-1 text-sm ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {change >= 0 ? (
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 mr-1" />
                )}
                {Math.abs(change).toFixed(1)}%
              </div>
            )}
          </div>
          <div className={`p-3 rounded-full ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </Card>
    );
  };

  return (
    <ResponsiveLayout title="Dashboard" user={{ name: 'Admin User' }}>
      <Head title="Dashboard" />
      
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-gray-600">Resumen general de tu negocio</p>
          </div>

          {/* Period Selector */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex space-x-2">
              {['7d', '30d', '90d', '1y'].map((period) => (
                <Button
                  key={period}
                  variant={selectedPeriod === period ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePeriodChange(period)}
                  disabled={isLoading}
                >
                  {period === '7d' && '7 días'}
                  {period === '30d' && '30 días'}
                  {period === '90d' && '90 días'}
                  {period === '1y' && '1 año'}
                </Button>
              ))}
            </div>
            
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Calendar className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Contratos Activos"
              value={stats.activeContracts}
              change={stats.changes?.activeContracts || 0}
              icon={Users}
              color="blue"
            />
            <StatCard
              title="Ingresos Totales"
              value={stats.totalRevenue}
              change={stats.changes?.revenue || 0}
              icon={DollarSign}
              color="green"
              format="currency"
            />
            <StatCard
              title="Pagos Pendientes"
              value={stats.pendingPayments}
              change={stats.changes?.pendingPayments || 0}
              icon={Clock}
              color="yellow"
            />
            <StatCard
              title="Tasa de Conversión"
              value={stats.conversionRate || 0}
              change={stats.changes?.conversionRate || 0}
              icon={TrendingUp}
              color="green"
              format="percentage"
            />
          </div>

          {/* Cobro: recordatorios enviados + montos pendientes */}
          <div className="grid grid-cols-1 gap-6 mb-8 lg:grid-cols-2">
            <Card className="p-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Recordatorios de cobro enviados</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Clientes a quienes ya se les envió el recordatorio (p. ej. WhatsApp) en el período seleccionado; suelen incluir la solicitud de comprobante.
                  </p>
                </div>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {safeStats.recentSentReminders.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay recordatorios enviados en este período.</p>
                ) : (
                  safeStats.recentSentReminders.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{row.client_name || '—'}</div>
                        <div className="truncate text-xs text-gray-500">
                          {row.contract_name ? `${row.contract_name} · ` : ''}
                          {row.client_phone || '—'}
                          {row.channel ? ` · ${row.channel}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-gray-500 sm:text-right">
                        {row.sent_at
                          ? new Date(row.sent_at).toLocaleString('es-CR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Montos por cobrar</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Contratos con vencimiento y sin pago registrado en el mes del vencimiento (misma lógica que Cobranzas). Incluye vencidos, hoy y próximos {safeStats.upcomingCollections?.window_days ?? 7} días.
                  </p>
                  {safeStats.upcomingCollections && (
                    <p className="mt-1 text-xs text-gray-400">Corte: {safeStats.upcomingCollections.as_of}</p>
                  )}
                </div>
                <Link
                  href="/collections"
                  className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Ir a Cobranzas →
                </Link>
              </div>
              {safeStats.upcomingCollections ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                      <div className="text-xs font-medium uppercase text-red-700">Vencidos</div>
                      <div className="mt-1 text-2xl font-bold text-gray-900">{safeStats.upcomingCollections.overdue.count}</div>
                      <div className="mt-1 text-xs text-gray-600">{formatBucketMoney(safeStats.upcomingCollections.overdue.by_currency)}</div>
                    </div>
                    <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3">
                      <div className="text-xs font-medium uppercase text-orange-800">Vence hoy</div>
                      <div className="mt-1 text-2xl font-bold text-gray-900">{safeStats.upcomingCollections.due_today.count}</div>
                      <div className="mt-1 text-xs text-gray-600">{formatBucketMoney(safeStats.upcomingCollections.due_today.by_currency)}</div>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                      <div className="text-xs font-medium uppercase text-amber-800">Próximos {safeStats.upcomingCollections.window_days}d</div>
                      <div className="mt-1 text-2xl font-bold text-gray-900">{safeStats.upcomingCollections.due_soon.count}</div>
                      <div className="mt-1 text-xs text-gray-600">{formatBucketMoney(safeStats.upcomingCollections.due_soon.by_currency)}</div>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="text-sm font-medium text-gray-700">Total por moneda (todos los buckets)</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.keys(safeStats.upcomingCollections.total_by_currency).length === 0 ? (
                        <span className="text-sm text-gray-500">Sin montos pendientes con la regla actual.</span>
                      ) : (
                        Object.entries(safeStats.upcomingCollections.total_by_currency).map(([cur, amt]) => (
                          <Badge key={cur} variant="outline" className="text-sm font-semibold">
                            {formatCurrency(amt, cur === 'USD' ? 'USD' : 'CRC')}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No se pudieron cargar los montos de cobranza.</p>
              )}
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Revenue Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Ingresos por Mes
              </h3>
              <div className="h-64">
                {stats.revenueByMonth && stats.revenueByMonth.length > 0 ? (
                  <div className="h-full flex items-end space-x-2">
                    {stats.revenueByMonth.map((month, index) => {
                      const maxRevenue = Math.max(...stats.revenueByMonth.map(m => m.revenue));
                      const height = maxRevenue > 0 ? (month.revenue / maxRevenue) * 100 : 0;
                      
                      return (
                        <div key={index} className="flex-1 flex flex-col items-center">
                          <div className="w-full flex flex-col items-center">
                            <span className="text-xs text-gray-600 mb-1">
                              {formatCurrency(month.revenue)}
                            </span>
                            <div 
                              className="w-full bg-blue-500 rounded-t transition-all duration-300 hover:bg-blue-600"
                              style={{ height: `${height}%`, minHeight: '4px' }}
                              title={`${month.month}: ${formatCurrency(month.revenue)}`}
                            />
                          </div>
                          <span className="text-xs text-gray-500 mt-2 text-center">
                            {month.month}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                    <p className="text-gray-500">Sin datos de ingresos para el período seleccionado</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Payment Status Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Estado de Pagos
              </h3>
              <div className="space-y-6">
                {/* Pie Chart */}
                <div className="flex justify-center">
                  <div className="relative w-32 h-32">
                    {stats.paymentStats.total > 0 ? (
                      <div className="w-32 h-32 rounded-full overflow-hidden flex relative">
                        <div 
                          className="bg-green-500"
                          style={{ 
                            width: `${(stats.paymentStats.verified / stats.paymentStats.total) * 100}%` 
                          }}
                          title={`Verificados: ${stats.paymentStats.verified}`}
                        />
                        <div 
                          className="bg-yellow-500"
                          style={{ 
                            width: `${(stats.paymentStats.unverified / stats.paymentStats.total) * 100}%` 
                          }}
                          title={`Pendientes: ${stats.paymentStats.unverified}`}
                        />
                        <div 
                          className="bg-red-500"
                          style={{ 
                            width: `${(stats.paymentStats.failed / stats.paymentStats.total) * 100}%` 
                          }}
                          title={`Fallidos: ${stats.paymentStats.failed || 0}`}
                        />
                      </div>
                    ) : (
                      <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-500 text-sm">Sin datos</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Legend */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                      <span className="text-sm">Verificados</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                        {stats.paymentStats.verified}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {stats.paymentStats.total > 0 
                          ? `${Math.round((stats.paymentStats.verified / stats.paymentStats.total) * 100)}%`
                          : '0%'
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2" />
                      <span className="text-sm">Pendientes</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="default" className="bg-yellow-100 text-yellow-800 text-xs">
                        {stats.paymentStats.unverified}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {stats.paymentStats.total > 0 
                          ? `${Math.round((stats.paymentStats.unverified / stats.paymentStats.total) * 100)}%`
                          : '0%'
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 rounded-full mr-2" />
                      <span className="text-sm">Fallidos</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="default" className="bg-red-100 text-red-800 text-xs">
                        {stats.paymentStats.failed || 0}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {stats.paymentStats.total > 0 
                          ? `${Math.round(((stats.paymentStats.failed || 0) / stats.paymentStats.total) * 100)}%`
                          : '0%'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Actividad Reciente
              </h3>
              <Button variant="outline" size="sm">
                Ver todos
              </Button>
            </div>
            
            <div className="space-y-4">
              {stats.recentActivity.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="flex items-center">
                    <Activity className="w-5 h-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {activity.description}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(activity.created_at).toLocaleString('es-CR')}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {activity.type}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card 
              className="p-4 border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors cursor-pointer hover:shadow-md"
              onClick={() => router.visit('/clients/create')}
            >
              <div className="text-center">
                <Users className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Nuevo Cliente</h4>
                <p className="text-sm text-gray-500 mt-1">Agregar un nuevo cliente</p>
              </div>
            </Card>
            
            <Card 
              className="p-4 border-dashed border-2 border-gray-300 hover:border-green-400 transition-colors cursor-pointer hover:shadow-md"
              onClick={() => router.visit('/payments/create')}
            >
              <div className="text-center">
                <DollarSign className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Registrar Pago</h4>
                <p className="text-sm text-gray-500 mt-1">Añadir pago manual</p>
              </div>
            </Card>
            
            <Card 
              className="p-4 border-dashed border-2 border-gray-300 hover:border-purple-400 transition-colors cursor-pointer hover:shadow-md"
              onClick={() => router.visit('/reminders/create')}
            >
              <div className="text-center">
                <Calendar className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Enviar Recordatorio</h4>
                <p className="text-sm text-gray-500 mt-1">Recordatorio masivo</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ResponsiveLayout>
  );
}
