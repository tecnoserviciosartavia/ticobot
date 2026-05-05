import { logger } from '../logger.js';
import { Message, Client } from 'whatsapp-web.js';
import { normalizeWhatsAppUserChatId, chatIdToPhoneDigits } from '../utils/phone.js';
import { MenuHandler } from './menu-handler.js';
import { apiClient } from '../api-client.js';

export type MessageContext = {
  chatId: string;
  userId: string;
  isAdmin: boolean;
  isAdLead: boolean;
  agentMode: boolean;
};

export class MessageProcessor {
  private menuHandler: MenuHandler;
  private adLeadChats = new Map<string, { detectedAt: number; evidence: string }>();
  private agentMode = new Map<string, boolean>();
  private adminPhones: string[];

  constructor(adminPhones: string[], menuHandler: MenuHandler) {
    this.adminPhones = adminPhones;
    this.menuHandler = menuHandler;
  }

  /**
   * Process incoming message
   */
  async processMessage(client: Client, message: Message): Promise<void> {
    const chatId = message.from;
    const context = this.buildMessageContext(chatId);
    
    try {
      // Log message for debugging
      logger.info({ 
        chatId, 
        messageBody: message.body, 
        fromMe: message.fromMe,
        hasMedia: message.hasMedia 
      }, 'Processing message');

      // Handle different message types
      if (message.hasMedia) {
        await this.handleMediaMessage(client, message, context);
      } else if (message.body) {
        await this.handleTextMessage(client, message, context);
      }

    } catch (error) {
      logger.error({ err: error, chatId }, 'Error processing message');
      await this.sendErrorMessage(client, chatId);
    }
  }

  /**
   * Handle text messages
   */
  private async handleTextMessage(client: Client, message: Message, context: MessageContext): Promise<void> {
    const body = message.body.trim().toLowerCase();
    const chatId = context.chatId;

    // Check if user is in agent mode
    if (context.agentMode) {
      await this.handleAgentModeMessage(client, message, context);
      return;
    }

    // Check for menu selections first
    if (this.menuHandler.isInMenu(chatId)) {
      const handled = await this.menuHandler.handleMenuSelection(client, chatId, message.body);
      if (handled) return;
    }

    // Handle keywords and commands
    if (this.isMenuCommand(body)) {
      await this.menuHandler.showMainMenu(client, chatId);
      return;
    }

    if (this.isHelpCommand(body)) {
      await this.sendHelpMessage(client, chatId);
      return;
    }

    if (this.isAdminCommand(body) && context.isAdmin) {
      await this.handleAdminCommand(client, message, context);
      return;
    }

    // Check for ad lead keywords
    if (this.isAdLeadKeyword(body)) {
      await this.handleAdLead(client, message, context);
      return;
    }

    // Handle payment-related messages
    if (this.isPaymentRelated(body)) {
      await this.handlePaymentMessage(client, message, context);
      return;
    }

    // Default response
    await this.handleUnknownMessage(client, message, context);
  }

  /**
   * Handle media messages (images, documents, etc.)
   */
  private async handleMediaMessage(client: Client, message: Message, context: MessageContext): Promise<void> {
    const chatId = context.chatId;
    
    try {
      const media = await message.downloadMedia();
      
      // Log media info
      logger.info({ 
        chatId, 
        mimetype: media.mimetype, 
        filename: media.filename,
        size: media.data.length 
      }, 'Received media message');

      // Handle different media types
      if (media.mimetype.startsWith('image/')) {
        await this.handleImageMessage(client, message, media, context);
      } else if (media.mimetype === 'application/pdf') {
        await this.handlePdfMessage(client, message, media, context);
      } else {
        await this.handleOtherMediaMessage(client, message, media, context);
      }

    } catch (error) {
      logger.error({ err: error, chatId }, 'Error handling media message');
      await client.sendMessage(chatId, '❌ Error al procesar el archivo recibido.');
    }
  }

