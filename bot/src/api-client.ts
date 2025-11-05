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
    await this.http.patch(`reminders/${reminder.id}`, {
      status: 'queued',
      attempts: reminder.attempts + 1,
      queued_at: new Date().toISOString()
    });
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
    const res = await this.http.get('clients', { params: { phone } });
    return res.data && res.data.length ? res.data[0] : null;
  }

  async upsertCustomer(payload: { phone: string; name?: string; active?: number }) {
    const res = await this.http.post('clients', payload);
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
}

export const apiClient = new ApiClient();
