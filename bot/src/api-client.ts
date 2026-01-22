import axios, { AxiosInstance } from 'axios';
import pRetry from 'p-retry';
import { config } from './config.js';
import { AcknowledgePayload, ReminderRecord } from './types.js';
import { logger } from './logger.js';

class ApiClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: `${config.apiBaseUrl.replace(/\/$/, '')}/`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiToken}`
      },
      timeout: 15000
    });
  }

  async fetchPendingReminders(): Promise<ReminderRecord[]> {
    const response = await this.http.get<ReminderRecord[]>('reminders/pending', {
      params: {
        look_ahead: config.lookAheadMinutes,
        limit: config.maxBatch
      }
    });

    return response.data;
  }

  async acknowledgeReminder(reminderId: number, payload: AcknowledgePayload): Promise<void> {
    await this.http.post(`reminders/${reminderId}/acknowledge`, payload);
  }

  async markQueued(reminder: ReminderRecord): Promise<void> {
    // Capear attempts para evitar valores inesperadamente grandes que puedan
    // provocar errores en el backend si la columna es pequeña.
    const nextAttempts = Math.min((reminder.attempts || 0) + 1, 100);
    await this.http.patch(`reminders/${reminder.id}`, {
      status: 'queued',
      attempts: nextAttempts,
      queued_at: new Date().toISOString()
    });
  }

  /**
   * Revert a reminder previously claimed (queued) back to pending so it can be retried later.
   */
  async revertToPending(reminderId: number, attempts?: number): Promise<void> {
    const payload: any = {
      status: 'pending',
      queued_at: null,
    };
    if (typeof attempts === 'number') payload.attempts = attempts;
    await this.http.patch(`reminders/${reminderId}`, payload);
  }

  async markSent(reminderId: number): Promise<void> {
    await pRetry(async () => {
      try {
        await this.http.patch(`reminders/${reminderId}`, {
          status: 'sent',
          sent_at: new Date().toISOString()
        });
      } catch (err: any) {
        // Log helpful details for debugging and rethrow to trigger retry
        logger.warn({ reminderId, err: err?.response?.data ?? err?.message ?? err }, 'Error marcando recordatorio como enviado, reintentando');
        throw err;
      }
    }, { retries: 2 });
  }

  async reportWhatsappQr(qr: string): Promise<void> {
    await this.http.post('whatsapp/qr', { qr });
  }

  async markWhatsappReady(): Promise<void> {
    await this.http.post('whatsapp/ready');
  }

  async markWhatsappDisconnected(reason?: string): Promise<void> {
    const payload = reason && reason.trim().length > 0 ? { reason } : {};
    await this.http.post('whatsapp/disconnected', payload);
  }

  async fetchBotMenu(): Promise<Array<{ keyword: string; reply_message: string; options?: any }>> {
    const response = await this.http.get('whatsapp/menu');
    return response.data;
  }

  // --- Admin / management helper endpoints (asunciones sobre la API) ---
  async findCustomerByPhone(phone: string) {
    const onlyDigits = (s: string) => String(s || '').replace(/[^0-9]/g, '');
    const pd = onlyDigits(phone);
    const last8 = pd.slice(-8);

    // Query by last8 first to hit phones saved con o sin 506 o símbolos
    const candidates: any[] = [];
    const pushUnique = (arr: any[], item: any) => {
      if (!item) return; const id = item.id ?? item.ID ?? JSON.stringify(item);
      if (!arr.find(x => (x.id ?? x.ID) === id)) arr.push(item);
    };

    const tryFetch = async (term: string) => {
      const res = await this.http.get('clients', { params: { search: term, per_page: 50 } });
      const list = Array.isArray(res.data) ? res.data : (res.data && Array.isArray(res.data.data) ? res.data.data : []);
      for (const it of list) pushUnique(candidates, it);
    };

    try { if (last8 && last8.length >= 4) await tryFetch(last8); } catch {}
    try { await tryFetch(pd); } catch {}
    try { await tryFetch(phone); } catch {}

    // Prefer exact digits-only match, then endsWith last8, otherwise first
    const exact = candidates.find(c => onlyDigits(c.phone || '') === pd);
    if (exact) return exact;
    const ends = candidates.find(c => onlyDigits(c.phone || '').endsWith(last8));
    if (ends) return ends;
    return candidates.length ? candidates[0] : null;
  }

  async upsertCustomer(payload: { phone: string; name?: string; active?: number }) {
    // The backend requires 'name' and 'status' for creating clients. Ensure defaults.
    const body: any = Object.assign({}, payload);
    if (!body.name) body.name = String(body.phone || '');
    if (!body.status) body.status = 'active';
    const res = await this.http.post('clients', body);
    return res.data;
  }

  async createSubscription(payload: any) {
    const res = await this.http.post('subscriptions', payload);
    return res.data;
  }

  async listSubscriptions(phone?: string) {
    const res = await this.http.get('subscriptions', { params: phone ? { phone } : {} });
    return res.data;
  }

  async listContracts(params?: any) {
    const res = await this.http.get('contracts', { params: params || {} });
    const body: any = res.data;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.data)) return body.data;
    return [] as any[];
  }

  async getContract(id: number | string) {
    const res = await this.http.get(`contracts/${id}`);
    return res.data;
  }

  async listPaymentsUpcoming(phone?: string, days?: number) {
    const res = await this.http.get('payments/upcoming', { params: { phone, days } });
    return res.data;
  }

  async listTransactions(phone?: string, limit = 20) {
    const res = await this.http.get('transactions', { params: { phone, limit } });
    return res.data;
  }

  async deleteTransaction(id: number) {
    const res = await this.http.delete(`transactions/${id}`);
    return res.data;
  }

  async listReceiptsByDate(date: string) {
    const res = await this.http.get('receipts', { params: { date } });
    return res.data;
  }

  async createReceiptForClient(payload: any) {
    // Try a few candidate endpoints to be tolerant to backend route differences.
    const candidates = ['receipts/for-client', 'receipts', 'payments/receipts', 'receipts/create'];
    let lastErr: any = null;
    for (const ep of candidates) {
      try {
        const res = await this.http.post(ep, payload);
        if (ep !== candidates[0]) {
          logger.info({ ep, payload }, 'createReceiptForClient used fallback endpoint');
        }
        return res.data;
      } catch (err: any) {
        lastErr = err;
        // If 404, try next candidate; otherwise rethrow to let caller handle unexpected errors
        const status = err && err.response && err.response.status;
        if (status === 404) {
          logger.debug({ ep, status, body: err.response && err.response.data }, 'Endpoint no disponible, probando siguiente fallback');
          continue;
        }
        // non-404: rethrow
        throw err;
      }
    }
    // If we get here, all candidates returned 404 or failed; throw helpful error including last response
    const info: any = { message: 'No disponible endpoint para createReceiptForClient' };
    if (lastErr && lastErr.response) {
      info.status = lastErr.response.status;
      info.data = lastErr.response.data;
    }
    logger.warn(info, 'createReceiptForClient fallo en todos los endpoints candidatos');
    const e = new Error('createReceiptForClient failed: ' + JSON.stringify(info));
    throw e;
  }

  async createPayment(payload: any) {
    const res = await this.http.post('payments', payload);
    return res.data;
  }

  async getSettings() {
    const res = await this.http.get('settings');
    return res.data || {};
  }

  async updatePayment(paymentId: number | string, payload: any) {
    const res = await this.http.patch(`payments/${paymentId}`, payload);
    return res.data;
  }

  async sendReceipt(receiptId: number) {
    const res = await this.http.post(`receipts/${receiptId}/send`);
    return res.data;
  }

  async deleteCustomer(id: number) {
    const res = await this.http.delete(`clients/${id}`);
    return res.data;
  }

  async deleteSubscriptionsByPhone(phone: string) {
    const res = await this.http.delete('subscriptions', { params: { phone } });
    return res.data;
  }

  async deleteContractsByPhone(phone: string) {
    // Delete all contracts for a given phone
    const client = await this.findCustomerByPhone(phone);
    if (!client) throw new Error('Cliente no encontrado');
    const contracts = await this.listContracts({ client_id: client.id });
    for (const c of contracts) {
      await this.http.delete(`contracts/${c.id}`);
    }
    return { deleted: contracts.length };
  }

  async listPayments(params?: any) {
    const res = await this.http.get('payments', { params: params || {} });
    const body: any = res.data;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.data)) return body.data;
    return [] as any[];
  }

  async getPayment(id: number | string) {
    const res = await this.http.get(`payments/${id}`);
    return res.data;
  }

  async createConciliation(payload: any) {
    const res = await this.http.post('conciliations', payload);
    return res.data;
  }

  async storeReceiptFromBot(payload: {
    payment_id?: number;
    client_phone?: string;
    file_base64?: string;
    file_path?: string;
    file_name: string;
    mime_type: string;
    received_at?: string;
    metadata?: Record<string, any>;
  }) {
    const res = await this.http.post('payments/receipts/bot', payload);
    return res.data;
  }

  async fetchSentRemindersWithoutPayment(startDate: string, endDate: string): Promise<ReminderRecord[]> {
    const response = await this.http.get<ReminderRecord[]>('reminders/sent-without-payment', {
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
  async fetchFromBackend(path: string): Promise<any> {
    try {
      const response = await this.http.get(path);
      return response.data;
    } catch (error: any) {
      logger.debug({ error: error?.message, path }, 'fetchFromBackend error');
      throw error;
    }
  }

  /**
   * Get payment status for a phone number.
   */
  async getPaymentStatus(phone: string): Promise<any> {
    return this.fetchFromBackend(`/api/payment-status/${phone}`);
  }

  /**
   * Check if a contact is paused.
   */
  async checkPausedContact(whatsappNumber: string): Promise<boolean> {
    try {
      const res = await this.fetchFromBackend(`/api/paused-contacts/check/${whatsappNumber}`);
      return res?.is_paused === true;
    } catch (e) {
      return false;
    }
  }
}

export const apiClient = new ApiClient();

