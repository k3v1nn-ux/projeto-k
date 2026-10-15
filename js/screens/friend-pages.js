// Pages opened from links: the friend's workout builder (no login, one or more days) and the
// WhatsApp fallback import.
import { allExercises, exercise } from '../program.js';
import { api } from '../sync.js';
import { toast } from '../ui.js';
import { esc, packJson, unpackJson } from '../util.js';
import { sanitizePayload, addLocalSuggestion } from '../friend.js';
import { openSuggestion } from './inbox.js';

const GROUPS = ['peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'quadríceps', 'posteriores', 'glúteos', 'adutores', 'panturrilhas', 'abdômen'];

export async function renderBuilder(view, query) {
  let config = {};
  try { if (query.get('c')) config = await unpackJson(query.get('c')); } catch { /* broken link: still allow WhatsApp */ }
  const owner = config.n || 'seu amigo';
  const state = { author: '', notes: '', days: [{ name: 'Dia 1', items: [] }], cur: 0, group: 'peito', search: '' };
  const pool = allExercises().filter((e) => !e.is_squat_variant);
  const day = () => state.days[state.cur];

  const pickerHtml = () => {
    const q = state.search.trim().toLowerCase();
    return pool.filter((e) => (q ? e.name_pt.toLowerCase().includes(q) : e.muscle_group === state.group)).map((e) => `<li><button type="button" class="list-item" data-add="${e.id}">${e.media_frames.length ? `<img class="ex-thumb" src="${e.media_frames[0]}" alt="" loading="lazy">` : '<div class="ex-thumb placeholder">sem<br>imagem</div>'}<span class="grow"><strong>${esc(e.name_pt)}</strong><br><span class="li-sub">${esc(e.equipment)}</span></span><span class="pill accent">+ adicionar</span></button></li>`).join('');
  };
  const itemsHtml = () => day().items.map((it, i) => `
    <div class="card flat" data-item="${i}" style="padding:12px;margin-top:10px">
      <div class="row between"><strong>${i + 1}. ${esc(exercise(it.exercise_id).name_pt)}</strong>
        <span class="row gap"><button type="button" class="icon-btn" data-move="-1" aria-label="Subir">↑</button><button type="button" class="icon-btn" data-move="1" aria-label="Descer">↓</button><button type="button" class="icon-btn" data-remove aria-label="Remover">✕</button></span></div>
      <div class="grid2" style="margin-top:8px;grid-template-columns:repeat(4,1fr)">
        <label class="field"><span>Séries</span><input type="number" inputmode="numeric" data-f="sets" value="${it.sets}"></label>
        <label class="field"><span>Reps mín</span><input type="number" inputmode="numeric" data-f="rep_min" value="${it.rep_min}"></label>
        <label class="field"><span>Reps máx</span><input type="number" inputmode="numeric" data-f="rep_max" value="${it.rep_max}"></label>
        <label class="field"><span>Desc. (s)</span><input type="number" inputmode="numeric" data-f="rest_seconds" value="${it.rest_seconds}"></label>
      </div>
      <input type="text" data-f="notes" value="${esc(it.notes)}" placeholder="Observação (opcional)">
    </div>`).join('');

  const draw = () => {
    const total = state.days.reduce((a, d) => a + d.items.length, 0);
    view.innerHTML = `
      <div class="hero"><div class="eyebrow">Antares V3</div><h1>Monte um treino para ${esc(owner)}</h1>
        <div class="sub">Um ou vários dias. Só aparelhos comuns de academia e nenhuma variação de agachamento. ${esc(owner)} pode aceitar tudo ou só alguns dias.</div></div>
      <div class="card mt">
        <label class="field"><span>Seu nome</span><input type="text" data-top="author" value="${esc(state.author)}" placeholder="ex.: Ana"></label>
        <label class="field" style="margin:0"><span>Recado (opcional)</span><textarea data-top="notes">${esc(state.notes)}</textarea></label>
      </div>
      <div class="section"><div class="section-title"><span>Dias</span></div>
        <div class="chips">${state.days.map((d, i) => `<button type="button" class="chip" data-day="${i}" aria-pressed="${i === state.cur}">${esc(d.name)} (${d.items.length})</button>`).join('')}<button type="button" class="chip" data-addday>+ dia</button></div>
        <div class="card mt">
          <div class="row gap"><label class="field grow" style="margin:0"><span>Nome do dia</span><input type="text" data-dayname value="${esc(day().name)}"></label>${state.days.length > 1 ? '<button type="button" class="btn small ghost" data-delday style="align-self:flex-end">Excluir dia</button>' : ''}</div>
          ${itemsHtml() || '<p class="muted small mt">Nenhum exercício neste dia. Adicione abaixo.</p>'}
        </div>
      </div>
      <div class="section"><div class="section-title"><span>Adicionar ao ${esc(day().name)}</span></div>
        <div class="card">
          <input type="search" data-search placeholder="Buscar por nome…" value="${esc(state.search)}">
          <div class="chips scroll mt">${GROUPS.map((g) => `<button type="button" class="chip" data-group="${g}" aria-pressed="${!state.search && state.group === g}">${g}</button>`).join('')}</div>
          <ul class="list" data-picker style="margin-top:8px">${pickerHtml()}</ul>
        </div>
      </div>
      <button class="btn primary big block mt2" data-send ${total ? '' : 'disabled'}>Enviar treino (${state.days.filter((d) => d.items.length).length} dia${state.days.filter((d) => d.items.length).length === 1 ? '' : 's'})</button>
      <div data-result></div>`;
  };
  const keep = () => { const y = window.scrollY; draw(); window.scrollTo(0, y); };
  draw();

  view.oninput = (e) => {
    const t = e.target;
    if (t.dataset.top) state[t.dataset.top] = t.value;
    if (t.matches('[data-dayname]')) day().name = t.value || `Dia ${state.cur + 1}`;
    if (t.dataset.f) day().items[Number(t.closest('[data-item]').dataset.item)][t.dataset.f] = t.dataset.f === 'notes' ? t.value : Number(t.value);
    if (t.matches('[data-search]')) { state.search = t.value; view.querySelector('[data-picker]').innerHTML = pickerHtml(); }
  };
  view.onclick = async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const ex = exercise(add.dataset.add);
      const lower = ['quadríceps', 'posteriores', 'glúteos'].includes(ex.muscle_group);
      day().items.push({ exercise_id: ex.id, sets: 3, rep_min: 10, rep_max: 12, rest_seconds: lower ? 120 : 90, notes: '' });
      keep();
      toast(`${esc(ex.name_pt)} adicionado`, { ms: 1200 });
      return;
    }
    const g = e.target.closest('[data-group]');
    if (g) { state.group = g.dataset.group; state.search = ''; keep(); return; }
    const d = e.target.closest('[data-day]');
    if (d) { state.cur = Number(d.dataset.day); keep(); return; }
    if (e.target.closest('[data-addday]')) { state.days.push({ name: `Dia ${state.days.length + 1}`, items: [] }); state.cur = state.days.length - 1; keep(); return; }
    if (e.target.closest('[data-delday]')) { state.days.splice(state.cur, 1); state.cur = 0; keep(); return; }
    const item = e.target.closest('[data-item]');
    if (item && e.target.closest('[data-remove]')) { day().items.splice(Number(item.dataset.item), 1); keep(); return; }
    const move = e.target.closest('[data-move]');
    if (item && move) {
      const i = Number(item.dataset.item);
      const j = i + Number(move.dataset.move);
      if (j >= 0 && j < day().items.length) [day().items[i], day().items[j]] = [day().items[j], day().items[i]];
      keep();
      return;
    }
    if (e.target.closest('[data-send]')) {
      if (!state.author.trim()) { toast('Escreva seu nome'); return; }
      await send(view, config, state);
    }
  };
}

