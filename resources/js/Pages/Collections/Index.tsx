import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router } from '@inertiajs/react';
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

  const all = useMemo(() => {
    if (!data) return [] as Array<{ bucket: string; row: Row }>;
    return [
      ...data.overdue.map((row) => ({ bucket: 'Vencidos', row })),
      ...data.due_today.map((row) => ({ bucket: 'Vence hoy', row })),
      ...data.due_soon.map((row) => ({ bucket: `Próximos ${data.window_days} días`, row })),
    ];
  }, [data]);

  return (
    <AuthenticatedLayout header={<h2 className="text-xl font-semibold leading-tight text-gray-800">Cobranzas</h2>}>
      <Head title="Cobranzas" />

      <div className="py-6">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 space-y-6">
          <div className="bg-white shadow rounded-lg p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm text-gray-500">Regla: solo es deuda si NO existe pago registrado.</div>
                {data && <div className="text-xs text-gray-400">Corte: {data.as_of}</div>}
              </div>
              <div className="flex items-end gap-2">
                <label className="text-sm text-gray-600">Ventana próximos días</label>
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value || 0))}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => fetchOverview(days)}
                  className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
                >
                  Refrescar
                </button>
              </div>
            </div>

            {error && <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {data && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatCard title="Vencidos" value={data.totals.overdue} color="text-red-700" />
                <StatCard title="Vence hoy" value={data.totals.due_today} color="text-orange-700" />
                <StatCard title="Próximos" value={data.totals.due_soon} color="text-yellow-700" />
              </div>
            )}
          </div>

          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="border-b px-4 py-3">
              <div className="font-medium text-gray-900">Clientes por cobrar</div>
              <div className="text-sm text-gray-500">Ordenado por bucket (vencidos/hoy/próximos). Luego puedes filtrar y automatizar envíos.</div>
            </div>

            {loading ? (
              <div className="p-4 text-sm text-gray-600">Cargando…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b">
                      <th className="py-2 px-3 text-left">Bucket</th>
                      <th className="py-2 px-3 text-left">Cliente</th>
                      <th className="py-2 px-3 text-left">Contacto</th>
                      <th className="py-2 px-3 text-left">Contrato</th>
                      <th className="py-2 px-3 text-left">Vence</th>
                      <th className="py-2 px-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 px-3 text-center text-gray-500">No hay deudas según la regla actual.</td>
                      </tr>
                    ) : (
                      all.map(({ bucket, row }) => (
                        <tr key={`${bucket}-${row.contract.id}`} className="border-b last:border-b-0">
                          <td className="py-2 px-3 whitespace-nowrap">{bucket}</td>
                          <td className="py-2 px-3">{row.client?.name || '—'}</td>
                          <td className="py-2 px-3 font-mono text-xs">
                            {row.client?.phone || row.client?.email || '—'}
                          </td>
                          <td className="py-2 px-3">{row.contract.name || `#${row.contract.id}`}</td>
                          <td className="py-2 px-3 whitespace-nowrap">{row.contract.next_due_date || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono">{fmtMoney(row.contract.amount, row.contract.currency)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className={`mt-1 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
