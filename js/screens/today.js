// "Hoje": the day's plan, set logging (pre-filled, 1 tap), rest timer, swaps, cardio, finish.
import * as db from '../db.js';
import { dayPlan, exercise, getProgram, usableAlternatives } from '../program.js';
import { suggestion, TREND_LABEL, e1rm } from '../progression.js';
import { settings, updateSettings } from '../settings.js';
import { startRest, stopRest, unlockAudio, requestWakeLock, releaseWakeLock } from '../timer.js';
import { toast, sheet, confirmSheet } from '../ui.js';
import {
  ensureSession, finishSession, logSet, updateSet, deleteSet, setsFor, setSwap, logCardio,
  cardioFor, reopenSession, loggedSetCount, plannedSetCount,
} from '../workout.js';
import { dateKey, fmtDay, fmtKg, esc, $, fmtInt } from '../util.js';
import { afterDataChange } from '../achievements.js';
import { pendingSuggestions, openSuggestion } from '../friend.js';
import { mountSpotify } from '../spotify.js';

const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

export function render(view, params = {}) {
  const today = dateKey();
  const date = params.date || today;
  const plan = dayPlan(date);
  const session = db.get('sessions', date);
  const active = session?.status === 'in_progress';
  const finished = session && ['done', 'partial'].includes(session.status);
  const isPast = date < today;
  const future = date > today;

  const pills = [];
  pills.push(`<span class="pill">${plan.level === 'intermediate' ? 'Intermediário' : 'Base'}</span>`);
  if (plan.reentry) pills.push('<span class="pill warn">Semana de reentrada</span>');
  if (plan.source === 'friend') pills.push(`<span class="pill info">Treino de ${esc(plan.author || 'amigo')}</span>`);
  if (finished) pills.push(`<span class="pill accent">${session.status === 'done' ? 'Concluído' : 'Parcial'}${session.duration_min ? ` · ${session.duration_min} min` : ''}</span>`);
  if (session?.status === 'missed') pills.push('<span class="pill danger">Falta</span>');

  const pending = pendingSuggestions();
  let html = '';
  if (date !== today) {
    html += `<div class="banner warn"><span class="grow">${isPast ? 'Editando um dia passado' : 'Prévia de um dia futuro'}</span><a class="btn small" href="#/hoje">Ir para hoje</a></div>`;
  }
  if (pending.length) {
    const s = pending[0];
    html += `<div class="banner"><span class="grow"><strong>Novo treino de ${esc(s.author)}</strong>${pending.length > 1 ? ` e mais ${pending.length - 1}` : ''}</span><button class="btn small" data-action="suggestion" data-id="${esc(s.id)}">Ver</button></div>`;
  }
  html += `
    <div class="hero">
      <div>
        <div class="date">${fmtDay(date)}</div>
        <h1>${esc(plan.session_name)}</h1>
        <div class="row gap wrap">${pills.join('')}</div>
      </div>
    </div>`;

  if (plan.type === 'rest') {
    html += `<div class="card"><h2>Dia de descanso</h2><p class="muted">Recuperação também é treino. Dormir bem e comer proteína hoje vale mais do que ir à academia.</p><p class="muted small">Descanso não conta como falta nem quebra a sequência.</p></div>`;
    if (!future) html += cardioBlock(date, plan, { title: 'Fez algo mesmo assim? Registre cardio', open: false });
  } else if (plan.type === 'cardio') {
    html += `<div class="card"><h2>Cardio zona 2</h2><p class="muted">${esc(plan.cardio.note)}</p><p class="small">Meta: <strong>${plan.cardio.minutes_min}–${plan.cardio.minutes_max} min</strong></p></div>`;
    if (!future) html += cardioBlock(date, plan, { title: 'Registrar cardio', open: true, minutes: 30 });
  } else {
    html += '<div id="spotify-slot"></div>';
    if (!future && (!session || session.status === 'missed')) {
      html += warmupCard();
      html += `<button class="btn primary big block" data-action="start" style="margin-top:12px">Iniciar treino</button>`;
    }
    html += `<div class="section"><div class="section-title">${plan.exercises.length} exercícios · ${plannedSetCount(plan)} séries · RIR ${plan.reentry ? getProgram().rules.reentry_week.rir : plan.level === 'intermediate' ? '0–2' : '1–3'}</div>`;
    html += plan.exercises.map((it, i) => exerciseCard(date, plan, it, i, future)).join('');
    html += '</div>';
    if (!future) html += cardioBlock(date, plan, { title: 'Cardio depois do treino (opcional)', open: false, minutes: 15, note: plan.post_cardio });
    if (active) {
      html += `<div class="sticky-actions"><button class="btn primary big block" data-action="finish">Finalizar treino · ${loggedSetCount(date)}/${plannedSetCount(plan)} séries</button></div>`;
    } else if (finished) {
      html += `<div class="row gap" style="margin-top:16px"><button class="btn ghost grow" data-action="reopen">Reabrir treino</button><button class="btn grow" data-action="health">Importar do Saúde</button></div>`;
    }
  }

  view.innerHTML = html;
  bind(view, date, plan);
  if (plan.type === 'lift') mountSpotify($('#spotify-slot', view), { active });
}

