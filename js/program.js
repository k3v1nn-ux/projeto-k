// Training program as a rotation (Superior A → Inferior A → Superior B → Inferior B) with a
// weekly target. The suggested workout is always the slot done longest ago, so resting, skipping
// or training something else never unbalances the muscle groups. Also handles swaps for
// unavailable equipment, the squat-variant flag, the re-entry week and friend workouts.
import * as db from './db.js';
import { settings } from './settings.js';
import { weekday, daysBetween, dateKey, addDays, weekStart } from './util.js';

let program = null;
let byId = new Map();

export async function loadProgram() {
  const res = await fetch('data/program.json');
  program = await res.json();
  byId = new Map(program.exercises.map((e) => [e.id, e]));
  return program;
}

export const getProgram = () => program;
export const exercise = (id) => byId.get(id);
export const allExercises = () => program.exercises;

export function weeklyTarget() {
  return Number(settings().weeklyTarget) || program.levels.base.weekly_target || 4;
}

export function rotation(level = settings().level) {
  return (program.levels[level] || program.levels.base).rotation;
}

export function slotDef(slot, level = settings().level) {
  return rotation(level).find((d) => d.slot === slot) || rotation('base').find((d) => d.slot === slot);
}

export function isUsable(ex) {
  if (!ex) return false;
  const s = settings();
  if (ex.is_squat_variant && !s.allowSquatVariants) return false;
  return !s.unavailable.includes(ex.id);
}

/** First usable exercise among the original and its alternatives. */
export function resolveExercise(id) {
  const ex = exercise(id);
  if (isUsable(ex)) return id;
  const alt = (ex?.alternatives || []).find((a) => isUsable(exercise(a)));
  return alt || id;
}

export function usableAlternatives(id) {
  const ex = exercise(id);
  const seen = new Set([id]);
  const out = [];
  const add = (aid) => {
    if (seen.has(aid)) return;
    seen.add(aid);
    if (isUsable(exercise(aid))) out.push(aid);
  };
  (ex?.alternatives || []).forEach(add);
  (ex?.alternatives || []).forEach((a) => (exercise(a)?.alternatives || []).forEach(add));
  return out;
}

export function isReentry(date) {
  const start = settings().startDate;
  if (!start) return false;
  const d = daysBetween(start, date);
  return d >= 0 && d < 7 * (program.rules.reentry_week.weeks || 1);
}

/* ---------- sessions & rotation ---------- */

/** A session that counts as a lifting workout (it consumes its rotation slot). */
export function isLift(s) {
  return Boolean(s && !s.deleted && (s.status === 'done' || s.status === 'partial') && hasSets(s.id));
}

function hasSets(sessionId) {
  return (db.index('set_logs', 'session_id').get(sessionId) || []).length > 0;
}

/** Slot of a session: stored, or inferred from older sessions by name. */
export function sessionSlot(s) {
  if (!s) return '';
  if (s.slot) return s.slot;
  const name = String(s.planned_session || '').replace(/\+$/, '').trim();
  for (const lv of Object.values(program.levels)) {
    const hit = lv.rotation.find((d) => d.session_name.replace(/\+$/, '') === name);
    if (hit) return hit.slot;
  }
  return '';
}

/** Last date each rotation slot was trained, strictly before `date`. */
export function lastDoneBySlot(beforeDate = '9999') {
  const out = {};
  for (const s of db.all('sessions')) {
    if (s.date >= beforeDate || !isLift(s)) continue;
    const slot = sessionSlot(s);
    if (slot && (!out[slot] || s.date > out[slot])) out[slot] = s.date;
  }
  return out;
}

/** Rotation order by "done longest ago" (never done first, then rotation order). */
export function slotQueue(lastDone, level = settings().level) {
  return rotation(level)
    .map((d, i) => ({ slot: d.slot, i, last: lastDone[d.slot] || '' }))
    .sort((a, b) => a.last.localeCompare(b.last) || a.i - b.i)
    .map((x) => x.slot);
}

export function nextSlot(date = dateKey()) {
  return slotQueue(lastDoneBySlot(date))[0];
}

