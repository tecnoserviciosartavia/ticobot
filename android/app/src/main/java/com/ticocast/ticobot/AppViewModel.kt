package com.ticocast.ticobot

import android.app.Application
import android.content.res.Configuration
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import com.google.firebase.messaging.FirebaseMessaging

data class AppState(
    val token: String? = null,
    val user: MobileUser? = null,
    val clients: List<ClientItem> = emptyList(),
    val contracts: List<ContractItem> = emptyList(),
    val services: List<ServiceItem> = emptyList(),
    val chats: List<ChatItem> = emptyList(),
    val activeChat: ChatItem? = null,
    val messages: List<ChatMessageItem> = emptyList(),
    val quickReplies: List<QuickReplyItem> = emptyList(),
    val payments: List<PaymentItem> = emptyList(),
    val reminders: List<ReminderItem> = emptyList(),
    val users: List<UserItem> = emptyList(),
    val systemSettings: SystemSettings? = null,
    val finance: FinanceSummary? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val darkMode: Boolean = false,
    val biometricEnabled: Boolean = false,
    val notificationsEnabled: Boolean = true,
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
            runCatching {
                val clients = async { api.clients() }
                val contracts = async { api.contracts() }
                val services = async { api.services() }
                val chats = async { api.chats() }
                val quickReplies = async { api.quickReplies() }
                val payments = async { api.payments() }
                val reminders = async { api.reminders() }
                val users = if (state.value.user?.isAdmin == true) async { api.users() } else null
                val systemSettings = if (state.value.user?.isAdmin == true) async { api.systemSettings() } else null
                val finance = async { api.finance() }
                listOf(clients.await(), contracts.await(), chats.await(), payments.await(), reminders.await(), users?.await() ?: emptyList<UserItem>(), quickReplies.await(), systemSettings?.await(), services.await(), finance.await())
            }.onSuccess { result ->
                @Suppress("UNCHECKED_CAST")
                update { it.copy(clients = result[0] as List<ClientItem>, contracts = result[1] as List<ContractItem>, chats = result[2] as List<ChatItem>, payments = result[3] as List<PaymentItem>, reminders = result[4] as List<ReminderItem>, users = result[5] as List<UserItem>, quickReplies = result[6] as List<QuickReplyItem>, systemSettings = result[7] as SystemSettings?, services = result[8] as List<ServiceItem>, finance = result[9] as FinanceSummary, loading = false) }
            }.onFailure { error -> update { it.copy(loading = false, error = error.message) } }
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
        viewModelScope.launch {
            runCatching { api.messages(phone) }
                .onSuccess { messages ->
                    if (state.value.activeChat?.phone == phone) {
                        update { it.copy(messages = messages) }
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
                }.onFailure { error -> update { it.copy(error = error.message) } }
            }
        }
    }

    fun syncPushToken() {
        if (!state.value.notificationsEnabled || token == null) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { pushToken ->
            if (pushToken.isNotBlank()) viewModelScope.launch { runCatching { api.registerPushToken(pushToken) } }
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