function warmupCard() {
  const w = getProgram().rules.warmup;
  return `<details class="card warmup"><summary>Aquecimento (5–8 min)</summary><ol>${w.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>`;
}

function thumb(ex) {
  if (ex.media_frames?.length) return `<img class="ex-thumb" src="${ex.media_frames[0]}" alt="" loading="lazy">`;
  return '<div class="ex-thumb placeholder">sem<br>imagem</div>';
}

function exerciseCard(date, plan, it, i, readonly = false) {
  const ex = exercise(it.exercise_id);
  const logs = setsFor(date, it.exercise_id);
  const sugg = suggestion(it, date, plan.session_name);
  const complete = logs.length >= it.sets;
  const step = ex.increment_kg || 1;
  const rows = Math.max(it.sets, logs.length);
  const lastLoad = logs.length ? logs[logs.length - 1].load_kg : sugg.load;
  let setsHtml = '';
  for (let n = 1; n <= rows; n++) {
    const log = logs[n - 1];
    const load = log ? log.load_kg : lastLoad;
    const reps = log ? log.reps : (sugg.reps[n - 1] ?? it.rep_min);
    const isNext = !log && n === logs.length + 1;
    setsHtml += `
      <div class="set-row ${log ? 'logged' : ''} ${isNext ? 'next' : ''}" data-n="${n}" ${log ? `data-log="${log.id}"` : ''}>
        <span class="set-n">${n}</span>
        <div class="stepper"><button data-step="-${step}" data-field="load" aria-label="Menos carga">−</button><input type="number" inputmode="decimal" step="any" name="load" value="${load ?? 0}" aria-label="Carga em kg"><button data-step="${step}" data-field="load" aria-label="Mais carga">+</button></div>
        <div class="stepper"><button data-step="-1" data-field="reps" aria-label="Menos repetições">−</button><input type="number" inputmode="numeric" name="reps" value="${reps}" aria-label="Repetições"><button data-step="1" data-field="reps" aria-label="Mais repetições">+</button></div>
        <button class="set-ok" data-action="${log ? 'set-menu' : 'log'}" aria-label="${log ? 'Opções da série' : 'Registrar série'}">${log ? (log.is_pr ? '🏆' : CHECK) : CHECK}</button>
      </div>`;
  }
  const swapped = it.exercise_id !== it.planned_id;
  return `
    <div class="card ex-card ${complete ? 'complete' : ''}" data-i="${i}">
      <div class="ex-head">
        <span class="ex-num">${complete ? '✓' : i + 1}</span>
        <a href="#/ex/${ex.id}">${thumb(ex)}</a>
        <div class="grow">
          <div class="ex-title">${esc(ex.name_pt)}</div>
          <div class="ex-meta">${it.sets} × ${it.rep_min}–${it.rep_max} · descanso ${it.rest_seconds}s · ${esc(ex.load_note)}</div>
          ${swapped ? `<div class="ex-meta">no lugar de ${esc(exercise(it.planned_id)?.name_pt)}</div>` : ''}
          ${it.notes ? `<div class="ex-meta">${esc(it.notes)}</div>` : ''}
        </div>
      </div>
      <div class="ex-sugg">
        <span class="pill accent">Hoje: ${fmtKg(sugg.load)} kg × ${sugg.reps[0]}${sugg.reps.some((r) => r !== sugg.reps[0]) ? '+' : ''}</span>
        <span class="pill ${sugg.trend === 'up' ? 'accent' : sugg.trend === 'down' ? 'warn' : ''}">${TREND_LABEL[sugg.trend]}</span>
        ${sugg.lastText ? `<span class="muted small">Última: ${esc(sugg.lastText)}</span>` : ''}
      </div>
      <div class="sets" ${readonly ? 'hidden' : ''}>
        <div class="set-labels"><span>#</span><span>kg</span><span>reps</span><span></span></div>
        ${setsHtml}
      </div>
      <div class="ex-actions">
        <button class="btn small ghost" data-action="swap">Trocar</button>
        ${readonly ? '' : '<button class="btn small ghost" data-action="extra">+ Série</button>'}
        <a class="btn small ghost" href="#/ex/${ex.id}">Detalhes</a>
      </div>
    </div>`;
}

