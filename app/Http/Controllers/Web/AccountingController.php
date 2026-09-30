<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Client;
use App\Models\Reminder;
use App\Models\Service;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
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

        $recentConciliations = Payment::query()
            ->whereHas('conciliation')
            ->with(['client:id,name', 'contract:id,name', 'conciliation:id,payment_id,status,verified_at'])
            ->latest('updated_at')
            ->limit(30)
            ->get()
            ->map(fn (Payment $payment) => [
                'id' => $payment->id,
                'amount' => (float) $payment->amount,
                'currency' => $payment->currency ?: 'CRC',
                'status' => $payment->status,
                'paid_at' => $payment->paid_at?->toIso8601String(),
                'client' => $payment->client?->only(['id', 'name']),
                'contract' => $payment->contract?->only(['id', 'name']),
                'conciliation' => $payment->conciliation ? [
                    'id' => $payment->conciliation->id,
                    'status' => $payment->conciliation->status,
                ] : null,
            ]);

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
            'recent_conciliations' => $recentConciliations,
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

    public function serviceClients(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'month' => ['nullable', 'string', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $serviceId = (int) $validated['service_id'];
        $selectedMonth = $this->normalizeRequestedMonth($validated['month'] ?? null);
        [$startOfMonth, $endOfMonth] = $this->monthRange($selectedMonth);

        $service = Service::query()->findOrFail($serviceId);

        $payments = Payment::query()
            ->where('status', 'verified')
            ->where(function ($q) use ($startOfMonth, $endOfMonth) {
                $q->whereBetween('paid_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->orWhere(function ($sq) use ($startOfMonth, $endOfMonth) {
                        $sq->whereNull('paid_at')
                            ->whereBetween('created_at', [$startOfMonth, $endOfMonth]);
                    });
            })
            ->whereHas('contract.services', function ($q) use ($serviceId) {
                $q->where('services.id', $serviceId);
            })
            ->with([
                'client:id,name,email,phone',
                'contract.services',
            ])
            ->get();

        $rowsByClient = [];
        $totalRevenue = 0.0;

        foreach ($payments as $payment) {
            $contract = $payment->contract;
            $client = $payment->client;

            if (! $contract || ! $client) {
                continue;
            }

            $services = $contract->services ?? collect();
            if ($services->isEmpty()) {
                continue;
            }

            $contractPriceTotal = 0.0;
            $servicePriceTotal = 0.0;

            foreach ($services as $serviceItem) {
                $qty = (int) ($serviceItem->pivot->quantity ?? 1);
                $price = (float) ($serviceItem->price ?? 0);
                $lineTotal = $price * $qty;
                $contractPriceTotal += $lineTotal;

                if ((int) $serviceItem->id === $serviceId) {
                    $servicePriceTotal += $lineTotal;
                }
            }

            if ($contractPriceTotal <= 0 || $servicePriceTotal <= 0) {
                continue;
            }

            $allocation = ((float) $payment->amount) * ($servicePriceTotal / $contractPriceTotal);
            $clientId = (int) $client->id;

            if (! isset($rowsByClient[$clientId])) {
                $rowsByClient[$clientId] = [
                    'client_id' => $clientId,
                    'client_name' => (string) $client->name,
                    'client_email' => (string) ($client->email ?? ''),
                    'client_phone' => (string) ($client->phone ?? ''),
                    'payments_count' => 0,
                    'revenue' => 0.0,
                    'cost' => 0.0,
                    'margin' => 0.0,
                ];
            }

            $rowsByClient[$clientId]['payments_count']++;
            $rowsByClient[$clientId]['revenue'] += $allocation;
            $totalRevenue += $allocation;
        }

        $totalCost = (float) ($service->cost ?? 0);
        foreach ($rowsByClient as &$row) {
            $rowCost = $totalRevenue > 0 ? $totalCost * ($row['revenue'] / $totalRevenue) : 0.0;
            $row['cost'] = round($rowCost, 2);
            $row['revenue'] = round($row['revenue'], 2);
            $row['margin'] = round($row['revenue'] - $row['cost'], 2);
        }
        unset($row);

        $rows = array_values($rowsByClient);
        usort($rows, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);

        return response()->json([
            'service' => [
                'id' => (int) $service->id,
                'name' => (string) $service->name,
                'currency' => (string) ($service->currency ?? 'CRC'),
                'account_email' => (string) ($service->account_email ?? ''),
            ],
            'selected_month' => $selectedMonth,
            'selected_month_label' => $this->monthLabel($selectedMonth),
            'rows' => $rows,
            'summary' => [
                'clients_count' => count($rows),
                'payments_count' => (int) array_sum(array_column($rows, 'payments_count')),
                'total_revenue' => round((float) array_sum(array_column($rows, 'revenue')), 2),
                'total_cost' => round($totalCost, 2),
                'total_margin' => round((float) array_sum(array_column($rows, 'margin')), 2),
            ],
        ]);
    }

    /**
     * Calcula ingresos, costo y ganancia neta por servicio para un rango de fechas.
     * Método usa asignación proporcional del pago a los servicios del contrato
     * según la participación del precio de cada servicio en el total del contrato.
     */
    public function calculateServiceProfits(
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
     * Clientes morosos: tienen al menos un recordatorio enviado cuyo período de
     * cobro aún no está cubierto por un pago verificado.
     *
     * La deuda se conserva aunque el recordatorio se haya reenviado en otro mes.
     * El pago se cruza por covered_months/paid_for_month; la fecha de la
     * transferencia solo se usa como compatibilidad para pagos históricos.
     */
    public function clientsWithSentRemindersWithoutVerifiedPayments(Carbon $startOfPeriod, Carbon $endOfPeriod): array
    {
        $today = Carbon::today(config('app.timezone'));
        $reminders = Reminder::query()
            ->where('status', 'sent')
            ->whereNotNull('sent_at')
            ->whereNotNull('contract_id')
            ->with([
                'client:id,name,email,phone',
                'contract:id,name,client_id,amount,currency,status,next_due_date',
                'contract.payments' => fn ($q) => $q->where('status', 'verified'),
                'contract.services',
            ])
            ->orderBy('sent_at')
            ->get();

        $clientsData = [];
        $totals = [];

        foreach ($reminders as $reminder) {
            $client = $reminder->client;
            $contract = $reminder->contract;
            if (! $client || ! $contract) {
                continue;
            }

            $payload = is_array($reminder->payload) ? $reminder->payload : [];
            $dueValue = $payload['due_date'] ?? $reminder->scheduled_for;
            try {
                $dueDate = Carbon::parse($dueValue, config('app.timezone'))->startOfDay();
            } catch (\Throwable) {
                continue;
            }

            if ($dueDate->isAfter($today)) {
                continue;
            }

            $period = $dueDate->format('Y-m');
            if ($contract->payments->contains(fn (Payment $payment) => $this->paymentCoversPeriod($payment, $period))) {
                continue;
            }

            $clientId = (int) $client->id;
            $obligationKey = $contract->id.'|'.$period;
            $amount = (float) ($payload['amount'] ?? $contract->amount ?? 0);
            $currency = (string) ($contract->currency ?? 'CRC');

            if (! isset($clientsData[$clientId])) {
                $clientsData[$clientId] = [
                    'id' => $clientId,
                    'name' => $client->name,
                    'email' => $client->email,
                    'phone' => $client->phone,
                    'status' => 'delinquent',
                    'sent_reminders_count' => 0,
                    'last_sent_at' => null,
                    'last_reminder_id' => null,
                    'last_reminder_status' => 'sent',
                    'oldest_due_date' => $dueDate->toDateString(),
                    'contracts' => [],
                    'pending_by_currency' => [],
                    '_obligations' => [],
                ];
            }

            $row = &$clientsData[$clientId];
            $row['sent_reminders_count']++;
            if ($row['last_sent_at'] === null || $reminder->sent_at?->gt(Carbon::parse($row['last_sent_at']))) {
                $row['last_sent_at'] = $reminder->sent_at?->toDateTimeString();
                $row['last_reminder_id'] = $reminder->id;
            }
            if ($dueDate->lt(Carbon::parse($row['oldest_due_date']))) {
                $row['oldest_due_date'] = $dueDate->toDateString();
            }

            if (! isset($row['_obligations'][$obligationKey])) {
                $row['_obligations'][$obligationKey] = true;
                $row['contracts'][] = [
                    'id' => (int) $contract->id,
                    'name' => (string) $contract->name,
                    'reminder_id' => (int) $reminder->id,
                    'reminder_sent_at' => $reminder->sent_at?->toIso8601String(),
                    'last_resend_at' => $reminder->last_resend_at?->toIso8601String(),
                    'was_resent' => $reminder->last_resend_at !== null
                        || (bool) data_get($reminder->response_payload, 'manual_send', false),
                    'services' => $contract->servicesLabelForMessaging(),
                    'period' => $period,
                    'due_date' => $dueDate->toDateString(),
                    'amount' => $amount,
                    'currency' => $currency,
                ];
                $row['pending_by_currency'][$currency] = ($row['pending_by_currency'][$currency] ?? 0) + $amount;
                $totals[$currency] = ($totals[$currency] ?? 0) + $amount;
            } else {
                foreach ($row['contracts'] as &$obligation) {
                    if ((int) $obligation['id'] === (int) $contract->id && $obligation['period'] === $period) {
                        $obligation['reminder_id'] = (int) $reminder->id;
                        $obligation['reminder_sent_at'] = $reminder->sent_at?->toIso8601String();
                        $obligation['last_resend_at'] = $reminder->last_resend_at?->toIso8601String();
                        $obligation['was_resent'] = $reminder->last_resend_at !== null
                            || (bool) data_get($reminder->response_payload, 'manual_send', false);
                        break;
                    }
                }
                unset($obligation);
            }
            unset($row);
        }

        foreach ($clientsData as &$row) {
            unset($row['_obligations']);
            usort($row['contracts'], fn (array $a, array $b) => $a['due_date'] <=> $b['due_date']);
        }
        unset($row);

        usort($clientsData, fn (array $a, array $b) => $a['oldest_due_date'] <=> $b['oldest_due_date']);

        return [
            'clients' => array_values($clientsData),
            'totals' => $totals,
        ];
    }

    private function paymentCoversPeriod(Payment $payment, string $period): bool
    {
        $metadata = is_array($payment->metadata) ? $payment->metadata : [];
        $coveredMonths = is_array($metadata['covered_months'] ?? null)
            ? $metadata['covered_months']
            : [];

        if (in_array($period, $coveredMonths, true) || ($metadata['paid_for_month'] ?? null) === $period) {
            return true;
        }

        // Compatibilidad con pagos antiguos que no guardaban explícitamente el período cubierto.
        if ($coveredMonths === [] && empty($metadata['paid_for_month'])) {
            $paymentDate = $payment->paid_at ?? $payment->created_at;

            return $paymentDate?->format('Y-m') === $period;
        }

        return false;
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
