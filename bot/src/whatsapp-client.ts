import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { config } from './config.js';
import { logger } from './logger.js';
import { ReminderMessagePayload, ReminderRecord } from './types.js';
import { formatWhatsAppId } from './utils/phone.js';
import { apiClient } from './api-client.js';

const { Client, LocalAuth, MessageMedia } = pkg;

export type IncomingMessageHandler = (message: pkg.Message) => Promise<void> | void;

export class WhatsAppClient {
  private readonly client: pkg.Client;
  private inboundHandler?: IncomingMessageHandler;

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
      puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      }
    });
  }

  async initialize(): Promise<void> {
    this.client.on('qr', (qr: string) => {
      logger.info('Escanee el código QR para iniciar sesión.');
      qrcode.generate(qr, { small: true });

  void QRCode.toDataURL(qr)
        .then(async (dataUrl) => {
          try {
            await apiClient.reportWhatsappQr(dataUrl);
          } catch (error) {
            logger.error({ error }, 'No se pudo enviar el QR al backend');
          }
        })
        .catch((error: unknown) => {
          logger.error({ error }, 'No se pudo generar el QR en formato de imagen');
        });
    });

    this.client.on('ready', () => {
      logger.info('Cliente de WhatsApp listo.');

      void apiClient.markWhatsappReady().catch((error: unknown) => {
        logger.error({ error }, 'No se pudo notificar al backend que WhatsApp está listo');
      });
    });

    this.client.on('auth_failure', (message: string) => {
      logger.error({ message }, 'Fallo de autenticación en WhatsApp');

      void apiClient.markWhatsappDisconnected(message).catch((error: unknown) => {
        logger.error({ error }, 'No se pudo notificar la desconexión por fallo de autenticación');
      });
    });

    this.client.on('disconnected', (reason: string) => {
      logger.warn({ reason }, 'Cliente de WhatsApp desconectado, intentando reiniciar');

      void apiClient.markWhatsappDisconnected(reason).catch((error: unknown) => {
        logger.error({ error }, 'No se pudo notificar la desconexión de WhatsApp');
      });

      this.client.initialize().catch((error: unknown) => {
        logger.error({ error }, 'No se pudo reiniciar el cliente de WhatsApp');
      });
    });

    this.client.on('message', async (message: pkg.Message) => {
      try {
        if (this.inboundHandler) {
          await this.inboundHandler(message);
        }
      } catch (error) {
        logger.error({ error }, 'Error manejando mensaje entrante');
      }
    });

    try {
      await this.client.initialize();
    } catch (error) {
      // log the full error stack to help debugging puppeteer/protocol issues
      logger.fatal({ error }, 'Error inicializando cliente de WhatsApp');
      throw error;
    }
  }

  registerInboundHandler(handler: IncomingMessageHandler): void {
    this.inboundHandler = handler;
  }

  async sendReminder(reminder: ReminderRecord, payload: ReminderMessagePayload): Promise<void> {
    if (!reminder.client?.phone) {
      throw new Error(`El cliente ${reminder.client?.name ?? reminder.client_id} no tiene teléfono configurado.`);
    }

    const chatId = formatWhatsAppId(reminder.client.phone);
    await this.client.sendMessage(chatId, payload.content);

    if (payload.attachments?.length) {
      for (const attachment of payload.attachments) {
        const base64Data = typeof attachment.data === 'string'
          ? attachment.data.replace(/^data:[^,]+,/, '')
          : attachment.data.toString('base64');

        const media = new MessageMedia(attachment.mimeType, base64Data, attachment.filename);
        await this.client.sendMessage(chatId, media);
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.client.destroy();
  }
}
