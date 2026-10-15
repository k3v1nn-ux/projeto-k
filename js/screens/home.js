// "Início": a dashboard of cards gathered from every tab (workout, week, music, progress, tips,
// strength, weight, watch, trophies, received workouts). The user shows/hides and reorders the
// cards; tapping a card opens its tab.
import * as db from '../db.js';
import { dayPlan, estimateMinutes, weekProjection, slotDef } from '../program.js';
import { settings, updateSettings, gymCloseFor } from '../settings.js';
import { weekAdherence, weekCardioMinutes, liftSessions, currentWeight, bodyLogs, bmi, progressionEvents, recentPRs } from '../stats.js';
import { recommendations } from '../recommend.js';
import { trophyList } from '../achievements.js';
import { pendingSuggestions } from '../friend.js';
import { loggedSetCount, plannedSetCount } from '../workout.js';
import { mountSpotify, isConnected, playlistId } from '../spotify.js';
import { weekStrip } from './today.js';
import { sheet } from '../ui.js';
import { dateKey, addDays, weekStart, fmtDay, fmtKg, fmtInt, esc } from '../util.js';

export const WIDGETS = [
  ['treino', 'Treino de hoje'], ['semana', 'Semana'], ['musica', 'Música'], ['progresso', 'Esta semana em números'],
  ['dicas', 'Recomendações'], ['forca', 'Evolução de força'], ['peso', 'Peso e IMC'], ['relogio', 'Relógio (Saúde)'],
  ['trofeus', 'Troféus'], ['recebidos', 'Treinos recebidos'],
];

function config() {
  const saved = settings().homeWidgets;
  const all = WIDGETS.map(([id]) => id);
  if (!Array.isArray(saved)) return all.map((id) => ({ id, on: true }));
  const known = saved.filter((w) => all.includes(w.id));
  return [...known, ...all.filter((id) => !known.some((w) => w.id === id)).map((id) => ({ id, on: true }))];
}

const card = (href, title, body, extra = '') => `
  <a class="card widget" href="${href}" style="color:inherit;display:block">
    <div class="row between"><span class="widget-title">${title}</span><span class="li-chev"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></div>
    ${body}
  </a>${extra}`;

