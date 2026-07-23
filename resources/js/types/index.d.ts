export interface User {
    id: number;
    name: string;
    email: string;
    email_verified_at?: string;
    phone?: string;
    profile_type?: string;
    push_notification_preferences?: {
        daily_expected_payments?: boolean;
        overdue_payments?: boolean;
        platform_cost_due?: boolean;
        conciliation_pending?: boolean;
        whatsapp_manual_pause_events?: boolean;
        whatsapp_help_requests?: boolean;
        whatsapp_incoming_messages?: boolean;
        whatsapp_incoming_messages?: boolean;
    };
}

export type PageProps<
    T extends Record<string, unknown> = Record<string, unknown>,
> = T & {
    auth: {
        user: User;
    };
};
