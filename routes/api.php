<?php

use App\Http\Controllers\Api\BotMenuController;
use App\Http\Controllers\Api\ChatMessageController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ConciliationController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\ContractTypeController;
use App\Http\Controllers\Api\MetaWhatsAppMessageController;
use App\Http\Controllers\Api\MetaWhatsAppWebhookController;
use App\Http\Controllers\Api\MobileAuthController;
use App\Http\Controllers\Api\MobileChatController;
use App\Http\Controllers\Api\MobileFinanceController;
use App\Http\Controllers\Api\MobileSinpeEmailController;
use App\Http\Controllers\Api\MobileReminderController;
use App\Http\Controllers\Api\MobileServiceController;
use App\Http\Controllers\Api\MobileAccountingController;
use App\Http\Controllers\Api\MobileSystemSettingsController;
use App\Http\Controllers\Api\MobileUserController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PushDeviceTokenController;
use App\Http\Controllers\Api\PushQuickReplyController;
use App\Http\Controllers\Api\PushWebSubscriptionController;
use App\Http\Controllers\Api\ReminderController;
use App\Http\Controllers\Api\WhatsAppStatusController;
use App\Http\Controllers\api\PaymentStatusController;
use Illuminate\Support\Facades\Route;

Route::get('meta/whatsapp/webhook', [MetaWhatsAppWebhookController::class, 'verify']);
Route::post('meta/whatsapp/webhook', [MetaWhatsAppWebhookController::class, 'handle']);
Route::post('push/quick-reply', [PushQuickReplyController::class, 'store'])->middleware('throttle:30,1');
Route::post('mobile/login', [MobileAuthController::class, 'login'])->middleware('throttle:10,1');

// Estado del transporte oficial Meta Cloud API (sin QR ni sesión Web)
Route::prefix('whatsapp')->name('api.whatsapp.')->group(function (): void {
    Route::get('status', [WhatsAppStatusController::class, 'getStatus'])->name('status');
    Route::get('account-status', [WhatsAppStatusController::class, 'getStatus'])->name('account-status');
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('mobile/me', [MobileAuthController::class, 'me']);
    Route::post('mobile/logout', [MobileAuthController::class, 'logout']);
    Route::put('mobile/profile', [MobileAuthController::class, 'updateProfile']);
    Route::get('mobile/chats', [MobileChatController::class, 'index']);
    Route::get('mobile/finance', [MobileFinanceController::class, 'show']);
    Route::post('mobile/chats', [MobileChatController::class, 'create']);
    Route::get('mobile/quick-replies', [MobileChatController::class, 'quickReplies']);
    Route::post('mobile/quick-replies', [MobileChatController::class, 'storeQuickReply']);
    Route::get('mobile/chats/{phone}', [MobileChatController::class, 'show']);
    Route::post('mobile/chats/{phone}', [MobileChatController::class, 'store']);
    Route::delete('mobile/chats/{phone}', [MobileChatController::class, 'destroy']);
    Route::middleware('admin')->group(function (): void {
        Route::get('mobile/users', [MobileUserController::class, 'index']);
        Route::put('mobile/users/{user}', [MobileUserController::class, 'update']);
        Route::get('mobile/system-settings', [MobileSystemSettingsController::class, 'show']);
        Route::get('mobile/companies', [MobileSystemSettingsController::class, 'companies']);
        Route::post('mobile/companies', [MobileSystemSettingsController::class, 'storeCompany']);
        Route::put('mobile/companies/{company}', [MobileSystemSettingsController::class, 'updateCompany']);
        Route::delete('mobile/companies/{company}', [MobileSystemSettingsController::class, 'destroyCompany']);
        Route::put('mobile/system-settings', [MobileSystemSettingsController::class, 'update']);
        Route::get('mobile/sinpe-emails', [MobileSinpeEmailController::class, 'index']);
        Route::post('mobile/sinpe-emails/sync', [MobileSinpeEmailController::class, 'sync']);
        Route::patch('mobile/sinpe-emails/{id}/read', [MobileSinpeEmailController::class, 'markRead']);
        Route::post('mobile/sinpe-emails/{id}/conciliate', [MobileSinpeEmailController::class, 'conciliate']);
        Route::delete('mobile/sinpe-emails/{id}', [MobileSinpeEmailController::class, 'destroy']);
        Route::get('mobile/collections', [\App\Http\Controllers\api\CollectionsDashboardController::class, 'overview']);
        Route::post('mobile/collections/{contract}/send-payment-notice', [\App\Http\Controllers\api\CollectionsDashboardController::class, 'sendPaymentNotice']);
        Route::post('mobile/reminders/{reminder}/retry', [MobileReminderController::class, 'retry']);
        Route::post('mobile/reminders/{reminder}/send', [MobileReminderController::class, 'send']);
        Route::get('mobile/services', [MobileServiceController::class, 'index']);
        Route::post('mobile/services', [MobileServiceController::class, 'store']);
        Route::put('mobile/services/{service}', [MobileServiceController::class, 'update']);
        Route::delete('mobile/services/{service}', [MobileServiceController::class, 'destroy']);
        Route::post('mobile/service-accounts', [MobileServiceController::class, 'storeAccount']);
        Route::delete('mobile/service-accounts/{account}', [MobileServiceController::class, 'destroyAccount']);
        Route::get('mobile/accounting/indicators', [MobileAccountingController::class, 'indicators']);
        Route::get('mobile/accounting/service-clients', [MobileAccountingController::class, 'clients']);
        Route::get('mobile/accounting/delinquencies', [MobileAccountingController::class, 'delinquencies']);
        Route::post('mobile/accounting/delinquencies/{reminder}/dismiss', [MobileAccountingController::class, 'dismiss']);
    });
    Route::get('reminders/pending', [ReminderController::class, 'pending']);
    Route::get('reminders/sent-without-payment', [ReminderController::class, 'sentWithoutPayment']);
    Route::post('reminders/{reminder}/claim', [ReminderController::class, 'claim']);
    Route::post('reminders/{reminder}/acknowledge', [ReminderController::class, 'acknowledge']);
    Route::post('reminders/{reminder}/log-incoming-message', [ReminderController::class, 'logIncomingMessage']);

    Route::post('payments/{payment}/status', [PaymentController::class, 'updateStatus']);
    Route::post('payments/{payment}/receipts', [PaymentController::class, 'attachReceipt']);
    Route::post('payments/receipts/bot', [PaymentController::class, 'storeReceiptFromBot']);
    Route::post('meta/whatsapp/send-text', [MetaWhatsAppMessageController::class, 'sendText']);
    Route::post('meta/whatsapp/send-media', [MetaWhatsAppMessageController::class, 'sendMedia']);
    Route::post('meta/whatsapp/send-template', [MetaWhatsAppMessageController::class, 'sendTemplate']);
    Route::post('push/device-token', [PushDeviceTokenController::class, 'store']);
    Route::delete('push/device-token', [PushDeviceTokenController::class, 'destroy']);
    Route::post('push/web-subscription', [PushWebSubscriptionController::class, 'store']);
    Route::delete('push/web-subscription', [PushWebSubscriptionController::class, 'destroy']);

    Route::apiResource('clients', ClientController::class)->names('api.clients');
    Route::post('clients/{client}/resendAccess', [ClientController::class, 'resendAccess']);
    Route::apiResource('contracts', ContractController::class)->names('api.contracts');
    Route::get('services', [\App\Http\Controllers\Api\ServiceController::class, 'index']);
    Route::apiResource('reminders', ReminderController::class)->names('api.reminders');
    Route::apiResource('contract-types', ContractTypeController::class)->names('api.contract_types')->except(['show']);
    Route::apiResource('payments', PaymentController::class)->names('api.payments');
    Route::apiResource('conciliations', ConciliationController::class)->names('api.conciliations');

    // Application settings (key/value)
    Route::get('settings', [\App\Http\Controllers\Api\SettingsController::class, 'index']);
});

