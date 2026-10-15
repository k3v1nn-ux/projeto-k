// "Semana": Monday–Sunday calendar with the plan and the status of each day.
import * as db from '../db.js';
import { dayPlan, exercise } from '../program.js';
import { sheet } from '../ui.js';
import { dateKey, addDays, weekStart, parseKey, fmtShortWeekday, fmtDay, esc, fmtKg } from '../util.js';
import { cardioFor } from '../workout.js';

let offset = 0;

const ICON = { lift: '🏋️', cardio: '🚴', rest: '😴' };

export function dayStatus(date, plan, session, today = dateKey()) {
  if (plan.type === 'rest' && !session) return { label: 'descanso', cls: '' };
  if (session?.status === 'done') return { label: 'feito', cls: 'accent' };
  if (session?.status === 'partial') return { label: 'parcial', cls: 'warn' };
  if (session?.status === 'in_progress') return { label: date === today ? 'em andamento' : 'aberto', cls: 'info' };
  if (session?.status === 'missed') return { label: 'falta', cls: 'danger' };
  if (date === today) return { label: 'hoje', cls: 'info' };
  if (date < today) return { label: 'sem registro', cls: '' };
  return { label: 'planejado', cls: '' };
}

export function render(view) {
  const today = dateKey();
  const start = addDays(weekStart(today), offset * 7);
  const end = addDays(start, 6);
  let rows = '';
  let planned = 0;
  let attended = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const plan = dayPlan(d);
    const session = db.get('sessions', d);
    const st = dayStatus(d, plan, session, today);
    if (plan.type !== 'rest' && d <= today) {
      const counts = d < today || ['done', 'partial'].includes(session?.status);
      if (counts) planned++;
      if (['done', 'partial'].includes(session?.status)) attended++;
    }
    const sub = plan.type === 'lift' ? `${plan.exercises.length} exercícios` : plan.type === 'cardio' ? `${plan.cardio.minutes_min}–${plan.cardio.minutes_max} min zona 2` : 'recuperação';
    rows += `
      <button class="day-row list-item ${d === today ? 'today' : ''}" data-day="${d}">
        <span class="day-date"><small>${fmtShortWeekday(d)}</small><b>${parseKey(d).getDate()}</b></span>
        <span><strong>${ICON[plan.type]} ${esc(plan.session_name)}</strong><br><span class="muted small">${sub}</span></span>
        <span class="pill ${st.cls}">${st.label}</span>
      </button>`;
  }
  const pct = planned ? Math.round((attended / planned) * 100) : null;
  view.innerHTML = `
    <div class="week-nav">
      <button class="icon-btn" data-nav="-1" aria-label="Semana anterior">‹</button>
      <div class="center"><strong>${fmtDay(start, { weekday: false })} – ${fmtDay(end, { weekday: false })}</strong><br>
        <span class="muted small">${offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana passada' : offset === 1 ? 'Próxima semana' : ''}${pct !== null ? ` · aderência ${pct}%` : ''}</span></div>
      <button class="icon-btn" data-nav="1" aria-label="Próxima semana">›</button>
    </div>
    <div class="card day-card">${rows}</div>
    <p class="muted small" style="margin-top:12px">Toque num dia para ver o plano ou o que foi feito. Dias passados podem ser editados (esqueceu de registrar?).</p>`;

  view.onclick = (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      offset += Number(nav.dataset.nav);
      render(view);
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) openDay(day.dataset.day);
  };
}

function openDay(date) {
  const today = dateKey();
  if (date === today) {
    location.hash = '#/hoje';
    return;
  }
  const plan = dayPlan(date);
  const session = db.get('sessions', date);
  const logs = db.all('set_logs').filter((l) => l.session_id === date);
  const cardio = cardioFor(date);
  let body = '';
  if (plan.type === 'lift') {
    body = `<ul class="list">${plan.exercises.map((it) => {
      const ex = exercise(it.exercise_id);
      const done = logs.filter((l) => l.exercise_id === it.exercise_id);
      return `<li style="padding:8px 0"><strong>${esc(ex.name_pt)}</strong><br><span class="muted small">${it.sets} × ${it.rep_min}–${it.rep_max}${done.length ? ` · feito: ${done.map((l) => `${fmtKg(l.load_kg)}×${l.reps}`).join(', ')}` : ''}</span></li>`;
    }).join('')}</ul>`;
  } else if (plan.type === 'cardio') {
    body = `<p class="muted">${esc(plan.cardio.note)}</p>`;
  } else {
    body = '<p class="muted">Dia de descanso.</p>';
  }
  if (cardio.length) body += `<p class="small">Cardio: ${cardio.map((c) => `${esc(c.type)} ${c.duration_min} min`).join(', ')}</p>`;
  const st = dayStatus(date, plan, session, today);
  const s = sheet(`
    <div class="row between"><h3>${esc(plan.session_name)}</h3><span class="pill ${st.cls}">${st.label}</span></div>
    <p class="muted small" style="text-transform:capitalize">${fmtDay(date)}${session?.duration_min ? ` · ${session.duration_min} min` : ''}</p>
    ${body}
    <div class="row gap" style="margin-top:12px">
      <button class="btn ghost grow" data-close>Fechar</button>
      ${plan.type !== 'rest' || session ? `<a class="btn primary grow" href="#/dia/${date}" data-go>${date < today ? 'Editar / registrar' : 'Ver dia'}</a>` : ''}
    </div>`);
  s.el.querySelector('[data-go]')?.addEventListener('click', () => s.close());
}
