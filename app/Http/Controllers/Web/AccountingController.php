<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Client;
use App\Models\Reminder;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
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
            'active_contracts_total' => (float) $activeContractsTotal,
            'monthly_pending' => $monthlyData,
            // Clientes con pendiente real en el periodo (por defecto: mes actual)
            'clients_unpaid_after_reminder' => $clientsUnpaid['clients'] ?? [],
            'clients_unpaid_total' => $clientsUnpaid['totals'] ?? [],
        ]);
    }

    public function indicators(Request $request): Response
    {
        $selectedMonth = $this->normalizeRequestedMonth($request->query('month'));
        [$startOfMonth, $endOfMonth] = $this->monthRange($selectedMonth);

        return Inertia::render('Accounting/Indicators', [
            'selected_month' => $selectedMonth,
            'selected_month_label' => $this->monthLabel($selectedMonth),
            'services_profit' => $this->calculateServiceProfits($startOfMonth, $endOfMonth),
        ]);
    }

    /**
     * Calcula ingresos, costo y ganancia neta por servicio para un rango de fechas.
     * Método usa asignación proporcional del pago a los servicios del contrato
     * según la participación del precio de cada servicio en el total del contrato.
     */
    private function calculateServiceProfits(
        \Illuminate\Support\Carbon $startOfPeriod,
        \Illuminate\Support\Carbon $endOfPeriod
    ): array {
        // Inicializar agregados con todas las plataformas existentes (incluye aquellas sin movimientos)
        $allServices = \App\Models\Service::orderBy('name')->get();
        // también precalcular el total de contratos activos en el mes por plataforma
        $serviceContractTotals = array_fill_keys($allServices->pluck('id')->all(), 0.0);
        $activeContracts = Contract::query()
            ->where(function ($q) use ($endOfPeriod) {
                $q->where('created_at', '<=', $endOfPeriod)
                  ->where(function ($sq) use ($endOfPeriod) {
                      $sq->whereNull('deleted_at')
                        ->orWhere('deleted_at', '>', $endOfPeriod);
                  });
            })
            ->with('services')
            ->get();
        foreach ($activeContracts as $ct) {
            foreach ($ct->services as $svc) {
                $sid = $svc->id;
                $qty = (int) ($svc->pivot->quantity ?? 1);
                $serviceContractTotals[$sid] += ((float) ($svc->price ?? 0)) * $qty;
            }
        }

        $agg = [];
        foreach ($allServices as $s) {
            // El costo es el valor fijo mensual configurado en la plataforma, sin multiplicar
            $fixedCost = (float) ($s->cost ?? 0);
            $agg[$s->id] = [
                'id' => $s->id,
                'name' => $s->name,
                'currency' => $s->currency ?? 'CRC',
                'account_email' => $s->account_email,
                'revenue' => 0.0,
                'cost' => $fixedCost,
                'net' => 0.0,
                'monthly_total' => round($serviceContractTotals[$s->id] ?? 0.0, 2),
            ];
        }

        // Obtener pagos verificados en el periodo
        $payments = Payment::query()
            ->where('status', 'verified')
            ->where(function ($q) use ($startOfPeriod, $endOfPeriod) {
                $q->whereBetween('paid_at', [$startOfPeriod->toDateString(), $endOfPeriod->toDateString()])
                  ->orWhere(function ($sq) use ($startOfPeriod, $endOfPeriod) {
                      $sq->whereNull('paid_at')
                         ->whereBetween('created_at', [$startOfPeriod, $endOfPeriod]);
                  });
            })
            ->with(['contract.services'])
            ->get();

        // Aggregados por servicio id

        foreach ($payments as $p) {
            $contract = $p->contract;
            if (! $contract) continue;

            $services = $contract->services ?? collect();

            // Calcular total de precio del contrato para asignar el ingreso proporcionalmente
            $contractPriceTotal = 0.0;
            foreach ($services as $s) {
                $qty = (int) ($s->pivot->quantity ?? 1);
                $price = (float) ($s->price ?? 0);
                $contractPriceTotal += $price * $qty;
            }

            // Si no hay breakdown por servicios (contrato manual), asignar todo al "sin plataforma"
            if ($contractPriceTotal <= 0 || $services->isEmpty()) {
                $key = 'unassigned';
                if (! isset($agg[$key])) {
                    $agg[$key] = ['id' => null, 'name' => 'Sin plataforma', 'revenue' => 0.0, 'cost' => 0.0, 'net' => 0.0];
                }
                $agg[$key]['revenue'] += (float) $p->amount;
                $agg[$key]['net'] = $agg[$key]['revenue'] - $agg[$key]['cost'];
                continue;
            }

            // Para cada servicio, asignar la parte del ingreso proporcional al precio del servicio
            foreach ($services as $s) {
                $sid = $s->id;
                $qty = (int) ($s->pivot->quantity ?? 1);
                $sPriceTotal = ((float) ($s->price ?? 0)) * $qty;

                // proporción del ingreso del contrato que corresponde a este servicio
                $fraction = $contractPriceTotal > 0 ? ($sPriceTotal / $contractPriceTotal) : 0;
                $revenue = (float) $p->amount * $fraction;

                if (! isset($agg[$sid])) {
                    // Fallback: si el servicio no estaba pre-inicializado, usar su costo fijo
                    $agg[$sid] = ['id' => $sid, 'name' => $s->name ?? 'Servicio', 'currency' => $s->currency ?? 'CRC', 'revenue' => 0.0, 'cost' => (float) ($s->cost ?? 0), 'net' => 0.0, 'monthly_total' => round($serviceContractTotals[$sid] ?? 0.0, 2)];
                }

                $agg[$sid]['revenue'] += $revenue;
                $agg[$sid]['net'] = $agg[$sid]['revenue'] - $agg[$sid]['cost'];
            }
        }

        // Recalcular net final (cubre servicios sin pagos en el periodo: net = 0 - costo fijo)
        foreach ($agg as &$entry) {
            $entry['net'] = $entry['revenue'] - $entry['cost'];
        }
        unset($entry);

        // Transformar a array ordenado por mayor neto
        $result = array_values($agg);
        usort($result, fn($a, $b) => $b['net'] <=> $a['net']);
        // Formatear a valores numéricos
        return array_map(fn($r) => [
            'id' => $r['id'],
            'name' => $r['name'],
            'currency' => $r['currency'] ?? 'CRC',
            'account_email' => $r['account_email'] ?? null,
            'revenue' => round($r['revenue'], 2),
            'cost' => round($r['cost'], 2),
            'net' => round($r['net'], 2),
            'monthly_total' => round($r['monthly_total'] ?? 0.0, 2),
        ], $result);
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
                // calcular ganancia neta por moneda para el mes
                'net_by_currency' => (function () use ($startOfMonth, $endOfMonth) {
                    $profits = $this->calculateServiceProfits($startOfMonth, $endOfMonth);
                    $netByCurrency = [];
                    foreach ($profits as $pf) {
                        $cur = $pf['currency'] ?? 'CRC';
                        if (! isset($netByCurrency[$cur])) $netByCurrency[$cur] = 0.0;
                        $netByCurrency[$cur] += $pf['net'];
                    }
                    // round values
                    foreach ($netByCurrency as $k => $v) $netByCurrency[$k] = round($v, 2);
                    return $netByCurrency;
                })(),
            ];
        });

        return $monthlyData->toArray();
    }

    private function normalizeRequestedMonth(mixed $month): string
    {
        if (is_string($month) && preg_match('/^\d{4}-\d{2}$/', $month) === 1) {
            try {
                return Carbon::createFromFormat('Y-m', $month)->format('Y-m');
            } catch (\Throwable $e) {
                // fallback al mes actual
            }
        }

        return Carbon::now()->format('Y-m');
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function monthRange(string $month): array
    {
        $date = Carbon::createFromFormat('Y-m', $month)->startOfMonth();

        return [$date->copy()->startOfMonth(), $date->copy()->endOfMonth()];
    }

    private function monthLabel(string $month): string
    {
        return ucfirst(Carbon::createFromFormat('Y-m', $month)->locale('es')->isoFormat('MMMM YYYY'));
    }
}
