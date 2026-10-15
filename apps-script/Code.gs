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
 */

var SCHEMA = {
  sessions: ['id', 'date', 'planned_session', 'level', 'start_time', 'end_time', 'duration_min', 'status', 'notes', 'swaps_json', 'updated_at', 'deleted', 'synced_at'],
  set_logs: ['id', 'session_id', 'exercise_id', 'set_number', 'load_kg', 'reps', 'rpe', 'timestamp', 'is_pr', 'updated_at', 'deleted', 'synced_at'],
  cardio_logs: ['id', 'session_id', 'type', 'duration_min', 'avg_hr', 'notes', 'updated_at', 'deleted', 'synced_at'],
  achievements: ['id', 'unlocked_at', 'updated_at', 'deleted', 'synced_at'],
  suggestions: ['id', 'author', 'created_at', 'payload_json', 'status', 'target_date', 'updated_at', 'deleted', 'synced_at'],
  health_imports: ['id', 'date', 'resting_hr', 'avg_hr', 'active_kcal', 'steps', 'sleep_h', 'workout_avg_hr', 'workout_min', 'source', 'updated_at', 'deleted', 'synced_at'],
  overrides: ['id', 'date', 'suggestion_id', 'session_name', 'payload_json', 'updated_at', 'deleted', 'synced_at']
};

var SEED_SCHEMA = {
  exercises: ['id', 'name_pt', 'muscle_group', 'equipment', 'media_url', 'instructions', 'alternatives', 'is_squat_variant', 'active'],
  plans: ['id', 'level', 'weekday', 'session_name', 'exercise_id', 'order', 'sets', 'rep_min', 'rep_max', 'rest_seconds', 'notes']
};

// Columns kept as plain text so Sheets does not turn them into Date objects.
var TEXT_COLUMNS = ['id', 'date', 'target_date', 'start_time', 'end_time', 'timestamp', 'created_at', 'unlocked_at', 'updated_at', 'synced_at', 'session_id'];

var STATUS_RANK = { missed: 0, in_progress: 1, partial: 2, done: 3 };

function initialize() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Object.keys(SCHEMA).forEach(function (t) { ensureSheet_(t, SCHEMA[t]); });
  Object.keys(SEED_SCHEMA).forEach(function (t) { ensureSheet_(t, SEED_SCHEMA[t]); });
  Logger.log('TOKEN (cole em Configurações do app): ' + props.getProperty('TOKEN'));
}

function rotateToken() {
  PropertiesService.getScriptProperties().setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('Novo TOKEN: ' + PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

function doGet() {
  return json_({ ok: true, app: 'projeto-k', time: new Date().toISOString() });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid_json' });
  }
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  var suggestToken = props.getProperty('SUGGEST_TOKEN');
  var isOwner = token && body.token === token;
  var isFriend = suggestToken && body.token === suggestToken;

  try {
    if (body.action === 'suggest' && (isOwner || isFriend)) return json_(suggest_(body));
    if (!isOwner) return json_({ ok: false, error: 'unauthorized' });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (body.action) {
        case 'ping': return json_({ ok: true, time: new Date().toISOString() });
        case 'push': return json_(push_(body.changes || {}));
        case 'pull': return json_(pull_(body.since || ''));
        case 'health': return json_(health_(body.data || body));
        case 'seed': return json_(seed_(body.tables || {}));
        case 'set_suggest_token':
          props.setProperty('SUGGEST_TOKEN', String(body.suggest_token || ''));
          return json_({ ok: true });
        default: return json_({ ok: false, error: 'unknown_action' });
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- actions ---------- */

function push_(changes) {
  var now = new Date().toISOString();
  var counts = {};
  Object.keys(changes).forEach(function (table) {
    if (!SCHEMA[table]) return;
    counts[table] = upsert_(table, changes[table] || [], now);
  });
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
    workout_min: num_(d.workout_min), source: String(d.source || 'Atalho iOS / Saúde'),
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
      // A real session always beats the automatic "missed" mark, whatever the timestamps.
      if (row.status === 'missed' && (STATUS_RANK[existing[iStatus]] || 0) > 0) return;
      var beatsMissed = existing[iStatus] === 'missed' && (STATUS_RANK[row.status] || 0) > 0;
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

function num_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? '' : Math.round(n * 10) / 10;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
