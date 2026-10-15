/**
 * Projeto K — Google Apps Script backend (bound to the spreadsheet).
 *
 * Setup (see README):
 *   1. In the spreadsheet: Extensions > Apps Script, paste this file.
 *   2. Run `initialize` once from the editor and copy the token printed in the log.
 *   3. Deploy > New deployment > Web app: Execute as "Me", Access "Anyone".
 *
 * All requests are POST with Content-Type text/plain and a JSON body:
 *   { action, token, ...payload }
 * (text/plain avoids the CORS preflight, which Apps Script cannot answer).
 *
 * After updating this file: Deploy > Manage deployments > edit > Version: New version
 * (keeps the same /exec URL).
 */

var VERSION = '2.1';

// New columns are only appended at the end so existing rows stay aligned.
var SCHEMA = {
  sessions: ['id', 'date', 'planned_session', 'level', 'start_time', 'end_time', 'duration_min', 'status', 'notes', 'swaps_json', 'updated_at', 'deleted', 'synced_at', 'slot'],
  set_logs: ['id', 'session_id', 'exercise_id', 'set_number', 'load_kg', 'reps', 'rpe', 'timestamp', 'is_pr', 'updated_at', 'deleted', 'synced_at'],
  cardio_logs: ['id', 'session_id', 'type', 'duration_min', 'avg_hr', 'notes', 'updated_at', 'deleted', 'synced_at', 'phase'],
  achievements: ['id', 'unlocked_at', 'updated_at', 'deleted', 'synced_at'],
  suggestions: ['id', 'author', 'created_at', 'payload_json', 'status', 'target_date', 'updated_at', 'deleted', 'synced_at'],
  health_imports: ['id', 'date', 'resting_hr', 'avg_hr', 'active_kcal', 'steps', 'sleep_h', 'workout_avg_hr', 'workout_min', 'source', 'updated_at', 'deleted', 'synced_at'],
  overrides: ['id', 'date', 'suggestion_id', 'session_name', 'payload_json', 'updated_at', 'deleted', 'synced_at'],
  profile: ['id', 'name', 'birth_date', 'sex', 'height_cm', 'goal', 'experience', 'notes', 'updated_at', 'deleted', 'synced_at', 'photo'],
  body_logs: ['id', 'date', 'weight_kg', 'body_fat_pct', 'waist_cm', 'notes', 'updated_at', 'deleted', 'synced_at'],
  ai_reports: ['id', 'created_at', 'model', 'text', 'updated_at', 'deleted', 'synced_at']
};

var SEED_SCHEMA = {
  exercises: ['id', 'name_pt', 'muscle_group', 'equipment', 'media_url', 'instructions', 'alternatives', 'is_squat_variant', 'active'],
  plans: ['id', 'level', 'slot', 'rotation_order', 'session_name', 'exercise_id', 'order', 'sets', 'rep_min', 'rep_max', 'rest_seconds', 'notes']
};

// Columns kept as plain text so Sheets does not turn them into Date objects.
var TEXT_COLUMNS = ['id', 'date', 'target_date', 'start_time', 'end_time', 'timestamp', 'created_at', 'unlocked_at', 'updated_at', 'synced_at', 'session_id', 'birth_date'];
var LOG_SHEET = '_log';
var STATUS_PT = { done: 'Feito', partial: 'Parcial', cardio: 'Só cardio', rest: 'Descanso', in_progress: 'Em andamento', missed: 'Falta' };


function initialize() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Object.keys(SCHEMA).forEach(function (t) { ensureSheet_(t, SCHEMA[t]); });
  Object.keys(SEED_SCHEMA).forEach(function (t) { ensureSheet_(t, SEED_SCHEMA[t]); });
  Logger.log('TOKEN (cole em Ajustes do app e no Atalho): ' + props.getProperty('TOKEN'));
}

