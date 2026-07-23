<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\Web\ChatController as WebChatController;
use App\Http\Controllers\Web\ClientController as WebClientController;
use App\Http\Controllers\Web\ContractController as WebContractController;
use App\Http\Controllers\Web\ConciliationController as WebConciliationController;
use App\Http\Controllers\Web\SinpeEmailController as WebSinpeEmailController;
use App\Http\Controllers\Web\DashboardController;
use App\Http\Controllers\Web\ReportsController;
use App\Http\Controllers\Web\LogsController;
use App\Http\Controllers\Web\PaymentController as WebPaymentController;
use App\Http\Controllers\Web\ReminderController as WebReminderController;
use App\Http\Controllers\Web\FinancialOperationsController;
use App\Http\Controllers\Web\UserManagementController as WebUserManagementController;
use App\Http\Controllers\Web\SearchController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::view('/legal/privacy-policy', 'legal.privacy-policy')->name('legal.privacy-policy');
Route::view('/legal/data-deletion', 'legal.data-deletion')->name('legal.data-deletion');

// DEBUG: Endpoint de test para push notifications (sin CSRF)
Route::post('/debug/push/register', [\App\Http\Controllers\Api\DebugPushController::class, 'testRegister']);

Route::get('/', function () {
    if (! auth()->check()) {
        return redirect()->route('login');
    }
    $user = auth()->user();
    return $user->isAdmin()
        ? redirect()->route('dashboard')
        : redirect()->route('chats.index');
});

