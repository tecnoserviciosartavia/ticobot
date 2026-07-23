import Pagination from '@/Components/Pagination';
import FinanceNav from '@/Components/FinanceNav';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import { Button } from '@/Components/button';
import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, DollarSign, Send, Trash2, XCircle } from '@/Components/icons';

type Tab = 'overview' | 'payments' | 'collections';
type PageLink = { url: string | null; label: string; active: boolean };
type Paginated<T> = { data: T[]; links: PageLink[]; from?: number; to?: number; total?: number };
type Person = { id: number; name: string; phone?: string | null };
type Contract = { id: number; name: string; amount?: number; currency?: string };

type Payment = {
    id: number; status: string; channel: string; amount: number; currency: string;
    reference: string | null; paid_at: string | null; created_at: string | null;
    receipts_count: number; client: Person | null; contract: Contract | null;
    conciliation: { id: number; status: string } | null; needs_attention: boolean;
};

type CollectionRow = {
    contract: { id: number; name: string; amount: number; currency: string; next_due_date: string | null };
    client: Person | null;
};

type CollectionsResponse = {
    success: boolean; as_of: string; window_days: number;
    totals: { overdue: number; due_today: number; due_soon: number };
    overdue: CollectionRow[]; due_today: CollectionRow[]; due_soon: CollectionRow[];
};

interface Props {
    activeTab: Tab;
    periodLabel: string;
    summary: {
        contracted: number; verified: number; in_review: number; unverified: number;
        pending: number; rate: number; verified_count: number; review_count: number;
        due_this_month: number; due_verified: number; due_in_review: number; overdue: number; future: number;
    };
    dataQuality: { without_contract: number; without_client: number; zero_amount: number; without_paid_at: number };
    payments: Paginated<Payment>;
    filters: { status: string; search: string };
}

const money = (amount: number, currency = 'CRC') =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency: currency === 'USD' ? 'USD' : 'CRC' }).format(amount || 0);

const labels: Record<string, string> = {
    verified: 'Verificado', unverified: 'Sin verificar', in_review: 'En revisión',
    pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada',
};

function Status({ value }: { value: string }) {
    const color = value === 'verified' || value === 'approved'
        ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
        : value === 'rejected'
          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{labels[value] ?? value}</span>;
}

