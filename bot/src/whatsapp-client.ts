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
      sendSeenOnReply: false,
      evalOnNewDoc: () => {
        try {
          if (!(window as any).WWebJS) (window as any).WWebJS = {};
          (window as any).WWebJS.sendSeen = async () => { return; };
          (window as any).WWebJS.markedUnread = false;
        } catch (e) {
          // ignore
        }
      },
      puppeteer: {
        headless: true,
        // Allow overriding Chromium/Chrome executable via env var BOT_CHROMIUM_PATH
        // If not provided, puppeteer will use the bundled or system browser.
        executablePath: process.env.BOT_CHROMIUM_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      }
    });
    // Algunas versiones de WhatsApp Web rompen sendSeen; lo anulamos para evitar TypeError: markedUnread
    (this.client as any).sendSeen = async () => { return; };
    
    // Wrap original sendMessage to catch page evaluation errors (markedUnread) that
    // ocurren dentro de la página y evitar que el bot falle completamente.
    const originalSendMessage = (this.client as any).sendMessage?.bind(this.client);
    if (originalSendMessage) {
      (this.client as any).sendMessage = async (...args: any[]) => {
        try {
          return await originalSendMessage(...args);
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('markedUnread') || msg.includes('marked unread')) {
            logger.warn({ err }, 'Interceptado markedUnread error en sendMessage — ignorando para continuar');
            return null;
          }
          throw err;
        }
      };
    }

    // Intentamos inyectar un script lo antes posible en nuevas páginas para evitar
    // que WhatsApp Web ejecute código que provoque `markedUnread`/`sendSeen` errors.
    // Esto escucha nuevos targets del browser y aplica `evaluateOnNewDocument`.
    (async () => {
      try {
        const attach = async () => {
          const browser: any = (this.client as any).browser;
          if (!browser) return false;

          // Interceptar creación de nuevas páginas
          try {
            browser.on && browser.on('targetcreated', async (target: any) => {
              try {
                if (typeof target.type === 'function' && target.type() === 'page') {
                  const page = await target.page();
                  if (page && typeof page.evaluateOnNewDocument === 'function') {
                    await page.evaluateOnNewDocument(() => {
                      try {
                        if (!(window as any).WWebJS) (window as any).WWebJS = {};
                        (window as any).WWebJS.sendSeen = async () => { return; };
                        (window as any).WWebJS.markedUnread = false;
                      } catch (e) {
                        // ignore
                      }
                    });
                  } else if (page && typeof page.addInitScript === 'function') {
                    // fallback para algunas versiones de puppeteer
                    await page.addInitScript(() => {
                      try {
                        if (!(window as any).WWebJS) (window as any).WWebJS = {};
                        (window as any).WWebJS.sendSeen = async () => { return; };
                        (window as any).WWebJS.markedUnread = false;
                      } catch (e) {}
                    });
                  }
                }
              } catch (e) {
                // ignore per-target failures
              }
            });
          } catch (e) {
            // ignore
          }

          // Aplicar a páginas ya abiertas
          try {
            const pages = await browser.pages();
            for (const p of pages) {
              try {
                if (p && typeof p.evaluateOnNewDocument === 'function') {
                  await p.evaluateOnNewDocument(() => {
                    try {
                      if (!(window as any).WWebJS) (window as any).WWebJS = {};
                      (window as any).WWebJS.sendSeen = async () => { return; };
                      (window as any).WWebJS.markedUnread = false;
                    } catch (e) {}
                  });
                } else if (p && typeof p.addInitScript === 'function') {
                  await p.addInitScript(() => {
                    try {
                      if (!(window as any).WWebJS) (window as any).WWebJS = {};
                      (window as any).WWebJS.sendSeen = async () => { return; };
                      (window as any).WWebJS.markedUnread = false;
                    } catch (e) {}
                  });
                }
              } catch (e) {
                // ignore per-page failures
              }
            }
          } catch (e) {
            // ignore
          }

          return true;
        };

        // Small polling to wait until puppeteer browser becomes available
        for (let i = 0; i < 20; i++) {
          const ok = await attach();
          if (ok) break;
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (e) {
        logger.debug({ e }, 'No se pudo instalar inyección evaluateOnNewDocument');
      }
    })();
  }

  async initialize(): Promise<void> {
    this.client.on('qr', (qr: string) => {
      logger.info('Escanee el código QR para iniciar sesión.');
      qrcode.generate(qr, { small: true });

  void QRCode.toDataURL(qr)
        .then(async (dataUrl: string) => {
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

      // Evitar sendSeen que en algunas versiones lanza TypeError: markedUnread
      void (async () => {
        try {
          const page: any = (this.client as any).pupPage;
          if (page && typeof page.evaluate === 'function') {
            await page.evaluate(() => {
              try {
                if ((window as any).WWebJS && typeof (window as any).WWebJS.sendSeen === 'function') {
                  (window as any).WWebJS.sendSeen = async () => { return; };
                }
              } catch (e) {
                // ignore
              }
            });
          }
        } catch (e) {
          logger.debug({ e }, 'No se pudo desactivar sendSeen en la página');
        }
      })();

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

  // Enviar texto arbitrario a un chat (útil para admin queue u otros usos)
  async sendText(chatId: string, text: string): Promise<void> {
    await this.client.sendMessage(chatId, text);
  }

  // Enviar media (base64) a un chat
  async sendMedia(chatId: string, base64Data: string, mimeType: string, filename?: string): Promise<void> {
    const media = new MessageMedia(mimeType, base64Data, filename);
    await this.client.sendMessage(chatId, media);
  }

  async getState(): Promise<{ state: string | null; info: any }> {
    try {
      const state = await this.client.getState();
      const info = (this.client as any).info ?? null;
      return { state: state ?? null, info };
    } catch (error) {
      logger.error({ error }, 'No se pudo obtener el estado del cliente de WhatsApp');
      return { state: null, info: null };
    }
  }

  async shutdown(): Promise<void> {
    await this.client.destroy();
  }
}
