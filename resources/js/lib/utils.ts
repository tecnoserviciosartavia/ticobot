import { type ClassValue, clsx } from "clsx"

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number, currency = 'CRC'): string {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: currency === 'USD' ? 'USD' : 'CRC',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const value = typeof date === 'string' ? date : date.toISOString();
  const dateOnly = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(parsed);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

export function formatDateTime(date: string | Date): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  const time = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(parsed);
  return `${formatDate(parsed)}, ${time}`;
}

export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format for Costa Rica numbers
  if (cleaned.length === 8 && cleaned.startsWith('2') || cleaned.startsWith('5') || cleaned.startsWith('6') || cleaned.startsWith('7') || cleaned.startsWith('8')) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  
  // Format for international numbers
  if (cleaned.length === 11 && cleaned.startsWith('506')) {
    return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 7)} ${cleaned.slice(7)}`;
  }
  
  return phone;
}

export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    active: 'cyan',
    inactive: 'gray',
    pending: 'yellow',
    verified: 'cyan',
    unverified: 'yellow',
    failed: 'red',
    cancelled: 'red',
    sent: 'blue',
    queued: 'orange',
  };
  
  return statusColors[status.toLowerCase()] || 'gray';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
