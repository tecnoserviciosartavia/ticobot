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
  if (raw.endsWith('@broadcast')) return raw;

  const normalizedPhone = normalizeWhatsAppUserChatId(raw);
  if (normalizedPhone) return normalizedPhone;

  const digits = digitsOnly(raw);
  if (!digits) return raw;
  if (digits.length === 8) return `${config.defaultCountryCode}${digits}@c.us`;
  if (digits.length >= 9) return `${digits}@c.us`;

  return raw;
};

export const mergeChatAliasIds = (...values: Array<string | null | undefined>): Set<string> => {
  const set = new Set<string>();
  for (const v of values) {
    const raw = String(v || '').trim();
    if (!raw) continue;
    const normalized = normalizeChatIdForState(raw);
    if (normalized) set.add(normalized);
  }
  return set;
};

export const formatWhatsAppId = (rawPhone: string): string => {
  const normalizedChatId = normalizeWhatsAppUserChatId(rawPhone);
  if (!normalizedChatId) {
    throw new Error(`El número ${rawPhone} no parece válido para WhatsApp.`);
  }
  return normalizedChatId;
};
