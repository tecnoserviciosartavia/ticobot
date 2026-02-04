<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\Web\ClientController as WebClientController;
use App\Http\Controllers\Web\ContractController as WebContractController;
use App\Http\Controllers\Web\ConciliationController as WebConciliationController;
use App\Http\Controllers\Web\DashboardController;
use App\Http\Controllers\Web\PaymentController as WebPaymentController;
use App\Http\Controllers\Web\ReminderController as WebReminderController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return auth()->check() 
        ? redirect()->route('dashboard') 
        : redirect()->route('login');
});

Route::middleware(['auth', 'verified'])->group(function (): void {
    Route::get('/dashboard', DashboardController::class)->name('dashboard');

    // Cobranzas (deuda = NO existe pago registrado)
    Route::get('/collections', function () {
        return Inertia::render('Collections/Index');
    })->name('collections.index');

    Route::get('/settings', [\App\Http\Controllers\Web\SettingsController::class, 'index'])->name('settings.index');
    Route::post('/settings', [\App\Http\Controllers\Web\SettingsController::class, 'update'])->name('settings.update');

    // Clients import (CSV) - define BEFORE the resource to avoid matching `clients/{client}`
    Route::get('clients/import', [WebClientController::class, 'importForm'])->name('clients.import');
    Route::post('clients/import', [WebClientController::class, 'import'])->name('clients.import.store');
    // Contracts import (CSV/XLSX) - define BEFORE the resource to avoid matching `contracts/{contract}`
    Route::get('contracts/import', [WebContractController::class, 'importForm'])->name('contracts.import');
    Route::post('contracts/import', [WebContractController::class, 'import'])->name('contracts.import.store');
    Route::resource('clients', WebClientController::class);
    Route::resource('contracts', WebContractController::class)->except(['destroy']);
    Route::resource('reminders', WebReminderController::class)->except(['destroy']);
    Route::get('/payments', [WebPaymentController::class, 'index'])->name('payments.index');
    Route::get('/payments/create', [WebPaymentController::class, 'create'])->name('payments.create');
    Route::post('/payments', [WebPaymentController::class, 'store'])->name('payments.store');
    Route::get('/payments/client-contracts', [WebPaymentController::class, 'getClientContracts'])->name('payments.client-contracts');
    Route::get('/payments/pending', [\App\Http\Controllers\Web\PaymentController::class, 'pending'])->name('payments.pending');

    // Web JSON endpoints (session-auth) for pages that fetch() data directly.
    // This avoids SPA/Sanctum cookie-state complexities and prevents 401s on /api/* for same-origin requests.
    Route::prefix('web-api')->group(function (): void {
        Route::get('clients/pending-payments', [\App\Http\Controllers\api\PaymentStatusController::class, 'clientsWithPendingPayments']);
        Route::get('summary/pending-payments', [\App\Http\Controllers\api\PaymentStatusController::class, 'summaryPendingPayments']);
        Route::post('clients/{client}/send-reminder', [\App\Http\Controllers\api\PaymentStatusController::class, 'sendReminder'])->name('webapi.clients.sendReminder');
            // Dashboard de cobranzas (solo deuda cuando NO existe pago registrado)
            Route::get('collections/overview', [\App\Http\Controllers\api\CollectionsDashboardController::class, 'overview']);
    });
    Route::delete('/payments/{payment}', [WebPaymentController::class, 'destroy'])->name('payments.destroy');
    Route::get('/conciliations', [WebConciliationController::class, 'index'])->name('conciliations.index');
    Route::post('/conciliations', [WebConciliationController::class, 'store'])->name('conciliations.store');
    // Accounting dashboard
    Route::get('/accounting', \App\Http\Controllers\Web\AccountingController::class . '@index')->name('accounting.index');
});

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';
