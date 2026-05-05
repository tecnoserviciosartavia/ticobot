import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
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
    revenueByMonth: stats?.revenueByMonth || []
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
