import axios, { AxiosInstance } from 'axios';
import { config } from './config.js';
import { AcknowledgePayload, ReminderRecord } from './types.js';

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
    await this.http.patch(`reminders/${reminderId}`, {
      status: 'sent',
      sent_at: new Date().toISOString()
    });
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
}

export const apiClient = new ApiClient();
