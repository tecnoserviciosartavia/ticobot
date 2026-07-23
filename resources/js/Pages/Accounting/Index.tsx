import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, Link, router } from '@inertiajs/react';
import { DollarSign, TrendingUp, TrendingDown, Calendar, ArrowLeft, BarChart3, PieChart, Activity } from '@/Components/icons';

interface StatusCurrencyRow {
  currency: string;
  total_amount: number;
  total_count: number;
}
  const formatMoney = (v: number) => v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface MonthlyPending {
  month: string;
  contracts_total: Record<string, number>;
  paid_total: Record<string, number>;
  pending_total: Record<string, number>;
  net_by_currency?: Record<string, number>;
}

interface Props {
  by_status_currency: Record<string, StatusCurrencyRow[]>;
  totals: Record<string, { amount: number; count: number }>;
  active_contracts_total: number;
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

export default function AccountingIndex({ 
  by_status_currency = {}, 
  totals = {}, 
  active_contracts_total = 0, 
  total_months = 0, 
  daily = [], 
  conciliation_rate = 0, 
  monthly_pending = [], 
  clients_unpaid_after_reminder = [], 
  clients_unpaid_total = {} 
}: Props) {
  const formatMoney = (v: number) => v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const conciliatedAmount = totals.verified?.amount || 0;
  const pendingFromContracts = Math.max(0, active_contracts_total - conciliatedAmount);

  const statusLabels: Record<string, string> = {
    verified: 'Conciliados',
    unverified: 'No verificados',
    in_review: 'En revisión',
    rejected: 'Rechazados',
  };

  return (
    <ResponsiveLayout title="Contabilidad" contentWidth="full">
      <Head title="Contabilidad" />

      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Contabilidad</h1>
                <p className="mt-2 text-gray-600">
                  Análisis financiero y conciliación de pagos del sistema.
                </p>
              </div>
              <div className="flex gap-3">
                <Link href={route('dashboard')}>
                  <Button type="button" variant="outline">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-8">
          {/* Tarjetas resumen - Mes actual */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Monto conciliado" value={`CRC ${formatMoney(conciliatedAmount)}`} subtitle={`${totals.verified?.count || 0} pagos conciliados (mes actual)`} color="bg-green-50 dark:bg-green-900/20" />
            <SummaryCard title="Monto pendiente" value={`CRC ${formatMoney(pendingFromContracts)}`} subtitle="(total contratos activos - monto conciliado)" color="bg-yellow-50 dark:bg-yellow-900/20" />
            <SummaryCard title="Meses registrados" value={total_months.toString()} subtitle={`Mes actual (metadata 'months')`} color="bg-indigo-50 dark:bg-indigo-900/20" />
            <SummaryCard title="% conciliado" value={`${conciliation_rate.toFixed(2)}%`} subtitle="(monto conciliado / total contratos activos)" color="bg-blue-50 dark:bg-blue-900/20" />
          </div>

          {/* Tabla por estado y moneda */}
          <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800 dark:shadow-gray-900/50">
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Montos agrupados por estado y moneda (mes actual)</h3>
            <div className="space-y-3 md:hidden">
              {Object.entries(by_status_currency).map(([status, rows]) => (
                <div key={status} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{statusLabels[status] || status}</div>
                  <div className="mt-3 space-y-2">
                    {rows.map((row) => (
                      <div key={status + row.currency} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-700/50">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">{row.currency}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{row.total_count} pago(s)</div>
                        </div>
                        <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">{formatMoney(row.total_amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm text-gray-700 dark:text-gray-300">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Estado</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Moneda</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300">Monto</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300"># Pagos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(by_status_currency).map(([status, rows]) => (
                    rows.map((r, idx) => (
                      <tr key={status + r.currency} className="last:border-b-0">
                        {idx === 0 && (
                          <td rowSpan={rows.length} className="px-3 py-2 align-top font-medium text-gray-700 dark:text-gray-200">{statusLabels[status] || status}</td>
                        )}
                        <td className="px-3 py-2">{r.currency}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{formatMoney(r.total_amount)}</td>
                        <td className="px-3 py-2 text-right">{r.total_count}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recordatorio enviado y sin pago verificado */}
          <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800 dark:shadow-gray-900/50">
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Recordatorio enviado y sin pago verificado</h3>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Clientes con al menos un recordatorio enviado durante el período, y sin pagos con estado &quot;verified&quot; en el mismo período.
            </p>
            <div className="space-y-3 md:hidden">
              {(clients_unpaid_after_reminder || []).map(c => (
                <div key={c.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-indigo-700 dark:text-indigo-300">{c.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{c.phone}{c.email ? ` — ${c.email}` : ''}</div>
                    </div>
                    <div className="rounded-md bg-gray-50 px-3 py-2 text-center dark:bg-gray-700/50">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Recordatorios</div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{c.sent_reminders_count ?? 0}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">Último recordatorio: {c.last_sent_at || '-'}</div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">Contratos: {c.contracts.map(ct => ct.name).join(', ') || '—'}</div>
                  <div className="mt-4">
                    <button onClick={(e) => {
                      e.preventDefault();
                      if (!c.id) {
                        alert('Este comprobante no está asociado a un cliente. Primero crea el cliente en el dashboard y luego asigna el pago.');
                        return;
                      }
                      window.location.href = route('clients.show', c.id);
                    }} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Ver cliente</button>
                  </div>
                </div>
              ))}
              <div className="text-right text-xs text-gray-500 dark:text-gray-400">Total clientes: {(clients_unpaid_after_reminder || []).length}</div>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm text-gray-700 dark:text-gray-300">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Cliente</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Contacto</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300">Recordatorios</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Último recordatorio</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Contratos</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(clients_unpaid_after_reminder || []).map(c => {
                    const sendNow = (e: React.MouseEvent) => {
                      e.preventDefault();
                      if (!c.id) {
                        alert('Este comprobante no está asociado a un cliente. Primero crea el cliente en el dashboard y luego asigna el pago.');
                        return;
                      }
                      window.location.href = route('clients.show', c.id);
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
                      <tr key={c.id} className="last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="px-3 py-2 font-medium text-indigo-700 dark:text-indigo-300">{c.name}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{c.phone}{c.email ? ` — ${c.email}` : ''}</td>
                          <td className="px-3 py-2 text-right font-mono">{c.sent_reminders_count ?? 0}</td>
                        <td className="px-3 py-2 text-sm">{c.last_sent_at || '-'}</td>
                        <td className="px-3 py-2 text-sm">{c.contracts.map(ct => ct.name).join(', ')}</td>
                        <td className="px-3 py-2 text-sm">
                          <button onClick={sendNow} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700">Ver cliente</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">
                      Total clientes: {(clients_unpaid_after_reminder || []).length}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>


          {/* Tendencia últimos 7 días */}
            <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800 dark:shadow-gray-900/50">
              <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Tendencia últimos 7 días</h3>
              <div className="space-y-2 md:hidden">
                {daily.map(d => (
                  <div key={d.date} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-sm dark:border-gray-700">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{d.date}</div>
                    <div className="text-right">
                      <div className="font-mono text-green-700">{formatMoney(d.verified_amount)}</div>
                      <div className="font-mono text-yellow-700">{formatMoney(d.pending_amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-xs text-gray-700 dark:text-gray-300">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-2 py-1 text-left">Fecha</th>
                      <th className="px-2 py-1 text-right">Conciliado</th>
                      <th className="px-2 py-1 text-right">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {daily.map(d => (
                      <tr key={d.date} className="last:border-b-0">
                        <td className="px-2 py-1">{d.date}</td>
                        <td className="px-2 py-1 text-right font-mono text-green-700">{formatMoney(d.verified_amount)}</td>
                        <td className="px-2 py-1 text-right font-mono text-yellow-700">{formatMoney(d.pending_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          {/* Pendiente mensual: Total contratos - Total pagado del mes */}
          <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800 dark:shadow-gray-900/50">
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Análisis mensual (Contratos activos vs Pagos del mes)</h3>
            <div className="space-y-3 md:hidden">
              {monthly_pending.map(m => {
                const currencies = Object.keys({ ...m.contracts_total, ...m.paid_total, ...m.pending_total });
                return (
                  <div key={m.month} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{m.month}</div>
                    <div className="mt-3 space-y-2">
                      {currencies.map((currency) => (
                        <div key={m.month + currency} className="rounded-md bg-gray-50 px-3 py-3 text-xs dark:bg-gray-700/50">
                          <div className="mb-2 font-semibold text-gray-900 dark:text-gray-100">{currency}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-gray-500 dark:text-gray-400">Contratos</div>
                              <div className="font-mono text-blue-700">{formatMoney(m.contracts_total[currency] || 0)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400">Pagado</div>
                              <div className="font-mono text-green-700">{formatMoney(m.paid_total[currency] || 0)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400">Diferencia</div>
                              <div className="font-mono font-semibold text-orange-700">{formatMoney(m.pending_total[currency] || 0)}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 dark:text-gray-400">Ganancia</div>
                              <div className="font-mono font-semibold text-green-700">{formatMoney((m.net_by_currency && m.net_by_currency[currency]) || 0)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-xs text-gray-700 dark:text-gray-300">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Mes</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300">Contratos Activos</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300">Pagado (mes)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300">Diferencia</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300">Ganancia real</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {monthly_pending.map(m => {
                    const currencies = Object.keys({ ...m.contracts_total, ...m.paid_total, ...m.pending_total });
                    return currencies.map((currency, idx) => (
                      <tr key={m.month + currency} className="last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        {idx === 0 && (
                          <td rowSpan={currencies.length} className="px-3 py-2 align-top font-medium text-gray-700 dark:text-gray-200">{m.month}</td>
                        )}
                        <td className="px-3 py-2 text-right font-mono text-blue-700">
                          {currency} {formatMoney(m.contracts_total[currency] || 0)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-green-700">
                          {currency} {formatMoney(m.paid_total[currency] || 0)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-orange-700">
                          {currency} {formatMoney(m.pending_total[currency] || 0)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-green-700">
                          {currency} {formatMoney((m.net_by_currency && m.net_by_currency[currency]) || 0)}
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
      </div>
    </ResponsiveLayout>
  );
}

function SummaryCard({ title, value, subtitle, color }: { title: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className={`${color || 'bg-gray-50 dark:bg-gray-700/50'} flex flex-col gap-1 rounded-lg border border-gray-200 p-3 sm:p-4 dark:border-gray-700`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
      <div className="text-lg font-bold leading-tight text-gray-800 dark:text-gray-100 sm:text-xl">{value}</div>
      {subtitle && <div className="text-[11px] leading-4 text-gray-500 dark:text-gray-400 sm:text-xs">{subtitle}</div>}
    </div>
  );
}
