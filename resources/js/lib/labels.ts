const humanize = (value: string) =>
    value
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

export const labelForBillingCycle = (value: string | null | undefined) => {
    const normalized = (value ?? '').toLowerCase().trim();

    switch (normalized) {
        case 'weekly':
            return 'Semanal';
        case 'biweekly':
            return 'Quincenal';
        case 'monthly':
            return 'Mensual';
        case 'one_time':
        case 'once':
            return 'Un solo pago';
        default:
            return value ? humanize(value) : '—';
    }
};

export const labelForChannel = (value: string | null | undefined) => {
    const normalized = (value ?? '').toLowerCase().trim();

    switch (normalized) {
        case 'whatsapp':
            return 'WhatsApp';
        case 'manual':
            return 'Manual';
        case 'web':
            return 'Web';
        default:
            return value ? humanize(value) : '—';
    }
};

export const labelForStatus = (value: string | null | undefined) => {
    const normalized = (value ?? '').toLowerCase().trim();

    switch (normalized) {
        // Client statuses
        case 'active':
            return 'Activo';
        case 'inactive':
            return 'Inactivo';
        case 'paused':
            return 'Pausado';

        // Reminder statuses
        case 'pending':
            return 'Pendiente';
        case 'queued':
            return 'En cola';
        case 'sent':
            return 'Enviado';
        case 'acknowledged':
            return 'Confirmado';
        case 'paid':
            return 'Pagado';
        case 'cancelled':
        case 'canceled':
            return 'Cancelado';
        case 'failed':
            return 'Fallido';

        // Payment statuses
        case 'unverified':
            return 'Sin verificar';
        case 'in_review':
            return 'En revisión';
        case 'verified':
            return 'Verificado';
        case 'rejected':
            return 'Rechazado';

        // Conciliation / generic statuses
        case 'approved':
            return 'Aprobado';
        case 'pending_review':
            return 'Pendiente de revisión';

        default:
            return value ? humanize(value) : '—';
    }
};

export const humanizeLabel = humanize;
