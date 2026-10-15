// Session lifecycle: start, log sets, swaps, finish, cardio and automatic "missed" days.
import * as db from './db.js';
import { daySwaps, setLocalSwaps, baseDayPlan } from './program.js';
import { checkPR } from './progression.js';
import { settings } from './settings.js';
import { uuid, nowIso, dateKey, addDays } from './util.js';

export function sessionFor(date) {
  return db.get('sessions', date);
}

export function isActive(session) {
  return session && session.status === 'in_progress';
}

export async function ensureSession(date, plan) {
  const s = db.get('sessions', date);
  if (s && s.status !== 'missed') return s;
  return db.save('sessions', {
    id: date, date, planned_session: plan.session_name, level: plan.level,
    start_time: nowIso(), end_time: '', duration_min: null, status: 'in_progress', notes: '',
    swaps_json: JSON.stringify(daySwaps(date)),
  });
}

export async function reopenSession(date) {
  const s = db.get('sessions', date);
  if (s) await db.save('sessions', { ...s, status: 'in_progress', end_time: '' });
}

export async function setSwap(date, plannedId, newId) {
  const swaps = { ...daySwaps(date), [plannedId]: newId };
  const s = db.get('sessions', date);
  if (s && s.status !== 'missed') await db.save('sessions', { ...s, swaps_json: JSON.stringify(swaps) });
  else setLocalSwaps(date, swaps);
}

export function setsFor(date, exId) {
  return db.all('set_logs')
    .filter((l) => l.session_id === date && l.exercise_id === exId)
    .sort((a, b) => a.set_number - b.set_number);
}

export async function logSet(date, plan, exId, setNumber, load, reps) {
  await ensureSession(date, plan);
  const id = uuid();
  const pr = checkPR(exId, load, reps, date);
  const log = await db.save('set_logs', {
    id, session_id: date, exercise_id: exId, set_number: setNumber,
    load_kg: load, reps, rpe: null, timestamp: nowIso(), is_pr: pr.load || pr.e1rm,
  });
  return { log, pr };
}

export async function updateSet(log, patch) {
  const merged = { ...log, ...patch };
  const pr = checkPR(log.exercise_id, merged.load_kg, merged.reps, log.session_id);
  return db.save('set_logs', { ...merged, is_pr: pr.load || pr.e1rm });
}

export async function deleteSet(log) {
  await db.remove('set_logs', log.id);
}

export function plannedSetCount(plan) {
  return plan.exercises.reduce((a, it) => a + it.sets, 0);
}

export function loggedSetCount(date) {
  return db.all('set_logs').filter((l) => l.session_id === date).length;
}

/** Ends the session: done with >= 75% of the planned sets, otherwise partial. */
export async function finishSession(date, plan) {
  const s = db.get('sessions', date);
  if (!s) return null;
  const planned = plannedSetCount(plan);
  const logged = loggedSetCount(date);
  const hasCardio = db.all('cardio_logs').some((c) => c.session_id === date);
  if (!logged && !hasCardio) {
    await db.remove('sessions', date);
    return null;
  }
  const end = new Date();
  const sameDay = date === dateKey();
  const duration = sameDay && s.start_time ? Math.round((end - new Date(s.start_time)) / 60000) : s.duration_min;
  const status = !planned || logged >= planned * 0.75 ? 'done' : 'partial';
  return db.save('sessions', { ...s, status, end_time: end.toISOString(), duration_min: duration });
}

export async function logCardio(date, plan, { type, duration_min, avg_hr, notes }) {
  const existing = db.get('sessions', date);
  if (!existing || existing.status === 'missed') {
    const cardioDay = plan.type !== 'lift';
    await db.save('sessions', {
      id: date, date, planned_session: plan.session_name, level: plan.level,
      start_time: nowIso(), end_time: cardioDay ? nowIso() : '', duration_min: cardioDay ? duration_min : null,
      status: cardioDay ? 'done' : 'in_progress', notes: '', swaps_json: '',
    });
  }
  return db.save('cardio_logs', { id: uuid(), session_id: date, type, duration_min, avg_hr: avg_hr || null, notes: notes || '' });
}

export function cardioFor(date) {
  return db.all('cardio_logs').filter((c) => c.session_id === date);
}

/**
 * Planned lift/cardio days without a session by the end of the day become "missed".
 * Stale in-progress sessions from past days are closed as partial (or missed if empty).
 */
export async function markMissedDays() {
  const start = settings().startDate;
  const today = dateKey();
  if (!start || start >= today) return 0;
  const rows = [];
  for (let d = start; d < today; d = addDays(d, 1)) {
    const raw = db.getRaw('sessions', d);
    const session = raw && !raw.deleted ? raw : null;
    if (session?.status === 'in_progress') {
      const hasLogs = loggedSetCount(d) > 0 || cardioFor(d).length > 0;
      rows.push({ ...session, status: hasLogs ? 'partial' : 'missed', end_time: session.end_time || '' });
      continue;
    }
    if (session) continue;
    const plan = db.get('overrides', d) ? { type: 'lift' } : baseDayPlan(d, settings().level);
    if (plan.type === 'rest') continue;
    rows.push({
      id: d, date: d, planned_session: plan.session_name || 'Treino do amigo', level: settings().level,
      start_time: '', end_time: '', duration_min: null, status: 'missed', notes: '', swaps_json: '',
    });
  }
  if (rows.length) await db.save('sessions', rows);
  return rows.length;
}
