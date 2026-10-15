// "Progresso": analytics split into sub-menus — Visão geral, Treinos, Força, Corpo, Relógio,
// IA and Troféus — plus rule-based recommendations.
import * as db from '../db.js';
import { exercise, rotation, weeklyTarget, weekProjection, slotDef } from '../program.js';
import { exerciseHistory, e1rm } from '../progression.js';
import {
  dayInfo, weekAdherence, weekStreaks, totals, weekVolume, weekCardioMinutes, recentPRs, strengthTable,
  slotBalance, profile, bodyLogs, currentWeight, bmi, age, liftSessions, progressionEvents, progressionCounts,
} from '../stats.js';
import { recommendations } from '../recommend.js';
import { loadChart, chartColors } from '../charts.js';
import { settings, updateSettings } from '../settings.js';
import { analyze, renderMarkdown, AI_MODEL } from '../ai.js';
import { sheet, toast } from '../ui.js';
import { dateKey, addDays, weekStart, fmtDay, fmtKg, fmtInt, esc, daysBetween, fmtVolume } from '../util.js';
import { afterDataChange } from '../achievements.js';

const TABS = [['geral', 'Visão geral'], ['treinos', 'Treinos'], ['forca', 'Força'], ['corpo', 'Corpo'], ['relogio', 'Relógio']];
const HEAT_WEEKS = 18;
const TREND_WEEKS = 8;
let charts = [];
let selectedExercise = '';
let volumeOffset = 0;

export function render(view, query) {
  charts.forEach((c) => c.destroy());
  charts = [];
  const tab = TABS.some(([k]) => k === query?.get('s')) ? query.get('s') : 'geral';
  view.innerHTML = `
    <div class="page-head"><h1>Progresso</h1></div>
    <div class="chips scroll" role="tablist">${TABS.map(([k, l]) => `<a class="chip" role="tab" href="#/progresso?s=${k}" aria-pressed="${k === tab}" style="text-decoration:none">${l}</a>`).join('')}</div>
    <div id="tab" class="mt"></div>`;
  const el = view.querySelector('#tab');
  const show = (k) => {
    charts.forEach((c) => c.destroy());
    charts = [];
    el.onclick = el.onchange = el.onsubmit = null;
    ({ geral, treinos, forca, corpo, relogio })[k](el, view);
  };
  show(tab);
  // Switching sub-tabs re-renders only the content: no route change, no jump to the top.
  view.querySelector('[role=tablist]').onclick = (e) => {
    const a = e.target.closest('a[href^="#/progresso"]');
    if (!a) return;
    e.preventDefault();
    const k = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('s');
    history.replaceState(null, '', `#/progresso?s=${k}`);
    view.querySelectorAll('[role=tablist] a').forEach((x) => x.setAttribute('aria-pressed', String(x === a)));
    a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    show(k);
  };
}

const make = (Chart, id, config) => {
  const el = document.getElementById(id);
  if (el) charts.push(new Chart(el, config));
};
const bar = { borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 28 };
const lbl = (d) => fmtDay(d, { weekday: false });

/* ---------- Visão geral ---------- */
function weekStats(start, today, upTo = addDays(start, 6)) {
  const end = upTo < addDays(start, 6) ? upTo : addDays(start, 6);
  const sets = db.all('set_logs').filter((l) => l.session_id >= start && l.session_id <= end && l.session_id <= today);
  const sessions = liftSessions().filter((x) => x.date >= start && x.date <= end);
  return {
    ...weekAdherence(start, today),
    sets: sets.length,
    volume: sets.reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0),
    minutes: sessions.reduce((a, x) => a + (x.duration_min || 0), 0),
    cardio: db.all('cardio_logs').filter((c) => c.session_id >= start && c.session_id <= end).reduce((a, c) => a + (c.duration_min || 0), 0),
  };
}

function monthStats(prefix) {
  const sets = db.all('set_logs').filter((l) => l.session_id.startsWith(prefix));
  return {
    workouts: liftSessions().filter((x) => x.date.startsWith(prefix)).length,
    volume: sets.reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0),
    cardio: db.all('cardio_logs').filter((c) => c.session_id.startsWith(prefix)).reduce((a, c) => a + (c.duration_min || 0), 0),
  };
}

