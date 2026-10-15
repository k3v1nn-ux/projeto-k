// Spotify remote control (Web API + Authorization Code with PKCE, fully client-side).
// Music plays in the official Spotify app; this page only controls it. Requires Premium.
// The Web Playback SDK is not used: it does not work in Safari on iOS.
import { settings, updateSettings } from './settings.js';
import { sheet, toast } from './ui.js';
import { esc, b64urlEncode, randomToken } from './util.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative';
const KEY = 'pk.spotify';

let pollTimer = null;

const redirectUri = () => `${location.origin}${location.pathname}`;

function tokens() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

function saveTokens(t) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export const isConnected = () => Boolean(tokens()?.refresh_token);

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function login() {
  const clientId = settings().spotifyClientId;
  if (!clientId) { toast('Informe o Client ID do Spotify'); return; }
  const verifier = randomToken(48);
  const state = randomToken(8);
  sessionStorage.setItem('pk.sp.verifier', verifier);
  localStorage.setItem('pk.sp.verifier', verifier); // iOS can lose sessionStorage on the redirect
  localStorage.setItem('pk.sp.state', state);
  const params = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: b64urlEncode(await sha256(verifier)), state,
  });
  location.href = `${AUTH_URL}?${params}`;
}

export function logout() {
  saveTokens(null);
  clearInterval(pollTimer);
}

/** Called on startup: finishes the login when Spotify redirects back with ?code=. */
export async function handleSpotifyCallback() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  const clean = () => history.replaceState(null, '', `${location.pathname}#/config`);
  if (q.get('error')) {
    clean();
    toast(`Spotify: ${esc(q.get('error'))}`);
    return;
  }
  const verifier = sessionStorage.getItem('pk.sp.verifier') || localStorage.getItem('pk.sp.verifier');
  if (q.get('state') !== localStorage.getItem('pk.sp.state') || !verifier) {
    clean();
    toast('Login do Spotify expirou, tente de novo.');
    return;
  }
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), client_id: settings().spotifyClientId, code_verifier: verifier }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error);
    saveTokens({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
    toast('Spotify conectado ✓');
  } catch (err) {
    toast(`Falha no login do Spotify: ${esc(err.message)}`);
  } finally {
    localStorage.removeItem('pk.sp.verifier');
    localStorage.removeItem('pk.sp.state');
    clean();
  }
}

async function accessToken() {
  const t = tokens();
  if (!t) throw new Error('not_connected');
  if (Date.now() < t.expires_at - 60000) return t.access_token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: settings().spotifyClientId }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'invalid_grant') saveTokens(null);
    throw new Error(data.error_description || data.error);
  }
  saveTokens({ access_token: data.access_token, refresh_token: data.refresh_token || t.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.reason = data?.error?.reason;
    throw err;
  }
  return data;
}

/** Runs a player command; with no active device, wakes the first available one. */
async function command(method, path, body) {
  try {
    return await call(method, path, body);
  } catch (err) {
    if (err.status !== 404) throw err;
    const { devices = [] } = (await call('GET', '/me/player/devices')) || {};
    const device = devices.find((d) => !d.is_restricted);
    if (!device) {
      const e = new Error('Abra o Spotify no iPhone e toque play em qualquer música; depois o controle funciona.');
      e.noDevice = true;
      throw e;
    }
    await call('PUT', '/me/player', { device_ids: [device.id], play: true });
    if (path !== '/me/player/play' || body) return call(method, path, body);
    return null;
  }
}

function playlistId(url) {
  const m = String(url || '').match(/playlist[/:]([A-Za-z0-9]+)/);
  return m ? m[1] : '';
}

const ICONS = {
  prev: '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l9 6-9 6z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 7h12M4 12h12M4 17h8M18 15v6l3-2"/></svg>',
};

