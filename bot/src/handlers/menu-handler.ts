import { logger } from '../logger.js';
import { config } from '../config.js';
import { Message, Client } from 'whatsapp-web.js';
import { normalizeWhatsAppUserChatId, chatIdToPhoneDigits } from '../utils/phone.js';

export type MenuItem = {
  key: string;
  label: string;
  action?: string;
  data?: any;
};

export type MenuState = {
  shown: boolean;
  items: MenuItem[];
  lastShown: number;
};

export class MenuHandler {
  private menuStates = new Map<string, MenuState>();
  private adminPhones: string[];
  private readonly MENU_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(adminPhones: string[]) {
    this.adminPhones = adminPhones;
  }

  /**
   * Show main menu to user
   */
  async showMainMenu(client: Client, chatId: string): Promise<void> {
    const isAdmin = this.isAdminChat(chatId);
    const menuItems = this.getMainMenuItems(isAdmin);
    
    await this.showMenu(client, chatId, '🤖 *TicoBOT - Menú Principal*', menuItems);
  }

  /**
   * Show admin menu
   */
  async showAdminMenu(client: Client, chatId: string): Promise<void> {
    if (!this.isAdminChat(chatId)) {
      await client.sendMessage(chatId, '❌ No tienes permisos de administrador.');
      return;
    }

    const menuItems = this.getAdminMenuItems();
    await this.showMenu(client, chatId, '⚙️ *Panel de Administración*', menuItems);
  }

  /**
   * Show payment menu
   */
  async showPaymentMenu(client: Client, chatId: string, clientData?: any): Promise<void> {
    const menuItems = this.getPaymentMenuItems(clientData);
    await this.showMenu(client, chatId, '💳 *Opciones de Pago*', menuItems);
  }

  /**
   * Handle menu selection
   */
  async handleMenuSelection(client: Client, chatId: string, selection: string): Promise<boolean> {
    const menuState = this.menuStates.get(chatId);
    if (!menuState || !menuState.shown) {
      return false;
    }

    // Check if selection is a number (index-based selection)
    const index = parseInt(selection);
    if (!isNaN(index) && index > 0 && index <= menuState.items.length) {
      const item = menuState.items[index - 1];
      return await this.executeMenuAction(client, chatId, item);
    }

    // Check if selection matches a key
    const item = menuState.items.find(item => 
      item.key.toLowerCase() === selection.toLowerCase()
    );
    
    if (item) {
      return await this.executeMenuAction(client, chatId, item);
    }

    return false;
  }

  /**
   * Check if user is currently in a menu
   */
  isInMenu(chatId: string): boolean {
    const state = this.menuStates.get(chatId);
    if (!state || !state.shown) return false;

    // Clear menu if timeout expired
    if (Date.now() - state.lastShown > this.MENU_TIMEOUT_MS) {
      this.clearMenuState(chatId);
      return false;
    }

    return true;
  }

  /**
   * Clear menu state for chat
   */
  clearMenuState(chatId: string): void {
    this.menuStates.delete(chatId);
  }

  private async showMenu(client: Client, chatId: string, title: string, items: MenuItem[]): Promise<void> {
    let menuText = `${title}\n\n`;
    
    items.forEach((item, index) => {
      menuText += `${index}. ${item.label}\n`;
    });

    menuText += '\n_Escribe el número o la palabra clave para seleccionar una opción_';

    try {
      await client.sendMessage(chatId, menuText);
      
      // Store menu state
      this.menuStates.set(chatId, {
        shown: true,
        items,
        lastShown: Date.now()
      });

      logger.info({ chatId, menuItems: items.length }, 'Menu shown to user');
    } catch (error) {
      logger.error({ err: error, chatId }, 'Failed to show menu');
    }
  }

