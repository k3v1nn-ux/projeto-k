// "Hoje": hero with progress, week strip, warm-up cardio (step 1), exercises as an accordion
// with 1-tap set logging (step 2), rest timer, swaps, choosing another workout, resting,
// cardio-only days and finishing.
import * as db from '../db.js';
import {
  dayPlan, exercise, getProgram, usableAlternatives, weekProjection, slotQueue, lastDoneBySlot, rotation,
  setChoice, estimateMinutes, slotDef, setDaySetCount,
} from '../program.js';
import { suggestion, TREND_LABEL, e1rm } from '../progression.js';
import { settings, updateSettings, gymCloseFor, applyRestore } from '../settings.js';
import { sync } from '../sync.js';
import { startRest, stopRest, unlockAudio, requestWakeLock, releaseWakeLock } from '../timer.js';
import { toast, sheet, confirmSheet } from '../ui.js';
import {
  ensureSession, finishSession, logSet, updateSet, deleteSet, setsFor, setSwap, logCardio, cardioFor,
  reopenSession, loggedSetCount, plannedSetCount, markRest, unmarkRest, chooseWorkout, RATINGS, rateSession, ratingEmoji,
} from '../workout.js';
import { notify, clearNotifications } from '../notify.js';
import { unpackJson, setsLabel, dateKey, fmtDay, fmtKg, esc, $, fmtInt, addDays, weekStart, parseKey, fmtShortWeekday, daysBetween, fmtDuration } from '../util.js';
import { afterDataChange } from '../achievements.js';
import { pendingSuggestions } from '../friend.js';
import { mountSpotify } from '../spotify.js';

const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
const open = { date: '', idx: -1 };
let clockTimer = null;

export function render(view, params = {}) {
  clearInterval(clockTimer);
  const today = dateKey();
  const date = params.date || today;
  const session = db.get('sessions', date);
  const future = date > today;
  const past = date < today;
  const proj = weekProjection(date)[date] || {};
  let choice = '';
  try { choice = localStorage.getItem(`pk.choice.${date}`) || ''; } catch { /* ignore */ }

  let html = topBanners(date, today);

  if (session?.status === 'rest') {
    html += restView(date, future);
  } else if (!session && !choice && !db.get('overrides', date) && (past || proj.kind === 'today-free' || proj.kind === 'free')) {
    html += freeDayView(date, past, future);
  } else {
    html += liftView(date, session, future);
  }
  view.innerHTML = html;
  document.body.classList.toggle('has-sticky', Boolean(view.querySelector('.sticky-actions')));
  bind(view, date);
  const slot = $('#spotify-slot', view);
  if (slot) mountSpotify(slot, { compact: true });
  if (session?.status === 'in_progress' && date === today) {
    const el = $('#hero-clock', view);
    const tick = () => { if (el && document.contains(el)) el.textContent = fmtDuration(Date.now() - new Date(session.start_time)); else clearInterval(clockTimer); };
    tick();
    clockTimer = setInterval(tick, 1000);
  }
}

function topBanners(date, today) {
  let html = '';
  if (!settings().apiUrl && !db.all('sessions').length) {
    html += `<div class="card" style="margin-bottom:12px">
      <h3 style="margin-top:0">Já usava o Antares?</h3>
      <p class="muted small">Toque no campo abaixo e escolha seu acesso salvo (Face ID). Tudo volta: planilha, Spotify, ajustes e treinos.</p>
      <form data-form="restore-keychain" autocomplete="on">
        <input type="text" name="username" autocomplete="username" placeholder="Acesso" style="margin-bottom:8px">
        <input type="password" name="password" autocomplete="current-password" placeholder="Toque para usar o Face ID">
        <button class="btn primary block mt" type="submit">Restaurar</button>
      </form>
      <a class="link-btn small" href="#/config">É a primeira vez? Configurar a planilha</a>
    </div>`;
  }
  if (date !== today) {
    html += `<div class="banner warn"><span class="grow">${date < today ? `Editando ${fmtDay(date)}` : `Prévia de ${fmtDay(date)}`}</span><a class="btn small" href="#/hoje">Hoje</a></div>`;
  }
  const close = date === today ? gymCloseFor(today) : '';
  if (close) {
    const [h, m] = close.split(':').map(Number);
    const left = (h * 60 + m) - (new Date().getHours() * 60 + new Date().getMinutes());
    const s = db.get('sessions', today);
    const trained = s && ['done', 'partial'].includes(s.status);
    if (!trained) {
      const need = estimateMinutes(dayPlan(today));
      const label = close.replace(':00', 'h');
      if (left <= 0) html += `<div class="banner warn"><span>🕒</span><span class="grow">A Smart Fit já fechou hoje (fecha às ${label}).</span></div>`;
      else html += `<div class="banner ${left < need + 20 ? 'warn' : ''}"><span>🕒</span><span class="grow">Hoje a Smart Fit fecha às <strong>${label}</strong> · faltam ${Math.floor(left / 60)}h${String(left % 60).padStart(2, '0')}${left < need + 20 ? ` (o treino leva ~${need} min)` : ''}.</span></div>`;
    }
  }
  const pending = pendingSuggestions();
  if (pending.length) {
    html += `<a class="banner" href="#/recebidos" style="text-decoration:none"><span>📨</span><span class="grow"><strong>Novo treino de ${esc(pending[0].author)}</strong>${pending.length > 1 ? ` e mais ${pending.length - 1}` : ''}</span><span class="btn small">Ver</span></a>`;
  }
  return html;
}

