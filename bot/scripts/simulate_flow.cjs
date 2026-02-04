#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.log('Usage: node simulate_flow.cjs <phone> [months] [monthlyAmount]');
    process.exit(1);
  }
  const phone = args[0];
  const months = args[1] ? Number(args[1]) : null;
  const monthlyAmount = args[2] ? Number(args[2]) : null;

  const DATA_DIR = path.join(process.cwd(), 'data');
  const RECEIPTS_DIR = path.join(DATA_DIR, 'receipts');
  const BACKEND_DIR = path.join(DATA_DIR, 'backend_sim');
  ensureDir(RECEIPTS_DIR);
  ensureDir(BACKEND_DIR);

  const now = Date.now();
  const id = `${String(phone).replace(/[^0-9]/g,'')}-${now}`;
  const filename = `receipt-${id}.png`;
  const filepath = path.join(RECEIPTS_DIR, filename);

  // tiny 1x1 PNG base64
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const buffer = Buffer.from(pngBase64, 'base64');
  fs.writeFileSync(filepath, buffer);

  // update receipts index
  const INDEX = path.join(RECEIPTS_DIR, 'index.json');
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(INDEX, 'utf8') || '[]'); } catch (e) { arr = []; }
  const entry = { id, chatId: phone + '@c.us', filename, filepath, mime: 'image/png', text: 'Simulated receipt', ts: now, status: 'pending' };
  arr.push(entry);
  fs.writeFileSync(INDEX, JSON.stringify(arr, null, 2), 'utf8');

  console.log('Created local receipt:', entry);

  // create backend simulated record
  const BACKEND_FILE = path.join(BACKEND_DIR, 'receipts.json');
  let b = [];
  try { b = JSON.parse(fs.readFileSync(BACKEND_FILE, 'utf8') || '[]'); } catch (e) { b = []; }
  const backendId = (b.length ? (b[b.length-1].id || 0) + 1 : 1);
  const monthly = monthlyAmount || 8000;
  const appliedMonths = months || 0;
  const total = appliedMonths ? (monthly * appliedMonths) : null;
  const backendRec = { id: backendId, phone, monthly_amount: monthly, months: appliedMonths, total_amount: total, receipt_local_id: id, status: appliedMonths ? 'applied' : 'created', reconciled: false };
  b.push(backendRec);
  fs.writeFileSync(BACKEND_FILE, JSON.stringify(b, null, 2), 'utf8');

  console.log('Created backend-sim receipt:', backendRec);

  // patch local index with backend id and months if provided
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    for (const it of raw) {
      if (it.id === id) {
        it.backend_id = backendId;
        if (appliedMonths) it.months = appliedMonths;
        if (total !== null) { it.monthly_amount = monthly; it.total_amount = total; }
        it.status = appliedMonths ? 'applied' : 'created';
        break;
      }
    }
    fs.writeFileSync(INDEX, JSON.stringify(raw, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not update index with backend id', e);
  }

  // create UI event so admin UI can pick it up (simulated)
  const UI_EVENTS = path.join(DATA_DIR, 'ui_events.json');
  let events = [];
  try { events = JSON.parse(fs.readFileSync(UI_EVENTS, 'utf8') || '[]'); } catch (e) { events = []; }
  events.push({ type: 'receipt_created', id, backend_id: backendId, phone, months: appliedMonths, total_amount: total, ts: now });
  fs.writeFileSync(UI_EVENTS, JSON.stringify(events, null, 2), 'utf8');

  console.log('Wrote UI event.');

  // simulate admin reconciliation: create a simple PDF and mark reconciled
  const reconcilePdf = path.join(RECEIPTS_DIR, `reconciled-${id}.pdf`);
  const pdfContent = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
72 712 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000061 00000 n 
0000000116 00000 n 
0000000211 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
315
%%EOF`;
  fs.writeFileSync(reconcilePdf, pdfContent, 'utf8');

  // mark reconciled in backend and local index
  for (const it of b) if (it.id === backendId) { it.reconciled = true; it.reconciled_pdf = reconcilePdf; }
  fs.writeFileSync(BACKEND_FILE, JSON.stringify(b, null, 2), 'utf8');

  const raw2 = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  for (const it of raw2) if (it.id === id) { it.reconciled = true; it.reconciled_pdf = reconcilePdf; }
  fs.writeFileSync(INDEX, JSON.stringify(raw2, null, 2), 'utf8');

  // add UI event for reconciliation
  events.push({ type: 'receipt_reconciled', id, backend_id: backendId, phone, reconciled_pdf: reconcilePdf, ts: Date.now() });
  fs.writeFileSync(UI_EVENTS, JSON.stringify(events, null, 2), 'utf8');

  console.log('Simulated reconciliation and generated PDF:', reconcilePdf);
  console.log('Done. Check:');
  console.log(' -', filepath);
  console.log(' -', INDEX);
  console.log(' -', BACKEND_FILE);
  console.log(' -', UI_EVENTS);
}

main().catch(e => { console.error(e); process.exit(1); });