const delta = (now, before) => {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return '<span class="tiny muted">= sem. passada</span>';
  return `<span class="tiny ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
};

function geral(el) {
  const today = dateKey();
  const thisWeek = weekStart(today);
  const st = weekStreaks(today);
  const tot = totals();
  const wk = weekStats(thisWeek, today);
  // Last week up to the same weekday, so a week in progress is compared fairly.
  const prevStart = addDays(thisWeek, -7);
  const prev = weekStats(prevStart, today, addDays(prevStart, daysBetween(thisWeek, today)));
  const recos = recommendations(today);
  const lifts = liftSessions();
  const last = lifts.filter((x) => x.date <= today).pop();
  const lastSets = last ? (db.index('set_logs', 'session_id').get(last.id) || []) : [];
  const proj = weekProjection(today);
  const nextEntry = Object.entries(proj).filter(([d, p]) => d >= today && (p.kind === 'today' || p.kind === 'planned') && !(d === today && db.get('sessions', d)?.status === 'done')).sort()[0];
  const nextDef = nextEntry && nextEntry[1].slot !== 'friend' ? slotDef(nextEntry[1].slot) : null;
  const month = today.slice(0, 7);
  const prevMonth = dateKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).slice(0, 7);
  const m = monthStats(month);
  const pm = monthStats(prevMonth);
  const top = strengthTable().filter((r) => r.sessions >= 3 && r.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 3);
  const logs = bodyLogs();
  const w = currentWeight();
  const w30 = [...logs].reverse().find((b) => b.date <= addDays(today, -28));
  const heatStart = addDays(thisWeek, -(HEAT_WEEKS - 1) * 7);
  let cells = '';
  let nLift = 0;
  let nCardio = 0;
  for (let i = 0; i < HEAT_WEEKS * 7; i++) {
    const d = addDays(heatStart, i);
    const info = dayInfo(d, today);
    const cls = { lift: 'l3', partial: 'l1', cardio: 'cardio', rest: 'rest', future: 'future' }[info.state] || '';
    if (info.state === 'lift' || info.state === 'partial') nLift++;
    if (info.state === 'cardio') nCardio++;
    cells += `<span class="c ${cls}" title="${fmtDay(d)}: ${{ lift: 'treino', partial: 'treino parcial', cardio: 'só cardio', rest: 'descanso' }[info.state] || '—'}"></span>`;
  }
  el.innerHTML = `
    <div class="card">
      <div class="row between"><h3 style="margin:0">Esta semana <span class="tiny muted" style="font-weight:500">vs. mesmo ponto da anterior</span></h3><span class="pill ${wk.lifts >= wk.target ? 'success' : 'accent'}">${wk.lifts}/${wk.target} treinos</span></div>
      <div class="meter"><i style="width:${Math.min(100, (wk.lifts / wk.target) * 100)}%"></i></div>
      <div class="kv">
        <div><b>${wk.sets}</b><span>séries</span><br>${delta(wk.sets, prev.sets)}</div>
        <div><b>${fmtInt(wk.volume)}</b><span>kg levantados</span><br>${delta(wk.volume, prev.volume)}</div>
        <div><b>${wk.minutes}</b><span>min treino</span><br>${delta(wk.minutes, prev.minutes)}</div>
        <div><b>${wk.cardio}</b><span>min cardio</span><br>${delta(wk.cardio, prev.cardio)}</div>
      </div>
    </div>
    <div class="grid2 mt">
      <a class="tile" href="#/hoje" style="color:inherit"><div class="l">Próximo treino</div><div class="v sm">${esc(nextEntry ? (nextDef?.session_name || 'Treino do amigo') : 'Meta batida ✓')}</div><div class="l">${nextEntry ? (nextEntry[0] === today ? 'hoje' : fmtDay(nextEntry[0])) : 'descanse'}</div></a>
      <a class="tile" href="${last ? `#/dia/${last.date}` : '#/hoje'}" style="color:inherit"><div class="l">Último treino</div><div class="v sm">${esc(last?.planned_session || '—')}</div><div class="l">${last ? `${fmtDay(last.date, { weekday: false })} · ${lastSets.length} séries${last.duration_min ? ` · ${last.duration_min} min` : ''}` : 'nenhum ainda'}</div></a>
    </div>
    <div class="tiles mt">
      <div class="tile"><div class="v">${tot.workouts}</div><div class="l">treinos no total</div></div>
      <div class="tile"><div class="v">${st.current}<small> sem.</small></div><div class="l">na meta seguidas · recorde ${st.record}</div></div>
      <div class="tile"><div class="v">${tot.avgDuration ?? '–'}${tot.avgDuration ? '<small> min</small>' : ''}</div><div class="l">tempo médio</div></div>
      <div class="tile"><div class="v">${db.all('set_logs').filter((l) => l.is_pr).length}</div><div class="l">recordes pessoais</div></div>
    </div>
    <div class="section"><div class="section-title"><span>Recomendações</span></div>
      <div class="card">${recos.length ? recos.slice(0, 6).map((r) => `<div class="reco ${r.level}"><span class="ico">${r.icon}</span><div class="grow"><strong>${esc(r.title)}</strong><div class="small muted">${esc(r.text)}</div></div></div>`).join('') : '<p class="muted" style="margin:0">Registre alguns treinos para receber recomendações.</p>'}</div>
    </div>
    <div class="section"><div class="section-title"><span>Volume por semana</span></div>
      <div class="card"><div class="chart-box short"><canvas id="c-vol8" aria-label="Volume semanal em toneladas"></canvas></div><p class="tiny muted" style="margin:6px 0 0">Toneladas levantadas (séries × reps × carga) nas últimas ${TREND_WEEKS} semanas.</p></div></div>
    <div class="card mt">
      <h3>Treinos por semana</h3>
      <div class="chart-box short"><canvas id="c-adh" aria-label="Treinos por semana"></canvas></div>
      <p class="tiny muted" style="margin:6px 0 0">Tracejado: meta de ${weeklyTarget()}. Azul = meta batida; laranja = abaixo.</p>
    </div>
    <div class="section"><div class="section-title"><span>Este mês × mês passado</span></div>
      <div class="card"><div class="kv" style="grid-template-columns:repeat(3,1fr);margin-top:0">
        <div><b>${m.workouts}</b><span>treinos (antes ${pm.workouts})</span></div>
        <div><b>${fmtInt(m.volume)}</b><span>kg levantados (antes ${fmtVolume(pm.volume)})</span></div>
        <div><b>${m.cardio}</b><span>min cardio (antes ${pm.cardio})</span></div>
      </div></div></div>
    ${top.length ? `<div class="section"><div class="section-title"><span>Maiores evoluções</span><a href="#/progresso?s=forca">ver força ›</a></div>
      <div class="group"><ul class="list">${top.map((r) => `<li><a class="list-item" href="#/ex/${r.ex.id}" style="color:inherit"><span class="li-ico" style="background:var(--success)">↑</span><span class="grow"><strong>${esc(r.ex.name_pt)}</strong><br><span class="li-sub">1RM est. ${fmtKg(r.best)} kg · ${r.sessions} treinos</span></span><span class="trend up">+${r.changePct}%</span></a></li>`).join('')}</ul></div></div>` : ''}
    <a class="card mt" href="#/progresso?s=corpo" style="display:flex;gap:12px;align-items:center;color:inherit">
      <span class="li-ico" style="background:var(--series-1)">⚖︎</span>
      <span class="grow"><strong>${w ? `${fmtKg(w)} kg` : 'Registre seu peso'}</strong><br><span class="li-sub">${w && w30 ? `${w - w30.weight_kg >= 0 ? '+' : ''}${fmtKg(w - w30.weight_kg)} kg em ~30 dias` : 'altura e peso em Corpo'}${bmi() ? ` · IMC ${fmtKg(bmi())}` : ''}</span></span><span class="li-chev">›</span>
    </a>
    <div class="card mt">
      <h3>Frequência · ${HEAT_WEEKS} semanas</h3>
      <p class="muted small">${nLift} treinos · ${nCardio} dias só de cardio</p>
      <div class="row gap" style="align-items:flex-start">
        <div class="tiny muted" style="display:grid;grid-template-rows:repeat(7,14px);gap:3px;line-height:14px">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((l) => `<span>${l}</span>`).join('')}</div>
        <div class="heatmap" role="img" aria-label="Mapa de frequência">${cells}</div>
      </div>
      <div class="legend"><span><i style="background:var(--heat-3)"></i>treino</span><span><i style="background:var(--heat-1)"></i>parcial</span><span><i style="background:var(--heat-cardio)"></i>só cardio</span><span><i style="box-shadow:inset 0 0 0 1px var(--surface-3)"></i>descanso</span></div>
    </div>`;
  loadChart().then((Chart) => {
    const c = chartColors();
    const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => addDays(thisWeek, (i - TREND_WEEKS + 1) * 7));
    const ws = weeks.map((x) => weekStats(x, today));
    make(Chart, 'c-vol8', {
      type: 'line',
      data: { labels: weeks.map(lbl), datasets: [{ label: 'Volume (t)', data: ws.map((x) => Math.round(x.volume / 100) / 10), borderColor: c.series[0], backgroundColor: c.series[0], borderWidth: 2, tension: 0.3, pointRadius: 3 }] },
      options: c.options({ beginAtZero: true, plugins: { legend: { display: false } } }),
    });
    make(Chart, 'c-adh', {
      type: 'bar',
      data: {
        labels: weeks.map(lbl),
        datasets: [
          { type: 'line', label: 'Meta', data: weeks.map(() => weeklyTarget()), borderColor: c.text, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
          { label: 'Treinos', data: ws.map((x) => x.lifts), backgroundColor: ws.map((x) => (x.lifts >= x.target ? c.series[0] : c.series[1])), ...bar },
        ],
      },
      options: c.options({ beginAtZero: true, y: { suggestedMax: weeklyTarget() + 1, ticks: { color: c.text, stepSize: 1 } }, plugins: { legend: { display: false } } }),
    });
  });
}

/* ---------- Treinos ---------- */
function treinos(el, view) {
  const today = dateKey();
  const sessions = db.all('sessions').filter((s) => ['done', 'partial', 'cardio', 'in_progress'].includes(s.status)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  const bal = slotBalance(28, today);
  const maxBal = Math.max(1, ...Object.values(bal));
  const volWeek = addDays(weekStart(today), volumeOffset * 7);
  const vol = weekVolume(volWeek);
  const groups = ['peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'quadríceps', 'posteriores', 'glúteos', 'adutores', 'panturrilhas', 'abdômen'];
  const maxSets = Math.max(12, ...Object.values(vol).map((v) => v.sets));
  el.innerHTML = `
    <div class="card">
      <h3>Equilíbrio do rodízio · 4 semanas</h3>
      ${rotation().map((d) => `<div class="bar-row"><span>${esc(d.session_name)}</span><span class="bar-track"><i style="width:${(bal[d.slot] / maxBal) * 100}%"></i></span><span class="num small">${bal[d.slot]}x</span></div>`).join('')}
      <p class="tiny muted" style="margin:6px 0 0">O próximo treino sugerido é sempre o feito há mais tempo, então isso se equilibra sozinho.</p>
    </div>
    <div class="card mt">
      <div class="row between"><h3 style="margin:0">Séries por grupo</h3>
        <div class="seg"><button data-vol="-1" aria-pressed="${volumeOffset === -1}">Anterior</button><button data-vol="0" aria-pressed="${volumeOffset === 0}">Atual</button></div></div>
      <p class="muted small" style="margin-top:6px">Semana de ${lbl(volWeek)}. Traço = referência de ~10 séries semanais nos grupos grandes.</p>
      ${groups.map((g) => {
        const v = vol[g] || { sets: 0, tonnage: 0 };
        return `<div class="bar-row"><span>${g}</span><span class="bar-track"><i style="width:${(v.sets / maxSets) * 100}%"></i>${['peito', 'costas', 'quadríceps', 'posteriores', 'glúteos', 'ombros'].includes(g) ? `<span class="mark" style="left:${(10 / maxSets) * 100}%"></span>` : ''}</span><span class="num small">${v.sets}</span></div>`;
      }).join('')}
      <p class="tiny muted" style="margin:6px 0 0">Volume total da semana: ${fmtInt(Object.values(vol).reduce((a, v) => a + v.tonnage, 0))} kg (séries × reps × carga).</p>
    </div>
    <div class="card mt"><h3>Cardio por semana</h3><div class="chart-box"><canvas id="c-cardio" aria-label="Minutos de cardio por semana"></canvas></div></div>
    <div class="section"><div class="section-title"><span>Histórico</span></div>
      <div class="group"><ul class="list">${sessions.map((s) => {
        const sets = db.index('set_logs', 'session_id').get(s.id) || [];
        const vol2 = sets.reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0);
        return `<li><button class="list-item" data-session="${s.id}"><span class="li-ico" style="background:${s.status === 'cardio' ? 'var(--info)' : s.status === 'partial' ? 'var(--warn)' : 'var(--accent)'}">${s.status === 'cardio' ? '♥' : '✓'}</span><span class="grow"><strong>${esc(s.planned_session)}</strong><br><span class="li-sub">${fmtDay(s.date)} · ${sets.length} séries${vol2 ? ` · ${fmtInt(vol2)} kg` : ''}${s.duration_min ? ` · ${s.duration_min} min` : ''}</span></span><span class="li-chev">›</span></button></li>`;
      }).join('') || '<li class="muted" style="padding:14px 16px">Nenhum treino ainda.</li>'}</ul></div>
    </div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-vol]');
    if (b) { volumeOffset = Number(b.dataset.vol); treinos(el, view); return; }
    const s = e.target.closest('[data-session]');
    if (s) sessionSheet(s.dataset.session);
  };
  loadChart().then((Chart) => {
    const c = chartColors();
    const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => addDays(weekStart(today), (i - TREND_WEEKS + 1) * 7));
    make(Chart, 'c-cardio', {
      type: 'bar',
      data: { labels: weeks.map(lbl), datasets: [{ label: 'Cardio (min)', data: weeks.map((w) => weekCardioMinutes(w)), backgroundColor: c.series[2], ...bar }] },
      options: c.options({ beginAtZero: true, plugins: { legend: { display: false } } }),
    });
  });
}