/* ---------- views ---------- */

export function weekStrip(date) {
  const today = dateKey();
  const start = weekStart(date);
  const proj = weekProjection(date);
  const done = Object.values(proj).filter((p) => p.kind === 'done' || (p.kind === 'today' && loggedSetCount(today))).length;
  const target = settings().weeklyTarget || 4;
  let cells = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const p = proj[d] || {};
    const cls = { done: 'done', planned: 'planned', today: loggedSetCount(d) ? 'done' : 'planned', rest: 'rest', cardio: 'cardio' }[p.kind] || 'free';
    const label = p.kind === 'done' ? '✓' : p.kind === 'rest' ? '–' : p.kind === 'cardio' ? '♥' : (p.slot && p.slot !== 'friend') ? slotDef(p.slot)?.session_name.replace(/^(\w)\w+\s(\w).*/, '$1$2') : p.slot === 'friend' ? '★' : parseKey(d).getDate();
    cells += `<a class="wd ${cls} ${d === today ? 'today' : ''}" href="#/${d === today ? 'hoje' : `dia/${d}`}"><span>${fmtShortWeekday(d)}</span><span class="dot">${label}</span></a>`;
  }
  return `<div class="card flat mt" style="padding:0">
      <div class="row between" style="padding:12px 14px 0"><strong class="small">Semana · ${done}/${target} treinos</strong><a class="small" href="#/semana">ver semana ›</a></div>
      <div class="week-strip">${cells}</div>
    </div>`;
}

function restView(date, future) {
  const next = slotDef(slotQueue(lastDoneBySlot(addDays(date, 1)))[0]);
  return `
    <div class="hero">
      <div class="eyebrow">${future ? 'Descanso planejado' : 'Dia de descanso'}</div>
      <h1>Recuperação</h1>
      <div class="sub">Você escolheu descansar ${future ? 'neste dia' : 'hoje'}. O treino não se perde: o próximo é <b style="color:#fff">${esc(next?.session_name || '')}</b>.</div>
      <div class="hero-actions"><button class="btn glass big" data-action="unrest">Quero treinar neste dia</button></div>
    </div>
    ${weekStrip(date)}
    ${future ? '' : cardioCard(date, { title: 'Fez alguma atividade? Registre cardio', phase: 'only', minutes: 30, open: false })}`;
}

function freeDayView(date, past, future) {
  const queue = slotQueue(lastDoneBySlot(date));
  const next = slotDef(queue[0]);
  const proj = weekProjection(date);
  const week = Object.values(proj).filter((p) => p.kind === 'done').length;
  const target = settings().weeklyTarget || 4;
  const title = past ? 'Nada registrado' : week >= target ? 'Meta da semana batida' : 'Dia livre';
  const sub = past
    ? 'Esqueceu de registrar? Escolha o treino feito neste dia, registre um cardio ou marque como descanso.'
    : week >= target ? `Você já fez ${week} de ${target} treinos. Hoje é para recuperar.` : `Hoje é um dos seus dias de descanso preferidos. Próximo treino: ${esc(next?.session_name || '')}.`;
  return `
    <div class="hero">
      <div class="eyebrow">${fmtDay(date)}</div>
      <h1>${title}</h1>
      <div class="sub">${sub}</div>
      <div class="hero-actions">
        ${future ? '' : `<button class="btn lime big" data-action="train-anyway" data-slot="${queue[0]}">${past ? 'Registrar treino' : `Treinar ${esc(next?.session_name || '')}`}</button>`}
      </div>
      <div class="hero-links">
        <button class="btn glass small" data-action="pick-workout">Escolher outro treino</button>
        <button class="btn glass small" data-action="rest">Marcar descanso</button>
      </div>
    </div>
    ${weekStrip(date)}
    ${future ? '' : cardioCard(date, { title: 'Só cardio hoje', phase: 'only', minutes: 30, open: false })}`;
}