// Bot menu GET endpoint (accessible with API token for bot)
Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('whatsapp/menu', [BotMenuController::class, 'index'])->name('api.whatsapp.menu.index');
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('settings/{key}', [\App\Http\Controllers\Api\SettingsController::class, 'show']);
    Route::post('settings', [\App\Http\Controllers\Api\SettingsController::class, 'store']);
    Route::put('settings/{key}', [\App\Http\Controllers\Api\SettingsController::class, 'update']);
    Route::delete('settings/{key}', [\App\Http\Controllers\Api\SettingsController::class, 'destroy']);

    Route::prefix('whatsapp')->name('api.whatsapp.')->group(function (): void {
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
        Route::delete('by-number/{whatsappNumber}', [PaymentStatusController::class, 'resumeContactByNumber']);
        Route::delete('{clientId}/{whatsappNumber}', [PaymentStatusController::class, 'resumeContact']);
    });

    // Pending payments endpoints
    Route::prefix('summary')->group(function (): void {
        Route::get('pending-payments', [PaymentStatusController::class, 'summaryPendingPayments']);
    });

    Route::get('clients/pending-payments', [PaymentStatusController::class, 'clientsWithPendingPayments']);
    // Send reminder for a client (creates a Reminder pending to be picked by bot)
    Route::post('clients/{client}/send-reminder', [PaymentStatusController::class, 'sendReminder']);

    // Chat messages (WhatsApp conversations)
    Route::post('chats/inbound', [ChatMessageController::class, 'inbound']);
    Route::post('chats/outbound', [ChatMessageController::class, 'outbound']);
    Route::post('chats/help-request', [ChatMessageController::class, 'helpRequest']);
    Route::get('chats/outbound-queue', [ChatMessageController::class, 'outboundQueue']);
    Route::patch('chats/messages/{id}/status', [ChatMessageController::class, 'updateStatus']);
});
