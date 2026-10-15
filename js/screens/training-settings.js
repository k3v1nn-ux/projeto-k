// "Configurar treino": every training option in one place, explained — level, weekly target,
// rest days, program start, rest between sets, warm-up cardio, gym hours, lock-screen alerts,
// squat variants and the equipment my gym does not have (picked by photo).
import { settings, updateSettings } from '../settings.js';
import { allExercises, getProgram } from '../program.js';
import { isUnlocked } from '../achievements.js';
import { enableLockNotifications, notificationsSupported } from '../notify.js';
import { toast } from '../ui.js';
import { esc } from '../util.js';

const GROUPS = ['peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'quadríceps', 'posteriores', 'glúteos', 'adutores', 'panturrilhas', 'abdômen'];
const WD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
let group = 'peito';

const seg = (name, value, options) => `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-set="${name}" data-value="${v}" aria-pressed="${String(value) === String(v)}">${l}</button>`).join('')}</div>`;

export function render(view) {
  const s = settings();
  const advancedOk = isUnlocked('intermediate_unlocked');
  const types = getProgram().cardio_types;
  const unavailable = new Set(s.unavailable);
  const exercises = allExercises().filter((e) => e.muscle_group === group && (!e.is_squat_variant || s.allowSquatVariants));
  view.innerHTML = `
    <div class="page-head"><h1>Configurar treino</h1><p>Tudo que muda o seu treino, num lugar só.</p></div>

    <div class="section"><div class="section-title"><span>Programa</span></div>
      <div class="card stack">
        <div class="opt-row"><div><strong>Nível</strong><div class="tiny muted">Séries × repetições de cada exercício</div></div>
          <div class="seg" role="group"><button type="button" data-set="level" data-value="base" aria-pressed="${s.level === 'base'}">3×12</button><button type="button" data-set="level" data-value="intermediate" aria-pressed="${s.level === 'intermediate'}" ${advancedOk ? '' : 'disabled'}>${advancedOk ? '' : '🔒 '}4×12</button></div></div>
        ${advancedOk ? '' : '<p class="tiny muted" style="margin:0">O 4×12 (Avançado) libera com 8 semanas fazendo pelo menos 3 de 4 treinos.</p>'}
        <div class="opt-row"><div><strong>Treinos por semana</strong><div class="tiny muted">Meta usada na semana e nos troféus</div></div>${seg('weeklyTarget', s.weeklyTarget, [[3, '3'], [4, '4'], [5, '5']])}</div>
        <div><strong>Dias que prefiro descansar</strong><div class="tiny muted" style="margin-bottom:8px">O app evita prever treino nesses dias</div>
          <div class="chips">${WD.map((w, i) => `<button type="button" class="chip" data-restday="${i + 1}" aria-pressed="${(s.restDays || []).includes(i + 1)}">${w}</button>`).join('')}</div></div>
        <label class="field" style="margin:0"><span>Início do programa (a 1ª semana é mais leve, para readaptar)</span><input type="date" name="startDate" value="${esc(s.startDate)}"></label>
      </div>
    </div>

    <div class="section"><div class="section-title"><span>Durante o treino</span></div>
      <div class="card stack">
        <div class="opt-row"><div><strong>Descanso entre séries</strong><div class="tiny muted">Ajuste sobre o tempo de cada exercício</div></div>${seg('restOffset', s.restOffset || 0, [[-15, '−15s'], [0, 'Padrão'], [15, '+15s'], [30, '+30s']])}</div>
        <div class="opt-row"><div><strong>Cardio de aquecimento</strong><div class="tiny muted">Tempo sugerido antes do treino</div></div>${seg('cardioMinutes', s.cardioMinutes || 10, [[5, '5'], [8, '8'], [10, '10'], [15, '15']])}</div>
        <div><strong>Aparelho de cardio preferido</strong>
          <div class="chips" style="margin-top:8px">${types.map((t) => `<button type="button" class="chip" data-cardio="${t.id}" aria-pressed="${(s.cardioType || 'esteira') === t.id}">${esc(t.name_pt.split(' (')[0])}</button>`).join('')}</div></div>
        <label class="check" style="justify-content:space-between"><span><strong>Som no fim do descanso</strong></span><input type="checkbox" name="restSound" ${s.restSound ? 'checked' : ''}></label>
        <div class="opt-row"><div><strong>Avisos na tela bloqueada</strong><div class="tiny muted">"Descanso até 18:42 · próximo: …"</div></div>
          ${s.lockNotify ? '<span class="pill success">ligado</span>' : `<button type="button" class="btn small" data-act="notify" ${notificationsSupported() ? '' : 'disabled'}>Ativar</button>`}</div>
        ${notificationsSupported() ? '' : '<p class="tiny muted" style="margin:0">Disponível no iPhone com o app adicionado à Tela de Início (iOS 16.4 ou mais novo).</p>'}
      </div>
    </div>

    <div class="section"><div class="section-title"><span>Academia</span></div>
      <div class="card stack">
        <div class="grid2">
          <label class="field" style="margin:0"><span>Sábado fecha às</span><input type="time" name="close6" value="${esc((s.gymClose || {})[6] || '')}"></label>
          <label class="field" style="margin:0"><span>Domingo fecha às</span><input type="time" name="close7" value="${esc((s.gymClose || {})[7] || '')}"></label>
        </div>
        <label class="check" style="justify-content:space-between"><span><strong>Mostrar afundo e búlgaro</strong><br><span class="tiny muted">Variações de agachamento ficam escondidas por padrão</span></span><input type="checkbox" name="allowSquatVariants" ${s.allowSquatVariants ? 'checked' : ''}></label>
      </div>
    </div>

    <div class="section"><div class="section-title"><span>Aparelhos que a minha unidade não tem</span><span>${unavailable.size}</span></div>
      <div class="card">
        <p class="tiny muted" style="margin-top:0">Toque no aparelho que não existe na sua Smart Fit: ele é trocado sozinho pela alternativa.</p>
        <div class="chips scroll">${GROUPS.map((g) => `<button type="button" class="chip" data-group="${g}" aria-pressed="${g === group}">${g}</button>`).join('')}</div>
        <div class="equip-grid mt">${exercises.map((e) => `
          <button type="button" class="equip ${unavailable.has(e.id) ? 'off' : ''}" data-equip="${e.id}" aria-pressed="${unavailable.has(e.id)}">
            ${e.media_frames?.length ? `<img src="${e.media_frames[0]}" alt="" loading="lazy">` : '<span class="equip-ph">sem foto</span>'}
            <span class="equip-name">${esc(e.name_pt)}</span>
            ${unavailable.has(e.id) ? '<span class="equip-badge">não tem</span>' : ''}
          </button>`).join('')}</div>
      </div>
    </div>
    <p class="muted tiny center" style="margin-top:20px">Antares V3</p>`;

  view.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.set) {
      const v = t.dataset.value;
      updateSettings({ [t.dataset.set]: ['level'].includes(t.dataset.set) ? v : Number(v) });
    } else if (t.dataset.restday) {
      const set = new Set(settings().restDays || []);
      const n = Number(t.dataset.restday);
      if (set.has(n)) set.delete(n); else set.add(n);
      updateSettings({ restDays: Array.from(set).sort() });
    } else if (t.dataset.cardio) {
      updateSettings({ cardioType: t.dataset.cardio });
    } else if (t.dataset.group) {
      group = t.dataset.group;
    } else if (t.dataset.equip) {
      const set = new Set(settings().unavailable);
      if (set.has(t.dataset.equip)) set.delete(t.dataset.equip); else set.add(t.dataset.equip);
      updateSettings({ unavailable: Array.from(set) });
    } else if (t.dataset.act === 'notify') {
      try {
        await enableLockNotifications();
        toast('Avisos ligados ✓');
      } catch (err) {
        toast(esc(err.message), { ms: 5000 });
      }
    } else return;
    const y = window.scrollY;
    render(view);
    window.scrollTo(0, y);
  };
  view.onchange = (e) => {
    const t = e.target;
    if (t.name === 'startDate' && t.value) updateSettings({ startDate: t.value });
    if (t.name === 'restSound') updateSettings({ restSound: t.checked });
    if (t.name === 'allowSquatVariants') { updateSettings({ allowSquatVariants: t.checked }); render(view); }
    if (t.name === 'close6' || t.name === 'close7') {
      const gc = { ...(settings().gymClose || {}) };
      const wd = t.name === 'close6' ? 6 : 7;
      if (t.value) gc[wd] = t.value; else delete gc[wd];
      updateSettings({ gymClose: gc });
    }
  };
}
