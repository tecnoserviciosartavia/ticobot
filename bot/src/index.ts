import { config } from './config.js';
import { logger } from './logger.js';
import { ReminderProcessor } from './reminder-processor.js';
import { WhatsAppClient } from './whatsapp-client.js';
import { apiClient } from './api-client.js';
import fs from 'fs/promises';

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

  whatsappClient.registerInboundHandler(async (message) => {
    logger.info({ from: message.from, body: message.body }, 'Mensaje entrante de WhatsApp');

    const body = (message.body ?? '').trim();
    if (!body) return;

    const lc = body.toLowerCase();
    const chatId = message.from;

    // simple health check
    if (lc === 'ping') {
      await message.reply('pong');
      return;
    }

    // Handle explicit exit command: clear any pending menu
    if (lc === 'salir' || lc === 'exit') {
      menuShown.delete(chatId);
      lastMenuItems.delete(chatId);
      await message.reply('Has salido del menú. Si deseas volver a ver las opciones escribe "menu".');
      return;
    }

    // If user asks for menu, display and mark menu active for this chat
    if (lc === 'menu' || lc === 'inicio' || lc === 'help') {
      try {
  const menu = await apiClient.fetchBotMenu();
  // if backend has no menu items, try to load from local file, otherwise use a default static menu
  const defaultMenu = [
          { keyword: '1', reply_message: 'Promociones o ventas.' },
          { keyword: '2', reply_message: 'Información sobre Outsourcing TI.' },
          { keyword: '3', reply_message: 'Información sobre nuestro sistema de geolocalización TicoNav.' },
          { keyword: '4', reply_message: 'Información sobre nuestra plataforma TicoCast.' },
          { keyword: '5', reply_message: 'Contactar con un agente.' },
          { keyword: '6', reply_message: 'Enviar comprobante de pago.' },
          { keyword: '7', reply_message: 'Sistema de facturación TicoFac (ERP con Facturación Electrónica).' },
          { keyword: '8', reply_message: 'Mi estado de cuenta.' },
        ];

        let menuToUse = (menu && menu.length) ? menu : [];
        if ((!menuToUse || menuToUse.length === 0) && config.menuPath) {
          try {
            const raw = await fs.readFile(config.menuPath, { encoding: 'utf8' });
            const parsed = JSON.parse(raw) as Array<any>;
            if (Array.isArray(parsed) && parsed.length) {
              menuToUse = parsed;
            }
          } catch (err) {
            logger.debug({ err }, 'No se pudo leer BOT_MENU_PATH, continuará con menú por defecto');
          }
        }
        if (!menuToUse || menuToUse.length === 0) menuToUse = defaultMenu;

        const lines: string[] = [];
        lines.push('Hola! Bienvenido a nuestro 🤖 CHATBOT');
        lines.push('Somos Tecno Servicios Artavia, por favor envía el número de una de las siguientes opciones:');
        lines.push('');
        // show keyword and a short label
        menuToUse.forEach((item) => {
          const label = (item.reply_message ?? '').split('\n')[0];
          lines.push(`${item.keyword} - ${label}`);
        });
        lines.push('');
        lines.push('Escribe "menu" para volver al inicio o "salir" para finalizar la conversación.');

        await message.reply(lines.join('\n'));
        menuShown.set(chatId, true);
        lastMenuItems.set(chatId, menuToUse);
        return;
      } catch (error) {
        logger.error({ error }, 'No se pudo obtener el menú del bot, mostrando menú por defecto');
        // fallback to default menu when fetch fails
        const fallbackMenu = [
          { keyword: '1', reply_message: 'Promociones o ventas.' },
          { keyword: '2', reply_message: 'Información sobre Outsourcing TI.' },
          { keyword: '3', reply_message: 'Información sobre nuestro sistema de geolocalización TicoNav.' },
          { keyword: '4', reply_message: 'Información sobre nuestra plataforma TicoCast.' },
          { keyword: '5', reply_message: 'Contactar con un agente.' },
          { keyword: '6', reply_message: 'Enviar comprobante de pago.' },
          { keyword: '7', reply_message: 'Sistema de facturación TicoFac (ERP con Facturación Electrónica).' },
          { keyword: '8', reply_message: 'Mi estado de cuenta.' },
        ];
        const lines2: string[] = [];
        lines2.push('Hola! Bienvenido a nuestro 🤖 CHATBOT');
        lines2.push('Somos Tecno Servicios Artavia, por favor envía el número de una de las siguientes opciones:');
        lines2.push('');
        fallbackMenu.forEach((item) => {
          const label = (item.reply_message ?? '').split('\n')[0];
          lines2.push(`${item.keyword} - ${label}`);
        });
        lines2.push('');
        lines2.push('Escribe "menu" para volver al inicio o "salir" para finalizar la conversación.');
        await message.reply(lines2.join('\n'));
        menuShown.set(chatId, true);
        lastMenuItems.set(chatId, fallbackMenu);
        return;
      }
    }

    // If menu is active for this chat (awaiting selection), treat the incoming message as a menu selection
    if (menuShown.get(chatId)) {
      try {
        const menu = lastMenuItems.get(chatId) ?? (await apiClient.fetchBotMenu());

        let matched = null;

        // allow numeric selection (1-based index)
        const asNum = parseInt(body, 10);
        if (!Number.isNaN(asNum) && asNum >= 1 && asNum <= menu.length) {
          matched = menu[asNum - 1];
        } else {
          matched = menu.find((m) => m.keyword && (m.keyword.toLowerCase() === lc || m.keyword === body));
        }

        if (matched) {
          await message.reply(matched.reply_message);
          // after a valid selection, clear shown state so next message will show menu again
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
      const menu = await apiClient.fetchBotMenu();
      const defaultMenu = [
        { keyword: '1', reply_message: 'Promociones o ventas.' },
        { keyword: '2', reply_message: 'Información sobre Outsourcing TI.' },
        { keyword: '3', reply_message: 'Información sobre nuestro sistema de geolocalización TicoNav.' },
        { keyword: '4', reply_message: 'Información sobre nuestra plataforma TicoCast.' },
        { keyword: '5', reply_message: 'Contactar con un agente.' },
        { keyword: '6', reply_message: 'Enviar comprobante de pago.' },
        { keyword: '7', reply_message: 'Sistema de facturación TicoFac (ERP con Facturación Electrónica).' },
        { keyword: '8', reply_message: 'Mi estado de cuenta.' },
      ];

      const menuToUse = (menu && menu.length) ? menu : defaultMenu;

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
      logger.error({ error }, 'Error mostrando el menú por defecto, enviando menú estático');
      const fallbackMenu = [
        { keyword: '1', reply_message: 'Promociones o ventas.' },
        { keyword: '2', reply_message: 'Información sobre Outsourcing TI.' },
        { keyword: '3', reply_message: 'Información sobre nuestro sistema de geolocalización TicoNav.' },
        { keyword: '4', reply_message: 'Información sobre nuestra plataforma TicoCast.' },
        { keyword: '5', reply_message: 'Contactar con un agente.' },
        { keyword: '6', reply_message: 'Enviar comprobante de pago.' },
        { keyword: '7', reply_message: 'Sistema de facturación TicoFac (ERP con Facturación Electrónica).' },
        { keyword: '8', reply_message: 'Mi estado de cuenta.' },
      ];
      const lines3: string[] = [];
      lines3.push('Hola! Bienvenido a nuestro 🤖 CHATBOT');
      lines3.push('Somos Tecno Servicios Artavia, por favor envía el número de una de las siguientes opciones:');
      lines3.push('👇👇👇');
      lines3.push('');
      let i = 1;
      for (const item of fallbackMenu) {
        const label = (item.reply_message ?? '').split('\n')[0] || 'Opción';
        lines3.push(`${i}- ${label}`);
        i += 1;
      }
      lines3.push('');
      lines3.push('Escribe menu para volver al inicio o salir para finalizar la conversación.');
      await message.reply(lines3.join('\n'));
      menuShown.set(chatId, true);
      lastMenuItems.set(chatId, fallbackMenu);
      return;
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