async function send(view, config, state) {
  const payload = sanitizePayload({ author: state.author, notes: state.notes, days: state.days.map((d) => ({ name: d.name, exercises: d.items })) });
  const planB = `${location.origin}${location.pathname}#/importar?w=${await packJson(payload)}`;
  let sent = false;
  if (config.u && config.t) {
    try {
      await api('suggest', { author: payload.author, payload_json: JSON.stringify(payload) }, { url: config.u, token: config.t });
      sent = true;
    } catch { /* fall back to WhatsApp below */ }
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Montei um treino pra você no Antares: ${planB}`)}`;
  view.querySelector('[data-send]').hidden = true;
  view.querySelector('[data-result]').innerHTML = `
    <div class="card mt">
      <h2>${sent ? 'Treino enviado! ✅' : 'Treino pronto'}</h2>
      <p class="muted">${sent ? 'Já aparece no app. Se quiser, mande também o link abaixo como backup.' : 'Mande este link pelo WhatsApp; ao abrir, o treino é importado.'}</p>
      <a class="btn primary block" href="${wa}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
      <textarea readonly class="mt">${esc(planB)}</textarea>
    </div>`;
  window.scrollTo(0, document.body.scrollHeight);
}

export async function renderImport(view, query) {
  let payload;
  try {
    payload = sanitizePayload(await unpackJson(query.get('w') || ''));
    if (!payload.days.length) throw new Error('vazio');
  } catch {
    view.innerHTML = '<div class="card"><h2>Link inválido</h2><p class="muted">Peça para o amigo gerar o link de novo.</p></div>';
    return;
  }
  view.innerHTML = `
    <div class="card"><h2>Treino de ${esc(payload.author)}</h2>
      <p class="muted">${payload.days.length} dia${payload.days.length > 1 ? 's' : ''}: ${esc(payload.days.map((d) => d.name).join(', '))}</p>
      <button class="btn primary block" data-import>Ver e escolher dias</button>
      <a class="btn ghost block mt" href="#/hoje">Agora não</a></div>`;
  view.onclick = async (e) => {
    if (!e.target.closest('[data-import]')) return;
    const sug = await addLocalSuggestion(payload);
    openSuggestion(sug.id, () => { location.hash = '#/recebidos'; });
  };
}