  /**
   * Handle messages in agent mode
   */
  private async handleAgentModeMessage(client: Client, message: Message, context: MessageContext): Promise<void> {
    // In agent mode, forward to human admin
    await this.forwardToAdmin(client, message, context);
  }

  /**
   * Handle admin commands
   */
  private async handleAdminCommand(client: Client, message: Message, context: MessageContext): Promise<void> {
    const body = message.body.trim().toLowerCase();
    const chatId = context.chatId;

    if (body.startsWith('/admin')) {
      await this.menuHandler.showAdminMenu(client, chatId);
    } else if (body.startsWith('/stats')) {
      await this.sendAdminStats(client, chatId);
    } else if (body.startsWith('/broadcast')) {
      await this.handleBroadcastCommand(client, message, context);
    } else if (body.startsWith('/pause')) {
      await this.handlePauseCommand(client, message, context);
    } else {
      await client.sendMessage(chatId, '❌ Comando de administrador no reconocido.');
    }
  }

  /**
   * Handle ad lead detection
   */
  private async handleAdLead(client: Client, message: Message, context: MessageContext): Promise<void> {
    const chatId = context.chatId;
    
    // Mark as ad lead
    this.adLeadChats.set(chatId, {
      detectedAt: Date.now(),
      evidence: message.body
    });

    logger.info({ chatId, message: message.body }, 'Ad lead detected');

    // Send welcome message and notify admin
    await client.sendMessage(chatId, 
      '👋 ¡Hola! Gracias por tu interés en nuestros servicios.\n\n' +
      'Un agente se comunicará contigo pronto para ayudarte.\n\n' +
      'Mientras tanto, puedes escribir *menu* para ver las opciones disponibles.'
    );

    await this.notifyAdminsAboutLead(client, message, context);
  }

  /**
   * Handle payment-related messages
   */
  private async handlePaymentMessage(client: Client, message: Message, context: MessageContext): Promise<void> {
    const chatId = context.chatId;
    const body = message.body;

    // Check for payment confirmation
    if (this.isPaymentConfirmation(body)) {
      await this.handlePaymentConfirmation(client, message, context);
    } else if (this.isPaymentQuery(body)) {
      await this.menuHandler.showPaymentMenu(client, chatId);
    } else {
      await client.sendMessage(chatId, 
        '💳 Para procesar pagos, por favor usa el menú de opciones.\n\n' +
        'Escribe *menu* para ver las opciones disponibles.'
      );
    }
  }

  /**
   * Handle unknown messages
   */
  private async handleUnknownMessage(client: Client, message: Message, context: MessageContext): Promise<void> {
    const chatId = context.chatId;
    
    await client.sendMessage(chatId, 
      '❓ No entendí tu mensaje.\n\n' +
      'Escribe *menu* para ver las opciones disponibles o *ayuda* para obtener ayuda.'
    );
  }

  // Helper methods
  private buildMessageContext(chatId: string): MessageContext {
    const userId = chatIdToPhoneDigits(chatId);
    const isAdmin = this.adminPhones.includes(userId);
    const isAdLead = this.adLeadChats.has(chatId);
    const agentMode = this.agentMode.get(chatId) || false;

    return { chatId, userId, isAdmin, isAdLead, agentMode };
  }

  private isMenuCommand(body: string): boolean {
    return ['menu', 'menú', 'opciones', 'inicio'].includes(body);
  }

  private isHelpCommand(body: string): boolean {
    return ['ayuda', 'help', 'soporte', 'asistencia'].includes(body);
  }

  private isAdminCommand(body: string): boolean {
    return body.startsWith('/') || body.startsWith('admin');
  }

  private isAdLeadKeyword(body: string): boolean {
    const adKeywords = [
      'quiero mas informacion',
      'quiero más informacion', 
      'quiero mas información',
      'quiero más información',
      'mas informacion',
      'más informacion',
      'mas información',
      'más información',
      'informacion',
      'información',
      'cotizar',
      'cotización',
      'precio',
      'costo'
    ];
    return adKeywords.some(keyword => body.includes(keyword));
  }

