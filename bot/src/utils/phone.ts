import { config } from '../config.js';

export const formatWhatsAppId = (rawPhone: string): string => {
  const digits = rawPhone.replace(/\D/g, '');

  if (digits.length < 8) {
    throw new Error(`El número ${rawPhone} no parece válido para WhatsApp.`);
  }

  const hasCountry = digits.length >= 11;
  const normalized = hasCountry ? digits : `${config.defaultCountryCode}${digits.replace(/^0+/, '')}`;

  return `${normalized}@c.us`;
};