function sessionSheet(id) {
  const s = db.get('sessions', id);
  const sets = (db.index('set_logs', 'session_id').get(id) || []).slice().sort((a, b) => String(a.timestamp).localeCompare(b.timestamp));
  const byEx = new Map();
  sets.forEach((l) => { if (!byEx.has(l.exercise_id)) byEx.set(l.exercise_id, []); byEx.get(l.exercise_id).push(l); });
  const cardio = db.index('cardio_logs', 'session_id').get(id) || [];
  sheet(`
    <h3>${esc(s.planned_session)}</h3>
    <p class="muted small" style="text-transform:capitalize">${fmtDay(s.date)}${s.duration_min ? ` · ${s.duration_min} min` : ''}</p>
    ${cardio.length ? `<p class="small">♥ Cardio: ${cardio.map((c) => `${esc(c.type)} ${c.duration_min} min`).join(', ')}</p>` : ''}
    <ul class="list">${[...byEx.entries()].map(([ex, ls]) => `<li style="padding:8px 0"><strong>${esc(exercise(ex)?.name_pt || ex)}</strong><br><span class="li-sub">${ls.map((l) => `${fmtKg(l.load_kg)}×${l.reps}${l.is_pr ? ' 🏆' : ''}`).join(', ')}</span></li>`).join('')}</ul>
    <div class="row gap mt"><a class="btn grow" href="#/dia/${s.date}" data-close>Abrir dia</a><button class="btn ghost grow" data-close>Fechar</button></div>`);
}

