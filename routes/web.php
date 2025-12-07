<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\Web\ClientController as WebClientController;
use App\Http\Controllers\Web\ContractController as WebContractController;
use App\Http\Controllers\Web\ConciliationController as WebConciliationController;
use App\Http\Controllers\Web\DashboardController;
use App\Http\Controllers\Web\PaymentController as WebPaymentController;
use App\Http\Controllers\Web\ReminderController as WebReminderController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return auth()->check() 
        ? redirect()->route('dashboard') 
        : redirect()->route('login');
});

Route::middleware(['auth', 'verified'])->group(function (): void {
    Route::get('/dashboard', DashboardController::class)->name('dashboard');

    Route::get('/settings', [\App\Http\Controllers\Web\SettingsController::class, 'index'])->name('settings.index');
    Route::post('/settings', [\App\Http\Controllers\Web\SettingsController::class, 'update'])->name('settings.update');

    // Clients import (CSV) - define BEFORE the resource to avoid matching `clients/{client}`
    Route::get('clients/import', [WebClientController::class, 'importForm'])->name('clients.import');
    Route::post('clients/import', [WebClientController::class, 'import'])->name('clients.import.store');
    // Contracts import (CSV/XLSX) - define BEFORE the resource to avoid matching `contracts/{contract}`
    Route::get('contracts/import', [WebContractController::class, 'importForm'])->name('contracts.import');
    Route::post('contracts/import', [WebContractController::class, 'import'])->name('contracts.import.store');
    Route::resource('clients', WebClientController::class)->except(['destroy']);
    Route::resource('contracts', WebContractController::class)->except(['destroy']);
    Route::resource('reminders', WebReminderController::class)->except(['destroy']);
    Route::get('/payments', [WebPaymentController::class, 'index'])->name('payments.index');
    Route::get('/payments/client-contracts', [WebPaymentController::class, 'getClientContracts'])->name('payments.client-contracts');
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
