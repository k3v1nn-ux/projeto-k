// Pages opened from links: the friend's workout builder (no login) and the Plan B import.
import { allExercises, exercise } from '../program.js';
import { api } from '../sync.js';
import { toast } from '../ui.js';
import { esc, packJson, unpackJson } from '../util.js';
import { sanitizePayload, addLocalSuggestion, openSuggestion } from '../friend.js';

const GROUPS = ['peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'quadríceps', 'posteriores', 'glúteos', 'adutores', 'panturrilhas', 'abdômen'];

export async function renderBuilder(view, query) {
  let config = {};
  try {
    if (query.get('c')) config = await unpackJson(query.get('c'));
  } catch { /* broken link: still allow Plan B */ }
  const owner = config.n || 'seu amigo';
  const state = { author: '', session_name: 'Treino do amigo', notes: '', items: [], group: 'peito', search: '' };
  const pool = allExercises().filter((e) => !e.is_squat_variant);

  const pickerHtml = () => {
    const q = state.search.trim().toLowerCase();
    const list = pool.filter((e) => (q ? e.name_pt.toLowerCase().includes(q) : e.muscle_group === state.group));
    return list.map((e) => `<li><button type="button" class="list-item" data-add="${e.id}">${e.media_frames.length ? `<img class="ex-thumb" src="${e.media_frames[0]}" alt="" loading="lazy">` : '<div class="ex-thumb placeholder">sem<br>imagem</div>'}<span class="grow"><strong>${esc(e.name_pt)}</strong><br><span class="muted small">${esc(e.equipment)}</span></span><span class="pill accent">+ adicionar</span></button></li>`).join('');
  };

  const itemsHtml = () => state.items.map((it, i) => `
    <div class="card" data-item="${i}" style="padding:12px">
      <div class="row between"><strong>${i + 1}. ${esc(exercise(it.exercise_id).name_pt)}</strong>
        <span class="row"><button type="button" class="icon-btn" data-move="-1" aria-label="Subir">↑</button><button type="button" class="icon-btn" data-move="1" aria-label="Descer">↓</button><button type="button" class="icon-btn" data-remove aria-label="Remover">✕</button></span></div>
      <div class="row gap" style="margin-top:8px">
        <label class="field grow"><span>Séries</span><input type="number" inputmode="numeric" data-f="sets" value="${it.sets}" min="1" max="10"></label>
        <label class="field grow"><span>Reps mín</span><input type="number" inputmode="numeric" data-f="rep_min" value="${it.rep_min}"></label>
        <label class="field grow"><span>Reps máx</span><input type="number" inputmode="numeric" data-f="rep_max" value="${it.rep_max}"></label>
        <label class="field grow"><span>Descanso (s)</span><input type="number" inputmode="numeric" data-f="rest_seconds" value="${it.rest_seconds}"></label>
      </div>
      <input type="text" data-f="notes" value="${esc(it.notes)}" placeholder="Observação (opcional)">
    </div>`).join('');

  const draw = () => {
    view.innerHTML = `
      <div class="hero"><div><div class="date">Projeto K</div><h1>Monte um treino para ${esc(owner)}</h1>
      <p class="muted small">Escolha os exercícios, séries, repetições e descanso. Só aparecem aparelhos comuns de academia e nenhuma variação de agachamento.</p></div></div>
      <div class="card">
        <label class="field"><span>Seu nome</span><input type="text" data-top="author" value="${esc(state.author)}" placeholder="ex.: Ana"></label>
        <label class="field"><span>Nome do treino</span><input type="text" data-top="session_name" value="${esc(state.session_name)}"></label>
        <label class="field"><span>Recado (opcional)</span><textarea data-top="notes">${esc(state.notes)}</textarea></label>
      </div>
      <div class="section"><div class="section-title">Treino (${state.items.length})</div>${itemsHtml() || '<p class="muted">Nenhum exercício ainda. Adicione abaixo.</p>'}</div>
      <div class="section"><div class="section-title">Adicionar exercícios</div>
        <div class="card">
          <input type="search" data-search placeholder="Buscar por nome…" value="${esc(state.search)}" style="width:100%;min-height:44px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:8px 12px;font-size:16px">
          <div class="chips" style="margin-top:10px">${GROUPS.map((g) => `<button type="button" class="chip" data-group="${g}" aria-pressed="${!state.search && state.group === g}">${g}</button>`).join('')}</div>
          <ul class="list" data-picker style="margin-top:8px">${pickerHtml()}</ul>
        </div>
      </div>
      <button class="btn primary big block" data-send style="margin-top:16px" ${state.items.length ? '' : 'disabled'}>Enviar treino</button>
      <div data-result></div>`;
  };
  draw();

  view.oninput = (e) => {
    const t = e.target;
    if (t.dataset.top) state[t.dataset.top] = t.value;
    if (t.dataset.f) state.items[Number(t.closest('[data-item]').dataset.item)][t.dataset.f] = t.dataset.f === 'notes' ? t.value : Number(t.value);
    if (t.matches('[data-search]')) {
      state.search = t.value;
      view.querySelector('[data-picker]').innerHTML = pickerHtml();
    }
  };

  view.onclick = async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const ex = exercise(add.dataset.add);
      const lower = ['quadríceps', 'posteriores', 'glúteos'].includes(ex.muscle_group);
      state.items.push({ exercise_id: ex.id, sets: 3, rep_min: lower ? 10 : 8, rep_max: lower ? 15 : 12, rest_seconds: lower ? 120 : 90, notes: '' });
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
      toast(`${esc(ex.name_pt)} adicionado`, { ms: 1200 });
      return;
    }
    const group = e.target.closest('[data-group]');
    if (group) {
      state.group = group.dataset.group;
      state.search = '';
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
      return;
    }
    const item = e.target.closest('[data-item]');
    if (item && e.target.closest('[data-remove]')) {
      state.items.splice(Number(item.dataset.item), 1);
      draw();
      return;
    }
    const move = e.target.closest('[data-move]');
    if (item && move) {
      const i = Number(item.dataset.item);
      const j = i + Number(move.dataset.move);
      if (j >= 0 && j < state.items.length) [state.items[i], state.items[j]] = [state.items[j], state.items[i]];
      draw();
      return;
    }
    if (e.target.closest('[data-send]')) {
      if (!state.author.trim()) { toast('Escreva seu nome'); return; }
      await send(view, config, state);
    }
  };
}

