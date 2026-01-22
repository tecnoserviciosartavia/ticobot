<?php

use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ConciliationController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ReminderController;
use App\Http\Controllers\Api\WhatsAppStatusController;
use App\Http\Controllers\Api\ContractTypeController;
use App\Http\Controllers\Api\BotMenuController;
use App\Http\Controllers\api\PaymentStatusController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('reminders/pending', [ReminderController::class, 'pending']);
    Route::get('reminders/sent-without-payment', [ReminderController::class, 'sentWithoutPayment']);
    Route::post('reminders/{reminder}/acknowledge', [ReminderController::class, 'acknowledge']);

    Route::post('payments/{payment}/status', [PaymentController::class, 'updateStatus']);
    Route::post('payments/{payment}/receipts', [PaymentController::class, 'attachReceipt']);
    Route::post('payments/receipts/bot', [PaymentController::class, 'storeReceiptFromBot']);

    Route::apiResource('clients', ClientController::class)->names('api.clients');
    Route::apiResource('contracts', ContractController::class)->names('api.contracts');
    Route::apiResource('reminders', ReminderController::class)->names('api.reminders');
    Route::apiResource('contract-types', ContractTypeController::class)->names('api.contract_types')->except(['show']);
    Route::apiResource('payments', PaymentController::class)->names('api.payments');
    Route::apiResource('conciliations', ConciliationController::class)->names('api.conciliations');

    // Application settings (key/value)
    Route::get('settings', [\App\Http\Controllers\Api\SettingsController::class, 'index']);
    Route::get('settings/{key}', [\App\Http\Controllers\Api\SettingsController::class, 'show']);
    Route::post('settings', [\App\Http\Controllers\Api\SettingsController::class, 'store']);
    Route::put('settings/{key}', [\App\Http\Controllers\Api\SettingsController::class, 'update']);
    Route::delete('settings/{key}', [\App\Http\Controllers\Api\SettingsController::class, 'destroy']);

    Route::prefix('whatsapp')->name('api.whatsapp.')->group(function (): void {
        Route::post('qr', [WhatsAppStatusController::class, 'storeQr'])->name('qr');
        Route::post('ready', [WhatsAppStatusController::class, 'markReady'])->name('ready');
        Route::post('disconnected', [WhatsAppStatusController::class, 'markDisconnected'])->name('disconnected');
        // Bot menu endpoints
        Route::get('menu', [BotMenuController::class, 'index'])->name('menu.index');
        Route::post('menu', [BotMenuController::class, 'store'])->name('menu.store');
        Route::put('menu/{menu}', [BotMenuController::class, 'update'])->name('menu.update');
        Route::delete('menu/{menu}', [BotMenuController::class, 'destroy'])->name('menu.destroy');
    });

    // Payment status and paused contacts endpoints
    Route::prefix('payment-status')->group(function (): void {
        Route::get('{phone}', [PaymentStatusController::class, 'getByPhone']);
    });

    Route::prefix('paused-contacts')->group(function (): void {
        Route::get('/', [PaymentStatusController::class, 'listPaused']);
        Route::get('check/{whatsappNumber}', [PaymentStatusController::class, 'isPaused']);
        Route::post('/', [PaymentStatusController::class, 'pauseContact']);
        Route::delete('{clientId}/{whatsappNumber}', [PaymentStatusController::class, 'resumeContact']);
    });

    // Pending payments endpoints
    Route::prefix('summary')->group(function (): void {
        Route::get('pending-payments', [PaymentStatusController::class, 'summaryPendingPayments']);
    });

    Route::get('clients/pending-payments', [PaymentStatusController::class, 'clientsWithPendingPayments']);
    // Send reminder for a client (creates a Reminder pending to be picked by bot)
    Route::post('clients/{client}/send-reminder', [PaymentStatusController::class, 'sendReminder']);
});
