// Derived numbers for Progress and trophies. Adherence is weekly: lifting workouts done ÷ the
// weekly target. There are no per-day "misses": rest days are the user's choice and a
// cardio-only day is activity, not a workout.
import * as db from './db.js';
import { exercise, getProgram, isLift, sessionSlot, weeklyTarget, rotation } from './program.js';
import { exerciseHistory, exerciseTrend } from './progression.js';
import { settings } from './settings.js';
import { dateKey, addDays, weekStart, daysBetween } from './util.js';

export function liftSessions() {
  return db.cached('liftSessions', () => db.all('sessions').filter(isLift).sort((a, b) => a.date.localeCompare(b.date)));
}

/** { date, state: lift | partial | cardio | rest | none | future, session } */
export function dayInfo(date, today = dateKey()) {
  const session = db.get('sessions', date);
  let state = 'none';
  if (date > today) state = session?.status === 'rest' ? 'rest' : 'future';
  else if (isLift(session)) state = session.status === 'partial' ? 'partial' : 'lift';
  else if (session?.status === 'in_progress' && db.index('set_logs', 'session_id').get(date)) state = 'lift';
  else if (session?.status === 'cardio' || (db.index('cardio_logs', 'session_id').get(date) || []).length) state = 'cardio';
  else if (session?.status === 'rest') state = 'rest';
  return { date, state, session };
}

/** Workouts in a Monday-based week vs the target. */
export function weekAdherence(start, today = dateKey()) {
  const target = weeklyTarget();
  let lifts = 0;
  let cardio = 0;
  for (let i = 0; i < 7; i++) {
    const d = dayInfo(addDays(start, i), today);
    if (d.state === 'lift' || d.state === 'partial') lifts++;
    else if (d.state === 'cardio') cardio++;
  }
  return { start, lifts, cardio, target, pct: Math.min(1, lifts / target), over: addDays(start, 6) < today };
}

/** Weeks from the program start (or first record) until now. */
export function allWeeks(today = dateKey()) {
  const first = [settings().startDate, liftSessions()[0]?.date].filter(Boolean).sort()[0] || today;
  const out = [];
  for (let w = weekStart(first); w <= weekStart(today); w = addDays(w, 7)) out.push(weekAdherence(w, today));
  return out;
}

/** Consecutive weeks meeting the target (the current week counts once it is met). */
export function weekStreaks(today = dateKey()) {
  const weeks = allWeeks(today);
  let current = 0;
  let record = 0;
  let run = 0;
  for (const w of weeks) {
    if (w.lifts >= w.target) {
      run++;
      record = Math.max(record, run);
    } else if (w.over) {
      run = 0;
    }
  }
  current = run;
  return { current, record };
}

export function totals() {
  const lifts = liftSessions();
  const durations = lifts.map((s) => s.duration_min).filter((m) => m > 0 && m < 300);
  const cardio = db.all('cardio_logs');
  return {
    workouts: lifts.length,
    cardioDays: db.all('sessions').filter((s) => s.status === 'cardio').length,
    cardioMinutes: cardio.reduce((a, c) => a + (c.duration_min || 0), 0),
    avgDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    sets: db.all('set_logs').length,
    tonnage: db.all('set_logs').reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0),
  };
}

/** Per muscle group: sets and tonnage (sets × reps × load) between two dates. */
export function volumeByGroup(from, to) {
  const out = {};
  for (const l of db.all('set_logs')) {
    if (l.session_id < from || l.session_id > to) continue;
    const g = exercise(l.exercise_id)?.muscle_group || 'outros';
    out[g] ||= { sets: 0, tonnage: 0 };
    out[g].sets++;
    out[g].tonnage += (l.load_kg || 0) * (l.reps || 0);
  }
  return out;
}

export const weekVolume = (start) => volumeByGroup(start, addDays(start, 6));

export function cardioMinutes(from, to) {
  return db.all('cardio_logs').filter((c) => c.session_id >= from && c.session_id <= to).reduce((a, c) => a + (c.duration_min || 0), 0);
}

export const weekCardioMinutes = (start) => cardioMinutes(start, addDays(start, 6));

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
  const idx = db.index('set_logs', 'exercise_id');
  return getProgram().exercises.filter((e) => idx.has(e.id));
}

