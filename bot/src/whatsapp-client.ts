import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { config } from './config.js';
import { logger } from './logger.js';
import { ReminderMessagePayload, ReminderRecord } from './types.js';
import { formatWhatsAppId } from './utils/phone.js';
import { apiClient } from './api-client.js';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const { Client, LocalAuth, MessageMedia } = pkg;

const exec = promisify(_exec);

function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

export type IncomingMessageHandler = (message: pkg.Message) => Promise<void> | void;

export class WhatsAppClient {
  private readonly client: pkg.Client;
  private inboundHandler?: IncomingMessageHandler;
  private listenersAttached = false;
  private restartInProgress = false;
  private isReady = false;
  private authenticatedAt: number | null = null;
  private authStuckTimer: NodeJS.Timeout | null = null;
  private authStuckRestarted = false;
  private lastRestartAt: number | null = null;
  private restartCountWindow: Array<number> = [];
  private readonly debugMessages: boolean;
  private readonly enableMessagePolling: boolean;
  private readonly markMessagesRead: boolean;
  private readonly enableAutoRestartOnStuck: boolean;
  private readonly stuckCheckIntervalMs: number;
  private messagePollTimer: NodeJS.Timeout | null = null;
  private messagePollNextAt: number | null = null;
  private processedMessageIds = new Map<string, number>();
  private messagePollConsecutiveFailures = 0;
  private messagePollingDisabledLogged = false;
  private wwebjsStubsApplied = false;

  private async applyWwebjsSafetyStubs(): Promise<void> {
    try {
      const page: any = (this.client as any).pupPage;
      if (page && typeof page.evaluate === 'function') {
        await page.evaluate(() => {
          try {
            if (!(window as any).WWebJS) (window as any).WWebJS = {};
            // algunos builds referencian markedUnread; asegurar que exista
            (window as any).WWebJS.markedUnread = false;

            // Evitar que whatsapp-web.js explote al intentar hacer sendSeen.
            // En builds recientes hemos visto errores tipo: reading 'markedUnread'.
            (window as any).WWebJS.sendSeen = async () => {
              return;
            };

            // En algunos builds recientes, whatsapp-web.js asume módulos de Store que no existen
            // (p.ej. Store.GroupMetadata.update), lo que rompe getChats()/fetchMessages.
            // Creamos stubs mínimos para evitar TypeError: reading 'update'.
            const Store: any = (window as any).Store;
            if (Store) {
              if (!Store.GroupMetadata) Store.GroupMetadata = {};
              if (typeof Store.GroupMetadata.update !== 'function') {
                Store.GroupMetadata.update = async () => {
                  return;
                };
              }

              if (!Store.NewsletterMetadataCollection) Store.NewsletterMetadataCollection = {};
              if (typeof Store.NewsletterMetadataCollection.update !== 'function') {
                Store.NewsletterMetadataCollection.update = async () => {
                  return;
                };
              }
            }
          } catch {
            // ignore
          }
        });
      }
    } catch (e) {
      logger.debug({ e }, 'No se pudo aplicar sendSeen noop');
    }
  }

  private async ensureWwebjsStubsApplied(): Promise<void> {
    if (this.wwebjsStubsApplied) return;
    try {
      await this.applyWwebjsSafetyStubs();
      this.wwebjsStubsApplied = true;
    } catch {
      // best-effort; no bloquear
    }
  }

  private async listUnreadChatsLightweight(maxChats: number): Promise<Array<{ id: string; unreadCount: number }>> {
    try {
      const page: any = (this.client as any).pupPage;
      if (!page || typeof page.evaluate !== 'function') return [];

      const result = await page.evaluate((limit: number) => {
        try {
          const Store: any = (window as any).Store;
          const arr: any[] = Store?.Chat?.getModelsArray?.() || [];
          return arr
            .map((c: any) => ({ id: c?.id?._serialized ? String(c.id._serialized) : null, unreadCount: Number(c?.unreadCount || 0) }))
            .filter((x: any) => x && x.id && x.unreadCount > 0)
            .sort((a: any, b: any) => b.unreadCount - a.unreadCount)
            .slice(0, Math.max(1, Number(limit || 1)));
        } catch {
          return [];
        }
      }, maxChats);

      if (!Array.isArray(result)) return [];
      return result
        .filter((x: any) => x && typeof x.id === 'string')
        .map((x: any) => ({ id: String(x.id), unreadCount: Number(x.unreadCount || 0) }));
    } catch (error) {
      logger.debug({ err: error }, 'No se pudo listar chats no leídos (lightweight)');
      return [];
    }
  }

