// Exercise page: animated media, cues, last result, today's suggestion, history chart, alternatives.
import { exercise, dayPlan } from '../program.js';
import { exerciseHistory, suggestion, summarize, TREND_LABEL } from '../progression.js';
import { progressionEvents } from '../stats.js';
import { loadChart, chartColors } from '../charts.js';
import { dateKey, fmtDay, fmtKg, esc, youtubeSearch } from '../util.js';

export function mediaHtml(ex) {
  if (ex.media_frames?.length) {
    return `<div class="media"><img src="${ex.media_frames[0]}" alt="${esc(ex.name_pt)} — posição inicial"><img class="f1" src="${ex.media_frames[1]}" alt="${esc(ex.name_pt)} — posição final"></div>`;
  }
  return `<div class="media-empty"><div>Sem imagem na base aberta.<br><a href="${youtubeSearch(ex.name_pt)}" target="_blank" rel="noopener">Ver no YouTube</a></div></div>`;
}

export function render(view, { id }) {
  const ex = exercise(id);
  if (!ex) {
    view.innerHTML = '<p>Exercício não encontrado.</p>';
    return;
  }
  const today = dateKey();
  const hist = exerciseHistory(id);
  const plan = dayPlan(today);
  const item = plan.exercises?.find((it) => it.exercise_id === id);
  const sugg = item ? suggestion(item, today, plan.session_name) : null;
  const last = hist.filter((h) => h.date < today).pop();
  const best = hist.reduce((b, h) => (h.bestE1rm > (b?.bestE1rm || 0) ? h : b), null);

  view.innerHTML = `
    <h1>${esc(ex.name_pt)}</h1>
    <div class="row gap wrap" style="margin-bottom:10px">
      <span class="pill">${esc(ex.muscle_group)}</span><span class="pill">${esc(ex.equipment)}</span>
      ${ex.is_squat_variant ? '<span class="pill warn">variação de agachamento</span>' : ''}
      ${ex.smartfit_label ? `<span class="pill ${ex.smartfit === 'varia' ? 'warn' : 'success'}">${esc(ex.smartfit_label)}</span>` : ''}
    </div>
    ${mediaHtml(ex)}
    ${ex.media_frames?.length ? `<p class="tiny muted" style="margin-top:4px">Imagens: free-exercise-db (domínio público) · <a href="${youtubeSearch(ex.name_pt)}" target="_blank" rel="noopener">ver no YouTube</a></p>` : ''}

    <div class="card" style="margin-top:12px">
      <h3>Execução</h3>
      <ol class="tips">${ex.instructions.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="muted small" style="margin-top:8px">Carga registrada: ${esc(ex.load_note)}. Progressão: +${fmtKg(ex.increment_kg)} kg quando fechar todas as séries no topo da faixa.</p>
    </div>

    <div class="tiles" style="margin-top:12px">
      <div class="tile"><div class="v sm">${last ? esc(summarize(last)) : '–'}</div><div class="l">último treino${last ? ` (${fmtDay(last.date, { weekday: false })})` : ''}</div></div>
      <div class="tile"><div class="v sm">${sugg ? `${fmtKg(sugg.load)} kg × ${sugg.reps[0]}` : '–'}</div><div class="l">${sugg ? `hoje · ${TREND_LABEL[sugg.trend]}` : 'não está no treino de hoje'}</div></div>
      <div class="tile"><div class="v">${best ? `${fmtKg(best.topLoad)} kg` : '–'}</div><div class="l">maior carga</div></div>
      <div class="tile"><div class="v">${best ? `${fmtKg(best.bestE1rm)} kg` : '–'}</div><div class="l">1RM estimado (Epley)</div></div>
    </div>

    <div class="card" style="margin-top:12px">
      <h3>Evolução</h3>
      ${hist.length ? '<div class="chart-box"><canvas id="ex-chart" aria-label="Gráfico de carga e 1RM estimado"></canvas></div>' : '<p class="muted">Sem registros ainda. Depois do primeiro treino aparece aqui.</p>'}
      ${hist.length ? `<table class="hist" style="margin-top:10px"><thead><tr><th>Data</th><th>Séries</th><th>1RM est.</th></tr></thead><tbody>
        ${hist.slice(-10).reverse().map((h) => `<tr><td>${fmtDay(h.date, { weekday: false })}</td><td>${esc(summarize(h))}</td><td>${fmtKg(h.bestE1rm)}</td></tr>`).join('')}
      </tbody></table>` : ''}
    </div>

    ${(() => {
      const ev = progressionEvents().filter((x) => x.ex.id === ex.id);
      if (!ev.length) return '';
      const txt = (x) => (x.type === 'sets' ? `${x.from} → ${x.to} séries` : x.type === 'load' ? `carga ${fmtKg(x.from)} → ${fmtKg(x.to)} kg` : `${x.from} → ${x.to} repetições`);
      return `<div class="card" style="margin-top:12px"><h3>Quando você evoluiu</h3><ul class="list">${ev.slice(0, 12).map((x) => `<li class="row between" style="padding:8px 0"><span class="small">${txt(x)}</span><span class="tiny muted">${fmtDay(x.date, { weekday: false })}</span></li>`).join('')}</ul></div>`;
    })()}
    <div class="card" style="margin-top:12px">
      <h3>Alternativas</h3>
      <ul class="list">${ex.alternatives.map((a) => {
        const alt = exercise(a);
        return `<li><a class="list-item" href="#/ex/${alt.id}"><span class="grow">${esc(alt.name_pt)}<br><span class="muted small">${esc(alt.equipment)}</span></span>›</a></li>`;
      }).join('')}</ul>
    </div>`;

  if (hist.length) drawChart(hist);
}

async function drawChart(hist) {
  const Chart = await loadChart();
  const canvas = document.getElementById('ex-chart');
  if (!canvas) return;
  const c = chartColors();
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: hist.map((h) => fmtDay(h.date, { weekday: false })),
      datasets: [
        { label: 'Carga (kg)', data: hist.map((h) => h.topLoad), borderColor: c.series[0], backgroundColor: c.series[0], tension: 0.25, pointRadius: 3 },
        { label: '1RM est. (kg)', data: hist.map((h) => Math.round(h.bestE1rm * 10) / 10), borderColor: c.series[1], backgroundColor: c.series[1], borderDash: [5, 4], tension: 0.25, pointRadius: 2 },
      ],
    },
    options: c.options(),
  });
}