Route::middleware(['auth', 'verified'])->group(function (): void {
    // Búsqueda global
    Route::get('/search', [SearchController::class, 'global'])->name('search.global');
    // Debug route para verificar permisos
    Route::get('/debug/permissions', function () {
        return Inertia::render('Debug/Permissions');
    })->name('debug.permissions');
    
    // Sección disponible para todos los roles autenticados
    Route::get('/chats', [WebChatController::class, 'index'])->name('chats.index');
    Route::get('/chats/create', [WebChatController::class, 'create'])->name('chats.create');
    Route::post('/chats', [WebChatController::class, 'store'])->name('chats.store');
    Route::patch('/chats/mark-all-read', [WebChatController::class, 'markAllAsRead'])->name('chats.mark-all-read');
    Route::patch('/chats/mark-selected-read', [WebChatController::class, 'markSelectedAsRead'])->name('chats.mark-selected-read');
    Route::get('/chats/{phone}', [WebChatController::class, 'show'])->name('chats.show');
    Route::post('/chats/{phone}/reply', [WebChatController::class, 'reply'])->name('chats.reply');
    Route::delete('/chats/{phone}', [WebChatController::class, 'destroy'])->name('chats.destroy');

    // Clients import (CSV) - define BEFORE the resource to avoid matching `clients/{client}`
    Route::get('clients/import', [WebClientController::class, 'importForm'])->name('clients.import');
    Route::post('clients/import', [WebClientController::class, 'import'])->name('clients.import.store');
    // Contracts import (CSV/XLSX) - define BEFORE the resource to avoid matching `contracts/{contract}`
    Route::get('contracts/import', [WebContractController::class, 'importForm'])->name('contracts.import');
    Route::post('contracts/import', [WebContractController::class, 'import'])->name('contracts.import.store');

    // Contracts nested in client (UX: crear/asignar contrato desde pantalla del cliente)
    Route::get('clients/{client}/contracts/create', [WebContractController::class, 'createForClient'])->name('clients.contracts.create');
    Route::post('clients/{client}/contracts', [WebContractController::class, 'storeForClient'])->name('clients.contracts.store');

    Route::resource('clients', WebClientController::class);
    Route::resource('contracts', WebContractController::class)->except(['destroy']);
    Route::delete('contracts/{contract}', [WebContractController::class, 'destroy'])->name('contracts.destroy');
    Route::post('contracts/{contract}/resend-access', [WebContractController::class, 'resendAccess'])->name('contracts.resend-access');

    // Rutas exclusivas para administradores
    Route::middleware('admin')->group(function (): void {
        Route::get('/dashboard', DashboardController::class)->name('dashboard');
        Route::get('/reports', ReportsController::class)->name('reports.index');
        Route::get('/logs', [LogsController::class, 'index'])->name('logs.index');
        Route::get('/logs/fetch', [LogsController::class, 'fetch'])->name('logs.fetch');
        
        Route::get('/finance', [FinancialOperationsController::class, 'index'])->name('finance.index');
        Route::get('/conciliations', [FinancialOperationsController::class, 'conciliations'])->name('conciliations.index');
        Route::post('/conciliations', [WebConciliationController::class, 'store'])->name('conciliations.store');
        Route::patch('/conciliations/{conciliation}', [WebConciliationController::class, 'update'])->name('conciliations.update');

        Route::get('/collections', [FinancialOperationsController::class, 'collections'])->name('collections.index');

        Route::get('/settings', [\App\Http\Controllers\Web\SettingsController::class, 'index'])->name('settings.index');
        Route::post('/settings', [\App\Http\Controllers\Web\SettingsController::class, 'update'])->name('settings.update');
        Route::post('/settings/send-test', [\App\Http\Controllers\Web\SettingsController::class, 'sendTestReminder'])->name('settings.sendTestReminder');

        Route::get('/settings/services', [\App\Http\Controllers\Web\ServiceController::class, 'index'])->name('settings.services.index');
        Route::post('/settings/services', [\App\Http\Controllers\Web\ServiceController::class, 'store'])->name('settings.services.store');
        Route::put('/settings/services/{service}', [\App\Http\Controllers\Web\ServiceController::class, 'update'])->name('settings.services.update');
        Route::delete('/settings/services/{service}', [\App\Http\Controllers\Web\ServiceController::class, 'destroy'])->name('settings.services.destroy');
        Route::post('/settings/services/accounts', [\App\Http\Controllers\Web\ServiceAccountController::class, 'store'])->name('settings.services.accounts.store');
        Route::delete('/settings/services/accounts/{serviceAccount}', [\App\Http\Controllers\Web\ServiceAccountController::class, 'destroy'])->name('settings.services.accounts.destroy');

        Route::resource('users', WebUserManagementController::class)->except(['show', 'create', 'edit']);

        Route::resource('reminders', WebReminderController::class)->except(['destroy']);
        Route::post('/reminders/{reminder}/retry', [WebReminderController::class, 'retry'])->name('reminders.retry');
        Route::post('/reminders/{reminder}/send-manually', [WebReminderController::class, 'sendManually'])->name('reminders.send-manually');
        Route::get('/payments', [FinancialOperationsController::class, 'payments'])->name('payments.index');
        Route::get('/payments/create', [WebPaymentController::class, 'create'])->name('payments.create');
        Route::post('/payments', [WebPaymentController::class, 'store'])->name('payments.store');
        Route::get('/payments/client-contracts', [WebPaymentController::class, 'getClientContracts'])->name('payments.client-contracts');
        Route::delete('/payments/{payment}', [WebPaymentController::class, 'destroy'])->name('payments.destroy');

        Route::prefix('web-api')->group(function (): void {
            Route::get('collections/overview', [\App\Http\Controllers\api\CollectionsDashboardController::class, 'overview']);
            Route::post('collections/{contract}/send-payment-notice', [\App\Http\Controllers\api\CollectionsDashboardController::class, 'sendPaymentNotice'])
                ->name('webapi.collections.send-payment-notice');
            Route::post('contracts/quick', [WebContractController::class, 'quickStore'])->name('webapi.contracts.quick');
        });

        Route::get('/sinpe-emails', [WebSinpeEmailController::class, 'index'])->name('sinpe-emails.index');
        Route::post('/sinpe-emails/sync', [WebSinpeEmailController::class, 'sync'])->name('sinpe-emails.sync');
        Route::get('/sinpe-emails/client-contracts', [WebSinpeEmailController::class, 'clientContracts'])->name('sinpe-emails.client-contracts');
        Route::patch('/sinpe-emails/{id}/read', [WebSinpeEmailController::class, 'markRead'])->name('sinpe-emails.mark-read');
        Route::post('/sinpe-emails/{id}/conciliate', [WebSinpeEmailController::class, 'conciliate'])->name('sinpe-emails.conciliate');
        Route::delete('/sinpe-emails/{id}', [WebSinpeEmailController::class, 'destroy'])->name('sinpe-emails.destroy');

        Route::get('/accounting', [FinancialOperationsController::class, 'accounting'])->name('accounting.index');
        Route::get('/accounting/indicators', \App\Http\Controllers\Web\AccountingController::class . '@indicators')->name('accounting.indicators');
        Route::get('/accounting/indicators/service-clients', \App\Http\Controllers\Web\AccountingController::class . '@serviceClients')->name('accounting.indicators.service-clients');

    });
});

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::patch('/profile/push-notifications', [ProfileController::class, 'updatePushNotificationPreferences'])
        ->name('profile.push-notifications.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';