export default function FinanceIndex({ activeTab, periodLabel, summary, dataQuality, payments, filters }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [status, setStatus] = useState(filters.status ?? '');
    const [days, setDays] = useState(7);
    const [collections, setCollections] = useState<CollectionsResponse | null>(null);
    const [collectionsError, setCollectionsError] = useState<string | null>(null);
    const [sending, setSending] = useState<number | null>(null);

    const filterPayments = (event: FormEvent) => {
        event.preventDefault();
        router.get(route('finance.index'), { tab: 'payments', search, status }, { preserveState: true, replace: true });
    };

    useEffect(() => {
        if (activeTab !== 'collections') return;
        setCollectionsError(null);
        fetch(`/web-api/collections/overview?days=${days}`, { headers: { Accept: 'application/json' }, credentials: 'include' })
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(setCollections)
            .catch(() => setCollectionsError('No se pudo cargar la cartera de cobro.'));
    }, [activeTab, days]);

    const collectionRows = useMemo(() => {
        if (!collections) return [];
        return [
            ...collections.overdue.map((row) => ({ label: 'Vencido', row })),
            ...collections.due_today.map((row) => ({ label: 'Vence hoy', row })),
            ...collections.due_soon.map((row) => ({ label: `Próximos ${collections.window_days} días`, row })),
        ];
    }, [collections]);

    const sendNotice = async (item: CollectionRow) => {
        if (!confirm(`¿Enviar aviso de cobro a ${item.client?.name ?? 'este cliente'}?`)) return;
        setSending(item.contract.id);
        try {
            await axios.post(`/web-api/collections/${item.contract.id}/send-payment-notice`);
            alert('Aviso enviado por WhatsApp.');
        } catch (error: any) {
            alert(error?.response?.data?.message ?? 'No se pudo enviar el aviso.');
        } finally {
            setSending(null);
        }
    };

    const approvePayment = (payment: Payment) => {
        if (!confirm(`¿Aprobar el pago #${payment.id} de ${payment.client?.name ?? 'este cliente'}?`)) return;
        if (payment.conciliation) {
            router.patch(route('conciliations.update', payment.conciliation.id), {
                status: 'approved',
                verified_at: new Date().toISOString(),
            });
        } else {
            router.post(route('conciliations.store'), {
                payment_id: payment.id,
                status: 'approved',
                verified_at: new Date().toISOString(),
                contract_id: payment.contract?.id ?? null,
            });
        }
    };

    const rejectPayment = (payment: Payment) => {
        if (!confirm(`¿Rechazar el pago #${payment.id}?`)) return;
        if (payment.conciliation) {
            router.patch(route('conciliations.update', payment.conciliation.id), { status: 'rejected' });
        } else {
            router.post(route('conciliations.store'), {
                payment_id: payment.id,
                status: 'rejected',
                contract_id: payment.contract?.id ?? null,
            });
        }
    };

    return (
        <ResponsiveLayout title="Finanzas" contentWidth="full">
            <Head title="Finanzas" />
            <div className="space-y-5 py-5">
                <FinanceNav active={activeTab} periodLabel={periodLabel} />

                {activeTab === 'overview' && (
                    <div className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <Metric label="Cartera activa total" value={money(summary.contracted)} detail={`${money(summary.future)} vence después de este mes`} icon={DollarSign} />
                            <Metric label="Conciliado este mes" value={money(summary.verified)} detail={`${summary.verified_count} pagos`} icon={CheckCircle} tone="cyan" />
                            <Metric label="Por cobrar hasta fin de mes" value={money(summary.pending)} detail={`${money(summary.due_this_month)} vence · ${money(summary.due_in_review)} en revisión`} icon={Clock} tone="amber" />
                            <Metric label="Por revisar" value={money(summary.in_review + summary.unverified)} detail={`${summary.review_count} movimientos`} icon={AlertCircle} tone="rose" />
                        </div>
                        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
                                <div>
                                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">Registros que necesitan organización</h2>
                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">No se borraron datos. Estos movimientos quedan identificados para revisión.</p>
                                </div>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Quality label="Sin contrato" value={dataQuality.without_contract} />
                                <Quality label="Sin cliente" value={dataQuality.without_client} />
                                <Quality label="Monto cero" value={dataQuality.zero_amount} />
                                <Quality label="Sin fecha de pago" value={dataQuality.without_paid_at} />
                            </div>
                            <Link href={route('finance.index', { tab: 'payments' })} className="mt-4 inline-flex text-sm font-semibold text-amber-800 dark:text-amber-300">Revisar movimientos →</Link>
                        </section>
                    </div>
                )}

                {activeTab === 'payments' && (
                    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                        <form onSubmit={filterPayments} className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row dark:border-gray-700">
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente o referencia" className="min-w-0 flex-1 rounded-xl border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border-gray-300 dark:border-gray-600 dark:bg-gray-700">
                                <option value="">Todos los estados</option><option value="verified">Verificados</option><option value="in_review">En revisión</option><option value="unverified">Sin verificar</option><option value="rejected">Rechazados</option>
                            </select>
                            <Button type="submit">Filtrar</Button>
                        </form>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {payments.data.map((payment) => (
                                <article key={payment.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_150px_150px_auto] lg:items-center">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">#{payment.id} · {payment.client?.name ?? 'Sin cliente'}</span>
                                            <Status value={payment.status} />
                                            {payment.needs_attention && <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">Revisar datos</span>}
                                        </div>
                                        <p className="mt-1 truncate text-sm text-gray-500">{payment.contract?.name ?? 'Sin contrato'} · {payment.reference ?? 'Sin referencia'} · {payment.channel}</p>
                                    </div>
                                    <div className="font-mono font-semibold">{money(payment.amount, payment.currency)}</div>
                                    <div className="text-sm text-gray-500">{payment.paid_at ?? payment.created_at?.slice(0, 10) ?? 'Sin fecha'}</div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        {payment.status !== 'verified' && payment.status !== 'rejected' && <Button size="sm" onClick={() => approvePayment(payment)}><CheckCircle className="mr-1 h-4 w-4" />Aprobar</Button>}
                                        {payment.status !== 'verified' && payment.status !== 'rejected' && <Button size="sm" variant="outline" onClick={() => rejectPayment(payment)}><XCircle className="mr-1 h-4 w-4" />Rechazar</Button>}
                                        {!payment.conciliation && <Button size="sm" variant="outline" className="text-rose-600" onClick={() => confirm(`¿Eliminar el pago #${payment.id}?`) && router.delete(route('payments.destroy', payment.id))}><Trash2 className="mr-1 h-4 w-4" />Eliminar</Button>}
                                    </div>
                                </article>
                            ))}
                            {payments.data.length === 0 && <Empty text="No hay pagos con estos filtros." />}
                        </div>
                        <div className="border-t border-gray-200 p-4 dark:border-gray-700"><Pagination links={payments.links} /></div>
                    </section>
                )}

                {activeTab === 'collections' && (
                    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-end sm:justify-between dark:border-gray-700">
                            <div><h2 className="font-semibold">Cartera por cobrar</h2><p className="text-sm text-gray-500">Vencimientos sin pago registrado para el periodo.</p></div>
                            <label className="text-sm">Próximos días <input type="number" min={0} max={31} value={days} onChange={(e) => setDays(Number(e.target.value))} className="ml-2 w-20 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700" /></label>
                        </div>
                        {collectionsError ? <Empty text={collectionsError} /> : !collections ? <Empty text="Cargando cobranzas…" /> : (
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {collectionRows.map(({ label, row }) => (
                                    <article key={`${label}-${row.contract.id}`} className="grid gap-3 p-4 lg:grid-cols-[130px_minmax(0,1fr)_150px_150px] lg:items-center">
                                        <Status value={label === 'Vencido' ? 'rejected' : 'pending'} />
                                        <div><p className="font-semibold">{row.client?.name ?? 'Sin cliente'}</p><p className="text-sm text-gray-500">{row.contract.name} · vence {row.contract.next_due_date ?? '—'}</p></div>
                                        <span className="font-mono font-semibold">{money(row.contract.amount, row.contract.currency)}</span>
                                        <Button size="sm" disabled={!row.client?.phone || sending === row.contract.id} onClick={() => sendNotice(row)}><Send className="mr-1 h-4 w-4" />{sending === row.contract.id ? 'Enviando…' : 'Enviar aviso'}</Button>
                                    </article>
                                ))}
                                {collectionRows.length === 0 && <Empty text="No hay contratos por cobrar en esta ventana." />}
                            </div>
                        )}
                    </section>
                )}

            </div>
        </ResponsiveLayout>
    );
}

function Metric({ label, value, detail, icon: Icon, tone = 'blue' }: { label: string; value: string; detail?: string; icon: typeof DollarSign; tone?: string }) {
    const tones: Record<string, string> = { blue: 'bg-blue-100 text-blue-700', cyan: 'bg-cyan-100 text-cyan-700', amber: 'bg-amber-100 text-amber-700', rose: 'bg-rose-100 text-rose-700' };
    return <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p>{detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}</div>;
}

function Quality({ label, value }: { label: string; value: number }) {
    return <div className="rounded-xl bg-white/80 p-3 dark:bg-gray-800/70"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p></div>;
}

function Empty({ text }: { text: string }) {
    return <div className="p-10 text-center text-sm text-gray-500">{text}</div>;
}