/** Mini player on the workout screen (or the playlist embed as fallback). */
export function mountSpotify(slot) {
  clearInterval(pollTimer);
  if (!slot) return;
  const s = settings();
  const pid = playlistId(s.playlistUrl);
  if (!isConnected()) {
    if (!pid) return;
    slot.innerHTML = `<details class="card" style="margin-bottom:12px"><summary>🎵 Playlist do treino</summary>
      <iframe class="embed" style="margin-top:10px" src="https://open.spotify.com/embed/playlist/${pid}?theme=0" loading="lazy" allow="encrypted-media; clipboard-write" title="Playlist no Spotify"></iframe>
      <a class="btn small block" href="${esc(s.playlistUrl)}" target="_blank" rel="noopener" style="margin-top:8px">Abrir no Spotify</a></details>`;
    return;
  }
  slot.innerHTML = `<div class="card spotify" style="margin-bottom:12px">
      <img data-sp="cover" alt="">
      <div class="t"><div data-sp="title"><strong>Spotify</strong></div><div class="small muted" data-sp="artist">carregando…</div></div>
      <div class="ctrl">
        <button class="icon-btn" data-sp-cmd="prev" aria-label="Anterior">${ICONS.prev}</button>
        <button class="icon-btn" data-sp-cmd="toggle" aria-label="Tocar ou pausar">${ICONS.play}</button>
        <button class="icon-btn" data-sp-cmd="next" aria-label="Próxima">${ICONS.next}</button>
        <button class="icon-btn" data-sp-cmd="playlists" aria-label="Escolher playlist">${ICONS.list}</button>
      </div></div>`;
  let playing = false;

  const refresh = async () => {
    if (!document.contains(slot)) { clearInterval(pollTimer); return; }
    if (document.visibilityState !== 'visible') return;
    try {
      const st = await call('GET', '/me/player?additional_types=episode');
      const item = st?.item;
      playing = Boolean(st?.is_playing);
      slot.querySelector('[data-sp=title]').innerHTML = `<strong>${esc(item?.name || 'Nada tocando')}</strong>`;
      slot.querySelector('[data-sp=artist]').textContent = item ? (item.artists || []).map((a) => a.name).join(', ') || item.show?.name || '' : 'Escolha uma playlist ou dê play no app';
      const img = (item?.album?.images || item?.images || []).slice(-2)[0]?.url;
      const cover = slot.querySelector('[data-sp=cover]');
      if (img && cover.src !== img) cover.src = img;
      slot.querySelector('[data-sp-cmd=toggle]').innerHTML = playing ? ICONS.pause : ICONS.play;
    } catch (err) {
      slot.querySelector('[data-sp=artist]').textContent = err.message === 'not_connected' ? 'Desconectado' : 'Sem conexão com o Spotify';
    }
  };

  slot.onclick = async (e) => {
    const b = e.target.closest('[data-sp-cmd]');
    if (!b) return;
    const cmd = b.dataset.spCmd;
    try {
      if (cmd === 'playlists') { await choosePlaylist(); }
      else if (cmd === 'toggle') { await command('PUT', playing ? '/me/player/pause' : '/me/player/play'); }
      else { await command('POST', `/me/player/${cmd === 'prev' ? 'previous' : 'next'}`); }
      setTimeout(refresh, 400);
    } catch (err) {
      toast(esc(err.message), { ms: 4500 });
      if (err.noDevice) location.href = 'spotify:';
    }
  };
  refresh();
  pollTimer = setInterval(refresh, 5000);
}

async function choosePlaylist() {
  const data = await call('GET', '/me/playlists?limit=50');
  const items = (data?.items || []).filter(Boolean);
  const s = sheet(`<h3>Escolher playlist</h3><ul class="list">${items.map((p) => `<li><button class="list-item" data-uri="${esc(p.uri)}"><img class="ex-thumb" src="${esc(p.images?.[p.images.length - 1]?.url || '')}" alt=""><span class="grow"><strong>${esc(p.name)}</strong><br><span class="muted small">${p.tracks?.total ?? ''} faixas</span></span></button></li>`).join('') || '<li class="muted">Nenhuma playlist.</li>'}</ul><button class="btn ghost block" data-close>Fechar</button>`);
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-uri]');
    if (!b) return;
    try {
      await command('PUT', '/me/player/play', { context_uri: b.dataset.uri });
      s.close();
    } catch (err) {
      toast(esc(err.message), { ms: 4500 });
    }
  });
}

/* ---------- settings section ---------- */

export function spotifySettingsHtml() {
  const s = settings();
  return `
    <div class="card">
      <label class="field"><span>Client ID (Spotify Developer Dashboard)</span><input type="text" name="spotifyClientId" value="${esc(s.spotifyClientId)}" autocomplete="off"></label>
      <p class="muted tiny">Redirect URI para cadastrar no app do Spotify: <code>${esc(redirectUri())}</code></p>
      <div class="row gap" style="margin:8px 0 12px">${isConnected()
        ? '<span class="pill accent">conectado</span><button class="btn small ghost" data-action="sp-logout">Desconectar</button>'
        : '<button class="btn small primary" data-action="sp-login">Conectar Spotify</button>'}</div>
      <label class="field"><span>Playlist do treino (link, usado como plano B)</span><input type="url" name="playlistUrl" value="${esc(s.playlistUrl)}" placeholder="https://open.spotify.com/playlist/..."></label>
      <p class="muted small">O controle remoto exige Spotify Premium e o app do Spotify aberto no iPhone. Sem conexão, aparece o player embutido da playlist.</p>
    </div>`;
}

export function bindSpotifySettings(view, rerender) {
  if (view.dataset.spotifyBound) return;
  view.dataset.spotifyBound = '1';
  view.addEventListener('change', (e) => {
    if (e.target.name === 'spotifyClientId') updateSettings({ spotifyClientId: e.target.value.trim() });
    if (e.target.name === 'playlistUrl') updateSettings({ playlistUrl: e.target.value.trim() });
  });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action^=sp-]');
    if (!b) return;
    if (b.dataset.action === 'sp-login') {
      const input = view.querySelector('[name=spotifyClientId]');
      if (input) updateSettings({ spotifyClientId: input.value.trim() });
      login();
    } else {
      logout();
      rerender();
    }
  });
}
