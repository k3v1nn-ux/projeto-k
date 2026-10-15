// Per-device settings in localStorage. Secrets (Apps Script URL, token) live only here,
// never in the repository.
import { dateKey } from './util.js';
import { invalidate } from './db.js';

const KEY = 'pk.settings';

const DEFAULTS = {
  apiUrl: '',
  token: '',
  suggestToken: '',
  ownerName: '',
  theme: 'auto', // auto | light | dark
  level: 'base', // base | intermediate
  startDate: '', // first day of the program (re-entry week starts here)
  unavailable: [], // exercise ids unavailable at my gym
  allowSquatVariants: false,
  restSound: true,
  spotifyClientId: '',
  playlistUrl: '',
  shortcutName: 'Projeto K Saúde',
  weeklyTarget: 4, // lifting sessions per week
  restDays: [3, 6, 7], // preferred rest weekdays (1 = Monday), used only to project the week
  anthropicKey: '', // Claude API key for the AI analysis (stays on this device)
  gymClose: { 6: '19:00', 7: '15:00' }, // Smart Fit closing time by weekday (Saturday 19h, Sunday 15h)
};

let cache;

export function settings() {
  if (!cache) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      cache = { ...DEFAULTS };
    }
    if (!cache.startDate) {
      cache.startDate = dateKey();
      persist();
    }
  }
  return cache;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* private mode: settings stay in memory */ }
}

export function updateSettings(patch) {
  Object.assign(settings(), patch);
  persist();
  invalidate();
  if ('theme' in patch) applyTheme();
}

export function applyTheme() {
  const t = settings().theme;
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0d' : '#e9e9ee');
}

export function isConfigured() {
  const s = settings();
  return Boolean(s.apiUrl && s.token);
}

/* ---------- restore code (reinstalling the home-screen app starts with empty storage) ---------- */
const RESTORE_KEYS = ['apiUrl', 'token', 'suggestToken', 'ownerName', 'theme', 'level', 'startDate', 'unavailable', 'allowSquatVariants',
  'restSound', 'spotifyClientId', 'playlistUrl', 'shortcutName', 'weeklyTarget', 'restDays', 'anthropicKey', 'gymClose'];

export function restorePayload() {
  const s = settings();
  const out = { v: 1, settings: Object.fromEntries(RESTORE_KEYS.map((k) => [k, s[k]])) };
  try { out.spotify = JSON.parse(localStorage.getItem('pk.spotify') || 'null'); } catch { /* ignore */ }
  return out;
}

export function applyRestore(payload) {
  if (!payload || payload.v !== 1 || !payload.settings) throw new Error('código inválido');
  const patch = Object.fromEntries(Object.entries(payload.settings).filter(([k]) => RESTORE_KEYS.includes(k)));
  updateSettings(patch);
  try { if (payload.spotify) localStorage.setItem('pk.spotify', JSON.stringify(payload.spotify)); } catch { /* ignore */ }
}

/** Gym closing time for a date ("19:00") or "" when it follows the regular hours. */
export function gymCloseFor(dateKeyStr) {
  const [y, m, d] = dateKeyStr.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay() || 7;
  return (settings().gymClose || {})[wd] || '';
}