function liftView(date, session, future) {
  const plan = dayPlan(date);
  const today = dateKey();
  const active = session?.status === 'in_progress';
  const finished = session && ['done', 'partial'].includes(session.status);
  const cardioOnly = session?.status === 'cardio';
  const logged = loggedSetCount(date);
  const planned = plannedSetCount(plan);
  const pct = planned ? Math.min(1, logged / planned) : 0;
  const C = 2 * Math.PI * 32;
  const pre = cardioFor(date).filter((c) => c.phase !== 'only');
  const rir = plan.reentry ? getProgram().rules.reentry_week.rir : plan.level === 'intermediate' ? '0–2' : '1–3';

  let actions = '';
  if (future) {
    actions = '<div class="hero-links"><button class="btn glass small" data-action="rest">Marcar descanso neste dia</button></div>';
  } else if (active) {
    actions = `<div class="hero-actions"><button class="btn lime big" data-action="finish">Finalizar treino</button></div>`;
  } else if (finished) {
    actions = `<div class="hero-actions"><button class="btn glass big" data-action="health">Importar do Saúde</button><button class="btn glass big" data-action="reopen">Reabrir</button></div>${session.rating ? '' : '<div class="hero-links"><button class="btn glass small" data-action="rate">Avaliar treino</button></div>'}`;
  } else {
    actions = `<div class="hero-actions"><button class="btn lime big" data-action="start">${cardioOnly ? 'Treinar mesmo assim' : 'Iniciar treino'}</button></div>`;
  }
  const canChange = !future && !logged && !finished;
  const links = canChange ? `<div class="hero-links">
      <button class="btn glass small" data-action="pick-workout">Trocar treino</button>
      <button class="btn glass small" data-action="rest">Descansar ${date === today ? 'hoje' : 'neste dia'}</button>
      ${cardioOnly ? '' : '<button class="btn glass small" data-action="cardio-only">Só cardio</button>'}
    </div>` : '';

  let html = `
    <div class="hero">
      <div class="hero-top">
        <div class="grow">
          <div class="eyebrow">${future ? 'Previsto' : finished ? 'Concluído' : active ? 'Em andamento' : 'Treino de hoje'} · ${plan.level === 'intermediate' ? 'Avançado 4×12' : 'Base 3×12'}</div>
          <h1>${esc(plan.session_name)}</h1>
          <div class="sub">${esc(plan.focus || '')}</div>
        </div>
        <div class="ring" aria-label="${logged} de ${planned} séries">
          <svg viewBox="0 0 76 76"><circle class="bg" cx="38" cy="38" r="32"/><circle class="fg" cx="38" cy="38" r="32" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
          <div class="label"><div>${logged}/${planned}<small>séries</small></div></div>
        </div>
      </div>
      <div class="meta">
        ${active && date === today ? '<div><b id="hero-clock">0:00</b>no treino</div>' : `<div><b>~${estimateMinutes(plan)} min</b>duração</div>`}
        <div><b>${plan.exercises.length}</b>exercícios</div>
        <div><b>${rir}</b>reps na reserva</div>
        ${finished && session.duration_min ? `<div><b>${session.duration_min} min</b>feito</div>` : ''}
        ${finished && session.rating ? `<div><b>${ratingEmoji(session.rating)}</b>avaliação</div>` : ''}
      </div>
      <div class="row gap wrap" style="margin-top:10px">
        ${plan.reentry ? '<span class="pill lime">Semana de reentrada</span>' : ''}
        ${plan.source === 'friend' ? `<span class="pill">Treino de ${esc(plan.author || 'amigo')}</span>` : ''}
        ${session?.status === 'partial' ? '<span class="pill">Parcial</span>' : ''}
      </div>
      ${actions}${links}
    </div>`;

  if (cardioOnly) {
    html += `<div class="banner mt"><span>🚴</span><span class="grow"><strong>Hoje foi só cardio.</strong> Os exercícios ficam como não feitos e o ${esc(plan.session_name)} continua sendo o próximo treino.</span></div>`;
  }
  html += weekStrip(date);
  if (!future) html += '<div id="spotify-slot" class="mt"></div>';

  if (!future && !cardioOnly) {
    html += `<div class="section"><div class="section-title"><span>1 · Cardio de aquecimento</span></div>${cardioCard(date, { phase: 'pre', minutes: settings().cardioMinutes || getProgram().rules.cardio_pre?.minutes || 10, open: !pre.length && !logged })}</div>`;
  }

  const firstOpen = plan.exercises.findIndex((it) => setsFor(date, it.exercise_id).length < it.sets);
  if (open.date !== date) { open.date = date; open.idx = active ? firstOpen : -1; }
  html += `<div class="section"><div class="section-title"><span>${future || cardioOnly ? 'Exercícios' : '2 · Exercícios'}</span><span>${planned} séries</span></div><div class="ex-list">`;
  html += plan.exercises.map((it, i) => exerciseCard(date, plan, it, i, { readonly: future, skipped: cardioOnly, isOpen: open.idx === i })).join('');
  html += '</div></div>';

  if (active) {
    html += `<div class="sticky-actions"><button class="btn primary big block" data-action="finish">Finalizar · ${logged}/${planned} séries</button></div>`;
  }
  return html;
}

