import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: './.env' });

const base = (process.env.BOT_API_BASE_URL || '').replace(/\/$/, '');
const token = process.env.BOT_API_TOKEN;

if (!base || !token) {
  console.error('Set BOT_API_BASE_URL and BOT_API_TOKEN in bot/.env');
  process.exit(1);
}

const http = axios.create({ baseURL: base + '/', headers: { Authorization: `Bearer ${token}` } });

function renderTemplate(tpl, vars) {
  const map = vars || {};
  return String(tpl).replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
    const k = String(key);
    if (Object.prototype.hasOwnProperty.call(map, k)) return String(map[k] ?? '');
    return `{${k}}`;
  });
}

function buildMessage(reminder, settings) {
  const payload = reminder.payload ?? {};
  const lines = [];
  const companyName = String(settings?.company_name ?? '').trim() || 'Empresa';
  
  // Get due date from payload or contract
  let dueDate = payload.due_date ?? '';
  if (!dueDate && reminder.contract?.next_due_date) {
    const dueDateObj = new Date(reminder.contract.next_due_date);
    dueDate = dueDateObj.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  
  const rawAmount = reminder.contract?.amount ?? payload.amount ?? '0';
  const amountNum = Number(String(rawAmount).replace(/[^0-9\.\-]/g, '')) || 0;
  const currency = String(reminder.contract?.currency ?? payload.currency ?? 'CRC')
    .trim()
    .toUpperCase();
  const amountNumberFmt = amountNum ? amountNum.toLocaleString('es-CR') : '0';
  const amountFmt = currency === 'USD' ? `$${amountNumberFmt}` : `₡${amountNumberFmt}`;

  const bankAccounts = String(settings?.bank_accounts ?? process.env.BOT_BANK_ACCOUNTS ?? '')
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');

  const vars = {
    client_name: reminder.client?.name ?? '',
    contract_name: reminder.contract?.name ?? '',
    company_name: companyName,
    due_date: dueDate,
    amount: amountFmt,
    amount_raw: amountNumberFmt,
    currency,
    services: payload.services_line ?? payload.services ?? payload.service_names ?? payload.service_list ?? '',
    payment_contact: String(settings?.payment_contact ?? process.env.BOT_PAYMENT_CONTACT ?? '').trim(),
    bank_accounts: bankAccounts,
    beneficiary_name: String(settings?.beneficiary_name ?? process.env.BOT_BENEFICIARY_NAME ?? '').trim(),
  };

  const tpl = String(settings?.reminder_template ?? '').trim();
  if (!tpl) {
    throw new Error('No hay reminder_template configurada en Settings. Configure la plantilla global de recordatorio desde la UI.');
  }
  lines.push(renderTemplate(tpl, vars));

  if (payload.message) {
    lines.push('');
    lines.push(renderTemplate(String(payload.message), vars));
  }

  if (payload.options?.length) {
    lines.push('Responda con una de las siguientes opciones:');
    payload.options.forEach(option => lines.push(`${option.key}. ${option.label}`));
  }

  return lines.join('\n');
}

(async function main(){
  const id = process.argv[2] || '48';
  try {
    const settings = (await http.get('settings')).data || {};
    const res = await http.get(`reminders/${id}`);
    const reminder = res.data;
    console.log('Reminder fetched (id=', reminder.id, ', contract amount=', reminder.contract?.amount, ')');
    const message = buildMessage(reminder, settings);
    console.log('---- MESSAGE PREVIEW ----');
    console.log(message);
  } catch (e) {
    console.error('Error fetching reminder', e && e.response ? e.response.data : e.message);
    process.exit(2);
  }
})();