/* ---------- Força ---------- */
function forca(el) {
  const table = strengthTable();
  if (!selectedExercise || !table.some((r) => r.ex.id === selectedExercise)) selectedExercise = table[0]?.ex.id || '';
  const prs = recentPRs(6);
  const pc = progressionCounts();
  const events = progressionEvents();
  const evIcon = { sets: ['＋', 'var(--series-1)'], load: ['↑', 'var(--success)'], reps: ['↗', 'var(--series-3)'] };
  const evText = (x) => (x.type === 'sets' ? `${x.from} → ${x.to} séries` : x.type === 'load' ? `carga ${fmtKg(x.from)} → ${fmtKg(x.to)} kg` : `${x.from} → ${x.to} repetições no total`);
  const timeline = events.length ? `
    <div class="section"><div class="section-title"><span>Linha do tempo da evolução</span><span>${events.length}</span></div>
      <div class="group"><ul class="list">${events.slice(0, 40).map((x) => `<li><a class="list-item" href="#/ex/${x.ex.id}" style="color:inherit"><span class="li-ico" style="background:${evIcon[x.type][1]}">${evIcon[x.type][0]}</span><span class="grow"><strong class="ellipsis">${esc(x.ex.name_pt)}</strong><br><span class="li-sub">${evText(x)}</span></span><span class="tiny muted">${fmtDay(x.date, { weekday: false })}</span></a></li>`).join('')}</ul></div>
    </div>` : '';
  el.innerHTML = table.length ? `
    <div class="tiles">
      <div class="tile"><div class="v">${pc.distinct}</div><div class="l">exercícios diferentes feitos</div></div>
      <div class="tile"><div class="v">${pc.performed}</div><div class="l">exercícios realizados no total</div></div>
      <div class="tile"><div class="v">${pc.setDays}</div><div class="l">dias em que você aumentou as séries</div></div>
      <div class="tile"><div class="v">${pc.loadUps}</div><div class="l">aumentos de carga</div></div>
    </div>
    <div class="card mt">
      <select data-ex-select aria-label="Exercício">${table.map((r) => `<option value="${r.ex.id}" ${r.ex.id === selectedExercise ? 'selected' : ''}>${esc(r.ex.name_pt)}</option>`).join('')}</select>
      <div class="chart-box mt"><canvas id="c-ex" aria-label="Carga e 1RM estimado"></canvas></div>
      <p class="tiny muted" style="margin:6px 0 0"><a href="#/ex/${selectedExercise}">Abrir exercício ›</a></p>
    </div>
    <div class="card mt">
      <h3>Todos os exercícios</h3>
      <table class="hist"><thead><tr><th>Exercício</th><th>1RM est.</th><th>Desde o início</th></tr></thead><tbody>
      ${table.map((r) => `<tr><td><a href="#/ex/${r.ex.id}">${esc(r.ex.name_pt)}</a><br><span class="tiny muted">${r.sessions} treinos</span></td><td class="num">${fmtKg(r.best)} kg</td><td><span class="trend ${r.trend}">${r.trend === 'new' ? 'novo' : `${r.changePct > 0 ? '+' : ''}${r.changePct}%`}${r.trend === 'stalled' ? ' · parado' : r.trend === 'down' ? ' · caiu' : ''}</span></td></tr>`).join('')}
      </tbody></table>
    </div>
    ${timeline}
    <div class="card mt"><h3>Recordes recentes</h3>
      ${prs.length ? `<ul class="list">${prs.map((l) => `<li class="row between" style="padding:8px 0"><span>🏆 ${esc(exercise(l.exercise_id)?.name_pt || l.exercise_id)}<br><span class="tiny muted">${lbl(l.session_id)}</span></span><span class="small num"><strong>${fmtKg(l.load_kg)} × ${l.reps}</strong><br><span class="tiny muted">1RM ${fmtKg(e1rm(l.load_kg, l.reps))}</span></span></li>`).join('')}</ul>` : '<p class="muted small">Sem recordes ainda.</p>'}
    </div>` : '<div class="card"><p class="muted" style="margin:0">Registre séries para ver sua evolução de força.</p></div>';
  el.onchange = (e) => {
    if (e.target.matches('[data-ex-select]')) { selectedExercise = e.target.value; charts.forEach((c) => c.destroy()); charts = []; forca(el); }
  };
  if (!selectedExercise) return;
  loadChart().then((Chart) => {
    const c = chartColors();
    const hist = exerciseHistory(selectedExercise);
    make(Chart, 'c-ex', {
      type: 'line',
      data: {
        labels: hist.map((h) => lbl(h.date)),
        datasets: [
          { label: 'Carga (kg)', data: hist.map((h) => h.topLoad), borderColor: c.series[0], backgroundColor: c.series[0], borderWidth: 2, tension: 0.25, pointRadius: 4 },
          { label: '1RM est. (kg)', data: hist.map((h) => Math.round(h.bestE1rm * 10) / 10), borderColor: c.series[1], backgroundColor: c.series[1], borderWidth: 2, borderDash: [5, 4], tension: 0.25, pointRadius: 4 },
        ],
      },
      options: c.options(),
    });
  });
}