/** All trained exercises with best e1RM, change since the first session and trend. */
export function strengthTable() {
  return exercisesWithHistory().map((e) => {
    const t = exerciseTrend(e.id);
    const last = t.hist[t.hist.length - 1];
    return { ex: e, sessions: t.hist.length, best: Math.max(...t.hist.map((h) => h.bestE1rm)), top: Math.max(...t.hist.map((h) => h.topLoad)), last: last.date, trend: t.trend, changePct: t.changePct || 0 };
  }).sort((a, b) => b.sessions - a.sessions);
}

/**
 * Progression events, newest first: every time an exercise got more sets, more load or (at the
 * same load) more total reps than the previous time it was trained.
 */
export function progressionEvents() {
  return db.cached('progEvents', () => {
    const out = [];
    for (const e of exercisesWithHistory()) {
      const hist = exerciseHistory(e.id);
      for (let i = 1; i < hist.length; i++) {
        const prev = hist[i - 1];
        const cur = hist[i];
        if (cur.sets.length > prev.sets.length) out.push({ date: cur.date, ex: e, type: 'sets', from: prev.sets.length, to: cur.sets.length });
        if (cur.topLoad > prev.topLoad) out.push({ date: cur.date, ex: e, type: 'load', from: prev.topLoad, to: cur.topLoad });
        else if (cur.topLoad === prev.topLoad && cur.reps > prev.reps) out.push({ date: cur.date, ex: e, type: 'reps', from: prev.reps, to: cur.reps });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.ex.name_pt.localeCompare(b.ex.name_pt));
  });
}

/** Counters for the progression view. */
export function progressionCounts() {
  const ex = exercisesWithHistory();
  const events = progressionEvents();
  return {
    distinct: ex.length,
    performed: ex.reduce((a, e) => a + exerciseHistory(e.id).length, 0),
    sets: db.all('set_logs').length,
    setDays: new Set(events.filter((x) => x.type === 'sets').map((x) => x.date)).size,
    loadUps: events.filter((x) => x.type === 'load').length,
  };
}

/** How many times each rotation slot was trained in the last `days` days. */
export function slotBalance(days = 28, today = dateKey()) {
  const from = addDays(today, -days + 1);
  const out = Object.fromEntries(rotation().map((d) => [d.slot, 0]));
  for (const s of liftSessions()) {
    if (s.date < from) continue;
    const slot = sessionSlot(s);
    if (slot in out) out[slot]++;
  }
  return out;
}

export function daysSinceLastLift(today = dateKey()) {
  const last = liftSessions().filter((s) => s.date <= today).pop();
  return last ? daysBetween(last.date, today) : null;
}

/* ---------- profile & body ---------- */

export function profile() {
  return db.get('profile', 'me') || {};
}

export function bodyLogs() {
  return db.all('body_logs').filter((b) => b.weight_kg > 0).sort((a, b) => a.date.localeCompare(b.date));
}

export function currentWeight() {
  return bodyLogs().pop()?.weight_kg || null;
}

export function age(birthDate, today = dateKey()) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export function bmi() {
  const h = Number(profile().height_cm);
  const w = currentWeight();
  return h > 0 && w ? Math.round((w / ((h / 100) ** 2)) * 10) / 10 : null;
}

/** Everything the trophies need, computed once per data version. */
export function snapshot(today = dateKey()) {
  return db.cached(`snapshot:${today}`, () => {
    const weeks = allWeeks(today);
    const rules = getProgram().rules.intermediate_unlock;
    const p = profile();
    return {
      totalWorkouts: totals().workouts,
      weekStreakRecord: weekStreaks(today).record,
      prCount: db.all('set_logs').filter((l) => l.is_pr).length,
      perfectWeeks: weeks.filter((w) => w.lifts >= w.target).length,
      weeks75: weeks.filter((w) => w.pct >= rules.min_adherence).length,
      bestCardioMonth: bestCardioMonth(),
      legPressGainPct: loadGainPct('leg_press'),
      healthDays: db.all('health_imports').length,
      acceptedSuggestions: db.all('suggestions').filter((s) => s.status === 'accepted' || s.status === 'partial').length,
      profileDone: p.name && p.height_cm && currentWeight() ? 1 : 0,
      aiReports: db.all('ai_reports').length,
      weighIns: bodyLogs().length,
    };
  });
}
