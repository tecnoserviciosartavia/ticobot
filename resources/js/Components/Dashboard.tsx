import React, { useState, useEffect } from 'react';
import { Head } from '@inertiajs/react';
import { Card } from './card';
import { Badge } from './badge';
import { Button } from './button';
import ResponsiveLayout from './ResponsiveLayout';
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
}

interface DashboardProps {
  stats: DashboardStats;
}

export default function Dashboard({ stats }: DashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [isLoading, setIsLoading] = useState(false);

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
    format?: 'number' | 'currency';
  }) => {
    const colorClasses: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-600 border-blue-200',
      green: 'bg-green-500/10 text-green-600 border-green-200',
      yellow: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
      red: 'bg-red-500/10 text-red-600 border-red-200',
    };

    const displayValue = format === 'currency' 
      ? formatCurrency(value)
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
                  onClick={() => setSelectedPeriod(period)}
                >
                  {period === '7d' && '7 días'}
                  {period === '30d' && '30 días'}
                  {period === '90d' && '90 días'}
                  {period === '1y' && '1 año'}
                </Button>
              ))}
            </div>
            
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Contratos Activos"
              value={stats.activeContracts}
              change={12.5}
              icon={Users}
              color="blue"
            />
            <StatCard
              title="Ingresos Totales"
              value={stats.totalRevenue}
              change={8.2}
              icon={DollarSign}
              color="green"
              format="currency"
            />
            <StatCard
              title="Pagos Pendientes"
              value={stats.pendingPayments}
              change={-3.1}
              icon={Clock}
              color="yellow"
            />
            <StatCard
              title="Tasa de Conversión"
              value={85.2}
              change={5.4}
              icon={TrendingUp}
              color="green"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Revenue Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Ingresos por Mes
              </h3>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <p className="text-gray-500">Gráfico de ingresos (implementar Chart.js)</p>
              </div>
            </Card>

            {/* Payment Status Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Estado de Pagos
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                    <span>Verificados</span>
                  </div>
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    {stats.paymentStats.verified}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 text-yellow-500 mr-2" />
                    <span>Pendientes</span>
                  </div>
                  <Badge variant="default" className="bg-yellow-100 text-yellow-800">
                    {stats.paymentStats.unverified}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                    <span>Fallidos</span>
                  </div>
                  <Badge variant="default" className="bg-red-100 text-red-800">
                    {stats.paymentStats.failed || 0}
                  </Badge>
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
            <Card className="p-4 border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors cursor-pointer">
              <div className="text-center">
                <Users className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Nuevo Cliente</h4>
                <p className="text-sm text-gray-500 mt-1">Agregar un nuevo cliente</p>
              </div>
            </Card>
            
            <Card className="p-4 border-dashed border-2 border-gray-300 hover:border-green-400 transition-colors cursor-pointer">
              <div className="text-center">
                <DollarSign className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Registrar Pago</h4>
                <p className="text-sm text-gray-500 mt-1">Añadir pago manual</p>
              </div>
            </Card>
            
            <Card className="p-4 border-dashed border-2 border-gray-300 hover:border-purple-400 transition-colors cursor-pointer">
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
