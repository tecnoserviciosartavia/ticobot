import "./chunk-VUNV25KB.js";

// src/config.ts
import dotenv from "dotenv";
import { z } from "zod";
dotenv.config({ path: process.env.BOT_ENV_PATH ?? void 0 });
var configSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiToken: z.string().min(1, "Se requiere un token de API para autenticar el bot"),
  pollIntervalMs: z.string().optional().transform((value) => value ? Number.parseInt(value, 10) : 3e4).pipe(z.number().int().min(5e3).max(6e5)),
  lookAheadMinutes: z.string().optional().transform((value) => value ? Number.parseInt(value, 10) : 30).pipe(z.number().int().min(1).max(240)),
  maxBatch: z.string().optional().transform((value) => value ? Number.parseInt(value, 10) : 20).pipe(z.number().int().min(1).max(100)),
  sessionPath: z.string().default("storage/whatsapp-session"),
  defaultCountryCode: z.string().default("506"),
  logLevel: z.string().default("info"),
  menuPath: z.string().optional(),
  paymentContact: z.string().optional(),
  bankAccountsRaw: z.string().optional(),
  beneficiaryName: z.string().optional(),
  serviceName: z.string().optional()
});
var parsed = configSchema.parse({
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  apiToken: process.env.BOT_API_TOKEN,
  pollIntervalMs: process.env.BOT_POLL_INTERVAL_MS,
  lookAheadMinutes: process.env.BOT_LOOK_AHEAD_MINUTES,
  maxBatch: process.env.BOT_MAX_BATCH,
  sessionPath: process.env.BOT_SESSION_PATH,
  defaultCountryCode: process.env.BOT_DEFAULT_COUNTRY_CODE,
  logLevel: process.env.BOT_LOG_LEVEL,
  menuPath: process.env.BOT_MENU_PATH,
  paymentContact: process.env.BOT_PAYMENT_CONTACT,
  bankAccountsRaw: process.env.BOT_BANK_ACCOUNTS,
  beneficiaryName: process.env.BOT_BENEFICIARY_NAME,
  serviceName: process.env.BOT_SERVICE_NAME
});
var config = {
  ...parsed,
  pollIntervalMs: parsed.pollIntervalMs,
  lookAheadMinutes: parsed.lookAheadMinutes,
  maxBatch: parsed.maxBatch,
  bankAccounts: parsed.bankAccountsRaw ? String(parsed.bankAccountsRaw).split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean) : [],
  paymentContact: parsed.paymentContact ?? "",
  beneficiaryName: parsed.beneficiaryName ?? "",
  serviceName: parsed.serviceName ?? ""
};

// src/logger.ts
import pino from "pino";
var logger = pino({
  name: "ticobot-whatsapp",
  level: config.logLevel,
  transport: process.env.NODE_ENV === "production" ? void 0 : {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss"
    }
  }
});

// src/reminder-processor.ts
import pRetry2 from "p-retry";

