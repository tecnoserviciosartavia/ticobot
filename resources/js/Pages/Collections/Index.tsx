import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Head, router } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';

type Row = {
  contract: {
    id: number;
    name: string;
    amount: number;
    currency: string;
    next_due_date: string | null;
  };
  client: {
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  has_payment_registered: boolean;
};

type ApiResponse = {
  success: boolean;
  window_days: number;
  as_of: string;
  totals: { overdue: number; due_today: number; due_soon: number };
  overdue: Row[];
  due_today: Row[];
  due_soon: Row[];
};

export default function CollectionsIndex() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingContractId, setSendingContractId] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchOverview = async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/web-api/collections/overview?days=${encodeURIComponent(String(d))}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        setError(`No se pudo cargar cobranzas (HTTP ${res.status}). ${raw ? raw.slice(0, 200) : ''}`);
        setData(null);
        return;
      }
      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        setError('La API respondió sin éxito.');
        setData(null);
        return;
      }
      setData(json);
    } catch (e: any) {
      setError('Error de red cargando cobranzas.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview(days);
  }, [days]);

  const fmtMoney = (amount: number, currency: string) => {
    if (currency === 'USD') return `$${amount.toFixed(2)}`;
    return `₡${Number(amount || 0).toLocaleString('es-CR')}`;
  };

  const sendPaymentNotice = async (row: Row) => {
    const clientName = row.client?.name || 'este cliente';
    if (!window.confirm(`¿Enviar manualmente el aviso de pago pendiente a ${clientName}?`)) return;

    setSendingContractId(row.contract.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await axios.post(`/web-api/collections/${row.contract.id}/send-payment-notice`);
      setSuccess(response.data?.message || 'Aviso enviado manualmente por WhatsApp.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo enviar el aviso de pago.');
    } finally {
      setSendingContractId(null);
    }
  };

  const all = useMemo(() => {
    if (!data) return [] as Array<{ bucket: string; row: Row }>;
    return [
      ...data.overdue.map((row) => ({ bucket: 'Vencidos', row })),
      ...data.due_today.map((row) => ({ bucket: 'Vence hoy', row })),
      ...data.due_soon.map((row) => ({ bucket: `Próximos ${data.window_days} días`, row })),
    ];
  }, [data]);

  return (
    <ResponsiveLayout title="Cobranzas">
      <Head title="Cobranzas" />
      <div>
        <div className="py-6">
          <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800 dark:shadow-gray-900/50">
            <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-700">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Clientes por cobrar</div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Solo cuenta como deuda si no hay pago registrado en el mes del vencimiento (misma regla que antes).
                    {data && (
                      <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Corte: {data.as_of}
                        {' · '}
                        <span className="text-gray-600 dark:text-gray-300">
                          Vencidos {data.totals.overdue} · Hoy {data.totals.due_today} · Próx. {data.window_days}d {data.totals.due_soon}
                        </span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ventana próximos días</label>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value || 0))}
                      className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchOverview(days)}
                    className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                  >
                    Refrescar
                  </button>
                </div>
              </div>

              {error && (
                <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-3 rounded bg-cyan-50 p-3 text-sm text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300">
                  {success}
                </div>
              )}
            </div>

            {loading ? (
              <div className="p-4 text-sm text-gray-600 dark:text-gray-300">Cargando…</div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {all.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No hay deudas según la regla actual.</div>
                  ) : (
                    all.map(({ bucket, row }) => (
                      <div key={`${bucket}-${row.contract.id}`} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{bucket}</div>
                            <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">{row.client?.name || '—'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{row.client?.phone || row.client?.email || '—'}</div>
                          </div>
                          <div className="text-right font-mono font-semibold text-gray-900 dark:text-gray-100">{fmtMoney(row.contract.amount, row.contract.currency)}</div>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                          <div>Contrato: {row.contract.name || `#${row.contract.id}`}</div>
                          <div>Vence: {row.contract.next_due_date || '—'}</div>
                        </div>
                        <button
                          type="button"
                          disabled={!row.client?.phone || sendingContractId === row.contract.id}
                          onClick={() => sendPaymentNotice(row)}
                          className="mt-4 w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {sendingContractId === row.contract.id ? 'Enviando…' : 'Enviar aviso de pago'}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-sm text-gray-700 dark:text-gray-300">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 text-left">Bucket</th>
                        <th className="px-3 py-2 text-left">Cliente</th>
                        <th className="px-3 py-2 text-left">Contacto</th>
                        <th className="px-3 py-2 text-left">Contrato</th>
                        <th className="px-3 py-2 text-left">Vence</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {all.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">No hay deudas según la regla actual.</td>
                        </tr>
                      ) : (
                        all.map(({ bucket, row }) => (
                          <tr key={`${bucket}-${row.contract.id}`} className="last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                            <td className="whitespace-nowrap px-3 py-2">{bucket}</td>
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.client?.name || '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {row.client?.phone || row.client?.email || '—'}
                            </td>
                            <td className="px-3 py-2">{row.contract.name || `#${row.contract.id}`}</td>
                            <td className="whitespace-nowrap px-3 py-2">{row.contract.next_due_date || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{fmtMoney(row.contract.amount, row.contract.currency)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={!row.client?.phone || sendingContractId === row.contract.id}
                                onClick={() => sendPaymentNotice(row)}
                                title={!row.client?.phone ? 'El cliente no tiene teléfono registrado' : undefined}
                                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {sendingContractId === row.contract.id ? 'Enviando…' : 'Enviar aviso'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>
    </ResponsiveLayout>
  );
}

