import StatusBadge from '@/Components/StatusBadge';
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

interface DesktopTransactionsTableProps {
    rows: SinpeEmailTransaction[];
    markAsRead: (tx: SinpeEmailTransaction) => void;
    openConciliate: (tx: SinpeEmailTransaction) => void;
    setDeleteTarget: (tx: SinpeEmailTransaction | null) => void;
}

export default function DesktopTransactionsTable({ rows, markAsRead, openConciliate, setDeleteTarget }: DesktopTransactionsTableProps) {
    return (
        <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Bandeja</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Fecha</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Origen</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Motivo</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">Monto</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Estado</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Cliente / Contrato</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Acción</th>
                        <th className="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                                No hay transacciones para mostrar.
                            </td>
                        </tr>
                    )}
                    {rows.map((tx) => (
                        <tr
                            key={tx.id}
                            onClick={() => markAsRead(tx)}
                            className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 ${tx.is_read ? 'bg-white dark:bg-gray-800' : 'bg-indigo-50/40 dark:bg-indigo-950/20'}`}
                        >
                            <td className="px-4 py-3 align-top">
                                <div className="flex min-w-[120px] items-center gap-2">
                                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${tx.is_read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-indigo-500'}`} />
                                    <span className={`text-xs font-semibold ${tx.is_read ? 'text-gray-500 dark:text-gray-400' : 'text-indigo-700 dark:text-indigo-300'}`}>
                                        {tx.is_read ? 'Leído' : 'No leído'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                {formatDateTime(tx.performed_at)}
                            </td>
                            <td className="px-4 py-3">
                                <div className={`text-sm ${tx.is_read ? 'font-medium text-gray-900 dark:text-gray-100' : 'font-semibold text-gray-950 dark:text-white'}`}>
                                    {tx.mail_subject || tx.origin_name || 'Correo SINPE'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {tx.origin_name || '—'}
                                </div>
                                {tx.origin_phone && tx.origin_phone !== '00000000' && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {tx.origin_phone}
                                    </div>
                                )}
                                {tx.reference && (
                                    <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                        {tx.reference}
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate">
                                <div className={`${tx.is_read ? '' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
                                    {tx.motive || '—'}
                                </div>
                                {tx.notes && (
                                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 line-clamp-2">
                                        {tx.notes}
                                    </div>
                                )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                {formatAmount(tx.amount)}
                            </td>
                            <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classForEmailStatus(tx.status)}`}>
                                    {labelForEmailStatus(tx.status)}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                {tx.client ? (
                                    <div>
                                        <div className="text-gray-900 dark:text-gray-100">{tx.client.name}</div>
                                        {tx.contract && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{tx.contract.name}</div>
                                        )}
                                        {tx.payment && (
                                            <a
                                                href={route('payments.index')}
                                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                                            >
                                                Pago #{tx.payment.id}
                                                {' '}
                                                <StatusBadge status={tx.payment.status} />
                                            </a>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                )}
                            </td>
                            <td className="px-4 py-3">
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
                                {tx.status === 'in_review' && (
                                    <span className="text-xs text-blue-600 dark:text-blue-400">En revisión</span>
                                )}
                            </td>
                            <td className="px-4 py-3">
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
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}