function rotateToken() {
  PropertiesService.getScriptProperties().setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('Novo TOKEN: ' + PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

function doGet() {
  return json_({ ok: true, app: 'projeto-k', version: VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  var body;
  try {
    body = JSON.parse(raw || '{}');
  } catch (err) {
    log_('?', false, 'invalid_json', raw.slice(0, 200));
    return json_({ ok: false, error: 'invalid_json' });
  }
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  var suggestToken = props.getProperty('SUGGEST_TOKEN');
  var isOwner = Boolean(token) && String(body.token || '').trim() === token;
  var isFriend = Boolean(suggestToken) && String(body.token || '').trim() === suggestToken;
  var action = String(body.action || '');

  var result;
  try {
    if (action === 'suggest' && (isOwner || isFriend)) {
      result = suggest_(body);
    } else if (!isOwner) {
      result = { ok: false, error: token ? 'unauthorized (token errado)' : 'token não configurado: rode initialize' };
    } else {
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        switch (action) {
          case 'ping': result = { ok: true, version: VERSION, time: new Date().toISOString() }; break;
          case 'push': result = push_(body.changes || {}); break;
          case 'pull': result = pull_(body.since || ''); break;
          case 'health': result = health_(body.data || body); break;
          case 'seed': result = seed_(body.tables || {}); break;
          case 'status': result = status_(); break;
          case 'set_suggest_token':
            props.setProperty('SUGGEST_TOKEN', String(body.suggest_token || ''));
            result = { ok: true };
            break;
          default: result = { ok: false, error: 'ação desconhecida: ' + action };
        }
      } finally {
        lock.releaseLock();
      }
    }
  } catch (err) {
    result = { ok: false, error: String(err && err.message || err) };
  }
  if (action !== 'pull') log_(action, result.ok, result.error || '', action === 'health' ? JSON.stringify(result.saved || {}) : '');
  return json_(result);
}

/* ---------- actions ---------- */

function push_(changes) {
  var now = new Date().toISOString();
  var counts = {};
  Object.keys(changes).forEach(function (table) {
    if (!SCHEMA[table]) return;
    counts[table] = upsert_(table, changes[table] || [], now);
  });
  if (counts.sessions || counts.set_logs || counts.cardio_logs) {
    try { buildSummary_(); } catch (err) { log_('summary', false, String(err), ''); }
  }
  return { ok: true, counts: counts, server_time: now };
}

function pull_(since) {
  var out = {};
  var serverTime = new Date().toISOString();
  Object.keys(SCHEMA).forEach(function (table) {
    out[table] = readRows_(table).filter(function (r) { return !since || String(r.synced_at) > since; });
  });
  return { ok: true, server_time: serverTime, tables: out };
}

function health_(d) {
  var date = String(d.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var row = {
    id: date, date: date,
    resting_hr: num_(d.resting_hr), avg_hr: num_(d.avg_hr), active_kcal: num_(d.active_kcal),
    steps: num_(d.steps), sleep_h: num_(d.sleep_h), workout_avg_hr: num_(d.workout_avg_hr),
    workout_min: num_(d.workout_min), source: String(d.source || 'Atalho iOS / Saúde').slice(0, 60),
    updated_at: new Date().toISOString(), deleted: false
  };
  upsert_('health_imports', [row], new Date().toISOString());
  return { ok: true, saved: row };
}

function suggest_(body) {
  var payload = body.payload_json;
  if (typeof payload !== 'string') payload = JSON.stringify(payload || {});
  if (payload.length > 20000) return { ok: false, error: 'payload_too_large' };
  var now = new Date().toISOString();
  var row = {
    id: Utilities.getUuid(), author: String(body.author || 'Amigo').slice(0, 40),
    created_at: now, payload_json: payload, status: 'pending', target_date: '',
    updated_at: now, deleted: false
  };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { upsert_('suggestions', [row], now); } finally { lock.releaseLock(); }
  return { ok: true, id: row.id };
}

function status_() {
  var counts = {};
  Object.keys(SCHEMA).forEach(function (t) { counts[t] = readRows_(t).length; });
  var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
  var logs = [];
  if (logSheet && logSheet.getLastRow() > 1) {
    var n = Math.min(10, logSheet.getLastRow() - 1);
    logs = logSheet.getRange(logSheet.getLastRow() - n + 1, 1, n, 5).getValues().reverse().map(function (r) {
      return { time: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), action: r[1], ok: r[2], error: r[3], detail: r[4] };
    });
  }
  return { ok: true, version: VERSION, counts: counts, logs: logs, suggest_token: Boolean(PropertiesService.getScriptProperties().getProperty('SUGGEST_TOKEN')) };
}

/** Human-readable tabs ("📊 Resumo" and "📋 Séries") rebuilt from the raw tables. */
function buildSummary_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = {};
  var exSheet = ss.getSheetByName('exercises');
  if (exSheet && exSheet.getLastRow() > 1) {
    exSheet.getRange(2, 1, exSheet.getLastRow() - 1, 2).getValues().forEach(function (r) { names[r[0]] = r[1]; });
  }
  var alive = function (r) { return r.deleted !== true && String(r.deleted).toUpperCase() !== 'TRUE'; };
  var sessions = readRows_('sessions').filter(alive);
  var sets = readRows_('set_logs').filter(alive);
  var cardio = readRows_('cardio_logs').filter(alive);
  var bySession = {};
  sets.forEach(function (l) { (bySession[l.session_id] = bySession[l.session_id] || []).push(l); });
  var cardioBy = {};
  cardio.forEach(function (c) { cardioBy[c.session_id] = (cardioBy[c.session_id] || 0) + (Number(c.duration_min) || 0); });
  var br = function (d) { var p = String(d).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; };
  var weekday = function (d) {
    var p = String(d).split('-');
    return ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()];
  };
  var sessionRows = sessions.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).map(function (s) {
    var ls = bySession[s.id] || [];
    var vol = ls.reduce(function (a, l) { return a + (Number(l.load_kg) || 0) * (Number(l.reps) || 0); }, 0);
    var prs = ls.filter(function (l) { return l.is_pr === true || String(l.is_pr).toUpperCase() === 'TRUE'; }).length;
    return [br(s.date), weekday(s.date), s.planned_session || '', STATUS_PT[s.status] || s.status, s.duration_min || '', ls.length, Math.round(vol), cardioBy[s.id] || '', prs || ''];
  });
  writeTable_(ss, '📊 Resumo', ['Data', 'Dia', 'Treino', 'Status', 'Duração (min)', 'Séries', 'Volume (kg)', 'Cardio (min)', 'Recordes'], sessionRows);

  var sessionName = {};
  sessions.forEach(function (s) { sessionName[s.id] = s.planned_session; });
  var setRows = sets.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); }).slice(0, 3000).map(function (l) {
    var load = Number(l.load_kg) || 0;
    var reps = Number(l.reps) || 0;
    var e1rm = load > 0 && reps > 0 ? Math.round(load * (1 + reps / 30) * 10) / 10 : '';
    var pr = l.is_pr === true || String(l.is_pr).toUpperCase() === 'TRUE';
    return [br(l.session_id), sessionName[l.session_id] || '', names[l.exercise_id] || l.exercise_id, l.set_number, load, reps, e1rm, pr ? '🏆' : ''];
  });
  writeTable_(ss, '📋 Séries', ['Data', 'Treino', 'Exercício', 'Série', 'Carga (kg)', 'Reps', '1RM est. (kg)', 'Recorde'], setRows);
}