function readChoice(date) {
  try { return localStorage.getItem(`pk.choice.${date}`) || ''; } catch { return ''; }
}

/** The user picked another workout for a day that has not started yet. */
export function setChoice(date, slot) {
  try {
    if (slot) localStorage.setItem(`pk.choice.${date}`, slot);
    else localStorage.removeItem(`pk.choice.${date}`);
  } catch { /* ignore */ }
  db.invalidate();
}

/**
 * Projection for the week containing `date`: { [date]: {kind, slot} } where kind is
 * done | today | planned | cardio | rest | free | today-free. Remaining workouts go on the next
 * days not marked rest, preferring days outside the preferred rest weekdays. Future weeks are
 * simulated from the current one so the rotation keeps flowing.
 */
export function weekProjection(date = dateKey()) {
  return db.cached(`proj:${weekStart(date)}:${dateKey()}:${settings().level}:${weeklyTarget()}:${(settings().restDays || []).join()}`, () => {
    const today = dateKey();
    const lastDone = lastDoneBySlot(addDays(today, 1)); // includes a workout already done today
    let start = weekStart(today);
    const target = weekStart(date);
    if (target < start) return projectWeek(target, {}, false);
    let out = projectWeek(start, lastDone, true);
    while (start < target) {
      start = addDays(start, 7);
      out = projectWeek(start, lastDone, true);
    }
    return out;
  });
}

function projectWeek(start, lastDone, simulate) {
  const today = dateKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const out = {};
  let done = 0;
  let friend = 0;
  for (const d of days) {
    const s = db.get('sessions', d);
    if (d === today && s?.status === 'in_progress') {
      out[d] = { kind: 'today', slot: sessionSlot(s) || 'friend' };
      if (sessionSlot(s) && simulate) lastDone[sessionSlot(s)] = d; // the next days get the following slots
      done++;
    } else if (isLift(s)) {
      out[d] = { kind: 'done', slot: sessionSlot(s) };
      done++;
    } else if (db.get('overrides', d) && d >= today) {
      out[d] = { kind: d === today ? 'today' : 'planned', slot: 'friend' };
      friend++;
    } else if (s?.status === 'rest') {
      out[d] = { kind: 'rest' };
    } else if (s?.status === 'cardio' && d < today) {
      out[d] = { kind: 'cardio' };
    } else if (d < today) {
      out[d] = { kind: 'free' };
    }
  }
  if (!simulate) return out;
  const open = days.filter((d) => !out[d]);
  const remaining = Math.max(0, weeklyTarget() - done - friend);
  const preferredRest = new Set(settings().restDays || []);
  const ordered = [
    ...open.filter((d) => d === today || !preferredRest.has(weekday(d))),
    ...open.filter((d) => d !== today && preferredRest.has(weekday(d))),
  ];
  const chosen = new Set(ordered.slice(0, remaining));
  for (const d of open) {
    const cardioToday = d === today && db.get('sessions', d)?.status === 'cardio';
    if (!chosen.has(d)) {
      out[d] = { kind: d === today ? (cardioToday ? 'cardio' : 'today-free') : 'free' };
      continue;
    }
    const slot = (d === today && readChoice(d)) || slotQueue(lastDone)[0];
    lastDone[slot] = d;
    out[d] = { kind: d === today ? 'today' : 'planned', slot, cardio: cardioToday };
  }
  return out;
}

/** Exercise swaps for a day: saved in the session, or locally before the session starts. */
export function daySwaps(date) {
  const session = db.get('sessions', date);
  let local = {};
  try { local = JSON.parse(localStorage.getItem(`pk.swaps.${date}`) || '{}'); } catch { /* ignore */ }
  return { ...local, ...(safeJson(session?.swaps_json) || {}) };
}

/** Per-day set counts changed with "+ Série" / "− Série" (keyed by the planned exercise). */
export function daySetCounts(date) {
  try { return JSON.parse(localStorage.getItem(`pk.sets.${date}`) || '{}'); } catch { return {}; }
}