  private async markChatIdAsReadBestEffort(chatId: string): Promise<void> {
    if (!this.markMessagesRead) return;
    if (!chatId) return;
    if (String(chatId).endsWith('@broadcast')) return;

    try {
      const page: any = (this.client as any).pupPage;
      if (page && typeof page.evaluate === 'function') {
        await page.evaluate(async (cid: string) => {
          try {
            const chat = await (window as any).WWebJS?.getChat?.(cid, { getAsModel: false });
            const cmd = (window as any).Store?.Cmd;
            if (chat && cmd && typeof cmd.markChatUnread === 'function') {
              await cmd.markChatUnread(chat, false);
            }
          } catch {
            // ignore
          }
        }, chatId);
      }
    } catch (error) {
      logger.debug({ err: error, chatId }, 'No se pudo marcar chat como leído (markChatUnread=false)');
    }
  }

  private async markChatAsSeenBestEffort(message: pkg.Message): Promise<void> {
    if (!this.markMessagesRead) return;
    try {
      if ((message as any).fromMe) return;
      if (String((message as any).from || '').endsWith('@broadcast')) return;

      const chatId = String((message as any).from || '');
      if (!chatId) return;

      // Evitar sendSeen (en tu build tira markedUnread y enlentece). Usar markChatUnread(false).
      await this.markChatIdAsReadBestEffort(chatId);
    } catch (error: any) {
      const msg = error?.message || String(error);
      // No bloquear el bot por errores internos (markedUnread, etc.)
      logger.debug({ err: error, msg }, 'No se pudo marcar chat como leído (ignored)');
    }
  }

  private markProcessedMessage(id: string): void {
    const now = Date.now();
    this.processedMessageIds.set(id, now);

    // limpieza simple para evitar crecimiento infinito
    const TTL_MS = 24 * 60 * 60 * 1000;
    if (this.processedMessageIds.size > 5000) {
      for (const [key, ts] of this.processedMessageIds) {
        if (now - ts > TTL_MS) this.processedMessageIds.delete(key);
      }
      // si aún es grande, recortar por orden de inserción
      while (this.processedMessageIds.size > 5000) {
        const oldestKey = this.processedMessageIds.keys().next().value as string | undefined;
        if (!oldestKey) break;
        this.processedMessageIds.delete(oldestKey);
      }
    }
  }

  private stopMessagePolling(): void {
    if (this.messagePollTimer) {
      clearInterval(this.messagePollTimer);
      this.messagePollTimer = null;
    }
    this.messagePollNextAt = null;
  }

  private kickMessagePollingSoon(): void {
    if (!this.enableMessagePolling) return;
    if (!this.inboundHandler) return;
    if (!this.isReady) return;

    const now = Date.now();
    const desiredAt = now + 250;
    if (this.messagePollTimer && this.messagePollNextAt && this.messagePollNextAt <= desiredAt) {
      return;
    }
    if (this.messagePollTimer) {
      clearTimeout(this.messagePollTimer as any);
      this.messagePollTimer = null;
    }
    this.messagePollNextAt = desiredAt;
    this.messagePollTimer = setTimeout(() => {
      this.messagePollTimer = null;
      void this.runMessagePollingTick();
    }, Math.max(0, desiredAt - now));
  }

