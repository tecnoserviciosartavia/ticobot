import { labelForStatus } from '@/lib/labels';

interface StatusBadgeProps {
    status: string | null | undefined;
}

const classForStatus = (status: string) => {
    const normalized = status.toLowerCase();

    if (['active', 'verified', 'approved', 'paid', 'acknowledged', 'sent'].includes(normalized)) {
        return 'bg-emerald-100 text-emerald-800 ring-emerald-500/40';
    }

    if (['inactive'].includes(normalized)) {
        return 'bg-slate-100 text-slate-800 ring-slate-500/40';
    }

    if (['paused', 'pending', 'queued', 'unverified', 'in_review'].includes(normalized)) {
        return 'bg-amber-100 text-amber-800 ring-amber-500/40';
    }

    if (['rejected', 'failed', 'cancelled', 'canceled'].includes(normalized)) {
        return 'bg-rose-100 text-rose-800 ring-rose-500/40';
    }

    return 'bg-slate-100 text-slate-800 ring-slate-500/40';
};

export default function StatusBadge({ status }: StatusBadgeProps) {
    if (!status) {
        return null;
    }

    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classForStatus(status)}`}
        >
            {labelForStatus(status)}
        </span>
    );
}