function cardioCard(date, { title, phase, minutes, open: isOpen }) {
  const logs = cardioFor(date).filter((c) => (phase === 'pre' ? c.phase !== 'only' : true));
  const types = getProgram().cardio_types;
  const pref = types.some((t) => t.id === settings().cardioType) ? settings().cardioType : types[0].id;
  const total = logs.reduce((a, c) => a + (c.duration_min || 0), 0);
  const list = logs.map((c) => `<li class="row between" style="padding:8px 0"><span>✓ ${esc(types.find((t) => t.id === c.type)?.name_pt || c.type)} · <strong>${c.duration_min} min</strong>${c.avg_hr ? ` · FC ${c.avg_hr}` : ''}</span><button class="link-btn" data-action="del-cardio" data-id="${c.id}">apagar</button></li>`).join('');
  const done = logs.length > 0;
  return `
    <details class="card" ${isOpen ? 'open' : ''}>
      <summary><span class="step ${done ? 'done' : ''}" style="align-items:center"><span class="step-n">${done ? '✓' : '♥'}</span><span>${esc(title || (done ? `Cardio feito · ${total} min` : `Cardio leve · ${minutes} min`))}</span></span></summary>
      ${phase === 'pre' && !done ? `<p class="muted small" style="margin-top:8px">${esc(getProgram().rules.cardio_pre?.note || '')}</p>` : ''}
      ${list ? `<ul class="list" style="margin-top:6px">${list}</ul>` : ''}
      <form data-form="cardio" data-phase="${phase}" style="margin-top:10px">
        <div class="chips" role="group" aria-label="Tipo de cardio">${types.map((t) => `<button type="button" class="chip" data-cardio-type="${t.id}" aria-pressed="${t.id === pref}">${esc(t.name_pt.split(' (')[0])}</button>`).join('')}</div>
        <div class="grid2" style="margin-top:10px">
          <label class="field"><span>Minutos</span><input type="number" inputmode="numeric" name="duration" value="${minutes}" min="1"></label>
          <label class="field"><span>FC média (opcional)</span><input type="number" inputmode="numeric" name="hr" placeholder="bpm"></label>
        </div>
        <button class="btn ${phase === 'pre' ? 'primary' : ''} block" type="submit">${phase === 'pre' ? 'Registrar aquecimento' : 'Registrar só cardio'}</button>
      </form>
    </details>`;
}

function thumb(ex) {
  if (ex.media_frames?.length) return `<img class="ex-thumb" src="${ex.media_frames[0]}" alt="" loading="lazy">`;
  return '<div class="ex-thumb placeholder">sem<br>imagem</div>';
}

