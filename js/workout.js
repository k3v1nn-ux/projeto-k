// Session lifecycle: start, log sets, swaps, finish, cardio (warm-up or cardio-only days),
// rest days chosen by the user, and closing sessions left open on past days.
import * as db from './db.js';
import { daySwaps, setLocalSwaps, setChoice, dayPlan } from './program.js';
import { checkPR } from './progression.js';
import { uuid, nowIso, dateKey } from './util.js';

export function sessionFor(date) {
  return db.get('sessions', date);
}

/** Starts (or resumes) the lifting session of a day. */
export async function ensureSession(date, plan) {
  const s = db.get('sessions', date);
  if (s && !['rest', 'missed'].includes(s.status) && (s.status !== 'cardio' || s.slot)) {
    if (s.status === 'cardio') return db.save('sessions', { ...s, status: 'in_progress', slot: plan.slot, planned_session: plan.session_name });
    return s;
  }
  return db.save('sessions', {
    id: date, date, planned_session: plan.session_name, level: plan.level, slot: plan.slot,
    start_time: s?.start_time || nowIso(), end_time: '', duration_min: null, status: 'in_progress', notes: '',
    swaps_json: JSON.stringify(daySwaps(date)),
  });
}

export async function reopenSession(date) {
  const s = db.get('sessions', date);
  if (s) await db.save('sessions', { ...s, status: 'in_progress', end_time: '' });
}

/** Chooses another workout for the day; an in-progress session without sets switches too. */
export async function chooseWorkout(date, slot, plan) {
  setChoice(date, slot);
  const s = db.get('sessions', date);
  if (s && s.status === 'in_progress' && !setsForSession(date).length) {
    await db.save('sessions', { ...s, slot, planned_session: plan.session_name, swaps_json: '' });
  }
}

export async function markRest(date) {
  const s = db.get('sessions', date);
  if (s && setsForSession(date).length) return false; // a day with logged sets is never a rest day
  await db.save('sessions', {
    id: date, date, planned_session: 'Descanso', level: s?.level || '', slot: '', start_time: '', end_time: '',
    duration_min: null, status: 'rest', notes: s?.notes || '', swaps_json: '',
  });
  return true;
}

export async function unmarkRest(date) {
  const s = db.get('sessions', date);
  if (s?.status === 'rest') await db.remove('sessions', date);
}

export async function setSwap(date, plannedId, newId) {
  const swaps = { ...daySwaps(date), [plannedId]: newId };
  const s = db.get('sessions', date);
  if (s && s.status === 'in_progress') await db.save('sessions', { ...s, swaps_json: JSON.stringify(swaps) });
  else setLocalSwaps(date, swaps);
}

export function setsForSession(date) {
  return db.index('set_logs', 'session_id').get(date) || [];
}

export function setsFor(date, exId) {
  return setsForSession(date).filter((l) => l.exercise_id === exId).sort((a, b) => a.set_number - b.set_number);
}

export async function logSet(date, plan, exId, setNumber, load, reps) {
  await ensureSession(date, plan);
  const pr = checkPR(exId, load, reps, date);
  const log = await db.save('set_logs', {
    id: uuid(), session_id: date, exercise_id: exId, set_number: setNumber,
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
  return setsForSession(date).length;
}

export function cardioFor(date) {
  return db.index('cardio_logs', 'session_id').get(date) || [];
}

/** done (>= 75% of the planned sets), partial, cardio (only cardio) or removed if empty. */
function statusFor(date, plan) {
  const logged = loggedSetCount(date);
  if (logged) return !plan || logged >= plannedSetCount(plan) * 0.75 ? 'done' : 'partial';
  return cardioFor(date).length ? 'cardio' : '';
}

export async function finishSession(date, plan) {
  const s = db.get('sessions', date);
  if (!s) return null;
  const status = statusFor(date, plan);
  if (!status) {
    await db.remove('sessions', date);
    return null;
  }
  const end = new Date();
  const sameDay = date === dateKey();
  const duration = sameDay && s.start_time ? Math.max(1, Math.round((end - new Date(s.start_time)) / 60000)) : s.duration_min;
  return db.save('sessions', { ...s, status, end_time: end.toISOString(), duration_min: duration });
}

/** How the workout felt, 1–5, picked with an emoji when finishing. */
export const RATINGS = [[1, '😫', 'Péssimo'], [2, '😕', 'Ruim'], [3, '🙂', 'Ok'], [4, '😀', 'Bom'], [5, '🤩', 'Excelente']];
export const ratingEmoji = (n) => RATINGS.find(([v]) => v === Number(n))?.[1] || '';

export async function rateSession(date, rating) {
  const s = db.get('sessions', date);
  if (s) await db.save('sessions', { ...s, rating });
}

/**
 * Logs cardio. phase "pre" = warm-up before lifting (the session stays a lifting session);
 * phase "only" = the day was just cardio: the workout stays pending in the rotation.
 */
export async function logCardio(date, plan, { type, duration_min, avg_hr, notes, phase = 'pre' }) {
  const existing = db.get('sessions', date);
  if (!existing || ['rest', 'missed'].includes(existing.status)) {
    await db.save('sessions', {
      id: date, date, planned_session: phase === 'only' ? 'Só cardio' : plan.session_name, level: plan.level,
      slot: phase === 'only' ? '' : plan.slot, start_time: nowIso(), end_time: phase === 'only' ? nowIso() : '',
      duration_min: phase === 'only' ? duration_min : null, status: phase === 'only' ? 'cardio' : 'in_progress',
      notes: '', swaps_json: JSON.stringify(daySwaps(date)),
    });
  } else if (phase === 'only' && !loggedSetCount(date)) {
    await db.save('sessions', { ...existing, status: 'cardio', planned_session: 'Só cardio', slot: '', end_time: nowIso(), duration_min: duration_min });
  }
  return db.save('cardio_logs', { id: uuid(), session_id: date, type, duration_min, avg_hr: avg_hr || null, notes: notes || '', phase });
}

/** Sessions left "in progress" on past days are closed (done/partial/cardio) or dropped if empty. */
export async function closeStaleSessions() {
  const today = dateKey();
  let n = 0;
  for (const s of db.all('sessions')) {
    if (s.status !== 'in_progress' || s.date >= today) continue;
    const status = statusFor(s.date, s.slot ? dayPlan(s.date) : null);
    if (status) await db.save('sessions', { ...s, status });
    else await db.remove('sessions', s.id);
    n++;
  }
  return n;
}
