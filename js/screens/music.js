// "Música": full Spotify remote (cover, track, progress, controls, playlists, devices).
// Without a connection: setup steps and the embedded playlist as a fallback.
import { settings, updateSettings } from '../settings.js';
import { isConnected, login, logout, call, command, playlistId, ICONS } from '../spotify.js';
import { toast } from '../ui.js';
import { esc, fmtDuration } from '../util.js';

let poll = null;

export function render(view) {
  clearInterval(poll);
  const s = settings();
  const pid = playlistId(s.playlistUrl);
  if (!isConnected()) {
    view.innerHTML = `
      <div class="page-head"><h1>Música</h1><p>Controle o Spotify sem sair do treino.</p></div>
      ${pid ? `<div class="card" style="padding:8px"><iframe class="embed" src="https://open.spotify.com/embed/playlist/${pid}?theme=0" loading="lazy" allow="encrypted-media; clipboard-write" title="Playlist no Spotify"></iframe></div>
      <a class="btn block mt" href="${esc(s.playlistUrl)}" target="_blank" rel="noopener">Abrir no Spotify</a>` : ''}
      <div class="card mt">
        <h3>Conectar o controle remoto</h3>
        <p class="muted small">Com Spotify Premium, esta aba mostra capa, faixa e controles e escolhe playlists. A música toca no app do Spotify.</p>
        <label class="field"><span>Client ID (developer.spotify.com/dashboard)</span><input type="text" name="spotifyClientId" value="${esc(s.spotifyClientId)}" autocomplete="off"></label>
        <p class="muted tiny">Redirect URI do app no Spotify: <code>${esc(location.origin + location.pathname)}</code></p>
        <button class="btn primary block" data-act="login">Conectar Spotify</button>
      </div>
      <div class="card mt">
        <label class="field" style="margin:0"><span>Playlist do treino (link)</span><input type="url" name="playlistUrl" value="${esc(s.playlistUrl)}" placeholder="https://open.spotify.com/playlist/..."></label>
      </div>`;
    view.onchange = (e) => {
      if (e.target.name === 'spotifyClientId') updateSettings({ spotifyClientId: e.target.value.trim() });
      if (e.target.name === 'playlistUrl') { updateSettings({ playlistUrl: e.target.value.trim() }); render(view); }
    };
    view.onclick = (e) => {
      if (e.target.closest('[data-act=login]')) {
        updateSettings({ spotifyClientId: view.querySelector('[name=spotifyClientId]').value.trim() });
        login();
      }
    };
    return;
  }

  view.innerHTML = `
    <div class="page-head row between"><div><h1>Música</h1><p id="sp-device">Conectando…</p></div><button class="btn small ghost" data-act="logout">Sair</button></div>
    <div class="card player">
      <img class="cover" data-sp="cover" alt="">
      <div class="track" data-sp="title">—</div>
      <div class="artist" data-sp="artist"></div>
      <div class="progress"><i data-sp="bar" style="width:0"></i></div>
      <div class="row between tiny muted num" style="margin-top:4px"><span data-sp="pos">0:00</span><span data-sp="dur">0:00</span></div>
      <div class="controls">
        <button class="icon-btn" data-cmd="prev" aria-label="Anterior">${ICONS.prev}</button>
        <button class="icon-btn main" data-cmd="toggle" aria-label="Tocar ou pausar">${ICONS.play}</button>
        <button class="icon-btn" data-cmd="next" aria-label="Próxima">${ICONS.next}</button>
      </div>
    </div>
    <div class="section"><div class="section-title"><span>Suas playlists</span></div><div class="group" id="pl-grid"><p class="muted small" style="padding:12px 16px;margin:0">Carregando…</p></div></div>
    <div class="section"><div class="section-title"><span>Aparelhos</span><button class="link-btn" data-act="devices">atualizar</button></div><div class="group" id="devices"><p class="muted small" style="padding:12px 16px;margin:0">—</p></div></div>`;

  let playing = false;
  const $ = (sel) => view.querySelector(sel);
  const refresh = async () => {
    if (!document.contains(view.querySelector('.player'))) { clearInterval(poll); return; }
    if (document.visibilityState !== 'visible') return;
    try {
      const st = await call('GET', '/me/player?additional_types=episode');
      const item = st?.item;
      playing = Boolean(st?.is_playing);
      $('[data-sp=title]').textContent = item?.name || 'Nada tocando';
      $('[data-sp=artist]').textContent = item ? (item.artists || []).map((a) => a.name).join(', ') || item.show?.name || '' : 'Escolha uma playlist abaixo';
      const img = (item?.album?.images || item?.images || [])[0]?.url;
      if (img && $('[data-sp=cover]').src !== img) $('[data-sp=cover]').src = img;
      const dur = item?.duration_ms || 0;
      $('[data-sp=bar]').style.width = dur ? `${(st.progress_ms / dur) * 100}%` : '0';
      $('[data-sp=pos]').textContent = fmtDuration(st?.progress_ms || 0);
      $('[data-sp=dur]').textContent = fmtDuration(dur);
      $('[data-cmd=toggle]').innerHTML = playing ? ICONS.pause : ICONS.play;
      $('#sp-device').textContent = st?.device ? `Tocando em ${st.device.name}` : 'Nenhum aparelho ativo: abra o Spotify no iPhone';
    } catch (err) {
      $('#sp-device').textContent = `Sem conexão com o Spotify (${err.message})`;
    }
  };
  const loadPlaylists = async () => {
    try {
      const data = await call('GET', '/me/playlists?limit=50');
      const items = (data?.items || []).filter(Boolean);
      $('#pl-grid').innerHTML = items.length ? `<ul class="list">${items.map((p) => `<li><button class="list-item" data-uri="${esc(p.uri)}"><img class="pl-thumb" src="${esc(p.images?.[p.images.length - 1]?.url || p.images?.[0]?.url || '')}" alt="" loading="lazy"><span class="grow"><strong class="ellipsis">${esc(p.name)}</strong><br><span class="li-sub">${p.tracks?.total ?? ''} faixas${p.owner?.display_name ? ` · ${esc(p.owner.display_name)}` : ''}</span></span><span class="li-chev">${ICONS.play}</span></button></li>`).join('')}</ul>` : '<p class="muted small" style="padding:12px 16px;margin:0">Nenhuma playlist.</p>';
    } catch (err) {
      $('#pl-grid').innerHTML = `<p class="muted small">Não carregou: ${esc(err.message)}</p>`;
    }
  };
  const loadDevices = async () => {
    try {
      const { devices = [] } = (await call('GET', '/me/player/devices')) || {};
      $('#devices').innerHTML = devices.length ? `<ul class="list">${devices.map((d) => `<li><button class="list-item" data-device="${esc(d.id)}"><span class="grow"><strong>${esc(d.name)}</strong><br><span class="li-sub">${esc(d.type)}${d.is_active ? ' · ativo' : ''}</span></span>${d.is_active ? '<span class="pill accent">tocando</span>' : '<span class="li-chev">›</span>'}</button></li>`).join('')}</ul>`
        : '<p class="muted small" style="padding:12px 16px;margin:0">Nenhum aparelho. Abra o app do Spotify no iPhone.</p>';
    } catch { /* ignore */ }
  };

  view.onclick = async (e) => {
    const t = e.target;
    try {
      if (t.closest('[data-act=logout]')) { logout(); render(view); return; }
      if (t.closest('[data-act=devices]')) { loadDevices(); return; }
      const cmd = t.closest('[data-cmd]')?.dataset.cmd;
      if (cmd === 'toggle') await command('PUT', playing ? '/me/player/pause' : '/me/player/play');
      else if (cmd) await command('POST', `/me/player/${cmd === 'prev' ? 'previous' : 'next'}`);
      const uri = t.closest('[data-uri]')?.dataset.uri;
      if (uri) { await command('PUT', '/me/player/play', { context_uri: uri }); toast('Tocando a playlist'); }
      const dev = t.closest('[data-device]')?.dataset.device;
      if (dev) { await call('PUT', '/me/player', { device_ids: [dev], play: true }); loadDevices(); }
      if (cmd || uri || dev) setTimeout(refresh, 400);
    } catch (err) {
      toast(esc(err.message), { ms: 4500 });
      if (err.noDevice) location.href = 'spotify:';
    }
  };
  refresh();
  loadPlaylists();
  loadDevices();
  poll = setInterval(refresh, 4000);
}