function exerciseCard(date, plan, it, i, { readonly, skipped, isOpen }) {
  const ex = exercise(it.exercise_id);
  const logs = setsFor(date, it.exercise_id);
  const sugg = suggestion(it, date, plan.session_name);
  const complete = logs.length >= it.sets;
  const step = 1; // load buttons always move 1 kg
  const rows = Math.max(it.sets, logs.length);
  const lastLoad = logs.length ? logs[logs.length - 1].load_kg : sugg.load;
  const swapped = it.exercise_id !== it.planned_id;
  let setsHtml = '';
  for (let n = 1; n <= rows; n++) {
    const log = logs[n - 1];
    const load = log ? log.load_kg : lastLoad;
    const reps = log ? log.reps : (sugg.reps[n - 1] ?? it.rep_min);
    const isNext = !log && n === logs.length + 1;
    setsHtml += `
      <div class="set-swipe"><span class="set-del" aria-hidden="true">Apagar</span>
      <div class="set-row ${log ? 'logged' : ''} ${isNext ? 'next' : ''}" data-n="${n}" ${log ? `data-log="${log.id}"` : ''}>
        <span class="set-n">${n}</span>
        <div class="stepper"><button data-step="-${step}" aria-label="Menos carga">−</button><input type="number" inputmode="decimal" step="any" name="load" value="${load ?? 0}" aria-label="Carga em kg"><button data-step="${step}" aria-label="Mais carga">+</button></div>
        <div class="stepper"><button data-step="-1" aria-label="Menos repetições">−</button><input type="number" inputmode="numeric" name="reps" value="${reps}" aria-label="Repetições"><button data-step="1" aria-label="Mais repetições">+</button></div>
        <button class="set-ok" data-action="${log ? 'set-menu' : 'log'}" aria-label="${log ? 'Opções da série' : 'Registrar série'}">${log ? (log.is_pr ? '🏆' : CHECK) : CHECK}</button>
      </div></div>`;
  }
  const status = skipped ? '<span class="pill">não feito</span>'
    : `<div class="small num"><strong>${logs.length}/${it.sets}</strong></div><div class="ex-progress"><i style="width:${Math.min(100, (logs.length / it.sets) * 100)}%"></i></div>`;
  return `
    <div class="card ex-card ${complete ? 'complete' : ''} ${skipped ? 'skipped' : ''} ${isOpen ? 'open' : ''}" data-i="${i}">
      <button class="ex-row" data-action="toggle" aria-expanded="${isOpen}">
        ${thumb(ex)}
        <span class="grow">
          <span class="ex-title">${esc(ex.name_pt)}</span>
          <span class="ex-meta" style="display:block">${setsLabel(it)} · ${fmtKg(sugg.load)} kg · ${it.rest_seconds}s</span>
          ${swapped ? `<span class="ex-meta" style="display:block">no lugar de ${esc(exercise(it.planned_id)?.name_pt)}</span>` : ''}
        </span>
        <span class="ex-status">${status}</span>
        ${CHEV}
      </button>
      <div class="ex-body" ${isOpen ? '' : 'hidden'}>
        <div class="ex-sugg">
          <span class="pill accent">Hoje: ${fmtKg(sugg.load)} kg × ${sugg.reps[0]}${sugg.reps.some((r) => r !== sugg.reps[0]) ? '+' : ''}</span>
          <span class="pill ${sugg.trend === 'up' ? 'accent' : sugg.trend === 'down' ? 'warn' : ''}">${TREND_LABEL[sugg.trend]}</span>
          ${sugg.lastText ? `<span class="muted small">Última: ${esc(sugg.lastText)}</span>` : ''}
        </div>
        ${it.notes ? `<p class="muted small" style="margin:8px 0 0">${esc(it.notes)}</p>` : ''}
        <p class="muted tiny" style="margin:6px 0 0">${esc(ex.load_note)}</p>
        ${readonly || skipped ? '' : `<div class="sets"><div class="set-labels"><span>#</span><span>kg</span><span>reps</span><span></span></div>${setsHtml}<button type="button" class="add-set" data-action="add-set">＋ Adicionar série</button></div><p class="tiny faint center" style="margin:6px 0 0">Arraste uma série para a esquerda para apagar</p>`}
        <div class="ex-actions">
          ${readonly ? '' : '<button class="btn small" data-action="swap">Trocar</button>'}

          <a class="btn small" href="#/ex/${ex.id}">Info</a>
        </div>
      </div>
    </div>`;
}

/* ---------- events ---------- */

function bind(view, date) {
  const rerender = () => render(view, { date: date === dateKey() ? undefined : date });
  const plan = () => dayPlan(date);

  view.onclick = async (e) => {
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      const input = stepBtn.parentElement.querySelector('input');
      const v = Math.max(0, (Number(input.value) || 0) + Number(stepBtn.dataset.step));
      input.value = Math.round(v * 100) / 100;
      const row = stepBtn.closest('.set-row');
      if (row?.dataset.log) saveEdit(row);
      return;
    }
    const chip = e.target.closest('[data-cardio-type]');
    if (chip) {
      chip.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.ex-card');
    const p = plan();
    const item = card ? p.exercises[Number(card.dataset.i)] : null;
    switch (btn.dataset.action) {
      case 'toggle': {
        const i = Number(card.dataset.i);
        open.date = date;
        open.idx = open.idx === i ? -1 : i;
        const y = window.scrollY;
        rerender();
        window.scrollTo(0, y);
        break;
      }
      case 'start':
        unlockAudio();
        await ensureSession(date, p);
        requestWakeLock();
        open.date = date;
        open.idx = p.exercises.findIndex((it) => setsFor(date, it.exercise_id).length < it.sets);
        toast('Treino iniciado. Bom treino!');
        notify('Treino em andamento', `${p.session_name} · começou às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 'session');
        rerender();
        break;
      case 'log': {
        unlockAudio();
        requestWakeLock();
        const row = btn.closest('.set-row');
        const load = Number(row.querySelector('[name=load]').value) || 0;
        const reps = Math.round(Number(row.querySelector('[name=reps]').value) || 0);
        if (!reps) { toast('Informe as repetições'); return; }
        btn.disabled = true;
        const { pr } = await logSet(date, p, item.exercise_id, Number(row.dataset.n), load, reps);
        const logged = setsFor(date, item.exercise_id).length;
        const allDone = p.exercises.every((it) => setsFor(date, it.exercise_id).length >= it.sets);
        if (allDone) {
          stopRest();
          toast('Todas as séries feitas! Finalize o treino. 💪', { kind: 'pr' });
        } else {
          const nextIdx = p.exercises.findIndex((it) => setsFor(date, it.exercise_id).length < it.sets);
          const label = logged >= item.sets ? `próximo: ${exercise(p.exercises[nextIdx].exercise_id).name_pt}` : `${exercise(item.exercise_id).name_pt} · série ${logged + 1}`;
          startRest(item.rest_seconds, label);
          if (logged >= item.sets) { open.date = date; open.idx = nextIdx; }
        }
        if (pr.load || pr.e1rm) toast(`🏆 Recorde! ${fmtKg(load)} kg × ${reps}${pr.e1rm ? ` · 1RM est. ${fmtKg(e1rm(load, reps))} kg` : ''}`, { kind: 'pr', ms: 4000 });
        const y = window.scrollY;
        rerender();
        window.scrollTo(0, y);
        afterDataChange();
        break;
      }
      case 'set-menu': {
        const row = btn.closest('.set-row');
        const log = db.get('set_logs', row.dataset.log);
        if (!log) return;
        const s = sheet(`<h3>Série ${log.set_number}: ${fmtKg(log.load_kg)} kg × ${log.reps}</h3><p class="muted small">Para corrigir, ajuste os valores na linha (salva sozinho).</p><button class="btn danger block" data-del>Apagar esta série</button><button class="btn ghost block mt" data-close>Fechar</button>`);
        s.el.querySelector('[data-del]').onclick = async () => { await deleteSet(log); s.close(); rerender(); };
        break;
      }
      case 'add-set': {
        const current = Math.max(item.sets, setsFor(date, item.exercise_id).length);
        setDaySetCount(date, item.planned_id, current + 1 === item.base_sets ? null : current + 1);
        open.date = date;
        open.idx = Number(card.dataset.i);
        const y = window.scrollY;
        rerender();
        window.scrollTo(0, y);
        break;
      }
      case 'swap': openSwap(date, item, rerender); break;
      case 'pick-workout': openWorkoutPicker(date, rerender); break;
      case 'train-anyway':
        setChoice(date, btn.dataset.slot);
        open.date = '';
        rerender();
        break;
      case 'rest': {
        if (!(await confirmSheet('Descansar neste dia?', 'O treino previsto passa para o próximo dia de treino. Nada se perde.', 'Descansar'))) return;
        setChoice(date, '');
        if (!(await markRest(date))) { toast('Este dia já tem séries registradas.'); return; }
        toast('Descanso marcado. A semana foi reorganizada.');
        rerender();
        break;
      }
      case 'unrest':
        await unmarkRest(date);
        rerender();
        break;
      case 'cardio-only': {
        const s = sheet(`<h3>Hoje só cardio</h3><p class="muted small">Registre o cardio. Os exercícios ficam como não feitos e o ${esc(p.session_name)} continua sendo o próximo treino.</p>${cardioCard(date, { title: 'Cardio', phase: 'only', minutes: 30, open: true })}`);
        s.el.querySelector('details').open = true;
        s.el.addEventListener('click', (ev) => {
          const c = ev.target.closest('[data-cardio-type]');
          if (c) c.parentElement.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
        });
        s.el.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          if (await submitCardio(ev.target, date, p)) { s.close(); rerender(); }
        });
        break;
      }
      case 'finish': {
        const logged = loggedSetCount(date);
        const planned = plannedSetCount(p);
        const ok = await confirmSheet('Finalizar treino?', `${logged} de ${planned} séries registradas.${logged && logged < planned * 0.75 ? ' Vai contar como treino parcial.' : ''}${!logged ? ' Sem séries: conta como dia só de cardio (ou é descartado).' : ''}`, 'Finalizar');
        if (!ok) return;
        const s = await finishSession(date, p);
        stopRest();
        clearNotifications();
        releaseWakeLock();
        rerender();
        afterDataChange();
        if (s && s.status !== 'cardio') showSummary(date, s, rerender);
        break;
      }
      case 'reopen': await reopenSession(date); rerender(); break;
      case 'rate': showSummary(date, db.get('sessions', date), rerender); break;
      case 'health': openHealthShortcut(date); break;
      case 'del-cardio': await db.remove('cardio_logs', btn.dataset.id); rerender(); break;
      default:
    }
  };

  bindSwipe(view, async (row) => {
    const card = row.closest('.ex-card');
    const item = plan().exercises[Number(card.dataset.i)];
    const log = row.dataset.log ? db.get('set_logs', row.dataset.log) : null;
    if (log) {
      await deleteSet(log);
      toast(`Série ${log.set_number} apagada`, { ms: 1500 });
    } else {
      const logged = setsFor(date, item.exercise_id).length;
      const next = Math.max(logged, item.sets - 1);
      if (next === item.sets) return false;
      setDaySetCount(date, item.planned_id, next === item.base_sets ? null : next);
    }
    open.date = date;
    open.idx = Number(card.dataset.i);
    const y = window.scrollY;
    rerender();
    window.scrollTo(0, y);
    return true;
  });

  view.onchange = (e) => {
    const row = e.target.closest('.set-row');
    if (row?.dataset.log) saveEdit(row);
  };

  view.onsubmit = async (e) => {
    const rk = e.target.closest('[data-form=restore-keychain]');
    if (rk) {
      e.preventDefault();
      const code = rk.password.value.trim();
      try {
        if (!code.startsWith('ANT1.')) throw new Error('formato');
        applyRestore(await unpackJson(code.slice(5)));
        toast('Restaurado. Baixando seus dados…', { ms: 4000 });
        await sync();
        rerender();
      } catch {
        toast('Esse acesso não é um código do Antares. Use Ajustes → código manual.');
      }
      return;
    }
    const form = e.target.closest('[data-form=cardio]');
    if (!form) return;
    e.preventDefault();
    if (await submitCardio(form, date, plan())) rerender();
  };
}

