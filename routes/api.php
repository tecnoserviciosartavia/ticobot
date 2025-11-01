<?php

use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ConciliationController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ReminderController;
use App\Http\Controllers\Api\WhatsAppStatusController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('reminders/pending', [ReminderController::class, 'pending']);
    Route::post('reminders/{reminder}/acknowledge', [ReminderController::class, 'acknowledge']);

    Route::post('payments/{payment}/status', [PaymentController::class, 'updateStatus']);
    Route::post('payments/{payment}/receipts', [PaymentController::class, 'attachReceipt']);

    Route::apiResource('clients', ClientController::class)->names('api.clients');
    Route::apiResource('contracts', ContractController::class)->names('api.contracts');
    Route::apiResource('reminders', ReminderController::class)->names('api.reminders');
    Route::apiResource('payments', PaymentController::class)->names('api.payments');
    Route::apiResource('conciliations', ConciliationController::class)->names('api.conciliations');

    Route::prefix('whatsapp')->name('api.whatsapp.')->group(function (): void {
        Route::post('qr', [WhatsAppStatusController::class, 'storeQr'])->name('qr');
        Route::post('ready', [WhatsAppStatusController::class, 'markReady'])->name('ready');
        Route::post('disconnected', [WhatsAppStatusController::class, 'markDisconnected'])->name('disconnected');
    });
});
