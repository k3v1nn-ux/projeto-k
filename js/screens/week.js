// "Semana": Monday–Sunday with what was done and the projected rotation. Tap a day to see it,
// mark it as rest, or open it to log/edit.
import * as db from '../db.js';
import { dayPlan, exercise, weekProjection, slotDef, weeklyTarget } from '../program.js';
import { markRest, unmarkRest, cardioFor, setsFor } from '../workout.js';
import { settings, updateSettings } from '../settings.js';
import { sheet, toast } from '../ui.js';
import { dateKey, addDays, weekStart, parseKey, fmtShortWeekday, fmtDay, esc, fmtKg } from '../util.js';

let offset = 0;
const WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function describe(d, p, today) {
  const s = db.get('sessions', d);
  switch (p.kind) {
    case 'done': return { title: s?.planned_session || 'Treino', sub: `${(db.index('set_logs', 'session_id').get(d) || []).length} séries${s?.duration_min ? ` · ${s.duration_min} min` : ''}`, pill: s?.status === 'partial' ? ['parcial', 'warn'] : ['feito', 'success'], icon: '🏋️' };
    case 'today': return { title: p.slot === 'friend' ? (db.get('overrides', d)?.session_name || 'Treino do amigo') : slotDef(p.slot)?.session_name, sub: s?.status === 'in_progress' ? 'em andamento' : 'treino de hoje', pill: ['hoje', 'info'], icon: '🏋️' };
    case 'planned': return { title: p.slot === 'friend' ? (db.get('overrides', d)?.session_name || 'Treino do amigo') : slotDef(p.slot)?.session_name, sub: p.slot === 'friend' ? 'treino recebido' : slotDef(p.slot)?.focus, pill: ['previsto', ''], icon: '🗓️' };
    case 'rest': return { title: 'Descanso', sub: 'escolhido por você', pill: ['descanso', ''], icon: '😴' };
    case 'cardio': return { title: 'Só cardio', sub: `${cardioFor(d).reduce((a, c) => a + (c.duration_min || 0), 0)} min`, pill: ['cardio', 'info'], icon: '🚴' };
    default: return { title: d < today ? 'Nada registrado' : 'Livre', sub: d < today ? '' : 'sem treino previsto', pill: null, icon: '○' };
  }
}

export function render(view) {
  const today = dateKey();
  const start = addDays(weekStart(today), offset * 7);
  const end = addDays(start, 6);
  const proj = weekProjection(start);
  const done = Object.values(proj).filter((p) => p.kind === 'done').length;
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const p = proj[d] || { kind: 'free' };
    const info = describe(d, p, today);
    rows += `
      <button class="day-row list-item ${d === today ? 'today' : ''}" data-day="${d}">
        <span class="day-date"><small>${fmtShortWeekday(d)}</small><b>${parseKey(d).getDate()}</b></span>
        <span class="grow"><strong>${info.icon} ${esc(info.title || '')}</strong><br><span class="li-sub">${esc(info.sub || '')}</span></span>
        ${info.pill ? `<span class="pill ${info.pill[1]}">${info.pill[0]}</span>` : '<span></span>'}
      </button>`;
  }
  const rest = settings().restDays || [];
  view.innerHTML = `
    <div class="page-head"><h1>Semana</h1><p>Meta: ${weeklyTarget()} treinos. Você escolhe os dias; o rodízio se ajusta sozinho.</p></div>
    <div class="week-nav">
      <button class="icon-btn" data-nav="-1" aria-label="Semana anterior">‹</button>
      <div class="center"><strong>${fmtDay(start, { weekday: false })} – ${fmtDay(end, { weekday: false })}</strong><br>
        <span class="muted small">${offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana passada' : offset === 1 ? 'Próxima semana' : ''} · ${done}/${weeklyTarget()} treinos</span></div>
      <button class="icon-btn" data-nav="1" aria-label="Próxima semana">›</button>
    </div>
    <div class="group">${rows}</div>
    <div class="section"><div class="section-title"><span>Dias de descanso preferidos</span></div>
      <div class="card flat">
        <p class="muted small" style="margin-top:0">O app evita prever treino nesses dias (mas, se faltar treino para a meta, usa-os). Para descansar em outro dia, toque no dia acima.</p>
        <div class="chips">${WD.map((w, i) => `<button class="chip" data-restday="${i + 1}" aria-pressed="${rest.includes(i + 1)}">${w}</button>`).join('')}</div>
      </div>
    </div>`;

  view.onclick = (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { offset += Number(nav.dataset.nav); render(view); return; }
    const rd = e.target.closest('[data-restday]');
    if (rd) {
      const n = Number(rd.dataset.restday);
      const set = new Set(settings().restDays || []);
      if (set.has(n)) set.delete(n); else set.add(n);
      updateSettings({ restDays: Array.from(set).sort() });
      render(view);
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) openDay(day.dataset.day, proj[day.dataset.day] || { kind: 'free' }, () => render(view));
  };
}

function openDay(date, p, rerender) {
  const today = dateKey();
  const info = describe(date, p, today);
  const session = db.get('sessions', date);
  let body = '';
  if (p.kind === 'done' || (p.kind === 'today' && session)) {
    const plan = dayPlan(date);
    body = `<ul class="list">${plan.exercises.map((it) => {
      const done = setsFor(date, it.exercise_id);
      return `<li style="padding:8px 0"><strong>${esc(exercise(it.exercise_id).name_pt)}</strong><br><span class="li-sub">${done.length ? done.map((l) => `${fmtKg(l.load_kg)}×${l.reps}`).join(', ') : 'não feito'}</span></li>`;
    }).join('')}</ul>`;
  } else if (p.kind === 'planned' || p.kind === 'today') {
    const plan = dayPlan(date);
    body = `<ul class="list">${plan.exercises.map((it) => `<li style="padding:8px 0"><strong>${esc(exercise(it.exercise_id).name_pt)}</strong><br><span class="li-sub">${it.sets} × ${it.rep_min}–${it.rep_max}</span></li>`).join('')}</ul>`;
  }
  const canRest = p.kind !== 'done' && p.kind !== 'rest' && !(db.index('set_logs', 'session_id').get(date) || []).length;
  const s = sheet(`
    <div class="row between"><h3>${info.icon} ${esc(info.title || '')}</h3>${info.pill ? `<span class="pill ${info.pill[1]}">${info.pill[0]}</span>` : ''}</div>
    <p class="muted small" style="text-transform:capitalize">${fmtDay(date)}</p>
    ${body}
    <div class="stack mt">
      ${date <= today || p.kind === 'planned' ? `<a class="btn primary block" href="#/${date === today ? 'hoje' : `dia/${date}`}" data-go>${date < today ? 'Abrir / registrar' : date === today ? 'Ir para hoje' : 'Ver treino'}</a>` : ''}
      ${canRest ? '<button class="btn block" data-rest>Marcar descanso neste dia</button>' : ''}
      ${p.kind === 'rest' ? '<button class="btn block" data-unrest>Tirar descanso</button>' : ''}
      <button class="btn ghost block" data-close>Fechar</button>
    </div>`);
  s.el.querySelector('[data-go]')?.addEventListener('click', () => s.close());
  s.el.querySelector('[data-rest]')?.addEventListener('click', async () => {
    await markRest(date);
    toast('Descanso marcado. Os próximos treinos foram reorganizados.');
    s.close();
    rerender();
  });
  s.el.querySelector('[data-unrest]')?.addEventListener('click', async () => {
    await unmarkRest(date);
    s.close();
    rerender();
  });
}
