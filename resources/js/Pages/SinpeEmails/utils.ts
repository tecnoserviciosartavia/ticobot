export const formatDateTime = (value: string | null): string => {
    if (!value) return '—';
    const d = new Date(value);
    return d.toLocaleString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Costa_Rica',
    });
};

export const formatAmount = (amount: string | number): string =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(
        typeof amount === 'string' ? parseFloat(amount) : amount,
    );

export const labelForEmailStatus = (status: string): string => {
    switch (status) {
        case 'skipped':   return 'Sin conciliar';
        case 'in_review': return 'En revisión';
        case 'error':     return 'Error';
        default:          return 'Desconocido';
    }
};

export const classForEmailStatus = (status: string): string => {
    switch (status) {
        case 'skipped':   return 'bg-amber-100 text-amber-800 ring-amber-500/40';
        case 'in_review': return 'bg-blue-100 text-blue-800 ring-blue-500/40';
        case 'error':     return 'bg-rose-100 text-rose-800 ring-rose-500/40';
        default:          return 'bg-slate-100 text-slate-800 ring-slate-500/40';
    }
};