// src/api-client.ts
import axios from "axios";
import pRetry from "p-retry";
var ApiClient = class {
  http;
  constructor() {
    this.http = axios.create({
      baseURL: `${config.apiBaseUrl.replace(/\/$/, "")}/`,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiToken}`
      },
      timeout: 15e3
    });
  }
  async fetchPendingReminders() {
    const response = await this.http.get("reminders/pending", {
      params: {
        look_ahead: config.lookAheadMinutes,
        limit: config.maxBatch
      }
    });
    return response.data;
  }
  async acknowledgeReminder(reminderId, payload) {
    await this.http.post(`reminders/${reminderId}/acknowledge`, payload);
  }
  async markQueued(reminder) {
    const nextAttempts = Math.min((reminder.attempts || 0) + 1, 100);
    await this.http.patch(`reminders/${reminder.id}`, {
      status: "queued",
      attempts: nextAttempts,
      queued_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  /**
   * Revert a reminder previously claimed (queued) back to pending so it can be retried later.
   */
  async revertToPending(reminderId, attempts) {
    const payload = {
      status: "pending",
      queued_at: null
    };
    if (typeof attempts === "number") payload.attempts = attempts;
    await this.http.patch(`reminders/${reminderId}`, payload);
  }
  async markSent(reminderId) {
    await pRetry(async () => {
      try {
        await this.http.patch(`reminders/${reminderId}`, {
          status: "sent",
          sent_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (err) {
        logger.warn({ reminderId, err: err?.response?.data ?? err?.message ?? err }, "Error marcando recordatorio como enviado, reintentando");
        throw err;
      }
    }, { retries: 2 });
  }
  async reportWhatsappQr(qr) {
    await this.http.post("whatsapp/qr", { qr });
  }
  async markWhatsappReady() {
    await this.http.post("whatsapp/ready");
  }
  async markWhatsappDisconnected(reason) {
    const payload = reason && reason.trim().length > 0 ? { reason } : {};
    await this.http.post("whatsapp/disconnected", payload);
  }
  async fetchBotMenu() {
    const response = await this.http.get("whatsapp/menu");
    return response.data;
  }
  // --- Admin / management helper endpoints (asunciones sobre la API) ---
  async findCustomerByPhone(phone) {
    const onlyDigits = (s) => String(s || "").replace(/[^0-9]/g, "");
    const pd = onlyDigits(phone);
    const last8 = pd.slice(-8);
    const candidates = [];
    const pushUnique = (arr, item) => {
      if (!item) return;
      const id = item.id ?? item.ID ?? JSON.stringify(item);
      if (!arr.find((x) => (x.id ?? x.ID) === id)) arr.push(item);
    };
    const tryFetch = async (term) => {
      const res = await this.http.get("clients", { params: { search: term, per_page: 50 } });
      const list = Array.isArray(res.data) ? res.data : res.data && Array.isArray(res.data.data) ? res.data.data : [];
      for (const it of list) pushUnique(candidates, it);
    };
    try {
      if (last8 && last8.length >= 4) await tryFetch(last8);
    } catch {
    }
    try {
      await tryFetch(pd);
    } catch {
    }
    try {
      await tryFetch(phone);
    } catch {
    }
    const exact = candidates.find((c) => onlyDigits(c.phone || "") === pd);
    if (exact) return exact;
    const ends = candidates.find((c) => onlyDigits(c.phone || "").endsWith(last8));
    if (ends) return ends;
    return candidates.length ? candidates[0] : null;
  }
  async upsertCustomer(payload) {
    const body = Object.assign({}, payload);
    if (!body.name) body.name = String(body.phone || "");
    if (!body.status) body.status = "active";
    const res = await this.http.post("clients", body);
    return res.data;
  }
  async createSubscription(payload) {
    const res = await this.http.post("subscriptions", payload);
    return res.data;
  }
  async listSubscriptions(phone) {
    const res = await this.http.get("subscriptions", { params: phone ? { phone } : {} });
    return res.data;
  }
  async listContracts(params) {
    const res = await this.http.get("contracts", { params: params || {} });
    const body = res.data;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.data)) return body.data;
    return [];
  }
  async getContract(id) {
    const res = await this.http.get(`contracts/${id}`);
    return res.data;
  }
  async listPaymentsUpcoming(phone, days) {
    const res = await this.http.get("payments/upcoming", { params: { phone, days } });
    return res.data;
  }
  async listTransactions(phone, limit = 20) {
    const res = await this.http.get("transactions", { params: { phone, limit } });
    return res.data;
  }
  async deleteTransaction(id) {
    const res = await this.http.delete(`transactions/${id}`);
    return res.data;
  }
  async listReceiptsByDate(date) {
    const res = await this.http.get("receipts", { params: { date } });
    return res.data;
  }
  async createReceiptForClient(payload) {
    const candidates = ["receipts/for-client", "receipts", "payments/receipts", "receipts/create"];
    let lastErr = null;
    for (const ep of candidates) {
      try {
        const res = await this.http.post(ep, payload);
        if (ep !== candidates[0]) {
          logger.info({ ep, payload }, "createReceiptForClient used fallback endpoint");
        }
        return res.data;
      } catch (err) {
        lastErr = err;
        const status = err && err.response && err.response.status;
        if (status === 404) {
          logger.debug({ ep, status, body: err.response && err.response.data }, "Endpoint no disponible, probando siguiente fallback");
          continue;
        }
        throw err;
      }
    }
    const info = { message: "No disponible endpoint para createReceiptForClient" };
    if (lastErr && lastErr.response) {
      info.status = lastErr.response.status;
      info.data = lastErr.response.data;
    }
    logger.warn(info, "createReceiptForClient fallo en todos los endpoints candidatos");
    const e = new Error("createReceiptForClient failed: " + JSON.stringify(info));
    throw e;
  }
  async createPayment(payload) {
    const res = await this.http.post("payments", payload);
    return res.data;
  }
  async getSettings() {
    const res = await this.http.get("settings");
    return res.data || {};
  }
  async updatePayment(paymentId, payload) {
    const res = await this.http.patch(`payments/${paymentId}`, payload);
    return res.data;
  }
  async sendReceipt(receiptId) {
    const res = await this.http.post(`receipts/${receiptId}/send`);
    return res.data;
  }
  async deleteCustomer(id) {
    const res = await this.http.delete(`clients/${id}`);
    return res.data;
  }
  async deleteSubscriptionsByPhone(phone) {
    const res = await this.http.delete("subscriptions", { params: { phone } });
    return res.data;
  }
  async deleteContractsByPhone(phone) {
    const client = await this.findCustomerByPhone(phone);
    if (!client) throw new Error("Cliente no encontrado");
    const contracts = await this.listContracts({ client_id: client.id });
    for (const c of contracts) {
      await this.http.delete(`contracts/${c.id}`);
    }
    return { deleted: contracts.length };
  }
  async listPayments(params) {
    const res = await this.http.get("payments", { params: params || {} });
    const body = res.data;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.data)) return body.data;
    return [];
  }
  async getPayment(id) {
    const res = await this.http.get(`payments/${id}`);
    return res.data;
  }
  async createConciliation(payload) {
    const res = await this.http.post("conciliations", payload);
    return res.data;
  }
  async storeReceiptFromBot(payload) {
    const res = await this.http.post("payments/receipts/bot", payload);
    return res.data;
  }
  async fetchSentRemindersWithoutPayment(startDate, endDate) {
    const response = await this.http.get("reminders/sent-without-payment", {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    });
    return response.data;
  }
  /**
   * Fetch data from the backend API (generic helper).
   */
  async fetchFromBackend(path2) {
    try {
      const response = await this.http.get(path2);
      return response.data;
    } catch (error) {
      logger.debug({ error: error?.message, path: path2 }, "fetchFromBackend error");
      throw error;
    }
  }
  async requestToBackend(method, path2, data) {
    try {
      const res = await this.http.request({ method, url: path2, data });
      return res.data;
    } catch (error) {
      logger.debug({ error: error?.message, method, path: path2 }, "requestToBackend error");
      throw error;
    }
  }
  /**
   * Get payment status for a phone number.
   */
  async getPaymentStatus(phone) {
    return this.fetchFromBackend(`/payment-status/${phone}`);
  }
  /**
   * Check if a contact is paused.
   */
  async checkPausedContact(whatsappNumber) {
    try {
      const res = await this.fetchFromBackend(`/paused-contacts/check/${whatsappNumber}`);
      return res?.is_paused === true;
    } catch (e) {
      return false;
    }
  }
  async pauseContact(payload) {
    return this.requestToBackend("POST", "/paused-contacts", payload);
  }
  async resumeContact(payload) {
    const { client_id, whatsapp_number } = payload;
    return this.requestToBackend("DELETE", `/paused-contacts/${client_id}/${whatsapp_number}`);
  }
  async resumeContactByNumber(payload) {
    const { whatsapp_number } = payload;
    return this.requestToBackend("DELETE", `/paused-contacts/by-number/${whatsapp_number}`);
  }
  async listPausedContacts() {
    return this.requestToBackend("GET", "/paused-contacts");
  }
};
var apiClient = new ApiClient();

// src/reminder-processor.ts
var buildMessage = (reminder) => {
  const payload = reminder.payload ?? {};
  const lines = [];
  function renderTemplate(tpl) {
    return String(tpl).replace(/\{client_name\}/g, reminder.client?.name ?? "").replace(/\{amount\}/g, String(payload.amount ?? "")).replace(/\{due_date\}/g, String(payload.due_date ?? ""));
  }
  const clientName = reminder.client?.name ?? "";
  const serviceName = payload.service_name ?? (config.serviceName || "TicoCast");
  let dueDate = payload.due_date ?? "";
  if (!dueDate && reminder.contract?.next_due_date) {
    const dueDateObj = new Date(reminder.contract.next_due_date);
    dueDate = dueDateObj.toLocaleDateString("es-CR", { day: "2-digit", month: "long", year: "numeric" });
  }
  const rawAmount = reminder.contract?.amount ?? payload.amount ?? "0";
  const amountNum = Number(String(rawAmount).replace(/[^0-9\.\-]/g, "")) || 0;
  const amountFmt = amountNum ? amountNum.toLocaleString("es-CR") : "0";
  lines.push(`${serviceName}, le informa que su Suscripci\xF3n de Servicios de Entretenimiento:
`);
  if (dueDate) lines.push(`Ha Vencido ${dueDate}`);
  lines.push(`Total: \u20A1${amountFmt}`);
  lines.push("");
  lines.push("En caso de no recibir respuesta, nos vemos en la necesidad de Liberar el Perfil de su Suscripci\xF3n.");
  lines.push("");
  lines.push("Si desea volver a disfrutar de nuestros servicios, puede realizar el pago correspondiente y con gusto le proporcionaremos una Cuenta Nueva.");
  lines.push("");
  lines.push("Renovarla es f\xE1cil!, solo realice el pago y env\xEDenos el comprobante.");
  lines.push("");
  if (config.paymentContact && String(config.paymentContact).trim()) {
    lines.push(`Sinpem\xF3vil: ${String(config.paymentContact).trim()}`);
  }
  lines.push("");
  lines.push("Para dep\xF3sitos:");
  lines.push("");
  if (Array.isArray(config.bankAccounts) && config.bankAccounts.length) {
    for (const acct of config.bankAccounts) {
      lines.push(acct);
    }
  }
  lines.push("");
  if (config.beneficiaryName && String(config.beneficiaryName).trim()) {
    lines.push(`Todas a nombre de ${String(config.beneficiaryName).trim()}`);
  }
  lines.push("");
  lines.push("Si ya cancel\xF3, omita el mensaje");
  if (payload.message) {
    lines.push("");
    lines.push(renderTemplate(String(payload.message)));
  }
  if (payload.options?.length) {
    lines.push("Responda con una de las siguientes opciones:");
    payload.options.forEach((option) => {
      lines.push(`${option.key}. ${option.label}`);
    });
  }
  return {
    content: lines.join("\n"),
    attachments: []
  };
};
var ReminderProcessor = class {
  constructor(whatsapp) {
    this.whatsapp = whatsapp;
  }
  lastResendCheck = null;
  async runBatch() {
    const reminders = await apiClient.fetchPendingReminders();
    if (!reminders.length) {
      logger.debug("No hay recordatorios pendientes por enviar.");
    } else {
      for (const reminder of reminders) {
        await this.processReminder(reminder);
      }
    }
    await this.checkAndResendUnpaidReminders();
  }
  async processReminder(reminder) {
    try {
      await apiClient.markQueued(reminder);
      await pRetry2(() => this.sendReminder(reminder), {
        retries: 3,
        factor: 2,
        onFailedAttempt: (error) => {
          logger.warn({
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            reminderId: reminder.id,
            cause: error.cause
          }, "Fallo al enviar recordatorio, reintentando");
        }
      });
      await apiClient.markSent(reminder.id);
      logger.info({ reminderId: reminder.id }, "Recordatorio enviado correctamente");
    } catch (error) {
      logger.error({ err: error, reminderId: reminder.id }, "No se pudo enviar el recordatorio");
      try {
        const attempts = typeof reminder.attempts === "number" ? reminder.attempts : void 0;
        await apiClient.revertToPending(reminder.id, attempts);
        logger.info({ reminderId: reminder.id }, "Recordatorio revertido a pending para reintento futuro");
      } catch (err) {
        logger.error({ err, reminderId: reminder.id }, "Error revirtiendo recordatorio a pending");
      }
    }
  }
  async sendReminder(reminder) {
    if (!reminder.contract && reminder.contract_id) {
      try {
        const c = await apiClient.getContract(reminder.contract_id);
        if (c) reminder.contract = c;
      } catch (err) {
        logger.warn({ err, reminderId: reminder.id, contractId: reminder.contract_id }, "No se pudo obtener contrato para el recordatorio");
      }
    }
    const payload = reminder.payload ?? {};
    const rawAmount = reminder.contract?.amount ?? payload.amount ?? "0";
    logger.info({ reminderId: reminder.id, contractId: reminder.contract_id, rawAmount }, "Resolved amount for reminder");
    const messagePayload = buildMessage(reminder);
    await this.whatsapp.sendReminder(reminder, messagePayload);
  }
  /**
   * Verifica si es después de las 5 PM y reenvía recordatorios del día que no han sido conciliados
   */
  async checkAndResendUnpaidReminders() {
    const now = /* @__PURE__ */ new Date();
    const hour = now.getHours();
    if (hour < 17) {
      return;
    }
    if (this.lastResendCheck) {
      const lastCheckDate = this.lastResendCheck.toDateString();
      const currentDate = now.toDateString();
      if (lastCheckDate === currentDate) {
        return;
      }
    }
    try {
      logger.info("Verificando recordatorios del d\xEDa sin conciliar para reenv\xEDo...");
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const sentReminders = await apiClient.fetchSentRemindersWithoutPayment(
        todayStart.toISOString(),
        todayEnd.toISOString()
      );
      if (!sentReminders.length) {
        logger.debug("No hay recordatorios del d\xEDa sin conciliar.");
        this.lastResendCheck = now;
        return;
      }
      logger.info({ count: sentReminders.length }, "Reenviando recordatorios sin conciliar del d\xEDa");
      for (const reminder of sentReminders) {
        try {
          const originalPayload = reminder.payload ?? {};
          const resendPayload = {
            ...originalPayload,
            message: "\u26A0\uFE0F RECORDATORIO ADICIONAL \u26A0\uFE0F\n\nNo hemos recibido su comprobante de pago del d\xEDa de hoy.\n\n" + (originalPayload.message || "")
          };
          const reminderWithResendMessage = { ...reminder, payload: resendPayload };
          const messagePayload = buildMessage(reminderWithResendMessage);
          await this.whatsapp.sendReminder(reminder, messagePayload);
          logger.info({ reminderId: reminder.id }, "Recordatorio reenviado exitosamente");
          await new Promise((resolve) => setTimeout(resolve, 2e3));
        } catch (error) {
          logger.error({ err: error, reminderId: reminder.id }, "Error reenviando recordatorio");
        }
      }
      this.lastResendCheck = now;
      logger.info("Proceso de reenv\xEDo completado");
    } catch (error) {
      logger.error({ err: error }, "Error en verificaci\xF3n de recordatorios sin conciliar");
    }
  }
};

// src/whatsapp-client.ts
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";

// src/utils/phone.ts
var digitsOnly = (s) => String(s || "").replace(/[^0-9]/g, "");
var formatWhatsAppId = (rawPhone) => {
  const digits = digitsOnly(rawPhone);
  if (digits.length < 8) {
    throw new Error(`El n\xFAmero ${rawPhone} no parece v\xE1lido para WhatsApp.`);
  }
  const hasCountry = digits.length >= 11;
  const normalized = hasCountry ? digits : `${config.defaultCountryCode}${digits.replace(/^0+/, "")}`;
  return `${normalized}@c.us`;
};

// src/whatsapp-client.ts
import { exec as _exec } from "child_process";
import { promisify } from "util";
var { Client, LocalAuth, MessageMedia } = pkg;
var exec = promisify(_exec);
function parseEnvBool(value, defaultValue) {
  if (value == null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return defaultValue;
}
var WhatsAppClient = class {
  client;
  inboundHandler;
  listenersAttached = false;
  restartInProgress = false;
  isReady = false;
  authenticatedAt = null;
  authStuckTimer = null;
  authStuckRestarted = false;
  lastRestartAt = null;
  restartCountWindow = [];
  debugMessages;
  enableMessagePolling;
  markMessagesRead;
  enableAutoRestartOnStuck;
  stuckCheckIntervalMs;
  messagePollTimer = null;
  messagePollNextAt = null;
  processedMessageIds = /* @__PURE__ */ new Map();
  messagePollConsecutiveFailures = 0;
  messagePollingDisabledLogged = false;
  wwebjsStubsApplied = false;
  async applyWwebjsSafetyStubs() {
    try {
      const page = this.client.pupPage;
      if (page && typeof page.evaluate === "function") {
        await page.evaluate(() => {
          try {
            if (!window.WWebJS) window.WWebJS = {};
            window.WWebJS.markedUnread = false;
            window.WWebJS.sendSeen = async () => {
              return;
            };
            const Store = window.Store;
            if (Store) {
              if (!Store.GroupMetadata) Store.GroupMetadata = {};
              if (typeof Store.GroupMetadata.update !== "function") {
                Store.GroupMetadata.update = async () => {
                  return;
                };
              }
              if (!Store.NewsletterMetadataCollection) Store.NewsletterMetadataCollection = {};
              if (typeof Store.NewsletterMetadataCollection.update !== "function") {
                Store.NewsletterMetadataCollection.update = async () => {
                  return;
                };
              }
            }
          } catch {
          }
        });
      }
    } catch (e) {
      logger.debug({ e }, "No se pudo aplicar sendSeen noop");
    }
  }
  async ensureWwebjsStubsApplied() {
    if (this.wwebjsStubsApplied) return;
    try {
      await this.applyWwebjsSafetyStubs();
      this.wwebjsStubsApplied = true;
    } catch {
    }
  }
  async listUnreadChatsLightweight(maxChats) {
    try {
      const page = this.client.pupPage;
      if (!page || typeof page.evaluate !== "function") return [];
      const result = await page.evaluate((limit) => {
        try {
          const Store = window.Store;
          const arr = Store?.Chat?.getModelsArray?.() || [];
          return arr.map((c) => ({ id: c?.id?._serialized ? String(c.id._serialized) : null, unreadCount: Number(c?.unreadCount || 0) })).filter((x) => x && x.id && x.unreadCount > 0).sort((a, b) => b.unreadCount - a.unreadCount).slice(0, Math.max(1, Number(limit || 1)));
        } catch {
          return [];
        }
      }, maxChats);
      if (!Array.isArray(result)) return [];
      return result.filter((x) => x && typeof x.id === "string").map((x) => ({ id: String(x.id), unreadCount: Number(x.unreadCount || 0) }));
    } catch (error) {
      logger.debug({ err: error }, "No se pudo listar chats no le\xEDdos (lightweight)");
      return [];
    }
  }
  async markChatIdAsReadBestEffort(chatId) {
    if (!this.markMessagesRead) return;
    if (!chatId) return;
    if (String(chatId).endsWith("@broadcast")) return;
    try {
      const page = this.client.pupPage;
      if (page && typeof page.evaluate === "function") {
        await page.evaluate(async (cid) => {
          try {
            const chat = await window.WWebJS?.getChat?.(cid, { getAsModel: false });
            const cmd = window.Store?.Cmd;
            if (chat && cmd && typeof cmd.markChatUnread === "function") {
              await cmd.markChatUnread(chat, false);
            }
          } catch {
          }
        }, chatId);
      }
    } catch (error) {
      logger.debug({ err: error, chatId }, "No se pudo marcar chat como le\xEDdo (markChatUnread=false)");
    }
  }
  async markChatAsSeenBestEffort(message) {
    if (!this.markMessagesRead) return;
    try {
      if (message.fromMe) return;
      if (String(message.from || "").endsWith("@broadcast")) return;
      const chatId = String(message.from || "");
      if (!chatId) return;
      await this.markChatIdAsReadBestEffort(chatId);
    } catch (error) {
      const msg = error?.message || String(error);
      logger.debug({ err: error, msg }, "No se pudo marcar chat como le\xEDdo (ignored)");
    }
  }
  markProcessedMessage(id) {
    const now = Date.now();
    this.processedMessageIds.set(id, now);
    const TTL_MS = 24 * 60 * 60 * 1e3;
    if (this.processedMessageIds.size > 5e3) {
      for (const [key, ts] of this.processedMessageIds) {
        if (now - ts > TTL_MS) this.processedMessageIds.delete(key);
      }
      while (this.processedMessageIds.size > 5e3) {
        const oldestKey = this.processedMessageIds.keys().next().value;
        if (!oldestKey) break;
        this.processedMessageIds.delete(oldestKey);
      }
    }
  }
  stopMessagePolling() {
    if (this.messagePollTimer) {
      clearInterval(this.messagePollTimer);
      this.messagePollTimer = null;
    }
    this.messagePollNextAt = null;
  }
  kickMessagePollingSoon() {
    if (!this.enableMessagePolling) return;
    if (!this.inboundHandler) return;
    if (!this.isReady) return;
    const now = Date.now();
    const desiredAt = now + 250;
    if (this.messagePollTimer && this.messagePollNextAt && this.messagePollNextAt <= desiredAt) {
      return;
    }
    if (this.messagePollTimer) {
      clearTimeout(this.messagePollTimer);
      this.messagePollTimer = null;
    }
    this.messagePollNextAt = desiredAt;
    this.messagePollTimer = setTimeout(() => {
      this.messagePollTimer = null;
      void this.runMessagePollingTick();
    }, Math.max(0, desiredAt - now));
  }
  async runMessagePollingTick() {
    if (!this.isReady) return;
    if (!this.inboundHandler) return;
    const idleIntervalMs = Number(process.env.BOT_MESSAGE_POLL_IDLE_MS || 3e3);
    const activeIntervalMs = Number(process.env.BOT_MESSAGE_POLL_ACTIVE_MS || 2e3);
    const maxChats = Number(process.env.BOT_MESSAGE_POLL_MAX_CHATS || 5);
    const maxPerChat = Number(process.env.BOT_MESSAGE_POLL_MAX_PER_CHAT || 15);
    let nextDelay = idleIntervalMs;
    try {
      const unreadChats = await this.listUnreadChatsLightweight(maxChats);
      this.messagePollConsecutiveFailures = 0;
      if (unreadChats.length > 0) {
        nextDelay = activeIntervalMs;
      }
      for (const c of unreadChats) {
        const unreadCount = Math.min(Number(c.unreadCount || 0), Math.max(1, maxPerChat));
        if (unreadCount <= 0) continue;
        let chat = null;
        let messages = [];
        try {
          chat = await this.client.getChatById?.(c.id);
          if (!chat) continue;
          messages = await chat.fetchMessages({ limit: Math.max(8, Math.min(maxPerChat, unreadCount + 3)) });
        } catch (error) {
          logger.debug({ err: error, chatId: c.id }, "No se pudo fetchMessages en polling");
          continue;
        }
        for (const message of messages) {
          const id = message?.id?._serialized;
          if (!id) continue;
          if (message.fromMe) continue;
          if (this.processedMessageIds.has(id)) continue;
          if (String(message.from || "").endsWith("@broadcast")) continue;
          this.markProcessedMessage(id);
          logger.info(
            { id, from: message.from, chatId: c.id, unreadCount: chat?.unreadCount ?? unreadCount },
            "Procesando mensaje v\xEDa polling (fallback)"
          );
          try {
            await this.inboundHandler(message);
          } catch (error) {
            logger.error({ err: error }, "Error manejando mensaje entrante (polling)");
          }
        }
        await this.markChatIdAsReadBestEffort(c.id);
      }
    } catch (error) {
      this.messagePollConsecutiveFailures += 1;
      const failures = this.messagePollConsecutiveFailures;
      logger.warn({ err: error, failures }, "Polling de mensajes fall\xF3");
      nextDelay = Math.max(5e3, idleIntervalMs);
      if (failures >= 3) {
        logger.error({ failures }, "Polling de mensajes fall\xF3 repetidamente; deteniendo polling y reiniciando WhatsApp");
        this.stopMessagePolling();
        void this.safeRestart("message_polling_failed");
        return;
      }
    }
    const now = Date.now();
    const delay = Math.max(250, Number.isFinite(nextDelay) ? nextDelay : idleIntervalMs);
    this.messagePollNextAt = now + delay;
    this.messagePollTimer = setTimeout(() => {
      this.messagePollTimer = null;
      void this.runMessagePollingTick();
    }, delay);
  }
  startMessagePolling() {
    if (!this.enableMessagePolling) {
      if (!this.messagePollingDisabledLogged) {
        this.messagePollingDisabledLogged = true;
        logger.info("Polling de mensajes (fallback) deshabilitado; setea BOT_ENABLE_MESSAGE_POLLING=true para activarlo.");
      }
      return;
    }
    if (!this.inboundHandler) return;
    if (this.messagePollTimer) return;
    const idleIntervalMs = Number(process.env.BOT_MESSAGE_POLL_IDLE_MS || 3e3);
    const activeIntervalMs = Number(process.env.BOT_MESSAGE_POLL_ACTIVE_MS || 2e3);
    logger.warn({ idleIntervalMs, activeIntervalMs }, "Iniciando polling de mensajes (fallback)");
    this.messagePollNextAt = Date.now();
    this.messagePollTimer = setTimeout(() => {
      this.messagePollTimer = null;
      void this.runMessagePollingTick();
    }, 0);
  }
  constructor() {
    const headless = parseEnvBool(process.env.BOT_HEADLESS, true);
    const userAgent = (process.env.BOT_USER_AGENT || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36").trim();
    const wwebVersion = (process.env.BOT_WWEB_VERSION || "").trim() || void 0;
    const wwebCacheType = (process.env.BOT_WWEB_CACHE_TYPE || "").trim() || void 0;
    const wwebCacheStrict = parseEnvBool(process.env.BOT_WWEB_CACHE_STRICT, Boolean(wwebVersion));
    const wwebCachePath = (process.env.BOT_WWEB_CACHE_PATH || "").trim() || void 0;
    const wwebRemotePath = (process.env.BOT_WWEB_CACHE_REMOTE_PATH || "").trim() || "https://cdn.jsdelivr.net/gh/wppconnect-team/wa-version@main/html/{version}.html";
    const disableWwebjsPatches = parseEnvBool(process.env.BOT_DISABLE_WWEBJS_PATCHES, false);
    this.debugMessages = parseEnvBool(process.env.BOT_DEBUG_MESSAGES, false);
    this.enableMessagePolling = parseEnvBool(process.env.BOT_ENABLE_MESSAGE_POLLING, false);
    this.markMessagesRead = parseEnvBool(process.env.BOT_MARK_MESSAGES_READ, true);
    this.enableAutoRestartOnStuck = parseEnvBool(process.env.BOT_AUTO_RESTART_ON_STUCK, false);
    this.stuckCheckIntervalMs = Number(process.env.BOT_STUCK_CHECK_INTERVAL_MS || 12e4);
    logger.info(
      {
        headless,
        hasCustomUserAgent: Boolean(process.env.BOT_USER_AGENT),
        wwebVersion: wwebVersion ?? null,
        wwebCacheType: wwebCacheType ?? null,
        wwebCacheStrict,
        disableWwebjsPatches,
        debugMessages: this.debugMessages,
        enableMessagePolling: this.enableMessagePolling,
        markMessagesRead: this.markMessagesRead
      },
      "Inicializando WhatsApp (puppeteer)"
    );
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
      ...wwebVersion ? {
        webVersion: wwebVersion,
        webVersionCache: wwebCacheType === "none" ? { type: "none" } : wwebCacheType === "local" ? { type: "local", path: wwebCachePath, strict: wwebCacheStrict } : {
          // default al usar BOT_WWEB_VERSION: remote cache
          type: "remote",
          remotePath: wwebRemotePath,
          strict: wwebCacheStrict
        }
      } : {},
      ...disableWwebjsPatches ? {} : {
        evalOnNewDoc: () => {
          try {
            if (!window.WWebJS) window.WWebJS = {};
            window.WWebJS.markedUnread = false;
          } catch (e) {
          }
        }
      },
      puppeteer: {
        headless,
        // Allow overriding Chromium/Chrome executable via env var BOT_CHROMIUM_PATH
        // If not provided, puppeteer will use the bundled or system browser.
        executablePath: process.env.BOT_CHROMIUM_PATH || void 0,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          `--user-agent=${userAgent}`
        ]
      }
    });
    const originalSendMessage = this.client.sendMessage?.bind(this.client);
    if (originalSendMessage) {
      this.client.sendMessage = async (...args) => {
        await this.ensureWwebjsStubsApplied();
        const patchedArgs = [...args];
        if (patchedArgs.length >= 2) {
          const opts = patchedArgs[2];
          if (!opts || typeof opts !== "object") patchedArgs[2] = { sendSeen: false };
          else patchedArgs[2] = { ...opts, sendSeen: false };
        }
        try {
          return await originalSendMessage(...patchedArgs);
        } catch (err) {
          const msg = err?.message || String(err);
          if (msg.includes("markedUnread") || msg.includes("marked unread")) {
            logger.warn({ err }, "Interceptado markedUnread error en sendMessage \u2014 ignorando para mantener el bot operativo");
            await this.applyWwebjsSafetyStubs();
            try {
              return await originalSendMessage(...patchedArgs);
            } catch (err2) {
              logger.error({ err: err2 }, "sendMessage sigue fallando tras stubs; se ignora para no tumbar el bot");
              return;
            }
          }
          throw err;
        }
      };
    }
    if (!disableWwebjsPatches) {
      (async () => {
        try {
          const attach = async () => {
            const browser = this.client.browser;
            if (!browser) return false;
            try {
              browser.on && browser.on("targetcreated", async (target) => {
                try {
                  if (typeof target.type === "function" && target.type() === "page") {
                    const page = await target.page();
                    if (page && typeof page.evaluateOnNewDocument === "function") {
                      await page.evaluateOnNewDocument(() => {
                        try {
                          if (!window.WWebJS) window.WWebJS = {};
                          window.WWebJS.sendSeen = async () => {
                            return;
                          };
                          window.WWebJS.markedUnread = false;
                        } catch (e) {
                        }
                      });
                    } else if (page && typeof page.addInitScript === "function") {
                      await page.addInitScript(() => {
                        try {
                          if (!window.WWebJS) window.WWebJS = {};
                          window.WWebJS.sendSeen = async () => {
                            return;
                          };
                          window.WWebJS.markedUnread = false;
                        } catch (e) {
                        }
                      });
                    }
                  }
                } catch (e) {
                }
              });
            } catch (e) {
            }
            try {
              const pages = await browser.pages();
              for (const p of pages) {
                try {
                  if (p && typeof p.evaluateOnNewDocument === "function") {
                    await p.evaluateOnNewDocument(() => {
                      try {
                        if (!window.WWebJS) window.WWebJS = {};
                        window.WWebJS.sendSeen = async () => {
                          return;
                        };
                        window.WWebJS.markedUnread = false;
                      } catch (e) {
                      }
                    });
                  } else if (p && typeof p.addInitScript === "function") {
                    await p.addInitScript(() => {
                      try {
                        if (!window.WWebJS) window.WWebJS = {};
                        window.WWebJS.sendSeen = async () => {
                          return;
                        };
                        window.WWebJS.markedUnread = false;
                      } catch (e) {
                      }
                    });
                  }
                } catch (e) {
                }
              }
            } catch (e) {
            }
            return true;
          };
          for (let i = 0; i < 20; i++) {
            const ok = await attach();
            if (ok) break;
            await new Promise((r) => setTimeout(r, 250));
          }
        } catch (e) {
          logger.debug({ e }, "No se pudo instalar inyecci\xF3n evaluateOnNewDocument");
        }
      })();
    }
  }
  async safeRestart(triggerReason) {
    const now = Date.now();
    const WINDOW_MS = 10 * 60 * 1e3;
    const MAX_RESTARTS_IN_WINDOW = 3;
    this.restartCountWindow = this.restartCountWindow.filter((t) => now - t < WINDOW_MS);
    if (this.restartCountWindow.length >= MAX_RESTARTS_IN_WINDOW) {
      logger.error(
        { triggerReason, restartsInWindow: this.restartCountWindow.length },
        "Demasiados reinicios en ventana; no se reiniciar\xE1 autom\xE1ticamente para evitar loop"
      );
      return;
    }
    if (this.restartInProgress) {
      logger.warn({ triggerReason }, "Reinicio ya en progreso; omitiendo");
      return;
    }
    const last = this.lastRestartAt;
    const COOLDOWN_MS = 15e3;
    if (last && now - last < COOLDOWN_MS) {
      logger.warn({ triggerReason, cooldownMs: COOLDOWN_MS }, "Reinicio en cooldown; omitiendo");
      return;
    }
    this.restartInProgress = true;
    this.lastRestartAt = now;
    this.restartCountWindow.push(now);
    await new Promise((r) => setTimeout(r, 5e3));
    try {
      logger.warn({ triggerReason }, "Reiniciando cliente WhatsApp (destroy + initialize)");
      try {
        await this.client.destroy();
      } catch (error) {
        logger.warn({ err: error }, "No se pudo destruir el cliente antes de reiniciar");
      }
      this.isReady = false;
      this.stopMessagePolling();
      this.authenticatedAt = null;
      await this.client.initialize();
      logger.info({ triggerReason }, "Reinicio de WhatsApp iniciado");
    } catch (error) {
      logger.error({ err: error, triggerReason }, "No se pudo reiniciar el cliente de WhatsApp");
    } finally {
      this.restartInProgress = false;
    }
  }
  async initialize() {
    if (this.listenersAttached) {
      logger.warn("WhatsAppClient.initialize() llamado m\xE1s de una vez; evitando duplicar listeners.");
    } else {
      this.listenersAttached = true;
      this.client.on("qr", (qr) => {
        logger.info("Escanee el c\xF3digo QR para iniciar sesi\xF3n.");
        this.isReady = false;
        this.stopMessagePolling();
        this.authenticatedAt = null;
        this.authStuckRestarted = false;
        if (this.authStuckTimer) {
          clearTimeout(this.authStuckTimer);
          this.authStuckTimer = null;
        }
        qrcode.generate(qr, { small: true });
        void QRCode.toDataURL(qr).then(async (dataUrl) => {
          try {
            await apiClient.reportWhatsappQr(dataUrl);
          } catch (error) {
            logger.error({ err: error }, "No se pudo enviar el QR al backend");
          }
        }).catch((error) => {
          logger.error({ err: error }, "No se pudo generar el QR en formato de imagen");
        });
      });
      this.client.on("authenticated", () => {
        if (!this.authenticatedAt) this.authenticatedAt = Date.now();
        logger.info({ authenticatedAt: this.authenticatedAt }, "WhatsApp autenticado (session establecida).");
        try {
          const info = this.client.info;
          const wid = info?.wid?._serialized || info?.wid?.user || null;
          const pushname = info?.pushname || null;
          if (wid || pushname) {
            logger.info({ wid, pushname }, "Identidad WhatsApp (info)");
          }
        } catch {
        }
        if (this.authStuckTimer) clearTimeout(this.authStuckTimer);
        this.authStuckTimer = setTimeout(() => {
          void (async () => {
            if (this.isReady) return;
            let state = null;
            try {
              state = await this.client.getState?.();
            } catch (error) {
              logger.debug({ err: error }, "No se pudo obtener getState()");
            }
            logger.warn(
              {
                state,
                authenticatedSecondsAgo: this.authenticatedAt ? Math.round((Date.now() - this.authenticatedAt) / 1e3) : null,
                alreadyRestarted: this.authStuckRestarted
              },
              "WhatsApp autenticado pero a\xFAn no est\xE1 listo (posible atasco)"
            );
            if (state === "CONNECTED") {
              try {
                const contacts = await Promise.race([
                  this.client.getContacts(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error("getContacts timeout")), 1e4))
                ]);
                logger.info(
                  { contactsCount: Array.isArray(contacts) ? contacts.length : null },
                  "Cliente de WhatsApp usable sin evento ready (ready inferido)"
                );
                await this.applyWwebjsSafetyStubs();
                this.isReady = true;
                this.authenticatedAt = null;
                this.authStuckRestarted = false;
                if (this.authStuckTimer) {
                  clearTimeout(this.authStuckTimer);
                  this.authStuckTimer = null;
                }
                void apiClient.markWhatsappReady().catch((error) => {
                  logger.error({ err: error }, "No se pudo notificar al backend que WhatsApp est\xE1 listo (inferido)");
                });
                this.startMessagePolling();
                return;
              } catch (error) {
                logger.warn({ err: error }, "Estado CONNECTED pero no se pudo confirmar usabilidad (getContacts)");
              }
            }
            if (!this.authStuckRestarted) {
              if (!this.enableAutoRestartOnStuck) {
                logger.warn(
                  {
                    state,
                    authenticatedSecondsAgo: this.authenticatedAt ? Math.round((Date.now() - this.authenticatedAt) / 1e3) : null
                  },
                  "Auto-restart por stuck deshabilitado; se evita reinicio para no bloquear la sesi\xF3n de Chrome"
                );
                return;
              }
              this.authStuckRestarted = true;
              await this.safeRestart("stuck_after_authenticated");
            }
          })();
        }, 3e4);
      });
      this.client.on("loading_screen", (percent, message) => {
        logger.debug({ percent, message }, "WhatsApp loading_screen");
      });
      this.client.on("change_state", (state) => {
        logger.info({ state }, "WhatsApp change_state");
      });
      this.client.on("ready", () => {
        logger.info("Cliente de WhatsApp listo.");
        this.isReady = true;
        this.authenticatedAt = null;
        this.authStuckRestarted = false;
        if (this.authStuckTimer) {
          clearTimeout(this.authStuckTimer);
          this.authStuckTimer = null;
        }
        void this.applyWwebjsSafetyStubs();
        this.startMessagePolling();
        void apiClient.markWhatsappReady().catch((error) => {
          logger.error({ err: error }, "No se pudo notificar al backend que WhatsApp est\xE1 listo");
        });
      });
      this.client.on("auth_failure", (message) => {
        logger.error({ message }, "Fallo de autenticaci\xF3n en WhatsApp");
        void apiClient.markWhatsappDisconnected(message).catch((error) => {
          logger.error({ err: error }, "No se pudo notificar la desconexi\xF3n por fallo de autenticaci\xF3n");
        });
      });
      this.client.on("disconnected", (reason) => {
        logger.warn({ reason }, "Cliente de WhatsApp desconectado");
        this.isReady = false;
        this.stopMessagePolling();
        void apiClient.markWhatsappDisconnected(reason).catch((error) => {
          logger.error({ err: error }, "No se pudo notificar la desconexi\xF3n de WhatsApp");
        });
        if (this.restartInProgress) {
          logger.warn({ reason }, "Reinicio ya en progreso; omitiendo reinicio adicional");
          return;
        }
        void this.safeRestart(reason);
      });
    }
    if (this.debugMessages) {
      this.client.on("message_create", (message) => {
        try {
          const body = String(message.body ?? "");
          const bodyPreview = body.length > 200 ? body.slice(0, 200) + "\u2026" : body;
          logger.info(
            {
              id: message.id?._serialized,
              from: message.from,
              to: message.to,
              fromMe: Boolean(message.fromMe),
              hasMedia: Boolean(message.hasMedia),
              type: message.type,
              bodyPreview
            },
            "WhatsApp message_create (debug)"
          );
        } catch (e) {
          logger.debug({ e }, "No se pudo loguear message_create");
        }
      });
    }
    this.client.on("message", async (message) => {
      try {
        const id = message?.id?._serialized;
        if (id) this.markProcessedMessage(id);
        if (this.debugMessages) {
          const body = String(message.body ?? "");
          const bodyPreview = body.length > 200 ? body.slice(0, 200) + "\u2026" : body;
          logger.info(
            {
              id: message.id?._serialized,
              from: message.from,
              to: message.to,
              fromMe: Boolean(message.fromMe),
              hasMedia: Boolean(message.hasMedia),
              type: message.type,
              bodyPreview
            },
            "WhatsApp message (debug)"
          );
        }
        if (this.inboundHandler) {
          await this.inboundHandler(message);
        }
        await this.markChatAsSeenBestEffort(message);
        this.kickMessagePollingSoon();
      } catch (error) {
        logger.error({ err: error }, "Error manejando mensaje entrante");
      }
    });
    try {
      await this.client.initialize();
    } catch (error) {
      logger.fatal({ err: error }, "Error inicializando cliente de WhatsApp");
      throw error;
    }
  }
  registerInboundHandler(handler) {
    this.inboundHandler = handler;
    if (this.isReady) {
      this.startMessagePolling();
    }
  }
  async sendReminder(reminder, payload) {
    if (!reminder.client?.phone) {
      throw new Error(`El cliente ${reminder.client?.name ?? reminder.client_id} no tiene tel\xE9fono configurado.`);
    }
    const chatId = formatWhatsAppId(reminder.client.phone);
    await this.client.sendMessage(chatId, payload.content);
    if (payload.attachments?.length) {
      for (const attachment of payload.attachments) {
        const base64Data = typeof attachment.data === "string" ? attachment.data.replace(/^data:[^,]+,/, "") : attachment.data.toString("base64");
        const media = new MessageMedia(attachment.mimeType, base64Data, attachment.filename);
        await this.client.sendMessage(chatId, media);
      }
    }
  }
  // Enviar texto arbitrario a un chat (útil para admin queue u otros usos)
  async sendText(chatId, text) {
    await this.client.sendMessage(chatId, text);
  }
  // Enviar media (base64) a un chat
  async sendMedia(chatId, base64Data, mimeType, filename) {
    const media = new MessageMedia(mimeType, base64Data, filename);
    await this.client.sendMessage(chatId, media);
  }
  async getState() {
    try {
      const state = await this.client.getState();
      const info = this.client.info ?? null;
      let webVersion = null;
      try {
        webVersion = await this.client.getWWebVersion?.() ?? null;
      } catch {
      }
      return { state: state ?? null, info: { ...info, webVersion } };
    } catch (error) {
      logger.error({ err: error }, "No se pudo obtener el estado del cliente de WhatsApp");
      return { state: null, info: null };
    }
  }
  async debugGetChatsSummary() {
    try {
      const chats = await this.client.getChats();
      const unread = chats.filter((c) => (c?.unreadCount || 0) > 0);
      const sample = unread.slice(0, 5).map((c) => ({
        id: c?.id?._serialized ?? String(c?.id ?? ""),
        unreadCount: Number(c?.unreadCount || 0),
        isGroup: Boolean(c?.isGroup)
      }));
      return {
        ok: true,
        totalChats: chats.length,
        unreadChats: unread.length,
        sample
      };
    } catch (error) {
      return {
        ok: false,
        error: error?.message ? String(error.message) : String(error)
      };
    }
  }
  /**
   * Limpia chats (del lado del bot) para números que NO están permitidos.
   *
   * Importante:
   * - WhatsApp Web no siempre permite “borrar chat” desde librerías. Lo más estable es:
   *   - limpiar mensajes (clearMessages) si está disponible
   *   - archivar el chat
   * - Esta función está diseñada para ser llamada desde el menú admin.
   */
  async cleanupChats(options) {
    const dryRun = options.dryRun !== false;
    const includeUnread = options.includeUnread === true;
    const includeGroups = options.includeGroups === true;
    const limit = Number(options.limit || 200);
    const result = {
      ok: true,
      scanned: 0,
      candidates: 0,
      acted: 0,
      skippedUnread: 0,
      skippedGroup: 0,
      errors: 0,
      sample: []
    };
    try {
      const chats = await this.client.getChats();
      const slice = chats.slice(0, Math.max(0, limit));
      for (const c of slice) {
        result.scanned++;
        const chatId = c?.id?._serialized ?? String(c?.id ?? "");
        const isGroup = Boolean(c?.isGroup);
        const unreadCount = Number(c?.unreadCount || 0);
        if (isGroup && !includeGroups) {
          result.skippedGroup++;
          if (result.sample.length < 20) result.sample.push({ chatId, phone: "", action: "skip", reason: "group" });
          continue;
        }
        if (unreadCount > 0 && !includeUnread) {
          result.skippedUnread++;
          if (result.sample.length < 20) result.sample.push({ chatId, phone: "", action: "skip", reason: "unread" });
          continue;
        }
        const phone = String(chatId).replace(/@c\.us$/, "").replace(/[^0-9]/g, "");
        if (!phone || phone.length < 8) {
          if (result.sample.length < 20) result.sample.push({ chatId, phone: phone || "", action: "skip", reason: "invalid_phone" });
          continue;
        }
        let allowed = false;
        try {
          allowed = await options.isAllowedNumber(phone);
        } catch {
          allowed = true;
        }
        if (allowed) {
          if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "none", reason: "allowed" });
          continue;
        }
        result.candidates++;
        if (dryRun) {
          if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "none", reason: "dry_run" });
          continue;
        }
        try {
          const chat = await this.client.getChatById(chatId);
          let didSomething = false;
          let deleteAttempted = false;
          try {
            const clientAny = this.client;
            if (clientAny && typeof clientAny.deleteChat === "function") {
              deleteAttempted = true;
              const deleted = await clientAny.deleteChat(chatId);
              didSomething = Boolean(deleted) || didSomething;
              if (Boolean(deleted)) {
                result.acted++;
                if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "delete" });
              } else {
                if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "none", reason: "client_deleteChat_returned_false" });
              }
            }
          } catch (e) {
            deleteAttempted = true;
            if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "none", reason: `client_deleteChat_error:${String(e?.message || e)}`.slice(0, 120) });
          }
          if (!didSomething && chat && typeof chat.delete === "function") {
            deleteAttempted = true;
            const deleted = await chat.delete();
            didSomething = Boolean(deleted) || didSomething;
            if (Boolean(deleted)) {
              result.acted++;
              if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "delete" });
            } else {
              if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "none", reason: "chat_delete_returned_false" });
            }
          }
          if (didSomething) {
            try {
              if (this.client && typeof this.client.getChats === "function") {
                await this.client.getChats();
              }
            } catch {
            }
            continue;
          }
          if (chat && typeof chat.clearMessages === "function") {
            const cleared = await chat.clearMessages();
            didSomething = Boolean(cleared) || didSomething;
            if (Boolean(cleared)) {
              result.acted++;
              if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "clear" });
            } else {
              if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "none", reason: "clear_returned_false" });
            }
          }
          if (!didSomething) {
            if (result.sample.length < 20) {
              result.sample.push({
                chatId,
                phone,
                action: "none",
                reason: deleteAttempted ? "delete_not_supported_or_failed_no_fallback" : "no_supported_actions"
              });
            }
          }
        } catch (e) {
          result.errors++;
          logger.warn({ chatId, phone, err: e?.message || e }, "cleanupChats: error procesando chat");
          if (result.sample.length < 20) result.sample.push({ chatId, phone, action: "skip", reason: "error" });
        }
      }
      return result;
    } catch (e) {
      logger.error({ err: e }, "cleanupChats: fallo general");
      return { ...result, ok: false, errors: result.errors + 1 };
    }
  }
  async shutdown() {
    this.stopMessagePolling();
    try {
      await this.client.destroy();
      return;
    } catch (err) {
      logger.warn({ err }, "WhatsAppClient.destroy fall\xF3; intentando cleanup alternativo");
    }
    try {
      const browser = this.client.pupBrowser;
      if (browser && typeof browser.close === "function") {
        await browser.close();
        return;
      }
    } catch (err) {
      logger.warn({ err }, "No se pudo cerrar pupBrowser en fallback");
    }
    try {
      const userDataDir = this.client?.options?.puppeteer?.userDataDir;
      if (userDataDir && typeof userDataDir === "string" && userDataDir.trim().length > 0) {
        const escaped = userDataDir.replace(/'/g, "'\\''");
        await exec(`pkill -f '${escaped}' || true`);
      }
    } catch (err) {
      logger.warn({ err }, "No se pudo ejecutar pkill de cleanup para WhatsApp");
    }
  }
};

// src/index.ts
import fs from "fs/promises";
import path from "path";
import http from "http";
import { URL } from "url";
import axios2 from "axios";
var whatsappClient = new WhatsAppClient();
var processor = new ReminderProcessor(whatsappClient);
var runBatch = async () => {
  try {
    await processor.runBatch();
  } catch (error) {
    logger.error({ err: error }, "Error procesando lote de recordatorios");
  }
};
async function main() {
  const menuShown = /* @__PURE__ */ new Map();
  const lastMenuItems = /* @__PURE__ */ new Map();
  const agentMode = /* @__PURE__ */ new Map();
  const adminNotifiedAt = /* @__PURE__ */ new Map();
  const AGENT_NOTIFY_THROTTLE_MS = Number(process.env.AGENT_NOTIFY_THROTTLE_MS || 30 * 60 * 1e3);
  const awaitingReceipt = /* @__PURE__ */ new Map();
  const pendingConfirmReceipt = /* @__PURE__ */ new Map();
  const awaitingMonths = /* @__PURE__ */ new Map();
  const RECEIPTS_DIR = path.join(process.cwd(), "data", "receipts");
  const RECEIPTS_INDEX = path.join(RECEIPTS_DIR, "index.json");
  let TIMEZONE = process.env.TIMEZONE || "America/Costa_Rica";
  function onlyDigits(s) {
    return String(s || "").replace(/[^0-9]/g, "");
  }
  function normalizeCR(s) {
    const d = onlyDigits(s);
    if (d.length === 8) return (config.defaultCountryCode || "506") + d;
    return d;
  }
  const ADMIN_PHONES_RAW = (process.env.BOT_ADMIN_PHONES && process.env.BOT_ADMIN_PHONES.trim().length ? process.env.BOT_ADMIN_PHONES : "50672140974").split(",").map((s) => s.trim()).filter(Boolean);
  const ADMIN_PHONES = Array.from(/* @__PURE__ */ new Set([
    ...ADMIN_PHONES_RAW.map((s) => s),
    ...ADMIN_PHONES_RAW.map((s) => normalizeCR(s))
  ]));
  function normalizeToChatId(num) {
    if (!num) return null;
    const digits = String(num).replace(/[^0-9]/g, "");
    let phone = digits;
    if (phone.length === 8) phone = (config.defaultCountryCode || "506") + phone;
    if (!/^[0-9]{8,15}$/.test(phone)) return null;
    return phone.endsWith("@c.us") ? phone : phone + "@c.us";
  }
  function isAdminChatId(chatId) {
    if (!chatId) return false;
    const user = chatId.replace(/@c\.us$/, "");
    const normalized = normalizeCR(user);
    return ADMIN_PHONES.includes(user) || ADMIN_PHONES.includes(normalized);
  }
  async function isAllowedForChatCleanup(phoneDigits) {
    if (ADMIN_PHONES.includes(phoneDigits) || ADMIN_PHONES.includes(normalizeCR(phoneDigits))) return true;
    try {
      const paused = await apiClient.checkPausedContact(phoneDigits);
      if (paused) return true;
    } catch {
    }
    try {
      const client = await apiClient.findCustomerByPhone(phoneDigits);
      return Boolean(client);
    } catch {
      return true;
    }
  }
  const BOT_TIMEOUT_MS = Number(process.env.BOT_TIMEOUT_MS || 10 * 60 * 1e3);
  const _AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 60 * 60 * 1e3);
  const chatTimeoutMs = /* @__PURE__ */ new Map();
  const chatTimers = /* @__PURE__ */ new Map();
  function clearTimer(chatId) {
    const t = chatTimers.get(chatId);
    if (t) {
      clearTimeout(t);
      chatTimers.delete(chatId);
    }
  }
  function touchTimer(chatId) {
    clearTimer(chatId);
    const timeout = chatTimeoutMs.get(chatId) || BOT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      agentMode.delete(chatId);
      awaitingReceipt.delete(chatId);
      awaitingMonths.delete(chatId);
      pendingConfirmReceipt.delete(chatId);
      chatTimeoutMs.delete(chatId);
      chatTimers.delete(chatId);
      logger.info({ chatId, timeoutMs: timeout }, "Chat timeout: estado limpiado por inactividad");
    }, timeout);
    chatTimers.set(chatId, timer);
  }
  let BUSINESS_HOURS = {
    0: { open: "08:00", close: "19:00" },
    1: { open: "08:00", close: "19:00" },
    2: { open: "08:00", close: "19:00" },
    3: { open: "08:00", close: "19:00" },
    4: { open: "08:00", close: "19:00" },
    5: { open: "08:00", close: "19:00" },
    6: { open: "08:00", close: "19:00" }
  };
  try {
    const envHours = process.env.BOT_BUSINESS_HOURS;
    if (envHours && envHours.trim().length) {
      const parsed2 = JSON.parse(envHours);
      if (parsed2 && typeof parsed2 === "object") {
        BUSINESS_HOURS = Object.assign({}, BUSINESS_HOURS, parsed2);
      }
    }
  } catch (e) {
    logger.debug({ e }, "BOT_BUSINESS_HOURS parse failed, using defaults");
  }
  function hhmmToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m || 0);
  }
  function getTZParts(date = /* @__PURE__ */ new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const obj = {};
    for (const p of parts) obj[p.type] = p.value;
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      day: dayMap[obj.weekday] ?? 0,
      minutes: Number(obj.hour) * 60 + Number(obj.minute)
    };
  }
  function _isWithinBusinessHours(now = /* @__PURE__ */ new Date()) {
    const { day, minutes } = getTZParts(now);
    const configHours = BUSINESS_HOURS[day];
    if (!configHours) return false;
    const start = hhmmToMinutes(configHours.open);
    const end = hhmmToMinutes(configHours.close);
    return minutes >= start && minutes <= end;
  }
  function formatBusinessHours() {
    try {
      const names = ["Dom", "Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b"];
      const parts = [];
      for (let d = 1; d <= 5; d++) {
        if (BUSINESS_HOURS[d]) parts.push(`${names[d]} ${BUSINESS_HOURS[d].open}-${BUSINESS_HOURS[d].close}`);
      }
      if (BUSINESS_HOURS[0]) parts.push(`Dom ${BUSINESS_HOURS[0].open}-${BUSINESS_HOURS[0].close}`);
      if (BUSINESS_HOURS[6]) parts.push(`S\xE1b ${BUSINESS_HOURS[6].open}-${BUSINESS_HOURS[6].close}`);
      return parts.join(", ");
    } catch (e) {
      return "Horario no disponible";
    }
  }
  const afterHoursNotified = /* @__PURE__ */ new Map();
  function _shouldNotifyAfterHours(id) {
    const last = afterHoursNotified.get(id);
    const now = Date.now();
    const THRESHOLD = 30 * 60 * 1e3;
    if (!last || now - last > THRESHOLD) {
      afterHoursNotified.set(id, now);
      return true;
    }
    return false;
  }
  const adminFlows = /* @__PURE__ */ new Map();
  function parseAmountCRC(s) {
    const digits = String(s || "").replace(/[^0-9]/g, "");
    const n = Number(digits || 0);
    return isNaN(n) ? 0 : n;
  }
  function validHHMM(s) {
    return /^\d{1,2}:\d{2}$/.test(String(s || ""));
  }
  function toHHMM(s, def = "08:00") {
    const t = String(s || "").trim();
    if (!t) return def;
    if (!validHHMM(t)) return null;
    let [h, m] = t.split(":").map((x) => Number(x));
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0");
  }
  async function resolveMenu() {
    const now = Date.now();
    const ttlMs = Number(process.env.BOT_MENU_CACHE_TTL_MS || 5 * 60 * 1e3);
    if (resolveMenu._cache && now - resolveMenu._cacheAt < ttlMs) {
      return resolveMenu._cache;
    }
    const DATA_DIR = path.join(process.cwd(), "data");
    const localMenuPath = path.join(DATA_DIR, "menu.json");
    try {
      const remote = await apiClient.fetchBotMenu();
      if (Array.isArray(remote) && remote.length) {
        try {
          await fs.mkdir(DATA_DIR, { recursive: true });
          await fs.writeFile(localMenuPath, JSON.stringify(remote, null, 2), { encoding: "utf8" });
        } catch (e) {
          logger.debug({ e }, "No se pudo persistir men\xFA remoto en cache local");
        }
        resolveMenu._cache = remote;
        resolveMenu._cacheAt = Date.now();
        return remote;
      }
    } catch (e) {
      logger.debug({ e }, "fetchBotMenu fall\xF3");
    }
    if (config.menuPath) {
      try {
        const raw = await fs.readFile(config.menuPath, { encoding: "utf8" });
        const parsed2 = JSON.parse(raw);
        if (Array.isArray(parsed2) && parsed2.length) {
          resolveMenu._cache = parsed2;
          resolveMenu._cacheAt = Date.now();
          return parsed2;
        }
      } catch (err) {
        logger.debug({ err }, "No se pudo leer BOT_MENU_PATH");
      }
    }
    try {
      const raw = await fs.readFile(localMenuPath, { encoding: "utf8" });
      const parsed2 = JSON.parse(raw);
      if (Array.isArray(parsed2) && parsed2.length) {
        resolveMenu._cache = parsed2;
        resolveMenu._cacheAt = Date.now();
        return parsed2;
      }
    } catch {
    }
    return null;
  }
  whatsappClient.registerInboundHandler(async (message) => {
    const t0 = Date.now();
    const timings = {};
    const mark = (k) => {
      timings[k] = Date.now() - t0;
    };
    if (String(message.from || "").endsWith("@broadcast")) return;
    try {
      const sampleRate = Number(process.env.BOT_INBOUND_LOG_SAMPLE_RATE || 0.1);
      if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
        logger.info({ from: message.from }, "Mensaje entrante de WhatsApp");
      } else if (Math.random() < Math.min(1, sampleRate)) {
        const b = String(message.body ?? "");
        logger.info({ from: message.from, body: b.slice(0, 200) }, "Mensaje entrante de WhatsApp");
      }
    } catch {
      logger.info({ from: message.from }, "Mensaje entrante de WhatsApp");
    }
    const body = String(message.body ?? "").trim();
    if (!body && !message.hasMedia) return;
    const lc = body.toLowerCase();
    mark("parsed");
    const chatId = message.from;
    const fromUser = String(chatId || "").replace(/@c\.us$/, "");
    const fromNorm = normalizeCR(fromUser);
    const slowMs = Number(process.env.BOT_SLOW_MESSAGE_MS || 2500);
    const send = async (text) => {
      const tSend0 = Date.now();
      try {
        await whatsappClient.sendText(chatId, text);
      } finally {
        timings.sendTextMs = (timings.sendTextMs || 0) + (Date.now() - tSend0);
        mark("sent");
        const total = Date.now() - t0;
        const traceLatency = (() => {
          const v = String(process.env.BOT_TRACE_LATENCY || "").trim().toLowerCase();
          return v === "1" || v === "true" || v === "yes" || v === "on";
        })();
        if (traceLatency || Number.isFinite(slowMs) && total >= slowMs) {
          logger.info(
            {
              chatId,
              fromNorm,
              totalMs: total,
              timings
            },
            "Latencia handler WhatsApp"
          );
        }
      }
    };
    const isAdminUserEarly = isAdminChatId(chatId) || fromNorm === "50672140974";
    if (isAdminUserEarly && (lc === "adminmenu" || lc === "admin" || lc === "menuadmin")) {
      const adminMenuText = [
        "\u{1F527} *MEN\xDA ADMIN* \u{1F527}",
        "",
        "Env\xEDa el n\xFAmero de la opci\xF3n deseada:",
        "",
        "1\uFE0F\u20E3 Crear cliente + contrato",
        "2\uFE0F\u20E3 Ver detalles de cliente",
        "3\uFE0F\u20E3 Ver mis detalles",
        "4\uFE0F\u20E3 Listar comprobantes del d\xEDa",
        "5\uFE0F\u20E3 Generar comprobante para cliente",
        "6\uFE0F\u20E3 Enviar comprobante por ID",
        "7\uFE0F\u20E3 Listar transacciones",
        "8\uFE0F\u20E3 Ejecutar scheduler",
        "",
        "\u{1F4B0} *PAGOS Y CONCILIACI\xD3N*",
        "9\uFE0F\u20E3 Registrar pago manual",
        "\u{1F51F} Conciliar pago",
        "1\uFE0F\u20E31\uFE0F\u20E3 Listar pagos pendientes",
        "",
        "\u{1F5D1}\uFE0F *ELIMINACI\xD3N*",
        "1\uFE0F\u20E32\uFE0F\u20E3 Eliminar cliente",
        "1\uFE0F\u20E33\uFE0F\u20E3 Eliminar contrato",
        "1\uFE0F\u20E34\uFE0F\u20E3 Eliminar transacci\xF3n",
        "",
        "1\uFE0F\u20E35\uFE0F\u20E3 Estado del bot",
        "1\uFE0F\u20E36\uFE0F\u20E3 Pausar / reanudar contacto (silenciar bot)",
        "1\uFE0F\u20E37\uFE0F\u20E3 Limpiar chats no-clientes (borrar/limpiar)",
        "",
        "\u{1F4CB} Escribe *help para ver comandos de texto",
        "\u274C Escribe salir para cancelar"
      ].join("\n");
      await send(adminMenuText);
      menuShown.set(chatId, true);
      lastMenuItems.set(chatId, [{ type: "admin_menu" }]);
      return;
    }
    try {
      if (!isAdminUserEarly) {
        const allowIfUserWantsUnpause = lc === "unpause" || lc === "reanudar";
        if (!allowIfUserWantsUnpause) {
          const paused = await apiClient.checkPausedContact(fromNorm);
          mark("pausedCheck");
          if (paused) {
            logger.info({ chatId, fromNorm }, "Contacto pausado: bot en silencio (no se responde)");
            return;
          }
        }
      }
    } catch (e) {
    }
    try {
      touchTimer(chatId);
    } catch (e) {
      logger.debug({ e }, "touchTimer fallo");
    }
    try {
      const isInActiveProcess = awaitingReceipt.get(chatId) || pendingConfirmReceipt.has(chatId) || awaitingMonths.has(chatId) || agentMode.get(chatId) || menuShown.get(chatId);
      const isMediaUpload = !!message.hasMedia;
      if (!_isWithinBusinessHours() && !isAdminUserEarly && !isInActiveProcess && !isMediaUpload && lc !== "menu" && lc !== "inicio" && lc !== "help") {
        await message.reply(`Hola. Actualmente estamos fuera del horario de atenci\xF3n (${TIMEZONE}). Nuestro horario: ${formatBusinessHours()}.

\u{1F4A1} Puedes usar el men\xFA escribiendo "menu" para acceder a opciones autom\xE1ticas disponibles 24/7.`);
        return;
      }
    } catch (e) {
      logger.debug({ e }, "error verificando horario de atenci\xF3n");
    }
    if (awaitingReceipt.get(chatId)) {
      try {
        if (message.hasMedia) {
          const media = await message.downloadMedia();
          const fname = media.filename && media.filename.trim() ? media.filename : `receipt-${chatId.replace(/[^0-9]/g, "")}-${Date.now()}`;
          const saved = await saveReceipt(chatId, fname, media.data, media.mimetype, body);
          let backendPaymentId = null;
          try {
            let client = null;
            try {
              client = await apiClient.findCustomerByPhone(fromNorm);
            } catch (e) {
            }
            if (!client) {
              try {
                client = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser });
              } catch (e) {
              }
            }
            const paymentPayload = {
              client_id: client && client.id ? client.id : void 0,
              amount: 0,
              currency: "CRC",
              channel: "whatsapp",
              status: "unverified",
              reference: `bot:${saved.id}`,
              metadata: { local_receipt_id: saved.id }
            };
            const pRes = await apiClient.createPayment(paymentPayload);
            if (pRes && (pRes.id || pRes.payment_id)) {
              backendPaymentId = pRes.id ?? pRes.payment_id;
              await updateReceiptEntry(saved.id, { backend_payment_id: backendPaymentId, status: "created" });
            } else {
              await updateReceiptEntry(saved.id, { status: "created" });
            }
            if (backendPaymentId) {
              try {
                let attachBuf = null;
                let attachName = fname;
                if (media.mimetype === "application/pdf") {
                  attachBuf = Buffer.from(media.data, "base64");
                } else if (/^image\//.test(media.mimetype)) {
                  try {
                    const imgBuf = Buffer.from(media.data, "base64");
                    const pdfBuf = await imageBufferToPdfBuffer(imgBuf, fname + ".pdf");
                    attachBuf = pdfBuf;
                    attachName = fname.endsWith(".pdf") ? fname : fname + ".pdf";
                  } catch (e) {
                    logger.debug({ e }, "No se pudo convertir imagen a PDF para adjuntar, se omite attach");
                    attachBuf = null;
                  }
                }
                if (attachBuf) {
                  const fdMod = await import("./form_data-32T725I6.js");
                  const FormDataCtor = fdMod && fdMod.default ? fdMod.default : fdMod;
                  const form = new FormDataCtor();
                  form.append("file", attachBuf, { filename: attachName, contentType: "application/pdf" });
                  form.append("received_at", (/* @__PURE__ */ new Date()).toISOString());
                  form.append("metadata", JSON.stringify([]));
                  const headers = Object.assign({ Authorization: `Bearer ${config.apiToken}`, Accept: "application/json" }, form.getHeaders());
                  await axios2.post(`${config.apiBaseUrl.replace(/\/$/, "")}/payments/${backendPaymentId}/receipts`, form, { headers });
                }
              } catch (e) {
                logger.debug({ e, backendPaymentId, saved }, "No se pudo adjuntar PDF al payment (se continuar\xE1 de todas formas)");
              }
            }
          } catch (e) {
            logger.warn({ e, chatId }, "No se pudo crear payment placeholder en backend");
          }
          awaitingMonths.set(chatId, { receiptId: saved.id, backendPaymentId });
          await message.reply("Gracias. \xBFCu\xE1ntos meses est\xE1s pagando con este comprobante? Responde con un n\xFAmero, por ejemplo: 1");
          try {
            const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : "50672140974";
            const adminChatId = normalizeToChatId(adminPhone);
            if (adminChatId) {
              const notifyText = backendPaymentId ? `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id} | backend payment: ${backendPaymentId}` : `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id}`;
              await whatsappClient.sendText(adminChatId, notifyText);
              await whatsappClient.sendMedia(adminChatId, media.data, media.mimetype, fname);
              logger.info({ adminChatId, chatId, file: saved.filepath, backendPaymentId }, "Enviado comprobante al admin");
            }
          } catch (e) {
            logger.warn({ e }, "Fallo notificando admin sobre comprobante recibido");
          }
          awaitingReceipt.delete(chatId);
          await message.reply("\u2705 Recibimos tu comprobante. Un asesor lo revisar\xE1 y te contactar\xE1 si es necesario.");
          return;
        } else {
          await message.reply('Por favor adjunta una foto o PDF del comprobante. Si no deseas continuar escribe "salir".');
          return;
        }
      } catch (e) {
        logger.error({ e }, "Error procesando comprobante");
        awaitingReceipt.delete(chatId);
        await message.reply('\u274C Ocurri\xF3 un error procesando el comprobante. Intenta de nuevo o escribe "salir" para cancelar.');
        return;
      }
    }
    try {
      if (!awaitingReceipt.get(chatId) && !agentMode.get(chatId) && message.hasMedia) {
        try {
          const media = await message.downloadMedia();
          const fname = media.filename && media.filename.trim() ? media.filename : `receipt-${chatId.replace(/[^0-9]/g, "")}-${Date.now()}`;
          pendingConfirmReceipt.set(chatId, { data: media.data, mimetype: media.mimetype, filename: fname, text: body });
          await message.reply('Veo que enviaste un archivo. \xBFEs un comprobante de pago? Responde "si" para registrarlo y notificar a un asesor, o "no" para cancelar.');
          return;
        } catch (e) {
          logger.warn({ e, chatId }, "Error descargando media para confirmaci\xF3n");
        }
      }
    } catch (e) {
      logger.debug({ e }, "Error en flujo de detecci\xF3n de media");
    }
    const isAdminUser = isAdminChatId(chatId) || fromNorm === "50672140974";
    if (isAdminUser && adminFlows.has(chatId) && !lc.startsWith("*")) {
      const flow = adminFlows.get(chatId);
      try {
        if (flow.type === "cleanup_chats") {
          if (flow.step === 1) {
            const ans = (body || "").trim().toLowerCase();
            if (ans === "1" || ans === "simular" || ans === "dry" || ans === "dryrun") {
              const summary = await whatsappClient.cleanupChats({
                dryRun: true,
                includeUnread: Boolean(flow.data?.includeUnread),
                includeGroups: Boolean(flow.data?.includeGroups),
                limit: 200,
                isAllowedNumber: isAllowedForChatCleanup
              });
              adminFlows.delete(chatId);
              const lines = [];
              lines.push("\u{1F9F9} *Limpieza de chats (SIMULACI\xD3N)*");
              lines.push("");
              lines.push(`Chats revisados: ${summary.scanned}`);
              lines.push(`Candidatos a limpiar (no-clientes): ${summary.candidates}`);
              lines.push(`Saltados por no le\xEDdos: ${summary.skippedUnread}`);
              lines.push(`Saltados por grupos: ${summary.skippedGroup}`);
              lines.push(`Errores: ${summary.errors}`);
              lines.push("");
              if (summary.sample?.length) {
                lines.push("*Muestra (hasta 20):*");
                for (const s of summary.sample.slice(0, 20)) {
                  const who = s.phone ? s.phone : s.chatId;
                  lines.push(`\u2022 ${who}: ${s.action}${s.reason ? ` (${s.reason})` : ""}`);
                }
              }
              lines.push("");
              lines.push("Escribe *adminmenu* para volver");
              await message.reply(lines.join("\n"));
              return;
            }
            if (ans === "3") {
              flow.data.includeUnread = !Boolean(flow.data?.includeUnread);
              await message.reply(`\u2705 includeUnread ahora es: ${flow.data.includeUnread ? "SI" : "NO"}

Responde 1 (simular) o 2 (ejecutar) o 4 (grupos).`);
              return;
            }
            if (ans === "4") {
              flow.data.includeGroups = !Boolean(flow.data?.includeGroups);
              await message.reply(`\u2705 includeGroups ahora es: ${flow.data.includeGroups ? "SI" : "NO"}

Responde 1 (simular) o 2 (ejecutar) o 3 (no le\xEDdos).`);
              return;
            }
            if (ans === "2" || ans === "ejecutar" || ans === "run") {
              flow.step = 2;
              await message.reply([
                "\u26A0\uFE0F *Confirmaci\xF3n requerida*",
                "",
                "Esto intentar\xE1 *borrar el chat* (si WhatsApp Web lo permite).",
                "Si no se puede borrar, har\xE1 fallback a *limpiar mensajes* (sin archivar autom\xE1ticamente).",
                `Configuraci\xF3n: includeUnread=${Boolean(flow.data?.includeUnread) ? "SI" : "NO"}, includeGroups=${Boolean(flow.data?.includeGroups) ? "SI" : "NO"}.`,
                "",
                "Responde *CONFIRMAR* para ejecutar, o *cancelar* para salir."
              ].join("\n"));
              return;
            }
            await message.reply("Responde 1 (simular), 2 (ejecutar), 3 (toggle no le\xEDdos) o 4 (toggle grupos).");
            return;
          }
          if (flow.step === 2) {
            const ans = (body || "").trim().toLowerCase();
            if (ans === "cancelar" || ans === "salir" || ans === "no") {
              adminFlows.delete(chatId);
              await message.reply("Operaci\xF3n cancelada. Escribe *adminmenu* para volver");
              return;
            }
            if (ans !== "confirmar") {
              await message.reply("Responde *CONFIRMAR* para ejecutar o *cancelar* para salir.");
              return;
            }
            const summary = await whatsappClient.cleanupChats({
              dryRun: false,
              includeUnread: Boolean(flow.data?.includeUnread),
              includeGroups: Boolean(flow.data?.includeGroups),
              limit: 200,
              isAllowedNumber: isAllowedForChatCleanup
            });
            adminFlows.delete(chatId);
            const lines = [];
            lines.push("\u{1F9F9} *Limpieza de chats (EJECUTADA)*");
            lines.push("");
            lines.push(`Chats revisados: ${summary.scanned}`);
            lines.push(`Candidatos detectados: ${summary.candidates}`);
            lines.push(`Acciones ejecutadas: ${summary.acted}`);
            lines.push(`Errores: ${summary.errors}`);
            lines.push("");
            lines.push("Escribe *adminmenu* para volver");
            await message.reply(lines.join("\n"));
            return;
          }
        }
        if (flow.type === "pause_contact") {
          if (flow.step === 1) {
            let ph = body === "yo" ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("Ingresa un tel\xE9fono v\xE1lido (8 d\xEDgitos CR o con c\xF3digo de pa\xEDs).");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            flow.data.phone = ph;
            flow.step = 2;
            await message.reply("\xBFQu\xE9 deseas hacer? Responde con:\n1) Pausar (silenciar bot)\n2) Reanudar (activar bot)\n3) Ver estado");
            return;
          }
          if (flow.step === 2) {
            const ans = (body || "").trim().toLowerCase();
            let action = null;
            if (ans === "1" || ans === "pausar" || ans === "pause") action = "pause";
            if (ans === "2" || ans === "reanudar" || ans === "unpause" || ans === "resume") action = "resume";
            if (ans === "3" || ans === "estado" || ans === "status") action = "status";
            if (!action) {
              await message.reply("Responde 1 (pausar), 2 (reanudar) o 3 (estado).");
              return;
            }
            const phone = String(flow.data.phone || "");
            if (!phone) {
              adminFlows.delete(chatId);
              await message.reply("\u274C Falt\xF3 el tel\xE9fono. Escribe *adminmenu* para volver.");
              return;
            }
            if (action === "status") {
              try {
                const paused = await apiClient.checkPausedContact(phone);
                adminFlows.delete(chatId);
                await message.reply(`\u{1F4CC} Estado para ${phone}: ${paused ? "\u23F8\uFE0F PAUSADO (bot en silencio)" : "\u2705 ACTIVO"}.

Escribe *adminmenu* para volver`);
                return;
              } catch (e) {
                adminFlows.delete(chatId);
                await message.reply(`\u274C No pude verificar el estado ahora. Error: ${String(e?.message || e)}

Escribe *adminmenu* para volver`);
                return;
              }
            }
            let client = null;
            try {
              client = await apiClient.findCustomerByPhone(phone);
            } catch (e) {
            }
            if (action === "pause") {
              try {
                await apiClient.pauseContact({
                  client_id: client?.id,
                  whatsapp_number: phone,
                  reason: "paused via whatsapp admin menu"
                });
                const pausedNow = await apiClient.checkPausedContact(phone);
                adminFlows.delete(chatId);
                await message.reply(
                  `\u2705 Contacto ${phone} pausado.
Estado actual: ${pausedNow ? "\u23F8\uFE0F PAUSADO (silencio)" : "\u26A0\uFE0F A\xDAN ACTIVO"}

Escribe *adminmenu* para volver`
                );
                return;
              } catch (e) {
                logger.error({ err: e, phone, clientId: client?.id }, "Error pausando contacto");
                adminFlows.delete(chatId);
                await message.reply(
                  `\u274C No pude pausar el contacto ${phone}.
Error: ${String(e?.response?.data?.message || e?.message || e)}

Escribe *adminmenu* para volver`
                );
                return;
              }
            }
            if (action === "resume") {
              try {
                if (client?.id) {
                  await apiClient.resumeContact({ client_id: client.id, whatsapp_number: phone });
                } else {
                  await apiClient.resumeContactByNumber({ whatsapp_number: phone });
                }
                const pausedNow = await apiClient.checkPausedContact(phone);
                adminFlows.delete(chatId);
                await message.reply(
                  `\u2705 Contacto ${phone} reanudado.
Estado actual: ${pausedNow ? "\u26A0\uFE0F A\xDAN PAUSADO" : "\u2705 ACTIVO"}

Escribe *adminmenu* para volver`
                );
                return;
              } catch (e) {
                logger.error({ err: e, phone, clientId: client?.id }, "Error reanudando contacto");
                adminFlows.delete(chatId);
                await message.reply(
                  `\u274C No pude reanudar el contacto ${phone}.
Error: ${String(e?.response?.data?.message || e?.message || e)}

Escribe *adminmenu* para volver`
                );
                return;
              }
            }
          }
        }
        if (flow.type === "create_subscription") {
          if (flow.step === 1) {
            let ph = body === "yo" ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("Ingresa un tel\xE9fono v\xE1lido (8 d\xEDgitos CR o con c\xF3digo de pa\xEDs).");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            flow.data.phone = ph;
            flow.step = 2;
            await message.reply("Nombre del cliente:");
            return;
          }
          if (flow.step === 2) {
            const name = (body || "").trim();
            if (!name) {
              await message.reply("Nombre inv\xE1lido, intenta de nuevo:");
              return;
            }
            flow.data.name = name;
            flow.step = 3;
            await message.reply("Monto mensual en colones (solo n\xFAmeros, ej: 8000):");
            return;
          }
          if (flow.step === 3) {
            const amount = parseAmountCRC(body);
            if (!amount || amount <= 0) {
              await message.reply("Monto inv\xE1lido. Escribe solo n\xFAmeros, ej: 8000");
              return;
            }
            flow.data.amount = amount;
            flow.step = 4;
            await message.reply("D\xEDa de cobro (1-31):");
            return;
          }
          if (flow.step === 4) {
            const day = Number((body || "").replace(/[^0-9]/g, ""));
            if (!day || day < 1 || day > 31) {
              await message.reply("D\xEDa inv\xE1lido. Debe ser entre 1 y 31.");
              return;
            }
            flow.data.day_of_month = day;
            flow.step = 5;
            await message.reply("Hora de recordatorio HH:MM en 24h (Enter para 08:00):");
            return;
          }
          if (flow.step === 5) {
            const h = toHHMM(body, "08:00");
            if (!h) {
              await message.reply("Hora inv\xE1lida. Usa formato HH:MM, ej: 08:00");
              return;
            }
            flow.data.due_time = h;
            flow.step = 6;
            await message.reply('Concepto (opcional). Enter para usar "Suscripci\xF3n de Servicios de Entretenimiento":');
            return;
          }
          if (flow.step === 6) {
            const concept = (body || "").trim();
            flow.data.concept = concept || "Suscripci\xF3n de Servicios de Entretenimiento";
            flow.step = 7;
            const d = flow.data;
            const resumen = [
              "Vas a crear:",
              `\u2022 Tel\xE9fono: ${d.phone}`,
              `\u2022 Nombre: ${d.name}`,
              `\u2022 Monto: \u20A1${Number(d.amount || 0).toLocaleString("es-CR")}`,
              `\u2022 D\xEDa: ${d.day_of_month}`,
              `\u2022 Hora: ${d.due_time}`,
              `\u2022 Concepto: ${d.concept}`,
              'Confirma con "si" o "no"'
            ].join("\n");
            await message.reply(resumen);
            return;
          }
          if (flow.step === 7) {
            const ans = (body || "").trim().toLowerCase();
            if (!["si", "s\xED", "s", "y", "yes", "confirmar"].includes(ans)) {
              if (["no", "n", "cancelar", "cancel"].includes(ans)) {
                adminFlows.delete(chatId);
                await message.reply("Operaci\xF3n cancelada.");
                return;
              }
              await message.reply('Responde "si" para confirmar o "no" para cancelar.');
              return;
            }
            try {
              const d = flow.data;
              await apiClient.upsertCustomer({ phone: d.phone, name: d.name, active: 1 });
              await apiClient.createSubscription({ phone: d.phone, day_of_month: d.day_of_month, due_time: d.due_time, amount: d.amount, concept: d.concept, active: 1, name: d.name });
              await message.reply(`\u2705 Cliente y suscripci\xF3n creados para ${d.name} (${d.phone}).`);
            } catch (e) {
              await message.reply(`Error creando registro: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "delete_customer") {
          if (flow.step === 1) {
            let ph = body === "yo" ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("Ingresa un tel\xE9fono v\xE1lido (8 d\xEDgitos CR o con c\xF3digo de pa\xEDs).");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            flow.data.phone = ph;
            const cust = await apiClient.findCustomerByPhone(ph);
            if (!cust) {
              adminFlows.delete(chatId);
              await message.reply("No existe un cliente con ese tel\xE9fono.");
              return;
            }
            flow.data.customer_id = cust.id;
            flow.step = 2;
            await message.reply(`Vas a ELIMINAR al cliente ${cust.name || cust.phone} y TODO su historial (pagos, recordatorios y suscripciones). Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
            return;
          }
          if (flow.step === 2) {
            const ans = (body || "").trim().toLowerCase();
            if (ans !== "confirmar") {
              adminFlows.delete(chatId);
              await message.reply("Operaci\xF3n cancelada.");
              return;
            }
            try {
              const res = await apiClient.deleteCustomer(flow.data.customer_id);
              await message.reply(`\u2705 Eliminado. Resultado: ${JSON.stringify(res)}`);
            } catch (e) {
              await message.reply(`Error al eliminar: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "delete_subscriptions_by_phone") {
          if (flow.step === 1) {
            let ph = body === "yo" ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("Ingresa un tel\xE9fono v\xE1lido (8 d\xEDgitos CR o con c\xF3digo de pa\xEDs).");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            flow.data.phone = ph;
            flow.step = 2;
            await message.reply(`Vas a ELIMINAR las suscripciones de ${ph} y los pagos FUTUROS asociados. Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
            return;
          }
          if (flow.step === 2) {
            const ans = (body || "").trim().toLowerCase();
            if (ans !== "confirmar") {
              adminFlows.delete(chatId);
              await message.reply("Operaci\xF3n cancelada.");
              return;
            }
            try {
              const res = await apiClient.deleteSubscriptionsByPhone(flow.data.phone);
              await message.reply(`\u2705 Eliminadas suscripciones: ${JSON.stringify(res)}`);
            } catch (e) {
              await message.reply(`Error eliminando suscripciones: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "delete_transaction") {
          if (flow.step === 1) {
            const ans = (body || "").trim().toLowerCase();
            if (ans !== "confirmar") {
              adminFlows.delete(chatId);
              await message.reply("\u274C Operaci\xF3n cancelada.");
              return;
            }
            try {
              await apiClient.deleteTransaction(flow.data.txnId);
              await message.reply(`\u2705 Transacci\xF3n ${flow.data.txnId} eliminada correctamente`);
            } catch (e) {
              await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "view_details") {
          if (flow.step === 1) {
            let ph = body === "yo" ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("Ingresa un tel\xE9fono v\xE1lido (8 d\xEDgitos CR o con c\xF3digo de pa\xEDs).");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            try {
              const client = await apiClient.findCustomerByPhone(ph);
              if (!client) {
                await message.reply(`\u274C No encontr\xE9 un cliente con ese tel\xE9fono.

Escribe *adminmenu* para volver`);
                adminFlows.delete(chatId);
                return;
              }
              const contracts = await apiClient.listContracts({ client_id: client.id });
              const lines = [];
              lines.push(`\u{1F4C7} *Detalles de ${client.name || ph}*`);
              lines.push(`\u{1F4F1} ${client.phone}`);
              lines.push("");
              if (contracts && contracts.length) {
                lines.push(`\u{1F4BC} *Contratos*: ${contracts.length}`);
                contracts.slice(0, 5).forEach((c) => {
                  lines.push(`  \u2022 ${c.name || "Sin nombre"}`);
                  lines.push(`    \u20A1${Number(c.amount || 0).toLocaleString("es-CR")} ${c.currency || "CRC"}`);
                  lines.push(`    Ciclo: ${c.billing_cycle || "N/A"}`);
                  if (c.next_due_date) lines.push(`    Pr\xF3ximo: ${c.next_due_date.split("T")[0]}`);
                });
                if (contracts.length > 5) lines.push(`  ...y ${contracts.length - 5} m\xE1s`);
              } else {
                lines.push("\u{1F4BC} Sin contratos activos");
              }
              lines.push("");
              lines.push("Escribe *adminmenu* para volver al men\xFA admin");
              await message.reply(lines.join("\n"));
            } catch (e) {
              logger.error({ e, phone: ph }, "Error consultando detalles de cliente");
              await message.reply(`\u274C Error consultando detalles: ${String(e && e.message ? e.message : e)}

Escribe *adminmenu* para volver`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "generate_receipt") {
          if (flow.step === 1) {
            let ph = normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("\u274C Tel\xE9fono inv\xE1lido. Usa 8 d\xEDgitos.");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            try {
              await message.reply("\u23F3 Generando comprobante...");
              const res = await apiClient.createReceiptForClient({ phone: ph });
              if (res && res.receipt_id) {
                await apiClient.sendReceipt(res.receipt_id);
                await message.reply(`\u2705 Comprobante generado y enviado a ${ph}
ID: ${res.receipt_id}

Escribe *adminmenu* para volver`);
              } else {
                await message.reply("Error generando comprobante (respuesta inesperada del backend).");
              }
            } catch (e) {
              await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "send_receipt") {
          if (flow.step === 1) {
            const receiptId = parseInt(body);
            if (isNaN(receiptId)) {
              await message.reply("\u274C ID inv\xE1lido. Ingresa solo n\xFAmeros.");
              return;
            }
            try {
              await apiClient.sendReceipt(receiptId);
              await message.reply(`\u2705 Comprobante ${receiptId} enviado (o solicitado env\xEDo).

Escribe *adminmenu* para volver`);
            } catch (e) {
              await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "list_transactions") {
          if (flow.step === 1) {
            let filterPhone;
            const txt = body.trim();
            if (txt && txt.length > 0) {
              filterPhone = normalizeCR(txt);
              if (filterPhone.length === 8) filterPhone = (config.defaultCountryCode || "506") + filterPhone;
            }
            try {
              const transactions = await apiClient.listTransactions(filterPhone, 20);
              if (!transactions || transactions.length === 0) {
                await message.reply(filterPhone ? `\u{1F4ED} No hay transacciones para ${filterPhone}` : "\u{1F4ED} No hay transacciones registradas");
                adminFlows.delete(chatId);
                return;
              }
              const lines = [];
              lines.push(filterPhone ? `\u{1F4B0} *Transacciones de ${filterPhone}* (${transactions.length})` : `\u{1F4B0} *\xDAltimas transacciones* (${transactions.length})`, "");
              for (const [idx, t] of transactions.entries()) {
                lines.push(`*${idx + 1}.* ID: ${t.id}`);
                lines.push(`   \u{1F4C5} ${t.created_at || t.txn_date}`);
                lines.push(`   \u{1F4B5} \u20A1${Number(t.amount || 0).toLocaleString("es-CR")}`);
                lines.push(`   \u{1F4F1} ${t.phone || "N/A"}`);
                lines.push(`   \u{1F464} ${t.client_name || "\u2753 Sin match"}`);
                if (t.motivo) lines.push(`   \u{1F4DD} ${t.motivo}`);
                if (t.ref) lines.push(`   \u{1F516} Ref: ${String(t.ref).substring(0, 15)}...`);
                lines.push("");
              }
              lines.push("Escribe *adminmenu* para volver al men\xFA admin");
              await message.reply(lines.join("\n"));
            } catch (e) {
              await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "delete_transaction_input") {
          if (flow.step === 1) {
            const txnId = parseInt(body);
            if (isNaN(txnId)) {
              await message.reply("\u274C ID inv\xE1lido. Ingresa solo n\xFAmeros.");
              return;
            }
            flow.data.txnId = txnId;
            flow.type = "delete_transaction";
            flow.step = 1;
            await message.reply(`\u26A0\uFE0F \xBFEliminar transacci\xF3n?

ID: ${txnId}

Responde CONFIRMAR para continuar`);
            return;
          }
        }
        if (flow.type === "create_payment") {
          if (flow.step === 1) {
            let ph = normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("\u274C Tel\xE9fono inv\xE1lido. Usa 8 d\xEDgitos.");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            const client = await apiClient.findCustomerByPhone(ph);
            if (!client) {
              await message.reply(`\u274C No encontr\xE9 un cliente con ese tel\xE9fono.

Escribe *adminmenu* para volver`);
              adminFlows.delete(chatId);
              return;
            }
            flow.data.client = client;
            flow.step = 2;
            await message.reply(`Cliente: *${client.name}*

Ingresa el monto del pago (solo n\xFAmeros, ej: 7000):`);
            return;
          }
          if (flow.step === 2) {
            const amount = parseAmountCRC(body);
            if (!amount || amount <= 0) {
              await message.reply("\u274C Monto inv\xE1lido. Escribe solo n\xFAmeros.");
              return;
            }
            flow.data.amount = amount;
            flow.step = 3;
            await message.reply("Moneda (CRC o USD):");
            return;
          }
          if (flow.step === 3) {
            const currency = body.trim().toUpperCase();
            if (!["CRC", "USD"].includes(currency)) {
              await message.reply("\u274C Moneda inv\xE1lida. Escribe CRC o USD.");
              return;
            }
            flow.data.currency = currency;
            flow.step = 4;
            await message.reply("Canal de pago (ej: sinpe, transferencia, efectivo):");
            return;
          }
          if (flow.step === 4) {
            flow.data.channel = body.trim() || "manual";
            flow.step = 5;
            await message.reply("Referencia (opcional, Enter para omitir):");
            return;
          }
          if (flow.step === 5) {
            flow.data.reference = body.trim() || null;
            flow.step = 6;
            const d = flow.data;
            const resumen = [
              "\u{1F4DD} *Resumen del Pago*",
              "",
              `\u{1F464} Cliente: ${d.client.name}`,
              `\u{1F4F1} Tel\xE9fono: ${d.client.phone}`,
              `\u{1F4B5} Monto: \u20A1${Number(d.amount).toLocaleString("es-CR")} ${d.currency}`,
              `\u{1F4CA} Canal: ${d.channel}`,
              `\u{1F516} Referencia: ${d.reference || "Sin referencia"}`,
              "",
              'Confirma con "si" o "no"'
            ].join("\n");
            await message.reply(resumen);
            return;
          }
          if (flow.step === 6) {
            const ans = body.trim().toLowerCase();
            if (!["si", "s\xED", "s", "y", "yes"].includes(ans)) {
              if (["no", "n", "cancelar"].includes(ans)) {
                adminFlows.delete(chatId);
                await message.reply("\u274C Registro de pago cancelado.\n\nEscribe *adminmenu* para volver");
                return;
              }
              await message.reply('Responde "si" para confirmar o "no" para cancelar.');
              return;
            }
            try {
              const d = flow.data;
              const paymentPayload = {
                client_id: d.client.id,
                amount: d.amount,
                currency: d.currency,
                channel: d.channel,
                status: "unverified",
                reference: d.reference,
                metadata: { registered_by: "admin_via_bot", admin_phone: fromNorm }
              };
              const payment = await apiClient.createPayment(paymentPayload);
              await message.reply(`\u2705 Pago registrado correctamente.

ID: ${payment.id}
Estado: ${payment.status}

Escribe *adminmenu* para volver`);
            } catch (e) {
              logger.error({ e, data: flow.data }, "Error creando pago manual");
              await message.reply(`\u274C Error registrando pago: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "conciliate_payment") {
          if (flow.step === 1) {
            const paymentId = parseInt(body);
            if (isNaN(paymentId)) {
              await message.reply("\u274C ID inv\xE1lido. Ingresa solo n\xFAmeros.");
              return;
            }
            try {
              const payment = await apiClient.getPayment(paymentId);
              if (!payment) {
                await message.reply(`\u274C No encontr\xE9 el pago con ID ${paymentId}.

Escribe *adminmenu* para volver`);
                adminFlows.delete(chatId);
                return;
              }
              flow.data.payment = payment;
              flow.step = 2;
              const lines = [
                "\u{1F4B0} *Pago a Conciliar*",
                "",
                `ID: ${payment.id}`,
                `Cliente: ${payment.client?.name || payment.client_id}`,
                `Monto: \u20A1${Number(payment.amount || 0).toLocaleString("es-CR")} ${payment.currency || "CRC"}`,
                `Estado actual: ${payment.status}`,
                `Referencia: ${payment.reference || "Sin referencia"}`,
                "",
                "Estado nuevo (verified, rejected, o Enter para verified):"
              ].join("\n");
              await message.reply(lines);
              return;
            } catch (e) {
              await message.reply(`\u274C Error obteniendo pago: ${String(e && e.message ? e.message : e)}`);
              adminFlows.delete(chatId);
              return;
            }
          }
          if (flow.step === 2) {
            const newStatus = body.trim() || "verified";
            if (!["verified", "rejected", "pending", "unverified"].includes(newStatus)) {
              await message.reply("\u274C Estado inv\xE1lido. Usa: verified, rejected, pending o unverified");
              return;
            }
            flow.data.newStatus = newStatus;
            flow.step = 3;
            await message.reply("Notas de conciliaci\xF3n (opcional, Enter para omitir):");
            return;
          }
          if (flow.step === 3) {
            const notes = body.trim() || null;
            try {
              const d = flow.data;
              await apiClient.updatePayment(d.payment.id, { status: d.newStatus });
              const conciliationPayload = {
                payment_id: d.payment.id,
                status: d.newStatus,
                notes,
                conciliated_by: fromNorm,
                conciliated_at: (/* @__PURE__ */ new Date()).toISOString()
              };
              await apiClient.createConciliation(conciliationPayload);
              await message.reply(`\u2705 Pago conciliado correctamente.

ID: ${d.payment.id}
Nuevo estado: ${d.newStatus}

Escribe *adminmenu* para volver`);
            } catch (e) {
              logger.error({ e, paymentId: flow.data.payment?.id }, "Error conciliando pago");
              await message.reply(`\u274C Error conciliando pago: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
        if (flow.type === "delete_contracts_by_phone") {
          if (flow.step === 1) {
            let ph = normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) {
              await message.reply("\u274C Tel\xE9fono inv\xE1lido.");
              return;
            }
            if (ph.length === 8) ph = (config.defaultCountryCode || "506") + ph;
            flow.data.phone = ph;
            flow.step = 2;
            await message.reply(`\u26A0\uFE0F Vas a ELIMINAR los contratos de ${ph} y los pagos FUTUROS asociados.

Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
            return;
          }
          if (flow.step === 2) {
            const ans = body.trim().toLowerCase();
            if (ans !== "confirmar") {
              adminFlows.delete(chatId);
              await message.reply("\u274C Operaci\xF3n cancelada.");
              return;
            }
            try {
              const result = await apiClient.deleteContractsByPhone(flow.data.phone);
              await message.reply(`\u2705 ${result.deleted} contrato(s) eliminado(s) correctamente.`);
            } catch (e) {
              await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }
      } catch (e) {
        adminFlows.delete(chatId);
        await message.reply(`Error en asistente: ${String(e && e.message ? e.message : e)}`);
        return;
      }
    }
    if (lc === "si" && pendingConfirmReceipt.has(chatId)) {
      const pending = pendingConfirmReceipt.get(chatId);
      try {
        const saved = await saveReceipt(chatId, pending.filename || `receipt-${Date.now()}.bin`, pending.data, pending.mimetype, pending.text);
        let backendPaymentId = null;
        try {
          let client = null;
          try {
            client = await apiClient.findCustomerByPhone(fromNorm);
          } catch (e) {
          }
          if (!client) {
            try {
              client = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser });
            } catch (e) {
            }
          }
          const paymentPayload = {
            client_id: client && client.id ? client.id : void 0,
            amount: 0,
            currency: "CRC",
            channel: "whatsapp",
            status: "unverified",
            reference: `bot:${saved.id}`,
            metadata: { local_receipt_id: saved.id }
          };
          const pRes = await apiClient.createPayment(paymentPayload);
          if (pRes && (pRes.id || pRes.payment_id)) {
            backendPaymentId = pRes.id ?? pRes.payment_id;
            await updateReceiptEntry(saved.id, { backend_payment_id: backendPaymentId, status: "created" });
          } else {
            await updateReceiptEntry(saved.id, { status: "created" });
          }
          if (backendPaymentId && pending.mimetype === "application/pdf") {
            try {
              const fileBuf = Buffer.from(pending.data, "base64");
              const fdMod2 = await import("./form_data-32T725I6.js");
              const FormDataCtor2 = fdMod2 && fdMod2.default ? fdMod2.default : fdMod2;
              const form2 = new FormDataCtor2();
              form2.append("file", fileBuf, { filename: pending.filename, contentType: pending.mimetype });
              form2.append("received_at", (/* @__PURE__ */ new Date()).toISOString());
              form2.append("metadata", JSON.stringify([]));
              const headers2 = Object.assign({ Authorization: `Bearer ${config.apiToken}`, Accept: "application/json" }, form2.getHeaders());
              await axios2.post(`${config.apiBaseUrl.replace(/\/$/, "")}/payments/${backendPaymentId}/receipts`, form2, { headers: headers2 });
            } catch (e) {
              logger.debug({ e, backendPaymentId, saved }, "No se pudo adjuntar PDF al payment (confirmaci\xF3n)");
            }
          }
        } catch (e) {
          logger.warn({ e, chatId }, "No se pudo crear payment placeholder en backend (confirmaci\xF3n)");
        }
        awaitingMonths.set(chatId, { receiptId: saved.id, backendPaymentId });
        await message.reply("Gracias. \xBFCu\xE1ntos meses est\xE1s pagando con este comprobante? Responde con un n\xFAmero, por ejemplo: 1");
        try {
          const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : "50672140974";
          const adminChatId = normalizeToChatId(adminPhone);
          if (adminChatId) {
            const notifyText = backendPaymentId ? `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id} | backend payment: ${backendPaymentId}` : `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id}`;
            await whatsappClient.sendText(adminChatId, notifyText);
            await whatsappClient.sendMedia(adminChatId, pending.data, pending.mimetype, pending.filename);
            logger.info({ adminChatId, chatId, file: saved.filepath, backendPaymentId }, "Enviado comprobante al admin (confirmaci\xF3n)");
          }
        } catch (e) {
          logger.warn({ e }, "Fallo notificando admin sobre comprobante recibido (confirmaci\xF3n)");
        }
        pendingConfirmReceipt.delete(chatId);
        return;
      } catch (e) {
        pendingConfirmReceipt.delete(chatId);
        logger.error({ e }, "Error procesando comprobante confirmado");
        await message.reply('\u274C Ocurri\xF3 un error procesando el comprobante. Intenta de nuevo o escribe "salir" para cancelar.');
        return;
      }
    }
    if (lc === "no" && pendingConfirmReceipt.has(chatId)) {
      pendingConfirmReceipt.delete(chatId);
      await message.reply("He cancelado el registro del archivo. Si necesitas enviar el comprobante usa la opci\xF3n 6 del men\xFA.");
      return;
    }
    if (awaitingMonths.has(chatId)) {
      const payload = awaitingMonths.get(chatId);
      const asNum = Number(body.replace(/[^0-9]/g, ""));
      if (!Number.isNaN(asNum) && asNum > 0) {
        let monthlyAmount = null;
        try {
          try {
            let clientForAmount = null;
            try {
              clientForAmount = await apiClient.findCustomerByPhone(fromNorm);
            } catch (e) {
            }
            if (!clientForAmount) {
              try {
                clientForAmount = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser });
              } catch (e) {
              }
            }
            if (clientForAmount && clientForAmount.id) {
              const contracts = await apiClient.listContracts({ client_id: clientForAmount.id });
              if (Array.isArray(contracts) && contracts.length) {
                const c = contracts[0];
                if (c && (c.amount || c.monto)) {
                  monthlyAmount = Number(c.amount || c.monto) || null;
                }
              }
            }
          } catch (e) {
            logger.debug({ e, chatId }, "No se pudo obtener contrato para calcular monto mensual");
          }
          let client = null;
          try {
            client = await apiClient.findCustomerByPhone(fromNorm);
          } catch (e) {
            logger.debug({ e, fromNorm }, "findCustomerByPhone fallo");
          }
          if (!client) {
            try {
              client = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser });
            } catch (e) {
              logger.warn({ e, fromNorm }, "No se pudo upsertCustomer, continuando sin cliente backend");
            }
          }
          const amount = monthlyAmount ? monthlyAmount * asNum : 0;
          let appliedResult = null;
          if (payload.backendPaymentId) {
            try {
              const updatePayload = {
                amount,
                currency: "CRC",
                metadata: Object.assign({}, { months: asNum, backend_receipt_id: payload.backendPaymentId, local_receipt_id: payload.receiptId })
              };
              appliedResult = await apiClient.updatePayment(payload.backendPaymentId, updatePayload);
              await updateReceiptEntry(payload.receiptId, { months: asNum, status: "applied", backend_apply_result: appliedResult, backend_payment_id: appliedResult && (appliedResult.id || appliedResult.payment_id) ? appliedResult.id ?? appliedResult.payment_id : payload.backendPaymentId, monthly_amount: monthlyAmount, total_amount: amount });
            } catch (e) {
              throw e;
            }
          } else {
            const paymentPayload = {
              client_id: client && client.id ? client.id : void 0,
              amount,
              currency: "CRC",
              channel: "whatsapp",
              status: "unverified",
              reference: payload.backendReceiptId ? `receipt:${payload.backendReceiptId}` : `bot:${payload.receiptId}`,
              metadata: { months: asNum, backend_receipt_id: payload.backendReceiptId }
            };
            const res = await apiClient.createPayment(paymentPayload);
            appliedResult = res;
            await updateReceiptEntry(payload.receiptId, { months: asNum, status: "applied", backend_apply_result: res, backend_payment_id: res && (res.id || res.payment_id) ? res.id ?? res.payment_id : null, monthly_amount: monthlyAmount, total_amount: amount });
          }
          try {
            const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : "50672140974";
            const adminChatId = normalizeToChatId(adminPhone);
            if (adminChatId) {
              const txt = `El cliente ${fromUser} (${chatId}) indic\xF3 que paga ${asNum} mes(es) para el comprobante ${payload.receiptId}` + (payload.backendReceiptId ? ` (backend receipt ${payload.backendReceiptId})` : "");
              await whatsappClient.sendText(adminChatId, txt);
              logger.info({ adminChatId, chatId, months: asNum, receiptId: payload.receiptId }, "Admin notificado: meses aplicados al comprobante");
            }
          } catch (e) {
            logger.warn({ e }, "No se pudo notificar al admin sobre meses aplicados");
          }
          awaitingMonths.delete(chatId);
          await message.reply(`\u2705 Gracias. He registrado que pagas ${asNum} mes(es). Un asesor validar\xE1 y conciliar\xE1 el pago.`);
          return;
        } catch (e) {
          const errInfo = { message: String(e && e.message ? e.message : e) };
          try {
            if (e && e.response) {
              errInfo.status = e.response.status;
              errInfo.data = e.response.data;
            }
            if (e && e.code) errInfo.code = e.code;
          } catch (ee) {
          }
          logger.warn({ errInfo, chatId, payload: { phone: fromNorm, months: asNum, backendReceiptId: payload.backendReceiptId } }, "Error informando al backend sobre meses");
          try {
            await updateReceiptEntry(payload.receiptId, { status: "apply_failed", apply_error: errInfo, attempted_months: asNum });
          } catch (ee) {
            logger.debug({ ee }, "No se pudo actualizar \xEDndice con error de aplicaci\xF3n de meses");
          }
          await message.reply('\u274C No pude registrar el n\xFAmero de meses en este momento. Intentar\xE9 de nuevo autom\xE1ticamente en unos minutos y, si sigue fallando, un asesor te ayudar\xE1. Mientras tanto puedes escribir "salir" para cancelar.');
          try {
            const retryDelayMs = 60 * 1e3;
            setTimeout(async () => {
              try {
                let clientRetry = null;
                try {
                  clientRetry = await apiClient.findCustomerByPhone(fromNorm);
                } catch (e2) {
                }
                if (!clientRetry) {
                  try {
                    clientRetry = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser });
                  } catch (e2) {
                  }
                }
                const amountRetry = monthlyAmount ? monthlyAmount * asNum : 0;
                const paymentPayloadRetry = {
                  client_id: clientRetry && clientRetry.id ? clientRetry.id : void 0,
                  amount: amountRetry,
                  currency: "CRC",
                  channel: "whatsapp",
                  status: "unverified",
                  reference: payload.backendReceiptId ? `receipt:${payload.backendReceiptId}` : `bot:${payload.receiptId}`,
                  metadata: { months: asNum, backend_receipt_id: payload.backendReceiptId }
                };
                const retryRes = await apiClient.createPayment(paymentPayloadRetry);
                await updateReceiptEntry(payload.receiptId, { status: "applied", backend_apply_result: retryRes, backend_payment_id: retryRes && (retryRes.id || retryRes.payment_id) ? retryRes.id ?? retryRes.payment_id : null, monthly_amount: monthlyAmount, total_amount: amountRetry });
                try {
                  const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : "50672140974";
                  const adminChatId = normalizeToChatId(adminPhone);
                  if (adminChatId) {
                    const txt = `Reintento exitoso: aplicados ${asNum} mes(es) para el comprobante ${payload.receiptId} del cliente ${fromUser} (${chatId}).`;
                    await whatsappClient.sendText(adminChatId, txt);
                  }
                } catch (e2) {
                  logger.debug({ e2 }, "No se pudo notificar al admin tras reintento exitoso");
                }
              } catch (e2) {
                logger.warn({ e2, chatId }, "Reintento fallido aplicando meses");
                try {
                  await updateReceiptEntry(payload.receiptId, { status: "apply_failed", apply_error_retry: String(e2 && e2.message ? e2.message : e2) });
                } catch (ee) {
                }
              }
            }, retryDelayMs);
          } catch (ee) {
            logger.debug({ ee }, "No se pudo programar reintento");
          }
          return;
        }
      } else {
        await message.reply('Por favor responde con un n\xFAmero entero de meses (ej: 1). Escribe "salir" para cancelar.');
        return;
      }
    }
    if (isAdminUser && menuShown.get(chatId) && lastMenuItems.get(chatId)?.[0]?.type === "admin_menu") {
      const selection = (body || "").trim().replace(/\s+/g, "");
      if (selection === "1") {
        adminFlows.set(chatId, { type: "create_subscription", step: 1, data: {} });
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Asistente: Crear cliente + suscripci\xF3n.\nTel\xE9fono del cliente (8 d\xEDgitos o con c\xF3digo de pa\xEDs). Escribe "yo" para usar tu n\xFAmero.');
        return;
      }
      if (selection === "2") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el tel\xE9fono del cliente (8 d\xEDgitos) o escribe "yo" para ver tus detalles:');
        adminFlows.set(chatId, { type: "view_details", step: 1, data: {} });
        return;
      }
      if (selection === "3") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const phone = fromUser;
          const client = await apiClient.findCustomerByPhone(phone);
          if (!client) {
            await message.reply(`\u{1F4C7} *Tus Detalles*

\u274C No est\xE1s registrado como cliente.

Escribe *adminmenu* para volver`);
            return;
          }
          const contracts = await apiClient.listContracts({ client_id: client.id });
          const lines = [];
          lines.push(`\u{1F4C7} *Tus Detalles*`);
          lines.push(`\u{1F464} ${client.name || phone}`);
          lines.push(`\u{1F4F1} ${client.phone}`);
          lines.push("");
          if (contracts && contracts.length) {
            lines.push(`\u{1F4BC} *Contratos*: ${contracts.length}`);
            contracts.slice(0, 3).forEach((c) => {
              lines.push(`  \u2022 ${c.name || "Sin nombre"}`);
              lines.push(`    \u20A1${Number(c.amount || 0).toLocaleString("es-CR")} ${c.currency || "CRC"}`);
              lines.push(`    Ciclo: ${c.billing_cycle || "N/A"}`);
              if (c.next_due_date) lines.push(`    Pr\xF3ximo: ${c.next_due_date.split("T")[0]}`);
            });
            if (contracts.length > 3) lines.push(`  ...y ${contracts.length - 3} m\xE1s`);
          } else {
            lines.push("\u{1F4BC} Sin contratos activos");
          }
          lines.push("");
          lines.push("Escribe *adminmenu* para volver al men\xFA admin");
          await message.reply(lines.join("\n"));
        } catch (e) {
          logger.error({ e, phone: fromUser }, "Error consultando mis detalles");
          await message.reply(`\u274C Error consultando detalles: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (selection === "16") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        adminFlows.set(chatId, { type: "pause_contact", step: 1, data: {} });
        await message.reply([
          "Pausar/Reanudar contacto (silenciar bot).",
          "",
          "1) Enviame el tel\xE9fono del cliente (8 d\xEDgitos CR o con c\xF3digo de pa\xEDs, ej: 5067xxxxxxx).",
          'Tambi\xE9n puedes escribir "yo" para usar tu n\xFAmero.'
        ].join("\n"));
        return;
      }
      if (selection === "17") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        adminFlows.set(chatId, { type: "cleanup_chats", step: 1, data: { dryRun: true, includeUnread: false } });
        await message.reply([
          "\u{1F9F9} Limpieza de chats (no-clientes)",
          "",
          "Esto revisa los chats del WhatsApp del BOT y limpia/archiva chats que NO sean clientes.",
          "Por seguridad primero corre en modo simulaci\xF3n (dry-run).",
          "",
          "Selecciona una opci\xF3n:",
          "1) Simular (dry-run) y mostrar resumen",
          "2) Ejecutar limpieza REAL (requiere confirmaci\xF3n)",
          "3) Configurar: incluir chats con NO LE\xCDDOS (por defecto NO)",
          "4) Configurar: incluir GRUPOS (por defecto NO)",
          "",
          "Escribe *adminmenu* para volver"
        ].join("\n"));
        return;
      }
      if (selection === "4") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const receipts = await apiClient.listReceiptsByDate(today);
          if (!receipts || receipts.length === 0) {
            await message.reply("\u{1F4C4} No hay comprobantes generados hoy.\n\nEscribe *adminmenu* para volver");
            return;
          }
          const lines = [];
          lines.push(`\u{1F4C4} *Comprobantes de hoy* (${receipts.length})`, "");
          receipts.forEach((r, idx) => {
            const status = r.sent_at ? "\u2705 Enviado" : "\u{1F4E4} Pendiente";
            const time = new Date(r.created_at).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
            lines.push(`*${idx + 1}.* ID: ${r.id} | ${status}`);
            lines.push(`   Cliente: ${r.customer_name || r.customer_phone}`);
            lines.push(`   Hora: ${time}`);
            lines.push("");
          });
          lines.push("Escribe *adminmenu* para volver al men\xFA admin");
          await message.reply(lines.join("\n"));
        } catch (e) {
          await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (selection === "5") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("Ingresa el tel\xE9fono del cliente para generar el comprobante (8 d\xEDgitos):");
        adminFlows.set(chatId, { type: "generate_receipt", step: 1, data: {} });
        return;
      }
      if (selection === "6") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("Ingresa el ID del comprobante a enviar:");
        adminFlows.set(chatId, { type: "send_receipt", step: 1, data: {} });
        return;
      }
      if (selection === "7") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("Ingresa el tel\xE9fono del cliente para filtrar transacciones, o presiona Enter para ver todas (\xFAltimas 20):");
        adminFlows.set(chatId, { type: "list_transactions", step: 1, data: {} });
        return;
      }
      if (selection === "8") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          await processor.runBatch();
          await message.reply("\u2705 Scheduler ejecutado (runBatch).\n\nEscribe *adminmenu* para volver");
        } catch (e) {
          await message.reply("\u274C Error ejecutando scheduler: " + String(e));
        }
        return;
      }
      if (selection === "9") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("\u{1F4DD} *Registrar Pago Manual*\n\nIngresa el tel\xE9fono del cliente (8 d\xEDgitos):");
        adminFlows.set(chatId, { type: "create_payment", step: 1, data: {} });
        return;
      }
      if (selection === "10") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("\u{1F504} *Conciliar Pago*\n\nIngresa el ID del pago a conciliar:");
        adminFlows.set(chatId, { type: "conciliate_payment", step: 1, data: {} });
        return;
      }
      if (selection === "11") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const payments = await apiClient.listPayments({ status: ["pending", "unverified"], per_page: 20 });
          if (!payments || payments.length === 0) {
            await message.reply("\u{1F4ED} No hay pagos pendientes.\n\nEscribe *adminmenu* para volver");
            return;
          }
          const lines = [];
          lines.push(`\u{1F4B0} *Pagos Pendientes* (${payments.length})`, "");
          for (const [idx, p] of payments.entries()) {
            lines.push(`*${idx + 1}.* ID: ${p.id}`);
            lines.push(`   \u{1F4B5} \u20A1${Number(p.amount || 0).toLocaleString("es-CR")} ${p.currency || "CRC"}`);
            lines.push(`   \u{1F464} ${p.client?.name || p.client_id || "Sin cliente"}`);
            lines.push(`   \u{1F4CB} Estado: ${p.status}`);
            if (p.reference) lines.push(`   \u{1F516} Ref: ${p.reference}`);
            lines.push("");
          }
          lines.push("Escribe *adminmenu* para volver");
          await message.reply(lines.join("\n"));
        } catch (e) {
          await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (selection === "12") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("Ingresa el tel\xE9fono del cliente a ELIMINAR (8 d\xEDgitos o con c\xF3digo de pa\xEDs):");
        adminFlows.set(chatId, { type: "delete_customer", step: 1, data: {} });
        return;
      }
      if (selection === "13") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("Ingresa el tel\xE9fono del cliente para eliminar sus contratos (8 d\xEDgitos):");
        adminFlows.set(chatId, { type: "delete_contracts_by_phone", step: 1, data: {} });
        return;
      }
      if (selection === "14") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply("Ingresa el ID de la transacci\xF3n a eliminar:");
        adminFlows.set(chatId, { type: "delete_transaction_input", step: 1, data: {} });
        return;
      }
      if (selection === "15") {
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const uptime = process.uptime();
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor(uptime % 3600 / 60);
          const statusText = [
            "\u{1F916} *Estado del Bot*",
            "",
            `\u23F1\uFE0F Uptime: ${hours}h ${minutes}m`,
            `\u{1F4CA} Memoria: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            `\u{1F310} Node: ${process.version}`,
            `\u2699\uFE0F Timezone: ${TIMEZONE}`,
            `\u{1F550} Horario: ${formatBusinessHours()}`,
            "",
            "Escribe *adminmenu* para volver"
          ].join("\n");
          await message.reply(statusText);
        } catch (e) {
          await message.reply(`Error obteniendo estado: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      await message.reply("Opci\xF3n no reconocida. Escribe *adminmenu* para ver el men\xFA o *help para ver comandos de texto.");
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      return;
    }
    if (isAdminUser && lc.startsWith("*")) {
      const cmd = lc.slice(1).trim();
      if (cmd === "help" || cmd === "ayuda") {
        const helpText = [
          "\u{1F527} *Comandos admin disponibles:*",
          "",
          "*adminmenu* \u2014 men\xFA interactivo admin",
          "*ping* \u2014 healthcheck",
          "*status* \u2014 estado del bot",
          "*cancelar* \u2014 cancelar asistente admin",
          "*runscheduler* \u2014 ejecutar procesamiento de recordatorios (batch)",
          "*nuevo* \u2014 crear cliente + suscripci\xF3n (asistente)",
          "*detalles <telefono>* \u2014 ver cliente y sus suscripciones",
          "*yo* \u2014 ver mis propios detalles",
          "*comprobantes* \u2014 listar comprobantes del d\xEDa",
          "*comprobante <telefono>* \u2014 generar y enviar comprobante",
          "*enviar <id>* \u2014 enviar comprobante por ID",
          "*transacciones* \u2014 listar transacciones",
          "*eliminar cliente <telefono>* \u2014 eliminar cliente",
          "*eliminar suscripcion <telefono>* \u2014 eliminar suscripciones por tel\xE9fono",
          "*eliminar trans <id>* \u2014 eliminar transacci\xF3n por ID"
        ].join("\n");
        await message.reply(helpText);
        return;
      }
      if (cmd === "cancelar" || cmd === "cancel") {
        if (adminFlows.has(chatId)) {
          adminFlows.delete(chatId);
          await message.reply("Asistente admin cancelado.");
        } else {
          await message.reply("No hay asistente admin en curso.");
        }
        return;
      }
      if (cmd === "ping") {
        await message.reply("pong");
        return;
      }
      if (cmd === "runscheduler" || cmd === "run") {
        try {
          await processor.runBatch();
          await message.reply("Scheduler ejecutado (runBatch).");
        } catch (e) {
          await message.reply("Error ejecutando scheduler: " + String(e));
        }
        return;
      }
      if (cmd === "nuevo" || cmd === "crear" || cmd === "add") {
        adminFlows.set(chatId, { type: "create_subscription", step: 1, data: {} });
        await message.reply('Asistente: Crear cliente + suscripci\xF3n.\nTel\xE9fono del cliente (8 d\xEDgitos o con c\xF3digo de pa\xEDs). Escribe "yo" para usar tu n\xFAmero.');
        return;
      }
      if (cmd.startsWith("eliminar cliente")) {
        const parts = cmd.split(/\s+/);
        const p0 = parts[2] ? normalizeCR(parts[2]) : "";
        adminFlows.set(chatId, { type: "delete_customer", step: 1, data: {} });
        const p = p0 && /^\d{8,15}$/.test(p0) ? p0.length === 8 ? (config.defaultCountryCode || "506") + p0 : p0 : "";
        if (!p) {
          await message.reply('Ingresa el tel\xE9fono del cliente a ELIMINAR (8 d\xEDgitos o con c\xF3digo de pa\xEDs). Puedes escribir "yo".');
          return;
        }
        try {
          const flow = adminFlows.get(chatId);
          flow.data.phone = p;
          const cust = await apiClient.findCustomerByPhone(p);
          if (!cust) {
            adminFlows.delete(chatId);
            await message.reply("No existe un cliente con ese tel\xE9fono.");
            return;
          }
          flow.data.customer_id = cust.id;
          flow.step = 2;
          await message.reply(`Vas a ELIMINAR al cliente ${cust.name || cust.phone} y TODO su historial (pagos, recordatorios y suscripciones). Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
        } catch (e) {
          adminFlows.delete(chatId);
          await message.reply(`Error preparando eliminaci\xF3n: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd.startsWith("eliminar suscripcion") || cmd.startsWith("eliminar suscripci\xF3n")) {
        const parts = cmd.split(/\s+/);
        const p0 = parts[2] ? normalizeCR(parts[2]) : "";
        adminFlows.set(chatId, { type: "delete_subscriptions_by_phone", step: 1, data: {} });
        const p = p0 && /^\d{8,15}$/.test(p0) ? p0.length === 8 ? (config.defaultCountryCode || "506") + p0 : p0 : "";
        if (!p) {
          await message.reply('Ingresa el tel\xE9fono del cliente para eliminar sus suscripciones (8 d\xEDgitos o con c\xF3digo de pa\xEDs). Puedes escribir "yo".');
          return;
        }
        try {
          const flow = adminFlows.get(chatId);
          flow.data.phone = p;
          flow.step = 2;
          await message.reply(`Vas a ELIMINAR las suscripciones de ${p} y los pagos FUTUROS asociados. Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
        } catch (e) {
          adminFlows.delete(chatId);
          await message.reply(`Error preparando eliminaci\xF3n: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd === "yo") {
        try {
          const phone = fromUser;
          const client = await apiClient.findCustomerByPhone(phone);
          if (!client) {
            await message.reply(`\u{1F4C7} *Tus Detalles*

\u274C No est\xE1s registrado como cliente.`);
            return;
          }
          const contracts = await apiClient.listContracts({ client_id: client.id });
          const lines = [];
          lines.push(`\u{1F4C7} *Detalles de ${client.name || phone}*`);
          lines.push(`\u{1F4F1} ${client.phone}`);
          lines.push("");
          if (contracts && contracts.length) {
            lines.push(`\u{1F4BC} *Contratos*: ${contracts.length}`);
            contracts.slice(0, 3).forEach((c) => {
              lines.push(`  \u2022 ${c.name || "Sin nombre"}`);
              lines.push(`    \u20A1${Number(c.amount || 0).toLocaleString("es-CR")} ${c.currency || "CRC"}`);
              if (c.next_due_date) lines.push(`    Pr\xF3ximo: ${c.next_due_date.split("T")[0]}`);
            });
            if (contracts.length > 3) lines.push(`  ...y ${contracts.length - 3} m\xE1s`);
          } else {
            lines.push("\u{1F4BC} Sin contratos activos");
          }
          await message.reply(lines.join("\n"));
        } catch (e) {
          logger.error({ e, phone: fromUser }, "Error en comando *yo");
          await message.reply(`Error consultando detalles: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd.startsWith("detalles")) {
        try {
          const parts = cmd.split(/\s+/);
          let phone = parts[1] ? parts[1].replace(/[^0-9]/g, "") : "";
          if (!phone) phone = fromUser;
          const client = await apiClient.findCustomerByPhone(phone);
          if (!client) {
            await message.reply(`\u274C No encontr\xE9 un cliente con ese tel\xE9fono: ${phone}`);
            return;
          }
          const contracts = await apiClient.listContracts({ client_id: client.id });
          const lines = [];
          lines.push(`\u{1F4C7} *Detalles de ${client.name || phone}*`);
          lines.push(`\u{1F4F1} ${client.phone}`);
          lines.push("");
          if (contracts && contracts.length) {
            lines.push(`\u{1F4BC} *Contratos*: ${contracts.length}`);
            contracts.slice(0, 3).forEach((c) => {
              lines.push(`  \u2022 ${c.name || "Sin nombre"}`);
              lines.push(`    \u20A1${Number(c.amount || 0).toLocaleString("es-CR")} ${c.currency || "CRC"}`);
              if (c.next_due_date) lines.push(`    Pr\xF3ximo: ${c.next_due_date.split("T")[0]}`);
            });
            if (contracts.length > 3) lines.push(`  ...y ${contracts.length - 3} m\xE1s`);
          } else {
            lines.push("\u{1F4BC} Sin contratos activos");
          }
          await message.reply(lines.join("\n"));
        } catch (e) {
          logger.error({ e, phone: cmd.split(/\s+/)[1] }, "Error en comando *detalles");
          await message.reply(`Error consultando detalles: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd === "comprobantes") {
        try {
          const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const receipts = await apiClient.listReceiptsByDate(today);
          if (!receipts || receipts.length === 0) {
            await message.reply("\u{1F4C4} No hay comprobantes generados hoy.");
            return;
          }
          const lines = [];
          lines.push(`\u{1F4C4} *Comprobantes de hoy (${receipts.length})*`, "");
          receipts.forEach((r, idx) => {
            const status = r.sent_at ? "\u2705 Enviado" : "\u{1F4E4} Pendiente";
            const time = new Date(r.created_at).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
            lines.push(`*${idx + 1}.* ID: ${r.id} | ${status}`);
            lines.push(`   Cliente: ${r.customer_name || r.customer_phone}`);
            lines.push(`   Hora: ${time}`);
            lines.push(`   Para enviar: *enviar ${r.id}*`);
            lines.push("");
          });
          await message.reply(lines.join("\n"));
        } catch (e) {
          await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd.startsWith("comprobante ")) {
        try {
          const parts = cmd.split(/\s+/);
          let phone = parts[1] ? normalizeCR(parts[1]) : "";
          if (!phone || !/^\d{8,15}$/.test(phone)) {
            await message.reply("\u274C Tel\xE9fono inv\xE1lido. Usa: *comprobante 87654321*");
            return;
          }
          if (phone.length === 8) phone = (config.defaultCountryCode || "506") + phone;
          await message.reply("\u23F3 Generando comprobante...");
          const res = await apiClient.createReceiptForClient({ phone });
          if (res && res.receipt_id) {
            await apiClient.sendReceipt(res.receipt_id);
            await message.reply(`\u2705 Comprobante generado y enviado a ${phone}
ID: ${res.receipt_id}`);
          } else {
            await message.reply("Error generando comprobante (respuesta inesperada del backend).");
          }
        } catch (e) {
          await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd.startsWith("enviar ")) {
        try {
          const parts = cmd.split(/\s+/);
          const receiptId = parseInt(parts[1]);
          if (isNaN(receiptId)) {
            await message.reply("\u274C ID inv\xE1lido. Usa: *enviar 123*");
            return;
          }
          await apiClient.sendReceipt(receiptId);
          await message.reply(`\u2705 Comprobante ${receiptId} enviado (o solicitado env\xEDo).`);
        } catch (e) {
          await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd === "transacciones" || cmd === "trans" || cmd.startsWith("transacciones ") || cmd.startsWith("trans ")) {
        try {
          const parts = cmd.split(/\s+/);
          let filterPhone;
          if (parts.length > 1) {
            filterPhone = normalizeCR(parts[1]);
            if (filterPhone.length === 8) filterPhone = (config.defaultCountryCode || "506") + filterPhone;
          }
          const transactions = await apiClient.listTransactions(filterPhone, 20);
          if (!transactions || transactions.length === 0) {
            await message.reply(filterPhone ? `\u{1F4ED} No hay transacciones para ${filterPhone}` : "\u{1F4ED} No hay transacciones registradas");
            return;
          }
          const lines = [];
          lines.push(filterPhone ? `\u{1F4B0} *Transacciones de ${filterPhone}* (${transactions.length})` : `\u{1F4B0} *\xDAltimas transacciones* (${transactions.length})`, "");
          for (const [idx, t] of transactions.entries()) {
            lines.push(`*${idx + 1}.* ID: ${t.id}`);
            lines.push(`   \u{1F4C5} ${t.created_at || t.txn_date}`);
            lines.push(`   \u{1F4B5} \u20A1${Number(t.amount || 0).toLocaleString("es-CR")}`);
            lines.push(`   \u{1F4F1} ${t.phone || "N/A"}`);
            lines.push(`   \u{1F464} ${t.client_name || "\u2753 Sin match"}`);
            if (t.motivo) lines.push(`   \u{1F4DD} ${t.motivo}`);
            if (t.ref) lines.push(`   \u{1F516} Ref: ${String(t.ref).substring(0, 15)}...`);
            lines.push("");
          }
          await message.reply(lines.join("\n"));
        } catch (e) {
          await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      if (cmd.startsWith("eliminar trans ")) {
        try {
          const parts = cmd.split(/\s+/);
          const txnId = parseInt(parts[2]);
          if (isNaN(txnId)) {
            await message.reply("\u274C ID inv\xE1lido. Usa: *eliminar trans 123*");
            return;
          }
          await message.reply(`\u26A0\uFE0F \xBFEliminar transacci\xF3n?

ID: ${txnId}

Responde CONFIRMAR para continuar`);
          adminFlows.set(chatId, { type: "delete_transaction", step: 1, data: { txnId } });
        } catch (e) {
          await message.reply(`\u274C Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      await message.reply("Comando admin no reconocido. Escribe *help para ver los comandos disponibles.");
      return;
    }
    if (lc === "ping") {
      await message.reply("pong");
      return;
    }
    if (lc === "pagos" || lc === "estado") {
      try {
        const paymentStatus = await apiClient.getPaymentStatus(fromNorm);
        if (!paymentStatus || !paymentStatus.success) {
          await message.reply("\u274C No encontramos informaci\xF3n sobre tu cuenta. Por favor cont\xE1ctanos directamente.");
          return;
        }
        const { client, summary, payments } = paymentStatus;
        const lines = [];
        lines.push(`\u{1F4CA} *Estado de Pagos*`);
        lines.push(`\u{1F464} ${client.name}`);
        lines.push(`\u{1F4F1} ${client.phone}`);
        lines.push("");
        lines.push(`\u{1F4C8} *Resumen:*`);
        lines.push(`  \u2022 Total de pagos: ${summary.total_payments}`);
        lines.push(`  \u2022 Completados: ${summary.completed}`);
        lines.push(`  \u2022 Pendientes: ${summary.pending}`);
        if (payments && payments.length > 0) {
          lines.push("");
          lines.push(`\u{1F4CB} *\xDAltimos pagos:*`);
          payments.slice(0, 5).forEach((p, idx) => {
            const date = p.paid_at ? p.paid_at.split("T")[0] : "\u2753 Sin fecha";
            const status = p.status === "completed" ? "\u2705" : p.status === "pending" ? "\u23F3" : "\u274C";
            lines.push(`${idx + 1}. ${status} \u20A1${Number(p.amount).toLocaleString("es-CR")} ${p.currency} (${date})`);
          });
          if (payments.length > 5) {
            lines.push(`...y ${payments.length - 5} pagos m\xE1s`);
          }
        }
        lines.push("");
        lines.push('Para m\xE1s informaci\xF3n cont\xE1ctanos o escribe "menu" para volver al men\xFA principal.');
        await message.reply(lines.join("\n"));
      } catch (error) {
        logger.error({ err: error, fromNorm }, "Error consultando estado de pagos");
        await message.reply("\u274C No pudimos obtener tu informaci\xF3n de pagos. Intenta m\xE1s tarde o cont\xE1ctanos directamente.");
      }
      return;
    }
    if (lc === "salir" || lc === "exit") {
      const wasAgent = !!agentMode.get(chatId);
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      agentMode.delete(chatId);
      chatTimeoutMs.delete(chatId);
      clearTimer(chatId);
      if (wasAgent) {
        await message.reply('Has salido del modo agente. Si deseas volver a ver las opciones escribe "menu".');
      } else {
        await message.reply('Has salido del men\xFA. Si deseas volver a ver las opciones escribe "menu".');
      }
      return;
    }
    if (lc === "menu" || lc === "inicio" || lc === "help") {
      try {
        const menuToUse = await resolveMenu();
        if (!menuToUse || !Array.isArray(menuToUse) || menuToUse.length === 0) {
          await message.reply("Lo siento, el men\xFA no est\xE1 disponible en este momento. Intenta m\xE1s tarde.");
          return;
        }
        const lines = [];
        lines.push("Hola! Bienvenido a nuestro \u{1F916} CHATBOT");
        lines.push("Somos Tecno Servicios Artavia, por favor env\xEDa el n\xFAmero de una de las siguientes opciones:");
        lines.push("");
        menuToUse.forEach((item) => {
          const label = (item.reply_message ?? "").split("\n")[0] || "";
          lines.push(`${item.keyword} - ${label}`);
        });
        lines.push("");
        lines.push('Escribe "menu" para volver al inicio o "salir" para finalizar la conversaci\xF3n.');
        await message.reply(lines.join("\n"));
        menuShown.set(chatId, true);
        lastMenuItems.set(chatId, menuToUse);
        return;
      } catch (error) {
        logger.error({ err: error }, "No se pudo resolver el men\xFA");
        await message.reply("Lo siento, el men\xFA no est\xE1 disponible en este momento. Intenta m\xE1s tarde.");
        return;
      }
    }
    if (lc === "agente" || lc === "asesor" || lc === "soporte") {
      const isOutsideHours = !_isWithinBusinessHours();
      if (isOutsideHours) {
        await message.reply(`\u23F0 Actualmente estamos fuera del horario de atenci\xF3n.

Nuestro horario: ${formatBusinessHours()}

\u2705 He registrado tu solicitud y un asesor te contactar\xE1 cuando inicie el horario de atenci\xF3n.

\u{1F4A1} Mientras tanto, puedes usar el men\xFA (escribe "menu") para acceder a opciones autom\xE1ticas disponibles 24/7.`);
      } else {
        await message.reply("Perfecto, te estoy conectando con un asesor. Un miembro de nuestro equipo te atender\xE1 en breve. Por favor espera un momento.");
      }
      agentMode.set(chatId, true);
      chatTimeoutMs.set(chatId, _AGENT_TIMEOUT_MS);
      try {
        touchTimer(chatId);
      } catch (e) {
      }
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      logger.info({ chatId, trigger: lc }, "Chat puesto en modo agente (palabra clave)");
      try {
        const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : "50672140974";
        const adminChatId = normalizeToChatId(adminPhone);
        const now = Date.now();
        const lastNotified = adminNotifiedAt.get(chatId) || 0;
        if (adminChatId && now - lastNotified > AGENT_NOTIFY_THROTTLE_MS) {
          const isOutsideHours2 = !_isWithinBusinessHours();
          const offHoursPrefix = isOutsideHours2 ? "\u26A0\uFE0F FUERA DE HORARIO - " : "";
          const offHoursSuffix = isOutsideHours2 ? `

\u23F0 Nota: Esta solicitud se realiz\xF3 FUERA del horario de atenci\xF3n (${formatBusinessHours()}). El cliente ser\xE1 atendido cuando inicien las operaciones.` : "";
          const notifyText = `${offHoursPrefix}\u{1F514} Cliente ${fromUser} (${chatId}) solicit\xF3 hablar con un agente.

\xDAltimo mensaje: "${String(body).slice(0, 200)}"${offHoursSuffix}

Por favor responde directamente a este chat para atender al cliente.`;
          await whatsappClient.sendText(adminChatId, notifyText);
          adminNotifiedAt.set(chatId, now);
          logger.info({ adminChatId, chatId, outsideHours: isOutsideHours2 }, "Admin notificado sobre solicitud de agente (palabra clave)");
        } else {
          logger.debug({ chatId, lastNotified }, "Omitida notificaci\xF3n admin por throttle (palabra clave)");
        }
      } catch (e) {
        logger.warn({ e }, "No se pudo notificar al admin sobre solicitud de agente (palabra clave)");
      }
      return;
    }
    if (menuShown.get(chatId)) {
      try {
        const menu = lastMenuItems.get(chatId) ?? await resolveMenu();
        let matched = null;
        const asNum = parseInt(body, 10);
        if (!Number.isNaN(asNum) && Array.isArray(menu) && asNum >= 1 && asNum <= menu.length) {
          matched = menu[asNum - 1];
        } else {
          if (Array.isArray(menu) && menu.length && (menu[0].key || menu[0].keyword)) {
            matched = menu.find((m) => {
              if (m.keyword) return m.keyword.toLowerCase() === lc || m.keyword === body;
              if (m.key) return String(m.key).toLowerCase() === lc || String(m.key) === body;
              return false;
            });
          } else {
            matched = null;
          }
        }
        if (matched) {
          if (matched.submenu && Array.isArray(matched.submenu) && matched.submenu.length) {
            await message.reply(matched.reply_message);
            lastMenuItems.set(chatId, matched.submenu.map((s) => ({ key: (s.key || s.key_text || "").toString().toLowerCase(), text: s.text || s.reply_message || "" })));
            menuShown.set(chatId, true);
            return;
          }
          const replyText = matched.reply_message || matched.text || matched.response || "";
          const isOptionFive = typeof asNum === "number" && asNum === 5 || matched.keyword && String(matched.keyword).trim() === "5" || matched.key && String(matched.key).trim() === "5";
          if (isOptionFive) {
            const isOutsideHours = !_isWithinBusinessHours();
            let agentMsg = "";
            if (isOutsideHours) {
              agentMsg = `\u23F0 Actualmente estamos fuera del horario de atenci\xF3n.

Nuestro horario: ${formatBusinessHours()}

\u2705 He registrado tu solicitud y un asesor te contactar\xE1 cuando inicie el horario de atenci\xF3n.

\u{1F4A1} Mientras tanto, puedes usar el men\xFA (escribe "menu") para acceder a opciones autom\xE1ticas disponibles 24/7.`;
            } else {
              agentMsg = 'Para hablar con un asesor, por favor comun\xEDcate con nuestro equipo de soporte o escribe "agente" para que te transferamos. Un asesor te contactar\xE1 a la brevedad.';
            }
            await message.reply(agentMsg);
            agentMode.set(chatId, true);
            chatTimeoutMs.set(chatId, _AGENT_TIMEOUT_MS);
            try {
              touchTimer(chatId);
            } catch (e) {
            }
            menuShown.delete(chatId);
            lastMenuItems.delete(chatId);
            logger.info({ chatId }, "Chat puesto en modo agente (opci\xF3n 5)");
            try {
              const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : "50672140974";
              const adminChatId = normalizeToChatId(adminPhone);
              const now = Date.now();
              const lastNotified = adminNotifiedAt.get(chatId) || 0;
              if (adminChatId && now - lastNotified > AGENT_NOTIFY_THROTTLE_MS) {
                const isOutsideHours2 = !_isWithinBusinessHours();
                const offHoursPrefix = isOutsideHours2 ? "\u26A0\uFE0F FUERA DE HORARIO - " : "";
                const offHoursSuffix = isOutsideHours2 ? `

\u23F0 Nota: Esta solicitud se realiz\xF3 FUERA del horario de atenci\xF3n (${formatBusinessHours()}). El cliente ser\xE1 atendido cuando inicien las operaciones.` : "";
                const notifyText = `${offHoursPrefix}Cliente ${fromUser} (${chatId}) solicita atenci\xF3n de un asesor (opci\xF3n 5). Mensaje: "${String(body).slice(0, 200)}"${offHoursSuffix}`;
                await whatsappClient.sendText(adminChatId, notifyText);
                adminNotifiedAt.set(chatId, now);
                logger.info({ adminChatId, chatId, outsideHours: isOutsideHours2 }, "Admin notificado sobre solicitud de agente (opci\xF3n 5)");
              } else {
                logger.debug({ chatId, lastNotified, throttleMs: AGENT_NOTIFY_THROTTLE_MS }, "Omitida notificaci\xF3n admin por throttle (opci\xF3n 5)");
              }
            } catch (e) {
              logger.warn({ e }, "No se pudo notificar al admin sobre la solicitud de agente (opci\xF3n 5)");
            }
            return;
          }
          const isOptionEight = typeof asNum === "number" && asNum === 8 || matched.keyword && String(matched.keyword).trim() === "8" || matched.key && String(matched.key).trim() === "8";
          if (isOptionEight) {
            try {
              await message.reply("\u{1F50D} Consultando tu informaci\xF3n, un momento por favor...");
              const client = await apiClient.findCustomerByPhone(fromUser);
              if (!client || !client.id) {
                await message.reply('\u274C No encontramos tu informaci\xF3n en nuestro sistema. Por favor contacta con un asesor escribiendo "agente".');
                return;
              }
              const contracts = await apiClient.listContracts({ client_id: client.id });
              if (!contracts || contracts.length === 0) {
                await message.reply('\u2139\uFE0F No tienes contratos activos en este momento.\n\nPara m\xE1s informaci\xF3n, escribe "agente" para hablar con un asesor.');
                return;
              }
              const lines = [];
              lines.push("\u{1F4CA} *ESTADO DE CUENTA*");
              lines.push("");
              lines.push(`\u{1F464} Cliente: ${client.name || "N/A"}`);
              lines.push(`\u{1F4F1} Tel\xE9fono: ${client.phone || fromUser}`);
              lines.push("");
              lines.push("\u{1F4CB} *Tus Contratos:*");
              lines.push("");
              for (const contract of contracts) {
                const status = contract.status === "active" ? "\u2705 Activo" : contract.status === "paused" ? "\u23F8\uFE0F Pausado" : contract.status === "cancelled" ? "\u274C Cancelado" : "\u26AA " + (contract.status || "Desconocido");
                lines.push(`\u{1F539} *Contrato #${contract.id}*`);
                lines.push(`   Servicio: ${contract.service_description || contract.contract_type?.name || "N/A"}`);
                lines.push(`   Estado: ${status}`);
                lines.push(`   Monto: ${contract.currency || "CRC"} ${Number(contract.amount || 0).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                if (contract.next_due_date) {
                  const dueDate = new Date(contract.next_due_date);
                  const today = /* @__PURE__ */ new Date();
                  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
                  if (diffDays < 0) {
                    lines.push(`   \u26A0\uFE0F Pr\xF3ximo pago: VENCIDO (${Math.abs(diffDays)} d\xEDas de retraso)`);
                  } else if (diffDays === 0) {
                    lines.push(`   \u26A0\uFE0F Pr\xF3ximo pago: HOY`);
                  } else if (diffDays <= 7) {
                    lines.push(`   \u23F0 Pr\xF3ximo pago: En ${diffDays} d\xEDa${diffDays !== 1 ? "s" : ""}`);
                  } else {
                    lines.push(`   \u{1F4C5} Pr\xF3ximo pago: ${dueDate.toLocaleDateString("es-CR")}`);
                  }
                }
                if (contract.notes && contract.notes.trim().length > 0) {
                  lines.push(`   \u{1F4DD} Nota: ${contract.notes.substring(0, 100)}${contract.notes.length > 100 ? "..." : ""}`);
                }
                lines.push("");
              }
              lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
              lines.push("");
              lines.push("\u{1F4A1} *Opciones:*");
              lines.push("\u2022 Escribe *6* para enviar comprobante de pago");
              lines.push("\u2022 Escribe *menu* para volver al men\xFA principal");
              lines.push("\u2022 Escribe *agente* para hablar con un asesor");
              await message.reply(lines.join("\n"));
              logger.info({ chatId, clientId: client.id, contractsCount: contracts.length }, "Estado de cuenta enviado");
              return;
            } catch (error) {
              logger.error({ err: error, chatId }, "Error obteniendo estado de cuenta");
              await message.reply('\u274C Ocurri\xF3 un error al obtener tu estado de cuenta. Por favor intenta m\xE1s tarde o escribe "agente" para hablar con un asesor.');
              return;
            }
          }
          await message.reply(replyText);
          const lower = String(replyText || "").toLowerCase();
          const isAwaitingReceipt = matched.keyword && String(matched.keyword).toLowerCase() === "6" || matched.key && String(matched.key).toLowerCase() === "6" || /comprobante|recibo|pago|comprobante de pago|enviar comprobante/i.test(lower);
          if (isAwaitingReceipt) {
            awaitingReceipt.set(chatId, true);
            chatTimeoutMs.set(chatId, BOT_TIMEOUT_MS);
            try {
              touchTimer(chatId);
            } catch (e) {
            }
            await message.reply('Por favor adjunta una foto o PDF del comprobante ahora. Si deseas cancelar escribe "salir".');
            return;
          }
          const isAgentTransfer = /transfer|asesor|agente|asesores|te vamos a transferir|transferir|transferencia/i.test(lower);
          if (isAgentTransfer) {
            agentMode.set(chatId, true);
            chatTimeoutMs.set(chatId, _AGENT_TIMEOUT_MS);
            try {
              touchTimer(chatId);
            } catch (e) {
              logger.debug({ e }, "touchTimer fallo al activar agentMode");
            }
            menuShown.delete(chatId);
            lastMenuItems.delete(chatId);
            logger.info({ chatId }, "Chat puesto en modo agente");
            try {
              const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : "50672140974";
              const adminChatId = normalizeToChatId(adminPhone);
              const now = Date.now();
              const lastNotified = adminNotifiedAt.get(chatId) || 0;
              if (adminChatId && now - lastNotified > AGENT_NOTIFY_THROTTLE_MS) {
                const isOutsideHours = !_isWithinBusinessHours();
                const offHoursPrefix = isOutsideHours ? "\u26A0\uFE0F FUERA DE HORARIO - " : "";
                const offHoursSuffix = isOutsideHours ? `

\u23F0 Nota: Esta solicitud se realiz\xF3 FUERA del horario de atenci\xF3n (${formatBusinessHours()}). El cliente ser\xE1 atendido cuando inicien las operaciones.` : "";
                const notifyText = `${offHoursPrefix}Cliente ${fromUser} (${chatId}) solicita atenci\xF3n de un asesor. Mensaje: "${String(body).slice(0, 200)}"${offHoursSuffix}`;
                await whatsappClient.sendText(adminChatId, notifyText);
                adminNotifiedAt.set(chatId, now);
                logger.info({ adminChatId, chatId, outsideHours: isOutsideHours }, "Admin notificado sobre solicitud de agente");
              } else {
                logger.debug({ chatId, lastNotified, throttleMs: AGENT_NOTIFY_THROTTLE_MS }, "Omitida notificaci\xF3n admin por throttle");
              }
            } catch (e) {
              logger.warn({ e }, "No se pudo notificar al admin sobre la solicitud de agente");
            }
            return;
          }
          menuShown.delete(chatId);
          lastMenuItems.delete(chatId);
          return;
        }
        await send('No reconozco esa opci\xF3n. Por favor elige un n\xFAmero del men\xFA o escribe "menu" para volver a ver las opciones o "salir" para finalizar.');
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        return;
      } catch (error) {
        logger.error({ err: error }, "Error manejando opci\xF3n de men\xFA");
        return;
      }
    }
    try {
      if (agentMode.get(chatId)) {
        logger.debug({ chatId }, "Ignorando mensaje: chat en modo agente, no mostrar men\xFA");
        return;
      }
      if (isAdminUser) {
        logger.debug({ chatId }, "Admin: no mostrar men\xFA normal autom\xE1ticamente");
        return;
      }
      if (!(lc === "menu" || lc === "inicio" || lc === "help")) {
        logger.debug({ chatId, lc }, "No mostrar men\xFA autom\xE1ticamente (usuario no lo pidi\xF3)");
        return;
      }
      const menuToUse = await resolveMenu();
      if (!menuToUse || !Array.isArray(menuToUse) || menuToUse.length === 0) {
        await send("Lo siento, el men\xFA no est\xE1 disponible en este momento. Intenta m\xE1s tarde.");
        return;
      }
      const lines = [];
      lines.push("Hola! Bienvenido a nuestro \u{1F916} CHATBOT");
      lines.push("Somos Tecno Servicios Artavia, por favor env\xEDa el n\xFAmero de una de las siguientes opciones:");
      lines.push("\u{1F447}\u{1F447}\u{1F447}");
      lines.push("");
      let idx = 1;
      for (const item of menuToUse) {
        const label = (item.reply_message ?? "").split("\n")[0] || "Opci\xF3n";
        lines.push(`${idx}- ${label}`);
        idx += 1;
      }
      lines.push("");
      lines.push("Escribe menu para volver al inicio o salir para finalizar la conversaci\xF3n.");
      await message.reply(lines.join("\n"));
      menuShown.set(chatId, true);
      lastMenuItems.set(chatId, menuToUse);
      return;
    } catch (error) {
      logger.error({
        errMsg: error?.message,
        errStack: error?.stack,
        error
      }, "Error mostrando el men\xFA");
      try {
        await message.reply("Lo siento, el men\xFA no est\xE1 disponible en este momento. Intenta m\xE1s tarde.");
      } catch (replyErr) {
        logger.error({
          errMsg: replyErr?.message,
          errStack: replyErr?.stack,
          replyErr
        }, "No se pudo enviar mensaje de men\xFA no disponible");
      }
      return;
    }
  });
  async function ensureReceiptsDir() {
    try {
      await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    } catch {
    }
    try {
      await fs.access(RECEIPTS_INDEX);
    } catch {
      await fs.writeFile(RECEIPTS_INDEX, JSON.stringify([]), { encoding: "utf8" });
    }
  }
  async function saveReceipt(chatId, filename, base64Data, mime, text) {
    await ensureReceiptsDir();
    const now = Date.now();
    const id = `${chatId.replace(/[^0-9]/g, "")}-${now}`;
    const filepath = path.join(RECEIPTS_DIR, filename);
    const buffer = Buffer.from(base64Data, "base64");
    await fs.writeFile(filepath, buffer);
    const raw = await fs.readFile(RECEIPTS_INDEX, { encoding: "utf8" });
    const arr = JSON.parse(raw || "[]");
    const entry = { id, chatId, filename, filepath, mime, text: text || "", ts: now, status: "pending" };
    arr.push(entry);
    await fs.writeFile(RECEIPTS_INDEX, JSON.stringify(arr, null, 2), { encoding: "utf8" });
    try {
      const phone = chatId.replace(/[^0-9]/g, "");
      await apiClient.storeReceiptFromBot({
        client_phone: phone,
        file_path: filepath,
        file_name: filename,
        mime_type: mime,
        received_at: new Date(now).toISOString(),
        metadata: {
          bot_receipt_id: id,
          chat_id: chatId,
          status: "pending",
          text: text || "",
          saved_from_bot: true
        }
      });
      logger.info({ id, chatId, filename }, "Comprobante guardado en DB via API");
    } catch (err) {
      logger.warn({ err, id, chatId }, "Error guardando comprobante en DB, solo guardado en JSON");
    }
    return { id, filepath, entry };
  }
  async function imageBufferToPdfBuffer(imageBuf, filename) {
    const mod = await import("pdfkit");
    const PDFDocument = mod && mod.default ? mod.default : mod;
    return await new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ autoFirstPage: false });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (err) => reject(err));
        const img = doc.openImage ? doc.openImage(imageBuf) : void 0;
        if (img) {
          doc.addPage({ size: [img.width, img.height] });
          doc.image(img, 0, 0);
        } else {
          doc.addPage("A4");
          doc.image(imageBuf, { fit: [500, 700], align: "center", valign: "center" });
        }
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }
  async function updateReceiptEntry(id, patch) {
    try {
      await ensureReceiptsDir();
      const raw = await fs.readFile(RECEIPTS_INDEX, { encoding: "utf8" });
      const arr = JSON.parse(raw || "[]");
      let changed = false;
      let entry = null;
      for (const it of arr) {
        if (it && it.id === id) {
          Object.assign(it, patch);
          changed = true;
          entry = it;
          break;
        }
      }
      if (changed) {
        await fs.writeFile(RECEIPTS_INDEX, JSON.stringify(arr, null, 2), { encoding: "utf8" });
        const backendId = entry?.backend_id || entry?.backend_payment_id;
        if (backendId) {
          try {
            logger.debug({ id, backendId, patch }, "Comprobante actualizado (backend sync pending)");
          } catch (err) {
            logger.debug({ err, id }, "Error sincronizando actualizaci\xF3n con DB");
          }
        }
      }
      return changed;
    } catch (e) {
      logger.warn({ e, id, patch }, "No se pudo actualizar \xEDndice de comprobantes");
      return false;
    }
  }
  await whatsappClient.initialize();
  try {
    const DATA_DIR = path.join(process.cwd(), "data");
    const QUEUE_FILE = path.join(DATA_DIR, "admin_queue.json");
    const RESULTS_FILE = path.join(DATA_DIR, "admin_results.json");
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch {
    }
    async function loadJson(file, fallback) {
      try {
        const raw = await fs.readFile(file, { encoding: "utf8" });
        return JSON.parse(raw || "null") ?? fallback;
      } catch {
        return fallback;
      }
    }
    async function saveJson(file, data) {
      await fs.writeFile(file, JSON.stringify(data, null, 2), { encoding: "utf8" });
    }
    let _adminQueueRunning = false;
    async function processAdminQueueOnce() {
      if (_adminQueueRunning) return;
      _adminQueueRunning = true;
      const q = await loadJson(QUEUE_FILE, { queue: [] });
      const results = await loadJson(RESULTS_FILE, {});
      const remaining = [];
      for (const item of q.queue || []) {
        if (!item || !item.id || !item.type) continue;
        if (results[item.id]) continue;
        if (item.type === "ping") {
          results[item.id] = { ok: true, time: (/* @__PURE__ */ new Date()).toISOString(), uptimeSec: Math.floor(process.uptime()) };
        } else if (item.type === "sendText") {
          try {
            const chatId = normalizeToChatId(item.phone);
            if (!chatId) throw new Error("phone inv\xE1lido");
            const text = String(item.text || "").trim() || "Mensaje de prueba";
            await whatsappClient.sendText(chatId, text);
            results[item.id] = { ok: true, sent: true };
          } catch (e) {
            results[item.id] = { ok: false, error: String(e && e.message ? e.message : e) };
          }
        } else if (item.type === "runScheduler") {
          try {
            await processor.runBatch();
            results[item.id] = { ok: true, ran: true, time: (/* @__PURE__ */ new Date()).toISOString() };
          } catch (e) {
            results[item.id] = { ok: false, error: String(e && e.message ? e.message : e) };
          }
        } else if (item.type === "state") {
          try {
            const state = await whatsappClient.getState();
            results[item.id] = { ok: true, ...state };
          } catch (e) {
            results[item.id] = { ok: false, error: String(e && e.message ? e.message : e) };
          }
        } else {
          results[item.id] = { ok: false, error: "tipo no soportado" };
        }
      }
      await saveJson(RESULTS_FILE, results);
      for (const it of q.queue || []) {
        if (!it || !it.id) continue;
        if (!results[it.id]) remaining.push(it);
      }
      q.queue = remaining;
      await saveJson(QUEUE_FILE, q);
      _adminQueueRunning = false;
    }
    setInterval(() => {
      processAdminQueueOnce().catch((e) => logger.warn({ e }, "Admin queue error"));
    }, 2e3);
  } catch (e) {
    logger.debug({ e }, "No se pudo inicializar admin queue processor");
  }
  function startWebhookServer() {
    const basePort = Number(process.env.BOT_WEBHOOK_PORT || 3001);
    const server = http.createServer(async (req, res) => {
      try {
        const remoteAddress = req.socket?.remoteAddress || "";
        const isLocal = remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
        const u = new URL(req.url || "/", `http://${req.headers.host}`);
        if (req.method === "GET" && u.pathname === "/debug/state") {
          if (!isLocal) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "forbidden" }));
            return;
          }
          const state = await whatsappClient.getState();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ...state }));
          return;
        }
        if (req.method === "GET" && u.pathname === "/debug/chats") {
          if (!isLocal) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "forbidden" }));
            return;
          }
          const summary = await whatsappClient.debugGetChatsSummary();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(summary));
          return;
        }
        if (req.method === "POST" && u.pathname === "/debug/ping_admin") {
          if (!isLocal) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "forbidden" }));
            return;
          }
          const adminPhone = ADMIN_PHONES[0] || null;
          const adminChatId = adminPhone ? normalizeToChatId(adminPhone) : null;
          if (!adminChatId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "admin chatId not configured" }));
            return;
          }
          const ts = (/* @__PURE__ */ new Date()).toISOString();
          await whatsappClient.sendText(adminChatId, `Ping del bot (${ts}). Si ves esto, el env\xEDo funciona.`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, to: adminChatId }));
          return;
        }
        if (req.method === "POST" && u.pathname === "/webhook/receipt_reconciled") {
          let raw = "";
          for await (const chunk of req) raw += chunk;
          const payload = raw ? JSON.parse(raw) : {};
          const backendId = payload.backend_id ?? payload.receipt_id ?? null;
          const localId = payload.receipt_local_id ?? payload.receipt_id_local ?? null;
          const pdfBase64 = payload.pdf_base64 ?? null;
          const pdfUrl = payload.pdf_url ?? null;
          const pdfPath = payload.pdf_path ?? null;
          const message = payload.message ?? null;
          if (!backendId && !localId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "backend_id or receipt_local_id required" }));
            return;
          }
          let indexRaw = "[]";
          try {
            indexRaw = await fs.readFile(RECEIPTS_INDEX, { encoding: "utf8" });
          } catch {
          }
          const arr = JSON.parse(indexRaw || "[]");
          const entry = arr.find(
            (r) => localId && r.id === localId || backendId && (r.backend_id === backendId || r.backend_payment_id === backendId)
          );
          if (!entry) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "receipt not found" }));
            return;
          }
          let base64data = null;
          let filename = `reconciled-${entry.id}.pdf`;
          if (pdfBase64) {
            base64data = pdfBase64.replace(/^data:application\/(pdf);base64,/, "");
          } else if (pdfPath) {
            try {
              const buff = await fs.readFile(pdfPath);
              base64data = buff.toString("base64");
              filename = path.basename(pdfPath);
            } catch (e) {
            }
          } else if (pdfUrl) {
            try {
              const resp = await axios2.get(pdfUrl, { responseType: "arraybuffer" });
              base64data = Buffer.from(resp.data).toString("base64");
              const urlObj = new URL(pdfUrl);
              filename = path.basename(urlObj.pathname) || filename;
            } catch (e) {
            }
          } else if (entry.reconciled_pdf) {
            try {
              const buff = await fs.readFile(entry.reconciled_pdf);
              base64data = buff.toString("base64");
              filename = path.basename(entry.reconciled_pdf);
            } catch (e) {
            }
          }
          if (!base64data) {
            await updateReceiptEntry(entry.id, { reconciled: true, reconciled_sent: false });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, note: "marked reconciled, no pdf to send" }));
            return;
          }
          try {
            const chatId = entry.chatId || entry.chat_id;
            if (!chatId) throw new Error("chatId missing");
            await whatsappClient.sendMedia(chatId, base64data, "application/pdf", filename);
            if (message && message.trim().length > 0) {
              await whatsappClient.sendText(chatId, message);
            }
            await updateReceiptEntry(entry.id, { reconciled: true, reconciled_sent: true, reconciled_sent_ts: Date.now() });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (e) {
            logger.warn({ e, entry }, "Error enviando PDF reconciliado al cliente");
            await updateReceiptEntry(entry.id, { reconciled: true, reconciled_sent: false });
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
            return;
          }
        }
        if (req.method === "POST" && u.pathname === "/webhook/send_pdf") {
          let raw = "";
          for await (const chunk of req) raw += chunk;
          const payload = raw ? JSON.parse(raw) : {};
          const phone = payload.phone ?? null;
          const message = payload.message ?? null;
          const pdfBase64 = payload.pdf_base64 ?? null;
          const pdfPath = payload.pdf_path ?? null;
          const paymentId = payload.payment_id ?? null;
          if (!phone) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "phone required" }));
            return;
          }
          const chatId = normalizeToChatId(phone);
          if (!chatId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "invalid phone format" }));
            return;
          }
          let base64data = null;
          let filename = `payment-${paymentId || Date.now()}.pdf`;
          if (pdfBase64) {
            base64data = pdfBase64.replace(/^data:application\/(pdf);base64,/, "");
          } else if (pdfPath) {
            try {
              const buff = await fs.readFile(pdfPath);
              base64data = buff.toString("base64");
              filename = path.basename(pdfPath);
            } catch (e) {
              logger.warn({ e, pdfPath }, "Error leyendo PDF desde path");
            }
          }
          if (!base64data) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "no pdf data provided" }));
            return;
          }
          try {
            await whatsappClient.sendMedia(chatId, base64data, "application/pdf", filename);
            if (message && message.trim().length > 0) {
              await whatsappClient.sendText(chatId, message);
            }
            logger.info({ chatId, paymentId, filename }, "PDF de pago manual enviado al cliente");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (e) {
            logger.warn({ e, chatId, paymentId }, "Error enviando PDF de pago manual al cliente");
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
            return;
          }
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "not found" }));
      } catch (err) {
        logger.warn({ err }, "Webhook handler error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
      }
    });
    const tryListen = (port) => {
      server.once("error", (err) => {
        if (err && (err.code === "EADDRINUSE" || err.code === "EACCES")) {
          logger.warn({ err, port }, "Webhook server no pudo abrir puerto; intentando alternativo");
          const next = port === basePort ? basePort + 1 : 0;
          tryListen(next);
          return;
        }
        logger.error({ err, port }, "Webhook server error");
      });
      server.listen(port, () => {
        const addr = server.address();
        logger.info({ port, addr }, "Webhook server listening");
      });
    };
    tryListen(basePort);
  }
  startWebhookServer();
  async function loadSettingsFromApi() {
    try {
      const s = await apiClient.getSettings();
      if (!s) return;
      if (s.payment_contact) {
        config.paymentContact = String(s.payment_contact);
      }
      if (s.bank_accounts) {
        config.bankAccounts = String(s.bank_accounts).split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
      }
      if (s.service_name) {
        config.serviceName = String(s.service_name);
      }
      if (s.beneficiary_name) {
        config.beneficiaryName = String(s.beneficiary_name);
      }
      if (s.business_hours) {
        try {
          const bh = typeof s.business_hours === "string" ? JSON.parse(s.business_hours) : s.business_hours;
          if (bh && typeof bh === "object") {
            const parsed2 = {};
            for (const k of Object.keys(bh)) {
              const nk = Number(k);
              if (!Number.isNaN(nk)) parsed2[nk] = bh[k];
            }
            BUSINESS_HOURS = Object.assign({}, BUSINESS_HOURS, parsed2);
          }
        } catch (e) {
          logger.debug({ e }, "invalid business_hours in settings");
        }
      }
      if (s.bot_timezone || s.timezone) {
        try {
          TIMEZONE = String(s.bot_timezone || s.timezone || TIMEZONE);
        } catch (e) {
          logger.debug({ e }, "invalid timezone in settings");
        }
      }
      logger.info({ loaded: Object.keys(s) }, "Settings cargadas desde API");
    } catch (e) {
      logger.warn({ e }, "No se pudieron cargar settings desde API");
    }
  }
  await loadSettingsFromApi();
  setInterval(loadSettingsFromApi, Number(process.env.BOT_SETTINGS_POLL_MS || 5 * 60 * 1e3));
  await runBatch();
  const interval = setInterval(runBatch, config.pollIntervalMs);
  logger.info({ intervalMs: config.pollIntervalMs }, "Servicio de recordatorios iniciado");
  const gracefulShutdown = async (signal) => {
    logger.info({ signal }, "Recibida se\xF1al de apagado, cerrando bot.");
    clearInterval(interval);
    try {
      await whatsappClient.shutdown();
    } catch (error) {
      logger.warn({ err: error }, "Error cerrando el cliente de WhatsApp");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
}
main().catch((error) => {
  logger.fatal({ err: error }, "El bot de WhatsApp se detuvo por un error inesperado");
  void (async () => {
    try {
      await whatsappClient.shutdown();
    } catch (err) {
      logger.warn({ err }, "Error cerrando WhatsAppClient despu\xE9s de un fallo fatal");
    }
    process.exit(1);
  })();
});
//# sourceMappingURL=index.js.map