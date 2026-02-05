import pRetry, { FailedAttemptError } from 'p-retry';
import { apiClient } from './api-client.js';
import { logger } from './logger.js';
import { WhatsAppClient } from './whatsapp-client.js';
import { ReminderMessagePayload, ReminderRecord } from './types.js';
import { config } from './config.js';

const buildMessage = (reminder: ReminderRecord): ReminderMessagePayload => {
  const payload = reminder.payload ?? {};
  const lines: string[] = [];

  // Best-effort: intentar inferir los servicios/productos cobrados desde el payload.
  // Soporta varios nombres comunes porque el backend puede variar el shape.
  const resolveServicesLine = (): string => {
    const candidates: unknown[] = [];
    const p: any = payload as any;
    if (p) {
      candidates.push(p.services);
      candidates.push(p.service_names);
      candidates.push(p.service_list);
      candidates.push(p.items);
      candidates.push(p.products);
      candidates.push(p.subscriptions);
    }

    for (const c of candidates) {
      if (!c) continue;
      if (typeof c === 'string') {
        const s = c.trim();
        if (s) return s;
      }
      if (Array.isArray(c)) {
        const names = c
          .map((x) => {
            if (typeof x === 'string') return x.trim();
            if (x && typeof x === 'object') {
              const o: any = x;
              const name = String(o.name ?? o.service_name ?? o.label ?? o.title ?? '').trim();
              const qRaw = o.quantity ?? o.qty ?? o.count;
              const q = Number(qRaw);
              if (name && Number.isFinite(q) && q > 1) return `${name} x${q}`;
              return name;
            }
            return '';
          })
          .filter(Boolean);
        if (names.length) return names.join(', ');
      }
    }

    return '';
  };

  // Helper: render a template replacing known tags with actual values
  function renderTemplate(tpl: string, vars?: Record<string, string>) {
    const baseVars: Record<string, string> = {
      client_name: reminder.client?.name ?? '',
      contract_name: reminder.contract?.name ?? '',
      amount: amountFmt,
      amount_raw: amountNumberFmt,
      currency,
      due_date: String(payload.due_date ?? ''),
      services: '',
      company_name: '',
      payment_contact: String(config.paymentContact ?? ''),
      bank_accounts: Array.isArray(config.bankAccounts) ? config.bankAccounts.join('\n') : '',
      beneficiary_name: String(config.beneficiaryName ?? ''),
      ...vars,
    };

    return String(tpl).replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
      const k = String(key);
      return Object.prototype.hasOwnProperty.call(baseVars, k) ? String(baseVars[k] ?? '') : `{${k}}`;
    });
  }

  // Build a detailed subscription reminder similar to the provided template
  const clientName = reminder.client?.name ?? '';
  // Nombre de empresa: solo desde settings/UI (company_name). Si no existe, usar fallback mínimo.
  const companyName = String((config as any).companyName ?? '').trim() || 'Empresa';
  
  // Get due date from payload or contract
  let dueDate = payload.due_date ?? '';
  if (!dueDate && reminder.contract?.next_due_date) {
    const raw = String(reminder.contract.next_due_date);
    // If backend returns a date-only string (YYYY-MM-DD), avoid JS Date() UTC shifting.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map((v) => Number(v));
        const local = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0); // midday to avoid DST edge
        dueDate = local.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
    } else {
        const dueDateObj = new Date(raw);
        dueDate = dueDateObj.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
  }
  
  // amount: prefer contract amount (from contract summary), then payload.amount
  const rawAmount = reminder.contract?.amount ?? payload.amount ?? '0';
  // normalize string like "10000" or "10000.00" or with currency symbols
  const amountNum = Number(String(rawAmount).replace(/[^0-9\.\-]/g, '')) || 0;
  const currency = String((reminder.contract as any)?.currency ?? (payload as any)?.currency ?? 'CRC')
    .trim()
    .toUpperCase();
  const amountNumberFmt = amountNum ? amountNum.toLocaleString('es-CR') : '0';
  const amountFmt = currency === 'USD' ? `$${amountNumberFmt}` : `₡${amountNumberFmt}`;

  const servicesLine = resolveServicesLine();

  // Plantilla global (desde UI/settings) = ÚNICA fuente del mensaje principal.
  const template = String((config as any).reminderTemplate ?? '').trim();
  if (!template) {
    throw new Error('No hay reminder_template configurada en Settings. Configure la plantilla global de recordatorio desde la UI.');
  }

  const rendered = renderTemplate(template, {
    company_name: String(companyName),
    due_date: String(dueDate),
    amount: String(amountFmt),
    amount_raw: String(amountNumberFmt),
    currency: String(currency),
    services: servicesLine,
    payment_contact: String(config.paymentContact ?? '').trim(),
    bank_accounts: Array.isArray(config.bankAccounts) ? config.bankAccounts.join('\n') : '',
    beneficiary_name: String(config.beneficiaryName ?? '').trim(),
    contract_name: reminder.contract?.name ?? '',
  });
  lines.push(rendered);

  // If backend provided a custom message template, append it rendered
  if (payload.message) {
    lines.push('');
    lines.push(renderTemplate(String(payload.message), {
      company_name: String(companyName),
      due_date: String(dueDate),
      amount: String(amountFmt),
      amount_raw: String(amountNumberFmt),
      currency: String(currency),
      services: servicesLine,
    }));
  }

  if (payload.options?.length) {
    lines.push('Responda con una de las siguientes opciones:');
    payload.options.forEach((option) => {
      lines.push(`${option.key}. ${option.label}`);
    });
  }

  return {
    content: lines.join('\n'),
    attachments: []
  };
};

