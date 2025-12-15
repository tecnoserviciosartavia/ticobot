import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';

interface StatusCurrencyRow {
  currency: string;
  total_amount: number;
  total_count: number;
}

interface MonthlyPending {
  month: string;
  contracts_total: Record<string, number>;
  paid_total: Record<string, number>;
  pending_total: Record<string, number>;
}

interface Props {
  by_status_currency: Record<string, StatusCurrencyRow[]>;
  totals: Record<string, { amount: number; count: number }>;
  total_months: number;
  daily: Array<{ date: string; verified_amount: number; pending_amount: number }>;
  conciliation_rate: number;
  monthly_pending: MonthlyPending[];
  clients_unpaid_after_reminder?: Array<{
    id: number;
    name: string;
    email?: string;
    phone?: string;
    sent_reminders_count: number;
    last_sent_at?: string | null;
    last_reminder_id?: number | null;
    last_reminder_status?: string | null;
    contracts: Array<{ id: number; name: string }>;
    pending_by_currency?: Record<string, number>;
  }>;
  clients_unpaid_total?: Record<string, number>;
}

export default function AccountingIndex({ by_status_currency, totals, total_months, daily, conciliation_rate, monthly_pending, clients_unpaid_after_reminder, clients_unpaid_total }: Props) {
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
          {/* Tarjetas resumen - Mes actual */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Monto conciliado" value={`CRC ${formatMoney(totals.verified?.amount || 0)}`} subtitle={`${totals.verified?.count || 0} pagos (mes actual)`} color="bg-green-50" />
            <SummaryCard title="Monto pendiente" value={`CRC ${formatMoney((totals.unverified?.amount || 0) + (totals.in_review?.amount || 0))}`} subtitle={`${(totals.unverified?.count || 0) + (totals.in_review?.count || 0)} pagos (mes actual)`} color="bg-yellow-50" />
            <SummaryCard title="Meses registrados" value={total_months.toString()} subtitle={`Mes actual (metadata 'months')`} color="bg-indigo-50" />
            <SummaryCard title="% conciliado" value={`${conciliation_rate.toFixed(2)}%`} subtitle="(verificado / total contratos activos)" color="bg-blue-50" />
          </div>

          {/* Tabla por estado y moneda */}
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Montos agrupados por estado y moneda (mes actual)</h3>
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

          {/* Clientes con recordatorios enviados pero sin pagos verificados */}
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Clientes con recordatorios enviados y sin pago conciliado</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Cliente</th>
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Contacto</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-600">Recordatorios enviados</th>
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Último recordatorio</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-600">Monto pendiente</th>
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Contratos</th>
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(clients_unpaid_after_reminder || []).map(c => {
                    // compute a simple string for pending amounts (list currencies)
                    const pending = c.pending_by_currency || {};
                    const pendingStr = Object.keys(pending).length
                      ? Object.entries(pending).map(([cur, amt]) => `${cur} ${formatMoney(amt)}`).join(' / ')
                      : '-';

                    const sendNow = (e: React.MouseEvent) => {
                      e.preventDefault();
                      const contractId = c.contracts[0]?.id ?? '';
                      if (!contractId) {
                        // fallback: open create page if no contract
                        window.location.href = route('reminders.create') + `?client_id=${c.id}`;
                        return;
                      }

                      router.post(route('reminders.store'), {
                        client_id: c.id,
                        contract_id: contractId,
                        channel: 'whatsapp',
                        scheduled_for: new Date().toISOString(),
                      });
                    };

                    const lastReminderId = c.last_reminder_id;

                    const retry = async (e: React.MouseEvent) => {
                      e.preventDefault();
                      if (!lastReminderId) {
                        // no reminder to retry, redirect to create
                        window.location.href = route('reminders.create') + `?client_id=${c.id}`;
                        return;
                      }

                      router.patch(route('api.reminders.update', lastReminderId), {
                        status: 'pending',
                        queued_at: null,
                      }, {
                        onSuccess: () => {
                          router.reload();
                        },
                        onError: (err: any) => {
                          // basic fallback: reload to show potential server error
                          router.reload();
                        }
                      });
                    };

                    return (
                      <tr key={c.id} className="border-b last:border-b-0 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-indigo-700">{c.name}</td>
                        <td className="py-2 px-3 text-sm text-gray-600">{c.phone}{c.email ? ` — ${c.email}` : ''}</td>
                        <td className="py-2 px-3 text-right font-mono">{c.sent_reminders_count}</td>
                        <td className="py-2 px-3 text-sm">{c.last_sent_at || '-'}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-700">{pendingStr}</td>
                        <td className="py-2 px-3 text-sm">{c.contracts.map(ct => ct.name).join(', ')}</td>
                        <td className="py-2 px-3 text-sm">
                          <button onClick={sendNow} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700">Enviar recordatorio</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="py-2 px-3 text-right font-semibold">Total</td>
                    <td className="py-2 px-3 text-right font-mono text-red-700">
                      {(clients_unpaid_total && Object.keys(clients_unpaid_total).length)
                        ? Object.entries(clients_unpaid_total).map(([cur, amt]) => `${cur} ${formatMoney(amt)}`).join(' / ')
                        : '-'}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
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

          {/* Pendiente mensual: Total contratos - Total pagado del mes */}
          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Análisis mensual (Contratos activos vs Pagos del mes)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 px-3 text-left font-semibold text-gray-600">Mes</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-600">Contratos Activos</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-600">Pagado (mes)</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-600">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly_pending.map(m => {
                    const currencies = Object.keys({ ...m.contracts_total, ...m.paid_total, ...m.pending_total });
                    return currencies.map((currency, idx) => (
                      <tr key={m.month + currency} className="border-b last:border-b-0 hover:bg-gray-50">
                        {idx === 0 && (
                          <td rowSpan={currencies.length} className="py-2 px-3 align-top font-medium text-gray-700">{m.month}</td>
                        )}
                        <td className="py-2 px-3 text-right font-mono text-blue-700">
                          {currency} {formatMoney(m.contracts_total[currency] || 0)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-green-700">
                          {currency} {formatMoney(m.paid_total[currency] || 0)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-orange-700">
                          {currency} {formatMoney(m.pending_total[currency] || 0)}
                        </td>
                      </tr>
                    ));
                  })}
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