/**
 * Swipe a set row to the left to delete it (pointer events: touch and mouse). Vertical moves keep
 * scrolling the page (touch-action: pan-y on the rows).
 */
let swipeBound = null;
function bindSwipe(view, onDelete) {
  swipeBound = onDelete;
  if (view.dataset.swipeBound) return;
  view.dataset.swipeBound = '1';
  let st = null;
  view.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.set-swipe .set-row');
    if (!row || e.button > 0) return;
    st = { row, x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
  });
  view.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5 && dx < 0) {
        st.active = true;
        st.row.setPointerCapture?.(e.pointerId);
        st.row.classList.add('swiping');
      } else if (Math.abs(dy) > 10) { st = null; return; } else return;
    }
    st.dx = Math.min(0, dx);
    st.row.style.transform = `translateX(${st.dx}px)`;
    st.row.parentElement.classList.toggle('armed', st.dx < -90);
  });
  const end = async () => {
    if (!st) return;
    const { row, dx, active } = st;
    st = null;
    if (!active) return;
    row.classList.remove('swiping');
    // A swipe must not also count as a tap on the buttons/inputs it started on.
    const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, { capture: true }), 350);
    if (dx < -90) {
      row.style.transform = 'translateX(-110%)';
      const ok = await swipeBound?.(row);
      if (ok === false) { row.style.transform = ''; row.parentElement.classList.remove('armed'); }
    } else {
      row.style.transform = '';
      row.parentElement.classList.remove('armed');
    }
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
}

