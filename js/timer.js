// Rest timer (survives reloads: stores the end timestamp), sound, vibration where
// supported (not on iOS), and Screen Wake Lock to keep the display on during a workout.
import { $, fmtDuration } from './util.js';
import { settings } from './settings.js';
import { notify, clearNotifications } from './notify.js';

const KEY = 'pk.rest';
let tick = null;
let audioCtx = null;
let wakeLock = null;
let wantWakeLock = false;

/** Must be called from a user gesture (iOS only unlocks audio inside one). */
export function unlockAudio() {
  try {
    // "transient" asks iOS to duck (not stop) Spotify while the beep plays.
    if (navigator.audioSession) navigator.audioSession.type = 'transient';
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* no audio */ }
}

function beep() {
  if (!settings().restSound || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  [0, 0.25, 0.5].forEach((dt, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + dt);
    o.stop(t0 + dt + 0.2);
  });
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

function write(v) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Lock-screen notice (when enabled): the page cannot run while the phone is locked, so it says
 * until when to rest instead of counting down. */
function notifyRest(r) {
  notify(`Descanso até ${hhmm(r.endAt)}`, r.label ? r.label.charAt(0).toUpperCase() + r.label.slice(1) : 'Próxima série', 'rest');
}

/** `seconds` is the exercise's rest; the "Descanso entre séries" setting adds or removes time. */
export function startRest(seconds, label = '') {
  const total = Math.max(15, seconds + (Number(settings().restOffset) || 0));
  const r = { endAt: Date.now() + total * 1000, total, label };
  write(r);
  notifyRest(r);
  run();
}

export function stopRest() {
  write(null);
  render(null);
  clearNotifications('rest');
}

function adjust(delta) {
  const r = read();
  if (!r) return;
  r.endAt += delta * 1000;
  r.total = Math.max(1, r.total + delta);
  write(r);
  notifyRest(r);
  run();
}

function run() {
  clearInterval(tick);
  const update = () => {
    const r = read();
    if (!r) { render(null); clearInterval(tick); return; }
    const left = r.endAt - Date.now();
    if (left <= 0) {
      finish(r);
      return;
    }
    render(r, left);
  };
  update();
  tick = setInterval(update, 250);
}

function finish(r) {
  clearInterval(tick);
  write(null);
  beep();
  navigator.vibrate?.([300, 120, 300]);
  const bar = $('#rest');
  bar.classList.add('done');
  bar.innerHTML = `<div class="rest-main"><strong>Bora! Próxima série</strong><span class="muted">${r.label || ''}</span></div><button class="btn small" data-rest="close">OK</button>`;
  setTimeout(() => { if (!read()) render(null); }, 6000);
}

function render(r, left) {
  const bar = $('#rest');
  document.body.classList.toggle('resting', Boolean(r));
  if (!r) {
    bar.hidden = true;
    bar.classList.remove('done');
    return;
  }
  bar.hidden = false;
  bar.classList.remove('done');
  const pct = Math.max(0, Math.min(100, (left / (r.total * 1000)) * 100));
  bar.innerHTML = `
    <div class="rest-progress" style="width:${pct}%"></div>
    <button class="btn small ghost" data-rest="-15" aria-label="Menos 15 segundos">−15</button>
    <div class="rest-main"><span class="rest-time">${fmtDuration(left + 999)}</span><span class="muted">${r.label ? `descanso · ${r.label}` : 'descanso'}</span></div>
    <button class="btn small ghost" data-rest="15" aria-label="Mais 15 segundos">+15</button>
    <button class="btn small" data-rest="skip">Pular</button>`;
}

export function initTimer() {
  $('#rest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rest]');
    if (!b) return;
    const v = b.dataset.rest;
    if (v === 'skip' || v === 'close') stopRest();
    else adjust(Number(v));
  });
  if (read()) run();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (read()) run();
      if (wantWakeLock) requestWakeLock();
    }
  });
}

export async function requestWakeLock() {
  wantWakeLock = true;
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* not supported or denied */ }
}

export function releaseWakeLock() {
  wantWakeLock = false;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
