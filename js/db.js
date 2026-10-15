// IndexedDB persistence with an in-memory mirror. Every local write lands in the
// record store and in the outbox in the same transaction, so nothing is lost offline.
import { TABLES, coerce, remoteWins } from './schema.js';
import { nowIso } from './util.js';

const DB_NAME = 'projeto-k';
const DB_VERSION = 1;

let dbPromise;
const mem = {}; // table -> Map(id -> row)
const listeners = new Set();
let version = 0; // bumps on every change; invalidates memoized indexes
const memo = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of Object.keys(TABLES)) {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('aborted'));
});

const reqP = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function loadAll() {
  const db = await openDb();
  const tx = db.transaction(Object.keys(TABLES), 'readonly');
  await Promise.all(Object.keys(TABLES).map(async (t) => {
    const rows = await reqP(tx.objectStore(t).getAll());
    mem[t] = new Map(rows.map((r) => [r.id, r]));
  }));
  memo.clear();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(info) {
  version++;
  memo.clear();
  listeners.forEach((fn) => fn(info));
}

/** Memoized derived data, recomputed only after the data changes. */
export function cached(key, compute) {
  if (!memo.has(key)) memo.set(key, compute());
  return memo.get(key);
}

/** Live rows grouped by a field, e.g. index('set_logs', 'session_id').get('2026-10-14'). */
export function index(table, field) {
  return cached(`idx:${table}:${field}`, () => {
    const m = new Map();
    for (const r of all(table)) {
      const k = r[field];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  });
}

export const dataVersion = () => version;

/** Drops memoized data after a change that does not go through save() (e.g. localStorage). */
export function invalidate() {
  memo.clear();
}

/** Live rows (not soft-deleted). */
export function all(table) {
  return cached(`all:${table}`, () => Array.from(mem[table]?.values() || []).filter((r) => !r.deleted));
}

export function get(table, id) {
  const r = mem[table]?.get(id);
  return r && !r.deleted ? r : null;
}

export function getRaw(table, id) {
  return mem[table]?.get(id) || null;
}

/** Saves rows locally and queues them for sync. */
export async function save(table, rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  const stamp = nowIso();
  const full = list.map((r) => coerce(table, { deleted: false, ...r, updated_at: stamp }));
  const db = await openDb();
  const tx = db.transaction([table, 'outbox'], 'readwrite');
  for (const row of full) {
    tx.objectStore(table).put(row);
    tx.objectStore('outbox').add({ table, row });
  }
  await done(tx);
  for (const row of full) mem[table].set(row.id, row);
  emit({ table, local: true });
  return Array.isArray(rows) ? full : full[0];
}

export async function remove(table, id) {
  const row = getRaw(table, id);
  if (!row) return;
  await save(table, { ...row, deleted: true });
}

/** Applies rows pulled from the server. Returns how many changed locally. */
export async function applyRemote(tables) {
  const db = await openDb();
  const names = Object.keys(tables).filter((t) => TABLES[t]);
  if (!names.length) return 0;
  const tx = db.transaction(names, 'readwrite');
  let changed = 0;
  const applied = [];
  for (const t of names) {
    for (const raw of tables[t]) {
      const row = coerce(t, raw);
      if (!row.id) continue;
      if (!remoteWins(t, mem[t].get(row.id), row)) continue;
      tx.objectStore(t).put(row);
      applied.push([t, row]);
      changed++;
    }
  }
  await done(tx);
  for (const [t, row] of applied) mem[t].set(row.id, row);
  if (changed) emit({ remote: true });
  return changed;
}

export async function outboxPeek(limit = 300) {
  const db = await openDb();
  const tx = db.transaction('outbox', 'readonly');
  const rows = await reqP(tx.objectStore('outbox').getAll(undefined, limit));
  return rows;
}

export async function outboxCount() {
  const db = await openDb();
  return reqP(db.transaction('outbox', 'readonly').objectStore('outbox').count());
}

export async function outboxDelete(seqs) {
  const db = await openDb();
  const tx = db.transaction('outbox', 'readwrite');
  seqs.forEach((s) => tx.objectStore('outbox').delete(s));
  await done(tx);
}

export async function kvGet(key) {
  const db = await openDb();
  return reqP(db.transaction('kv', 'readonly').objectStore('kv').get(key));
}

export async function kvSet(key, value) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  await done(tx);
}

/** Full dump for JSON backup. */
export function dump() {
  const out = {};
  for (const t of Object.keys(TABLES)) out[t] = Array.from(mem[t].values());
  return out;
}

/** Restores a JSON backup: rows are merged (newer wins) and queued for sync. */
export async function restore(data) {
  let n = 0;
  for (const t of Object.keys(TABLES)) {
    const rows = (data[t] || []).filter((r) => r && r.id && remoteWins(t, mem[t].get(r.id), coerce(t, r)));
    if (!rows.length) continue;
    const db = await openDb();
    const tx = db.transaction([t, 'outbox'], 'readwrite');
    for (const raw of rows) {
      const row = coerce(t, raw);
      tx.objectStore(t).put(row);
      tx.objectStore('outbox').add({ table: t, row });
    }
    await done(tx);
    rows.forEach((raw) => mem[t].set(raw.id, coerce(t, raw)));
    n += rows.length;
  }
  emit({ remote: true });
  return n;
}
