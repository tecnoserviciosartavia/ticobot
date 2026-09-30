import { apiClient } from './api-client.js';
import { logger } from './logger.js';
import { ReminderMessagePayload, ReminderRecord } from './types.js';
import { chatIdToPhoneDigits } from './utils/phone.js';

type MessageHandler = (message: any) => Promise<void> | void;

export class MetaWhatsAppClient {
  private inboundHandler?: MessageHandler;
  private recentBotSendByPhone = new Map<string, number>();

  async initialize(): Promise<void> { logger.info('Transporte WhatsApp Meta Cloud API listo (sin sesión Web ni QR)'); }
  registerInboundHandler(handler: MessageHandler): void { this.inboundHandler = handler; }
  registerOutboundFromMeHandler(_handler: MessageHandler): void {}

  private recipientId(value: string): string {
    const raw = String(value ?? '').trim();
    if (/[A-Za-z]/.test(raw) && !raw.endsWith('@c.us')) return raw;
    return chatIdToPhoneDigits(raw);
  }

  async injectInboundMessage(payload: { id?: string; from: string; body?: string; timestamp?: number; type?: string; hasMedia?: boolean; meta?: any }): Promise<void> {
    if (!this.inboundHandler) return;
    const phone = chatIdToPhoneDigits(payload.from);
    if (!phone) return;
    const media = payload.meta?.media ?? null;
    await this.inboundHandler({
      id: { _serialized: payload.id || `meta-${Date.now()}` }, from: `${phone}@c.us`, to: '', body: String(payload.body ?? ''),
      timestamp: payload.timestamp || Math.floor(Date.now() / 1000), fromMe: false, type: payload.type || 'chat',
      hasMedia: Boolean(payload.hasMedia || media), metadata: payload.meta ?? null,
      reply: async (text: string) => this.sendText(phone, text),
      downloadMedia: async () => media ? ({ data: media.data, mimetype: media.mimetype, filename: media.filename }) : null,
    });
  }

  async sendText(chatId: string, text: string): Promise<void> {
    const phone = this.recipientId(chatId);
    if (!phone || !(await apiClient.sendWhatsAppText(phone, text))) throw new Error('Meta Cloud API no pudo enviar el mensaje');
    this.recentBotSendByPhone.set(phone, Date.now());
  }

  async sendMedia(chatId: string, data: string, mimetype: string, filename?: string, caption?: string): Promise<void> {
    const phone = this.recipientId(chatId);
    if (!phone || !(await apiClient.sendWhatsAppMedia(phone, data, mimetype, filename, caption))) throw new Error('Meta Cloud API no pudo enviar el archivo');
    this.recentBotSendByPhone.set(phone, Date.now());
  }

  async sendMarketingImage(chatId: string, data: string, mimetype: string, caption?: string, filename?: string): Promise<void> { await this.sendMedia(chatId, data, mimetype, filename, caption); }

  async sendReminder(reminder: ReminderRecord, payload: ReminderMessagePayload): Promise<void> {
    const phone = reminder.client?.phone;
    if (!phone) throw new Error(`El cliente ${reminder.client?.name ?? reminder.client_id} no tiene teléfono configurado.`);

    const rawDate = String(reminder.payload?.due_date ?? reminder.scheduled_for ?? '');
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? new Date(`${rawDate}T12:00:00`)
      : new Date(rawDate);
    const dueDate = Number.isNaN(parsedDate.getTime())
      ? rawDate
      : parsedDate.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
    const rawAmount = reminder.contract?.amount ?? reminder.payload?.amount ?? '0';
    const amountNumber = Number(String(rawAmount).replace(/[^0-9.-]/g, '')) || 0;
    const currency = String(reminder.contract?.currency ?? 'CRC').toUpperCase();
    const formattedAmount = currency === 'USD'
      ? `$${amountNumber.toLocaleString('es-CR')}`
      : `₡${amountNumber.toLocaleString('es-CR')}`;
    const senderCompany = String(reminder.payload?.sender_company ?? 'ticocast').trim().toLowerCase();
    const isTicoCast = senderCompany === '' || senderCompany === 'ticocast';
    const templateName = isTicoCast ? 'recordatorio_vencimiento_v2' : 'recordatorio_vencimiento_multiempresa';
    const parameters = isTicoCast
      ? [reminder.client?.name ?? '', dueDate, formattedAmount]
      : [
          reminder.client?.name ?? '',
          String(reminder.payload?.company_name ?? 'Empresa'),
          dueDate,
          formattedAmount,
          String(reminder.payload?.payment_contact ?? ''),
          String(reminder.payload?.bank_accounts ?? '').replace(/\s*\r?\n\s*/g, ' | ').replace(/\s{2,}/g, ' ').trim(),
          String(reminder.payload?.beneficiary_name ?? ''),
        ];
    const sent = await apiClient.sendWhatsAppTemplate(phone, templateName, parameters);
    if (!sent) throw new Error('Meta Cloud API no pudo enviar la plantilla de recordatorio');
    this.recentBotSendByPhone.set(chatIdToPhoneDigits(phone), Date.now());
    for (const attachment of payload.attachments ?? []) {
      await this.sendMedia(phone, typeof attachment.data === 'string' ? attachment.data : attachment.data.toString('base64'), attachment.mimeType, attachment.filename);
    }
  }

  async resolvePhoneDigitsFromChatId(chatId: string, _message?: any): Promise<string | null> { return chatIdToPhoneDigits(chatId) || null; }
  isRecentBotSendToPhone(phone: string): boolean { return Date.now() - (this.recentBotSendByPhone.get(chatIdToPhoneDigits(phone)) || 0) < 30_000; }
  async shutdown(): Promise<void> { logger.info('Transporte Meta Cloud API detenido'); }
}
