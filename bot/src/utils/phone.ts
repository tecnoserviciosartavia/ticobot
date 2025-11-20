import { config } from '../config.js';

export const digitsOnly = (s: string) => String(s || '').replace(/[^0-9]/g, '');

export const normalizeToCR = (rawPhone: string): string => {
  const digits = digitsOnly(rawPhone);
  if (digits.length === 8) return `${config.defaultCountryCode}${digits}`;
  return digits;
}

export const formatWhatsAppId = (rawPhone: string): string => {
  const digits = digitsOnly(rawPhone);
  if (digits.length < 8) {
    throw new Error(`El número ${rawPhone} no parece válido para WhatsApp.`);
  }
  const hasCountry = digits.length >= 11;
  const normalized = hasCountry ? digits : `${config.defaultCountryCode}${digits.replace(/^0+/, '')}`;
  return `${normalized}@c.us`;
};
