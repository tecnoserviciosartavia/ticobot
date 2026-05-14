import { Button } from '@/Components/button';
import { Card } from '@/Components/card';
import { Badge } from '@/Components/badge';
import ResponsiveLayout from '@/Components/ResponsiveLayout';
import StatusBadge from '@/Components/StatusBadge';
import type { PageProps } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { labelForBillingCycle } from '@/lib/labels';
import { FileText, Edit, Trash2, ArrowLeft, Calendar, DollarSign, User, Clock, AlertCircle, Plus } from '@/Components/icons';

interface ContractResource {
    id: number;
    client: { id: number; name: string; email: string | null; phone: string | null } | null;
    name: string;
    notes?: string | null;
    amount: string;
    currency: string | null;
    services?: Array<{ id: number; name: string; price: string; currency: string; quantity?: number; account_email?: string | null; password?: string | null; pin?: string | null }>;
    billing_cycle: string;
    status: string;
    next_due_date: string | null;
    grace_period_days: number;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
}

interface ReminderSummary {
    id: number;
    status: string;
    scheduled_for: string | null;
    sent_at: string | null;
    acknowledged_at: string | null;
    attempts: number;
}

interface PaymentSummary {
    id: number;
    amount: string;
    currency: string | null;
    status: string;
    reference: string | null;
    paid_at: string | null;
    conciliation_status: string | null;
}

interface ContractShowProps extends PageProps<{
    contract: ContractResource;
    reminders: ReminderSummary[];
    payments: PaymentSummary[];
}> {}

const resolveCurrency = (value: string | null | undefined) => {
    if (value && value.trim().length === 3) {
        return value.trim().toUpperCase();
    }

    return 'CRC';
};

const formatCurrency = (amount: string, currency: string | null | undefined) =>
    new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: resolveCurrency(currency),
        minimumFractionDigits: 2,
    }).format(Number.parseFloat(amount));

const formatServicePriceLabel = (amount: string, currency: string | null | undefined) => {
    const resolved = resolveCurrency(currency);
    const numeric = Number.parseFloat(amount);

    if (resolved === 'CRC') {
        // En CR, normalmente se muestra el símbolo de colones.
        return `₡${Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'}`;
    }

    // Fallback genérico para otras monedas.
    return `${resolved} ${Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'}`;
};

const formatDate = (value: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleDateString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const formatDateTime = (value: string | null) => {
    if (!value) {
        return '—';
    }

    const d = new Date(value);
    const date = d.toLocaleDateString('es-CR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Costa_Rica',
    });
    const time = d.toLocaleTimeString('es-CR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Costa_Rica',
    });

    return `${date}, ${time}`;
};

export default function ContractsShow({ contract, reminders, payments }: ContractShowProps) {
    return (
        <ResponsiveLayout title={contract.name}>
            <Head title={`Contrato ${contract.name}`} />

            <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">{contract.name}</h1>
                                <p className="mt-2 text-gray-600">
                                    Detalles del contrato y seguimiento de recordatorios y pagos vinculados.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link href={route('contracts.index')}>
                                    <Button variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Volver
                                    </Button>
                                </Link>
                                <Button 
                                    variant="outline" 
                                    onClick={() => router.post(route('contracts.resend-access', contract.id))}
                                    className="text-green-700 border-green-300 hover:bg-green-50"
                                >
                                    <AlertCircle className="w-4 h-4 mr-2" />
                                    Reenviar Acceso
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Contract Details */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Contrato</h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <User className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm text-gray-500">Cliente</p>
                                        <p className="font-medium">{contract.client?.name || 'Cliente eliminado'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <DollarSign className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm text-gray-500">Monto</p>
                                        <p className="font-medium">{formatCurrency(contract.amount, contract.currency)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm text-gray-500">Ciclo de facturación</p>
                                        <p className="font-medium">{labelForBillingCycle(contract.billing_cycle)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <AlertCircle className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm text-gray-500">Estado del contrato</p>
                                        <p className="font-medium">
                                            <StatusBadge status={contract.status ?? 'active'} />
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm text-gray-500">Próximo vencimiento</p>
                                        <p className="font-medium">{formatDate(contract.next_due_date)}</p>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones</h3>
                            <div className="space-y-3">
                                <Link href={route('contracts.edit', contract.id)}>
                                    <Button className="w-full">
                                        <Edit className="w-4 h-4 mr-2" />
                                        Editar Contrato
                                    </Button>
                                </Link>
                                <Link
                                    href={
                                        contract.client?.id
                                            ? `${route('reminders.create')}?client_id=${contract.client.id}&contract_id=${contract.id}`
                                            : route('reminders.create')
                                    }
                                    className="block w-full"
                                >
                                    <Button variant="outline" className="w-full">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Crear Recordatorio
                                    </Button>
                                </Link>
                                <Link
                                    href={
                                        contract.client?.id
                                            ? `${route('payments.create')}?client_id=${contract.client.id}&contract_id=${contract.id}`
                                            : route('payments.create')
                                    }
                                    className="block w-full"
                                >
                                    <Button variant="outline" className="w-full">
                                        <DollarSign className="w-4 h-4 mr-2" />
                                        Registrar Pago
                                    </Button>
                                </Link>
                            </div>
                        </Card>
                    </div>

                    {/* Services */}
                    {contract.services && contract.services.length > 0 && (
                        <Card className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Servicios Asociados</h3>
                            <div className="space-y-3">
                                {contract.services.map((service) => (
                                    <div key={service.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div>
                                            <p className="font-medium">{service.name}</p>
                                            <p className="text-sm text-gray-500">{formatCurrency(service.price, service.currency)}</p>
                                        </div>
                                        <Badge variant="secondary">
                                            {service.quantity || 1}x
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Reminders and Payments sections would continue here... */}
                </div>
            </div>
        </ResponsiveLayout>
    );
}
