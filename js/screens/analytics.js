// "Analytics": frequency heatmap, adherence, streaks, time in the gym, weekly volume per
// muscle group, load/1RM per exercise, cardio minutes, PRs and Apple Health (Zepp) data.
import * as db from '../db.js';
import { exercise } from '../program.js';
import { exerciseHistory, e1rm } from '../progression.js';
import {
  dayInfo, weekAdherence, streaks, totals, weekVolume, weekCardioMinutes, recentPRs, exercisesWithHistory,
} from '../stats.js';
import { loadChart, chartColors } from '../charts.js';
import { dateKey, addDays, weekStart, fmtDay, fmtKg, fmtInt, esc } from '../util.js';

const HEAT_WEEKS = 18;
const TREND_WEEKS = 8;
let charts = [];
let volumeOffset = 0;
let selectedExercise = '';

export function render(view) {
  charts.forEach((c) => c.destroy());
  charts = [];
  const today = dateKey();
  const thisWeek = weekStart(today);
  const st = streaks(today);
  const tot = totals();
  const adh = weekAdherence(thisWeek, today);
  const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => addDays(thisWeek, (i - TREND_WEEKS + 1) * 7));

  // Heatmap: columns are weeks (Mon..Sun rows), oldest on the left.
  const heatStart = addDays(thisWeek, -(HEAT_WEEKS - 1) * 7);
  let cells = '';
  let attended = 0;
  let missed = 0;
  for (let i = 0; i < HEAT_WEEKS * 7; i++) {
    const d = addDays(heatStart, i);
    const info = dayInfo(d, today);
    let cls = '';
    let label = 'sem plano';
    if (info.state === 'attended') {
      const lift = db.all('set_logs').some((l) => l.session_id === d);
      cls = info.session.status === 'partial' ? 'l1' : lift ? 'l3' : 'l2';
      label = info.session.status === 'partial' ? 'parcial' : lift ? 'musculação' : 'cardio';
      attended++;
    } else if (info.state === 'missed') { cls = 'miss'; label = 'falta'; missed++; }
    else if (info.state === 'rest') { cls = 'rest'; label = 'descanso'; }
    else if (info.state === 'future') { cls = 'future'; label = ''; }
    cells += `<span class="c ${cls}" title="${fmtDay(d)}: ${label}"></span>`;
  }

  const volWeek = addDays(thisWeek, volumeOffset * 7);
  const vol = weekVolume(volWeek);
  const volRows = Object.entries(vol).sort((a, b) => b[1].tonnage - a[1].tonnage || b[1].sets - a[1].sets);
  const exList = exercisesWithHistory();
  if (!selectedExercise || !exList.some((e) => e.id === selectedExercise)) selectedExercise = exList[0]?.id || '';
  const prs = recentPRs();
  const health = db.all('health_imports').sort((a, b) => b.date.localeCompare(a.date));

  view.innerHTML = `
    <h1>Analytics</h1>
    <div class="tiles">
      <div class="tile"><div class="v">${st.current}</div><div class="l">sequência atual · recorde ${st.record}</div></div>
      <div class="tile"><div class="v">${adh.pct === null ? '–' : `${Math.round(adh.pct * 100)}%`}</div><div class="l">aderência nesta semana (${adh.attended}/${adh.planned})</div></div>
      <div class="tile"><div class="v">${tot.workouts}</div><div class="l">treinos registrados</div></div>
      <div class="tile"><div class="v">${tot.avgDuration ?? '–'}${tot.avgDuration ? '<small> min</small>' : ''}</div><div class="l">tempo médio na academia</div></div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Frequência · ${HEAT_WEEKS} semanas</h3>
      <p class="muted small">${attended} dias treinados · ${missed} faltas</p>
      <div class="row gap" style="align-items:flex-start">
        <div class="tiny muted" style="display:grid;grid-template-rows:repeat(7,14px);gap:3px;line-height:14px">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((l) => `<span>${l}</span>`).join('')}</div>
        <div class="heatmap" role="img" aria-label="Mapa de frequência">${cells}</div>
      </div>
      <div class="legend"><span><i style="background:var(--heat-3)"></i>musculação</span><span><i style="background:var(--heat-2)"></i>cardio</span><span><i style="background:var(--heat-1)"></i>parcial</span><span><i style="background:var(--heat-miss)"></i>falta</span><span><i style="border:1px dashed var(--border)"></i>descanso</span></div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Aderência semanal</h3>
      <div class="chart-box"><canvas id="c-adh" aria-label="Aderência semanal em porcentagem"></canvas></div>
      <p class="tiny muted">Barras azuis: semana ≥ 80% (conta para o Intermediário: 8 semanas). Laranja: abaixo de 80%.</p>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="row between"><h3>Volume por grupo</h3>
        <div class="seg"><button data-vol="-1" aria-pressed="${volumeOffset === -1}">Anterior</button><button data-vol="0" aria-pressed="${volumeOffset === 0}">Atual</button></div>
      </div>
      <p class="muted small">Séries × repetições × carga. Referência: ~10 séries semanais por grupo grande.</p>
      ${volRows.length ? `<div class="chart-box ${volRows.length > 6 ? 'tall' : ''}"><canvas id="c-vol" aria-label="Volume por grupo muscular"></canvas></div>
      <table class="hist" style="margin-top:8px"><thead><tr><th>Grupo</th><th>Séries</th><th>Volume (kg)</th></tr></thead><tbody>
        ${volRows.map(([g, v]) => `<tr><td>${esc(g)}</td><td>${v.sets}</td><td>${fmtInt(v.tonnage)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nenhuma série registrada nesta semana.</p>'}
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Evolução por exercício</h3>
      ${exList.length ? `<select data-ex-select aria-label="Exercício">${exList.map((e) => `<option value="${e.id}" ${e.id === selectedExercise ? 'selected' : ''}>${esc(e.name_pt)}</option>`).join('')}</select>
      <div class="chart-box" style="margin-top:10px"><canvas id="c-ex" aria-label="Carga e 1RM estimado"></canvas></div>
      <p class="tiny muted"><a href="#/ex/${selectedExercise}">Abrir página do exercício ›</a></p>` : '<p class="muted">Registre séries para ver a evolução.</p>'}
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Cardio por semana</h3>
      <div class="chart-box"><canvas id="c-cardio" aria-label="Minutos de cardio por semana"></canvas></div>
      <p class="tiny muted">OMS: 150–300 min/semana de atividade moderada (somando o dia a dia).</p>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Recordes recentes</h3>
      ${prs.length ? `<ul class="list">${prs.map((l) => `<li class="row between" style="padding:8px 0"><span>🏆 <a href="#/ex/${l.exercise_id}">${esc(exercise(l.exercise_id)?.name_pt || l.exercise_id)}</a><br><span class="tiny muted">${fmtDay(l.session_id, { weekday: false })}</span></span><span class="small"><strong>${fmtKg(l.load_kg)} kg × ${l.reps}</strong><br><span class="tiny muted">1RM est. ${fmtKg(e1rm(l.load_kg, l.reps))}</span></span></li>`).join('')}</ul>` : '<p class="muted">Ainda sem recordes. Eles aparecem quando você supera um treino anterior.</p>'}
    </div>

    ${healthSection(health)}`;

  view.onclick = (e) => {
    const b = e.target.closest('[data-vol]');
    if (b) { volumeOffset = Number(b.dataset.vol); render(view); }
  };
  view.onchange = (e) => {
    if (e.target.matches('[data-ex-select]')) { selectedExercise = e.target.value; render(view); }
  };

  drawCharts(weeks, volRows, health);
}

function healthSection(health) {
  if (!health.length) {
    return `<div class="card" style="margin-top:12px"><h3>Relógio (Zepp → Apple Saúde)</h3><p class="muted small">Sem dados ainda. Configure o Atalho do iOS (README) para enviar FC, kcal, passos e sono para a planilha.</p></div>`;
  }
  const last7 = health.slice(0, 7);
  const avg = (k) => {
    const v = last7.map((h) => h[k]).filter((x) => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const rows = health.slice(0, 10).map((h) => {
    const s = db.get('sessions', h.date);
    const status = s?.status === 'done' ? `treino ${s.duration_min ? `${s.duration_min} min` : ''}` : s?.status === 'partial' ? 'parcial' : s?.status === 'missed' ? 'falta' : '—';
    return `<tr><td>${fmtDay(h.date, { weekday: false })}</td><td>${esc(status)}</td><td>${h.workout_avg_hr || h.avg_hr || '–'}</td><td>${h.resting_hr || '–'}</td><td>${h.active_kcal ? fmtInt(h.active_kcal) : '–'}</td></tr>`;
  }).join('');
  return `
    <div class="card" style="margin-top:12px">
      <h3>Relógio (Zepp → Apple Saúde)</h3>
      <div class="tiles" style="margin:8px 0 12px">
        <div class="tile"><div class="v">${avg('resting_hr') ? Math.round(avg('resting_hr')) : '–'}</div><div class="l">FC de repouso (média 7 dias)</div></div>
        <div class="tile"><div class="v">${avg('steps') ? fmtInt(avg('steps')) : '–'}</div><div class="l">passos/dia (7 dias)</div></div>
        <div class="tile"><div class="v">${avg('sleep_h') ? fmtKg(avg('sleep_h')) : '–'}<small> h</small></div><div class="l">sono médio (7 dias)</div></div>
        <div class="tile"><div class="v">${avg('active_kcal') ? fmtInt(avg('active_kcal')) : '–'}</div><div class="l">kcal ativas/dia (7 dias)</div></div>
      </div>
      <div class="chart-box"><canvas id="c-rhr" aria-label="FC de repouso"></canvas></div>
      <table class="hist" style="margin-top:8px"><thead><tr><th>Dia</th><th>Treino</th><th>FC treino</th><th>FC rep.</th><th>kcal</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

async function drawCharts(weeks, volRows, health) {
  const Chart = await loadChart();
  const c = chartColors();
  const label = (w) => fmtDay(w, { weekday: false });
  const make = (id, config) => {
    const el = document.getElementById(id);
    if (el) charts.push(new Chart(el, config));
  };
  const bar = { borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 28 };

  const adh = weeks.map((w) => weekAdherence(w));
  make('c-adh', {
    type: 'bar',
    data: { labels: weeks.map(label), datasets: [{ label: 'Aderência (%)', data: adh.map((a) => (a.pct === null ? null : Math.round(a.pct * 100))), backgroundColor: adh.map((a) => (a.pct >= 0.8 ? c.series[0] : c.series[1])), ...bar }] },
    options: c.options({ beginAtZero: true, y: { max: 100, ticks: { color: c.text, callback: (v) => `${v}%` } }, plugins: { legend: { display: false } } }),
  });

  if (volRows.length) {
    make('c-vol', {
      type: 'bar',
      data: { labels: volRows.map(([g]) => g), datasets: [{ label: 'Volume (kg)', data: volRows.map(([, v]) => Math.round(v.tonnage)), backgroundColor: c.series[0], borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: 'start', maxBarThickness: 22 }] },
      options: c.options({ beginAtZero: true, root: { indexAxis: 'y' }, x: { grid: { color: c.grid }, ticks: { color: c.text } }, y: { grid: { display: false }, ticks: { color: c.text } }, plugins: { legend: { display: false } } }),
    });
  }

  if (selectedExercise) {
    const hist = exerciseHistory(selectedExercise);
    make('c-ex', {
      type: 'line',
      data: {
        labels: hist.map((h) => label(h.date)),
        datasets: [
          { label: 'Carga (kg)', data: hist.map((h) => h.topLoad), borderColor: c.series[0], backgroundColor: c.series[0], borderWidth: 2, tension: 0.25, pointRadius: 4 },
          { label: '1RM est. (kg)', data: hist.map((h) => Math.round(h.bestE1rm * 10) / 10), borderColor: c.series[1], backgroundColor: c.series[1], borderWidth: 2, borderDash: [5, 4], tension: 0.25, pointRadius: 4 },
        ],
      },
      options: c.options(),
    });
  }

  make('c-cardio', {
    type: 'bar',
    data: { labels: weeks.map(label), datasets: [{ label: 'Cardio (min)', data: weeks.map((w) => weekCardioMinutes(w)), backgroundColor: c.series[2], ...bar }] },
    options: c.options({ beginAtZero: true, plugins: { legend: { display: false } } }),
  });

  const rhr = health.filter((h) => h.resting_hr > 0).slice(0, 30).reverse();
  if (rhr.length) {
    make('c-rhr', {
      type: 'line',
      data: { labels: rhr.map((h) => label(h.date)), datasets: [{ label: 'FC de repouso (bpm)', data: rhr.map((h) => h.resting_hr), borderColor: c.series[0], backgroundColor: c.series[0], borderWidth: 2, tension: 0.25, pointRadius: 3 }] },
      options: c.options({ plugins: { legend: { display: false } } }),
    });
  }
}
