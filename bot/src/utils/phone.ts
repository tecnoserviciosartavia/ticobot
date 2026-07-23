import { config } from '../config.js';

export const digitsOnly = (s: string) => String(s || '').replace(/[^0-9]/g, '');

export const chatIdToPhoneDigits = (rawChatId: string): string => {
  const raw = String(rawChatId || '').trim();
  if (!raw) return '';
  return digitsOnly(raw.replace(/@.*/, ''));
};

export const normalizeToCR = (rawPhone: string): string => {
  const digits = digitsOnly(rawPhone);
  if (digits.length === 8) return `${config.defaultCountryCode}${digits}`;
  return digits;
}

export const normalizeWhatsAppUserChatId = (raw: string): string | null => {
  const digits = chatIdToPhoneDigits(raw);
  if (!digits) return null;

  let phone = digits;
  if (phone.length === 8) phone = `${config.defaultCountryCode}${phone}`;
  if (!/^[0-9]{8,15}$/.test(phone)) return null;

  return `${phone}@c.us`;
};

export const normalizeChatIdForState = (rawChatId?: string | null): string => {
  const raw = String(rawChatId || '').trim();
  if (!raw) return raw;
  if (raw.endsWith('@broadcast') || raw.endsWith('@g.us')) return raw;
  // WhatsApp multi-device puede entregar chats @lid; hay que responder al mismo ID.
  if (raw.endsWith('@lid')) return raw;

  return normalizeWhatsAppUserChatId(raw) || raw;
};

export const formatWhatsAppId = (rawPhone: string): string => {
  const normalizedChatId = normalizeWhatsAppUserChatId(rawPhone);
  if (!normalizedChatId) {
    throw new Error(`El número ${rawPhone} no parece válido para WhatsApp.`);
  }
  return normalizedChatId;
};