const RENDER = {
  treino(today) {
    const s = db.get('sessions', today);
    if (s?.status === 'rest') return card('#/hoje', 'Treino de hoje', '<h2 style="margin:6px 0 2px">Descanso 😴</h2><p class="muted small" style="margin:0">Recuperação também é treino.</p>');
    const plan = dayPlan(today);
    const logged = loggedSetCount(today);
    const planned = plannedSetCount(plan);
    const pct = planned ? Math.min(100, (logged / planned) * 100) : 0;
    const status = s?.status === 'in_progress' ? 'Em andamento' : ['done', 'partial'].includes(s?.status) ? 'Concluído ✓' : `~${estimateMinutes(plan)} min · ${plan.exercises.length} exercícios`;
    const close = gymCloseFor(today);
    return `
      <a class="hero widget-hero" href="#/hoje" style="display:block;color:#fff">
        <div class="eyebrow">Treino de hoje</div>
        <h1 style="margin:4px 0 2px">${esc(plan.session_name)}</h1>
        <div class="sub">${esc(plan.focus || '')}</div>
        <div class="meter" style="background:rgba(255,255,255,.14)"><i style="width:${pct}%;background:var(--lime)"></i></div>
        <div class="row between" style="margin-top:8px;font-size:.84rem;color:var(--hero-muted)"><span>${logged}/${planned} séries · ${status}</span>${close ? `<span>🕒 fecha ${close.replace(':00', 'h')}</span>` : ''}</div>
        <div class="btn lime block" style="margin-top:14px">${s?.status === 'in_progress' ? 'Continuar treino' : ['done', 'partial'].includes(s?.status) ? 'Ver treino' : 'Abrir treino'}</div>
      </a>`;
  },
  semana(today) {
    // The strip has its own links (each day and "ver semana"), so it is not wrapped in another link.
    return `<div class="widget week-widget">${weekStrip(today)}</div>`;
  },
  musica() {
    if (!isConnected() && !playlistId(settings().playlistUrl)) {
      return card('#/musica', 'Música', '<p class="muted small" style="margin:6px 0 0">Abra Spotify, YouTube Music, YouTube, Apple Music ou Deezer.</p>');
    }
    return `<div class="widget"><div class="row between" style="margin:0 4px 6px"><span class="widget-title">Música</span><a class="small" href="#/musica">abrir ›</a></div><div id="home-music"></div></div>`;
  },
  progresso(today) {
    const start = weekStart(today);
    const wk = weekAdherence(start, today);
    const sets = db.all('set_logs').filter((l) => l.session_id >= start && l.session_id <= today);
    const vol = sets.reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0);
    const min = liftSessions().filter((s) => s.date >= start).reduce((a, s) => a + (s.duration_min || 0), 0);
    return card('#/progresso', 'Esta semana em números', `
      <div class="kv"><div><b>${wk.lifts}/${wk.target}</b><span>treinos</span></div><div><b>${sets.length}</b><span>séries</span></div>
      <div><b>${fmtKg(vol / 1000)}t</b><span>volume</span></div><div><b>${min + weekCardioMinutes(start)}</b><span>min ativos</span></div></div>`);
  },
  dicas(today) {
    const r = recommendations(today).slice(0, 2);
    if (!r.length) return '';
    return card('#/progresso', 'Recomendações', r.map((x) => `<div class="reco ${x.level}" style="padding:8px 0"><span class="ico">${x.icon}</span><div class="grow"><strong class="small">${esc(x.title)}</strong><div class="tiny muted">${esc(x.text)}</div></div></div>`).join(''));
  },
  forca() {
    const ev = progressionEvents().slice(0, 3);
    const pr = recentPRs(1)[0];
    if (!ev.length && !pr) return '';
    const txt = (x) => (x.type === 'sets' ? `${x.from} → ${x.to} séries` : x.type === 'load' ? `${fmtKg(x.from)} → ${fmtKg(x.to)} kg` : `${x.from} → ${x.to} reps`);
    return card('#/progresso?s=forca', 'Evolução de força', `<ul class="list" style="margin-top:4px">${ev.map((x) => `<li class="row between" style="padding:7px 0"><span class="small"><strong>${esc(x.ex.name_pt)}</strong><br><span class="muted">${txt(x)}</span></span><span class="tiny muted">${fmtDay(x.date, { weekday: false })}</span></li>`).join('')}</ul>`);
  },
  peso(today) {
    const w = currentWeight();
    if (!w) return card('#/progresso?s=corpo', 'Peso e IMC', '<p class="muted small" style="margin:6px 0 0">Registre altura e peso para acompanhar.</p>');
    const old = [...bodyLogs()].reverse().find((b) => b.date <= addDays(today, -28));
    const d = old ? w - old.weight_kg : null;
    return card('#/progresso?s=corpo', 'Peso e IMC', `<div class="row gap" style="align-items:baseline;margin-top:4px"><span class="big-num">${fmtKg(w)}<small> kg</small></span>${d !== null ? `<span class="small ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${fmtKg(d)} kg em 30 dias</span>` : ''}</div><div class="muted small">${bmi() ? `IMC ${fmtKg(bmi())}` : ''}</div>`);
  },
  relogio(today) {
    const h = db.get('health_imports', today) || db.all('health_imports').slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!h) return card('#/progresso?s=relogio', 'Relógio (Saúde)', '<p class="muted small" style="margin:6px 0 0">Instale o Atalho do Saúde para ver passos e frequência cardíaca.</p>');
    return card('#/progresso?s=relogio', `Relógio · ${h.date === today ? 'hoje' : fmtDay(h.date, { weekday: false })}`, `
      <div class="kv"><div><b>${h.steps ? fmtInt(h.steps) : '–'}</b><span>passos</span></div><div><b>${h.resting_hr || '–'}</b><span>FC repouso</span></div>
      <div><b>${h.active_kcal ? fmtInt(h.active_kcal) : '–'}</b><span>kcal ativas</span></div><div><b>${h.sleep_h ? fmtKg(h.sleep_h) : '–'}</b><span>h de sono</span></div></div>`);
  },
  trofeus() {
    const list = trophyList();
    const got = list.filter((t) => t.unlocked).length;
    const next = list.filter((t) => !t.unlocked && t.target).sort((a, b) => b.value / b.target - a.value / a.target)[0];
    return card('#/conquistas', 'Troféus', `<div class="row between" style="margin-top:4px"><span class="big-num">${got}<small>/${list.length}</small></span>${next ? `<span class="small muted" style="text-align:right">Próximo: <strong>${esc(next.title)}</strong><br>${next.value}/${next.target}${next.unit || ''}</span>` : ''}</div>`);
  },
  recebidos() {
    const p = pendingSuggestions();
    if (!p.length) return '';
    return card('#/recebidos', 'Treinos recebidos', `<p class="small" style="margin:6px 0 0">📨 <strong>${p.length} novo${p.length > 1 ? 's' : ''}</strong> · de ${esc(p.map((x) => x.author).join(', '))}</p>`);
  },
};

