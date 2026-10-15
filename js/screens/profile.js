// "Perfil": name, photo (kept on this device), birth date, sex, height, goal, experience and
// current weight. Used in the greeting, body metrics and the AI analysis.
import * as db from '../db.js';
import { profile, currentWeight, bmi, age } from '../stats.js';
import { toast } from '../ui.js';
import { esc, dateKey, fmtKg } from '../util.js';
import { afterDataChange } from '../achievements.js';

const PHOTO_KEY = 'pk.photo';
const GOALS = ['Recomposição corporal', 'Ganhar massa muscular', 'Ganhar força', 'Perder gordura', 'Saúde e condicionamento'];
const EXPERIENCE = ['Iniciante (< 6 meses)', 'Iniciante com pausas', 'Intermediário (6 meses a 2 anos)', 'Avançado (> 2 anos)'];

export function photo() {
  try { return localStorage.getItem(PHOTO_KEY) || ''; } catch { return ''; }
}

export function avatarHtml(cls = '') {
  const p = profile();
  const src = photo();
  return `<span class="avatar ${cls}">${src ? `<img src="${src}" alt="">` : esc((p.name || 'K')[0].toUpperCase())}</span>`;
}

/** Resizes the picked image to a 256 px square JPEG data URL. */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function render(view) {
  const p = profile();
  const w = currentWeight();
  view.innerHTML = `
    <div class="page-head"><h1>Perfil</h1><p>Usado na saudação, nas métricas de corpo e na análise com IA.</p></div>
    <div class="card">
      <div class="profile-head">
        <label class="photo-pick" aria-label="Trocar foto">${avatarHtml('lg')}<span class="edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span><input type="file" accept="image/*" data-photo></label>
        <div class="grow"><h2 style="margin:0">${esc(p.name || 'Seu nome')}</h2>
          <div class="muted small">${[age(p.birth_date) ? `${age(p.birth_date)} anos` : '', p.height_cm ? `${p.height_cm} cm` : '', w ? `${fmtKg(w)} kg` : '', bmi() ? `IMC ${fmtKg(bmi())}` : ''].filter(Boolean).join(' · ') || 'Complete os dados abaixo'}</div>
          ${photo() ? '<button class="link-btn small" data-rmphoto>remover foto</button>' : ''}</div>
      </div>
    </div>
    <form class="card mt" data-form="profile">
      <label class="field"><span>Nome</span><input type="text" name="name" value="${esc(p.name || '')}" autocomplete="given-name"></label>
      <div class="grid2">
        <label class="field"><span>Nascimento</span><input type="date" name="birth_date" value="${esc(p.birth_date || '')}"></label>
        <label class="field"><span>Sexo</span><select name="sex"><option value="">—</option>${['masculino', 'feminino', 'outro'].map((x) => `<option ${p.sex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Altura (cm)</span><input type="number" inputmode="numeric" name="height_cm" value="${p.height_cm || ''}"></label>
        <label class="field"><span>Peso hoje (kg)</span><input type="number" step="0.1" inputmode="decimal" name="weight" value="${w ?? ''}"></label>
      </div>
      <label class="field"><span>Objetivo</span><select name="goal">${GOALS.map((g) => `<option ${p.goal === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="field"><span>Experiência</span><select name="experience">${EXPERIENCE.map((g) => `<option ${p.experience === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="field"><span>Observações (lesões, preferências, rotina)</span><textarea name="notes" placeholder="ex.: não faço agachamento por preferência">${esc(p.notes || '')}</textarea></label>
      <button class="btn primary block" type="submit">Salvar perfil</button>
    </form>
    <p class="muted tiny center mt">A foto fica só neste aparelho. Os demais dados vão para a aba <code>profile</code> da planilha; o peso vai para <code>body_logs</code> (histórico em Progresso → Corpo).</p>`;

  view.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    await db.save('profile', {
      id: 'me', name: f.name.value.trim(), birth_date: f.birth_date.value, sex: f.sex.value, height_cm: Number(f.height_cm.value) || null,
      goal: f.goal.value, experience: f.experience.value, notes: f.notes.value.trim(),
    });
    const weight = Number(String(f.weight.value).replace(',', '.'));
    if (weight > 20 && weight < 300 && weight !== currentWeight()) {
      const prev = db.get('body_logs', dateKey());
      await db.save('body_logs', { id: dateKey(), date: dateKey(), weight_kg: weight, body_fat_pct: prev?.body_fat_pct ?? null, waist_cm: prev?.waist_cm ?? null, notes: prev?.notes || '' });
    }
    toast('Perfil salvo');
    afterDataChange();
    render(view);
  };
  view.onchange = async (e) => {
    if (!e.target.matches('[data-photo]') || !e.target.files[0]) return;
    try {
      localStorage.setItem(PHOTO_KEY, await resizeImage(e.target.files[0]));
      toast('Foto atualizada');
      document.dispatchEvent(new CustomEvent('pk:profile'));
      render(view);
    } catch {
      toast('Não foi possível usar essa imagem');
    }
  };
  view.onclick = (e) => {
    if (e.target.closest('[data-rmphoto]')) {
      try { localStorage.removeItem(PHOTO_KEY); } catch { /* ignore */ }
      document.dispatchEvent(new CustomEvent('pk:profile'));
      render(view);
    }
  };
}
