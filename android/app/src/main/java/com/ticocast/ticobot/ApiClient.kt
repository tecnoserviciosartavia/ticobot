package com.ticocast.ticobot

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class MobileUser(val name: String, val email: String, val phone: String, val isAdmin: Boolean)
data class CompanyItem(val id: Long, val name: String, val slug: String = "", val paymentContact: String = "", val beneficiaryName: String = "", val bankAccounts: String = "", val active: Boolean = true)
data class ClientItem(val id: Long, val name: String, val phone: String, val email: String, val status: String, val notes: String, val contracts: Int, val reminders: Int, val payments: Int, val companyId: Long = 0)
data class ServiceAccountItem(val id: Long, val name: String, val identifier: String, val password: String, val active: Boolean)
data class ServiceItem(val id: Long, val name: String, val price: String, val currency: String, val active: Boolean, val cost: String = "0", val paymentDay: Int = 0, val email: String = "", val password: String = "", val pin: String = "", val maxProfiles: Int = 0, val accounts: List<ServiceAccountItem> = emptyList(), val companyId: Long = 0)
data class ContractItem(val id: Long, val clientId: Long, val client: String, val amount: String, val currency: String, val status: String, val billingCycle: String, val nextDueDate: String, val graceDays: Int, val notes: String, val reminders: Int, val payments: Int, val serviceIds: List<Long> = emptyList(), val serviceNames: List<String> = emptyList())
data class ChatItem(val phone: String, val name: String, val preview: String, val unread: Int, val lastMessageId: Long = 0)
data class ChatMessageItem(val id: Long, val direction: String, val body: String, val status: String, val sentAt: String, val mediaKind: String = "", val mediaData: String = "", val mediaMimeType: String = "")
data class QuickReplyItem(val id: String, val title: String, val body: String, val builtIn: Boolean)
data class PhotoAttachment(val filename: String, val mimetype: String, val base64: String)
data class PaymentItem(val id: Long, val client: String, val amount: String, val currency: String, val status: String, val channel: String, val date: String, val reference: String = "", val contract: String = "", val conciliationId: Long = 0)
data class ConciliationItem(val id: Long, val paymentId: Long, val client: String, val contract: String, val amount: String, val currency: String, val status: String, val reference: String, val notes: String, val updatedAt: String)
data class SinpeEmailItem(val id: Long, val reference: String, val originName: String, val originPhone: String, val motive: String, val amount: String, val performedAt: String, val subject: String, val isRead: Boolean, val status: String, val client: String, val contract: String, val paymentId: Long, val conciliationId: Long, val conciliationStatus: String)
data class CollectionItem(val contractId: Long, val client: String, val phone: String, val contract: String, val amount: Double, val currency: String, val dueDate: String, val category: String)
data class DelinquencyPeriod(val reminderId: Long, val contract: String, val services: String, val period: String, val dueDate: String, val amount: Double, val currency: String, val resent: Boolean, val lastResendAt: String)
data class DelinquentClientItem(val id: Long, val name: String, val phone: String, val email: String, val remindersSent: Int, val oldestDueDate: String, val periods: List<DelinquencyPeriod>)
data class ReminderItem(val id: Long, val client: String, val status: String, val channel: String, val scheduledFor: String, val clientId: Long = 0, val contractId: Long = 0, val contract: String = "", val recurrence: String = "")
data class UserItem(val id: Long, val name: String, val email: String, val phone: String, val role: String)
data class SystemSettings(val companyName: String, val serviceName: String, val paymentContact: String, val beneficiaryName: String, val bankAccounts: String, val reminderTemplate: String)
data class AccountingIndicator(val serviceId: Long, val name: String, val currency: String, val revenue: Double, val cost: Double, val profit: Double)
data class ReceiptItem(val id: Long, val name: String, val mimeType: String, val size: Long, val receivedAt: String)
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
        paginated("clients").map { item ->
            ClientItem(item.getLong("id"), item.optString("name"), item.optString("phone"), item.nullableString("email"), item.optString("status", "active"), item.nullableString("notes"), item.optInt("contracts_count"), item.optInt("reminders_count"), item.optInt("payments_count"), item.optLong("company_id"))
        }
    }

    suspend fun contracts(): List<ContractItem> = withContext(Dispatchers.IO) {
        paginated("contracts").map { item ->
            val client = item.optJSONObject("client")
            val assigned = item.optJSONArray("services")?.mapObjects { service -> service.toServiceItem() }.orEmpty()
            ContractItem(item.getLong("id"), item.optLong("client_id", client?.optLong("id") ?: 0), client?.optString("name") ?: "Cliente", item.optString("amount"), item.optString("currency", "CRC"), item.optString("status", "active"), item.nullableString("billing_cycle"), item.nullableString("next_due_date"), item.optInt("grace_period_days"), item.nullableString("notes"), item.optInt("reminders_count"), item.optInt("payments_count"), assigned.map { it.id }, assigned.map { it.name })
        }
    }

    suspend fun services(): List<ServiceItem> = withContext(Dispatchers.IO) {
        request("services?mobile=1").getJSONArray("data").mapObjects { it.toServiceItem() }
    }

    suspend fun adminServices(): List<ServiceItem> = withContext(Dispatchers.IO) { request("mobile/services").getJSONArray("data").mapObjects { item ->
        val accounts = item.optJSONArray("accounts")?.mapObjects { a -> ServiceAccountItem(a.getLong("id"), a.nullableString("name"), a.nullableString("identifier"), a.nullableString("password"), a.optBoolean("is_active", true)) }.orEmpty()
        ServiceItem(item.getLong("id"), item.optString("name"), item.optString("price"), item.optString("currency","CRC"), item.optBoolean("is_active",true), item.optString("cost","0"), item.optInt("payment_day"), item.nullableString("account_email"), item.nullableString("password"), item.nullableString("pin"), item.optInt("max_profiles"), accounts, item.optLong("company_id"))
    } }
    suspend fun saveService(item: ServiceItem) = withContext(Dispatchers.IO) { request(if(item.id>0) "mobile/services/${item.id}" else "mobile/services", if(item.id>0) "PUT" else "POST", JSONObject().apply { put("name",item.name);put("price",item.price);put("cost",item.cost);put("payment_day",item.paymentDay.takeIf{it>0}?:JSONObject.NULL);put("account_email",item.email.ifBlank{JSONObject.NULL});put("password",item.password.ifBlank{JSONObject.NULL});put("pin",item.pin.ifBlank{JSONObject.NULL});put("max_profiles",item.maxProfiles.takeIf{it>0}?:JSONObject.NULL);put("currency",item.currency);put("is_active",item.active) }) }
    suspend fun deleteService(id:Long)=withContext(Dispatchers.IO){request("mobile/services/$id","DELETE")}
    suspend fun addServiceAccount(serviceId:Long,name:String,identifier:String,password:String)=withContext(Dispatchers.IO){request("mobile/service-accounts","POST",JSONObject().put("service_id",serviceId).put("name",name.ifBlank{JSONObject.NULL}).put("identifier",identifier).put("password",password.ifBlank{JSONObject.NULL}).put("is_active",true))}
    suspend fun deleteServiceAccount(id:Long)=withContext(Dispatchers.IO){request("mobile/service-accounts/$id","DELETE")}
    suspend fun saveClient(client: ClientItem?) = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("name", client?.name)
            put("phone", client?.phone?.ifBlank { JSONObject.NULL })
            put("email", client?.email?.ifBlank { JSONObject.NULL })
            put("status", client?.status ?: "active")
            put("notes", client?.notes?.ifBlank { JSONObject.NULL })
            put("company_id", client?.companyId?.takeIf { it > 0 } ?: JSONObject.NULL)
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
        paginated("payments").map { item -> PaymentItem(item.getLong("id"), item.optJSONObject("client")?.optString("name") ?: "Sin cliente", item.optString("amount"), item.optString("currency", "CRC"), item.optString("status"), item.optString("channel"), item.nullableString("paid_at"), item.nullableString("reference"), item.optJSONObject("contract")?.optString("name").orEmpty(), item.optJSONObject("conciliation")?.optLong("id") ?: 0) }
    }

    suspend fun conciliations(): List<ConciliationItem> = withContext(Dispatchers.IO) {
        paginated("conciliations").map { item ->
            val payment = item.optJSONObject("payment")
            ConciliationItem(
                item.getLong("id"), item.optLong("payment_id", payment?.optLong("id") ?: 0),
                payment?.optJSONObject("client")?.optString("name") ?: "Sin cliente",
                payment?.optJSONObject("contract")?.optString("name").orEmpty(),
                payment?.optString("amount").orEmpty(), payment?.optString("currency", "CRC") ?: "CRC",
                item.optString("status"), payment?.nullableString("reference").orEmpty(),
                item.nullableString("notes"), item.nullableString("updated_at"),
            )
        }
    }

    suspend fun applyPayment(clientId: Long, contractId: Long?, amount: String, currency: String, channel: String, reference: String, status: String, paidAt: String, billingMonth: String, months: Int, graceMonths: Int) = withContext(Dispatchers.IO) {
        val hasCoverage = contractId != null && billingMonth.isNotBlank()
        val coveredMonths = JSONArray()
        if (hasCoverage) repeat(months.coerceIn(1, 36)) { coveredMonths.put(java.time.YearMonth.parse(billingMonth).plusMonths(it.toLong()).toString()) }
        request("payments", "POST", JSONObject().apply {
            put("client_id", clientId); put("contract_id", contractId ?: JSONObject.NULL); put("amount", amount); put("currency", currency)
            put("channel", channel); put("reference", reference.ifBlank { JSONObject.NULL }); put("paid_at", paidAt); put("status", status)
            put("billing_month", if (hasCoverage) billingMonth else JSONObject.NULL); put("covered_months", coveredMonths)
            put("grace_months", graceMonths.coerceIn(0, 12))
            put("metadata", JSONObject().put("created_manually", true).put("source", "android-app"))
        })
    }

    suspend fun sinpeEmails(): List<SinpeEmailItem> = withContext(Dispatchers.IO) {
        request("mobile/sinpe-emails").getJSONArray("data").mapObjects { item -> SinpeEmailItem(
            item.getLong("id"), item.nullableString("reference"), item.nullableString("origin_name"), item.nullableString("origin_phone"),
            item.nullableString("motive"), item.optString("amount"), item.nullableString("performed_at"), item.nullableString("mail_subject"),
            item.optBoolean("is_read"), item.optString("status"), item.optJSONObject("client")?.optString("name").orEmpty(),
            item.optJSONObject("contract")?.optString("name").orEmpty(), item.optJSONObject("payment")?.optLong("id") ?: 0,
            item.optJSONObject("payment")?.optJSONObject("conciliation")?.optLong("id") ?: 0, item.optJSONObject("payment")?.optJSONObject("conciliation")?.optString("status").orEmpty(),
        ) }
    }

    suspend fun reviewConciliation(id: Long, status: String) = withContext(Dispatchers.IO) { request("conciliations/$id", "PUT", JSONObject().put("status", status).put("verified_at", java.time.Instant.now().toString())) }
    suspend fun deleteConciliation(id: Long) = withContext(Dispatchers.IO) { request("conciliations/$id", "DELETE") }

    suspend fun syncSinpeEmails() = withContext(Dispatchers.IO) { request("mobile/sinpe-emails/sync", "POST") }
    suspend fun markSinpeEmailRead(id: Long) = withContext(Dispatchers.IO) { request("mobile/sinpe-emails/$id/read", "PATCH") }
    suspend fun deleteSinpeEmail(id: Long) = withContext(Dispatchers.IO) { request("mobile/sinpe-emails/$id", "DELETE") }
    suspend fun conciliateSinpeEmail(id: Long, clientId: Long, contractId: Long, billingMonth: String, monthsCount: Int) = withContext(Dispatchers.IO) {
        val covered = JSONArray(); repeat(monthsCount.coerceIn(1, 36)) { offset ->
            val start = java.time.YearMonth.parse(billingMonth).plusMonths(offset.toLong()); covered.put(start.toString())
        }
        request("mobile/sinpe-emails/$id/conciliate", "POST", JSONObject().apply {
            put("client_id", clientId); put("contract_id", contractId); put("billing_month", billingMonth)
            put("months_count", monthsCount.coerceIn(1, 36)); put("covered_months", covered)
        })
    }
    suspend fun collections(days: Int = 7): List<CollectionItem> = withContext(Dispatchers.IO) {
        val response = request("mobile/collections?days=${days.coerceIn(0, 31)}")
        fun rows(key: String, category: String) = response.getJSONArray(key).mapObjects { item ->
            val contract = item.getJSONObject("contract"); val client = item.optJSONObject("client")
            CollectionItem(contract.getLong("id"), client?.optString("name") ?: "Sin cliente", client?.optString("phone").orEmpty(), contract.optString("name"), contract.optDouble("amount"), contract.optString("currency", "CRC"), contract.nullableString("next_due_date"), category)
        }
        rows("overdue", "Vencido") + rows("due_today", "Vence hoy") + rows("due_soon", "Próximo")
    }
    suspend fun sendCollectionNotice(contractId: Long) = withContext(Dispatchers.IO) { request("mobile/collections/$contractId/send-payment-notice", "POST") }
    suspend fun delinquencies(): List<DelinquentClientItem> = withContext(Dispatchers.IO) {
        request("mobile/accounting/delinquencies").getJSONArray("data").mapObjects { client ->
            val periods = client.optJSONArray("contracts")?.mapObjects { row -> DelinquencyPeriod(row.optLong("reminder_id"), row.optString("name"), row.optJSONArray("services")?.let { services -> (0 until services.length()).joinToString(", ") { services.optString(it) } }.orEmpty(), row.optString("period"), row.nullableString("due_date"), row.optDouble("amount"), row.optString("currency", "CRC"), row.optBoolean("was_resent"), row.nullableString("last_resend_at")) }.orEmpty()
            DelinquentClientItem(client.getLong("id"), client.optString("name"), client.nullableString("phone"), client.nullableString("email"), client.optInt("sent_reminders_count"), client.nullableString("oldest_due_date"), periods)
        }
    }
    suspend fun dismissDelinquency(reminderId: Long) = withContext(Dispatchers.IO) { request("mobile/accounting/delinquencies/$reminderId/dismiss", "POST") }
    suspend fun reviewPayment(payment: PaymentItem, approved: Boolean) = withContext(Dispatchers.IO) {
        val status = if (approved) "approved" else "rejected"
        if (payment.conciliationId > 0) reviewConciliation(payment.conciliationId, status)
        else request("conciliations", "POST", JSONObject().put("payment_id", payment.id).put("status", status).put("verified_at", java.time.Instant.now().toString()))
    }
    suspend fun accountingIndicators(month:String):List<AccountingIndicator> = withContext(Dispatchers.IO){ request("mobile/accounting/indicators?month=$month").getJSONArray("data").mapObjects{item->AccountingIndicator(item.optLong("service_id",item.optLong("id")),item.optString("service_name",item.optString("name")),item.optString("currency","CRC"),item.optDouble("revenue",item.optDouble("income")),item.optDouble("cost"),item.optDouble("net",item.optDouble("profit",item.optDouble("margin"))))} }
    suspend fun paymentReceipts(paymentId:Long):List<ReceiptItem> = withContext(Dispatchers.IO){ request("payments/$paymentId").optJSONArray("receipts")?.mapObjects{r->ReceiptItem(r.getLong("id"),r.optString("file_name"),r.optString("mime_type"),r.optLong("file_size"),r.nullableString("received_at"))}.orEmpty() }
    suspend fun attachReceipt(paymentId:Long,file:PhotoAttachment)=withContext(Dispatchers.IO){request("payments/receipts/bot","POST",JSONObject().put("payment_id",paymentId).put("file_base64",file.base64).put("file_name",file.filename).put("mime_type",file.mimetype).put("metadata",JSONObject().put("source","android-app")))}
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
        paginated("reminders").map { item -> ReminderItem(item.getLong("id"), item.optJSONObject("client")?.optString("name") ?: "Cliente", item.optString("status"), item.optString("channel"), item.nullableString("scheduled_for"), item.optLong("client_id"), item.optLong("contract_id"), item.optJSONObject("contract")?.optString("name").orEmpty(), item.optJSONObject("payload")?.optString("recurrence").orEmpty()) }
    }

    suspend fun saveReminder(item: ReminderItem, message: String = "") = withContext(Dispatchers.IO) {
        val body = JSONObject().apply { put("client_id", item.clientId); put("contract_id", item.contractId); put("channel", item.channel); put("scheduled_for", item.scheduledFor); put("status", item.status); put("payload", JSONObject().put("recurrence", item.recurrence).put("message", message)) }
        request(if (item.id > 0) "reminders/${item.id}" else "reminders", if (item.id > 0) "PUT" else "POST", body)
    }
    suspend fun retryReminder(id: Long) = withContext(Dispatchers.IO) { request("mobile/reminders/$id/retry", "POST") }
    suspend fun sendReminder(id: Long) = withContext(Dispatchers.IO) { request("mobile/reminders/$id/send", "POST") }
    suspend fun deleteReminder(id: Long) = withContext(Dispatchers.IO) { request("reminders/$id", "DELETE") }
    suspend fun users(): List<UserItem> = withContext(Dispatchers.IO) {
        request("mobile/users").getJSONArray("data").mapObjects { item -> UserItem(item.getLong("id"), item.optString("name"), item.optString("email"), item.nullableString("phone"), item.nullableString("profile_type").ifBlank { "admin" }) }
    }
    suspend fun companies(): List<CompanyItem> = withContext(Dispatchers.IO) { request("mobile/companies").getJSONArray("data").mapObjects { item -> CompanyItem(item.getLong("id"), item.optString("name"), item.nullableString("slug"), item.nullableString("payment_contact"), item.nullableString("beneficiary_name"), item.nullableString("bank_accounts"), item.optBoolean("is_active", true)) } }
    suspend fun saveCompany(company: CompanyItem) = withContext(Dispatchers.IO) { request(if (company.id > 0) "mobile/companies/${company.id}" else "mobile/companies", if (company.id > 0) "PUT" else "POST", JSONObject().apply { put("name", company.name); put("slug", company.slug.ifBlank { JSONObject.NULL }); put("payment_contact", company.paymentContact.ifBlank { JSONObject.NULL }); put("beneficiary_name", company.beneficiaryName.ifBlank { JSONObject.NULL }); put("bank_accounts", company.bankAccounts.ifBlank { JSONObject.NULL }); put("is_active", company.active) }) }
    suspend fun deleteCompany(id: Long) = withContext(Dispatchers.IO) { request("mobile/companies/$id", "DELETE") }

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

    suspend fun messages(phone: String, afterId: Long = 0): List<ChatMessageItem> = withContext(Dispatchers.IO) {
        val cursor = if (afterId > 0) "?after_id=$afterId" else ""
        request("mobile/chats/$phone$cursor").getJSONArray("data").mapObjects { item ->
            val media = item.optJSONObject("media")
            val mimeType = media?.nullableString("mimetype").orEmpty()
            val kind = media?.nullableString("kind").orEmpty().ifBlank { when { mimeType.startsWith("image/") -> "image"; mimeType.startsWith("audio/") -> "audio"; else -> "" } }
            ChatMessageItem(
                item.getLong("id"), item.optString("direction"),
                if (item.isNull("body")) "" else item.optString("body"), item.optString("status"), item.optString("sent_at"),
                kind, media?.nullableString("data").orEmpty(), mimeType,
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

    private fun paginated(path: String, perPage: Int = 100): List<JSONObject> {
        val rows = mutableListOf<JSONObject>()
        var page = 1
        var lastPage: Int
        do {
            val separator = if ('?' in path) "&" else "?"
            val response = request("$path${separator}per_page=$perPage&page=$page")
            val data = response.optJSONArray("data") ?: JSONArray()
            for (index in 0 until data.length()) rows += data.getJSONObject(index)
            lastPage = response.optInt("last_page", 1).coerceAtLeast(1)
            page++
        } while (page <= lastPage)
        return rows
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