export function render(view) {
  const today = dateKey();
  const cfg = config().filter((w) => w.on);
  const name = db.get('profile', 'me')?.name?.split(' ')[0];
  const next = Object.entries(weekProjection(today)).find(([d, p]) => d > today && p.kind === 'planned');
  view.innerHTML = `
    <div class="page-head row between">
      <div><h1>${name ? `Olá, ${esc(name)}` : 'Início'}</h1><p class="cap-first">${fmtDay(today)}${next ? ` · próximo: ${esc(next[1].slot === 'friend' ? 'treino do amigo' : slotDef(next[1].slot)?.session_name || '')} ${fmtDay(next[0], { weekday: true }).split(',')[0]}` : ''}</p></div>
      <button class="icon-btn" data-act="edit" aria-label="Editar início"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/></svg></button>
    </div>
    ${!settings().apiUrl && !db.all('sessions').length ? '<a class="card" href="#/hoje" style="display:block;color:inherit;margin-bottom:12px"><strong>Já usava o Antares?</strong><div class="muted small">Toque para restaurar tudo com o Face ID.</div></a>' : ''}
    <div class="widgets">${cfg.map((w) => RENDER[w.id]?.(today) || '').join('')}</div>
    <button class="btn ghost block mt" data-act="edit">Personalizar início</button>`;
  const slot = view.querySelector('#home-music');
  if (slot) mountSpotify(slot, { compact: true });
  view.onclick = (e) => {
    if (e.target.closest('[data-act=edit]')) openEditor(view);
  };
}

function openEditor(view) {
  let cfg = config();
  const names = Object.fromEntries(WIDGETS);
  const s = sheet('<h3>Personalizar início</h3><p class="muted small">Ligue, desligue e mude a ordem dos cartões.</p><ul class="list" data-list></ul><button class="btn primary block mt" data-close>Pronto</button>', { onClose: () => render(view) });
  const draw = () => {
    s.el.querySelector('[data-list]').innerHTML = cfg.map((w, i) => `
      <li class="row gap" style="padding:8px 0">
        <label class="check grow" style="min-height:36px"><input type="checkbox" data-on="${i}" ${w.on ? 'checked' : ''}> <span>${names[w.id]}</span></label>
        <button class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button class="icon-btn" data-down="${i}" ${i === cfg.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
      </li>`).join('');
  };
  const save = () => updateSettings({ homeWidgets: cfg });
  s.el.addEventListener('click', (e) => {
    const up = e.target.closest('[data-up]');
    const down = e.target.closest('[data-down]');
    const i = Number((up || down)?.dataset.up ?? (up || down)?.dataset.down);
    if (up && i > 0) [cfg[i - 1], cfg[i]] = [cfg[i], cfg[i - 1]];
    else if (down && i < cfg.length - 1) [cfg[i + 1], cfg[i]] = [cfg[i], cfg[i + 1]];
    else return;
    save();
    draw();
  });
  s.el.addEventListener('change', (e) => {
    const t = e.target.closest('[data-on]');
    if (!t) return;
    cfg = cfg.map((w, j) => (j === Number(t.dataset.on) ? { ...w, on: t.checked } : w));
    save();
  });
  draw();
}
