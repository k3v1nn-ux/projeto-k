// "Treinos recebidos": invite a friend, review pending workouts and accept them fully or
// partially (day by day, each on a chosen date), see history and scheduled friend days.
import * as db from '../db.js';
import { exercise } from '../program.js';
import { pendingSuggestions, suggestionPayload, suggestedDates, acceptDays, rejectSuggestion, friendLink } from '../friend.js';
import { sheet, toast, confirmSheet } from '../ui.js';
import { esc, fmtDay, dateKey } from '../util.js';
import { afterDataChange } from '../achievements.js';

const STATUS = { accepted: ['aceito', 'accent'], partial: ['aceito em parte', 'accent'], rejected: ['recusado', ''], pending: ['novo', 'info'] };

export function render(view) {
  const pending = pendingSuggestions();
  const history = db.all('suggestions').filter((s) => s.status !== 'pending').sort((a, b) => String(b.created_at).localeCompare(a.created_at)).slice(0, 20);
  const upcoming = db.all('overrides').filter((o) => o.date >= dateKey()).sort((a, b) => a.date.localeCompare(b.date));
  const card = (s) => {
    const p = suggestionPayload(s);
    const st = STATUS[s.status] || ['', ''];
    return `<li><button class="list-item" data-sug="${s.id}"><span class="avatar" style="width:40px;height:40px">${esc(p.author[0] || '?')}</span>
      <span class="grow"><strong>${esc(p.author)}</strong> <span class="pill ${st[1]}">${st[0]}</span><br>
      <span class="li-sub">${p.days.length} dia${p.days.length > 1 ? 's' : ''}: ${esc(p.days.map((d) => d.name).join(', '))} · ${fmtDay(dateKey(new Date(s.created_at)), { weekday: false })}</span></span><span class="li-chev">›</span></button></li>`;
  };
  view.innerHTML = `
    <div class="page-head"><h1>Treinos recebidos</h1><p>Treinos que amigos montaram para você.</p></div>
    <div class="card">
      <h3>Convidar um amigo</h3>
      <p class="muted small">Ele abre o link, monta um ou vários dias de treino (sem login) e envia. Aqui você aceita tudo, só alguns dias, ou recusa.</p>
      <button class="btn primary block" data-act="invite">Gerar link de convite</button>
      <textarea readonly data-out hidden class="mt"></textarea>
    </div>
    <div class="section"><div class="section-title"><span>Pendentes</span><span>${pending.length}</span></div>
      <div class="group"><ul class="list">${pending.map(card).join('') || '<li class="muted small" style="padding:14px 16px">Nada pendente.</li>'}</ul></div></div>
    ${upcoming.length ? `<div class="section"><div class="section-title"><span>Agendados</span></div><div class="group"><ul class="list">${upcoming.map((o) => `<li class="list-item" style="padding:12px 16px"><span class="grow"><strong>${esc(o.session_name)}</strong><br><span class="li-sub">${fmtDay(o.date)}</span></span><a class="btn small" href="#/dia/${o.date}">Ver</a><button class="btn small ghost" data-unschedule="${o.id}">Remover</button></li>`).join('')}</ul></div></div>` : ''}
    ${history.length ? `<div class="section"><div class="section-title"><span>Histórico</span></div><div class="group"><ul class="list">${history.map(card).join('')}</ul></div></div>` : ''}`;

  view.onclick = async (e) => {
    if (e.target.closest('[data-act=invite]')) {
      const { link, warning } = await friendLink();
      if (warning) toast(esc(warning), { ms: 4500 });
      const out = view.querySelector('[data-out]');
      out.hidden = false;
      out.value = link;
      out.select();
      if (navigator.share) navigator.share({ title: 'Monte um treino pra mim', text: 'Monte um treino pra mim no Antares:', url: link }).catch(() => {});
      else navigator.clipboard?.writeText(link).then(() => toast('Link copiado'), () => {});
      return;
    }
    const un = e.target.closest('[data-unschedule]');
    if (un) {
      if (await confirmSheet('Remover treino agendado?', 'O dia volta para o rodízio normal.', 'Remover')) {
        await db.remove('overrides', un.dataset.unschedule);
        render(view);
      }
      return;
    }
    const s = e.target.closest('[data-sug]');
    if (s) openSuggestion(s.dataset.sug, () => render(view));
  };
}

export function openSuggestion(id, onDone) {
  const sug = db.get('suggestions', id);
  if (!sug) return;
  const p = suggestionPayload(sug);
  const dates = suggestedDates(p.days.length);
  const readonly = sug.status !== 'pending';
  const sh = sheet(`
    <h3>Treino de ${esc(p.author)}</h3>
    ${p.notes ? `<p class="muted small">“${esc(p.notes)}”</p>` : ''}
    <p class="muted small">${readonly ? 'Histórico deste treino.' : 'Escolha os dias que quer usar e em que data. Os não marcados são descartados.'}</p>
    ${p.days.map((d, i) => `
      <div class="card flat mt" data-day="${i}">
        <label class="check" style="min-height:0"><input type="checkbox" data-use ${readonly ? 'disabled' : 'checked'}> <strong>${esc(d.name)}</strong> <span class="muted small">· ${d.exercises.length} exercícios</span></label>
        <ul class="list" style="margin-top:6px">${d.exercises.map((it) => `<li style="padding:6px 0" class="small"><strong>${esc(exercise(it.exercise_id).name_pt)}</strong> <span class="muted">${it.sets}×${it.rep_min}–${it.rep_max} · ${it.rest_seconds}s${it.notes ? ` · ${esc(it.notes)}` : ''}</span></li>`).join('')}</ul>
        ${readonly ? '' : `<label class="field" style="margin:8px 0 0"><span>Data</span><input type="date" data-date value="${dates[i] || dateKey()}" min="${dateKey()}"></label>`}
      </div>`).join('')}
    ${readonly ? '<button class="btn ghost block mt" data-close>Fechar</button>' : `<div class="row gap mt"><button class="btn ghost grow" data-reject>Recusar tudo</button><button class="btn primary grow" data-accept>Aceitar selecionados</button></div>`}`);
  sh.el.querySelector('[data-accept]')?.addEventListener('click', async () => {
    const picks = [...sh.el.querySelectorAll('[data-day]')].filter((el) => el.querySelector('[data-use]').checked).map((el) => ({ index: Number(el.dataset.day), date: el.querySelector('[data-date]').value || dateKey() }));
    if (new Set(picks.map((x) => x.date)).size !== picks.length) { toast('Escolha datas diferentes para cada dia'); return; }
    const status = await acceptDays(sug, picks);
    sh.close();
    toast(status === 'rejected' ? 'Treino recusado' : `${picks.length} dia${picks.length > 1 ? 's' : ''} agendado${picks.length > 1 ? 's' : ''}`);
    afterDataChange();
    onDone?.();
  });
  sh.el.querySelector('[data-reject]')?.addEventListener('click', async () => {
    await rejectSuggestion(sug);
    sh.close();
    onDone?.();
  });
}
