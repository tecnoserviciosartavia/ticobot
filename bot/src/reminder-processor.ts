import pRetry, { FailedAttemptError } from 'p-retry';
import { apiClient } from './api-client.js';
import { logger } from './logger.js';
import { MetaWhatsAppClient } from './meta-whatsapp-client.js';
import { ReminderMessagePayload, ReminderRecord } from './types.js';
import { config } from './config.js';

/** Aviso fijo cuando aún no hay un pago verificado ligado al recordatorio / cobro pendiente */
const DEFAULT_OVERDUE_BALANCE_NOTICE =
  '⚠️ Buen día, le recordamos el saldo vencido en su cuenta de lo contrario se eliminará cualquier perfil contratado con nosotros.';

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

    const contractAny = reminder.contract as any;
    if (contractAny?.services && Array.isArray(contractAny.services)) {
      const fromContract = contractAny.services
        .map((x: any) => {
          if (!x || typeof x !== 'object') return '';
          const name = String(x.name ?? '').trim();
          const qRaw = x.pivot?.quantity ?? x.quantity ?? 1;
          const q = Number(qRaw);
          if (name && Number.isFinite(q) && q > 1) return `${name} x${q}`;
          return name;
        })
        .filter(Boolean);
      if (fromContract.length) {
        return fromContract.join(', ');
      }
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
  // Nombre de empresa: solo desde settings/UI (company_name). Si no existe, usar fallback mínimo.
  const companyName = String((config as any).companyName ?? '').trim() || 'Empresa';
  
  // Prioridad de fecha: payload.due_date -> reminder.scheduled_for -> contract.next_due_date.
  const formatDateForDisplay = (rawDate: unknown): string => {
    const raw = String(rawDate ?? '').trim();
    if (!raw) return '';

    // If backend returns a date-only string (YYYY-MM-DD), avoid JS Date() UTC shifting.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map((v) => Number(v));
      const local = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0); // midday to avoid DST edge
      return local.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  let dueDate = formatDateForDisplay(payload.due_date);
  if (!dueDate) {
    dueDate = formatDateForDisplay(reminder.scheduled_for);
  }
  if (!dueDate && reminder.contract?.next_due_date) {
    dueDate = formatDateForDisplay(reminder.contract.next_due_date);
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

  const configuredTemplate = String((config as any).reminderTemplate ?? '').trim();
  const payloadMessage = String(payload.message ?? '').trim();
  const fallbackTemplate = payloadMessage || [
    'Hola {client_name}, te recordamos el pago pendiente de {contract_name}.',
    'Monto: {amount}',
    'Fecha de pago: {due_date}',
    '{bank_accounts}',
    'Puede enviar el comprobante por este WhatsApp.'
  ].join('\n');
  const template = configuredTemplate || fallbackTemplate;
  const payloadMessageConsumed = !configuredTemplate && Boolean(payloadMessage);

  if (!configuredTemplate) {
    logger.warn({ reminderId: reminder.id }, 'No hay reminder_template configurada; usando mensaje fallback para enviar recordatorio');
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

  const templateReferencesServices = /\{services\}/.test(template);
  if (servicesLine && !templateReferencesServices) {
    lines.push('');
    lines.push(`📦 Servicios: ${servicesLine}`);
  }

  // If backend provided a custom message template, append it rendered.
  // When there is no global template, payload.message is used as the main template above.
  if (payload.message && !payloadMessageConsumed) {
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

  // Mensaje institucional: aplica en recordatorios de cobro donde aún no hay pago conciliado/verificado.
  lines.push('');
  lines.push(
    (
      typeof config.overdueBalanceWhatsAppNotice === 'string' &&
      config.overdueBalanceWhatsAppNotice.trim() !== ''
        ? config.overdueBalanceWhatsAppNotice
        : DEFAULT_OVERDUE_BALANCE_NOTICE
    ).trim()
  );

  return {
    content: lines.join('\n'),
    attachments: []
  };
};

export class ReminderProcessor {
  constructor(private readonly whatsapp: MetaWhatsAppClient) {}

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

  }

  private async processReminder(reminder: ReminderRecord): Promise<void> {
    try {
      const claimed = await apiClient.claimReminder(reminder.id);

      if (!claimed) {
        logger.debug({ reminderId: reminder.id }, 'Recordatorio omitido porque ya fue reclamado por otro proceso');
        return;
      }

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

      const errorMessage = String((error as any)?.message ?? '');
      const missingPhone = /no tiene tel[eé]fono configurado/i.test(errorMessage);

      if (missingPhone) {
        try {
          await apiClient.markFailed(reminder.id, 'Cliente sin telefono configurado');
          logger.warn({ reminderId: reminder.id }, 'Recordatorio marcado como failed por cliente sin telefono');
          return;
        } catch (err) {
          logger.error({ err, reminderId: reminder.id }, 'Error marcando recordatorio como failed');
        }
      }

      // Intentar devolver el recordatorio a estado 'pending' para que pueda ser reintentado
      try {
        await apiClient.revertToPending(reminder.id);
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

}
