// Training program: which plan applies on a given date, with swaps for unavailable
// equipment, the squat-variant flag, the re-entry week and friend overrides.
import * as db from './db.js';
import { settings } from './settings.js';
import { weekday, daysBetween } from './util.js';

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
  // Second-level alternatives give more options when the gym is crowded.
  (ex?.alternatives || []).forEach((a) => (exercise(a)?.alternatives || []).forEach(add));
  return out;
}

export function isReentry(date) {
  const start = settings().startDate;
  if (!start) return false;
  const d = daysBetween(start, date);
  return d >= 0 && d < 7 * (program.rules.reentry_week.weeks || 1);
}

export function baseDayPlan(date, level = settings().level) {
  const lv = program.levels[level] || program.levels.base;
  return lv.days.find((d) => d.weekday === weekday(date));
}

/**
 * Plan for a date: { type, session_name, exercises:[{exercise_id, planned_id, sets, ...}], source }.
 * A finished session keeps the level it was trained with.
 */
export function dayPlan(date) {
  const session = db.get('sessions', date);
  const level = session?.level || settings().level;
  const override = db.get('overrides', date);
  let plan;
  if (override) {
    const payload = safeJson(override.payload_json) || {};
    plan = { type: 'lift', session_name: override.session_name || payload.session_name || 'Treino do amigo', exercises: payload.exercises || [], source: 'friend', author: payload.author };
  } else {
    const base = baseDayPlan(date, level);
    plan = { ...base, exercises: base.exercises || [], source: 'program' };
  }
  const reentry = plan.type === 'lift' && isReentry(date);
  const rules = program.rules.reentry_week;
  const swaps = daySwaps(date);
  plan.reentry = reentry;
  plan.level = level;
  plan.exercises = plan.exercises.filter((it) => exercise(it.exercise_id)).map((it) => {
    const resolved = swaps[it.exercise_id] || resolveExercise(it.exercise_id);
    const sets = reentry ? Math.max(rules.min_sets, it.sets + rules.set_delta) : it.sets;
    return { ...it, planned_id: it.exercise_id, exercise_id: resolved, sets: Number(sets) || 3 };
  });
  return plan;
}

/** Exercise swaps for a day: saved in the session, or locally before the session starts. */
export function daySwaps(date) {
  const session = db.get('sessions', date);
  let local = {};
  try { local = JSON.parse(localStorage.getItem(`pk.swaps.${date}`) || '{}'); } catch { /* ignore */ }
  return { ...local, ...(safeJson(session?.swaps_json) || {}) };
}

export function setLocalSwaps(date, swaps) {
  try { localStorage.setItem(`pk.swaps.${date}`, JSON.stringify(swaps)); } catch { /* ignore */ }
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
    for (const d of lv.days) {
      (d.exercises || []).forEach((it, i) => plans.push({
        id: `${level}-${d.weekday}-${i + 1}`, level, weekday: d.weekday, session_name: d.session_name,
        exercise_id: it.exercise_id, order: i + 1, sets: it.sets, rep_min: it.rep_min, rep_max: it.rep_max,
        rest_seconds: it.rest_seconds, notes: it.notes,
      }));
      if (d.type !== 'lift') plans.push({ id: `${level}-${d.weekday}-0`, level, weekday: d.weekday, session_name: d.session_name, exercise_id: '', order: 0, notes: d.cardio?.note || '' });
    }
  }
  return { exercises, plans };
}
