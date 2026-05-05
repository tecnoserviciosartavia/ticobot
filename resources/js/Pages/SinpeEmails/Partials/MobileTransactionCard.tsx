import { formatDateTime, formatAmount, labelForEmailStatus, classForEmailStatus } from '../utils';

interface SinpeEmailTransaction {
    id: number;
    reference: string | null;
    origin_phone: string | null;
    origin_name: string | null;
    motive: string | null;
    amount: string | number;
    performed_at: string | null;
    mail_subject: string | null;
    is_read: boolean;
    status: string;
    notes: string | null;
    client: { id: number; name: string } | null;
    contract: { id: number; name: string } | null;
    payment: { id: number; status: string } | null;
}

interface MobileTransactionCardProps {
    rows: SinpeEmailTransaction[];
    markAsRead: (tx: SinpeEmailTransaction) => void;
    openConciliate: (tx: SinpeEmailTransaction) => void;
    setDeleteTarget: (tx: SinpeEmailTransaction | null) => void;
}

export default function MobileTransactionCard({ rows, markAsRead, openConciliate, setDeleteTarget }: MobileTransactionCardProps) {
    return (
        <div className="space-y-3 p-4 md:hidden">
            {rows.length === 0 && (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    No hay transacciones para mostrar.
                </div>
            )}
            {rows.map((tx) => (
                <div
                    key={tx.id}
                    onClick={() => markAsRead(tx)}
                    className={`cursor-pointer rounded-lg border p-4 shadow-sm ${tx.is_read ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800' : 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20'}`}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-semibold">
                                <span className={`inline-block h-2.5 w-2.5 rounded-full ${tx.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-indigo-500'}`} />
                                <span className={tx.is_read ? 'text-gray-500 dark:text-gray-400' : 'text-indigo-700 dark:text-indigo-300'}>
                                    {tx.is_read ? 'Leído' : 'No leído'}
                                </span>
                            </div>
                            <div className={`mt-2 text-sm ${tx.is_read ? 'font-medium text-gray-900 dark:text-gray-100' : 'font-semibold text-gray-950 dark:text-white'}`}>
                                {tx.mail_subject || tx.origin_name || 'Correo SINPE'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(tx.performed_at)}</div>
                        </div>
                        <div className="text-right">
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{formatAmount(tx.amount)}</div>
                            <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classForEmailStatus(tx.status)}`}>
                                {labelForEmailStatus(tx.status)}
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                        <div>Origen: {tx.origin_name || '—'}{tx.origin_phone && tx.origin_phone !== '00000000' ? ` · ${tx.origin_phone}` : ''}</div>
                        <div>Motivo: {tx.motive || '—'}</div>
                        <div>Referencia: {tx.reference || '—'}</div>
                        <div>Cliente: {tx.client?.name || '—'}</div>
                        {tx.contract && <div>Contrato: {tx.contract.name}</div>}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {tx.status === 'skipped' && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openConciliate(tx);
                                }}
                                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                            >
                                Conciliar
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(tx);
                            }}
                            className="rounded-md border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                        >
                            Eliminar
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}