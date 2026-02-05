<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Client;
use App\Models\Reminder;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class AccountingController extends Controller
{
    public function index(): Response
    {
        // Fechas del mes actual
        // Nota: para contabilidad usamos paid_at cuando existe, porque created_at
        // puede ser el día que alguien registró el pago manualmente (y no el día
        // real del pago), distorsionando “mes actual”.
        $startOfMonth = Carbon::now()->startOfMonth();
        $endOfMonth = Carbon::now()->endOfMonth();

        // Agrupar montos por estado y moneda - SOLO MES ACTUAL
        $byStatusCurrency = Payment::query()
            ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                $q->whereBetween('paid_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                  ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                      $sq->whereNull('paid_at')
                         ->whereBetween('created_at', [$startOfMonth, $endOfMonth]);
                  });
            })
            ->selectRaw('status, COALESCE(currency, "CRC") as currency, SUM(amount) as total_amount, COUNT(*) as total_count')
            ->groupBy('status', 'currency')
            ->get()
            ->groupBy('status')
            ->map(fn ($group) => $group->map(fn ($row) => [
                'currency' => $row->currency,
                'total_amount' => (float) $row->total_amount,
                'total_count' => (int) $row->total_count,
            ]));

        // Totales generales por estado - SOLO MES ACTUAL
        $statuses = ['verified', 'unverified', 'in_review', 'rejected'];
        $totals = [];
        foreach ($statuses as $st) {
            $totals[$st] = [
                'amount' => (float) Payment::where('status', $st)
                    ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                        $q->whereBetween('paid_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                          ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                              $sq->whereNull('paid_at')
                                 ->whereBetween('created_at', [$startOfMonth, $endOfMonth]);
                          });
                    })
                    ->sum('amount'),
                'count' => (int) Payment::where('status', $st)
                    ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                        $q->whereBetween('paid_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                          ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                              $sq->whereNull('paid_at')
                                 ->whereBetween('created_at', [$startOfMonth, $endOfMonth]);
                          });
                    })
                    ->count(),
            ];
        }

        // Total meses pagados (metadata['months']) para pagos conciliados (verified) - SOLO MES ACTUAL
        $verifiedPayments = Payment::where('status', 'verified')
            ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                $q->whereBetween('paid_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                  ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                      $sq->whereNull('paid_at')
                         ->whereBetween('created_at', [$startOfMonth, $endOfMonth]);
                  });
            })
            ->get(['metadata']);
        $totalMonths = 0;
        foreach ($verifiedPayments as $p) {
            if (is_array($p->metadata) && isset($p->metadata['months'])) {
                $totalMonths += (int) $p->metadata['months'];
            }
        }

        // Últimos 7 días: montos diarios verificados vs pendientes
        $dailyWindow = collect(range(0,6))->map(function ($i) {
            $day = Carbon::today()->subDays($i);
            return [
                'date' => $day->toDateString(),
                // verified por fecha real de pago si existe
                'verified_amount' => (float) Payment::where('status', 'verified')
                    ->where(function ($q) use ($day) {
                        $q->whereDate('paid_at', $day)
                          ->orWhere(function ($sq) use ($day) {
                              $sq->whereNull('paid_at')->whereDate('created_at', $day);
                          });
                    })->sum('amount'),
                'pending_amount' => (float) Payment::whereIn('status', ['unverified','in_review'])
                    ->whereDate('created_at', $day)->sum('amount'),
            ];
        })->reverse()->values();

    // Porcentaje conciliado = monto verificado del mes / total de contratos activos del mes
        $verifiedTotal = $totals['verified']['amount'];
        
        // Total de contratos activos en el mes actual (por moneda)
        $activeContractsTotal = Contract::query()
            ->where(function ($q) use ($endOfMonth) {
                $q->where('created_at', '<=', $endOfMonth)
                  ->where(function ($sq) use ($endOfMonth) {
                      $sq->whereNull('deleted_at')
                        ->orWhere('deleted_at', '>', $endOfMonth);
                  });
            })
            ->sum('amount');
        
        $conciliationRate = $activeContractsTotal > 0
            ? round(($verifiedTotal / $activeContractsTotal) * 100, 2)
            : 0.0;

    // Cálculo mensual: Total contratos - Total pagado verificado
        $monthlyData = $this->calculateMonthlyPending();

    $clientsUnpaid = $this->clientsWithSentRemindersWithoutVerifiedPayments($startOfMonth, $endOfMonth);

        return Inertia::render('Accounting/Index', [
            'by_status_currency' => $byStatusCurrency,
            'totals' => $totals,
            'total_months' => $totalMonths,
            'daily' => $dailyWindow,
            'conciliation_rate' => $conciliationRate,
            'monthly_pending' => $monthlyData,
            // Clientes con pendiente real en el periodo (por defecto: mes actual)
            'clients_unpaid_after_reminder' => $clientsUnpaid['clients'] ?? [],
            'clients_unpaid_total' => $clientsUnpaid['totals'] ?? [],
        ]);
    }

    /**
     * Devuelve lista de clientes con pendiente real en el periodo.
     *
     * Criterio:
     * - Al menos un contrato activo en el periodo
     * - Pendiente = total contratos (activos) - pagos verificados en el periodo
     * - Se listan solo los que tienen pendiente > 0
     *
     * Nota: mantenemos el nombre de props en UI por compatibilidad.
     */
    private function clientsWithSentRemindersWithoutVerifiedPayments(Carbon $startOfPeriod, Carbon $endOfPeriod): array
    {
        // Opción A: recordatorio enviado dentro del periodo y SIN pagos verificados en el mismo periodo.
        // 1) Partimos de clientes que tienen al menos un recordatorio enviado en el rango.
        $clients = Client::query()
            ->whereHas('reminders', function ($q) use ($startOfPeriod, $endOfPeriod) {
                $q->whereNotNull('sent_at')
                    ->whereBetween('sent_at', [$startOfPeriod, $endOfPeriod]);
            })
            ->withCount(['reminders as sent_reminders_count' => function ($q) use ($startOfPeriod, $endOfPeriod) {
                $q->whereNotNull('sent_at')->whereBetween('sent_at', [$startOfPeriod, $endOfPeriod]);
            }])
            ->with(['reminders' => function ($q) use ($startOfPeriod, $endOfPeriod) {
                $q->whereNotNull('sent_at')
                    ->whereBetween('sent_at', [$startOfPeriod, $endOfPeriod])
                    ->orderByDesc('sent_at')
                    ->limit(1);
            }])
            ->get();

        $clientsData = [];
        $totals = [];

        foreach ($clients as $c) {
            $hasVerified = Payment::query()
                ->where('client_id', $c->id)
                ->where('status', 'verified')
                ->whereBetween('created_at', [$startOfPeriod, $endOfPeriod])
                ->exists();

            if ($hasVerified) {
                continue;
            }

            $last = $c->reminders->first();

            $clientsData[] = [
                'id' => $c->id,
                'name' => $c->name,
                'email' => $c->email,
                'phone' => $c->phone,
                'sent_reminders_count' => $c->sent_reminders_count,
                'last_sent_at' => $last ? $last->sent_at->toDateTimeString() : null,
                'last_reminder_id' => $last?->id,
                'last_reminder_status' => $last?->status,
                'contracts' => $c->contracts()->select('id', 'name')->get()->map(fn ($ct) => ['id' => $ct->id, 'name' => $ct->name])->values(),
                // Este bloque ya no muestra montos; se mantiene por compatibilidad.
                'pending_by_currency' => [],
            ];
        }

        return [
            'clients' => $clientsData,
            'totals' => $totals,
        ];
    }

    /**
     * Calcula el total pendiente mensualmente (Total contratos - Total pagado)
     */
    private function calculateMonthlyPending(): array
    {
        // Obtener últimos 12 meses
        $months = collect(range(0, 11))->map(function ($i) {
            $date = Carbon::today()->subMonths($i)->startOfMonth();
            return [
                'month' => $date->format('Y-m'),
                'label' => ucfirst($date->locale('es')->isoFormat('MMM YYYY')),
            ];
        })->reverse()->values();

        // Calcular para cada mes
        $monthlyData = $months->map(function ($monthInfo) {
            $startOfMonth = Carbon::parse($monthInfo['month'])->startOfMonth();
            $endOfMonth = Carbon::parse($monthInfo['month'])->endOfMonth();

            // Total de contratos activos en ese mes (por moneda)
            $contractsByCurrency = Contract::query()
                ->where(function ($q) use ($endOfMonth) {
                    $q->where('created_at', '<=', $endOfMonth)
                      ->where(function ($sq) use ($endOfMonth) {
                          $sq->whereNull('deleted_at')
                            ->orWhere('deleted_at', '>', $endOfMonth);
                      });
                })
                ->selectRaw('COALESCE(currency, "CRC") as currency, SUM(amount) as total')
                ->groupBy('currency')
                ->get()
                ->mapWithKeys(fn ($row) => [$row->currency => (float) $row->total]);

            // Total pagado verificado EN ese mes específico (no acumulado)
            $paidByCurrency = Payment::query()
                ->where('status', 'verified')
                ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                    $q->whereBetween('paid_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                      ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                          $sq->whereNull('paid_at')
                             ->whereBetween('created_at', [$startOfMonth, $endOfMonth]);
                      });
                })
                ->selectRaw('COALESCE(currency, "CRC") as currency, SUM(amount) as total')
                ->groupBy('currency')
                ->get()
                ->mapWithKeys(fn ($row) => [$row->currency => (float) $row->total]);

            // Calcular pendiente por moneda (contratos activos - pagos del mes)
            $currencies = $contractsByCurrency->keys()->merge($paidByCurrency->keys())->unique();
            $pendingByCurrency = $currencies->mapWithKeys(function ($currency) use ($contractsByCurrency, $paidByCurrency) {
                $contractTotal = $contractsByCurrency->get($currency, 0);
                $paidTotal = $paidByCurrency->get($currency, 0);
                return [$currency => max(0, $contractTotal - $paidTotal)];
            });

            return [
                'month' => $monthInfo['label'],
                'contracts_total' => $contractsByCurrency,
                'paid_total' => $paidByCurrency,
                'pending_total' => $pendingByCurrency,
            ];
        });

        return $monthlyData->toArray();
    }
}