function cardioBlock(date, plan, { title, open, minutes = 20, note = '' }) {
  const logs = cardioFor(date);
  const types = getProgram().cardio_types;
  const list = logs.map((c) => `<li class="row between" style="padding:8px 0"><span>${esc(types.find((t) => t.id === c.type)?.name_pt || c.type)} · <strong>${c.duration_min} min</strong>${c.avg_hr ? ` · FC ${c.avg_hr}` : ''}</span><button class="link-btn" data-action="del-cardio" data-id="${c.id}">apagar</button></li>`).join('');
  return `
    <details class="card" ${open || logs.length ? 'open' : ''} style="margin-top:12px">
      <summary>${esc(title)}${logs.length ? ` · ${logs.reduce((a, c) => a + (c.duration_min || 0), 0)} min` : ''}</summary>
      ${note ? `<p class="muted small" style="margin-top:8px">${esc(note)}</p>` : ''}
      ${list ? `<ul class="list">${list}</ul>` : ''}
      <form data-form="cardio" style="margin-top:10px">
        <div class="chips" role="group" aria-label="Tipo de cardio">${types.map((t, i) => `<button type="button" class="chip" data-cardio-type="${t.id}" aria-pressed="${i === 0}">${esc(t.name_pt)}</button>`).join('')}</div>
        <div class="row gap" style="margin-top:10px">
          <label class="field grow"><span>Duração (min)</span><input type="number" inputmode="numeric" name="duration" value="${minutes}" min="1"></label>
          <label class="field grow"><span>FC média (opcional)</span><input type="number" inputmode="numeric" name="hr" placeholder="bpm"></label>
        </div>
        <button class="btn primary block" type="submit">Salvar cardio</button>
      </form>
    </details>`;
}

function bind(view, date, plan) {
  const rerender = () => render(view, { date: date === dateKey() ? undefined : date });

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
    const item = card ? plan.exercises[Number(card.dataset.i)] : null;
    switch (btn.dataset.action) {
      case 'start':
        unlockAudio();
        await ensureSession(date, plan);
        requestWakeLock();
        toast('Treino iniciado. Bom treino!');
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
        const { pr } = await logSet(date, plan, item.exercise_id, Number(row.dataset.n), load, reps);
        const logged = setsFor(date, item.exercise_id).length;
        const lastOfAll = plan.exercises.every((it) => setsFor(date, it.exercise_id).length >= it.sets);
        if (!lastOfAll) {
          const nextLabel = logged >= item.sets ? nextExerciseName(date, plan) : `${exercise(item.exercise_id).name_pt} · série ${logged + 1}`;
          startRest(item.rest_seconds, nextLabel);
        } else {
          stopRest();
          toast('Todas as séries feitas! Finalize o treino.', { kind: 'pr' });
        }
        if (pr.load || pr.e1rm) {
          toast(`🏆 Recorde pessoal! ${fmtKg(load)} kg × ${reps}${pr.e1rm ? ` · 1RM est. ${fmtKg(e1rm(load, reps))} kg` : ''}`, { kind: 'pr', ms: 4000 });
        }
        rerender();
        afterDataChange();
        break;
      }
      case 'set-menu': {
        const row = btn.closest('.set-row');
        const log = db.get('set_logs', row.dataset.log);
        if (!log) return;
        const s = sheet(`<h3>Série ${log.set_number}: ${fmtKg(log.load_kg)} kg × ${log.reps}</h3><p class="muted small">Para corrigir, ajuste os valores direto na linha (salva sozinho).</p><button class="btn danger block" data-del>Apagar esta série</button><button class="btn ghost block" data-close style="margin-top:8px">Fechar</button>`);
        s.el.querySelector('[data-del]').onclick = async () => {
          await deleteSet(log);
          s.close();
          rerender();
        };
        break;
      }
      case 'extra': {
        const sets = card.querySelector('.sets');
        const rows = sets.querySelectorAll('.set-row');
        const last = rows[rows.length - 1];
        const clone = last.cloneNode(true);
        clone.classList.remove('logged');
        clone.classList.add('next');
        clone.removeAttribute('data-log');
        clone.dataset.n = String(rows.length + 1);
        clone.querySelector('.set-n').textContent = String(rows.length + 1);
        const ok = clone.querySelector('.set-ok');
        ok.dataset.action = 'log';
        ok.innerHTML = CHECK;
        sets.appendChild(clone);
        break;
      }
      case 'swap':
        openSwap(date, item, rerender);
        break;
      case 'finish': {
        const logged = loggedSetCount(date);
        const planned = plannedSetCount(plan);
        const ok = await confirmSheet('Finalizar treino?', `${logged} de ${planned} séries registradas.${logged < planned * 0.75 ? ' Vai contar como treino parcial.' : ''}`, 'Finalizar');
        if (!ok) return;
        const s = await finishSession(date, plan);
        stopRest();
        releaseWakeLock();
        rerender();
        afterDataChange();
        if (s) showSummary(date, s);
        break;
      }
      case 'reopen':
        await reopenSession(date);
        rerender();
        break;
      case 'health':
        openHealthShortcut(date);
        break;
      case 'del-cardio':
        await db.remove('cardio_logs', btn.dataset.id);
        rerender();
        break;
      case 'suggestion':
        openSuggestion(btn.dataset.id, rerender);
        break;
      default:
    }
  };

  view.onchange = (e) => {
    const row = e.target.closest('.set-row');
    if (row?.dataset.log) saveEdit(row);
  };

  view.onsubmit = async (e) => {
    const form = e.target.closest('[data-form=cardio]');
    if (!form) return;
    e.preventDefault();
    const type = form.querySelector('[data-cardio-type][aria-pressed=true]')?.dataset.cardioType || 'esteira';
    const duration = Math.round(Number(form.duration.value) || 0);
    if (!duration) { toast('Informe a duração'); return; }
    await logCardio(date, plan, { type, duration_min: duration, avg_hr: Number(form.hr.value) || null });
    toast(`Cardio salvo: ${duration} min`);
    rerender();
    afterDataChange();
  };
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

