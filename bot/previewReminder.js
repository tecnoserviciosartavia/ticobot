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

function renderTemplate(tpl, reminder, payload) {
  return String(tpl)
    .replace(/\{client_name\}/g, reminder.client?.name ?? '')
    .replace(/\{amount\}/g, String(payload.amount ?? ''))
    .replace(/\{due_date\}/g, String(payload.due_date ?? ''));
}

function buildMessage(reminder) {
  const payload = reminder.payload ?? {};
  const lines = [];
  const serviceName = payload.service_name ?? (process.env.BOT_SERVICE_NAME || 'TicoCast');
  const dueDate = payload.due_date ?? '';
  const rawAmount = reminder.contract?.amount ?? payload.amount ?? '0';
  const amountNum = Number(String(rawAmount).replace(/[^0-9\.\-]/g, '')) || 0;
  const amountFmt = amountNum ? amountNum.toLocaleString('es-CR') : '0';

  lines.push(`${serviceName}, le informa que su Suscripción de Servicios de Entretenimiento:\n`);
  if (dueDate) lines.push(`Ha Vencido ${dueDate}`);
  lines.push(`Total: ₡${amountFmt}`);
  lines.push('');
  lines.push('En caso de no recibir respuesta, nos vemos en la necesidad de Liberar el Perfil de su Suscripción.');
  lines.push('');
  lines.push('Si desea volver a disfrutar de nuestros servicios, puede realizar el pago correspondiente y con gusto le proporcionaremos una Cuenta Nueva.');
  lines.push('');
  lines.push('Renovarla es fácil!, solo realice el pago y envíenos el comprobante.');
  lines.push('');
  if (process.env.BOT_PAYMENT_CONTACT) {
    lines.push(`Sinpemóvil: ${String(process.env.BOT_PAYMENT_CONTACT).trim()}`);
  }
  lines.push('');
  lines.push('Para depósitos:');
  lines.push('');
  if (process.env.BOT_BANK_ACCOUNTS) {
    const accts = String(process.env.BOT_BANK_ACCOUNTS).split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);
    for (const a of accts) lines.push(a);
  }
  lines.push('');
  if (process.env.BOT_BENEFICIARY_NAME) lines.push(`Todas a nombre de ${process.env.BOT_BENEFICIARY_NAME}`);
  lines.push('');
  lines.push('Si ya canceló, omita el mensaje');

  if (payload.message) {
    lines.push('');
    lines.push(renderTemplate(String(payload.message), reminder, payload));
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
    const res = await http.get(`reminders/${id}`);
    const reminder = res.data;
    console.log('Reminder fetched (id=', reminder.id, ', contract amount=', reminder.contract?.amount, ')');
    const message = buildMessage(reminder);
    console.log('---- MESSAGE PREVIEW ----');
    console.log(message);
  } catch (e) {
    console.error('Error fetching reminder', e && e.response ? e.response.data : e.message);
    process.exit(2);
  }
})();
