interface StatusBadgeProps {
    status: string | null | undefined;
}

const classForStatus = (status: string) => {
    const normalized = status.toLowerCase();

    if (['pending', 'queued', 'unverified', 'in_review'].includes(normalized)) {
        return 'bg-amber-100 text-amber-800 ring-amber-500/40';
    }

    if (['sent', 'acknowledged', 'approved', 'verified'].includes(normalized)) {
        return 'bg-emerald-100 text-emerald-800 ring-emerald-500/40';
    }

    if (['rejected', 'failed', 'cancelled', 'canceled'].includes(normalized)) {
        return 'bg-rose-100 text-rose-800 ring-rose-500/40';
    }

    return 'bg-slate-100 text-slate-800 ring-slate-500/40';
};

const formatLabel = (status: string) =>
    status
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

export default function StatusBadge({ status }: StatusBadgeProps) {
    if (!status) {
        return null;
    }

    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classForStatus(status)}`}
        >
            {formatLabel(status)}
        </span>
    );
}
