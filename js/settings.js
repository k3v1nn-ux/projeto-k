// Per-device settings in localStorage. Secrets (Apps Script URL, token) live only here,
// never in the repository.
import { dateKey } from './util.js';

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
  if ('theme' in patch) applyTheme();
}

export function applyTheme() {
  const t = settings().theme;
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1412' : '#f6f7f5');
}

export function isConfigured() {
  const s = settings();
  return Boolean(s.apiUrl && s.token);
}