  private isPaymentRelated(body: string): boolean {
    const paymentKeywords = ['pago', 'pagar', 'transferencia', 'sinpe', 'deposito', 'abono'];
    return paymentKeywords.some(keyword => body.includes(keyword));
  }

  private isPaymentConfirmation(body: string): boolean {
    const confirmationKeywords = ['ya pagué', 'ya pague', 'pago realizado', 'transferencia hecha'];
    return confirmationKeywords.some(keyword => body.includes(keyword));
  }

  private isPaymentQuery(body: string): boolean {
    const queryKeywords = ['cómo pago', 'como pago', 'formas de pago', 'métodos de pago'];
    return queryKeywords.some(keyword => body.includes(keyword));
  }

  // Message type handlers
  private async handleImageMessage(client: Client, message: Message, media: any, context: MessageContext): Promise<void> {
    // Handle payment receipts, documents, etc.
    await client.sendMessage(context.chatId, '📷 Imagen recibida. Procesando...');
    // TODO: Implement image processing logic
  }

  private async handlePdfMessage(client: Client, message: Message, media: any, context: MessageContext): Promise<void> {
    await client.sendMessage(context.chatId, '📄 PDF recibido. Procesando...');
    // TODO: Implement PDF processing logic
  }

  private async handleOtherMediaMessage(client: Client, message: Message, media: any, context: MessageContext): Promise<void> {
    await client.sendMessage(context.chatId, '📎 Archivo recibido.');
  }

  // Utility methods
  private async sendErrorMessage(client: Client, chatId: string): Promise<void> {
    await client.sendMessage(chatId, '❌ Ocurrió un error. Por favor intenta nuevamente.');
  }

  private async sendHelpMessage(client: Client, chatId: string): Promise<void> {
    const helpText = `🤖 *Ayuda - TicoBOT*

*Comandos disponibles:*
• 📋 menu - Mostrar menú principal
• ❓ ayuda - Mostrar esta ayuda
• 💳 pago - Opciones de pago

*Para soporte:*
📞 WhatsApp: +506 7214-0974
📧 Email: soporte@ticobot.com

Escribe *menu* para comenzar!`;
    
    await client.sendMessage(chatId, helpText);
  }

  private async forwardToAdmin(client: Client, message: Message, context: MessageContext): Promise<void> {
    // TODO: Implement message forwarding to admin
    logger.info({ chatId: context.chatId }, 'Message forwarded to admin');
  }

  private async notifyAdminsAboutLead(client: Client, message: Message, context: MessageContext): Promise<void> {
    // TODO: Implement admin notification for leads
    logger.info({ chatId: context.chatId }, 'Admin notified about lead');
  }

  private async sendAdminStats(client: Client, chatId: string): Promise<void> {
    await client.sendMessage(chatId, '📊 Estadísticas en desarrollo...');
    // TODO: Implement admin stats
  }

  private async handleBroadcastCommand(client: Client, message: Message, context: MessageContext): Promise<void> {
    await client.sendMessage(context.chatId, '📢 Función de broadcast en desarrollo...');
    // TODO: Implement broadcast functionality
  }

  private async handlePauseCommand(client: Client, message: Message, context: MessageContext): Promise<void> {
    await client.sendMessage(context.chatId, '⏸️ Función de pausa en desarrollo...');
    // TODO: Implement pause functionality
  }

  private async handlePaymentConfirmation(client: Client, message: Message, context: MessageContext): Promise<void> {
    await client.sendMessage(context.chatId, 
      '✅ ¡Gracias por tu pago!\n\n' +
      'Estamos procesando tu comprobante. Te notificaremos cuando esté verificado.\n\n' +
      'Si tienes dudas, contacta a soporte.'
    );
    // TODO: Implement payment confirmation processing
  }
}