/* ---------- Corpo ---------- */
function corpo(el, view) {
  const p = profile();
  const logs = bodyLogs();
  const w = currentWeight();
  const first = logs[0];
  const lp = strengthTable().find((r) => r.ex.id === 'leg_press');
  const bench = strengthTable().find((r) => r.ex.id === 'db_bench_press');
  el.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="v">${w ? fmtKg(w) : '–'}<small> kg</small></div><div class="l">peso atual${first && w ? ` · ${w - first.weight_kg >= 0 ? '+' : ''}${fmtKg(w - first.weight_kg)} desde ${lbl(first.date)}` : ''}</div></div>
      <div class="tile"><div class="v">${bmi() ? fmtKg(bmi()) : '–'}</div><div class="l">IMC${p.height_cm ? ` · ${p.height_cm} cm` : ''}</div></div>
      <div class="tile"><div class="v">${age(p.birth_date) ?? '–'}</div><div class="l">idade</div></div>
      <div class="tile"><div class="v">${lp && w ? `${fmtKg(lp.best / w)}<small>×</small>` : '–'}</div><div class="l">leg press (1RM) ÷ peso</div></div>
    </div>
    ${!p.name || !p.height_cm ? '<a class="banner mt" href="#/perfil" style="text-decoration:none"><span>👤</span><span class="grow">Complete o perfil (nome, altura, nascimento, objetivo).</span><span class="btn small">Perfil</span></a>' : ''}
    <div class="card mt">
      <h3>Medidas</h3><p class="muted small" style="margin-top:0">Altura e peso alimentam o IMC, a força relativa e a análise com IA.</p>
      <form data-form="body">
        <div class="grid2">
          <label class="field"><span>Altura (cm)</span><input type="number" inputmode="numeric" name="height" value="${p.height_cm || ''}"></label>
          <label class="field"><span>Peso (kg)</span><input type="number" step="0.1" inputmode="decimal" name="weight" value="${w ?? ''}" required></label>
          <label class="field"><span>Data</span><input type="date" name="date" value="${dateKey()}"></label>
        </div>
        <button class="btn primary block" type="submit">Salvar medidas</button>
      </form>
    </div>
    ${logs.length ? `<div class="card mt"><h3>Peso</h3><div class="chart-box"><canvas id="c-weight" aria-label="Peso ao longo do tempo"></canvas></div>
      <table class="hist mt"><thead><tr><th>Data</th><th>Peso</th><th>IMC</th><th></th></tr></thead><tbody>
      ${[...logs].reverse().slice(0, 12).map((b) => `<tr><td>${lbl(b.date)}</td><td class="num">${fmtKg(b.weight_kg)} kg</td><td class="num">${p.height_cm ? fmtKg(b.weight_kg / ((p.height_cm / 100) ** 2)) : '–'}</td><td><button class="link-btn" data-del-body="${b.id}">apagar</button></td></tr>`).join('')}
      </tbody></table></div>` : ''}
    ${bench && w ? `<p class="muted small mt">Supino c/ halteres: 1RM est. ${fmtKg(bench.best)} kg por halter (${fmtKg((bench.best * 2) / w)}× o peso corporal somando os dois).</p>` : ''}`;
  el.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const weight = Number(String(f.weight.value).replace(',', '.'));
    if (!(weight > 20 && weight < 300)) { toast('Peso inválido'); return; }
    const height = Number(f.height.value);
    if (height > 100 && height < 250 && height !== Number(p.height_cm)) await db.save('profile', { ...profile(), id: 'me', height_cm: height });
    await db.save('body_logs', { id: f.date.value || dateKey(), date: f.date.value || dateKey(), weight_kg: weight, body_fat_pct: null, waist_cm: null, notes: '' });
    toast('Medidas salvas');
    afterDataChange();
    corpo(el, view);
  };
  el.onclick = async (e) => {
    const d = e.target.closest('[data-del-body]');
    if (d) { await db.remove('body_logs', d.dataset.delBody); corpo(el, view); }
  };
  if (logs.length) {
    loadChart().then((Chart) => {
      const c = chartColors();
      make(Chart, 'c-weight', {
        type: 'line',
        data: { labels: logs.map((b) => lbl(b.date)), datasets: [{ label: 'Peso (kg)', data: logs.map((b) => b.weight_kg), borderColor: c.series[0], backgroundColor: c.series[0], borderWidth: 2, tension: 0.25, pointRadius: 3 }] },
        options: c.options({ plugins: { legend: { display: false } } }),
      });
    });
  }
}

/* ---------- Relógio ---------- */
function relogio(el) {
  const health = db.all('health_imports').slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!health.length) {
    el.innerHTML = '<div class="card"><h3>Relógio (Zepp → Apple Saúde)</h3><p class="muted small">Sem dados ainda. Instale o Atalho em Mais → Atalho do Saúde e rode-o uma vez. Se rodou e nada apareceu, use Mais → Ajustes → Diagnóstico da planilha.</p><a class="btn block" href="shortcuts/">Instalar o Atalho</a></div>';
    return;
  }
  const last7 = health.slice(0, 7);
  const avg = (k) => {
    const v = last7.map((h) => h[k]).filter((x) => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const rows = health.slice(0, 14).map((h) => {
    const s = db.get('sessions', h.date);
    const st = s?.status === 'done' || s?.status === 'partial' ? `${s.planned_session}${s.duration_min ? ` ${s.duration_min}′` : ''}` : s?.status === 'cardio' ? 'cardio' : s?.status === 'rest' ? 'descanso' : '—';
    return `<tr><td>${lbl(h.date)}</td><td>${esc(st)}</td><td class="num">${h.workout_avg_hr || h.avg_hr || '–'}</td><td class="num">${h.resting_hr || '–'}</td><td class="num">${h.steps ? fmtInt(h.steps) : '–'}</td></tr>`;
  }).join('');
  el.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="v">${avg('resting_hr') ? Math.round(avg('resting_hr')) : '–'}</div><div class="l">FC de repouso (7 dias)</div></div>
      <div class="tile"><div class="v">${avg('steps') ? fmtInt(avg('steps')) : '–'}</div><div class="l">passos/dia</div></div>
      <div class="tile"><div class="v">${avg('sleep_h') ? fmtKg(avg('sleep_h')) : '–'}<small> h</small></div><div class="l">sono médio</div></div>
      <div class="tile"><div class="v">${avg('active_kcal') ? fmtInt(avg('active_kcal')) : '–'}</div><div class="l">kcal ativas/dia</div></div>
    </div>
    <div class="card mt"><h3>FC de repouso</h3><div class="chart-box"><canvas id="c-rhr" aria-label="FC de repouso"></canvas></div></div>
    <div class="card mt"><h3>Dias com dados</h3><table class="hist"><thead><tr><th>Dia</th><th>Treino</th><th>FC</th><th>Rep.</th><th>Passos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const rhr = health.filter((h) => h.resting_hr > 0).slice(0, 30).reverse();
  if (rhr.length) {
    loadChart().then((Chart) => {
      const c = chartColors();
      make(Chart, 'c-rhr', {
        type: 'line',
        data: { labels: rhr.map((h) => lbl(h.date)), datasets: [{ label: 'FC de repouso (bpm)', data: rhr.map((h) => h.resting_hr), borderColor: c.series[0], backgroundColor: c.series[0], borderWidth: 2, tension: 0.25, pointRadius: 3 }] },
        options: c.options({ plugins: { legend: { display: false } } }),
      });
    });
  }
}

/* ---------- IA (opened from the Perfil tab) ---------- */
export function renderAI(view) {
  view.innerHTML = '<div class="page-head"><h1>Análise com IA</h1><p>Uma leitura dos seus treinos, corpo e relógio, com recomendações.</p></div><div id="tab"></div>';
  ia(view.querySelector('#tab'));
}

function ia(el) {
  const s = settings();
  const reports = db.all('ai_reports').slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  el.innerHTML = `
    <div class="card">
      <h3>Análise com IA (Claude)</h3>
      <p class="muted small">O app envia um resumo numérico dos seus treinos, perfil, peso e relógio para o modelo ${AI_MODEL} e mostra a análise. Custa centavos por análise na sua conta da Anthropic.</p>
      ${s.anthropicKey ? `<div class="row between"><span class="pill accent">chave configurada</span><button class="link-btn" data-act="key-remove">remover chave</button></div>`
        : `<label class="field"><span>Chave da API (console.anthropic.com → API Keys)</span><input type="password" name="key" autocomplete="off" placeholder="sk-ant-..."></label><button class="btn block" data-act="key-save">Salvar chave</button><p class="tiny muted">A chave fica só neste aparelho (localStorage) e vai direto para api.anthropic.com.</p>`}
      <label class="field mt"><span>Pergunta específica (opcional)</span><input type="text" name="question" placeholder="ex.: por que meu supino travou?"></label>
      <button class="btn primary block big" data-act="run" ${s.anthropicKey ? '' : 'disabled'}>Gerar análise</button>
    </div>
    <div id="ai-out"></div>
    ${reports.length ? `<div class="section"><div class="section-title"><span>Análises anteriores</span></div><div class="group"><ul class="list">${reports.map((r) => `<li><button class="list-item" data-report="${r.id}"><span class="li-ico" style="background:var(--series-1)">✦</span><span class="grow"><strong>${fmtDay(dateKey(new Date(r.created_at)))}</strong><br><span class="li-sub">${esc(r.text.replace(/[#*]/g, '').slice(0, 90))}…</span></span><span class="li-chev">›</span></button></li>`).join('')}</ul></div></div>` : ''}`;
  el.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'key-save') {
      const key = el.querySelector('[name=key]').value.trim();
      if (!key.startsWith('sk-')) { toast('Chave inválida'); return; }
      updateSettings({ anthropicKey: key });
      ia(el);
    } else if (act === 'key-remove') {
      updateSettings({ anthropicKey: '' });
      ia(el);
    } else if (act === 'run') {
      const out = el.querySelector('#ai-out');
      const btn = e.target.closest('[data-act]');
      btn.disabled = true;
      btn.textContent = 'Analisando…';
      out.innerHTML = '<div class="card mt md"><p class="muted">Pensando nos seus dados…</p></div>';
      try {
        const report = await analyze({ question: el.querySelector('[name=question]').value.trim(), onText: (t) => { out.innerHTML = `<div class="card mt md">${renderMarkdown(t)}</div>`; } });
        out.innerHTML = `<div class="card mt md">${renderMarkdown(report.text)}<p class="tiny muted">Gerado por ${esc(report.model)}. Não substitui orientação profissional.</p></div>`;
        afterDataChange();
      } catch (err) {
        const msg = String(err.message || err);
        const friendly = /401|authentication|x-api-key/.test(msg) ? 'Chave da API inválida. Confira em console.anthropic.com → API Keys.'
          : /429|rate/.test(msg) ? 'Limite de uso da API atingido. Tente de novo em alguns minutos.'
            : /credit|billing|402/.test(msg) ? 'Sem créditos na conta da Anthropic.'
              : /Failed to fetch|NetworkError|import/.test(msg) ? 'Sem internet para falar com a IA.' : msg;
        out.innerHTML = `<div class="banner warn mt"><span class="grow">Não foi possível gerar: ${esc(friendly)}</span></div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar análise';
      }
    }
    const rep = e.target.closest('[data-report]');
    if (rep) {
      const r = db.get('ai_reports', rep.dataset.report);
      const sh = sheet(`<div class="md">${renderMarkdown(r.text)}</div><p class="tiny muted">${esc(r.model)} · ${fmtDay(dateKey(new Date(r.created_at)))}</p><div class="row gap"><button class="btn danger grow" data-del>Apagar</button><button class="btn ghost grow" data-close>Fechar</button></div>`);
      sh.el.querySelector('[data-del]').onclick = async () => { await db.remove('ai_reports', r.id); sh.close(); ia(el); };
    }
  };
}
