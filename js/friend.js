// Workouts built by a friend: share link, pending suggestions and accepting them fully or
// partially (day by day). A suggestion payload has one or more days; legacy single-day payloads
// are read as one day.
import * as db from './db.js';
import { exercise, weekProjection } from './program.js';
import { settings, updateSettings, isConfigured } from './settings.js';
import { api } from './sync.js';
import { dateKey, randomToken, packJson, uuid, nowIso, addDays } from './util.js';

export function pendingSuggestions() {
  return db.all('suggestions').filter((s) => s.status === 'pending').sort((a, b) => String(b.created_at).localeCompare(a.created_at));
}

const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || d));

function cleanExercises(list) {
  return (Array.isArray(list) ? list : []).filter((it) => exercise(it?.exercise_id)).slice(0, 15).map((it) => {
    const rmin = clamp(it.rep_min, 1, 50, 8);
    return {
      exercise_id: it.exercise_id, sets: clamp(it.sets, 1, 10, 3), rep_min: rmin,
      rep_max: Math.max(rmin, clamp(it.rep_max, 1, 50, 12)), rest_seconds: clamp(it.rest_seconds, 15, 600, 90),
      notes: String(it.notes || '').slice(0, 200),
    };
  });
}

/** { author, notes, days: [{ name, exercises }] } with only known exercises and sane numbers. */
export function sanitizePayload(p) {
  const rawDays = Array.isArray(p?.days) && p.days.length ? p.days : [{ name: p?.session_name, exercises: p?.exercises }];
  return {
    v: 2,
    author: String(p?.author || 'Amigo').slice(0, 40),
    notes: String(p?.notes || '').slice(0, 500),
    days: rawDays.slice(0, 7).map((d, i) => ({ name: String(d?.name || `Dia ${i + 1}`).slice(0, 60), exercises: cleanExercises(d?.exercises) })).filter((d) => d.exercises.length),
  };
}

export function suggestionPayload(sug) {
  let raw = {};
  try { raw = JSON.parse(sug.payload_json || '{}'); } catch { /* ignore */ }
  return sanitizePayload({ ...raw, author: sug.author || raw.author });
}

export async function addLocalSuggestion(payload) {
  const clean = sanitizePayload(payload);
  return db.save('suggestions', { id: uuid(), author: clean.author, created_at: nowIso(), payload_json: JSON.stringify(clean), status: 'pending', target_date: '' });
}

/** Free or planned days from today on, to place accepted friend days (skips rest/done days). */
export function suggestedDates(count) {
  const out = [];
  for (let i = 0; out.length < count && i < 28; i++) {
    const d = addDays(dateKey(), i);
    const p = weekProjection(d)[d];
    const s = db.get('sessions', d);
    if (s && ['done', 'partial', 'rest'].includes(s.status)) continue;
    if (db.get('overrides', d)) continue;
    if (!p || p.kind === 'today' || p.kind === 'planned') out.push(d);
  }
  return out;
}

/**
 * Accepts some days: picks = [{ index, date }]. Each accepted day becomes the workout of its date
 * (an override); the suggestion becomes "accepted" (all days) or "partial".
 */
export async function acceptDays(sug, picks) {
  const p = suggestionPayload(sug);
  const rows = picks.map(({ index, date }) => {
    const day = p.days[index];
    return {
      id: date, date, suggestion_id: sug.id, session_name: `${day.name} (${p.author})`,
      payload_json: JSON.stringify({ author: p.author, session_name: day.name, notes: p.notes, exercises: day.exercises }),
    };
  });
  if (rows.length) await db.save('overrides', rows);
  const status = picks.length === 0 ? 'rejected' : picks.length === p.days.length ? 'accepted' : 'partial';
  await db.save('suggestions', { ...sug, status, target_date: picks.map((x) => x.date).join(',') });
  return status;
}

export async function rejectSuggestion(sug) {
  await db.save('suggestions', { ...sug, status: 'rejected' });
}

/** Builds the link the friend opens (with a suggest-only token when the sheet is configured). */
export async function friendLink() {
  const s = settings();
  const name = db.get('profile', 'me')?.name || s.ownerName || '';
  const config = { n: name };
  let warning = '';
  if (isConfigured()) {
    try {
      let token = s.suggestToken;
      if (!token) {
        token = randomToken(12);
        await api('set_suggest_token', { suggest_token: token });
        updateSettings({ suggestToken: token });
      }
      Object.assign(config, { u: s.apiUrl, t: token });
    } catch (err) {
      warning = `Sem conexão com a planilha; o link usará só o envio pelo WhatsApp (${err.message}).`;
    }
  }
  return { link: `${location.origin}${location.pathname}#/amigo?c=${await packJson(config)}`, warning };
}
