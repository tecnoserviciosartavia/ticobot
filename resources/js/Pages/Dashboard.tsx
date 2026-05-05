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
    revenue: number;
    contracts: number;
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
            revenue: number;
            contracts: number;
        }>;
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
        revenueByMonth: stats?.revenueByMonth || []
    };
    
    return <ModernDashboard stats={safeStats} />;
}
