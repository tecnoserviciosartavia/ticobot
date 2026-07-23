import axios from 'axios';
import { logger } from './logger.js';
import { chatIdToPhoneDigits, normalizeWhatsAppUserChatId } from './utils/phone.js';

type SendWhatsAppMessage = (chatId: string, text: string) => Promise<void>;

type TelegramBridgeOptions = {
  token?: string;
  adminChatId?: string;
  allowedChatIds?: string[];
  sendWhatsAppMessage: SendWhatsAppMessage;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: {
      id?: number | string;
      type?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

export class TelegramBridge {
  private readonly token: string;
  private readonly adminChatId: string;
  private readonly allowedChatIds: Set<string>;
  private readonly sendWhatsAppMessage: SendWhatsAppMessage;
  private running = false;
  private pollingPromise: Promise<void> | null = null;
  private updateOffset = 0;

  constructor(options: TelegramBridgeOptions) {
    this.token = String(options.token ?? '').trim();
    this.adminChatId = String(options.adminChatId ?? '').trim();
    this.allowedChatIds = new Set(
      (options.allowedChatIds ?? [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    );
    this.sendWhatsAppMessage = options.sendWhatsAppMessage;
  }

  isConfigured(): boolean {
    return this.token !== '' && this.adminChatId !== '';
  }

  start(): void {
    if (!this.isConfigured()) {
      logger.warn(
        {
          hasToken: this.token !== '',
          hasAdminChatId: this.adminChatId !== '',
        },
        'TelegramBridge no configurado; omitiendo polling',
      );
      return;
    }

    if (this.running) return;
    this.running = true;
    this.pollingPromise = this.pollLoop().catch((error) => {
      logger.error({ err: error }, 'TelegramBridge polling falló');
    });
  }

  stop(): void {
    this.running = false;
  }

  async notifyAgentRequest(params: {
    phone: string;
    chatId: string;
    fromUser: string;
    body: string;
    outsideHours: boolean;
  }): Promise<void> {
    const prefix = params.outsideHours ? '⚠️ FUERA DE HORARIO\n\n' : '';
    const text =
      `${prefix}Nuevo cliente pidió agente\n` +
      `Cliente: ${params.fromUser}\n` +
      `Teléfono: ${params.phone}\n` +
      `Chat: ${params.chatId}\n\n` +
      `Último mensaje:\n${params.body.slice(0, 500)}\n\n` +
      `Comandos:\n` +
      `/reply ${params.phone} <mensaje>\n` +
      `/menu ${params.phone}\n` +
      `/salir ${params.phone}`;

    await this.sendToAdmin(text);
  }

  async notifyInboundMessage(params: {
    phone: string;
    chatId: string;
    fromUser: string;
    body: string;
    agentMode: boolean;
  }): Promise<void> {
    const text =
      `${params.agentMode ? '🟡' : 'ℹ️'} Mensaje entrante\n` +
      `Cliente: ${params.fromUser}\n` +
      `Teléfono: ${params.phone}\n` +
      `Chat: ${params.chatId}\n\n` +
      `${params.body.slice(0, 1000)}\n\n` +
      `Respuesta rápida:\n` +
      `/reply ${params.phone} <mensaje>`;

    await this.sendToAdmin(text);
  }

  async sendToAdmin(text: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          chat_id: this.adminChatId,
          text,
          disable_web_page_preview: true,
        },
        { timeout: 20000 },
      );

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo enviar mensaje a Telegram');
      return false;
    }
  }

  private async pollLoop(): Promise<void> {
    logger.info({ adminChatId: this.adminChatId }, 'TelegramBridge iniciado');

    while (this.running) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          if (typeof update.update_id === 'number') {
            this.updateOffset = Math.max(this.updateOffset, update.update_id + 1);
          }

          const message = update.message;
          if (!message || typeof message.text !== 'string') continue;
          const chatId = String(message.chat?.id ?? '').trim();
          if (!chatId) continue;
          if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) continue;

          const text = message.text.trim();
          if (!text) continue;
          await this.handleCommand(text);
        }
      } catch (error) {
        logger.warn({ err: error }, 'TelegramBridge polling error');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const response = await axios.get(`https://api.telegram.org/bot${this.token}/getUpdates`, {
      timeout: 35000,
      params: {
        timeout: 30,
        offset: this.updateOffset || undefined,
        allowed_updates: ['message'],
      },
    });

    const data = response.data;
    if (!data || !data.ok || !Array.isArray(data.result)) return [];
    return data.result as TelegramUpdate[];
  }

  private async handleCommand(text: string): Promise<void> {
    const replyMatch = text.match(/^\/?(reply|send)\s+([0-9+\s-]{8,20})\s+([\s\S]+)$/i);
    if (replyMatch) {
      const phone = replyMatch[2];
      const message = replyMatch[3].trim();
      const chatId = normalizeWhatsAppUserChatId(phone);
      if (!chatId) {
        await this.sendToAdmin('❌ Número inválido. Usa: /reply 50672140974 mensaje');
        return;
      }

      try {
        await this.sendWhatsAppMessage(chatId, message);
        await this.sendToAdmin(`✅ Enviado a ${chatIdToPhoneDigits(chatId)}\n\n${message.slice(0, 1000)}`);
      } catch (error) {
        logger.warn({ err: error, chatId }, 'TelegramBridge no pudo reenviar a WhatsApp');
        await this.sendToAdmin(`❌ Error enviando a ${chatIdToPhoneDigits(chatId)}\n\n${String(error instanceof Error ? error.message : error)}`);
      }
      return;
    }

    const menuMatch = text.match(/^\/?(menu|inicio|help)\s+([0-9+\s-]{8,20})$/i);
    if (menuMatch) {
      const phone = menuMatch[2];
      const chatId = normalizeWhatsAppUserChatId(phone);
      if (!chatId) {
        await this.sendToAdmin('❌ Número inválido. Usa: /menu 50672140974');
        return;
      }

      await this.sendWhatsAppMessage(chatId, 'menu');
      await this.sendToAdmin(`✅ Se envió "menu" a ${chatIdToPhoneDigits(chatId)}`);
      return;
    }

    const exitMatch = text.match(/^\/?(salir|exit)\s+([0-9+\s-]{8,20})$/i);
    if (exitMatch) {
      const phone = exitMatch[2];
      const chatId = normalizeWhatsAppUserChatId(phone);
      if (!chatId) {
        await this.sendToAdmin('❌ Número inválido. Usa: /salir 50672140974');
        return;
      }

      await this.sendWhatsAppMessage(chatId, 'salir');
      await this.sendToAdmin(`✅ Se envió "salir" a ${chatIdToPhoneDigits(chatId)}`);
      return;
    }

    if (/^\/?(help|ayuda)$/i.test(text)) {
      await this.sendToAdmin(
        'Comandos Telegram:\n' +
          '/reply 50672140974 mensaje\n' +
          '/menu 50672140974\n' +
          '/salir 50672140974',
      );
    }
  }
}