export class ReminderProcessor {
  private lastResendCheck: Date | null = null;

  constructor(private readonly whatsapp: WhatsAppClient) {}

  async runBatch(): Promise<void> {
    // Primero procesar recordatorios pendientes normales
    const reminders = await apiClient.fetchPendingReminders();

    if (!reminders.length) {
      logger.debug('No hay recordatorios pendientes por enviar.');
    } else {
      for (const reminder of reminders) {
        await this.processReminder(reminder);
      }
    }

    // Después de las 5 PM, reenviar recordatorios del día que no han sido conciliados
    await this.checkAndResendUnpaidReminders();
  }

  private async processReminder(reminder: ReminderRecord): Promise<void> {
    try {
      await apiClient.markQueued(reminder);

      await pRetry(() => this.sendReminder(reminder), {
        retries: 3,
        factor: 2,
        onFailedAttempt: (error: FailedAttemptError) => {
          logger.warn({
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            reminderId: reminder.id,
            cause: error.cause
          }, 'Fallo al enviar recordatorio, reintentando');
        }
      });

      await apiClient.markSent(reminder.id);
      logger.info({ reminderId: reminder.id }, 'Recordatorio enviado correctamente');
    } catch (error) {
      logger.error({ err: error, reminderId: reminder.id }, 'No se pudo enviar el recordatorio');

      // Intentar devolver el recordatorio a estado 'pending' para que pueda ser reintentado
      try {
        const attempts = typeof reminder.attempts === 'number' ? reminder.attempts : undefined;
        await apiClient.revertToPending(reminder.id, attempts);
        logger.info({ reminderId: reminder.id }, 'Recordatorio revertido a pending para reintento futuro');
      } catch (err) {
        logger.error({ err, reminderId: reminder.id }, 'Error revirtiendo recordatorio a pending');
      }
    }
  }

  private async sendReminder(reminder: ReminderRecord): Promise<void> {
    // If the backend didn't include contract details in the reminder, fetch it so we can read the amount
    if (!reminder.contract && reminder.contract_id) {
      try {
        const c = await apiClient.getContract(reminder.contract_id);
        if (c) reminder.contract = c;
      } catch (err: any) {
        logger.warn({ err, reminderId: reminder.id, contractId: reminder.contract_id }, 'No se pudo obtener contrato para el recordatorio');
        // proceed anyway; buildMessage will fallback to payload.amount or 0
      }
    }

  const payload = reminder.payload ?? {};
  const rawAmount = reminder.contract?.amount ?? payload.amount ?? '0';
  logger.info({ reminderId: reminder.id, contractId: reminder.contract_id, rawAmount }, 'Resolved amount for reminder');

  const messagePayload = buildMessage(reminder);
    await this.whatsapp.sendReminder(reminder, messagePayload);
  }

  /**
   * Verifica si es después de las 5 PM y reenvía recordatorios del día que no han sido conciliados
   */
  private async checkAndResendUnpaidReminders(): Promise<void> {
    const now = new Date();
    const hour = now.getHours();
    
    // Solo ejecutar después de las 5 PM (17:00)
    if (hour < 17) {
      return;
    }

    // Solo ejecutar una vez al día (evitar múltiples ejecuciones)
    if (this.lastResendCheck) {
      const lastCheckDate = this.lastResendCheck.toDateString();
      const currentDate = now.toDateString();
      if (lastCheckDate === currentDate) {
        return; // Ya se ejecutó hoy
      }
    }

    try {
      logger.info('Verificando recordatorios del día sin conciliar para reenvío...');

      // Obtener recordatorios enviados hoy que no tienen pagos conciliados
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const sentReminders = await apiClient.fetchSentRemindersWithoutPayment(
        todayStart.toISOString(),
        todayEnd.toISOString()
      );

      if (!sentReminders.length) {
        logger.debug('No hay recordatorios del día sin conciliar.');
        this.lastResendCheck = now;
        return;
      }

      logger.info({ count: sentReminders.length }, 'Reenviando recordatorios sin conciliar del día');

      for (const reminder of sentReminders) {
        try {
          // Modificar el mensaje para indicar que es un recordatorio adicional
          const originalPayload = reminder.payload ?? {};
          const resendPayload = {
            ...originalPayload,
            message: '⚠️ RECORDATORIO ADICIONAL ⚠️\n\nNo hemos recibido su comprobante de pago del día de hoy.\n\n' + (originalPayload.message || '')
          };
          
          const reminderWithResendMessage = { ...reminder, payload: resendPayload };
          const messagePayload = buildMessage(reminderWithResendMessage);
          
          await this.whatsapp.sendReminder(reminder, messagePayload);
          logger.info({ reminderId: reminder.id }, 'Recordatorio reenviado exitosamente');
          
          // Pequeña pausa entre mensajes para no saturar
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error({ err: error, reminderId: reminder.id }, 'Error reenviando recordatorio');
        }
      }

      this.lastResendCheck = now;
      logger.info('Proceso de reenvío completado');
    } catch (error) {
      logger.error({ err: error }, 'Error en verificación de recordatorios sin conciliar');
    }
  }
}
