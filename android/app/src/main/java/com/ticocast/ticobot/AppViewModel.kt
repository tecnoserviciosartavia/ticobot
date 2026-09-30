package com.ticocast.ticobot

import android.app.Application
import android.content.res.Configuration
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import com.google.firebase.messaging.FirebaseMessaging

data class AppState(
    val token: String? = null,
    val user: MobileUser? = null,
    val clients: List<ClientItem> = emptyList(),
    val companies: List<CompanyItem> = emptyList(),
    val contracts: List<ContractItem> = emptyList(),
    val services: List<ServiceItem> = emptyList(),
    val chats: List<ChatItem> = emptyList(),
    val activeChat: ChatItem? = null,
    val messages: List<ChatMessageItem> = emptyList(),
    val quickReplies: List<QuickReplyItem> = emptyList(),
    val payments: List<PaymentItem> = emptyList(),
    val conciliations: List<ConciliationItem> = emptyList(),
    val sinpeEmails: List<SinpeEmailItem> = emptyList(),
    val collections: List<CollectionItem> = emptyList(),
    val delinquencies: List<DelinquentClientItem> = emptyList(),
    val reminders: List<ReminderItem> = emptyList(),
    val users: List<UserItem> = emptyList(),
    val systemSettings: SystemSettings? = null,
    val finance: FinanceSummary? = null,
    val accountingIndicators: List<AccountingIndicator> = emptyList(),
    val paymentReceipts: List<ReceiptItem> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val darkMode: Boolean = false,
    val biometricEnabled: Boolean = false,
    val notificationsEnabled: Boolean = true,
    val pushRegistered: Boolean? = null,
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences("ticobot_mobile", 0)
    private var token: String? = preferences.getString("api_token", null)
    private val api = ApiClient { token }

    private val initialDarkMode = preferences.getBoolean(
        "dark_mode",
        (application.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES,
    )
    var state = androidx.compose.runtime.mutableStateOf(AppState(token = token, darkMode = initialDarkMode, biometricEnabled = preferences.getBoolean("biometric_enabled", false), notificationsEnabled = preferences.getBoolean("notifications_enabled", true)))
        private set

    init {
        if (token != null) restoreSession()
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.login(email.trim(), password) }
                .onSuccess { (newToken, user) ->
                    token = newToken
                    preferences.edit().putString("api_token", newToken).apply()
                    update { it.copy(token = newToken, user = user, loading = false) }
                    if (state.value.notificationsEnabled) syncPushToken()
                    refresh()
                }
                .onFailure { error -> update { it.copy(loading = false, error = error.message ?: "No se pudo iniciar sesión.") } }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            val current = state.value
            val clients = runCatching { api.clients() }.getOrDefault(current.clients)
            val contracts = runCatching { api.contracts() }.getOrDefault(current.contracts)
            val chats = runCatching { api.chats() }.getOrDefault(current.chats)
            val payments = runCatching { api.payments() }.getOrDefault(current.payments)
            val reminders = runCatching { api.reminders() }.getOrDefault(current.reminders)
            val quickReplies = runCatching { api.quickReplies() }.getOrDefault(current.quickReplies)
            val services = runCatching { if (current.user?.isAdmin == true) api.adminServices() else api.services() }.getOrDefault(current.services)
            val finance = runCatching { api.finance() }.getOrNull() ?: current.finance
            var users = current.users
            var settings = current.systemSettings
            var sinpeEmails = current.sinpeEmails
            var collections = current.collections
            var delinquencies = current.delinquencies
            var companies = current.companies
            var conciliations = current.conciliations
            if (current.user?.isAdmin == true) {
                users = runCatching { api.users() }.getOrDefault(users)
                settings = runCatching { api.systemSettings() }.getOrNull() ?: settings
                sinpeEmails = runCatching { api.sinpeEmails() }.getOrDefault(sinpeEmails)
                collections = runCatching { api.collections() }.getOrDefault(collections)
                delinquencies = runCatching { api.delinquencies() }.getOrDefault(delinquencies)
                companies = runCatching { api.companies() }.getOrDefault(companies)
                conciliations = runCatching { api.conciliations() }.getOrDefault(conciliations)
            }
            update { it.copy(clients=clients,companies=companies,contracts=contracts,chats=chats,payments=payments,conciliations=conciliations,reminders=reminders,quickReplies=quickReplies,services=services,finance=finance,users=users,systemSettings=settings,sinpeEmails=sinpeEmails,collections=collections,delinquencies=delinquencies,loading=false,error=null) }
        }
    }

    fun refreshChats() {
        if (token == null) return
        viewModelScope.launch {
            runCatching { api.chats() }
                .onSuccess { chats -> update { it.copy(chats = chats) } }
        }
    }

    fun refreshActiveChat() {
        val phone = state.value.activeChat?.phone ?: return
        if (token == null) return
        val lastId = state.value.messages.lastOrNull()?.id ?: 0L
        viewModelScope.launch {
            runCatching { api.messages(phone, lastId) }
                .onSuccess { incoming ->
                    if (state.value.activeChat?.phone == phone && incoming.isNotEmpty()) {
                        update { current ->
                            current.copy(messages = (current.messages + incoming).distinctBy { it.id }.sortedBy { it.id })
                        }
                    }
                }
        }
    }
    fun logout() {
        token = null
        preferences.edit().remove("api_token").apply()
        state.value = AppState(darkMode = state.value.darkMode, biometricEnabled = state.value.biometricEnabled, notificationsEnabled = state.value.notificationsEnabled)
    }

    fun openChat(chat: ChatItem) {
        viewModelScope.launch {
            update { it.copy(activeChat = chat, messages = emptyList(), loading = true, error = null) }
            runCatching { api.messages(chat.phone) }
                .onSuccess { messages -> update { it.copy(messages = messages, loading = false) } }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun closeChat() {
        update { it.copy(activeChat = null, messages = emptyList(), error = null) }
        refreshChats()
    }

    fun deleteActiveChat(onDeleted: () -> Unit) {
        val chat = state.value.activeChat ?: return
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.deleteChat(chat.phone) }
                .onSuccess {
                    update { it.copy(activeChat = null, messages = emptyList(), loading = false) }
                    refreshChats()
                    onDeleted()
                }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun sendMessage(body: String, onSent: () -> Unit) {
        val chat = state.value.activeChat ?: return
        if (body.isBlank()) return
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.sendMessage(chat.phone, body.trim()) }
                .onSuccess {
                    onSent()
                    runCatching { api.messages(chat.phone) }
                        .onSuccess { messages -> update { it.copy(messages = messages, loading = false) } }
                        .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
                }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun createConversation(phone: String, body: String, onCreated: () -> Unit) {
        if (phone.isBlank() || body.isBlank()) return
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.createConversation(phone.trim(), body.trim()) }
                .onSuccess { chat ->
                    onCreated()
                    update { it.copy(activeChat = chat, messages = emptyList(), loading = false) }
                    runCatching { api.messages(chat.phone) }
                        .onSuccess { messages -> update { it.copy(messages = messages, loading = false) } }
                        .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
                }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun sendPhoto(body: String, photo: PhotoAttachment, onSent: () -> Unit) {
        val chat = state.value.activeChat ?: return
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.sendPhoto(chat.phone, body.trim(), photo) }
                .onSuccess {
                    onSent()
                    runCatching { api.messages(chat.phone) }
                        .onSuccess { messages -> update { it.copy(messages = messages, loading = false) } }
                        .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
                }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun addQuickReply(title: String, body: String, onSaved: () -> Unit) {
        if (title.isBlank() || body.isBlank()) return
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.addQuickReply(title.trim(), body.trim()) }
                .onSuccess { replies -> update { it.copy(quickReplies = replies, loading = false) }; onSaved() }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun clearError() = update { it.copy(error = null) }
    fun clearNotice() = update { it.copy(notice = null) }

    fun setDarkMode(enabled: Boolean) {
        preferences.edit().putBoolean("dark_mode", enabled).apply()
        update { it.copy(darkMode = enabled) }
    }

    fun setBiometricEnabled(enabled: Boolean) {
        preferences.edit().putBoolean("biometric_enabled", enabled).apply()
        update { it.copy(biometricEnabled = enabled) }
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        preferences.edit().putBoolean("notifications_enabled", enabled).apply()
        update { it.copy(notificationsEnabled = enabled) }
        FirebaseMessaging.getInstance().token.addOnSuccessListener { pushToken ->
            if (pushToken.isBlank() || token == null) return@addOnSuccessListener
            viewModelScope.launch {
                runCatching {
                    if (enabled) api.registerPushToken(pushToken) else api.unregisterPushToken(pushToken)
                }.onSuccess { update { it.copy(pushRegistered = enabled) } }
                    .onFailure { error -> update { it.copy(pushRegistered = false, error = error.message) } }
            }
        }
    }

    fun syncPushToken() {
        if (!state.value.notificationsEnabled || token == null) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { pushToken ->
            if (pushToken.isNotBlank()) viewModelScope.launch {
                runCatching { api.registerPushToken(pushToken) }
                    .onSuccess { update { it.copy(pushRegistered = true) } }
                    .onFailure { error -> update { it.copy(pushRegistered = false, error = error.message) } }
            }
        }
    }

    fun updateProfile(name: String, email: String, onSaved: () -> Unit) {
        viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.updateProfile(name, email) }.onSuccess { user -> update { it.copy(user = user, loading = false) }; onSaved() }.onFailure { error -> update { it.copy(loading = false, error = error.message) } } }
    }

    fun saveClient(client: ClientItem, onSaved: () -> Unit) {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.saveClient(client) }
                .onSuccess { update { it.copy(loading = false) }; refresh(); onSaved() }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun resendClientAccess(client: ClientItem) {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null, notice = null) }
            runCatching { api.resendClientAccess(client.id) }
                .onSuccess { message -> update { it.copy(loading = false, notice = message) } }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun saveContract(contract: ContractItem, onSaved: () -> Unit) {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.saveContract(contract) }
                .onSuccess { update { it.copy(loading = false) }; refresh(); onSaved() }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    fun saveCompany(company: CompanyItem, onSaved: () -> Unit) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.saveCompany(company); api.companies() }.onSuccess { companies -> update { it.copy(companies = companies, loading = false, notice = "Empresa guardada.") }; onSaved() }.onFailure { error -> update { it.copy(loading = false, error = error.message) } } } }
    fun deleteCompany(company: CompanyItem) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.deleteCompany(company.id); api.companies() }.onSuccess { companies -> update { it.copy(companies = companies, loading = false, notice = "Empresa eliminada.") } }.onFailure { error -> update { it.copy(loading = false, error = error.message) } } } }

    fun applyPayment(clientId: Long, contractId: Long?, amount: String, currency: String, channel: String, reference: String, status: String, paidAt: String, billingMonth: String, months: Int, graceMonths: Int, onSaved: () -> Unit) {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null, notice = null) }
            runCatching { api.applyPayment(clientId, contractId, amount, currency, channel, reference, status, paidAt, billingMonth, months, graceMonths) }
                .onSuccess { update { it.copy(loading = false, notice = "Pago aplicado correctamente.") }; refresh(); onSaved() }
                .onFailure { error -> update { it.copy(loading = false, error = error.message ?: "No se pudo aplicar el pago.") } }
        }
    }

    fun loadAccountingIndicators(month:String){viewModelScope.launch{runCatching{api.accountingIndicators(month)}.onSuccess{rows->update{it.copy(accountingIndicators=rows)}}.onFailure{e->update{it.copy(error=e.message)}}}}
    fun loadPaymentReceipts(id:Long){viewModelScope.launch{runCatching{api.paymentReceipts(id)}.onSuccess{rows->update{it.copy(paymentReceipts=rows)}}}}
    fun attachPaymentReceipt(payment:PaymentItem,file:PhotoAttachment){viewModelScope.launch{update{it.copy(loading=true,error=null)};runCatching{api.attachReceipt(payment.id,file);api.paymentReceipts(payment.id)}.onSuccess{rows->update{it.copy(paymentReceipts=rows,loading=false,notice="Comprobante adjuntado.")}}.onFailure{e->update{it.copy(loading=false,error=e.message)}}}}
    fun sendCollectionNotice(item: CollectionItem) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.sendCollectionNotice(item.contractId) }.onSuccess { update { it.copy(loading = false, notice = "Aviso enviado por WhatsApp.") } }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun resendDelinquency(period: DelinquencyPeriod) { viewModelScope.launch { update { it.copy(loading=true,error=null) }; runCatching { api.sendReminder(period.reminderId); api.delinquencies() }.onSuccess { rows -> update { it.copy(delinquencies=rows,loading=false,notice="Recordatorio reenviado; el cliente continúa como moroso.") } }.onFailure { e -> update { it.copy(loading=false,error=e.message) } } } }
    fun dismissDelinquency(period: DelinquencyPeriod) { viewModelScope.launch { update { it.copy(loading=true,error=null) }; runCatching { api.dismissDelinquency(period.reminderId); api.delinquencies() }.onSuccess { rows -> update { it.copy(delinquencies=rows,loading=false,notice="Mes archivado en el contrato.") } }.onFailure { e -> update { it.copy(loading=false,error=e.message) } } } }
    fun reviewPayment(item: PaymentItem, approved: Boolean) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.reviewPayment(item, approved); api.payments() }.onSuccess { rows -> update { it.copy(payments = rows, loading = false, notice = if (approved) "Pago aprobado." else "Pago rechazado.") }; refresh() }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun reviewConciliation(item: ConciliationItem, approved: Boolean) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.reviewConciliation(item.id, if (approved) "approved" else "rejected"); Pair(api.conciliations(), api.payments()) }.onSuccess { (conciliations, payments) -> update { it.copy(conciliations = conciliations, payments = payments, loading = false, notice = if (approved) "Conciliación aprobada." else "Conciliación rechazada.") } }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun deleteConciliation(item: ConciliationItem) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.deleteConciliation(item.id); Pair(api.conciliations(), api.payments()) }.onSuccess { (conciliations, payments) -> update { it.copy(conciliations = conciliations, payments = payments, loading = false, notice = "Conciliación eliminada.") } }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun reviewSinpeConciliation(item: SinpeEmailItem, approved: Boolean, onSaved: () -> Unit) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.reviewConciliation(item.conciliationId, if (approved) "approved" else "rejected"); api.sinpeEmails() }.onSuccess { rows -> update { it.copy(sinpeEmails = rows, loading = false, notice = if (approved) "Conciliación aprobada." else "Conciliación rechazada.") }; onSaved() }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun syncSinpeEmails() { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.syncSinpeEmails(); api.sinpeEmails() }.onSuccess { rows -> update { it.copy(sinpeEmails = rows, loading = false, notice = "Correos SINPE actualizados.") } }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun markSinpeEmailRead(item: SinpeEmailItem) { if (item.isRead) return; viewModelScope.launch { runCatching { api.markSinpeEmailRead(item.id); api.sinpeEmails() }.onSuccess { rows -> update { it.copy(sinpeEmails = rows) } } } }
    fun deleteSinpeEmail(item: SinpeEmailItem) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.deleteSinpeEmail(item.id); api.sinpeEmails() }.onSuccess { rows -> update { it.copy(sinpeEmails = rows, loading = false, notice = "Correo eliminado.") } }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun conciliateSinpeEmail(item: SinpeEmailItem, contract: ContractItem, billingMonth: String, months: Int, onSaved: () -> Unit) { viewModelScope.launch { update { it.copy(loading = true, error = null) }; runCatching { api.conciliateSinpeEmail(item.id, contract.clientId, contract.id, billingMonth, months); api.sinpeEmails() }.onSuccess { rows -> update { it.copy(sinpeEmails = rows, loading = false, notice = "Transacción enviada a revisión.") }; onSaved() }.onFailure { e -> update { it.copy(loading = false, error = e.message) } } } }
    fun saveService(item: ServiceItem,onSaved:()->Unit){viewModelScope.launch{update{it.copy(loading=true,error=null)};runCatching{api.saveService(item);api.adminServices()}.onSuccess{rows->update{it.copy(services=rows,loading=false,notice="Servicio guardado.")};onSaved()}.onFailure{e->update{it.copy(loading=false,error=e.message)}}}}
    fun deleteService(item:ServiceItem){viewModelScope.launch{update{it.copy(loading=true,error=null)};runCatching{api.deleteService(item.id);api.adminServices()}.onSuccess{rows->update{it.copy(services=rows,loading=false,notice="Servicio eliminado.")}}.onFailure{e->update{it.copy(loading=false,error=e.message)}}}}
    fun addServiceAccount(service:ServiceItem,name:String,identifier:String,password:String,onSaved:()->Unit){viewModelScope.launch{update{it.copy(loading=true,error=null)};runCatching{api.addServiceAccount(service.id,name,identifier,password);api.adminServices()}.onSuccess{rows->update{it.copy(services=rows,loading=false,notice="Cuenta agregada.")};onSaved()}.onFailure{e->update{it.copy(loading=false,error=e.message)}}}}
    fun deleteServiceAccount(account:ServiceAccountItem){viewModelScope.launch{runCatching{api.deleteServiceAccount(account.id);api.adminServices()}.onSuccess{rows->update{it.copy(services=rows,notice="Cuenta eliminada.")}}.onFailure{e->update{it.copy(error=e.message)}}}}
    fun saveReminder(item: ReminderItem, message: String, onSaved: () -> Unit) { viewModelScope.launch { update { it.copy(loading=true,error=null) }; runCatching { api.saveReminder(item,message); api.reminders() }.onSuccess { rows -> update { it.copy(reminders=rows,loading=false,notice="Recordatorio guardado.") }; onSaved() }.onFailure { e -> update { it.copy(loading=false,error=e.message) } } } }
    fun retryReminder(item: ReminderItem) { viewModelScope.launch { update { it.copy(loading=true,error=null) }; runCatching { api.retryReminder(item.id); api.reminders() }.onSuccess { update { s -> s.copy(reminders=it,loading=false,notice="Recordatorio preparado para reintento.") } }.onFailure { e -> update { it.copy(loading=false,error=e.message) } } } }
    fun sendReminder(item: ReminderItem) { viewModelScope.launch { update { it.copy(loading=true,error=null) }; runCatching { api.sendReminder(item.id); api.reminders() }.onSuccess { update { s -> s.copy(reminders=it,loading=false,notice="Recordatorio enviado.") } }.onFailure { e -> update { it.copy(loading=false,error=e.message) } } } }
    fun deleteReminder(item: ReminderItem) { viewModelScope.launch { update { it.copy(loading=true,error=null) }; runCatching { api.deleteReminder(item.id); api.reminders() }.onSuccess { update { s -> s.copy(reminders=it,loading=false,notice="Recordatorio eliminado.") } }.onFailure { e -> update { it.copy(loading=false,error=e.message) } } } }
    fun updateUserRole(user: UserItem, role: String) {
        viewModelScope.launch { runCatching { api.updateUserRole(user.id, role) }.onSuccess { refresh() }.onFailure { error -> update { it.copy(error = error.message) } } }
    }

    fun updateSystemSettings(settings: SystemSettings, onSaved: () -> Unit) {
        viewModelScope.launch {
            update { it.copy(loading = true, error = null) }
            runCatching { api.updateSystemSettings(settings) }
                .onSuccess { saved ->
                    val replies = runCatching { api.quickReplies() }.getOrDefault(state.value.quickReplies)
                    update { it.copy(systemSettings = saved, quickReplies = replies, loading = false) }
                    onSaved()
                }
                .onFailure { error -> update { it.copy(loading = false, error = error.message) } }
        }
    }

    private fun restoreSession() {
        viewModelScope.launch {
            update { it.copy(loading = true) }
            runCatching { api.me() }
                .onSuccess { user ->
                    update { it.copy(user = user, loading = false) }
                    syncPushToken()
                    refresh()
                }
                .onFailure { logout() }
        }
    }

    private fun update(transform: (AppState) -> AppState) {
        state.value = transform(state.value)
    }
}
