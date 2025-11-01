import { config } from './config.js';
import { logger } from './logger.js';
import { ReminderProcessor } from './reminder-processor.js';
import { WhatsAppClient } from './whatsapp-client.js';

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
  whatsappClient.registerInboundHandler(async (message) => {
    logger.info({ from: message.from, body: message.body }, 'Mensaje entrante de WhatsApp');

    if (message.body.trim().toLowerCase() === 'ping') {
      await message.reply('pong');
    }
  });

  await whatsappClient.initialize();

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
