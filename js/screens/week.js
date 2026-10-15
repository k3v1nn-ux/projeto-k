// "Semana": Monday–Sunday with what was done and the projected rotation. Tap a day to see it,
// mark it as rest, or open it to log/edit.
import * as db from '../db.js';
import { dayPlan, exercise, weekProjection, slotDef, weeklyTarget, estimateMinutes } from '../program.js';
import { markRest, unmarkRest, cardioFor, setsFor, ratingEmoji } from '../workout.js';
import { settings, updateSettings, gymCloseFor } from '../settings.js';
import { sheet, toast } from '../ui.js';
import { setsLabel, dateKey, addDays, weekStart, parseKey, fmtShortWeekday, fmtDay, esc, fmtKg, fmtVolume } from '../util.js';

let offset = 0;
const WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function dayNumbers(d) {
  const sets = db.index('set_logs', 'session_id').get(d) || [];
  return {
    sets: sets.length,
    volume: sets.reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0),
    prs: sets.filter((l) => l.is_pr).length,
    exercises: new Set(sets.map((l) => l.exercise_id)).size,
    cardio: cardioFor(d).reduce((a, c) => a + (c.duration_min || 0), 0),
  };
}

function describe(d, p, today) {
  const s = db.get('sessions', d);
  const n = dayNumbers(d);
  const close = gymCloseFor(d) ? `Smart Fit fecha ${gymCloseFor(d).replace(':00', 'h')}` : '';
  const doneSub = [`${n.exercises} exercícios · ${n.sets} séries`, n.volume ? fmtVolume(n.volume) : '', s?.duration_min ? `${s.duration_min} min` : '', n.cardio ? `♥ ${n.cardio} min` : '', n.prs ? `🏆 ${n.prs}` : '', s?.rating ? ratingEmoji(s.rating) : ''].filter(Boolean).join(' · ');
  const planName = p.slot === 'friend' ? (db.get('overrides', d)?.session_name || 'Treino do amigo') : slotDef(p.slot)?.session_name;
  const planSub = () => {
    const plan = dayPlan(d, p.slot === 'friend' ? undefined : p.slot);
    return [p.slot === 'friend' ? 'treino recebido' : slotDef(p.slot)?.focus, `${plan.exercises.length} exercícios · ~${estimateMinutes(plan)} min`].filter(Boolean).join(' · ');
  };
  switch (p.kind) {
    case 'done': return { title: s?.planned_session || 'Treino', sub: doneSub, pill: s?.status === 'partial' ? ['parcial', 'warn'] : ['feito', 'success'], icon: '🏋️', close };
    case 'today': return { title: planName, sub: s?.status === 'in_progress' ? `em andamento · ${doneSub}` : planSub(), pill: ['hoje', 'info'], icon: '🏋️', close };
    case 'planned': return { title: planName, sub: planSub(), pill: ['previsto', ''], icon: '🗓️', close };
    case 'rest': return { title: 'Descanso', sub: 'escolhido por você', pill: ['descanso', ''], icon: '😴', close };
    case 'cardio': return { title: 'Só cardio', sub: `${n.cardio} min`, pill: ['cardio', 'info'], icon: '🚴', close };
    default: return { title: d < today ? 'Nada registrado' : 'Livre', sub: d < today ? '' : 'sem treino previsto', pill: null, icon: '○', close };
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
        <span class="grow"><strong>${info.icon} ${esc(info.title || '')}</strong><br><span class="li-sub">${esc(info.sub || '')}</span>${info.close && d >= today ? `<br><span class="li-sub" style="color:var(--warn)">🕒 ${info.close}</span>` : ''}</span>
        ${info.pill ? `<span class="pill ${info.pill[1]}">${info.pill[0]}</span>` : '<span></span>'}
      </button>`;
  }
  const rest = settings().restDays || [];
  // Week totals and muscle groups trained
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const nums = days.map(dayNumbers);
  const sum = (k) => nums.reduce((a, x) => a + x[k], 0);
  const minutes = days.reduce((a, d) => a + (db.get('sessions', d)?.duration_min || 0) * ((db.index('set_logs', 'session_id').get(d) || []).length ? 1 : 0), 0);
  const groups = {};
  for (const d of days) for (const l of db.index('set_logs', 'session_id').get(d) || []) {
    const g = exercise(l.exercise_id)?.muscle_group || 'outros';
    groups[g] = (groups[g] || 0) + 1;
  }
  const groupChips = Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<span class="pill ${n >= 6 ? 'success' : ''}">${esc(g)} ${n}</span>`).join('');
  const planned = Object.values(proj).filter((x) => x.kind === 'planned' || x.kind === 'today').length;
  view.innerHTML = `
    <div class="page-head"><h1>Semana</h1><p>Meta: ${weeklyTarget()} treinos. Você escolhe os dias; o rodízio se ajusta sozinho.</p></div>
    <div class="week-nav">
      <button class="icon-btn" data-nav="-1" aria-label="Semana anterior">‹</button>
      <div class="center"><strong>${fmtDay(start, { weekday: false })} – ${fmtDay(end, { weekday: false })}</strong><br>
        <span class="muted small">${offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana passada' : offset === 1 ? 'Próxima semana' : ''} · ${done}/${weeklyTarget()} treinos</span></div>
      <button class="icon-btn" data-nav="1" aria-label="Próxima semana">›</button>
    </div>
    <div class="card">
      <div class="row between"><strong>${done}/${weeklyTarget()} treinos</strong><span class="muted small">${planned ? `${planned} previsto${planned > 1 ? 's' : ''}` : done >= weeklyTarget() ? 'meta batida ✓' : ''}</span></div>
      <div class="meter"><i style="width:${Math.min(100, (done / weeklyTarget()) * 100)}%"></i></div>
      <div class="kv">
        <div><b>${sum('sets')}</b><span>séries</span></div>
        <div><b>${fmtVolume(sum('volume'))}</b><span>volume</span></div>
        <div><b>${minutes}</b><span>min treino</span></div>
        <div><b>${sum('cardio')}</b><span>min cardio</span></div>
      </div>
      ${groupChips ? `<div class="section-title" style="margin:14px 0 6px">Séries por grupo</div><div class="chips">${groupChips}</div>` : ''}
      ${sum('prs') ? `<p class="small" style="margin:10px 0 0">🏆 ${sum('prs')} recorde${sum('prs') > 1 ? 's' : ''} nesta semana</p>` : ''}
    </div>
    <div class="group mt">${rows}</div>
    <p class="tiny muted" style="margin:8px 16px 0">🕒 Smart Fit: sábado fecha 19h, domingo fecha 15h.</p>
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
    body = `<ul class="list">${plan.exercises.map((it) => `<li style="padding:8px 0"><strong>${esc(exercise(it.exercise_id).name_pt)}</strong><br><span class="li-sub">${setsLabel(it)}</span></li>`).join('')}</ul>`;
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
