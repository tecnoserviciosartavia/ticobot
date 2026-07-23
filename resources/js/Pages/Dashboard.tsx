import ModernDashboard from '@/components/ui/Dashboard';
import type { PageProps } from '@/types';

interface DashboardStats {
  totalContracts: number;
  activeContracts: number;
  totalRevenue: number;
  pendingPayments: number;
  conversionRate: number;
  recentActivity: Array<{
    id: number;
    type: string;
    description: string;
    created_at: string;
  }>;
  paymentStats: {
    verified: number;
    unverified: number;
    total: number;
    failed: number;
  };
  reminderStats: {
    sent: number;
    pending: number;
    failed: number;
  };
  revenueByMonth: Array<{
    month: string;
    currency: string;
    revenue: number;
    contracts: number;
  }>;
  period?: string;
  recentSentReminders?: Array<{
    id: number;
    client_name: string | null;
    client_phone: string | null;
    contract_name: string | null;
    channel: string | null;
    sent_at: string | null;
  }>;
  upcomingCollections?: {
    as_of: string;
    window_days: number;
    overdue: { count: number; by_currency: Record<string, number> };
    due_today: { count: number; by_currency: Record<string, number> };
    due_soon: { count: number; by_currency: Record<string, number> };
    total_by_currency: Record<string, number>;
  };
  financialSummary?: {
    payments_received: Record<string, number>;
    verified_count: number;
    platform_costs: Record<string, number>;
    real_profit: Record<string, number>;
    top_services: Array<{ id: number | null; name: string; currency: string; revenue: number; cost: number; net: number }>;
  };
  recentVerifiedPayments?: Array<{
    id: number;
    client_name: string | null;
    contract_name: string | null;
    amount: number;
    currency: string;
    paid_at: string | null;
  }>;
}

type DashboardPageProps = PageProps<{
    stats: {
        totalContracts: number;
        activeContracts: number;
        totalRevenue: number;
        pendingPayments: number;
        conversionRate: number;
        recentActivity: Array<{
            id: number;
            type: string;
            description: string;
            created_at: string;
        }>;
        paymentStats: {
            verified: number;
            unverified: number;
            total: number;
            failed: number;
        };
        reminderStats: {
            sent: number;
            pending: number;
            failed: number;
        };
        revenueByMonth: Array<{
            month: string;
            currency: string;
            revenue: number;
            contracts: number;
        }>;
        period?: string;
        recentSentReminders?: DashboardStats['recentSentReminders'];
        upcomingCollections?: DashboardStats['upcomingCollections'];
        financialSummary?: DashboardStats['financialSummary'];
        recentVerifiedPayments?: DashboardStats['recentVerifiedPayments'];
    };
}>;

export default function Dashboard({ stats }: DashboardPageProps) {
    // Handle missing stats from backend with proper fallbacks
    const safeStats: DashboardStats = {
        totalContracts: stats?.totalContracts || 0,
        activeContracts: stats?.activeContracts || 0,
        totalRevenue: stats?.totalRevenue || 0,
        pendingPayments: stats?.pendingPayments || 0,
        conversionRate: stats?.conversionRate || 0,
        recentActivity: stats?.recentActivity || [],
        paymentStats: { 
            verified: stats?.paymentStats?.verified || 0, 
            unverified: stats?.paymentStats?.unverified || 0, 
            total: stats?.paymentStats?.total || 0, 
            failed: stats?.paymentStats?.failed || 0 
        },
        reminderStats: { 
            sent: stats?.reminderStats?.sent || 0, 
            pending: stats?.reminderStats?.pending || 0, 
            failed: stats?.reminderStats?.failed || 0 
        },
        revenueByMonth: stats?.revenueByMonth || [],
        recentSentReminders: stats?.recentSentReminders ?? [],
        upcomingCollections: stats?.upcomingCollections,
        financialSummary: stats?.financialSummary,
        recentVerifiedPayments: stats?.recentVerifiedPayments ?? [],
        period: stats?.period || 'month',
    };
    
    return <ModernDashboard stats={safeStats} />;
}