async function send(view, config, state) {
  const payload = sanitizePayload({ author: state.author, session_name: state.session_name, notes: state.notes, exercises: state.items });
  const planB = `${location.origin}${location.pathname}#/importar?w=${await packJson(payload)}`;
  let sent = false;
  if (config.u && config.t) {
    try {
      await api('suggest', { author: payload.author, payload_json: JSON.stringify(payload) }, { url: config.u, token: config.t });
      sent = true;
    } catch { /* fall back to Plan B below */ }
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Montei um treino pra você no Projeto K: ${planB}`)}`;
  view.querySelector('[data-send]').hidden = true;
  view.querySelector('[data-result]').innerHTML = `
    <div class="card" style="margin-top:16px">
      <h2>${sent ? 'Treino enviado! ✅' : 'Treino pronto'}</h2>
      <p class="muted">${sent ? 'Ele já vai aparecer no app. Se quiser, mande também o link abaixo como backup.' : 'Mande este link pelo WhatsApp; ao abrir, o treino é importado.'}</p>
      <a class="btn primary block" href="${wa}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
      <textarea readonly style="margin-top:8px">${esc(planB)}</textarea>
    </div>`;
  window.scrollTo(0, document.body.scrollHeight);
}

export async function renderImport(view, query) {
  let payload;
  try {
    payload = sanitizePayload(await unpackJson(query.get('w') || ''));
  } catch {
    view.innerHTML = '<div class="card"><h2>Link inválido</h2><p class="muted">Peça para o amigo gerar o link de novo.</p></div>';
    return;
  }
  view.innerHTML = `
    <div class="card"><h2>Treino de ${esc(payload.author)}</h2>
      <p class="muted">${esc(payload.session_name)} · ${payload.exercises.length} exercícios</p>
      <button class="btn primary block" data-import>Ver e aceitar</button>
      <a class="btn ghost block" href="#/hoje" style="margin-top:8px">Agora não</a></div>`;
  view.onclick = async (e) => {
    if (!e.target.closest('[data-import]')) return;
    const sug = await addLocalSuggestion(payload);
    openSuggestion(sug.id, () => { location.hash = '#/hoje'; });
  };
}