function writeTable_(ss, name, header, rows) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, 0);
    sheet.setFrozenRows(1);
  }
  sheet.clearContents();
  var all = [header].concat(rows);
  if (sheet.getMaxRows() < all.length) sheet.insertRowsAfter(sheet.getMaxRows(), all.length - sheet.getMaxRows() + 100);
  sheet.getRange(1, 1, all.length, header.length).setValues(all);
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
}

function log_(action, ok, error, detail) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET);
      sheet.getRange(1, 1, 1, 5).setValues([['time', 'action', 'ok', 'error', 'detail']]).setFontWeight('bold');
    }
    sheet.appendRow([new Date(), action, ok, error || '', String(detail || '').slice(0, 500)]);
    if (sheet.getLastRow() > 400) sheet.deleteRows(2, 200);
  } catch (err) { /* logging must never break a request */ }
}

function seed_(tables) {
  Object.keys(SEED_SCHEMA).forEach(function (t) {
    var rows = tables[t];
    if (!rows || !rows.length) return;
    var sheet = ensureSheet_(t, SEED_SCHEMA[t]);
    var cols = SEED_SCHEMA[t];
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, cols.length).clearContent();
    var values = rows.map(function (r) { return cols.map(function (c) { return cell_(r[c]); }); });
    ensureCapacity_(sheet, cols, values.length + 1);
    sheet.getRange(2, 1, values.length, cols.length).setValues(values);
  });
  return { ok: true };
}

