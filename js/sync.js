// Outbox-based sync with the Apps Script Web App, with exponential backoff.
import * as db from './db.js';
import { settings, isConfigured } from './settings.js';

const listeners = new Set();
let state = { status: 'idle', pending: 0, lastSync: null, error: '' };
let running = null;
let retryTimer = null;
let backoff = 5000;

export function syncState() {
  return state;
}

export function onSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

/** POST as text/plain so the browser does not send a CORS preflight. */
export async function api(action, payload = {}, { url, token } = {}) {
  const s = settings();
  const res = await fetch(url || s.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: token ?? s.token, ...payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'erro desconhecido');
  return data;
}

export async function refreshPending() {
  set({ pending: await db.outboxCount() });
}

export function sync() {
  if (running) return running;
  running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  await refreshPending();
  if (!isConfigured()) {
    set({ status: 'local' });
    return false;
  }
  if (!navigator.onLine) {
    set({ status: 'offline' });
    return false;
  }
  set({ status: 'syncing' });
  try {
    // Push in batches until the outbox is empty.
    for (;;) {
      const batch = await db.outboxPeek(300);
      if (!batch.length) break;
      const changes = {};
      for (const item of batch) (changes[item.table] ||= []).push(item.row);
      await api('push', { changes });
      await db.outboxDelete(batch.map((b) => b.seq));
    }
    const since = (await db.kvGet('lastPull')) || '';
    const pulled = await api('pull', { since });
    await db.applyRemote(pulled.tables || {});
    await db.kvSet('lastPull', pulled.server_time);
    backoff = 5000;
    set({ status: 'ok', lastSync: new Date(), error: '', pending: await db.outboxCount() });
    return true;
  } catch (err) {
    set({ status: 'error', error: String(err.message || err), pending: await db.outboxCount() });
    clearTimeout(retryTimer);
    retryTimer = setTimeout(sync, backoff);
    backoff = Math.min(backoff * 2, 5 * 60 * 1000);
    return false;
  }
}

let debounceTimer;
export function scheduleSync(ms = 1500) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sync, ms);
}

export function startSyncLoop() {
  window.addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
  db.onChange((info) => {
    if (info.local) {
      refreshPending();
      scheduleSync();
    }
  });
  setInterval(() => { if (state.pending) sync(); }, 60000);
  return sync();
}