async function submitCardio(form, date, plan) {
  const type = form.querySelector('[data-cardio-type][aria-pressed=true]')?.dataset.cardioType || 'esteira';
  const duration = Math.round(Number(form.duration.value) || 0);
  if (!duration) { toast('Informe a duração'); return false; }
  const phase = form.dataset.phase || 'pre';
  await logCardio(date, plan, { type, duration_min: duration, avg_hr: Number(form.hr.value) || null, phase });
  toast(phase === 'pre' ? `Aquecimento registrado: ${duration} min` : `Cardio registrado: ${duration} min`);
  afterDataChange();
  return true;
}

async function saveEdit(row) {
  const log = db.get('set_logs', row.dataset.log);
  if (!log) return;
  const load = Number(row.querySelector('[name=load]').value) || 0;
  const reps = Math.round(Number(row.querySelector('[name=reps]').value) || 0);
  if (load === log.load_kg && reps === log.reps) return;
  await updateSet(log, { load_kg: load, reps });
  toast('Série atualizada', { ms: 1200 });
}

function openWorkoutPicker(date, rerender) {
  const last = lastDoneBySlot(date);
  const queue = slotQueue(last);
  const current = dayPlan(date).slot;
  const items = rotation().map((d) => {
    const ago = last[d.slot] ? daysBetween(last[d.slot], date) : null;
    return `<li><button class="list-item" data-pick="${d.slot}">
      <span class="li-ico" style="background:${d.slot.startsWith('upper') ? 'var(--series-1)' : 'var(--series-3)'}">${d.session_name.replace(/^(\w)\w+\s(\w).*/, '$1$2')}</span>
      <span class="grow"><strong>${esc(d.session_name)}</strong>${d.slot === queue[0] ? ' <span class="pill accent">sugerido</span>' : ''}${d.slot === current ? ' <span class="pill">atual</span>' : ''}<br>
      <span class="li-sub">${esc(d.focus)} · ${ago === null ? 'nunca feito' : ago === 0 ? 'feito hoje' : `feito há ${ago} dia${ago > 1 ? 's' : ''}`}</span></span></button></li>`;
  }).join('');
  const s = sheet(`<h3>Qual treino fazer?</h3><p class="muted small">Pode trocar à vontade: o próximo treino sugerido é sempre o que está há mais tempo sem ser feito, então nenhum grupo fica para trás.</p><ul class="list">${items}</ul><button class="btn ghost block mt" data-close>Cancelar</button>`);
  s.el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    await chooseWorkout(date, pick.dataset.pick, dayPlan(date, pick.dataset.pick));
    open.date = '';
    s.close();
    rerender();
  });
}

