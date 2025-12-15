import { config } from './config.js';
import { logger } from './logger.js';
import { ReminderProcessor } from './reminder-processor.js';
import { WhatsAppClient } from './whatsapp-client.js';
import { apiClient } from './api-client.js';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import { URL } from 'url';
import axios from 'axios';

const whatsappClient = new WhatsAppClient();
const processor = new ReminderProcessor(whatsappClient);

const runBatch = async () => {
  try {
    await processor.runBatch();
  } catch (error) {
    logger.error({ error }, 'Error procesando lote de recordatorios');
  }
};

async function main(): Promise<void> {
  // per-chat menu state: whether a menu was just shown and we're awaiting selection
  const menuShown = new Map<string, boolean>();
  // store last shown menu items per chat to support numeric selection
  const lastMenuItems = new Map<string, Array<any>>();
  // per-chat agent mode: when true the user is interacting with a human agent and the bot should pause
  const agentMode = new Map<string, boolean>();
  // throttle admin notifications per chat to avoid spamming admins
  const adminNotifiedAt = new Map<string, number>();
  const AGENT_NOTIFY_THROTTLE_MS = Number(process.env.AGENT_NOTIFY_THROTTLE_MS || 30 * 60 * 1000); // default 30 minutes
  // awaiting receipt uploads per chat
  const awaitingReceipt = new Map<string, boolean>();
  // pending confirmation for an unsolicited media receipt: store downloaded media until user confirms
  const pendingConfirmReceipt = new Map<string, { data: string; mimetype: string; filename?: string; text?: string }>();
  // after we save receipt (and optionally create backend payment) we ask how many months are being paid
  const awaitingMonths = new Map<string, { receiptId: string; backendReceiptId?: number | null; backendPaymentId?: number | null }>();
  const RECEIPTS_DIR = path.join(process.cwd(), 'data', 'receipts');
  const RECEIPTS_INDEX = path.join(RECEIPTS_DIR, 'index.json');

  // ----- Admin / timeout / business hours helpers (portadas desde el otro repo) -----
  let TIMEZONE = process.env.TIMEZONE || 'America/Costa_Rica';

  function onlyDigits(s?: string) { return String(s || '').replace(/[^0-9]/g, ''); }
  function normalizeCR(s?: string) {
    const d = onlyDigits(s);
    if (d.length === 8) return (config.defaultCountryCode || '506') + d;
    return d;
  }

  const ADMIN_PHONES_RAW = (process.env.BOT_ADMIN_PHONES && process.env.BOT_ADMIN_PHONES.trim().length ? process.env.BOT_ADMIN_PHONES : '50672140974')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const ADMIN_PHONES = Array.from(new Set([
    ...ADMIN_PHONES_RAW.map(s => s),
    ...ADMIN_PHONES_RAW.map(s => normalizeCR(s))
  ]));

  function normalizeToChatId(num?: string) {
    if (!num) return null;
    const digits = String(num).replace(/[^0-9]/g, '');
    let phone = digits;
    if (phone.length === 8) phone = (config.defaultCountryCode || '506') + phone;
    if (!/^[0-9]{8,15}$/.test(phone)) return null;
    return phone.endsWith('@c.us') ? phone : phone + '@c.us';
  }

  function isAdminChatId(chatId?: string) {
    if (!chatId) return false;
    const user = chatId.replace(/@c\.us$/, '');
    const normalized = normalizeCR(user);
    return ADMIN_PHONES.includes(user) || ADMIN_PHONES.includes(normalized);
  }

  // Timeouts: default 10 minutes for bot menu inactivity
  const BOT_TIMEOUT_MS = Number(process.env.BOT_TIMEOUT_MS || 10 * 60 * 1000);
  const _AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 60 * 60 * 1000);
  const chatTimeoutMs = new Map<string, number>();
  const chatTimers = new Map<string, NodeJS.Timeout>();

  function clearTimer(chatId: string) {
    const t = chatTimers.get(chatId);
    if (t) {
      clearTimeout(t);
      chatTimers.delete(chatId);
    }
  }

  function touchTimer(chatId: string) {
    clearTimer(chatId);
    const timeout = chatTimeoutMs.get(chatId) || BOT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      agentMode.delete(chatId);  // Limpiar modo agente después del timeout
      awaitingReceipt.delete(chatId);  // Limpiar espera de comprobante
      awaitingMonths.delete(chatId);  // Limpiar espera de meses
      pendingConfirmReceipt.delete(chatId);  // Limpiar confirmación pendiente
      chatTimeoutMs.delete(chatId);
      chatTimers.delete(chatId);
      logger.info({ chatId, timeoutMs: timeout }, 'Chat timeout: estado limpiado por inactividad');
    }, timeout);
    chatTimers.set(chatId, timer);
  }

  // Business hours config (simple default, puede ampliarse desde env si es necesario)
  // Default business hours (can be overridden by env BOT_BUSINESS_HOURS as JSON or by backend settings.business_hours)
  let BUSINESS_HOURS: Record<number, { open: string; close: string }> = {
    0: { open: '08:00', close: '19:00' },
    1: { open: '08:00', close: '19:00' },
    2: { open: '08:00', close: '19:00' },
    3: { open: '08:00', close: '19:00' },
    4: { open: '08:00', close: '19:00' },
    5: { open: '08:00', close: '19:00' },
    6: { open: '08:00', close: '19:00' }
  };

  // Allow override from environment variable BOT_BUSINESS_HOURS (JSON string)
  try {
    const envHours = process.env.BOT_BUSINESS_HOURS;
    if (envHours && envHours.trim().length) {
      const parsed = JSON.parse(envHours);
      if (parsed && typeof parsed === 'object') {
        BUSINESS_HOURS = Object.assign({}, BUSINESS_HOURS, parsed);
      }
    }
  } catch (e) {
    logger.debug({ e }, 'BOT_BUSINESS_HOURS parse failed, using defaults');
  }

  function hhmmToMinutes(hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function getTZParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);
    const obj: Record<string, string> = {};
    for (const p of parts) obj[p.type] = p.value;
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      day: dayMap[obj.weekday] ?? 0,
      minutes: Number(obj.hour) * 60 + Number(obj.minute)
    };
  }

  function _isWithinBusinessHours(now = new Date()) {
    const { day, minutes } = getTZParts(now);
    const configHours = BUSINESS_HOURS[day];
    if (!configHours) return false;
    const start = hhmmToMinutes(configHours.open);
    const end = hhmmToMinutes(configHours.close);
    return minutes >= start && minutes <= end;
  }

  function formatBusinessHours(): string {
    try {
      const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const parts: string[] = [];
      for (let d = 1; d <= 5; d++) {
        if (BUSINESS_HOURS[d]) parts.push(`${names[d]} ${BUSINESS_HOURS[d].open}-${BUSINESS_HOURS[d].close}`);
      }
      // include weekend if differs
      if (BUSINESS_HOURS[0]) parts.push(`Dom ${BUSINESS_HOURS[0].open}-${BUSINESS_HOURS[0].close}`);
      if (BUSINESS_HOURS[6]) parts.push(`Sáb ${BUSINESS_HOURS[6].open}-${BUSINESS_HOURS[6].close}`);
      return parts.join(', ');
    } catch (e) {
      return 'Horario no disponible';
    }
  }

  const afterHoursNotified = new Map<string, number>();
  function _shouldNotifyAfterHours(id: string) {
    const last = afterHoursNotified.get(id);
    const now = Date.now();
    const THRESHOLD = 30 * 60 * 1000; // 30 minutos
    if (!last || now - last > THRESHOLD) {
      afterHoursNotified.set(id, now);
      return true;
    }
    return false;
  }

  // Admin flows (asistente simple)
  const adminFlows = new Map<string, any>();
  // auxiliares para asistentes admin
  function parseAmountCRC(s?: string) {
    const digits = String(s || '').replace(/[^0-9]/g, '');
    const n = Number(digits || 0);
    return isNaN(n) ? 0 : n;
  }
  function validHHMM(s?: string) { return /^\d{1,2}:\d{2}$/.test(String(s || '')); }
  function toHHMM(s?: string, def = '08:00') {
    const t = String(s || '').trim();
    if (!t) return def;
    if (!validHHMM(t)) return null;
    let [h, m] = t.split(':').map(x => Number(x));
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
  }
  // ----------------------------------------------------------------------------------

  // --- Menu resolver: intenta API -> BOT_MENU_PATH -> local cache (bot/data/menu.json)
  async function resolveMenu(): Promise<Array<any> | null> {
    const DATA_DIR = path.join(process.cwd(), 'data');
    const localMenuPath = path.join(DATA_DIR, 'menu.json');
    // 1) Try API
    try {
      const remote = await apiClient.fetchBotMenu();
      if (Array.isArray(remote) && remote.length) {
        try {
          await fs.mkdir(DATA_DIR, { recursive: true });
          await fs.writeFile(localMenuPath, JSON.stringify(remote, null, 2), { encoding: 'utf8' });
        } catch (e) {
          logger.debug({ e }, 'No se pudo persistir menú remoto en cache local');
        }
        return remote;
      }
    } catch (e) {
      logger.debug({ e }, 'fetchBotMenu falló');
    }

    // 2) Try configured BOT_MENU_PATH
    if (config.menuPath) {
      try {
        const raw = await fs.readFile(config.menuPath, { encoding: 'utf8' });
        const parsed = JSON.parse(raw) as Array<any>;
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (err) {
        logger.debug({ err }, 'No se pudo leer BOT_MENU_PATH');
      }
    }

    // 3) Try local cached menu
    try {
      const raw = await fs.readFile(localMenuPath, { encoding: 'utf8' });
      const parsed = JSON.parse(raw) as Array<any>;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // ignore
    }

    return null;
  }


  whatsappClient.registerInboundHandler(async (message) => {
  // Ignore WhatsApp 'status' / broadcast messages (ej: status@broadcast)
  if (String(message.from || '').endsWith('@broadcast')) return;

  logger.info({ from: message.from, body: message.body }, 'Mensaje entrante de WhatsApp');

  const body = String(message.body ?? '').trim();
  // allow empty textual body if there's media attached (media-only messages)
  if (!body && !((message as any).hasMedia)) return;

  const lc = body.toLowerCase();
    const chatId = message.from;
    const fromUser = String(chatId || '').replace(/@c\.us$/, '');
    const fromNorm = normalizeCR(fromUser);

    // Mantener timeout por chat y detectar admin
    try {
      touchTimer(chatId);
    } catch (e) {
      logger.debug({ e }, 'touchTimer fallo');
    }

  // If outside business hours, politely inform the user and avoid processing further (admins and agents bypass)
  try {
    const isAdminUserEarly = isAdminChatId(chatId) || fromNorm === '50672140974';
    if (! _isWithinBusinessHours() && !isAdminUserEarly && !agentMode.get(chatId)) {
      await message.reply(`Hola. Actualmente estamos fuera del horario de atención (${TIMEZONE}). Nuestro horario: ${formatBusinessHours()}. Por favor intenta de nuevo durante el horario de atención.`);
      return;
    }
  } catch (e) {
    logger.debug({ e }, 'error verificando horario de atención');
  }

  // If we're awaiting a receipt from this chat, handle media uploads first
    if (awaitingReceipt.get(chatId)) {
      try {
        if ((message as any).hasMedia) {
          const media = await (message as any).downloadMedia();
          const fname = (media.filename && media.filename.trim()) ? media.filename : `receipt-${chatId.replace(/[^0-9]/g,'')}-${Date.now()}`;
          // save locally and notify admin
          const saved = await saveReceipt(chatId, fname, media.data, media.mimetype, body);
          // Create a backend Payment placeholder (in CRC) so it appears in UI even before months are applied.
          // We'll attach the PDF if it's already a PDF; otherwise admin will receive the media via WhatsApp.
          let backendPaymentId: number | null = null;
          try {
            // Ensure client exists
            let client: any = null;
            try { client = await apiClient.findCustomerByPhone(fromNorm); } catch (e) { /* ignore */ }
            if (!client) {
              try { client = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser }); } catch (e) { /* ignore */ }
            }

            const paymentPayload: any = {
              client_id: client && client.id ? client.id : undefined,
              amount: 0,
              currency: 'CRC',
              channel: 'whatsapp',
              status: 'unverified',
              reference: `bot:${saved.id}`,
              metadata: { local_receipt_id: saved.id }
            };

            const pRes = await apiClient.createPayment(paymentPayload);
            if (pRes && (pRes.id || pRes.payment_id)) {
              backendPaymentId = pRes.id ?? pRes.payment_id;
              await updateReceiptEntry(saved.id, { backend_payment_id: backendPaymentId, status: 'created' });
            } else {
              await updateReceiptEntry(saved.id, { status: 'created' });
            }

            // If we have a backend payment, try to attach the file. If it's an image, convert to PDF first.
            if (backendPaymentId) {
              try {
                let attachBuf: Buffer | null = null;
                let attachName = fname;
                if (media.mimetype === 'application/pdf') {
                  attachBuf = Buffer.from(media.data, 'base64');
                } else if (/^image\//.test(media.mimetype)) {
                  try {
                    const imgBuf = Buffer.from(media.data, 'base64');
                    const pdfBuf = await imageBufferToPdfBuffer(imgBuf, fname + '.pdf');
                    attachBuf = pdfBuf;
                    attachName = (fname.endsWith('.pdf') ? fname : (fname + '.pdf'));
                  } catch (e: any) {
                    logger.debug({ e }, 'No se pudo convertir imagen a PDF para adjuntar, se omite attach');
                    attachBuf = null;
                  }
                }
                if (attachBuf) {
                  const fdMod = await import('form-data');
                  const FormDataCtor: any = fdMod && (fdMod as any).default ? (fdMod as any).default : fdMod;
                  const form = new FormDataCtor();
                  form.append('file', attachBuf, { filename: attachName, contentType: 'application/pdf' });
                  form.append('received_at', new Date().toISOString());
                  form.append('metadata', JSON.stringify([]));
                  const headers = Object.assign({ Authorization: `Bearer ${config.apiToken}`, Accept: 'application/json' }, form.getHeaders());
                  await axios.post(`${config.apiBaseUrl.replace(/\/$/, '')}/payments/${backendPaymentId}/receipts`, form, { headers });
                }
              } catch (e: any) {
                logger.debug({ e, backendPaymentId, saved }, 'No se pudo adjuntar PDF al payment (se continuará de todas formas)');
              }
            }
          } catch (e: any) {
            logger.warn({ e, chatId }, 'No se pudo crear payment placeholder en backend');
          }

          // After saving receipt and creating backend payment placeholder, ask client cuántos meses son
          awaitingMonths.set(chatId, { receiptId: saved.id, backendPaymentId });
          await message.reply('Gracias. ¿Cuántos meses estás pagando con este comprobante? Responde con un número, por ejemplo: 1');

          // notify admin and forward media (include backend payment id if available)
          try {
            const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : '50672140974';
            const adminChatId = normalizeToChatId(adminPhone);
            if (adminChatId) {
              const notifyText = backendPaymentId
                ? `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id} | backend payment: ${backendPaymentId}`
                : `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id}`;
              await whatsappClient.sendText(adminChatId, notifyText);
              await whatsappClient.sendMedia(adminChatId, media.data, media.mimetype, fname);
              logger.info({ adminChatId, chatId, file: saved.filepath, backendPaymentId }, 'Enviado comprobante al admin');
            }
          } catch (e: any) {
            logger.warn({ e }, 'Fallo notificando admin sobre comprobante recibido');
          }

          awaitingReceipt.delete(chatId);
          await message.reply('✅ Recibimos tu comprobante. Un asesor lo revisará y te contactará si es necesario.');
          return;
        } else {
          await message.reply('Por favor adjunta una foto o PDF del comprobante. Si no deseas continuar escribe "salir".');
          return;
        }
      } catch (e: any) {
        logger.error({ e }, 'Error procesando comprobante');
        awaitingReceipt.delete(chatId);
        await message.reply('❌ Ocurrió un error procesando el comprobante. Intenta de nuevo o escribe "salir" para cancelar.');
        return;
      }
    }

    // If user sent media but we are NOT in awaitingReceipt and NOT in agentMode, offer to register it as comprobante
    try {
      if (!(awaitingReceipt.get(chatId)) && !(agentMode.get(chatId)) && ((message as any).hasMedia)) {
        // download and keep in-memory until user confirms
        try {
          const media = await (message as any).downloadMedia();
          const fname = (media.filename && media.filename.trim()) ? media.filename : `receipt-${chatId.replace(/[^0-9]/g,'')}-${Date.now()}`;
          pendingConfirmReceipt.set(chatId, { data: media.data, mimetype: media.mimetype, filename: fname, text: body });
          await message.reply('Veo que enviaste un archivo. ¿Es un comprobante de pago? Responde "si" para registrarlo y notificar a un asesor, o "no" para cancelar.');
          return;
        } catch (e: any) {
          logger.warn({ e, chatId }, 'Error descargando media para confirmación');
          // continue to normal flow
        }
      }
    } catch (e: any) {
      logger.debug({ e }, 'Error en flujo de detección de media');
    }

  const isAdminUser = isAdminChatId(chatId) || fromNorm === '50672140974';

    // Si hay un asistente admin en curso y el mensaje NO empieza con '*', procesarlo
    if (isAdminUser && adminFlows.has(chatId) && !lc.startsWith('*')) {
      const flow = adminFlows.get(chatId);
      try {
        // create_subscription flow
        if (flow.type === 'create_subscription') {
          if (flow.step === 1) {
            let ph = body === 'yo' ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) { await message.reply('Ingresa un teléfono válido (8 dígitos CR o con código de país).'); return; }
            if (ph.length === 8) ph = (config.defaultCountryCode || '506') + ph;
            flow.data.phone = ph;
            flow.step = 2;
            await message.reply('Nombre del cliente:');
            return;
          }
          if (flow.step === 2) {
            const name = (body || '').trim();
            if (!name) { await message.reply('Nombre inválido, intenta de nuevo:'); return; }
            flow.data.name = name;
            flow.step = 3;
            await message.reply('Monto mensual en colones (solo números, ej: 8000):');
            return;
          }
          if (flow.step === 3) {
            const amount = parseAmountCRC(body);
            if (!amount || amount <= 0) { await message.reply('Monto inválido. Escribe solo números, ej: 8000'); return; }
            flow.data.amount = amount;
            flow.step = 4;
            await message.reply('Día de cobro (1-31):');
            return;
          }
          if (flow.step === 4) {
            const day = Number((body || '').replace(/[^0-9]/g, ''));
            if (!day || day < 1 || day > 31) { await message.reply('Día inválido. Debe ser entre 1 y 31.'); return; }
            flow.data.day_of_month = day;
            flow.step = 5;
            await message.reply('Hora de recordatorio HH:MM en 24h (Enter para 08:00):');
            return;
          }
          if (flow.step === 5) {
            const h = toHHMM(body, '08:00');
            if (!h) { await message.reply('Hora inválida. Usa formato HH:MM, ej: 08:00'); return; }
            flow.data.due_time = h;
            flow.step = 6;
            await message.reply('Concepto (opcional). Enter para usar "Suscripción de Servicios de Entretenimiento":');
            return;
          }
          if (flow.step === 6) {
            const concept = (body || '').trim();
            flow.data.concept = concept || 'Suscripción de Servicios de Entretenimiento';
            flow.step = 7;
            const d = flow.data;
            const resumen = [
              'Vas a crear:',
              `• Teléfono: ${d.phone}`,
              `• Nombre: ${d.name}`,
              `• Monto: ₡${Number(d.amount || 0).toLocaleString('es-CR')}`,
              `• Día: ${d.day_of_month}`,
              `• Hora: ${d.due_time}`,
              `• Concepto: ${d.concept}`,
              'Confirma con "si" o "no"'
            ].join('\n');
            await message.reply(resumen);
            return;
          }
          if (flow.step === 7) {
            const ans = (body || '').trim().toLowerCase();
            if (!['si', 'sí', 's', 'y', 'yes', 'confirmar'].includes(ans)) {
              if (['no', 'n', 'cancelar', 'cancel'].includes(ans)) {
                adminFlows.delete(chatId);
                await message.reply('Operación cancelada.');
                return;
              }
              await message.reply('Responde "si" para confirmar o "no" para cancelar.');
              return;
            }
            try {
              const d = flow.data;
              // Upsert customer and create subscription via API
              await apiClient.upsertCustomer({ phone: d.phone, name: d.name, active: 1 });
              await apiClient.createSubscription({ phone: d.phone, day_of_month: d.day_of_month, due_time: d.due_time, amount: d.amount, concept: d.concept, active: 1, name: d.name });
              // Intentar materializar pagos es responsabilidad del backend
              await message.reply(`✅ Cliente y suscripción creados para ${d.name} (${d.phone}).`);
            } catch (e: any) {
              await message.reply(`Error creando registro: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // delete_customer
        if (flow.type === 'delete_customer') {
          if (flow.step === 1) {
            let ph = body === 'yo' ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) { await message.reply('Ingresa un teléfono válido (8 dígitos CR o con código de país).'); return; }
            if (ph.length === 8) ph = (config.defaultCountryCode || '506') + ph;
            flow.data.phone = ph;
            // buscar cliente
            const cust = await apiClient.findCustomerByPhone(ph);
            if (!cust) { adminFlows.delete(chatId); await message.reply('No existe un cliente con ese teléfono.'); return; }
            flow.data.customer_id = cust.id;
            flow.step = 2;
            await message.reply(`Vas a ELIMINAR al cliente ${cust.name || cust.phone} y TODO su historial (pagos, recordatorios y suscripciones). Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
            return;
          }
          if (flow.step === 2) {
            const ans = (body || '').trim().toLowerCase();
            if (ans !== 'confirmar') { adminFlows.delete(chatId); await message.reply('Operación cancelada.'); return; }
            try {
              const res = await apiClient.deleteCustomer(flow.data.customer_id);
              await message.reply(`✅ Eliminado. Resultado: ${JSON.stringify(res)}`);
            } catch (e: any) {
              await message.reply(`Error al eliminar: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // delete_subscriptions_by_phone
        if (flow.type === 'delete_subscriptions_by_phone') {
          if (flow.step === 1) {
            let ph = body === 'yo' ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) { await message.reply('Ingresa un teléfono válido (8 dígitos CR o con código de país).'); return; }
            if (ph.length === 8) ph = (config.defaultCountryCode || '506') + ph;
            flow.data.phone = ph;
            flow.step = 2;
            await message.reply(`Vas a ELIMINAR las suscripciones de ${ph} y los pagos FUTUROS asociados. Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
            return;
          }
          if (flow.step === 2) {
            const ans = (body || '').trim().toLowerCase();
            if (ans !== 'confirmar') { adminFlows.delete(chatId); await message.reply('Operación cancelada.'); return; }
            try {
              const res = await apiClient.deleteSubscriptionsByPhone(flow.data.phone);
              await message.reply(`✅ Eliminadas suscripciones: ${JSON.stringify(res)}`);
            } catch (e: any) {
              await message.reply(`Error eliminando suscripciones: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // delete_transaction (confirm flow)
        if (flow.type === 'delete_transaction') {
          if (flow.step === 1) {
            const ans = (body || '').trim().toLowerCase();
            if (ans !== 'confirmar') { adminFlows.delete(chatId); await message.reply('❌ Operación cancelada.'); return; }
            try {
              await apiClient.deleteTransaction(flow.data.txnId);
              await message.reply(`✅ Transacción ${flow.data.txnId} eliminada correctamente`);
            } catch (e: any) {
              await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // view_details (from menu)
        if (flow.type === 'view_details') {
          if (flow.step === 1) {
            let ph = body === 'yo' ? fromNorm : normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) { await message.reply('Ingresa un teléfono válido (8 dígitos CR o con código de país).'); return; }
            if (ph.length === 8) ph = (config.defaultCountryCode || '506') + ph;
            try {
              // Find client first
              const client = await apiClient.findCustomerByPhone(ph);
              if (!client) {
                await message.reply(`❌ No encontré un cliente con ese teléfono.\n\nEscribe *adminmenu* para volver`);
                adminFlows.delete(chatId);
                return;
              }
              
              // Get contracts instead of subscriptions
              const contracts = await apiClient.listContracts({ client_id: client.id });
              const lines: string[] = [];
              lines.push(`📇 *Detalles de ${client.name || ph}*`);
              lines.push(`📱 ${client.phone}`);
              lines.push('');
              
              if (contracts && contracts.length) {
                lines.push(`💼 *Contratos*: ${contracts.length}`);
                contracts.slice(0, 5).forEach((c: any) => {
                  lines.push(`  • ${c.name || 'Sin nombre'}`);
                  lines.push(`    ₡${Number(c.amount || 0).toLocaleString('es-CR')} ${c.currency || 'CRC'}`);
                  lines.push(`    Ciclo: ${c.billing_cycle || 'N/A'}`);
                  if (c.next_due_date) lines.push(`    Próximo: ${c.next_due_date.split('T')[0]}`);
                });
                if (contracts.length > 5) lines.push(`  ...y ${contracts.length - 5} más`);
              } else {
                lines.push('💼 Sin contratos activos');
              }
              
              lines.push('');
              lines.push('Escribe *adminmenu* para volver al menú admin');
              await message.reply(lines.join('\n'));
            } catch (e: any) {
              logger.error({ e, phone: ph }, 'Error consultando detalles de cliente');
              await message.reply(`❌ Error consultando detalles: ${String(e && e.message ? e.message : e)}\n\nEscribe *adminmenu* para volver`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // generate_receipt (from menu)
        if (flow.type === 'generate_receipt') {
          if (flow.step === 1) {
            let ph = normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) { await message.reply('❌ Teléfono inválido. Usa 8 dígitos.'); return; }
            if (ph.length === 8) ph = (config.defaultCountryCode || '506') + ph;
            try {
              await message.reply('⏳ Generando comprobante...');
              const res = await apiClient.createReceiptForClient({ phone: ph });
              if (res && res.receipt_id) {
                await apiClient.sendReceipt(res.receipt_id);
                await message.reply(`✅ Comprobante generado y enviado a ${ph}\nID: ${res.receipt_id}\n\nEscribe *adminmenu* para volver`);
              } else {
                await message.reply('Error generando comprobante (respuesta inesperada del backend).');
              }
            } catch (e: any) {
              await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // send_receipt (from menu)
        if (flow.type === 'send_receipt') {
          if (flow.step === 1) {
            const receiptId = parseInt(body);
            if (isNaN(receiptId)) { await message.reply('❌ ID inválido. Ingresa solo números.'); return; }
            try {
              await apiClient.sendReceipt(receiptId);
              await message.reply(`✅ Comprobante ${receiptId} enviado (o solicitado envío).\n\nEscribe *adminmenu* para volver`);
            } catch (e: any) {
              await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // list_transactions (from menu)
        if (flow.type === 'list_transactions') {
          if (flow.step === 1) {
            let filterPhone: string | undefined;
            const txt = body.trim();
            if (txt && txt.length > 0) {
              filterPhone = normalizeCR(txt);
              if (filterPhone.length === 8) filterPhone = (config.defaultCountryCode || '506') + filterPhone;
            }
            try {
              const transactions = await apiClient.listTransactions(filterPhone, 20);
              if (!transactions || transactions.length === 0) {
                await message.reply(filterPhone ? `📭 No hay transacciones para ${filterPhone}` : '📭 No hay transacciones registradas');
                adminFlows.delete(chatId);
                return;
              }
              const lines: string[] = [];
              lines.push(filterPhone ? `💰 *Transacciones de ${filterPhone}* (${transactions.length})` : `💰 *Últimas transacciones* (${transactions.length})`, '');
              for (const [idx, t] of transactions.entries()) {
                lines.push(`*${idx + 1}.* ID: ${t.id}`);
                lines.push(`   📅 ${t.created_at || t.txn_date}`);
                lines.push(`   💵 ₡${Number(t.amount || 0).toLocaleString('es-CR')}`);
                lines.push(`   📱 ${t.phone || 'N/A'}`);
                lines.push(`   👤 ${t.client_name || '❓ Sin match'}`);
                if (t.motivo) lines.push(`   📝 ${t.motivo}`);
                if (t.ref) lines.push(`   🔖 Ref: ${String(t.ref).substring(0, 15)}...`);
                lines.push('');
              }
              lines.push('Escribe *adminmenu* para volver al menú admin');
              await message.reply(lines.join('\n'));
            } catch (e: any) {
              await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // delete_transaction_input (from menu - collect ID first)
        if (flow.type === 'delete_transaction_input') {
          if (flow.step === 1) {
            const txnId = parseInt(body);
            if (isNaN(txnId)) { await message.reply('❌ ID inválido. Ingresa solo números.'); return; }
            flow.data.txnId = txnId;
            flow.type = 'delete_transaction';
            flow.step = 1;
            await message.reply(`⚠️ ¿Eliminar transacción?\n\nID: ${txnId}\n\nResponde CONFIRMAR para continuar`);
            return;
          }
        }

        // create_payment (registrar pago manual)
        if (flow.type === 'create_payment') {
          if (flow.step === 1) {
            let ph = normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) { await message.reply('❌ Teléfono inválido. Usa 8 dígitos.'); return; }
            if (ph.length === 8) ph = (config.defaultCountryCode || '506') + ph;
            const client = await apiClient.findCustomerByPhone(ph);
            if (!client) {
              await message.reply(`❌ No encontré un cliente con ese teléfono.\n\nEscribe *adminmenu* para volver`);
              adminFlows.delete(chatId);
              return;
            }
            flow.data.client = client;
            flow.step = 2;
            await message.reply(`Cliente: *${client.name}*\n\nIngresa el monto del pago (solo números, ej: 7000):`);
            return;
          }
          if (flow.step === 2) {
            const amount = parseAmountCRC(body);
            if (!amount || amount <= 0) { await message.reply('❌ Monto inválido. Escribe solo números.'); return; }
            flow.data.amount = amount;
            flow.step = 3;
            await message.reply('Moneda (CRC o USD):');
            return;
          }
          if (flow.step === 3) {
            const currency = body.trim().toUpperCase();
            if (!['CRC', 'USD'].includes(currency)) { await message.reply('❌ Moneda inválida. Escribe CRC o USD.'); return; }
            flow.data.currency = currency;
            flow.step = 4;
            await message.reply('Canal de pago (ej: sinpe, transferencia, efectivo):');
            return;
          }
          if (flow.step === 4) {
            flow.data.channel = body.trim() || 'manual';
            flow.step = 5;
            await message.reply('Referencia (opcional, Enter para omitir):');
            return;
          }
          if (flow.step === 5) {
            flow.data.reference = body.trim() || null;
            flow.step = 6;
            const d = flow.data;
            const resumen = [
              '📝 *Resumen del Pago*',
              '',
              `👤 Cliente: ${d.client.name}`,
              `📱 Teléfono: ${d.client.phone}`,
              `💵 Monto: ₡${Number(d.amount).toLocaleString('es-CR')} ${d.currency}`,
              `📊 Canal: ${d.channel}`,
              `🔖 Referencia: ${d.reference || 'Sin referencia'}`,
              '',
              'Confirma con "si" o "no"'
            ].join('\n');
            await message.reply(resumen);
            return;
          }
          if (flow.step === 6) {
            const ans = body.trim().toLowerCase();
            if (!['si', 'sí', 's', 'y', 'yes'].includes(ans)) {
              if (['no', 'n', 'cancelar'].includes(ans)) {
                adminFlows.delete(chatId);
                await message.reply('❌ Registro de pago cancelado.\n\nEscribe *adminmenu* para volver');
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
                status: 'unverified',
                reference: d.reference,
                metadata: { registered_by: 'admin_via_bot', admin_phone: fromNorm }
              };
              const payment = await apiClient.createPayment(paymentPayload);
              await message.reply(`✅ Pago registrado correctamente.\n\nID: ${payment.id}\nEstado: ${payment.status}\n\nEscribe *adminmenu* para volver`);
            } catch (e: any) {
              logger.error({ e, data: flow.data }, 'Error creando pago manual');
              await message.reply(`❌ Error registrando pago: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // conciliate_payment
        if (flow.type === 'conciliate_payment') {
          if (flow.step === 1) {
            const paymentId = parseInt(body);
            if (isNaN(paymentId)) { await message.reply('❌ ID inválido. Ingresa solo números.'); return; }
            try {
              const payment = await apiClient.getPayment(paymentId);
              if (!payment) {
                await message.reply(`❌ No encontré el pago con ID ${paymentId}.\n\nEscribe *adminmenu* para volver`);
                adminFlows.delete(chatId);
                return;
              }
              flow.data.payment = payment;
              flow.step = 2;
              const lines = [
                '💰 *Pago a Conciliar*',
                '',
                `ID: ${payment.id}`,
                `Cliente: ${payment.client?.name || payment.client_id}`,
                `Monto: ₡${Number(payment.amount || 0).toLocaleString('es-CR')} ${payment.currency || 'CRC'}`,
                `Estado actual: ${payment.status}`,
                `Referencia: ${payment.reference || 'Sin referencia'}`,
                '',
                'Estado nuevo (verified, rejected, o Enter para verified):'
              ].join('\n');
              await message.reply(lines);
              return;
            } catch (e: any) {
              await message.reply(`❌ Error obteniendo pago: ${String(e && e.message ? e.message : e)}`);
              adminFlows.delete(chatId);
              return;
            }
          }
          if (flow.step === 2) {
            const newStatus = body.trim() || 'verified';
            if (!['verified', 'rejected', 'pending', 'unverified'].includes(newStatus)) {
              await message.reply('❌ Estado inválido. Usa: verified, rejected, pending o unverified');
              return;
            }
            flow.data.newStatus = newStatus;
            flow.step = 3;
            await message.reply('Notas de conciliación (opcional, Enter para omitir):');
            return;
          }
          if (flow.step === 3) {
            const notes = body.trim() || null;
            try {
              const d = flow.data;
              // Update payment status
              await apiClient.updatePayment(d.payment.id, { status: d.newStatus });
              
              // Create conciliation record
              const conciliationPayload = {
                payment_id: d.payment.id,
                status: d.newStatus,
                notes: notes,
                conciliated_by: fromNorm,
                conciliated_at: new Date().toISOString()
              };
              await apiClient.createConciliation(conciliationPayload);
              
              await message.reply(`✅ Pago conciliado correctamente.\n\nID: ${d.payment.id}\nNuevo estado: ${d.newStatus}\n\nEscribe *adminmenu* para volver`);
            } catch (e: any) {
              logger.error({ e, paymentId: flow.data.payment?.id }, 'Error conciliando pago');
              await message.reply(`❌ Error conciliando pago: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

        // delete_contracts_by_phone
        if (flow.type === 'delete_contracts_by_phone') {
          if (flow.step === 1) {
            let ph = normalizeCR(body);
            if (!ph || !/^\d{8,15}$/.test(ph)) { await message.reply('❌ Teléfono inválido.'); return; }
            if (ph.length === 8) ph = (config.defaultCountryCode || '506') + ph;
            flow.data.phone = ph;
            flow.step = 2;
            await message.reply(`⚠️ Vas a ELIMINAR los contratos de ${ph} y los pagos FUTUROS asociados.\n\nEscribe CONFIRMAR para continuar o CANCELAR para abortar.`);
            return;
          }
          if (flow.step === 2) {
            const ans = body.trim().toLowerCase();
            if (ans !== 'confirmar') {
              adminFlows.delete(chatId);
              await message.reply('❌ Operación cancelada.');
              return;
            }
            try {
              const result = await apiClient.deleteContractsByPhone(flow.data.phone);
              await message.reply(`✅ ${result.deleted} contrato(s) eliminado(s) correctamente.`);
            } catch (e: any) {
              await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`);
            }
            adminFlows.delete(chatId);
            return;
          }
        }

      } catch (e: any) {
        adminFlows.delete(chatId);
        await message.reply(`Error en asistente: ${String(e && e.message ? e.message : e)}`);
        return;
      }
    }

    // If user confirms an unsolicited media (pendingConfirmReceipt) with 'si', process it as a receipt
    if (lc === 'si' && pendingConfirmReceipt.has(chatId)) {
      const pending = pendingConfirmReceipt.get(chatId)!;
      try {
        const saved = await saveReceipt(chatId, pending.filename || `receipt-${Date.now()}.bin`, pending.data, pending.mimetype, pending.text);
        let backendPaymentId: number | null = null;
        try {
          // Ensure client exists
          let client: any = null;
          try { client = await apiClient.findCustomerByPhone(fromNorm); } catch (e) { /* ignore */ }
          if (!client) {
            try { client = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser }); } catch (e) { /* ignore */ }
          }

          const paymentPayload: any = {
            client_id: client && client.id ? client.id : undefined,
            amount: 0,
            currency: 'CRC',
            channel: 'whatsapp',
            status: 'unverified',
            reference: `bot:${saved.id}`,
            metadata: { local_receipt_id: saved.id }
          };

          const pRes = await apiClient.createPayment(paymentPayload);
          if (pRes && (pRes.id || pRes.payment_id)) {
            backendPaymentId = pRes.id ?? pRes.payment_id;
            await updateReceiptEntry(saved.id, { backend_payment_id: backendPaymentId, status: 'created' });
          } else {
            await updateReceiptEntry(saved.id, { status: 'created' });
          }

          if (backendPaymentId && pending.mimetype === 'application/pdf') {
            try {
              const fileBuf = Buffer.from(pending.data, 'base64');
              const fdMod2 = await import('form-data');
              const FormDataCtor2: any = fdMod2 && (fdMod2 as any).default ? (fdMod2 as any).default : fdMod2;
              const form2 = new FormDataCtor2();
              form2.append('file', fileBuf, { filename: pending.filename, contentType: pending.mimetype });
              form2.append('received_at', new Date().toISOString());
              form2.append('metadata', JSON.stringify([]));
              const headers2 = Object.assign({ Authorization: `Bearer ${config.apiToken}`, Accept: 'application/json' }, form2.getHeaders());
              await axios.post(`${config.apiBaseUrl.replace(/\/$/, '')}/payments/${backendPaymentId}/receipts`, form2, { headers: headers2 });
            } catch (e: any) {
              logger.debug({ e, backendPaymentId, saved }, 'No se pudo adjuntar PDF al payment (confirmación)');
            }
          }
        } catch (e: any) {
          logger.warn({ e, chatId }, 'No se pudo crear payment placeholder en backend (confirmación)');
        }
        // After saving receipt and creating backend payment placeholder, ask client cuántos meses pagó
        awaitingMonths.set(chatId, { receiptId: saved.id, backendPaymentId });
        await message.reply('Gracias. ¿Cuántos meses estás pagando con este comprobante? Responde con un número, por ejemplo: 1');

        // notify admin
        try {
          const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : '50672140974';
          const adminChatId = normalizeToChatId(adminPhone);
          if (adminChatId) {
            const notifyText = backendPaymentId
              ? `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id} | backend payment: ${backendPaymentId}`
              : `Nuevo comprobante de ${fromUser} (${chatId}). ID interno: ${saved.id}`;
            await whatsappClient.sendText(adminChatId, notifyText);
            await whatsappClient.sendMedia(adminChatId, pending.data, pending.mimetype, pending.filename);
            logger.info({ adminChatId, chatId, file: saved.filepath, backendPaymentId }, 'Enviado comprobante al admin (confirmación)');
          }
        } catch (e: any) {
          logger.warn({ e }, 'Fallo notificando admin sobre comprobante recibido (confirmación)');
        }

        pendingConfirmReceipt.delete(chatId);
        return;
      } catch (e: any) {
        pendingConfirmReceipt.delete(chatId);
        logger.error({ e }, 'Error procesando comprobante confirmado');
        await message.reply('❌ Ocurrió un error procesando el comprobante. Intenta de nuevo o escribe "salir" para cancelar.');
        return;
      }
    }

    // If user cancels an unsolicited media
    if (lc === 'no' && pendingConfirmReceipt.has(chatId)) {
      pendingConfirmReceipt.delete(chatId);
      await message.reply('He cancelado el registro del archivo. Si necesitas enviar el comprobante usa la opción 6 del menú.');
      return;
    }

    // If we're awaiting number of months for a previously uploaded receipt
  if (awaitingMonths.has(chatId)) {
  const payload = awaitingMonths.get(chatId)!;
  const asNum = Number(body.replace(/[^0-9]/g, ''));
      if (!Number.isNaN(asNum) && asNum > 0) {
        // try to inform backend about months / create payments for those months
        let monthlyAmount: number | null = null;
        try {
          // Try to fetch subscription info to compute total amount
          try {
            // Try to find client and contract to infer monthly amount
            let clientForAmount: any = null;
            try { clientForAmount = await apiClient.findCustomerByPhone(fromNorm); } catch (e) { /* ignore */ }
            if (!clientForAmount) {
              try { clientForAmount = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser }); } catch (e) { /* ignore */ }
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
          } catch (e: any) {
            logger.debug({ e, chatId }, 'No se pudo obtener contrato para calcular monto mensual');
          }

          // Resolve or create client in backend
          let client: any = null;
          try {
            client = await apiClient.findCustomerByPhone(fromNorm);
          } catch (e: any) {
            logger.debug({ e, fromNorm }, 'findCustomerByPhone fallo');
          }
          if (!client) {
            try {
              client = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser });
            } catch (e: any) {
              logger.warn({ e, fromNorm }, 'No se pudo upsertCustomer, continuando sin cliente backend');
            }
          }

          // Compute amount
          const amount = monthlyAmount ? monthlyAmount * asNum : 0;

          // If we previously created a backend payment placeholder, update it instead of creating a new payment
          let appliedResult: any = null;
          if (payload.backendPaymentId) {
            try {
              const updatePayload: any = {
                amount: amount,
                currency: 'CRC',
                metadata: Object.assign({}, { months: asNum, backend_receipt_id: payload.backendPaymentId, local_receipt_id: payload.receiptId })
              };
              appliedResult = await apiClient.updatePayment(payload.backendPaymentId, updatePayload);
              await updateReceiptEntry(payload.receiptId, { months: asNum, status: 'applied', backend_apply_result: appliedResult, backend_payment_id: appliedResult && (appliedResult.id || appliedResult.payment_id) ? (appliedResult.id ?? appliedResult.payment_id) : payload.backendPaymentId, monthly_amount: monthlyAmount, total_amount: amount });
            } catch (e: any) {
              throw e;
            }
          } else {
            const paymentPayload: any = {
              client_id: client && client.id ? client.id : undefined,
              amount: amount,
              currency: 'CRC',
              channel: 'whatsapp',
              status: 'unverified',
              reference: payload.backendReceiptId ? `receipt:${payload.backendReceiptId}` : `bot:${payload.receiptId}`,
              metadata: { months: asNum, backend_receipt_id: payload.backendReceiptId }
            };
            const res = await apiClient.createPayment(paymentPayload);
            appliedResult = res;
            await updateReceiptEntry(payload.receiptId, { months: asNum, status: 'applied', backend_apply_result: res, backend_payment_id: res && (res.id || res.payment_id) ? (res.id ?? res.payment_id) : null, monthly_amount: monthlyAmount, total_amount: amount });
          }

          // notify admin with details
          try {
            const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : '50672140974';
            const adminChatId = normalizeToChatId(adminPhone);
            if (adminChatId) {
              const txt = `El cliente ${fromUser} (${chatId}) indicó que paga ${asNum} mes(es) para el comprobante ${payload.receiptId}` + (payload.backendReceiptId ? ` (backend receipt ${payload.backendReceiptId})` : '');
              await whatsappClient.sendText(adminChatId, txt);
              logger.info({ adminChatId, chatId, months: asNum, receiptId: payload.receiptId }, 'Admin notificado: meses aplicados al comprobante');
            }
          } catch (e: any) {
            logger.warn({ e }, 'No se pudo notificar al admin sobre meses aplicados');
          }

          awaitingMonths.delete(chatId);
          await message.reply(`✅ Gracias. He registrado que pagas ${asNum} mes(es). Un asesor validará y conciliará el pago.`);
          return;
        } catch (e: any) {
          // Log detailed error info (include axios response payload when available)
          const errInfo: any = { message: String(e && e.message ? e.message : e) };
          try {
            if (e && e.response) {
              errInfo.status = e.response.status;
              errInfo.data = e.response.data;
            }
            if (e && e.code) errInfo.code = e.code;
          } catch (ee) {
            // ignore
          }
          logger.warn({ errInfo, chatId, payload: { phone: fromNorm, months: asNum, backendReceiptId: payload.backendReceiptId } }, 'Error informando al backend sobre meses');

          // Persist error details in the receipt index so admins can inspect later
          try {
            await updateReceiptEntry(payload.receiptId, { status: 'apply_failed', apply_error: errInfo, attempted_months: asNum });
          } catch (ee: any) {
            logger.debug({ ee }, 'No se pudo actualizar índice con error de aplicación de meses');
          }

          // Inform the user with a friendlier message and inform that we'll retry once automatically
          await message.reply('❌ No pude registrar el número de meses en este momento. Intentaré de nuevo automáticamente en unos minutos y, si sigue fallando, un asesor te ayudará. Mientras tanto puedes escribir "salir" para cancelar.');

          // schedule a single retry in the background (non-blocking)
          try {
            const retryDelayMs = 60 * 1000; // 1 minute
            setTimeout(async () => {
              try {
                // Retry creating payment in backend
                let clientRetry: any = null;
                try { clientRetry = await apiClient.findCustomerByPhone(fromNorm); } catch (e) { /* ignore */ }
                if (!clientRetry) {
                  try { clientRetry = await apiClient.upsertCustomer({ phone: fromNorm, name: fromUser }); } catch (e) { /* ignore */ }
                }
                const amountRetry = monthlyAmount ? monthlyAmount * asNum : 0;
                const paymentPayloadRetry: any = {
                  client_id: clientRetry && clientRetry.id ? clientRetry.id : undefined,
                  amount: amountRetry,
                  currency: 'CRC',
                  channel: 'whatsapp',
                  status: 'unverified',
                  reference: payload.backendReceiptId ? `receipt:${payload.backendReceiptId}` : `bot:${payload.receiptId}`,
                  metadata: { months: asNum, backend_receipt_id: payload.backendReceiptId }
                };
                const retryRes = await apiClient.createPayment(paymentPayloadRetry);
                await updateReceiptEntry(payload.receiptId, { status: 'applied', backend_apply_result: retryRes, backend_payment_id: retryRes && (retryRes.id || retryRes.payment_id) ? (retryRes.id ?? retryRes.payment_id) : null, monthly_amount: monthlyAmount, total_amount: amountRetry });
                // notify admin about successful retry
                try {
                  const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : '50672140974';
                  const adminChatId = normalizeToChatId(adminPhone);
                  if (adminChatId) {
                    const txt = `Reintento exitoso: aplicados ${asNum} mes(es) para el comprobante ${payload.receiptId} del cliente ${fromUser} (${chatId}).`;
                    await whatsappClient.sendText(adminChatId, txt);
                  }
                } catch (e2: any) {
                  logger.debug({ e2 }, 'No se pudo notificar al admin tras reintento exitoso');
                }
              } catch (e2: any) {
                logger.warn({ e2, chatId }, 'Reintento fallido aplicando meses');
                try { await updateReceiptEntry(payload.receiptId, { status: 'apply_failed', apply_error_retry: String(e2 && e2.message ? e2.message : e2) }); } catch (ee) { /* ignore */ }
              }
            }, retryDelayMs);
          } catch (ee) {
            logger.debug({ ee }, 'No se pudo programar reintento');
          }

          return;
        }
      } else {
        await message.reply('Por favor responde con un número entero de meses (ej: 1). Escribe "salir" para cancelar.');
        return;
      }
    }

    // Admin menu system: if admin types 'adminmenu' or 'admin', show interactive admin menu
    if (isAdminUser && (lc === 'adminmenu' || lc === 'admin' || lc === 'menuadmin')) {
      const adminMenuText = [
        '🔧 *MENÚ ADMIN* 🔧',
        '',
        'Envía el número de la opción deseada:',
        '',
        '1️⃣ Crear cliente + contrato',
        '2️⃣ Ver detalles de cliente',
        '3️⃣ Ver mis detalles',
        '4️⃣ Listar comprobantes del día',
        '5️⃣ Generar comprobante para cliente',
        '6️⃣ Enviar comprobante por ID',
        '7️⃣ Listar transacciones',
        '8️⃣ Ejecutar scheduler',
        '',
        '💰 *PAGOS Y CONCILIACIÓN*',
        '9️⃣ Registrar pago manual',
        '🔟 Conciliar pago',
        '1️⃣1️⃣ Listar pagos pendientes',
        '',
        '🗑️ *ELIMINACIÓN*',
        '1️⃣2️⃣ Eliminar cliente',
        '1️⃣3️⃣ Eliminar contrato',
        '1️⃣4️⃣ Eliminar transacción',
        '',
        '1️⃣5️⃣ Estado del bot',
        '',
        '📋 Escribe *help para ver comandos de texto',
        '❌ Escribe salir para cancelar',
      ].join('\n');
      await message.reply(adminMenuText);
      menuShown.set(chatId, true);
      // Store a special marker so we know this is an admin menu session
      lastMenuItems.set(chatId, [{ type: 'admin_menu' }]);
      return;
    }

    // If admin menu is active, process numeric selections
    if (isAdminUser && menuShown.get(chatId) && lastMenuItems.get(chatId)?.[0]?.type === 'admin_menu') {
      const selection = body.trim();
      
      if (selection === '1') {
        // Crear cliente + suscripción
        adminFlows.set(chatId, { type: 'create_subscription', step: 1, data: {} });
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Asistente: Crear cliente + suscripción.\nTeléfono del cliente (8 dígitos o con código de país). Escribe "yo" para usar tu número.');
        return;
      }
      
      if (selection === '2') {
        // Ver detalles de cliente
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el teléfono del cliente (8 dígitos) o escribe "yo" para ver tus detalles:');
        adminFlows.set(chatId, { type: 'view_details', step: 1, data: {} });
        return;
      }
      
      if (selection === '3') {
        // Ver mis detalles (ejecutar inmediatamente)
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const phone = fromUser;
          const client = await apiClient.findCustomerByPhone(phone);
          
          if (!client) {
            await message.reply(`📇 *Tus Detalles*\n\n❌ No estás registrado como cliente.\n\nEscribe *adminmenu* para volver`);
            return;
          }
          
          const contracts = await apiClient.listContracts({ client_id: client.id });
          const lines: string[] = [];
          lines.push(`📇 *Tus Detalles*`);
          lines.push(`👤 ${client.name || phone}`);
          lines.push(`📱 ${client.phone}`);
          lines.push('');
          
          if (contracts && contracts.length) {
            lines.push(`💼 *Contratos*: ${contracts.length}`);
            contracts.slice(0, 3).forEach((c: any) => {
              lines.push(`  • ${c.name || 'Sin nombre'}`);
              lines.push(`    ₡${Number(c.amount || 0).toLocaleString('es-CR')} ${c.currency || 'CRC'}`);
              lines.push(`    Ciclo: ${c.billing_cycle || 'N/A'}`);
              if (c.next_due_date) lines.push(`    Próximo: ${c.next_due_date.split('T')[0]}`);
            });
            if (contracts.length > 3) lines.push(`  ...y ${contracts.length - 3} más`);
          } else {
            lines.push('💼 Sin contratos activos');
          }
          
          lines.push('');
          lines.push('Escribe *adminmenu* para volver al menú admin');
          await message.reply(lines.join('\n'));
        } catch (e: any) {
          logger.error({ e, phone: fromUser }, 'Error consultando mis detalles');
          await message.reply(`❌ Error consultando detalles: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      
      if (selection === '4') {
        // Listar comprobantes del día
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const today = new Date().toISOString().split('T')[0];
          const receipts = await apiClient.listReceiptsByDate(today);
          if (!receipts || receipts.length === 0) {
            await message.reply('📄 No hay comprobantes generados hoy.\n\nEscribe *adminmenu* para volver');
            return;
          }
          const lines: string[] = [];
          lines.push(`📄 *Comprobantes de hoy* (${receipts.length})`, '');
          receipts.forEach((r: any, idx: number) => {
            const status = r.sent_at ? '✅ Enviado' : '📤 Pendiente';
            const time = new Date(r.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
            lines.push(`*${idx + 1}.* ID: ${r.id} | ${status}`);
            lines.push(`   Cliente: ${r.customer_name || r.customer_phone}`);
            lines.push(`   Hora: ${time}`);
            lines.push('');
          });
          lines.push('Escribe *adminmenu* para volver al menú admin');
          await message.reply(lines.join('\n'));
        } catch (e: any) {
          await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      
      if (selection === '5') {
        // Generar comprobante para cliente
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el teléfono del cliente para generar el comprobante (8 dígitos):');
        adminFlows.set(chatId, { type: 'generate_receipt', step: 1, data: {} });
        return;
      }
      
      if (selection === '6') {
        // Enviar comprobante por ID
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el ID del comprobante a enviar:');
        adminFlows.set(chatId, { type: 'send_receipt', step: 1, data: {} });
        return;
      }
      
      if (selection === '7') {
        // Listar transacciones
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el teléfono del cliente para filtrar transacciones, o presiona Enter para ver todas (últimas 20):');
        adminFlows.set(chatId, { type: 'list_transactions', step: 1, data: {} });
        return;
      }
      
      if (selection === '8') {
        // Ejecutar scheduler
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          await processor.runBatch();
          await message.reply('✅ Scheduler ejecutado (runBatch).\n\nEscribe *adminmenu* para volver');
        } catch (e) {
          await message.reply('❌ Error ejecutando scheduler: ' + String(e));
        }
        return;
      }
      
      if (selection === '9') {
        // Registrar pago manual
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('📝 *Registrar Pago Manual*\n\nIngresa el teléfono del cliente (8 dígitos):');
        adminFlows.set(chatId, { type: 'create_payment', step: 1, data: {} });
        return;
      }
      
      if (selection === '10') {
        // Conciliar pago
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('🔄 *Conciliar Pago*\n\nIngresa el ID del pago a conciliar:');
        adminFlows.set(chatId, { type: 'conciliate_payment', step: 1, data: {} });
        return;
      }
      
      if (selection === '11') {
        // Listar pagos pendientes
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const payments = await apiClient.listPayments({ status: ['pending', 'unverified'], per_page: 20 });
          if (!payments || payments.length === 0) {
            await message.reply('📭 No hay pagos pendientes.\n\nEscribe *adminmenu* para volver');
            return;
          }
          const lines: string[] = [];
          lines.push(`💰 *Pagos Pendientes* (${payments.length})`, '');
          for (const [idx, p] of payments.entries()) {
            lines.push(`*${idx + 1}.* ID: ${p.id}`);
            lines.push(`   💵 ₡${Number(p.amount || 0).toLocaleString('es-CR')} ${p.currency || 'CRC'}`);
            lines.push(`   👤 ${p.client?.name || p.client_id || 'Sin cliente'}`);
            lines.push(`   📋 Estado: ${p.status}`);
            if (p.reference) lines.push(`   🔖 Ref: ${p.reference}`);
            lines.push('');
          }
          lines.push('Escribe *adminmenu* para volver');
          await message.reply(lines.join('\n'));
        } catch (e: any) {
          await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      
      if (selection === '12') {
        // Eliminar cliente
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el teléfono del cliente a ELIMINAR (8 dígitos o con código de país):');
        adminFlows.set(chatId, { type: 'delete_customer', step: 1, data: {} });
        return;
      }
      
      if (selection === '13') {
        // Eliminar contrato
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el teléfono del cliente para eliminar sus contratos (8 dígitos):');
        adminFlows.set(chatId, { type: 'delete_contracts_by_phone', step: 1, data: {} });
        return;
      }
      
      if (selection === '14') {
        // Eliminar transacción
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        await message.reply('Ingresa el ID de la transacción a eliminar:');
        adminFlows.set(chatId, { type: 'delete_transaction_input', step: 1, data: {} });
        return;
      }
      
      if (selection === '15') {
        // Estado del bot
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        try {
          const uptime = process.uptime();
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);
          const statusText = [
            '🤖 *Estado del Bot*',
            '',
            `⏱️ Uptime: ${hours}h ${minutes}m`,
            `📊 Memoria: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            `🌐 Node: ${process.version}`,
            `⚙️ Timezone: ${TIMEZONE}`,
            `🕐 Horario: ${formatBusinessHours()}`,
            '',
            'Escribe *adminmenu* para volver'
          ].join('\n');
          await message.reply(statusText);
        } catch (e: any) {
          await message.reply(`Error obteniendo estado: ${String(e && e.message ? e.message : e)}`);
        }
        return;
      }
      
      // Opción no reconocida en menú admin
      await message.reply('Opción no reconocida. Escribe *adminmenu* para ver el menú o *help para ver comandos de texto.');
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      return;
    }

    // Procesar comandos admin simples (prefijo '*')
    if (isAdminUser && lc.startsWith('*')) {
      const cmd = lc.slice(1).trim();
      if (cmd === 'help' || cmd === 'ayuda') {
        const helpText = [
          '🔧 *Comandos admin disponibles:*',
          '',
          '*adminmenu* — menú interactivo admin',
          '*ping* — healthcheck',
          '*status* — estado del bot',
          '*cancelar* — cancelar asistente admin',
          '*runscheduler* — ejecutar procesamiento de recordatorios (batch)',
          '*nuevo* — crear cliente + suscripción (asistente)',
          '*detalles <telefono>* — ver cliente y sus suscripciones',
          '*yo* — ver mis propios detalles',
          '*comprobantes* — listar comprobantes del día',
          '*comprobante <telefono>* — generar y enviar comprobante',
          '*enviar <id>* — enviar comprobante por ID',
          '*transacciones* — listar transacciones',
          '*eliminar cliente <telefono>* — eliminar cliente',
          '*eliminar suscripcion <telefono>* — eliminar suscripciones por teléfono',
          '*eliminar trans <id>* — eliminar transacción por ID',
        ].join('\n');
        await message.reply(helpText);
        return;
      }
      if (cmd === 'cancelar' || cmd === 'cancel') {
        if (adminFlows.has(chatId)) {
          adminFlows.delete(chatId);
          await message.reply('Asistente admin cancelado.');
        } else {
          await message.reply('No hay asistente admin en curso.');
        }
        return;
      }
      if (cmd === 'ping') { await message.reply('pong'); return; }
      if (cmd === 'runscheduler' || cmd === 'run') { try { await processor.runBatch(); await message.reply('Scheduler ejecutado (runBatch).'); } catch (e) { await message.reply('Error ejecutando scheduler: ' + String(e)); } return; }

      // *nuevo -> iniciar asistente de creación
      if (cmd === 'nuevo' || cmd === 'crear' || cmd === 'add') {
        adminFlows.set(chatId, { type: 'create_subscription', step: 1, data: {} });
        await message.reply('Asistente: Crear cliente + suscripción.\nTeléfono del cliente (8 dígitos o con código de país). Escribe "yo" para usar tu número.');
        return;
      }

      // eliminar cliente
      if (cmd.startsWith('eliminar cliente')) {
        const parts = cmd.split(/\s+/);
        const p0 = parts[2] ? normalizeCR(parts[2]) : '';
        adminFlows.set(chatId, { type: 'delete_customer', step: 1, data: {} });
        const p = p0 && /^\d{8,15}$/.test(p0) ? (p0.length === 8 ? (config.defaultCountryCode || '506') + p0 : p0) : '';
        if (!p) { await message.reply('Ingresa el teléfono del cliente a ELIMINAR (8 dígitos o con código de país). Puedes escribir "yo".'); return; }
        try {
          const flow = adminFlows.get(chatId);
          flow.data.phone = p;
          const cust = await apiClient.findCustomerByPhone(p);
          if (!cust) { adminFlows.delete(chatId); await message.reply('No existe un cliente con ese teléfono.'); return; }
          flow.data.customer_id = cust.id;
          flow.step = 2;
          await message.reply(`Vas a ELIMINAR al cliente ${cust.name || cust.phone} y TODO su historial (pagos, recordatorios y suscripciones). Escribe CONFIRMAR para continuar o CANCELAR para abortar.`);
        } catch (e: any) { adminFlows.delete(chatId); await message.reply(`Error preparando eliminación: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      // eliminar suscripcion
      if (cmd.startsWith('eliminar suscripcion') || cmd.startsWith('eliminar suscripción')) {
        const parts = cmd.split(/\s+/);
        const p0 = parts[2] ? normalizeCR(parts[2]) : '';
        adminFlows.set(chatId, { type: 'delete_subscriptions_by_phone', step: 1, data: {} });
        const p = p0 && /^\d{8,15}$/.test(p0) ? (p0.length === 8 ? (config.defaultCountryCode || '506') + p0 : p0) : '';
        if (!p) { await message.reply('Ingresa el teléfono del cliente para eliminar sus suscripciones (8 dígitos o con código de país). Puedes escribir "yo".'); return; }
        try { const flow = adminFlows.get(chatId); flow.data.phone = p; flow.step = 2; await message.reply(`Vas a ELIMINAR las suscripciones de ${p} y los pagos FUTUROS asociados. Escribe CONFIRMAR para continuar o CANCELAR para abortar.`); } catch (e: any) { adminFlows.delete(chatId); await message.reply(`Error preparando eliminación: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      // detalles <phone>
      if (cmd === 'yo') {
        // atajo para ver detalles del propio admin
        try {
          const phone = fromUser;
          const client = await apiClient.findCustomerByPhone(phone);
          
          if (!client) {
            await message.reply(`📇 *Tus Detalles*\n\n❌ No estás registrado como cliente.`);
            return;
          }
          
          const contracts = await apiClient.listContracts({ client_id: client.id });
          const lines: string[] = [];
          lines.push(`📇 *Detalles de ${client.name || phone}*`);
          lines.push(`📱 ${client.phone}`);
          lines.push('');
          
          if (contracts && contracts.length) {
            lines.push(`💼 *Contratos*: ${contracts.length}`);
            contracts.slice(0, 3).forEach((c: any) => {
              lines.push(`  • ${c.name || 'Sin nombre'}`);
              lines.push(`    ₡${Number(c.amount || 0).toLocaleString('es-CR')} ${c.currency || 'CRC'}`);
              if (c.next_due_date) lines.push(`    Próximo: ${c.next_due_date.split('T')[0]}`);
            });
            if (contracts.length > 3) lines.push(`  ...y ${contracts.length - 3} más`);
          } else {
            lines.push('💼 Sin contratos activos');
          }
          
          await message.reply(lines.join('\n'));
        } catch (e: any) { 
          logger.error({ e, phone: fromUser }, 'Error en comando *yo');
          await message.reply(`Error consultando detalles: ${String(e && e.message ? e.message : e)}`); 
        }
        return;
      }

      if (cmd.startsWith('detalles')) {
        try {
          const parts = cmd.split(/\s+/);
          let phone = parts[1] ? parts[1].replace(/[^0-9]/g, '') : '';
          if (!phone) phone = fromUser;
          
          const client = await apiClient.findCustomerByPhone(phone);
          if (!client) {
            await message.reply(`❌ No encontré un cliente con ese teléfono: ${phone}`);
            return;
          }
          
          const contracts = await apiClient.listContracts({ client_id: client.id });
          const lines: string[] = [];
          lines.push(`📇 *Detalles de ${client.name || phone}*`);
          lines.push(`📱 ${client.phone}`);
          lines.push('');
          
          if (contracts && contracts.length) {
            lines.push(`💼 *Contratos*: ${contracts.length}`);
            contracts.slice(0, 3).forEach((c: any) => {
              lines.push(`  • ${c.name || 'Sin nombre'}`);
              lines.push(`    ₡${Number(c.amount || 0).toLocaleString('es-CR')} ${c.currency || 'CRC'}`);
              if (c.next_due_date) lines.push(`    Próximo: ${c.next_due_date.split('T')[0]}`);
            });
            if (contracts.length > 3) lines.push(`  ...y ${contracts.length - 3} más`);
          } else {
            lines.push('💼 Sin contratos activos');
          }
          
          await message.reply(lines.join('\n'));
        } catch (e: any) { 
          logger.error({ e, phone: cmd.split(/\s+/)[1] }, 'Error en comando *detalles');
          await message.reply(`Error consultando detalles: ${String(e && e.message ? e.message : e)}`); 
        }
        return;
      }

      // comprobantes
      if (cmd === 'comprobantes') {
        try {
          const today = new Date().toISOString().split('T')[0];
          const receipts = await apiClient.listReceiptsByDate(today);
          if (!receipts || receipts.length === 0) { await message.reply('📄 No hay comprobantes generados hoy.'); return; }
          const lines: string[] = [];
          lines.push(`📄 *Comprobantes de hoy (${receipts.length})*`, '');
          receipts.forEach((r: any, idx: number) => {
            const status = r.sent_at ? '✅ Enviado' : '📤 Pendiente';
            const time = new Date(r.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
            lines.push(`*${idx + 1}.* ID: ${r.id} | ${status}`);
            lines.push(`   Cliente: ${r.customer_name || r.customer_phone}`);
            lines.push(`   Hora: ${time}`);
            lines.push(`   Para enviar: *enviar ${r.id}*`);
            lines.push('');
          });
          await message.reply(lines.join('\n'));
        } catch (e: any) { await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      if (cmd.startsWith('comprobante ')) {
        try {
          const parts = cmd.split(/\s+/);
          let phone = parts[1] ? normalizeCR(parts[1]) : '';
          if (!phone || !/^\d{8,15}$/.test(phone)) { await message.reply('❌ Teléfono inválido. Usa: *comprobante 87654321*'); return; }
          if (phone.length === 8) phone = (config.defaultCountryCode || '506') + phone;
          await message.reply('⏳ Generando comprobante...');
          const res = await apiClient.createReceiptForClient({ phone });
          if (res && res.receipt_id) {
            await apiClient.sendReceipt(res.receipt_id);
            await message.reply(`✅ Comprobante generado y enviado a ${phone}\nID: ${res.receipt_id}`);
          } else {
            await message.reply('Error generando comprobante (respuesta inesperada del backend).');
          }
        } catch (e: any) { await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      if (cmd.startsWith('enviar ')) {
        try {
          const parts = cmd.split(/\s+/);
          const receiptId = parseInt(parts[1]);
          if (isNaN(receiptId)) { await message.reply('❌ ID inválido. Usa: *enviar 123*'); return; }
          await apiClient.sendReceipt(receiptId);
          await message.reply(`✅ Comprobante ${receiptId} enviado (o solicitado envío).`);
        } catch (e: any) { await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      // transacciones
      if (cmd === 'transacciones' || cmd === 'trans' || cmd.startsWith('transacciones ') || cmd.startsWith('trans ')) {
        try {
          const parts = cmd.split(/\s+/);
          let filterPhone: string | undefined;
          if (parts.length > 1) {
            filterPhone = normalizeCR(parts[1]);
            if (filterPhone.length === 8) filterPhone = (config.defaultCountryCode || '506') + filterPhone;
          }
          const transactions = await apiClient.listTransactions(filterPhone, 20);
          if (!transactions || transactions.length === 0) { await message.reply(filterPhone ? `📭 No hay transacciones para ${filterPhone}` : '📭 No hay transacciones registradas'); return; }
          const lines: string[] = [];
          lines.push(filterPhone ? `💰 *Transacciones de ${filterPhone}* (${transactions.length})` : `💰 *Últimas transacciones* (${transactions.length})`, '');
          for (const [idx, t] of transactions.entries()) {
            lines.push(`*${idx + 1}.* ID: ${t.id}`);
            lines.push(`   📅 ${t.created_at || t.txn_date}`);
            lines.push(`   💵 ₡${Number(t.amount || 0).toLocaleString('es-CR')}`);
            lines.push(`   📱 ${t.phone || 'N/A'}`);
            lines.push(`   👤 ${t.client_name || '❓ Sin match'}`);
            if (t.motivo) lines.push(`   📝 ${t.motivo}`);
            if (t.ref) lines.push(`   🔖 Ref: ${String(t.ref).substring(0, 15)}...`);
            lines.push('');
          }
          await message.reply(lines.join('\n'));
        } catch (e: any) { await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      if (cmd.startsWith('eliminar trans ')) {
        try {
          const parts = cmd.split(/\s+/);
          const txnId = parseInt(parts[2]);
          if (isNaN(txnId)) { await message.reply('❌ ID inválido. Usa: *eliminar trans 123*'); return; }
          // preguntar confirmación
          await message.reply(`⚠️ ¿Eliminar transacción?\n\nID: ${txnId}\n\nResponde CONFIRMAR para continuar`);
          adminFlows.set(chatId, { type: 'delete_transaction', step: 1, data: { txnId } });
        } catch (e: any) { await message.reply(`❌ Error: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      // Si hay prefijo * pero no coincide, responder ayuda
      await message.reply('Comando admin no reconocido. Escribe *help para ver los comandos disponibles.');
      return;
    }

    // simple health check
    if (lc === 'ping') {
      await message.reply('pong');
      return;
    }

    // Handle explicit exit command: clear any pending menu or agent mode
    if (lc === 'salir' || lc === 'exit') {
      const wasAgent = !!agentMode.get(chatId);
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      agentMode.delete(chatId);
      // reset any per-chat timeout to default
      chatTimeoutMs.delete(chatId);
      clearTimer(chatId);
      if (wasAgent) {
        await message.reply('Has salido del modo agente. Si deseas volver a ver las opciones escribe "menu".');
      } else {
        await message.reply('Has salido del menú. Si deseas volver a ver las opciones escribe "menu".');
      }
      return;
    }

    // If user asks for menu, display and mark menu active for this chat
    if (lc === 'menu' || lc === 'inicio' || lc === 'help') {
      try {
        const menuToUse = await resolveMenu();
        if (!menuToUse || !Array.isArray(menuToUse) || menuToUse.length === 0) {
          await message.reply('Lo siento, el menú no está disponible en este momento. Intenta más tarde.');
          return;
        }

        const lines: string[] = [];
        lines.push('Hola! Bienvenido a nuestro 🤖 CHATBOT');
        lines.push('Somos Tecno Servicios Artavia, por favor envía el número de una de las siguientes opciones:');
        lines.push('');
        menuToUse.forEach((item) => {
          const label = (item.reply_message ?? '').split('\n')[0] || '';
          lines.push(`${item.keyword} - ${label}`);
        });
        lines.push('');
        lines.push('Escribe "menu" para volver al inicio o "salir" para finalizar la conversación.');

        await message.reply(lines.join('\n'));
        menuShown.set(chatId, true);
        lastMenuItems.set(chatId, menuToUse);
        return;
      } catch (error) {
        logger.error({ error }, 'No se pudo resolver el menú');
        await message.reply('Lo siento, el menú no está disponible en este momento. Intenta más tarde.');
        return;
      }
    }

    // Handle explicit "agente" request to transfer to human support
    if (lc === 'agente' || lc === 'asesor' || lc === 'soporte') {
      await message.reply('Perfecto, te estoy conectando con un asesor. Un miembro de nuestro equipo te atenderá en breve. Por favor espera un momento.');
      
      // Activate agent mode
      agentMode.set(chatId, true);
      chatTimeoutMs.set(chatId, _AGENT_TIMEOUT_MS);
      try { touchTimer(chatId); } catch (e) { /* ignore */ }
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      logger.info({ chatId, trigger: lc }, 'Chat puesto en modo agente (palabra clave)');

      // Notify admin
      try {
        const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : '50672140974';
        const adminChatId = normalizeToChatId(adminPhone);
        const now = Date.now();
        const lastNotified = adminNotifiedAt.get(chatId) || 0;
        if (adminChatId && (now - lastNotified > AGENT_NOTIFY_THROTTLE_MS)) {
          const notifyText = `🔔 Cliente ${fromUser} (${chatId}) solicitó hablar con un agente.\n\nÚltimo mensaje: "${String(body).slice(0, 200)}"\n\nPor favor responde directamente a este chat para atender al cliente.`;
          await whatsappClient.sendText(adminChatId, notifyText);
          adminNotifiedAt.set(chatId, now);
          logger.info({ adminChatId, chatId }, 'Admin notificado sobre solicitud de agente (palabra clave)');
        } else {
          logger.debug({ chatId, lastNotified }, 'Omitida notificación admin por throttle (palabra clave)');
        }
      } catch (e: any) {
        logger.warn({ e }, 'No se pudo notificar al admin sobre solicitud de agente (palabra clave)');
      }
      return;
    }

    // If menu is active for this chat (awaiting selection), treat the incoming message as a menu selection
    if (menuShown.get(chatId)) {
      try {
        const menu = lastMenuItems.get(chatId) ?? (await resolveMenu());

        let matched = null;

        // allow numeric selection (1-based index)
        const asNum = parseInt(body, 10);
        if (!Number.isNaN(asNum) && Array.isArray(menu) && asNum >= 1 && asNum <= menu.length) {
          matched = menu[asNum - 1];
        } else {
          // support two types of menu arrays:
          // - main menu items with .keyword
          // - submenu items with .key (a/b/c)
          if (Array.isArray(menu) && menu.length && (menu[0].key || menu[0].keyword)) {
            matched = menu.find((m: any) => {
              if (m.keyword) return (m.keyword.toLowerCase() === lc || m.keyword === body);
              if (m.key) return (String(m.key).toLowerCase() === lc || String(m.key) === body);
              return false;
            });
          } else {
            matched = null;
          }
        }

        if (matched) {
          // If the matched item has a submenu, present it and keep menu active
          if (matched.submenu && Array.isArray(matched.submenu) && matched.submenu.length) {
            await message.reply(matched.reply_message);
            // store submenu entries for the chat (expect letter like a/b/c)
            lastMenuItems.set(chatId, matched.submenu.map((s: any) => ({ key: (s.key || s.key_text || '').toString().toLowerCase(), text: s.text || s.reply_message || '' })));
            menuShown.set(chatId, true);
            return;
          }

          // Regular selection: reply. If this option transfers to an agent, activate agent mode and PAUSE the bot.
          const replyText = matched.reply_message || matched.text || matched.response || '';

          // Special-case: if the selected option is numeric 5 (o keyword/key '5'),
          // instruct the user to contact an agent and put the chat into agent mode.
          const isOptionFive = (typeof asNum === 'number' && asNum === 5)
            || (matched.keyword && String(matched.keyword).trim() === '5')
            || (matched.key && String(matched.key).trim() === '5');

          if (isOptionFive) {
            const agentMsg = 'Para hablar con un asesor, por favor comunícate con nuestro equipo de soporte o escribe "agente" para que te transferamos. Un asesor te contactará a la brevedad.';
            await message.reply(agentMsg);

            // Activate agent mode and notify admin just like the generic agent transfer flow
            agentMode.set(chatId, true);
            chatTimeoutMs.set(chatId, _AGENT_TIMEOUT_MS);
            try { touchTimer(chatId); } catch (e) { /* ignore */ }
            menuShown.delete(chatId);
            lastMenuItems.delete(chatId);
            logger.info({ chatId }, 'Chat puesto en modo agente (opción 5)');

            try {
              const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : '50672140974';
              const adminChatId = normalizeToChatId(adminPhone);
              const now = Date.now();
              const lastNotified = adminNotifiedAt.get(chatId) || 0;
              if (adminChatId && (now - lastNotified > AGENT_NOTIFY_THROTTLE_MS)) {
                const notifyText = `Cliente ${fromUser} (${chatId}) solicita atención de un asesor (opción 5). Mensaje: "${String(body).slice(0,200)}"`;
                await whatsappClient.sendText(adminChatId, notifyText);
                adminNotifiedAt.set(chatId, now);
                logger.info({ adminChatId, chatId }, 'Admin notificado sobre solicitud de agente (opción 5)');
              } else {
                logger.debug({ chatId, lastNotified, throttleMs: AGENT_NOTIFY_THROTTLE_MS }, 'Omitida notificación admin por throttle (opción 5)');
              }
            } catch (e: any) {
              logger.warn({ e }, 'No se pudo notificar al admin sobre la solicitud de agente (opción 5)');
            }

            return;
          }

          // Special case: option 8 - Account statement / Estado de cuenta
          const isOptionEight = (typeof asNum === 'number' && asNum === 8)
            || (matched.keyword && String(matched.keyword).trim() === '8')
            || (matched.key && String(matched.key).trim() === '8');

          if (isOptionEight) {
            try {
              // Get client by phone
              const client = await apiClient.findCustomerByPhone(fromUser);
              
              if (!client || !client.id) {
                await message.reply('❌ No encontramos tu información en nuestro sistema. Por favor contacta con un asesor escribiendo "agente".');
                return;
              }

              // Get client's contracts
              const contracts = await apiClient.listContracts({ client_id: client.id });
              
              if (!contracts || contracts.length === 0) {
                await message.reply('ℹ️ No tienes contratos activos en este momento.\n\nPara más información, escribe "agente" para hablar con un asesor.');
                return;
              }

              // Build account statement message
              const lines: string[] = [];
              lines.push('📊 *ESTADO DE CUENTA*');
              lines.push('');
              lines.push(`👤 Cliente: ${client.name || 'N/A'}`);
              lines.push(`📱 Teléfono: ${client.phone || fromUser}`);
              lines.push('');
              lines.push('📋 *Tus Contratos:*');
              lines.push('');

              for (const contract of contracts) {
                const status = contract.status === 'active' ? '✅ Activo' : 
                              contract.status === 'paused' ? '⏸️ Pausado' : 
                              contract.status === 'cancelled' ? '❌ Cancelado' : 
                              '⚪ ' + (contract.status || 'Desconocido');
                
                lines.push(`🔹 *Contrato #${contract.id}*`);
                lines.push(`   Servicio: ${contract.service_description || contract.contract_type?.name || 'N/A'}`);
                lines.push(`   Estado: ${status}`);
                lines.push(`   Monto: ${contract.currency || 'CRC'} ${Number(contract.amount || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                
                if (contract.next_due_date) {
                  const dueDate = new Date(contract.next_due_date);
                  const today = new Date();
                  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  
                  if (diffDays < 0) {
                    lines.push(`   ⚠️ Próximo pago: VENCIDO (${Math.abs(diffDays)} días de retraso)`);
                  } else if (diffDays === 0) {
                    lines.push(`   ⚠️ Próximo pago: HOY`);
                  } else if (diffDays <= 7) {
                    lines.push(`   ⏰ Próximo pago: En ${diffDays} día${diffDays !== 1 ? 's' : ''}`);
                  } else {
                    lines.push(`   📅 Próximo pago: ${dueDate.toLocaleDateString('es-CR')}`);
                  }
                }
                
                if (contract.notes && contract.notes.trim().length > 0) {
                  lines.push(`   📝 Nota: ${contract.notes.substring(0, 100)}${contract.notes.length > 100 ? '...' : ''}`);
                }
                
                lines.push('');
              }

              lines.push('━━━━━━━━━━━━━━━━━');
              lines.push('');
              lines.push('💡 *Opciones:*');
              lines.push('• Escribe *6* para enviar comprobante de pago');
              lines.push('• Escribe *menu* para volver al menú principal');
              lines.push('• Escribe *agente* para hablar con un asesor');

              await message.reply(lines.join('\n'));
              
              logger.info({ chatId, clientId: client.id, contractsCount: contracts.length }, 'Estado de cuenta enviado');
              return;
            } catch (error: any) {
              logger.error({ error, chatId }, 'Error obteniendo estado de cuenta');
              await message.reply('❌ Ocurrió un error al obtener tu estado de cuenta. Por favor intenta más tarde o escribe "agente" para hablar con un asesor.');
              return;
            }
          }

          await message.reply(replyText);

          // Heurística para detectar acciones especiales en el reply
          const lower = String(replyText || '').toLowerCase();
          // If this option expects a payment receipt (ej: opción 6), enter awaitingReceipt mode
          const isAwaitingReceipt = (matched.keyword && String(matched.keyword).toLowerCase() === '6') || (matched.key && String(matched.key).toLowerCase() === '6') || /comprobante|recibo|pago|comprobante de pago|enviar comprobante/i.test(lower);
          if (isAwaitingReceipt) {
            awaitingReceipt.set(chatId, true);
            // keep short timeout for receipt upload
            chatTimeoutMs.set(chatId, BOT_TIMEOUT_MS);
            try { touchTimer(chatId); } catch (e) { /* ignore */ }
            await message.reply('Por favor adjunta una foto o PDF del comprobante ahora. Si deseas cancelar escribe "salir".');
            return;
          }

          // Heurística para detectar transferencia a agente (si el reply contiene palabras clave)
          const isAgentTransfer = /transfer|asesor|agente|asesores|te vamos a transferir|transferir|transferencia/i.test(lower);
          if (isAgentTransfer) {
            agentMode.set(chatId, true);
            // set a longer timeout so agent mode will expire after agent timeout
            chatTimeoutMs.set(chatId, _AGENT_TIMEOUT_MS);
            try { touchTimer(chatId); } catch (e) { logger.debug({ e }, 'touchTimer fallo al activar agentMode'); }
            // clear menu state but keep agentMode active
            menuShown.delete(chatId);
            lastMenuItems.delete(chatId);
            logger.info({ chatId }, 'Chat puesto en modo agente');

            // Notify admin (first configured admin phone) that a client awaits an agent, with throttle
            try {
              const adminPhone = Array.isArray(ADMIN_PHONES) && ADMIN_PHONES.length ? ADMIN_PHONES[0] : '50672140974';
              const adminChatId = normalizeToChatId(adminPhone);
              const now = Date.now();
              const lastNotified = adminNotifiedAt.get(chatId) || 0;
              if (adminChatId && (now - lastNotified > AGENT_NOTIFY_THROTTLE_MS)) {
                const notifyText = `Cliente ${fromUser} (${chatId}) solicita atención de un asesor. Mensaje: "${String(body).slice(0, 200)}"`;
                await whatsappClient.sendText(adminChatId, notifyText);
                adminNotifiedAt.set(chatId, now);
                logger.info({ adminChatId, chatId }, 'Admin notificado sobre solicitud de agente');
              } else {
                logger.debug({ chatId, lastNotified, throttleMs: AGENT_NOTIFY_THROTTLE_MS }, 'Omitida notificación admin por throttle');
              }
            } catch (e: any) {
              logger.warn({ e }, 'No se pudo notificar al admin sobre la solicitud de agente');
            }

            return;
          }

          // otherwise behave normally: clear shown state so next message will show menu again
          menuShown.delete(chatId);
          lastMenuItems.delete(chatId);
          return;
        }

        // not a valid option while menu active: reply and clear shown state so next message will show menu again
        await message.reply('No reconozco esa opción. Por favor elige un número del menú o escribe "menu" para volver a ver las opciones o "salir" para finalizar.');
        menuShown.delete(chatId);
        lastMenuItems.delete(chatId);
        return;
      } catch (error) {
        logger.error({ error }, 'Error manejando opción de menú');
        return;
      }
    }


    // Menu not active (idle): show the full menu (as requested) and activate menu state for this chat
    try {
      // If chat is in agent mode, do not show the menu (agent handles conversation)
      if (agentMode.get(chatId)) {
        logger.debug({ chatId }, 'Ignorando mensaje: chat en modo agente, no mostrar menú');
        return;
      }
      const menuToUse = await resolveMenu();
      if (!menuToUse || !Array.isArray(menuToUse) || menuToUse.length === 0) {
        await message.reply('Lo siento, el menú no está disponible en este momento. Intenta más tarde.');
        return;
      }

      const lines: string[] = [];
      lines.push('Hola! Bienvenido a nuestro 🤖 CHATBOT');
      lines.push('Somos Tecno Servicios Artavia, por favor envía el número de una de las siguientes opciones:');
      lines.push('👇👇👇');
      lines.push('');

      // Build numbered list from menuToUse
      let idx = 1;
      for (const item of menuToUse) {
        const label = (item.reply_message ?? '').split('\n')[0] || 'Opción';
        lines.push(`${idx}- ${label}`);
        idx += 1;
      }

      lines.push('');
      lines.push('Escribe menu para volver al inicio o salir para finalizar la conversación.');

      await message.reply(lines.join('\n'));
      menuShown.set(chatId, true);
      lastMenuItems.set(chatId, menuToUse);
      // If the selected menu includes option '6' (Enviar comprobante), we will set awaitingReceipt when chosen; handled in menu selection branch
      return;
    } catch (error) {
      logger.error({ error }, 'Error mostrando el menú');
      await message.reply('Lo siento, el menú no está disponible en este momento. Intenta más tarde.');
      return;
    }
  });

  // helper: save receipt file and index
  async function ensureReceiptsDir() {
    try { await fs.mkdir(RECEIPTS_DIR, { recursive: true }); } catch {}
    try {
      await fs.access(RECEIPTS_INDEX);
    } catch {
      await fs.writeFile(RECEIPTS_INDEX, JSON.stringify([]), { encoding: 'utf8' });
    }
  }

  async function saveReceipt(chatId: string, filename: string, base64Data: string, mime: string, text?: string) {
    await ensureReceiptsDir();
    const now = Date.now();
    const id = `${chatId.replace(/[^0-9]/g,'')}-${now}`;
    const filepath = path.join(RECEIPTS_DIR, filename);
    // save file (base64)
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(filepath, buffer);

    // append to index (keep for backward compatibility)
    const raw = await fs.readFile(RECEIPTS_INDEX, { encoding: 'utf8' });
    const arr = JSON.parse(raw || '[]');
    const entry = { id, chatId, filename, filepath, mime, text: text || '', ts: now, status: 'pending' } as any;
    arr.push(entry);
    await fs.writeFile(RECEIPTS_INDEX, JSON.stringify(arr, null, 2), { encoding: 'utf8' });

    // Also save to database via API
    try {
      const phone = chatId.replace(/[^0-9]/g, '');
      await apiClient.storeReceiptFromBot({
        client_phone: phone,
        file_path: filepath,
        file_name: filename,
        mime_type: mime,
        received_at: new Date(now).toISOString(),
        metadata: {
          bot_receipt_id: id,
          chat_id: chatId,
          status: 'pending',
          text: text || '',
          saved_from_bot: true,
        },
      });
      logger.info({ id, chatId, filename }, 'Comprobante guardado en DB via API');
    } catch (err: any) {
      logger.warn({ err, id, chatId }, 'Error guardando comprobante en DB, solo guardado en JSON');
    }

    return { id, filepath, entry };
  }

  // Convert image buffer (jpg/png) to a single-page PDF buffer
  async function imageBufferToPdfBuffer(imageBuf: Buffer, filename: string) {
    // dynamic import to avoid build-time ESM issues
    const mod = await import('pdfkit');
    const PDFDocument: any = mod && (mod as any).default ? (mod as any).default : mod;
    return await new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', (err: any) => reject(err));
        // add a page sized to the image
        const img = doc.openImage ? doc.openImage(imageBuf) : undefined;
        if (img) {
          doc.addPage({ size: [img.width, img.height] });
          doc.image(img, 0, 0);
        } else {
          // fallback: add A4 and scale image
          doc.addPage('A4');
          doc.image(imageBuf, { fit: [500, 700], align: 'center', valign: 'center' });
        }
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  async function updateReceiptEntry(id: string, patch: Record<string, any>) {
    try {
      await ensureReceiptsDir();
      const raw = await fs.readFile(RECEIPTS_INDEX, { encoding: 'utf8' });
      const arr = JSON.parse(raw || '[]');
      let changed = false;
      let entry: any = null;
      for (const it of arr) {
        if (it && it.id === id) {
          Object.assign(it, patch);
          changed = true;
          entry = it;
          break;
        }
      }
      if (changed) {
        await fs.writeFile(RECEIPTS_INDEX, JSON.stringify(arr, null, 2), { encoding: 'utf8' });
        
        // Also update in database if it has backend_id or backend_payment_id
        const backendId = entry?.backend_id || entry?.backend_payment_id;
        if (backendId) {
          try {
            // For now, we'll just log this. Future enhancement: create update endpoint
            logger.debug({ id, backendId, patch }, 'Comprobante actualizado (backend sync pending)');
          } catch (err: any) {
            logger.debug({ err, id }, 'Error sincronizando actualización con DB');
          }
        }
      }
      return changed;
    } catch (e) {
      logger.warn({ e, id, patch }, 'No se pudo actualizar índice de comprobantes');
      return false;
    }
  }

  await whatsappClient.initialize();

  // Inicializar procesador de admin queue (si existe)
  try {
  const DATA_DIR = path.join(process.cwd(), 'data');
    const QUEUE_FILE = path.join(DATA_DIR, 'admin_queue.json');
    const RESULTS_FILE = path.join(DATA_DIR, 'admin_results.json');
    // asegurar carpeta
    try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}

    async function loadJson<T = any>(file: string, fallback: T): Promise<T> {
      try {
        const raw = await fs.readFile(file, { encoding: 'utf8' });
        return JSON.parse(raw || 'null') ?? fallback;
      } catch {
        return fallback;
      }
    }

    async function saveJson(file: string, data: any) {
      await fs.writeFile(file, JSON.stringify(data, null, 2), { encoding: 'utf8' });
    }

    let _adminQueueRunning = false;
    async function processAdminQueueOnce() {
      if (_adminQueueRunning) return;
      _adminQueueRunning = true;
      const q = await loadJson(QUEUE_FILE, { queue: [] } as any);
      const results = await loadJson(RESULTS_FILE, {} as any);
      const remaining: any[] = [];

      for (const item of q.queue || []) {
        if (!item || !item.id || !item.type) continue;
        if (results[item.id]) continue;

        if (item.type === 'ping') {
          results[item.id] = { ok: true, time: new Date().toISOString(), uptimeSec: Math.floor(process.uptime()) };
        } else if (item.type === 'sendText') {
          try {
            const chatId = normalizeToChatId(item.phone);
            if (!chatId) throw new Error('phone inválido');
            const text = String(item.text || '').trim() || 'Mensaje de prueba';
            await whatsappClient.sendText(chatId, text);
            results[item.id] = { ok: true, sent: true };
          } catch (e: any) {
            results[item.id] = { ok: false, error: String(e && e.message ? e.message : e) };
          }
        } else if (item.type === 'runScheduler') {
          try {
            await processor.runBatch();
            results[item.id] = { ok: true, ran: true, time: new Date().toISOString() };
          } catch (e: any) {
            results[item.id] = { ok: false, error: String(e && e.message ? e.message : e) };
          }
        } else {
          results[item.id] = { ok: false, error: 'tipo no soportado' };
        }
      }

      // Guardar resultados e identificar pendientes
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
      processAdminQueueOnce().catch(e => logger.warn({ e }, 'Admin queue error'));
    }, 2000);
  } catch (e) {
    logger.debug({ e }, 'No se pudo inicializar admin queue processor');
  }

  // --- small webhook receiver so backend/admin can notify the bot about reconciled receipts
  function startWebhookServer() {
    const port = Number(process.env.BOT_WEBHOOK_PORT || 3001);
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || '/', `http://${req.headers.host}`);
        if (req.method === 'POST' && u.pathname === '/webhook/receipt_reconciled') {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const payload = raw ? JSON.parse(raw) : {};
          const backendId = payload.backend_id ?? payload.receipt_id ?? null;
          const localId = payload.receipt_local_id ?? payload.receipt_id_local ?? null;
          const pdfBase64 = payload.pdf_base64 ?? null;
          const pdfUrl = payload.pdf_url ?? null;
          const pdfPath = payload.pdf_path ?? null;
          const message = payload.message ?? null;

          if (!backendId && !localId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'backend_id or receipt_local_id required' }));
            return;
          }

          // find local receipt entry
          let indexRaw = '[]';
          try { indexRaw = await fs.readFile(RECEIPTS_INDEX, { encoding: 'utf8' }); } catch {}
          const arr = JSON.parse(indexRaw || '[]');
          const entry = arr.find((r: any) => 
            (localId && r.id === localId) || 
            (backendId && (r.backend_id === backendId || r.backend_payment_id === backendId))
          );
          if (!entry) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'receipt not found' }));
            return;
          }

          // determine PDF base64
          let base64data: string | null = null;
          let filename = `reconciled-${entry.id}.pdf`;
          if (pdfBase64) {
            base64data = pdfBase64.replace(/^data:application\/(pdf);base64,/, '');
          } else if (pdfPath) {
            try {
              const buff = await fs.readFile(pdfPath);
              base64data = buff.toString('base64');
              filename = path.basename(pdfPath);
            } catch (e) {
              // ignore
            }
          } else if (pdfUrl) {
            try {
              const resp = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
              base64data = Buffer.from(resp.data).toString('base64');
              const urlObj = new URL(pdfUrl);
              filename = path.basename(urlObj.pathname) || filename;
            } catch (e) {
              // ignore
            }
          } else if (entry.reconciled_pdf) {
            try {
              const buff = await fs.readFile(entry.reconciled_pdf);
              base64data = buff.toString('base64');
              filename = path.basename(entry.reconciled_pdf);
            } catch (e) {
              // ignore
            }
          }

          if (!base64data) {
            // no pdf available to send
            await updateReceiptEntry(entry.id, { reconciled: true, reconciled_sent: false });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, note: 'marked reconciled, no pdf to send' }));
            return;
          }

          // send to client via WhatsApp
          try {
            const chatId = entry.chatId || entry.chat_id;
            if (!chatId) throw new Error('chatId missing');
            
            // Enviar el PDF
            await whatsappClient.sendMedia(chatId, base64data, 'application/pdf', filename);
            
            // Enviar el mensaje de texto si se proporcionó
            if (message && message.trim().length > 0) {
              await whatsappClient.sendText(chatId, message);
            }
            
            await updateReceiptEntry(entry.id, { reconciled: true, reconciled_sent: true, reconciled_sent_ts: Date.now() });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (e: any) {
            logger.warn({ e, entry }, 'Error enviando PDF reconciliado al cliente');
            await updateReceiptEntry(entry.id, { reconciled: true, reconciled_sent: false });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
            return;
          }
        }

        // Endpoint para enviar PDF directamente a un cliente (para pagos manuales)
        if (req.method === 'POST' && u.pathname === '/webhook/send_pdf') {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const payload = raw ? JSON.parse(raw) : {};
          const phone = payload.phone ?? null;
          const message = payload.message ?? null;
          const pdfBase64 = payload.pdf_base64 ?? null;
          const pdfPath = payload.pdf_path ?? null;
          const paymentId = payload.payment_id ?? null;

          if (!phone) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'phone required' }));
            return;
          }

          // Normalizar el teléfono al formato chatId
          const chatId = normalizeToChatId(phone);
          if (!chatId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'invalid phone format' }));
            return;
          }

          // Obtener el PDF en base64
          let base64data: string | null = null;
          let filename = `payment-${paymentId || Date.now()}.pdf`;
          
          if (pdfBase64) {
            base64data = pdfBase64.replace(/^data:application\/(pdf);base64,/, '');
          } else if (pdfPath) {
            try {
              const buff = await fs.readFile(pdfPath);
              base64data = buff.toString('base64');
              filename = path.basename(pdfPath);
            } catch (e) {
              logger.warn({ e, pdfPath }, 'Error leyendo PDF desde path');
            }
          }

          if (!base64data) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'no pdf data provided' }));
            return;
          }

          // Enviar el PDF al cliente
          try {
            await whatsappClient.sendMedia(chatId, base64data, 'application/pdf', filename);
            
            // Enviar el mensaje de texto si se proporcionó
            if (message && message.trim().length > 0) {
              await whatsappClient.sendText(chatId, message);
            }
            
            logger.info({ chatId, paymentId, filename }, 'PDF de pago manual enviado al cliente');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (e: any) {
            logger.warn({ e, chatId, paymentId }, 'Error enviando PDF de pago manual al cliente');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
            return;
          }
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not found' }));
      } catch (err: any) {
        logger.warn({ err }, 'Webhook handler error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
      }
    });

    server.listen(port, () => logger.info({ port }, 'Webhook server listening'));
  }

  startWebhookServer();

  // Load settings from backend API and refresh periodically
  async function loadSettingsFromApi() {
    try {
      const s = await apiClient.getSettings();
      if (!s) return;
      // payment contact
      if (s.payment_contact) {
        (config as any).paymentContact = String(s.payment_contact);
      }
      // bank accounts: accept newline or ; separators
      if (s.bank_accounts) {
        (config as any).bankAccounts = String(s.bank_accounts)
          .split(/\r?\n|;/)
          .map((x: string) => x.trim())
          .filter(Boolean);
      }
      if (s.service_name) {
        (config as any).serviceName = String(s.service_name);
      }
      if (s.beneficiary_name) {
        (config as any).beneficiaryName = String(s.beneficiary_name);
      }
      // Allow backend to configure business hours and timezone
      if (s.business_hours) {
        try {
          // business_hours can be an object or a JSON string
          const bh = typeof s.business_hours === 'string' ? JSON.parse(s.business_hours) : s.business_hours;
          if (bh && typeof bh === 'object') {
            // normalize keys to numbers 0-6
            const parsed: Record<number, { open: string; close: string }> = {} as any;
            for (const k of Object.keys(bh)) {
              const nk = Number(k);
              if (!Number.isNaN(nk)) parsed[nk] = bh[k];
            }
            BUSINESS_HOURS = Object.assign({}, BUSINESS_HOURS, parsed);
          }
        } catch (e) {
          logger.debug({ e }, 'invalid business_hours in settings');
        }
      }

      if (s.bot_timezone || s.timezone) {
        try {
          TIMEZONE = String(s.bot_timezone || s.timezone || TIMEZONE);
        } catch (e) {
          logger.debug({ e }, 'invalid timezone in settings');
        }
      }
      logger.info({ loaded: Object.keys(s) }, 'Settings cargadas desde API');
    } catch (e: any) {
      logger.warn({ e }, 'No se pudieron cargar settings desde API');
    }
  }

  // initial load and refresh every 5 minutes
  await loadSettingsFromApi();
  setInterval(loadSettingsFromApi, Number(process.env.BOT_SETTINGS_POLL_MS || 5 * 60 * 1000));

  await runBatch();
  const interval = setInterval(runBatch, config.pollIntervalMs);

  logger.info({ intervalMs: config.pollIntervalMs }, 'Servicio de recordatorios iniciado');

  const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, 'Recibida señal de apagado, cerrando bot.');
    clearInterval(interval);

    try {
      await whatsappClient.shutdown();
    } catch (error) {
      logger.warn({ error }, 'Error cerrando el cliente de WhatsApp');
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'El bot de WhatsApp se detuvo por un error inesperado');
  process.exit(1);
});