function nextExerciseName(date, plan) {
  const next = plan.exercises.find((it) => setsFor(date, it.exercise_id).length < it.sets);
  return next ? `próximo: ${exercise(next.exercise_id).name_pt}` : '';
}

function openSwap(date, item, rerender) {
  const current = exercise(item.exercise_id);
  const options = usableAlternatives(item.planned_id).filter((id) => id !== item.exercise_id);
  if (item.exercise_id !== item.planned_id && !options.includes(item.planned_id)) options.unshift(item.planned_id);
  const s = sheet(`
    <h3>Trocar ${esc(current.name_pt)}</h3>
    <p class="muted small">Escolha uma alternativa para hoje. Séries, repetições e descanso continuam os mesmos.</p>
    <ul class="list">${options.map((id) => {
      const ex = exercise(id);
      return `<li><button class="list-item" data-pick="${id}">${thumb(ex)}<span class="grow"><strong>${esc(ex.name_pt)}</strong><br><span class="muted small">${esc(ex.equipment)} · ${esc(ex.load_note)}</span></span></button></li>`;
    }).join('') || '<li class="muted">Nenhuma alternativa disponível.</li>'}</ul>
    <label class="check" style="margin-top:8px"><input type="checkbox" data-unavail> <span>“${esc(current.name_pt)}” não existe na minha unidade (trocar sempre)</span></label>
    <button class="btn ghost block" data-close style="margin-top:8px">Cancelar</button>`);
  s.el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    if (s.el.querySelector('[data-unavail]').checked) {
      updateSettings({ unavailable: Array.from(new Set([...settings().unavailable, current.id])) });
    }
    await setSwap(date, item.planned_id, pick.dataset.pick);
    s.close();
    rerender();
  });
}

function showSummary(date, session) {
  const logs = db.all('set_logs').filter((l) => l.session_id === date);
  const volume = logs.reduce((a, l) => a + (l.load_kg || 0) * (l.reps || 0), 0);
  const prs = logs.filter((l) => l.is_pr).length;
  const s = sheet(`
    <h2>${session.status === 'done' ? 'Treino concluído! 💪' : 'Treino parcial registrado'}</h2>
    <div class="tiles" style="margin:12px 0">
      <div class="tile"><div class="v">${session.duration_min ?? '–'}</div><div class="l">minutos</div></div>
      <div class="tile"><div class="v">${logs.length}</div><div class="l">séries</div></div>
      <div class="tile"><div class="v">${fmtInt(volume)}</div><div class="l">kg de volume</div></div>
      <div class="tile"><div class="v">${prs}</div><div class="l">recordes</div></div>
    </div>
    <p class="muted small">Quer juntar a FC e as calorias do relógio (Zepp → Saúde) a este treino? Rode o Atalho do iOS.</p>
    <button class="btn primary block" data-health>Importar dados do Saúde</button>
    <button class="btn ghost block" data-close style="margin-top:8px">Fechar</button>`);
  s.el.querySelector('[data-health]').onclick = () => openHealthShortcut(date);
}

export function openHealthShortcut(date) {
  const name = settings().shortcutName || 'Projeto K Saúde';
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(date)}`;
}
