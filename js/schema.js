// Synced tables. Must match SCHEMA in apps-script/Code.gs (minus synced_at, which the server sets).
export const TABLES = {
  sessions: ['id', 'date', 'planned_session', 'level', 'start_time', 'end_time', 'duration_min', 'status', 'notes', 'swaps_json', 'updated_at', 'deleted'],
  set_logs: ['id', 'session_id', 'exercise_id', 'set_number', 'load_kg', 'reps', 'rpe', 'timestamp', 'is_pr', 'updated_at', 'deleted'],
  cardio_logs: ['id', 'session_id', 'type', 'duration_min', 'avg_hr', 'notes', 'updated_at', 'deleted'],
  achievements: ['id', 'unlocked_at', 'updated_at', 'deleted'],
  suggestions: ['id', 'author', 'created_at', 'payload_json', 'status', 'target_date', 'updated_at', 'deleted'],
  health_imports: ['id', 'date', 'resting_hr', 'avg_hr', 'active_kcal', 'steps', 'sleep_h', 'workout_avg_hr', 'workout_min', 'source', 'updated_at', 'deleted'],
  overrides: ['id', 'date', 'suggestion_id', 'session_name', 'payload_json', 'updated_at', 'deleted'],
};

const NUMERIC = new Set(['duration_min', 'set_number', 'load_kg', 'reps', 'rpe', 'avg_hr', 'resting_hr', 'active_kcal', 'steps', 'sleep_h', 'workout_avg_hr', 'workout_min']);
const BOOLEAN = new Set(['deleted', 'is_pr']);

export const STATUS_RANK = { missed: 0, in_progress: 1, partial: 2, done: 3 };

/** Normalizes a row coming from the spreadsheet (strings -> numbers/booleans). */
export function coerce(table, row) {
  const out = {};
  for (const col of TABLES[table]) {
    let v = row[col];
    if (NUMERIC.has(col)) v = v === '' || v === null || v === undefined ? null : Number(v);
    else if (BOOLEAN.has(col)) v = v === true || v === 'TRUE' || v === 'true' || v === 1;
    else v = v === null || v === undefined ? '' : String(v);
    out[col] = v;
  }
  return out;
}

/** Last-write-wins, except that a real session always beats an automatic "missed" mark. */
export function remoteWins(table, local, remote) {
  if (!local) return true;
  if (table === 'sessions') {
    const lr = STATUS_RANK[local.status] ?? 0;
    const rr = STATUS_RANK[remote.status] ?? 0;
    if (remote.status === 'missed' && lr > 0) return false;
    if (local.status === 'missed' && rr > 0) return true;
  }
  return String(remote.updated_at) > String(local.updated_at);
}
