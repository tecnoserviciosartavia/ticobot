export interface ClientSummary {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface ContractSummary {
  id: number;
  name: string;
  amount: string;
  currency: string;
  billing_cycle: string;
}

export interface ReminderPayload {
  message?: string;
  options?: Array<{ key: string; label: string }>;
  attachment_url?: string;
  due_date?: string;
  amount?: string;
  [key: string]: unknown;
}

export interface ReminderRecord {
  id: number;
  client_id: number;
  contract_id: number;
  channel: string;
  scheduled_for: string;
  status: string;
  attempts: number;
  payload: ReminderPayload | null;
  client?: ClientSummary;
  contract?: ContractSummary;
}

export interface AcknowledgePayload {
  status?: string;
  response_payload?: Record<string, unknown>;
  acknowledged_at?: string;
}

export interface ReminderAttachment {
  filename: string;
  mimeType: string;
  data: Buffer | string;
}

export interface ReminderMessagePayload {
  content: string;
  attachments?: ReminderAttachment[];
}