export function setDaySetCount(date, plannedId, count) {
  const all = daySetCounts(date);
  if (count === null) delete all[plannedId]; else all[plannedId] = count;
  try { localStorage.setItem(`pk.sets.${date}`, JSON.stringify(all)); } catch { /* ignore */ }
  db.invalidate();
}

export function setLocalSwaps(date, swaps) {
  try { localStorage.setItem(`pk.swaps.${date}`, JSON.stringify(swaps)); } catch { /* ignore */ }
  db.invalidate();
}

/** Slot that would be trained on `date` (session, explicit choice, projection, or next in queue). */
export function slotFor(date) {
  const s = db.get('sessions', date);
  if (s && sessionSlot(s) && s.status !== 'rest') return sessionSlot(s);
  const choice = readChoice(date);
  if (choice) return choice;
  const proj = weekProjection(date)[date];
  return proj?.slot && proj.slot !== 'friend' ? proj.slot : nextSlot(date);
}

/**
 * Plan for a date: { type: lift|rest, slot, session_name, focus, exercises:[...], source, level, reentry }.
 * A started session keeps the level it was trained with.
 */
export function dayPlan(date, forcedSlot) {
  const session = db.get('sessions', date);
  const level = session?.level || settings().level;
  const override = db.get('overrides', date);
  let plan;
  if (override && !forcedSlot) {
    const payload = safeJson(override.payload_json) || {};
    plan = {
      type: 'lift', slot: 'friend', session_name: override.session_name || payload.session_name || 'Treino do amigo',
      focus: payload.notes || `Montado por ${payload.author || 'um amigo'}`, exercises: payload.exercises || [], source: 'friend', author: payload.author,
    };
  } else {
    const slot = forcedSlot || slotFor(date);
    const def = slotDef(slot, level);
    plan = { ...def, type: 'lift', slot, exercises: def.exercises, source: 'program' };
  }
  if (session?.status === 'rest' && !forcedSlot) plan.rest = true;
  const reentry = isReentry(date);
  const rules = program.rules.reentry_week;
  const swaps = daySwaps(date);
  const counts = daySetCounts(date);
  plan.reentry = reentry;
  plan.level = level;
  plan.exercises = plan.exercises.filter((it) => exercise(it.exercise_id)).map((it) => {
    const resolved = swaps[it.exercise_id] || resolveExercise(it.exercise_id);
    const base = reentry ? Math.max(rules.min_sets, it.sets + rules.set_delta) : it.sets;
    const sets = counts[it.exercise_id] ?? base;
    return { ...it, planned_id: it.exercise_id, exercise_id: resolved, sets: Number(sets) || 1, base_sets: Number(base) || 3 };
  });
  return plan;
}

export function estimateMinutes(plan) {
  const sec = plan.exercises.reduce((a, it) => a + it.sets * (45 + it.rest_seconds), 0);
  return Math.round(sec / 60 / 5) * 5 + (getProgram().rules.cardio_pre?.minutes || 10);
}

export function safeJson(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return null; }
}

/** Rows for the spreadsheet's exercises/plans tabs (seed). */
export function seedTables() {
  const exercises = program.exercises.map((e) => ({
    id: e.id, name_pt: e.name_pt, muscle_group: e.muscle_group, equipment: e.equipment,
    media_url: e.media_url, instructions: e.instructions.join(' | '), alternatives: e.alternatives.join(','),
    is_squat_variant: e.is_squat_variant, active: e.active,
  }));
  const plans = [];
  for (const [level, lv] of Object.entries(program.levels)) {
    for (const d of lv.rotation) {
      d.exercises.forEach((it, i) => plans.push({
        id: `${level}-${d.slot}-${i + 1}`, level, slot: d.slot, rotation_order: d.order, session_name: d.session_name,
        exercise_id: it.exercise_id, order: i + 1, sets: it.sets, rep_min: it.rep_min, rep_max: it.rep_max,
        rest_seconds: it.rest_seconds, notes: it.notes,
      }));
    }
  }
  return { exercises, plans };
}
