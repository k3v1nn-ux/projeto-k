// App bootstrap: theme, storage, program, service worker, router, header widgets.
import * as db from './db.js';
import { loadProgram } from './program.js';
import { settings, updateSettings, applyTheme } from './settings.js';
import { startSyncLoop, onSync, syncState, sync } from './sync.js';
import { initTimer } from './timer.js';
import { markMissedDays } from './workout.js';
import { toast } from './ui.js';
import { $, $$, dateKey, fmtDuration } from './util.js';
import { afterDataChange } from './achievements.js';
import { handleSpotifyCallback } from './spotify.js';

import * as today from './screens/today.js';
import * as week from './screens/week.js';
import * as exercisePage from './screens/exercise.js';
import * as settingsPage from './screens/settings.js';
import * as analytics from './screens/analytics.js';
import * as trophies from './screens/trophies.js';
import * as friendPages from './screens/friend-pages.js';

const ROUTES = {
  hoje: { tab: 'hoje', render: (v) => today.render(v), live: true },
  dia: { tab: 'semana', render: (v, [date]) => today.render(v, { date }), live: true },
  semana: { tab: 'semana', render: (v) => week.render(v), live: true },
  ex: { tab: 'hoje', render: (v, [id]) => exercisePage.render(v, { id }) },
  analytics: { tab: 'analytics', render: (v) => analytics.render(v), live: true },
  conquistas: { tab: 'conquistas', render: (v) => trophies.render(v), live: true },
  config: { tab: 'config', render: (v) => settingsPage.render(v) },
  amigo: { tab: null, bare: true, render: (v, _a, q) => friendPages.renderBuilder(v, q) },
  importar: { tab: null, render: (v, _a, q) => friendPages.renderImport(v, q) },
};

let current = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'hoje';
  const [path, query = ''] = raw.split('?');
  const [name, ...args] = path.split('/').map(decodeURIComponent);
  return { name, args, query: new URLSearchParams(query) };
}

function route() {
  const { name, args, query } = parseHash();
  const r = ROUTES[name] || ROUTES.hoje;
  current = r;
  document.body.classList.toggle('no-tabbar', Boolean(r.bare));
  $('.topbar').hidden = Boolean(r.bare);
  $$('#tabbar a').forEach((a) => {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $$('.sheet-backdrop').forEach((el) => el.remove());
  const view = $('#view');
  view.onclick = view.onchange = view.onsubmit = view.oninput = null;
  r.render(view, args, query);
  window.scrollTo(0, 0);
}

/** Re-renders the current screen after remote changes, unless the user is typing. */
function refresh() {
  if (!current?.live) return;
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
  if (document.querySelector('.sheet-backdrop')) return;
  const { args, query } = parseHash();
  const y = window.scrollY;
  current.render($('#view'), args, query);
  window.scrollTo(0, y);
}

function renderSyncBadge(st) {
  const b = $('#sync-badge');
  b.dataset.status = st.status;
  const text = {
    local: 'local', offline: st.pending ? `offline · ${st.pending}` : 'offline', syncing: 'sync…',
    ok: st.pending ? `${st.pending} na fila` : 'salvo', error: st.pending ? `${st.pending} na fila` : 'erro', idle: '…',
  }[st.status] || st.status;
  b.textContent = text;
}

const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
};

function renderThemeButton() {
  const t = settings().theme;
  const btn = $('#theme-toggle');
  btn.innerHTML = THEME_ICONS[t];
  btn.setAttribute('aria-label', `Tema: ${{ auto: 'sistema', light: 'claro', dark: 'escuro' }[t]}. Toque para trocar.`);
}

function tickSessionClock() {
  const el = $('#session-clock');
  const s = db.get('sessions', dateKey());
  if (s?.status === 'in_progress' && s.start_time) {
    el.hidden = false;
    el.textContent = `⏱ ${fmtDuration(Date.now() - new Date(s.start_time))}`;
  } else {
    el.hidden = true;
  }
}

async function main() {
  applyTheme();
  renderThemeButton();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); refresh(); });

  // On localhost the service worker only runs with ?sw, so edits show up without a version bump.
  const devHost = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw');
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !devHost) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // A new version took over: reload once so every module comes from the same version.
      // (On the very first install there is nothing stale to replace.)
      if (reloaded || !hadController) return;
      reloaded = true;
      if (!document.querySelector('.set-row.next input:focus')) location.reload();
    });
  }

  await db.loadAll();
  await loadProgram();
  initTimer();
  await handleSpotifyCallback();

  $('#theme-toggle').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    updateSettings({ theme: order[(order.indexOf(settings().theme) + 1) % 3] });
    renderThemeButton();
    refresh();
  });
  $('#sync-badge').addEventListener('click', async () => {
    const ok = await sync();
    const st = syncState();
    toast(ok ? 'Tudo sincronizado com a planilha ✓' : st.status === 'local' ? 'Configure a planilha em Ajustes para sincronizar.' : `Salvo no aparelho. ${st.error || 'Sem conexão.'}`);
  });
  onSync(renderSyncBadge);
  renderSyncBadge(syncState());

  window.addEventListener('hashchange', route);
  db.onChange((info) => {
    if (info.remote || info.table === 'achievements') refresh();
    if (info.table !== 'achievements') afterDataChange();
  });
  route();

  setInterval(tickSessionClock, 1000);
  tickSessionClock();

  // Mark missed days after the first sync attempt (so another device's sessions arrive first).
  let lastDay = dateKey();
  startSyncLoop().finally(async () => {
    if (await markMissedDays()) refresh();
    afterDataChange();
  });
  setInterval(async () => {
    if (dateKey() !== lastDay) {
      lastDay = dateKey();
      await markMissedDays();
      refresh();
    }
  }, 60000);
}

main().catch((err) => {
  console.error(err);
  $('#view').innerHTML = `<div class="card"><h2>Erro ao iniciar</h2><p class="muted">${String(err.message || err)}</p></div>`;
});