/* ---------- storage helpers ---------- */

function ensureSheet_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  var header = sheet.getRange(1, 1, 1, cols.length).getValues()[0];
  if (header.join() !== cols.join()) {
    sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    formatTextColumns_(sheet, cols, 1, sheet.getMaxRows());
  }
  return sheet;
}

function formatTextColumns_(sheet, cols, fromRow, count) {
  cols.forEach(function (c, i) {
    if (TEXT_COLUMNS.indexOf(c) >= 0) sheet.getRange(fromRow, i + 1, count, 1).setNumberFormat('@');
  });
}

// Grows the sheet before writing past its last row (getRange cannot go out of bounds).
function ensureCapacity_(sheet, cols, rowsNeeded) {
  var max = sheet.getMaxRows();
  if (rowsNeeded <= max) return;
  var extra = rowsNeeded - max + 500;
  sheet.insertRowsAfter(max, extra);
  formatTextColumns_(sheet, cols, max + 1, extra);
}

function readRows_(table) {
  var cols = SCHEMA[table];
  var sheet = ensureSheet_(table, cols);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var tz = Session.getScriptTimeZone();
  var values = sheet.getRange(2, 1, last - 1, cols.length).getValues();
  return values.filter(function (v) { return v[0] !== ''; }).map(function (v) {
    var o = {};
    cols.forEach(function (c, i) {
      var x = v[i];
      if (x instanceof Date) x = (c === 'date' || c === 'id' || c === 'target_date') ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : x.toISOString();
      o[c] = x;
    });
    return o;
  });
}

function upsert_(table, rows, now) {
  var cols = SCHEMA[table];
  var sheet = ensureSheet_(table, cols);
  var last = sheet.getLastRow();
  var data = last > 1 ? sheet.getRange(2, 1, last - 1, cols.length).getValues() : [];
  var index = {};
  data.forEach(function (r, i) { index[String(r[0])] = i; });
  var iUpd = cols.indexOf('updated_at');
  var iStatus = cols.indexOf('status');
  var written = 0;
  rows.forEach(function (row) {
    if (!row || !row.id) return;
    row.synced_at = now;
    var values = cols.map(function (c) { return cell_(row[c]); });
    var pos = index[String(row.id)];
    if (pos === undefined) {
      index[String(row.id)] = data.length;
      data.push(values);
      written++;
      return;
    }
    var existing = data[pos];
    if (table === 'sessions') {
      // A legacy automatic "missed" mark never beats a real session, whatever the timestamps.
      if (row.status === 'missed' && existing[iStatus] !== 'missed') return;
      var beatsMissed = existing[iStatus] === 'missed' && row.status !== 'missed';
      if (!beatsMissed && String(existing[iUpd]) > String(row.updated_at || '')) return;
    } else if (String(existing[iUpd]) > String(row.updated_at || '')) {
      return; // last write wins
    }
    data[pos] = values;
    written++;
  });
  if (data.length) {
    ensureCapacity_(sheet, cols, data.length + 1);
    sheet.getRange(2, 1, data.length, cols.length).setValues(data);
  }
  return written;
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Accepts 58, "58", "512,4", "9.876" (pt-BR thousands) or "72 bpm". */
function num_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Math.round(v * 10) / 10;
  var str = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) str = str.replace(/\./g, '');
  var m = str.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Math.round(Number(m[0]) * 10) / 10 : '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
