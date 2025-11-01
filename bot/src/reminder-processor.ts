import pRetry, { FailedAttemptError } from 'p-retry';
import { apiClient } from './api-client.js';
import { logger } from './logger.js';
import { WhatsAppClient } from './whatsapp-client.js';
import { ReminderMessagePayload, ReminderRecord } from './types.js';

const buildMessage = (reminder: ReminderRecord): ReminderMessagePayload => {
  const payload = reminder.payload ?? {};
  const lines: string[] = [];

  if (payload.message) {
    lines.push(String(payload.message));
  } else {
    lines.push(`Hola ${reminder.client?.name ?? ''}, este es un recordatorio de pago.`.trim());
  }

  if (payload.amount) {
    lines.push(`Monto pendiente: ${payload.amount}`);
  }

  if (payload.due_date) {
    lines.push(`Fecha límite: ${payload.due_date}`);
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
    const messagePayload = buildMessage(reminder);
    await this.whatsapp.sendReminder(reminder, messagePayload);
  }
}
