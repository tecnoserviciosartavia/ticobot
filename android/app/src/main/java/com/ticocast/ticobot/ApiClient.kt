package com.ticocast.ticobot

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class MobileUser(val name: String, val email: String, val phone: String, val isAdmin: Boolean)
data class ClientItem(val id: Long, val name: String, val phone: String, val email: String, val status: String, val notes: String, val contracts: Int, val reminders: Int, val payments: Int)
data class ServiceItem(val id: Long, val name: String, val price: String, val currency: String, val active: Boolean)
data class ContractItem(val id: Long, val clientId: Long, val client: String, val amount: String, val currency: String, val status: String, val billingCycle: String, val nextDueDate: String, val graceDays: Int, val notes: String, val reminders: Int, val payments: Int, val serviceIds: List<Long> = emptyList(), val serviceNames: List<String> = emptyList())
data class ChatItem(val phone: String, val name: String, val preview: String, val unread: Int, val lastMessageId: Long = 0)
data class ChatMessageItem(val id: Long, val direction: String, val body: String, val status: String, val sentAt: String, val imageData: String = "", val imageMimeType: String = "")
data class QuickReplyItem(val id: String, val title: String, val body: String, val builtIn: Boolean)
data class PhotoAttachment(val filename: String, val mimetype: String, val base64: String)
data class PaymentItem(val id: Long, val client: String, val amount: String, val currency: String, val status: String, val channel: String, val date: String)
data class ReminderItem(val id: Long, val client: String, val status: String, val channel: String, val scheduledFor: String)
data class UserItem(val id: Long, val name: String, val email: String, val phone: String, val role: String)
data class SystemSettings(val companyName: String, val serviceName: String, val paymentContact: String, val beneficiaryName: String, val bankAccounts: String, val reminderTemplate: String)
data class FinanceSummary(val period: String, val contracted: Double, val verified: Double, val pending: Double, val inReview: Double, val dueThisMonth: Double, val future: Double, val verifiedCount: Int, val reviewCount: Int)

class ApiException(message: String) : Exception(message)

class ApiClient(private val tokenProvider: () -> String?) {
    suspend fun login(email: String, password: String): Pair<String, MobileUser> = withContext(Dispatchers.IO) {
        val response = request("mobile/login", "POST", JSONObject().apply {
            put("email", email)
            put("password", password)
            put("device_name", "TicoBot Android")
        }, authenticated = false)
        val user = response.getJSONObject("user")
        response.getString("token") to user.toMobileUser()
    }

    suspend fun me(): MobileUser = withContext(Dispatchers.IO) {
        val user = request("mobile/me").getJSONObject("user")
        user.toMobileUser()
    }

    suspend fun clients(): List<ClientItem> = withContext(Dispatchers.IO) {
        request("clients?per_page=100").getJSONArray("data").mapObjects { item ->
            ClientItem(item.getLong("id"), item.optString("name"), item.optString("phone"), item.nullableString("email"), item.optString("status", "active"), item.nullableString("notes"), item.optInt("contracts_count"), item.optInt("reminders_count"), item.optInt("payments_count"))
        }
    }

    suspend fun contracts(): List<ContractItem> = withContext(Dispatchers.IO) {
        request("contracts?per_page=100").getJSONArray("data").mapObjects { item ->
            val client = item.optJSONObject("client")
            val assigned = item.optJSONArray("services")?.mapObjects { service -> service.toServiceItem() }.orEmpty()
            ContractItem(item.getLong("id"), item.optLong("client_id", client?.optLong("id") ?: 0), client?.optString("name") ?: "Cliente", item.optString("amount"), item.optString("currency", "CRC"), item.optString("status", "active"), item.nullableString("billing_cycle"), item.nullableString("next_due_date"), item.optInt("grace_period_days"), item.nullableString("notes"), item.optInt("reminders_count"), item.optInt("payments_count"), assigned.map { it.id }, assigned.map { it.name })
        }
    }

    suspend fun services(): List<ServiceItem> = withContext(Dispatchers.IO) {
        request("services?mobile=1").getJSONArray("data").mapObjects { it.toServiceItem() }
    }

