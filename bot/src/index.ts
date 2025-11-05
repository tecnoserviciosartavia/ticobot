import { config } from './config.js';
import { logger } from './logger.js';
import { ReminderProcessor } from './reminder-processor.js';
import { WhatsAppClient } from './whatsapp-client.js';
import { apiClient } from './api-client.js';
import fs from 'fs/promises';
import path from 'path';

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

  // ----- Admin / timeout / business hours helpers (portadas desde el otro repo) -----
  const TIMEZONE = process.env.TIMEZONE || 'America/Costa_Rica';

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
      chatTimeoutMs.delete(chatId);
      chatTimers.delete(chatId);
    }, timeout);
    chatTimers.set(chatId, timer);
  }

  // Business hours config (simple default, puede ampliarse desde env si es necesario)
  const BUSINESS_HOURS: Record<number, { open: string; close: string }> = {
    0: { open: '08:00', close: '19:00' },
    1: { open: '08:00', close: '19:00' },
    2: { open: '08:00', close: '19:00' },
    3: { open: '08:00', close: '19:00' },
    4: { open: '08:00', close: '19:00' },
    5: { open: '08:00', close: '19:00' },
    6: { open: '08:00', close: '19:00' }
  };

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

  const body = (message.body ?? '').trim();
  if (!body) return;

    const lc = body.toLowerCase();
    const chatId = message.from;

    // Mantener timeout por chat y detectar admin
    try {
      touchTimer(chatId);
    } catch (e) {
      logger.debug({ e }, 'touchTimer fallo');
    }

    const fromUser = chatId.replace(/@c\.us$/, '');
    const fromNorm = normalizeCR(fromUser);
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

      } catch (e: any) {
        adminFlows.delete(chatId);
        await message.reply(`Error en asistente: ${String(e && e.message ? e.message : e)}`);
        return;
      }
    }

    // Procesar comandos admin simples (prefijo '*')
    if (isAdminUser && lc.startsWith('*')) {
      const cmd = lc.slice(1).trim();
      if (cmd === 'help' || cmd === 'ayuda') {
        const helpText = [
          '🔧 *Comandos admin disponibles:*',
          '',
          '*ping* — healthcheck',
          '*status* — estado del bot',
          '*cancelar* — cancelar asistente admin',
          '*runscheduler* — ejecutar procesamiento de recordatorios (batch)',
          '*nuevo* — crear cliente + suscripción (asistente)',
          '*detalles <telefono>* — ver cliente y sus suscripciones',
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
          const days = 60;
          const subs = await apiClient.listSubscriptions(phone);
          const pays = await apiClient.listPaymentsUpcoming(phone, days);
          const next = (pays || []).find((p: any) => (p.status || '').includes('pendiente'));
          const lines: string[] = [];
          lines.push(`📇 Detalles ${phone}`);
          if (subs && subs.length) {
            lines.push(`• Suscripciones: ${subs.length}`);
            subs.slice(0, 3).forEach((s: any) => lines.push(`  - Día ${s.day_of_month} ${s.due_time} ₡${Number(s.amount).toLocaleString('es-CR')} (${s.active ? 'Activa' : 'Pausada'})`));
            if (subs.length > 3) lines.push('  ...');
          } else { lines.push('• Sin suscripciones'); }
          lines.push(`• Pagos próximos (${days} días): ${pays ? pays.length : 0}`);
          if (next) lines.push(`• Próximo: ${next.due_date} ${next.due_time} ₡${Number(next.amount).toLocaleString('es-CR')}`);
          await message.reply(lines.join('\n'));
        } catch (e: any) { await message.reply(`Error consultando detalles: ${String(e && e.message ? e.message : e)}`); }
        return;
      }

      if (cmd.startsWith('detalles')) {
        try {
          const parts = cmd.split(/\s+/);
          let phone = parts[1] ? parts[1].replace(/[^0-9]/g, '') : '';
          if (!phone) phone = fromUser;
          const days = 60;
          const subs = await apiClient.listSubscriptions(phone);
          const pays = await apiClient.listPaymentsUpcoming(phone, days);
          const next = (pays || []).find((p: any) => (p.status || '').includes('pendiente'));
          const lines: string[] = [];
          lines.push(`📇 Detalles ${phone}`);
          if (subs && subs.length) {
            lines.push(`• Suscripciones: ${subs.length}`);
            subs.slice(0, 3).forEach((s: any) => lines.push(`  - Día ${s.day_of_month} ${s.due_time} ₡${Number(s.amount).toLocaleString('es-CR')} (${s.active ? 'Activa' : 'Pausada'})`));
            if (subs.length > 3) lines.push('  ...');
          } else { lines.push('• Sin suscripciones'); }
          lines.push(`• Pagos próximos (${days} días): ${pays ? pays.length : 0}`);
          if (next) lines.push(`• Próximo: ${next.due_date} ${next.due_time} ₡${Number(next.amount).toLocaleString('es-CR')}`);
          await message.reply(lines.join('\n'));
        } catch (e: any) { await message.reply(`Error consultando detalles: ${String(e && e.message ? e.message : e)}`); }
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
          await message.reply(replyText);

          // Heurística para detectar transferencia a agente (si el reply contiene palabras clave)
          const lower = String(replyText || '').toLowerCase();
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
      return;
    } catch (error) {
      logger.error({ error }, 'Error mostrando el menú');
      await message.reply('Lo siento, el menú no está disponible en este momento. Intenta más tarde.');
      return;
    }
  });

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
