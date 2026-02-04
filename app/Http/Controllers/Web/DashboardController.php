<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Conciliation;
use App\Models\Contract;
use App\Models\Payment;
use App\Models\Reminder;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(): Response
    {
        $today = Carbon::today();
        $upcomingWindowEnd = $today->copy()->addDays(7);

        $metrics = [
            'clients' => [
                'total' => Client::count(),
                'active' => Client::query()->where('status', 'active')->count(),
            ],
            'contracts' => [
                'active' => Contract::count(),
                'dueSoon' => Contract::query()
                    ->whereNotNull('next_due_date')
                    ->whereBetween('next_due_date', [$today, $upcomingWindowEnd])
                    ->count(),
            ],
            'reminders' => [
                'pending' => Reminder::query()->whereIn('status', ['pending', 'queued'])->count(),
                'scheduledToday' => Reminder::query()->whereDate('scheduled_for', $today)->count(),
                'sentToday' => Reminder::query()->whereDate('sent_at', $today)->count(),
            ],
            'payments' => [
                'unverified' => Payment::query()->where('status', '!=', 'verified')->count(),
                'verified' => Payment::query()->where('status', 'verified')->count(),
                'receivedToday' => Payment::query()->whereDate('created_at', $today)->count(),
            ],
            'conciliations' => [
                'pending' => Conciliation::query()->whereIn('status', ['pending', 'in_review'])->count(),
                'approved' => Conciliation::query()->where('status', 'approved')->count(),
            ],
        ];

        $recentReminders = Reminder::query()
            ->with(['client:id,name', 'contract:id,name'])
            ->latest('scheduled_for')
            ->limit(5)
            ->get()
            ->map(fn (Reminder $reminder) => [
                'id' => $reminder->id,
                'status' => $reminder->status,
                'scheduled_for' => $reminder->scheduled_for?->toIso8601String(),
                'client' => $reminder->client?->only(['id', 'name']),
                'contract' => $reminder->contract?->only(['id', 'name']),
            ]);

        $pendingConciliations = Conciliation::query()
            ->with(['payment.client:id,name', 'payment.contract:id,name'])
            ->whereIn('status', ['pending', 'in_review'])
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (Conciliation $conciliation) => [
                'id' => $conciliation->id,
                'status' => $conciliation->status,
                'payment' => [
                    'id' => $conciliation->payment?->id,
                    'amount' => $conciliation->payment?->amount,
                    'currency' => $conciliation->payment?->currency,
                    'reference' => $conciliation->payment?->reference,
                ],
                'client' => $conciliation->payment?->client?->only(['id', 'name']) ?? null,
                'contract' => $conciliation->payment?->contract?->only(['id', 'name']) ?? null,
                'updated_at' => $conciliation->updated_at?->toIso8601String(),
            ]);

        return Inertia::render('Dashboard', [
            'metrics' => $metrics,
            'recentReminders' => $recentReminders,
            'pendingConciliations' => $pendingConciliations,
        ]);
    }
}