    suspend fun saveClient(client: ClientItem?) = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("name", client?.name)
            put("phone", client?.phone?.ifBlank { JSONObject.NULL })
            put("email", client?.email?.ifBlank { JSONObject.NULL })
            put("status", client?.status ?: "active")
            put("notes", client?.notes?.ifBlank { JSONObject.NULL })
        }
        request(if ((client?.id ?: 0) > 0) "clients/${client!!.id}" else "clients", if ((client?.id ?: 0) > 0) "PUT" else "POST", body)
    }

    suspend fun resendClientAccess(clientId: Long): String = withContext(Dispatchers.IO) {
        request("clients/$clientId/resend-access", "POST")
            .optString("message", "Accesos reenviados correctamente.")
    }

    suspend fun saveContract(contract: ContractItem) = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("client_id", contract.clientId)
            put("amount", contract.amount)
            put("currency", contract.currency.uppercase())
            put("billing_cycle", contract.billingCycle)
            put("status", contract.status)
            put("next_due_date", contract.nextDueDate.ifBlank { JSONObject.NULL })
            put("grace_period_days", contract.graceDays)
            put("notes", contract.notes.ifBlank { JSONObject.NULL })
            put("service_ids", JSONArray(contract.serviceIds))
        }
        request(if (contract.id > 0) "contracts/${contract.id}" else "contracts", if (contract.id > 0) "PUT" else "POST", body)
    }

    suspend fun chats(): List<ChatItem> = withContext(Dispatchers.IO) {
        request("mobile/chats").getJSONArray("data").mapObjects { item ->
            val phone = item.optString("phone")
            val clientName = if (item.isNull("client_name")) "" else item.optString("client_name")
            ChatItem(phone, clientName.takeUnless { it.isBlank() || it.equals("null", true) } ?: phone, item.optString("last_body", "Sin mensajes"), item.optInt("unread_count"), item.optLong("last_message_id"))
        }.sortedByDescending { it.lastMessageId }
    }

    suspend fun quickReplies(): List<QuickReplyItem> = withContext(Dispatchers.IO) {
        request("mobile/quick-replies").getJSONArray("data").mapObjects { item ->
            QuickReplyItem(item.optString("id"), item.optString("title"), item.optString("body"), item.optBoolean("built_in"))
        }
    }

    suspend fun addQuickReply(title: String, body: String): List<QuickReplyItem> = withContext(Dispatchers.IO) {
        request("mobile/quick-replies", "POST", JSONObject().put("title", title).put("body", body)).getJSONArray("data").mapObjects { item ->
            QuickReplyItem(item.optString("id"), item.optString("title"), item.optString("body"), item.optBoolean("built_in"))
        }
    }

    suspend fun payments(): List<PaymentItem> = withContext(Dispatchers.IO) {
        request("payments?per_page=100").getJSONArray("data").mapObjects { item -> PaymentItem(item.getLong("id"), item.optJSONObject("client")?.optString("name") ?: "Sin cliente", item.optString("amount"), item.optString("currency", "CRC"), item.optString("status"), item.optString("channel"), item.nullableString("paid_at")) }
    }

    suspend fun finance(): FinanceSummary = withContext(Dispatchers.IO) {
        val item = request("mobile/finance").getJSONObject("data")
        FinanceSummary(
            item.optString("period_label"),
            item.optDouble("contracted"),
            item.optDouble("verified"),
            item.optDouble("pending"),
            item.optDouble("in_review"),
            item.optDouble("due_this_month"),
            item.optDouble("future"),
            item.optInt("verified_count"),
            item.optInt("review_count"),
        )
    }

    suspend fun reminders(): List<ReminderItem> = withContext(Dispatchers.IO) {
        request("reminders?per_page=100").getJSONArray("data").mapObjects { item -> ReminderItem(item.getLong("id"), item.optJSONObject("client")?.optString("name") ?: "Cliente", item.optString("status"), item.optString("channel"), item.nullableString("scheduled_for")) }
    }

    suspend fun users(): List<UserItem> = withContext(Dispatchers.IO) {
        request("mobile/users").getJSONArray("data").mapObjects { item -> UserItem(item.getLong("id"), item.optString("name"), item.optString("email"), item.nullableString("phone"), item.nullableString("profile_type").ifBlank { "admin" }) }
    }

    suspend fun systemSettings(): SystemSettings = withContext(Dispatchers.IO) {
        request("mobile/system-settings").getJSONObject("data").toSystemSettings()
    }

    suspend fun updateSystemSettings(settings: SystemSettings): SystemSettings = withContext(Dispatchers.IO) {
        request("mobile/system-settings", "PUT", JSONObject().apply {
            put("company_name", settings.companyName)
            put("service_name", settings.serviceName)
            put("payment_contact", settings.paymentContact)
            put("beneficiary_name", settings.beneficiaryName)
            put("bank_accounts", settings.bankAccounts)
            put("reminder_template", settings.reminderTemplate)
        }).getJSONObject("data").toSystemSettings()
    }

    suspend fun updateProfile(name: String, email: String): MobileUser = withContext(Dispatchers.IO) {
        request("mobile/profile", "PUT", JSONObject().put("name", name).put("email", email)).getJSONObject("user").toMobileUser()
    }

    suspend fun updateUserRole(id: Long, role: String) = withContext(Dispatchers.IO) {
        request("mobile/users/$id", "PUT", JSONObject().put("profile_type", role))
    }

    suspend fun messages(phone: String): List<ChatMessageItem> = withContext(Dispatchers.IO) {
        request("mobile/chats/$phone").getJSONArray("data").mapObjects { item ->
            val media = item.optJSONObject("media")
            val isImage = media?.optString("kind") == "image" || media?.optString("mimetype")?.startsWith("image/") == true
            ChatMessageItem(
                item.getLong("id"), item.optString("direction"),
                if (item.isNull("body")) "" else item.optString("body"), item.optString("status"), item.optString("sent_at"),
                if (isImage) media?.nullableString("data").orEmpty() else "",
                if (isImage) media?.nullableString("mimetype").orEmpty() else "",
            )
        }
    }

    suspend fun sendMessage(phone: String, body: String) = withContext(Dispatchers.IO) {
        request("mobile/chats/$phone", "POST", JSONObject().put("body", body))
    }

    suspend fun deleteChat(phone: String) = withContext(Dispatchers.IO) {
        request("mobile/chats/$phone", "DELETE")
    }

    suspend fun createConversation(phone: String, body: String): ChatItem = withContext(Dispatchers.IO) {
        val item = request("mobile/chats", "POST", JSONObject().put("phone", phone).put("body", body)).getJSONObject("data")
        val normalizedPhone = item.optString("phone")
        val clientName = item.nullableString("client_name")
        ChatItem(normalizedPhone, clientName.ifBlank { normalizedPhone }, item.optString("last_body"), item.optInt("unread_count"), item.optLong("last_message_id"))
    }

    suspend fun sendPhoto(phone: String, body: String, photo: PhotoAttachment) = withContext(Dispatchers.IO) {
        request("mobile/chats/$phone", "POST", JSONObject().apply {
            put("body", body.ifBlank { JSONObject.NULL })
            put("image_data", photo.base64)
            put("image_mimetype", photo.mimetype)
            put("image_filename", photo.filename)
        })
    }

    suspend fun registerPushToken(token: String) = withContext(Dispatchers.IO) {
        request("push/device-token", "POST", JSONObject().put("token", token).put("platform", "android"))
    }

    suspend fun unregisterPushToken(token: String) = withContext(Dispatchers.IO) {
        request("push/device-token", "DELETE", JSONObject().put("token", token))
    }

    private fun request(path: String, method: String = "GET", body: JSONObject? = null, authenticated: Boolean = true): JSONObject {
        val connection = URL(BuildConfig.API_BASE_URL + path).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json")
            if (authenticated) tokenProvider()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (connection.responseCode !in 200..299) {
                val message = runCatching { JSONObject(text).optString("message") }.getOrNull().orEmpty()
                throw ApiException(message.ifBlank { "No se pudo completar la solicitud (${connection.responseCode})." })
            }
            if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}

private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
    (0 until length()).map { transform(getJSONObject(it)) }

private fun JSONObject.nullableString(key: String): String =
    if (isNull(key)) "" else optString(key).takeUnless { it.equals("null", true) } ?: ""

private fun JSONObject.toMobileUser() = MobileUser(optString("name"), optString("email"), nullableString("phone"), optBoolean("is_admin"))

private fun JSONObject.toSystemSettings() = SystemSettings(nullableString("company_name"), nullableString("service_name"), nullableString("payment_contact"), nullableString("beneficiary_name"), nullableString("bank_accounts"), nullableString("reminder_template"))
private fun JSONObject.toServiceItem() = ServiceItem(getLong("id"), optString("name"), optString("price"), optString("currency", "CRC"), optBoolean("is_active", true))
