<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class ReportsController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $today = Carbon::today();
        $monthStart = $today->copy()->startOfMonth();

        $snapshot = [
            'clients_total' => Client::query()->count(),
            'contracts_with_client' => Contract::query()->whereNotNull('client_id')->count(),
            'payments_verified_month_crc' => (float) (Payment::query()
                ->where('status', 'verified')
                ->where('created_at', '>=', $monthStart)
                ->where(function ($q) {
                    $q->whereNull('currency')->orWhere('currency', '!=', 'USD');
                })
                ->sum('amount') ?: 0),
            'payments_verified_month_usd' => (float) (Payment::query()
                ->where('status', 'verified')
                ->where('created_at', '>=', $monthStart)
                ->where('currency', 'USD')
                ->sum('amount') ?: 0),
            'payments_unverified_open' => Payment::query()->where('status', '!=', 'verified')->count(),
            'reminders_sent_month' => Reminder::query()
                ->where('status', 'sent')
                ->whereNotNull('sent_at')
                ->where('sent_at', '>=', $monthStart)
                ->count(),
        ];

        return Inertia::render('Reports/Index', [
            'snapshot' => $snapshot,
            'generated_at' => $today->toDateString(),
        ]);
    }
}
