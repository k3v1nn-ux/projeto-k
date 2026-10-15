// Double progression, history per exercise and personal records (Epley 1RM).
import * as db from './db.js';
import { exercise } from './program.js';
import { round, fmtKg } from './util.js';

export function e1rm(load, reps) {
  if (!(load > 0) || !(reps > 0)) return 0;
  return reps === 1 ? load : load * (1 + reps / 30);
}

/** [{ date, session_id, session_name, sets:[log...], topLoad, bestE1rm, volume }] oldest first. */
export function exerciseHistory(exId) {
  const groups = new Map();
  for (const l of db.all('set_logs')) {
    if (l.exercise_id !== exId) continue;
    if (!groups.has(l.session_id)) groups.set(l.session_id, []);
    groups.get(l.session_id).push(l);
  }
  return Array.from(groups.entries()).map(([sid, sets]) => {
    sets.sort((a, b) => a.set_number - b.set_number || String(a.timestamp).localeCompare(b.timestamp));
    const session = db.get('sessions', sid);
    return {
      session_id: sid,
      date: session?.date || sid,
      session_name: session?.planned_session || '',
      sets,
      topLoad: Math.max(...sets.map((s) => s.load_kg || 0)),
      bestE1rm: Math.max(...sets.map((s) => e1rm(s.load_kg, s.reps))),
      volume: sets.reduce((acc, s) => acc + (s.load_kg || 0) * (s.reps || 0), 0),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function summarize(entry) {
  if (!entry) return '';
  const loads = new Set(entry.sets.map((s) => s.load_kg));
  if (loads.size === 1) return `${fmtKg(entry.sets[0].load_kg)} kg × ${entry.sets.map((s) => s.reps).join(', ')}`;
  return entry.sets.map((s) => `${fmtKg(s.load_kg)}×${s.reps}`).join(', ');
}

/**
 * Suggestion for today: { load, reps:[per set], trend: new|up|same|down|max, last, lastText }.
 * Prefers history from the same planned session (e.g. leg press in "Inferior B" uses 12–15 reps).
 */
export function suggestion(item, date, sessionName) {
  const ex = exercise(item.exercise_id);
  const sets = item.sets;
  const hist = exerciseHistory(item.exercise_id).filter((h) => h.date < date);
  const same = hist.filter((h) => h.session_name === sessionName);
  const pool = same.length ? same : hist;
  const fill = (n) => Array.from({ length: sets }, () => n);
  if (!pool.length) {
    return { load: ex?.start_load_kg ?? 0, reps: fill(item.rep_min), trend: 'new', last: null, lastText: '' };
  }
  const last = pool[pool.length - 1];
  const inc = ex?.increment_kg || 0;
  const work = last.topLoad;
  const workSets = last.sets.filter((s) => (s.load_kg || 0) >= work);
  const allTop = workSets.length >= sets && workSets.every((s) => s.reps >= item.rep_max);
  const base = { last, lastText: summarize(last) };

  if (allTop) {
    if (inc > 0) return { ...base, load: round(work + inc, 0.5), reps: fill(item.rep_min), trend: 'up' };
    return { ...base, load: work, reps: fill(item.rep_max), trend: 'max' };
  }
  const prev = pool[pool.length - 2];
  const below = (h) => h && h.topLoad === work && h.sets.every((s) => s.reps < item.rep_min);
  if (inc > 0 && below(last) && below(prev)) {
    const lower = Math.max(0, Math.round((work * 0.9) / inc) * inc);
    return { ...base, load: round(lower, 0.5), reps: fill(item.rep_min), trend: 'down' };
  }
  const reps = Array.from({ length: sets }, (_, i) => {
    const r = last.sets[i]?.reps ?? item.rep_min;
    return Math.min(item.rep_max, Math.max(item.rep_min, r + 1));
  });
  return { ...base, load: work, reps, trend: 'same' };
}

/** Compares a set against the same exercise in earlier sessions (not earlier sets today). */
export function checkPR(exId, load, reps, sessionId) {
  const prev = db.all('set_logs').filter((l) => l.exercise_id === exId && l.session_id < sessionId);
  if (!prev.length || !(load > 0)) return { load: false, e1rm: false };
  const maxLoad = Math.max(...prev.map((l) => l.load_kg || 0));
  const maxE = Math.max(...prev.map((l) => e1rm(l.load_kg, l.reps)));
  return { load: load > maxLoad, e1rm: e1rm(load, reps) > maxE + 0.05 };
}

export const TREND_LABEL = {
  new: 'primeira vez — ache a carga',
  up: '↑ subir carga',
  same: 'mesma carga, +1 rep',
  down: '↓ reduzir 10% e reconstruir',
  max: 'topo da faixa — dificulte',
};
