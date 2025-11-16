import pRetry, { FailedAttemptError } from 'p-retry';
import { apiClient } from './api-client.js';
import { logger } from './logger.js';
import { WhatsAppClient } from './whatsapp-client.js';
import { ReminderMessagePayload, ReminderRecord } from './types.js';
import { config } from './config.js';

const buildMessage = (reminder: ReminderRecord): ReminderMessagePayload => {
  const payload = reminder.payload ?? {};
  const lines: string[] = [];

  // Helper: render a template replacing known tags with actual values
  function renderTemplate(tpl: string) {
    return String(tpl)
      .replace(/\{client_name\}/g, reminder.client?.name ?? '')
      .replace(/\{amount\}/g, String(payload.amount ?? ''))
      .replace(/\{due_date\}/g, String(payload.due_date ?? ''));
  }

  // Build a detailed subscription reminder similar to the provided template
  const clientName = reminder.client?.name ?? '';
  // service name: prefer payload, then config, then fallback
  const serviceName = payload.service_name ?? (config.serviceName || 'TicoCast');
  const dueDate = payload.due_date ?? '';
  // amount: prefer contract amount (from contract summary), then payload.amount
  const rawAmount = reminder.contract?.amount ?? payload.amount ?? '0';
  // normalize string like "10000" or "10000.00" or with currency symbols
  const amountNum = Number(String(rawAmount).replace(/[^0-9\.\-]/g, '')) || 0;
  const amountFmt = amountNum ? amountNum.toLocaleString('es-CR') : '0';

  lines.push(`${serviceName}, le informa que su Suscripción de Servicios de Entretenimiento:\n`);
  if (dueDate) lines.push(`Ha Vencido ${dueDate}`);
  lines.push(`Total: ₡${amountFmt}`);
  lines.push('');
  lines.push('En caso de no recibir respuesta, nos vemos en la necesidad de Liberar el Perfil de su Suscripción.');
  lines.push('');
  lines.push('Si desea volver a disfrutar de nuestros servicios, puede realizar el pago correspondiente y con gusto le proporcionaremos una Cuenta Nueva.');
  lines.push('');
  lines.push('Renovarla es fácil!, solo realice el pago y envíenos el comprobante.');
  lines.push('');
  if (config.paymentContact && String(config.paymentContact).trim()) {
    lines.push(`Sinpemóvil: ${String(config.paymentContact).trim()}`);
  }
  lines.push('');
  lines.push('Para depósitos:');
  lines.push('');
  // Use configured bank accounts from system settings (no hardcoded fallbacks)
  if (Array.isArray(config.bankAccounts) && config.bankAccounts.length) {
    for (const acct of config.bankAccounts) {
      lines.push(acct);
    }
  }
  lines.push('');
  // Beneficiario: use configured beneficiary name when available
  if (config.beneficiaryName && String(config.beneficiaryName).trim()) {
    lines.push(`Todas a nombre de ${String(config.beneficiaryName).trim()}`);
  }
  lines.push('');
  lines.push('Si ya canceló, omita el mensaje');

  // If backend provided a custom message template, append it rendered
  if (payload.message) {
    lines.push('');
    lines.push(renderTemplate(String(payload.message)));
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
  constructor(private readonly whatsapp: WhatsAppClient) {}

  async runBatch(): Promise<void> {
    const reminders = await apiClient.fetchPendingReminders();

    if (!reminders.length) {
      logger.debug('No hay recordatorios pendientes por enviar.');
      return;
    }

    for (const reminder of reminders) {
      await this.processReminder(reminder);
    }
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
      logger.error({ error, reminderId: reminder.id }, 'No se pudo enviar el recordatorio');
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
