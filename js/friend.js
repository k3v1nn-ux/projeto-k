// Workouts built by a friend: share link, pending suggestions, accept/reject.
import * as db from './db.js';
import { exercise, safeJson, baseDayPlan } from './program.js';
import { settings, updateSettings, isConfigured } from './settings.js';
import { api } from './sync.js';
import { sheet, toast } from './ui.js';
import { esc, dateKey, fmtDay, randomToken, packJson, uuid, nowIso, addDays } from './util.js';

export function pendingSuggestions() {
  return db.all('suggestions').filter((s) => s.status === 'pending').sort((a, b) => String(a.created_at).localeCompare(b.created_at));
}

/** Keeps only known exercises and sane numbers. */
export function sanitizePayload(p) {
  const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || d));
  return {
    author: String(p?.author || 'Amigo').slice(0, 40),
    session_name: String(p?.session_name || 'Treino do amigo').slice(0, 60),
    notes: String(p?.notes || '').slice(0, 500),
    exercises: (Array.isArray(p?.exercises) ? p.exercises : []).filter((it) => exercise(it.exercise_id)).slice(0, 15).map((it) => {
      const rmin = clamp(it.rep_min, 1, 50, 8);
      return {
        exercise_id: it.exercise_id, sets: clamp(it.sets, 1, 10, 3), rep_min: rmin,
        rep_max: Math.max(rmin, clamp(it.rep_max, 1, 50, 12)), rest_seconds: clamp(it.rest_seconds, 15, 600, 90),
        notes: String(it.notes || '').slice(0, 200),
      };
    }),
  };
}

export async function addLocalSuggestion(payload) {
  const clean = sanitizePayload(payload);
  return db.save('suggestions', { id: uuid(), author: clean.author, created_at: nowIso(), payload_json: JSON.stringify(clean), status: 'pending', target_date: '' });
}

function defaultDate() {
  // Today if it is a training day without a finished session, otherwise the next lifting day.
  for (let i = 0; i < 8; i++) {
    const d = addDays(dateKey(), i);
    const s = db.get('sessions', d);
    if (baseDayPlan(d).type === 'lift' && !(s && ['done', 'partial'].includes(s.status))) return d;
  }
  return dateKey();
}

export function openSuggestion(id, onDone) {
  const sug = db.get('suggestions', id);
  if (!sug) return;
  const p = sanitizePayload({ ...(safeJson(sug.payload_json) || {}), author: sug.author });
  const s = sheet(`
    <h3>Treino de ${esc(p.author)}</h3>
    <p class="muted small">${esc(p.session_name)}${p.notes ? ` · “${esc(p.notes)}”` : ''}</p>
    <ul class="list">${p.exercises.map((it) => `<li style="padding:8px 0"><strong>${esc(exercise(it.exercise_id).name_pt)}</strong><br><span class="muted small">${it.sets} × ${it.rep_min}–${it.rep_max} · descanso ${it.rest_seconds}s${it.notes ? ` · ${esc(it.notes)}` : ''}</span></li>`).join('') || '<li class="muted">Sem exercícios válidos.</li>'}</ul>
    <label class="field" style="margin-top:10px"><span>Usar como treino de qual dia?</span><input type="date" name="target" value="${defaultDate()}" min="${dateKey()}"></label>
    <div class="row gap"><button class="btn ghost grow" data-reject>Recusar</button><button class="btn primary grow" data-accept ${p.exercises.length ? '' : 'disabled'}>Aceitar</button></div>`);
  s.el.querySelector('[data-accept]').onclick = async () => {
    const date = s.el.querySelector('[name=target]').value || dateKey();
    await db.save('overrides', { id: date, date, suggestion_id: sug.id, session_name: `${p.session_name} (${p.author})`, payload_json: JSON.stringify(p) });
    await db.save('suggestions', { ...sug, status: 'accepted', target_date: date });
    s.close();
    toast(`Treino de ${esc(p.author)} agendado para ${fmtDay(date)}`);
    onDone?.();
  };
  s.el.querySelector('[data-reject]').onclick = async () => {
    await db.save('suggestions', { ...sug, status: 'rejected' });
    s.close();
    onDone?.();
  };
}

/* ---------- settings section ---------- */

export function friendSettingsHtml() {
  const s = settings();
  const overrides = db.all('overrides').filter((o) => o.date >= dateKey());
  return `
    <div class="card">
      <label class="field"><span>Seu nome (aparece para o amigo)</span><input type="text" name="ownerName" value="${esc(s.ownerName)}" placeholder="ex.: Kevin"></label>
      <button class="btn block" data-action="friend-link">Gerar link para o amigo</button>
      <p class="muted small" style="margin-top:8px">${isConfigured()
        ? 'O amigo monta o treino e envia direto para a sua planilha (com um token que só permite enviar sugestões). Também recebe um link de backup para mandar no WhatsApp.'
        : 'Sem planilha configurada: o amigo monta o treino e te manda um link pelo WhatsApp, que você abre aqui para importar.'}</p>
      <textarea readonly data-friend-out hidden style="margin-top:8px"></textarea>
      ${overrides.length ? `<div class="section-title" style="margin-top:12px">Treinos de amigos agendados</div><ul class="list">${overrides.map((o) => `<li class="row between" style="padding:8px 0"><span>${esc(o.session_name)}<br><span class="tiny muted">${fmtDay(o.date)}</span></span><button class="link-btn" data-del-override="${o.id}">remover</button></li>`).join('')}</ul>` : ''}
    </div>`;
}

export function bindFriendSettings(view, rerender) {
  // The view element is reused across screens: attach these listeners only once.
  if (view.dataset.friendBound) return;
  view.dataset.friendBound = '1';
  view.addEventListener('change', (e) => {
    if (e.target.name === 'ownerName') updateSettings({ ownerName: e.target.value.trim() });
  });
  view.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-override]');
    if (del) {
      await db.remove('overrides', del.dataset.delOverride);
      rerender();
      return;
    }
    if (!e.target.closest('[data-action=friend-link]')) return;
    const s = settings();
    const config = { n: s.ownerName || '' };
    if (isConfigured()) {
      let token = s.suggestToken;
      try {
        if (!token) {
          token = randomToken(12);
          await api('set_suggest_token', { suggest_token: token });
          updateSettings({ suggestToken: token });
        }
        Object.assign(config, { u: s.apiUrl, t: token });
      } catch (err) {
        toast(`Sem conexão com a planilha; o link usará só o Plano B. (${esc(err.message)})`, { ms: 4500 });
      }
    }
    const link = `${location.origin}${location.pathname}#/amigo?c=${await packJson(config)}`;
    const out = view.querySelector('[data-friend-out]');
    out.hidden = false;
    out.value = link;
    out.select();
    if (navigator.share) {
      navigator.share({ title: 'Monte um treino pra mim', text: 'Monte um treino pra mim no Projeto K:', url: link }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(link).then(() => toast('Link copiado'), () => {});
    }
  });
}