  private async executeMenuAction(client: Client, chatId: string, item: MenuItem): Promise<boolean> {
    try {
      // Clear menu state after selection
      this.clearMenuState(chatId);

      switch (item.action) {
        case 'show_balance':
          await this.handleBalanceAction(client, chatId);
          break;
        case 'show_payments':
          await this.handlePaymentsAction(client, chatId);
          break;
        case 'contact_support':
          await this.handleSupportAction(client, chatId);
          break;
        case 'admin_panel':
          await this.showAdminMenu(client, chatId);
          break;
        case 'send_reminder':
          await this.handleSendReminderAction(client, chatId);
          break;
        case 'pause_contact':
          await this.handlePauseContactAction(client, chatId);
          break;
        case 'show_stats':
          await this.handleStatsAction(client, chatId);
          break;
        default:
          await client.sendMessage(chatId, '❌ Opción no reconocida.');
          return false;
      }

      return true;
    } catch (error) {
      logger.error({ err: error, chatId, action: item.action }, 'Failed to execute menu action');
      await client.sendMessage(chatId, '❌ Error al procesar la opción seleccionada.');
      return false;
    }
  }

  private getMainMenuItems(isAdmin: boolean): MenuItem[] {
    const items: MenuItem[] = [
      { key: 'balance', label: '💰 Consultar saldo', action: 'show_balance' },
      { key: 'payments', label: '📋 Ver pagos', action: 'show_payments' },
      { key: 'payment', label: '💳 Realizar pago', action: 'make_payment' },
      { key: 'support', label: '📞 Contactar soporte', action: 'contact_support' }
    ];

    if (isAdmin) {
      items.push({ key: 'admin', label: '⚙️ Panel admin', action: 'admin_panel' });
    }

    return items;
  }

  private getAdminMenuItems(): MenuItem[] {
    return [
      { key: 'reminder', label: '📤 Enviar recordatorio', action: 'send_reminder' },
      { key: 'pause', label: '⏸️ Pausar contacto', action: 'pause_contact' },
      { key: 'stats', label: '📊 Ver estadísticas', action: 'show_stats' },
      { key: 'broadcast', label: '📢 Mensaje masivo', action: 'send_broadcast' },
      { key: 'back', label: '🔙 Volver al menú principal', action: 'show_main' }
    ];
  }

  private getPaymentMenuItems(clientData?: any): MenuItem[] {
    return [
      { key: 'sinpe', label: '📱 Pagar con SINPE', action: 'pay_sinpe' },
      { key: 'transfer', label: '🏦 Transferencia bancaria', action: 'pay_transfer' },
      { key: 'cash', label: '💵 Pago en efectivo', action: 'pay_cash' },
      { key: 'back', label: '🔙 Volver', action: 'show_main' }
    ];
  }

  private isAdminChat(chatId: string): boolean {
    if (!chatId) return false;
    const user = chatIdToPhoneDigits(chatId);
    return this.adminPhones.includes(user);
  }

  // Action handlers (to be implemented based on business logic)
  private async handleBalanceAction(client: Client, chatId: string): Promise<void> {
    await client.sendMessage(chatId, '🔍 Consultando tu saldo...');
    // TODO: Implement balance lookup
  }

  private async handlePaymentsAction(client: Client, chatId: string): Promise<void> {
    await client.sendMessage(chatId, '📋 Obteniendo historial de pagos...');
    // TODO: Implement payment history lookup
  }

  private async handleSupportAction(client: Client, chatId: string): Promise<void> {
    const supportMessage = `📞 *Soporte Técnico*

📧 Email: soporte@ticobot.com
📱 WhatsApp: +506 7214-0974
⏰ Horario: Lunes a Viernes 9am-6pm

¿En qué podemos ayudarte?`;
    await client.sendMessage(chatId, supportMessage);
  }

  private async handleSendReminderAction(client: Client, chatId: string): Promise<void> {
    await client.sendMessage(chatId, '📤 Función de enviar recordatorio en desarrollo...');
    // TODO: Implement send reminder functionality
  }

  private async handlePauseContactAction(client: Client, chatId: string): Promise<void> {
    await client.sendMessage(chatId, '⏸️ Función de pausar contacto en desarrollo...');
    // TODO: Implement pause contact functionality
  }

  private async handleStatsAction(client: Client, chatId: string): Promise<void> {
    await client.sendMessage(chatId, '📊 Función de estadísticas en desarrollo...');
    // TODO: Implement stats functionality
  }
}
