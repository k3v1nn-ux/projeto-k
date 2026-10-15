// Local stand-in for the Apps Script Web App, for testing sync without Google.
// Same actions and merge rules as apps-script/Code.gs. Like Apps Script, it does NOT
// answer CORS preflights, so the client must keep using text/plain POSTs.
// Run: node tools/mock-apps-script.mjs  (token: "test-token", port 8788)
import http from 'node:http';

const TOKEN = process.env.TOKEN || 'test-token';
let suggestToken = '';
const SYNCED = ['sessions', 'set_logs', 'cardio_logs', 'achievements', 'suggestions', 'health_imports', 'overrides', 'profile', 'body_logs', 'ai_reports'];
const tables = { exercises: [], plans: [] };
SYNCED.forEach((t) => { tables[t] = []; });
const logs = [];

function upsert(table, rows, now) {
  for (const row of rows) {
    const r = { ...row, synced_at: now };
    const i = tables[table].findIndex((x) => x.id === r.id);
    if (i < 0) { tables[table].push(r); continue; }
    const ex = tables[table][i];
    if (table === 'sessions') {
        if (r.status === 'missed' && ex.status !== 'missed') continue;
      const beats = ex.status === 'missed' && r.status !== 'missed';
      if (!beats && String(ex.updated_at) > String(r.updated_at || '')) continue;
    } else if (String(ex.updated_at) > String(r.updated_at || '')) continue;
    tables[table][i] = r;
  }
}

function handle(body) {
  const isOwner = body.token === TOKEN;
  const isFriend = suggestToken && body.token === suggestToken;
  const now = new Date().toISOString();
  if (body.action === 'suggest' && (isOwner || isFriend)) {
    const row = { id: crypto.randomUUID(), author: String(body.author || 'Amigo').slice(0, 40), created_at: now, payload_json: typeof body.payload_json === 'string' ? body.payload_json : JSON.stringify(body.payload_json), status: 'pending', target_date: '', updated_at: now, deleted: false };
    upsert('suggestions', [row], now);
    return { ok: true, id: row.id };
  }
  if (!isOwner) return { ok: false, error: 'unauthorized' };
  switch (body.action) {
    case 'ping': return { ok: true, time: now };
    case 'push': for (const [t, rows] of Object.entries(body.changes || {})) if (tables[t]) upsert(t, rows, now); return { ok: true, server_time: now };
    case 'pull': {
      const out = {};
      for (const t of SYNCED) out[t] = tables[t].filter((r) => !body.since || r.synced_at > body.since);
      return { ok: true, server_time: now, tables: out };
    }
    case 'health': {
      const d = body.data || body;
      const date = String(d.date || now).slice(0, 10);
      const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return v === '' || v == null || Number.isNaN(n) ? '' : Math.round(n * 10) / 10; };
      const row = { id: date, date, source: d.source || 'Atalho iOS / Saúde', updated_at: now, deleted: false };
      for (const k of ['resting_hr', 'avg_hr', 'active_kcal', 'steps', 'sleep_h', 'workout_avg_hr', 'workout_min']) row[k] = num(d[k]);
      upsert('health_imports', [row], now);
      return { ok: true, saved: row };
    }
    case 'seed': Object.assign(tables, { exercises: body.tables.exercises || [], plans: body.tables.plans || [] }); return { ok: true };
    case 'set_suggest_token': suggestToken = String(body.suggest_token || ''); return { ok: true };
    case 'debug_dump': return { ok: true, tables };
    case 'status': return { ok: true, version: 'mock', counts: Object.fromEntries(SYNCED.map((t) => [t, tables[t].length])), logs: logs.slice(-10).reverse() };
    default: return { ok: false, error: 'unknown_action' };
  }
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(405); res.end(); return; } // like Apps Script
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    let out;
    let body = {};
    try { body = JSON.parse(data || '{}'); out = req.method === 'POST' ? handle(body) : { ok: true, app: 'projeto-k-mock' }; } catch (e) { out = { ok: false, error: String(e) }; }
    if (req.method === 'POST' && body.action !== 'pull') logs.push({ time: new Date().toISOString(), action: body.action, ok: out.ok, error: out.error || '', detail: out.saved ? JSON.stringify(out.saved) : '' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(out));
  });
}).listen(8788, () => console.log('mock Apps Script on http://localhost:8788 (token test-token)'));
