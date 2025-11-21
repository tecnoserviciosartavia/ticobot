import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';

interface StatusCurrencyRow {
  currency: string;
  total_amount: number;
  total_count: number;
}

interface Props {
  by_status_currency: Record<string, StatusCurrencyRow[]>;
  totals: Record<string, { amount: number; count: number }>;
  total_months: number;
  daily: Array<{ date: string; verified_amount: number; pending_amount: number }>;
  conciliation_rate: number;
}

export default function AccountingIndex({ by_status_currency, totals, total_months, daily, conciliation_rate }: Props) {
  const formatMoney = (v: number) => v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const statusLabels: Record<string, string> = {
    verified: 'Conciliados',
    unverified: 'No verificados',
    in_review: 'En revisión',
    rejected: 'Rechazados',
  };

  return (
    <AuthenticatedLayout header={<h2 className="text-xl font-semibold leading-tight text-gray-800">Contabilidad</h2>}>
      <Head title="Contabilidad" />
      <div className="py-6">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 space-y-8">
          {/* Tarjetas resumen */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Monto conciliado" value={`CRC ${formatMoney(totals.verified?.amount || 0)}`} subtitle={`${totals.verified?.count || 0} pagos`} color="bg-green-50" />
            <SummaryCard title="Monto pendiente" value={`CRC ${formatMoney((totals.unverified?.amount || 0) + (totals.in_review?.amount || 0))}`} subtitle={`${(totals.unverified?.count || 0) + (totals.in_review?.count || 0)} pagos`} color="bg-yellow-50" />
            <SummaryCard title="Meses registrados" value={total_months.toString()} subtitle="Suma metadata 'months'" color="bg-indigo-50" />
            <SummaryCard title="% conciliado" value={`${conciliation_rate.toFixed(2)}%`} subtitle="(verificado / total proceso)" color="bg-blue-50" />
          </div>

          {/* Tabla por estado y moneda */}
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Montos agrupados por estado y moneda</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Estado</th>
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Moneda</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-600">Monto</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-600"># Pagos</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(by_status_currency).map(([status, rows]) => (
                    rows.map((r, idx) => (
                      <tr key={status + r.currency} className="border-b last:border-b-0">
                        {idx === 0 && (
                          <td rowSpan={rows.length} className="py-2 px-3 align-top font-medium text-gray-700">{statusLabels[status] || status}</td>
                        )}
                        <td className="py-2 px-3">{r.currency}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatMoney(r.total_amount)}</td>
                        <td className="py-2 px-3 text-right">{r.total_count}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tendencia últimos 7 días */}
            <div className="bg-white shadow rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Tendencia últimos 7 días</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1 px-2 text-left">Fecha</th>
                      <th className="py-1 px-2 text-right">Conciliado</th>
                      <th className="py-1 px-2 text-right">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map(d => (
                      <tr key={d.date} className="border-b last:border-b-0">
                        <td className="py-1 px-2">{d.date}</td>
                        <td className="py-1 px-2 text-right text-green-700 font-mono">{formatMoney(d.verified_amount)}</td>
                        <td className="py-1 px-2 text-right text-yellow-700 font-mono">{formatMoney(d.pending_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}

function SummaryCard({ title, value, subtitle, color }: { title: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className={`${color || 'bg-gray-50'} rounded-lg p-4 border border-gray-200 flex flex-col gap-1`}> 
      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{title}</div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}
