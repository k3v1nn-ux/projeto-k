// Derived numbers for Analytics and trophies: day statuses, adherence, streaks, volume.
import * as db from './db.js';
import { baseDayPlan, exercise, getProgram } from './program.js';
import { exerciseHistory } from './progression.js';
import { settings } from './settings.js';
import { dateKey, addDays, weekStart } from './util.js';

const ATTENDED = new Set(['done', 'partial']);

export function isAttended(session) {
  return Boolean(session && ATTENDED.has(session.status));
}

/** Planned type for a day: lift | cardio | rest (friend overrides are lift days). */
export function plannedType(date) {
  if (db.get('overrides', date)) return 'lift';
  const s = db.get('sessions', date);
  return baseDayPlan(date, s?.level || settings().level).type;
}

/** { date, type, session, state } where state: attended | missed | rest | today | future | before */
export function dayInfo(date, today = dateKey()) {
  const session = db.get('sessions', date);
  const type = plannedType(date);
  let state;
  if (isAttended(session)) state = 'attended';
  else if (date < settings().startDate) state = 'before';
  else if (date > today) state = 'future';
  else if (type === 'rest') state = 'rest';
  else if (date === today) state = 'today';
  else state = 'missed';
  return { date, type, session, state };
}

/** Adherence of one Monday-based week, counting only days that already counted. */
export function weekAdherence(start, today = dateKey()) {
  let planned = 0;
  let attended = 0;
  for (let i = 0; i < 7; i++) {
    const d = dayInfo(addDays(start, i), today);
    if (d.state === 'before' || d.state === 'future') continue;
    if (d.type === 'rest') continue;
    if (d.state === 'today') continue; // today only counts once done
    planned++;
    if (d.state === 'attended') attended++;
  }
  return { planned, attended, pct: planned ? attended / planned : null };
}

/** Full weeks (Mon–Sun, already over) since the program start. */
export function pastWeeks(today = dateKey()) {
  const out = [];
  const first = weekStart(settings().startDate || today);
  for (let w = first; addDays(w, 6) < today; w = addDays(w, 7)) out.push({ start: w, ...weekAdherence(w, today) });
  return out;
}

export function streaks(today = dateKey()) {
  let current = 0;
  let record = 0;
  const start = settings().startDate || today;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const info = dayInfo(d, today);
    if (info.state === 'attended') {
      current++;
      record = Math.max(record, current);
    } else if (info.state === 'missed') {
      current = 0;
    }
  }
  return { current, record };
}

export function totals() {
  const sessions = db.all('sessions').filter(isAttended);
  const liftDurations = sessions.filter((s) => s.duration_min > 0 && db.all('set_logs').some((l) => l.session_id === s.id)).map((s) => s.duration_min);
  return {
    workouts: sessions.length,
    avgDuration: liftDurations.length ? Math.round(liftDurations.reduce((a, b) => a + b, 0) / liftDurations.length) : null,
  };
}

/** Per muscle group: sets and tonnage (sets × reps × load) in a week. */
export function weekVolume(start) {
  const end = addDays(start, 6);
  const out = {};
  for (const l of db.all('set_logs')) {
    if (l.session_id < start || l.session_id > end) continue;
    const g = exercise(l.exercise_id)?.muscle_group || 'outros';
    out[g] ||= { sets: 0, tonnage: 0 };
    out[g].sets++;
    out[g].tonnage += (l.load_kg || 0) * (l.reps || 0);
  }
  return out;
}

export function weekCardioMinutes(start) {
  const end = addDays(start, 6);
  return db.all('cardio_logs').filter((c) => c.session_id >= start && c.session_id <= end).reduce((a, c) => a + (c.duration_min || 0), 0);
}

export function bestCardioMonth() {
  const byMonth = {};
  for (const c of db.all('cardio_logs')) {
    const m = c.session_id.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + (c.duration_min || 0);
  }
  return Math.max(0, ...Object.values(byMonth));
}

export function recentPRs(limit = 8) {
  return db.all('set_logs').filter((l) => l.is_pr).sort((a, b) => String(b.timestamp).localeCompare(a.timestamp)).slice(0, limit);
}

export function loadGainPct(exId) {
  const hist = exerciseHistory(exId).filter((h) => h.topLoad > 0);
  if (hist.length < 2) return 0;
  const first = hist[0].topLoad;
  const best = Math.max(...hist.map((h) => h.topLoad));
  return Math.round(((best - first) / first) * 100);
}

export function exercisesWithHistory() {
  const ids = new Set(db.all('set_logs').map((l) => l.exercise_id));
  return getProgram().exercises.filter((e) => ids.has(e.id));
}

/** Everything the trophies need, computed once. */
export function snapshot(today = dateKey()) {
  const weeks = pastWeeks(today);
  const rules = getProgram().rules.intermediate_unlock;
  return {
    totalWorkouts: totals().workouts,
    streakRecord: streaks(today).record,
    prCount: db.all('set_logs').filter((l) => l.is_pr).length,
    perfectWeeks: weeks.filter((w) => w.planned && w.pct === 1).length,
    weeks80: weeks.filter((w) => w.planned && w.pct >= rules.min_adherence).length,
    bestCardioMonth: bestCardioMonth(),
    legPressGainPct: loadGainPct('leg_press'),
    healthDays: db.all('health_imports').length,
    acceptedSuggestions: db.all('suggestions').filter((s) => s.status === 'accepted').length,
  };
}
