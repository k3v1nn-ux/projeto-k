// Synced tables. Must match SCHEMA in apps-script/Code.gs (minus synced_at, which the server sets).
// New columns are only ever appended at the end so existing spreadsheet rows stay aligned.
export const TABLES = {
  sessions: ['id', 'date', 'planned_session', 'level', 'start_time', 'end_time', 'duration_min', 'status', 'notes', 'swaps_json', 'updated_at', 'deleted', 'slot'],
  set_logs: ['id', 'session_id', 'exercise_id', 'set_number', 'load_kg', 'reps', 'rpe', 'timestamp', 'is_pr', 'updated_at', 'deleted'],
  cardio_logs: ['id', 'session_id', 'type', 'duration_min', 'avg_hr', 'notes', 'updated_at', 'deleted', 'phase'],
  achievements: ['id', 'unlocked_at', 'updated_at', 'deleted'],
  suggestions: ['id', 'author', 'created_at', 'payload_json', 'status', 'target_date', 'updated_at', 'deleted'],
  health_imports: ['id', 'date', 'resting_hr', 'avg_hr', 'active_kcal', 'steps', 'sleep_h', 'workout_avg_hr', 'workout_min', 'source', 'updated_at', 'deleted'],
  overrides: ['id', 'date', 'suggestion_id', 'session_name', 'payload_json', 'updated_at', 'deleted'],
  profile: ['id', 'name', 'birth_date', 'sex', 'height_cm', 'goal', 'experience', 'notes', 'updated_at', 'deleted'],
  body_logs: ['id', 'date', 'weight_kg', 'body_fat_pct', 'waist_cm', 'notes', 'updated_at', 'deleted'],
  ai_reports: ['id', 'created_at', 'model', 'text', 'updated_at', 'deleted'],
};

const NUMERIC = new Set(['duration_min', 'set_number', 'load_kg', 'reps', 'rpe', 'avg_hr', 'resting_hr', 'active_kcal', 'steps', 'sleep_h', 'workout_avg_hr', 'workout_min', 'height_cm', 'weight_kg', 'body_fat_pct', 'waist_cm']);
const BOOLEAN = new Set(['deleted', 'is_pr']);

/** Session statuses. "rest" is a day the user chose to rest; "cardio" a day with only cardio. */
export const STATUS = {
  in_progress: 'em andamento', done: 'feito', partial: 'parcial', cardio: 'só cardio', rest: 'descanso', missed: 'falta',
};

/** Normalizes a row coming from the spreadsheet (strings -> numbers/booleans). */
export function coerce(table, row) {
  const out = {};
  for (const col of TABLES[table]) {
    let v = row[col];
    if (NUMERIC.has(col)) {
      // Shortcuts on a pt-BR iPhone may send "512,4".
      const n = v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.'));
      v = Number.isFinite(n) ? n : null;
    } else if (BOOLEAN.has(col)) {
      v = v === true || v === 'TRUE' || v === 'true' || v === 1;
    } else {
      v = v === null || v === undefined ? '' : String(v);
    }
    out[col] = v;
  }
  return out;
}

/** Last write wins; a legacy automatic "missed" mark never beats a real session. */
export function remoteWins(table, local, remote) {
  if (!local) return true;
  if (table === 'sessions') {
    if (remote.status === 'missed' && local.status !== 'missed') return false;
    if (local.status === 'missed' && remote.status !== 'missed') return true;
  }
  return String(remote.updated_at) > String(local.updated_at);
}