  private async runMessagePollingTick(): Promise<void> {
    if (!this.isReady) return;
    if (!this.inboundHandler) return;

    const idleIntervalMs = Number(process.env.BOT_MESSAGE_POLL_IDLE_MS || process.env.BOT_MESSAGE_POLL_MS || 15000);
    const activeIntervalMs = Number(process.env.BOT_MESSAGE_POLL_ACTIVE_MS || 2000);
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

        let chat: any | null = null;
        let messages: pkg.Message[] = [];
        try {
          chat = await (this.client as any).getChatById?.(c.id);
          if (!chat) continue;
          messages = await chat.fetchMessages({ limit: Math.max(8, Math.min(maxPerChat, unreadCount + 3)) });
        } catch (error) {
          logger.debug({ err: error, chatId: c.id }, 'No se pudo fetchMessages en polling');
          continue;
        }

        for (const message of messages) {
          const id = (message as any)?.id?._serialized;
          if (!id) continue;
          if ((message as any).fromMe) continue;
          if (this.processedMessageIds.has(id)) continue;
          if (String((message as any).from || '').endsWith('@broadcast')) continue;

          this.markProcessedMessage(id);
          logger.info(
            { id, from: (message as any).from, chatId: c.id, unreadCount: chat?.unreadCount ?? unreadCount },
            'Procesando mensaje vía polling (fallback)'
          );

          try {
            await this.inboundHandler(message);
          } catch (error) {
            logger.error({ err: error }, 'Error manejando mensaje entrante (polling)');
          }
        }

        await this.markChatIdAsReadBestEffort(c.id);
      }
    } catch (error) {
      this.messagePollConsecutiveFailures += 1;
      const failures = this.messagePollConsecutiveFailures;
      logger.warn({ err: error, failures }, 'Polling de mensajes falló');
      nextDelay = Math.max(5000, idleIntervalMs);

      if (failures >= 3) {
        logger.error({ failures }, 'Polling de mensajes falló repetidamente; deteniendo polling y reiniciando WhatsApp');
        this.stopMessagePolling();
        void this.safeRestart('message_polling_failed');
        return;
      }
    }

    // re-programar el siguiente tick (sin solapar)
    const now = Date.now();
    const delay = Math.max(250, Number.isFinite(nextDelay) ? nextDelay : idleIntervalMs);
    this.messagePollNextAt = now + delay;
    this.messagePollTimer = setTimeout(() => {
      this.messagePollTimer = null;
      void this.runMessagePollingTick();
    }, delay);
  }

  private startMessagePolling(): void {
    if (!this.enableMessagePolling) {
      if (!this.messagePollingDisabledLogged) {
        this.messagePollingDisabledLogged = true;
        logger.info('Polling de mensajes (fallback) deshabilitado; setea BOT_ENABLE_MESSAGE_POLLING=true para activarlo.');
      }
      return;
    }
    // Sólo sirve si hay handler registrado
    if (!this.inboundHandler) return;
    if (this.messagePollTimer) return;

    const idleIntervalMs = Number(process.env.BOT_MESSAGE_POLL_IDLE_MS || process.env.BOT_MESSAGE_POLL_MS || 15000);
    const activeIntervalMs = Number(process.env.BOT_MESSAGE_POLL_ACTIVE_MS || 2000);
    logger.warn({ idleIntervalMs, activeIntervalMs }, 'Iniciando polling de mensajes (fallback)');

    // primera ejecución inmediata
    this.messagePollNextAt = Date.now();
    this.messagePollTimer = setTimeout(() => {
      this.messagePollTimer = null;
      void this.runMessagePollingTick();
    }, 0);
  }

  constructor() {
    const headless = parseEnvBool(process.env.BOT_HEADLESS, true);
    const userAgent = (process.env.BOT_USER_AGENT ||
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
    ).trim();

    const wwebVersion = (process.env.BOT_WWEB_VERSION || '').trim() || undefined;
    const wwebCacheType = (process.env.BOT_WWEB_CACHE_TYPE || '').trim() || undefined; // local|remote|none
    const wwebCacheStrict = parseEnvBool(process.env.BOT_WWEB_CACHE_STRICT, Boolean(wwebVersion));
    const wwebCachePath = (process.env.BOT_WWEB_CACHE_PATH || '').trim() || undefined;
    const wwebRemotePath =
      (process.env.BOT_WWEB_CACHE_REMOTE_PATH || '').trim() ||
      'https://cdn.jsdelivr.net/gh/wppconnect-team/wa-version@main/html/{version}.html';

    const disableWwebjsPatches = parseEnvBool(process.env.BOT_DISABLE_WWEBJS_PATCHES, false);
    this.debugMessages = parseEnvBool(process.env.BOT_DEBUG_MESSAGES, false);
    this.enableMessagePolling = parseEnvBool(process.env.BOT_ENABLE_MESSAGE_POLLING, false);
    this.markMessagesRead = parseEnvBool(process.env.BOT_MARK_MESSAGES_READ, true);
    // Auto-restart can cause Puppeteer session locks ("browser already running") if Chrome doesn't exit cleanly.
    // Keep it OFF by default; can be enabled when the environment is stable.
    this.enableAutoRestartOnStuck = parseEnvBool(process.env.BOT_AUTO_RESTART_ON_STUCK, false);
    this.stuckCheckIntervalMs = Number(process.env.BOT_STUCK_CHECK_INTERVAL_MS || 120000); // 2 min

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
      'Inicializando WhatsApp (puppeteer)'
    );

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
      ...(wwebVersion
        ? {
            webVersion: wwebVersion,
            webVersionCache:
              wwebCacheType === 'none'
                ? { type: 'none' as const }
                : wwebCacheType === 'local'
                  ? { type: 'local' as const, path: wwebCachePath, strict: wwebCacheStrict }
                  : {
                      // default al usar BOT_WWEB_VERSION: remote cache
                      type: 'remote' as const,
                      remotePath: wwebRemotePath,
                      strict: wwebCacheStrict
                    }
          }
        : {}),
      ...(disableWwebjsPatches
        ? {}
        : {
            evalOnNewDoc: () => {
              try {
                if (!(window as any).WWebJS) (window as any).WWebJS = {};
                (window as any).WWebJS.markedUnread = false;
              } catch (e) {
                // ignore
              }
            }
          }),
      puppeteer: {
        headless,
        // Allow overriding Chromium/Chrome executable via env var BOT_CHROMIUM_PATH
        // If not provided, puppeteer will use the bundled or system browser.
        executablePath: process.env.BOT_CHROMIUM_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          `--user-agent=${userAgent}`
        ]
      }
    });

    // Stubs de compatibilidad (no deberían deshabilitar sendSeen).
    // Se aplican luego en `ready`/ready-inferido.
    
    // Wrap original sendMessage to catch page evaluation errors (markedUnread) that
    // ocurren dentro de la página y evitar que el bot falle completamente.
    const originalSendMessage = (this.client as any).sendMessage?.bind(this.client);
    if (originalSendMessage) {
      (this.client as any).sendMessage = async (...args: any[]) => {
        await this.ensureWwebjsStubsApplied();
        const patchedArgs = [...args];
        // whatsapp-web.js suele hacer sendSeen() por defecto al enviar; en algunos builds eso truena con markedUnread.
        // Forzamos sendSeen:false para evitar el bug y mejorar performance.
        if (patchedArgs.length >= 2) {
          const opts = patchedArgs[2];
          if (!opts || typeof opts !== 'object') patchedArgs[2] = { sendSeen: false };
          else patchedArgs[2] = { ...(opts as any), sendSeen: false };
        }
        try {
          return await originalSendMessage(...patchedArgs);
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('markedUnread') || msg.includes('marked unread')) {
            // En algunos entornos este error ocurre *después* de que WhatsApp envía el mensaje.
            // No queremos que el bot se caiga o quede en loop reintentando; registramos y continuamos.
            logger.warn({ err }, 'Interceptado markedUnread error en sendMessage — ignorando para mantener el bot operativo');

            // Aplicar stubs y reintentar una vez. Si sigue fallando, no botar el proceso.
            await this.applyWwebjsSafetyStubs();
            try {
              return await originalSendMessage(...patchedArgs);
            } catch (err2: any) {
              logger.error({ err: err2 }, 'sendMessage sigue fallando tras stubs; se ignora para no tumbar el bot');
              return;
            }
          }
          throw err;
        }
      };
    }

    if (!disableWwebjsPatches) {
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
                          (window as any).WWebJS.sendSeen = async () => {
                            return;
                          };
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
                          (window as any).WWebJS.sendSeen = async () => {
                            return;
                          };
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
                        (window as any).WWebJS.sendSeen = async () => {
                          return;
                        };
                        (window as any).WWebJS.markedUnread = false;
                      } catch (e) {}
                    });
                  } else if (p && typeof p.addInitScript === 'function') {
                    await p.addInitScript(() => {
                      try {
                        if (!(window as any).WWebJS) (window as any).WWebJS = {};
                        (window as any).WWebJS.sendSeen = async () => {
                          return;
                        };
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
  }

  private async safeRestart(triggerReason: string): Promise<void> {
    const now = Date.now();
    const WINDOW_MS = 10 * 60 * 1000;
    const MAX_RESTARTS_IN_WINDOW = 3;

    // limpiar ventana
    this.restartCountWindow = this.restartCountWindow.filter((t) => now - t < WINDOW_MS);
    if (this.restartCountWindow.length >= MAX_RESTARTS_IN_WINDOW) {
      logger.error(
        { triggerReason, restartsInWindow: this.restartCountWindow.length },
        'Demasiados reinicios en ventana; no se reiniciará automáticamente para evitar loop'
      );
      return;
    }

    if (this.restartInProgress) {
      logger.warn({ triggerReason }, 'Reinicio ya en progreso; omitiendo');
      return;
    }

    const last = this.lastRestartAt;
    const COOLDOWN_MS = 15000;
    if (last && now - last < COOLDOWN_MS) {
      logger.warn({ triggerReason, cooldownMs: COOLDOWN_MS }, 'Reinicio en cooldown; omitiendo');
      return;
    }

    this.restartInProgress = true;
    this.lastRestartAt = now;
    this.restartCountWindow.push(now);

    // Backoff pequeño para evitar carreras con eventos internos.
    await new Promise((r) => setTimeout(r, 5000));

    try {
      logger.warn({ triggerReason }, 'Reiniciando cliente WhatsApp (destroy + initialize)');

      try {
        await this.client.destroy();
      } catch (error) {
        logger.warn({ err: error }, 'No se pudo destruir el cliente antes de reiniciar');
      }

      // Reset de flags locales
      this.isReady = false;
      this.stopMessagePolling();
      this.authenticatedAt = null;

      await this.client.initialize();
      logger.info({ triggerReason }, 'Reinicio de WhatsApp iniciado');
    } catch (error) {
      logger.error({ err: error, triggerReason }, 'No se pudo reiniciar el cliente de WhatsApp');
    } finally {
      this.restartInProgress = false;
    }
  }

  async initialize(): Promise<void> {
    if (this.listenersAttached) {
      logger.warn('WhatsAppClient.initialize() llamado más de una vez; evitando duplicar listeners.');
    } else {
      this.listenersAttached = true;

    this.client.on('qr', (qr: string) => {
      logger.info('Escanee el código QR para iniciar sesión.');
      this.isReady = false;
      this.stopMessagePolling();
      this.authenticatedAt = null;
      this.authStuckRestarted = false;
      if (this.authStuckTimer) {
        clearTimeout(this.authStuckTimer);
        this.authStuckTimer = null;
      }
      qrcode.generate(qr, { small: true });

  void QRCode.toDataURL(qr)
        .then(async (dataUrl: string) => {
          try {
            await apiClient.reportWhatsappQr(dataUrl);
          } catch (error) {
            logger.error({ err: error }, 'No se pudo enviar el QR al backend');
          }
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'No se pudo generar el QR en formato de imagen');
        });
    });

    this.client.on('authenticated', () => {
      if (!this.authenticatedAt) this.authenticatedAt = Date.now();
      logger.info({ authenticatedAt: this.authenticatedAt }, 'WhatsApp autenticado (session establecida).');

      // Loguear identidad del cliente cuando esté disponible (útil para confirmar a qué número está conectado)
      try {
        const info: any = (this.client as any).info;
        const wid = info?.wid?._serialized || info?.wid?.user || null;
        const pushname = info?.pushname || null;
        if (wid || pushname) {
          logger.info({ wid, pushname }, 'Identidad WhatsApp (info)');
        }
      } catch {
        // ignore
      }

      // Si quedamos autenticados pero nunca llegamos a `ready`, normalmente es un atasco interno.
      // Hacemos polling corto y un reinicio controlado (máx 1 vez por ciclo QR/auth) para recuperar.
      if (this.authStuckTimer) clearTimeout(this.authStuckTimer);
      this.authStuckTimer = setTimeout(() => {
        void (async () => {
          if (this.isReady) return;

          let state: string | null = null;
          try {
            // whatsapp-web.js expone getState()
            state = await (this.client as any).getState?.();
          } catch (error) {
            logger.debug({ err: error }, 'No se pudo obtener getState()');
          }

          logger.warn(
            {
              state,
              authenticatedSecondsAgo: this.authenticatedAt ? Math.round((Date.now() - this.authenticatedAt) / 1000) : null,
              alreadyRestarted: this.authStuckRestarted
            },
            'WhatsApp autenticado pero aún no está listo (posible atasco)'
          );

          // Workaround: a veces WhatsApp queda en CONNECTED pero whatsapp-web.js no emite `ready`.
          // Si podemos hacer una llamada real (getContacts) asumimos que está usable y marcamos listo.
          if (state === 'CONNECTED') {
            try {
              const contacts = await Promise.race([
                this.client.getContacts(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getContacts timeout')), 10000))
              ]);

              logger.info(
                { contactsCount: Array.isArray(contacts) ? contacts.length : null },
                'Cliente de WhatsApp usable sin evento ready (ready inferido)'
              );

              // Aun sin evento `ready`, aplicar stubs de compatibilidad para evitar crashes internos.
              await this.applyWwebjsSafetyStubs();

              this.isReady = true;
              this.authenticatedAt = null;
              this.authStuckRestarted = false;
              if (this.authStuckTimer) {
                clearTimeout(this.authStuckTimer);
                this.authStuckTimer = null;
              }

              void apiClient.markWhatsappReady().catch((error: unknown) => {
                logger.error({ err: error }, 'No se pudo notificar al backend que WhatsApp está listo (inferido)');
              });

              // Si los eventos de whatsapp-web.js no están fluyendo, el polling permite operar igual.
              this.startMessagePolling();

              return;
            } catch (error) {
              logger.warn({ err: error }, 'Estado CONNECTED pero no se pudo confirmar usabilidad (getContacts)');
            }
          }

          if (!this.authStuckRestarted) {
            if (!this.enableAutoRestartOnStuck) {
              logger.warn(
                {
                  state,
                  authenticatedSecondsAgo: this.authenticatedAt
                    ? Math.round((Date.now() - this.authenticatedAt) / 1000)
                    : null
                },
                'Auto-restart por stuck deshabilitado; se evita reinicio para no bloquear la sesión de Chrome'
              );
              return;
            }

            this.authStuckRestarted = true;
            await this.safeRestart('stuck_after_authenticated');
          }
        })();
      }, 30000);
    });

    this.client.on('loading_screen', (percent: number, message: string) => {
      logger.debug({ percent, message }, 'WhatsApp loading_screen');
    });

    this.client.on('change_state', (state: string) => {
      logger.info({ state }, 'WhatsApp change_state');
    });

    this.client.on('ready', () => {
      logger.info('Cliente de WhatsApp listo.');
      this.isReady = true;
      this.authenticatedAt = null;
      this.authStuckRestarted = false;
      if (this.authStuckTimer) {
        clearTimeout(this.authStuckTimer);
        this.authStuckTimer = null;
      }

      // Aplicar stubs de compatibilidad para evitar crashes internos
      void this.applyWwebjsSafetyStubs();

      this.startMessagePolling();

      void apiClient.markWhatsappReady().catch((error: unknown) => {
        logger.error({ err: error }, 'No se pudo notificar al backend que WhatsApp está listo');
      });
    });

    this.client.on('auth_failure', (message: string) => {
      logger.error({ message }, 'Fallo de autenticación en WhatsApp');

      void apiClient.markWhatsappDisconnected(message).catch((error: unknown) => {
        logger.error({ err: error }, 'No se pudo notificar la desconexión por fallo de autenticación');
      });
    });

    this.client.on('disconnected', (reason: string) => {
      logger.warn({ reason }, 'Cliente de WhatsApp desconectado');
      this.isReady = false;
      this.stopMessagePolling();

      void apiClient.markWhatsappDisconnected(reason).catch((error: unknown) => {
        logger.error({ err: error }, 'No se pudo notificar la desconexión de WhatsApp');
      });

      if (this.restartInProgress) {
        logger.warn({ reason }, 'Reinicio ya en progreso; omitiendo reinicio adicional');
        return;
      }
      void this.safeRestart(reason);
    });

    }

    if (this.debugMessages) {
      this.client.on('message_create', (message: pkg.Message) => {
        try {
          const body = String((message as any).body ?? '');
          const bodyPreview = body.length > 200 ? body.slice(0, 200) + '…' : body;
          logger.info(
            {
              id: (message as any).id?._serialized,
              from: (message as any).from,
              to: (message as any).to,
              fromMe: Boolean((message as any).fromMe),
              hasMedia: Boolean((message as any).hasMedia),
              type: (message as any).type,
              bodyPreview
            },
            'WhatsApp message_create (debug)'
          );
        } catch (e) {
          logger.debug({ e }, 'No se pudo loguear message_create');
        }
      });
    }

    this.client.on('message', async (message: pkg.Message) => {
      try {
        const id = (message as any)?.id?._serialized;
        if (id) this.markProcessedMessage(id);
        if (this.debugMessages) {
          const body = String((message as any).body ?? '');
          const bodyPreview = body.length > 200 ? body.slice(0, 200) + '…' : body;
          logger.info(
            {
              id: (message as any).id?._serialized,
              from: (message as any).from,
              to: (message as any).to,
              fromMe: Boolean((message as any).fromMe),
              hasMedia: Boolean((message as any).hasMedia),
              type: (message as any).type,
              bodyPreview
            },
            'WhatsApp message (debug)'
          );
        }
        if (this.inboundHandler) {
          await this.inboundHandler(message);
        }

        await this.markChatAsSeenBestEffort(message);

        // Si la sesión está "media rota" y dependemos de polling, acelerar el siguiente tick.
        this.kickMessagePollingSoon();
      } catch (error) {
        logger.error({ err: error }, 'Error manejando mensaje entrante');
      }
    });

    try {
      await this.client.initialize();
    } catch (error) {
      // log the full error stack to help debugging puppeteer/protocol issues
      logger.fatal({ err: error }, 'Error inicializando cliente de WhatsApp');
      throw error;
    }
  }

  registerInboundHandler(handler: IncomingMessageHandler): void {
    this.inboundHandler = handler;

    // Si ya estamos listos, arrancar polling inmediatamente
    if (this.isReady) {
      this.startMessagePolling();
    }
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
      let webVersion: string | null = null;
      try {
        webVersion = (await (this.client as any).getWWebVersion?.()) ?? null;
      } catch {
        // ignore
      }
      return { state: state ?? null, info: { ...info, webVersion } };
    } catch (error) {
      logger.error({ err: error }, 'No se pudo obtener el estado del cliente de WhatsApp');
      return { state: null, info: null };
    }
  }

  async debugGetChatsSummary(): Promise<{
    ok: boolean;
    totalChats?: number;
    unreadChats?: number;
    sample?: Array<{ id: string; unreadCount: number; isGroup: boolean }>;
    error?: string;
  }> {
    try {
      const chats = await this.client.getChats();
      const unread = chats.filter((c: any) => (c?.unreadCount || 0) > 0);

      const sample = (unread as any[]).slice(0, 5).map((c: any) => ({
        id: c?.id?._serialized ?? String(c?.id ?? ''),
        unreadCount: Number(c?.unreadCount || 0),
        isGroup: Boolean(c?.isGroup)
      }));

      return {
        ok: true,
        totalChats: chats.length,
        unreadChats: unread.length,
        sample
      };
    } catch (error: any) {
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
  async cleanupChats(options: {
    /** Si true, no ejecuta acciones destructivas; solo reporta qué haría */
    dryRun?: boolean;
    /** Incluir chats con mensajes no leídos (default: false) */
    includeUnread?: boolean;
    /** Incluir grupos (default: false) */
    includeGroups?: boolean;
    /** Máximo de chats a procesar (default: 200) */
    limit?: number;
    /** Función que retorna true si el número es permitido (cliente/admin/whitelist/etc) */
    isAllowedNumber: (whatsappNumber: string) => Promise<boolean>;
  }): Promise<{
    ok: boolean;
    scanned: number;
    candidates: number;
    acted: number;
    skippedUnread: number;
    skippedGroup: number;
    errors: number;
    sample: Array<{ chatId: string; phone: string; action: 'skip' | 'clear' | 'archive' | 'none'; reason?: string }>;
  }> {
    const dryRun = options.dryRun !== false; // default true
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
      sample: [] as Array<{ chatId: string; phone: string; action: 'skip' | 'clear' | 'archive' | 'none'; reason?: string }>
    };

    try {
      const chats: any[] = await this.client.getChats();
      const slice = chats.slice(0, Math.max(0, limit));
      for (const c of slice) {
        result.scanned++;

        const chatId = c?.id?._serialized ?? String(c?.id ?? '');
        const isGroup = Boolean(c?.isGroup);
        const unreadCount = Number(c?.unreadCount || 0);

        if (isGroup && !includeGroups) {
          result.skippedGroup++;
          if (result.sample.length < 20) result.sample.push({ chatId, phone: '', action: 'skip', reason: 'group' });
          continue;
        }

        if (unreadCount > 0 && !includeUnread) {
          result.skippedUnread++;
          if (result.sample.length < 20) result.sample.push({ chatId, phone: '', action: 'skip', reason: 'unread' });
          continue;
        }

        const phone = String(chatId).replace(/@c\.us$/, '').replace(/[^0-9]/g, '');
        if (!phone || phone.length < 8) {
          if (result.sample.length < 20) result.sample.push({ chatId, phone: phone || '', action: 'skip', reason: 'invalid_phone' });
          continue;
        }

        let allowed = false;
        try {
          allowed = await options.isAllowedNumber(phone);
        } catch {
          // Si el check falla, no destruimos nada.
          allowed = true;
        }

        if (allowed) {
          if (result.sample.length < 20) result.sample.push({ chatId, phone, action: 'none', reason: 'allowed' });
          continue;
        }

        // Candidato a limpiar
        result.candidates++;
        if (dryRun) {
          if (result.sample.length < 20) result.sample.push({ chatId, phone, action: 'none', reason: 'dry_run' });
          continue;
        }

        // Acciones: intentar clearMessages y luego archive
        try {
          const chat: any = await this.client.getChatById(chatId);

          let didSomething = false;
          if (chat && typeof chat.clearMessages === 'function') {
            await chat.clearMessages();
            didSomething = true;
            result.acted++;
            if (result.sample.length < 20) result.sample.push({ chatId, phone, action: 'clear' });
          }

          // Archivar aunque no exista clearMessages
          if (chat && typeof chat.archive === 'function') {
            await chat.archive();
            didSomething = true;
            result.acted++;
            if (result.sample.length < 20) result.sample.push({ chatId, phone, action: 'archive' });
          }

          if (!didSomething) {
            if (result.sample.length < 20) result.sample.push({ chatId, phone, action: 'none', reason: 'no_supported_actions' });
          }
        } catch (e: any) {
          result.errors++;
          logger.warn({ chatId, phone, err: e?.message || e }, 'cleanupChats: error procesando chat');
          if (result.sample.length < 20) result.sample.push({ chatId, phone, action: 'skip', reason: 'error' });
        }
      }

      return result;
    } catch (e: any) {
      logger.error({ err: e }, 'cleanupChats: fallo general');
      return { ...result, ok: false, errors: result.errors + 1 };
    }
  }

  async shutdown(): Promise<void> {
    this.stopMessagePolling();
    try {
      await this.client.destroy();
      return;
    } catch (err) {
      logger.warn({ err }, 'WhatsAppClient.destroy falló; intentando cleanup alternativo');
    }

    // Fallback: intentar cerrar el browser de puppeteer si está disponible
    try {
      const browser: any = (this.client as any).pupBrowser;
      if (browser && typeof browser.close === 'function') {
        await browser.close();
        return;
      }
    } catch (err) {
      logger.warn({ err }, 'No se pudo cerrar pupBrowser en fallback');
    }

    // Último recurso: matar procesos que estén usando el userDataDir (evita lock persistente)
    try {
      const userDataDir = (this.client as any)?.options?.puppeteer?.userDataDir;
      if (userDataDir && typeof userDataDir === 'string' && userDataDir.trim().length > 0) {
        const escaped = userDataDir.replace(/'/g, "'\\''");
        await exec(`pkill -f '${escaped}' || true`);
      }
    } catch (err) {
      logger.warn({ err }, 'No se pudo ejecutar pkill de cleanup para WhatsApp');
    }
  }
}