function openSwap(date, item, rerender) {
  const current = exercise(item.exercise_id);
  const options = usableAlternatives(item.planned_id).filter((id) => id !== item.exercise_id);
  if (item.exercise_id !== item.planned_id && !options.includes(item.planned_id)) options.unshift(item.planned_id);
  const s = sheet(`
    <h3>Trocar ${esc(current.name_pt)}</h3>
    <p class="muted small">Aparelho ocupado ou indisponível? Escolha uma alternativa para hoje. Séries, repetições e descanso continuam os mesmos.</p>
    <ul class="list">${options.map((id) => {
      const ex = exercise(id);
      return `<li><button class="list-item" data-pick="${id}">${thumb(ex)}<span class="grow"><strong>${esc(ex.name_pt)}</strong><br><span class="li-sub">${esc(ex.equipment)} · ${esc(ex.load_note)}</span></span></button></li>`;
    }).join('') || '<li class="muted">Nenhuma alternativa disponível.</li>'}</ul>
    <label class="check mt"><input type="checkbox" data-unavail> <span>“${esc(current.name_pt)}” não existe na minha unidade (trocar sempre)</span></label>
    <button class="btn ghost block mt" data-close>Cancelar</button>`);
  s.el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    if (s.el.querySelector('[data-unavail]').checked) updateSettings({ unavailable: Array.from(new Set([...settings().unavailable, current.id])) });
    await setSwap(date, item.planned_id, pick.dataset.pick);
    s.close();
    rerender();
  });
}

function showSummary(date, session, onRated) {
  const logs = db.index('set_logs', 'session_id').get(date) || [];
  const volume = logs.reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0);
  const prs = logs.filter((l) => l.is_pr).length;
  let rated = false;
  const s = sheet(`
    <div class="center"><div style="font-size:2.6rem">${session.status === 'done' ? '💪' : '👍'}</div>
    <h2>${session.status === 'done' ? 'Treino concluído!' : 'Treino parcial registrado'}</h2>
    <p class="muted">${esc(session.planned_session)} · ${fmtDay(date)}</p></div>
    <div class="tiles" style="margin:14px 0">
      <div class="tile"><div class="v">${session.duration_min ?? '–'}<small> min</small></div><div class="l">duração</div></div>
      <div class="tile"><div class="v">${logs.length}</div><div class="l">séries</div></div>
      <div class="tile"><div class="v">${fmtInt(volume)}<small> kg</small></div><div class="l">volume</div></div>
      <div class="tile"><div class="v">${prs}</div><div class="l">recordes</div></div>
    </div>
    <div class="rate">
      <div class="section-title" style="margin:0 0 8px">Como foi o treino?</div>
      <div class="rate-row" role="group" aria-label="Avaliação do treino">${RATINGS.map(([v, emo, label]) => `<button type="button" data-rate="${v}" aria-pressed="${Number(session.rating) === v}" aria-label="${label}"><span>${emo}</span><small>${label}</small></button>`).join('')}</div>
    </div>
    <p class="muted small">Junte FC e calorias do relógio (Zepp → Saúde) a este treino rodando o Atalho.</p>
    <button class="btn primary block" data-health>Importar dados do Saúde</button>
    <button class="btn ghost block mt" data-close>Fechar</button>`, { onClose: () => { if (rated) onRated?.(); } });
  s.el.querySelector('[data-health]').onclick = () => openHealthShortcut(date);
  s.el.querySelector('.rate-row').onclick = async (e) => {
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    s.el.querySelectorAll('[data-rate]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    await rateSession(date, Number(b.dataset.rate));
    rated = true;
    toast('Avaliação salva');
  };
}

/** Runs the iOS Shortcut with "date|minutes" so it can average the heart rate of the workout. */
export function openHealthShortcut(date) {
  const name = settings().shortcutName || 'Projeto K Saúde';
  const minutes = db.get('sessions', date)?.duration_min || '';
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(`${date}|${minutes}`)}`;
}
