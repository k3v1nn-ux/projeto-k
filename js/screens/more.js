// "Mais": profile card and links to received workouts, trophies, settings, the Health
// shortcut and program info.
import { profile, currentWeight } from '../stats.js';
import { pendingSuggestions } from '../friend.js';
import { trophyList } from '../achievements.js';
import { getProgram } from '../program.js';
import { avatarHtml } from './profile.js';
import { esc, fmtKg } from '../util.js';

const ICONS = {
  inbox: '<svg viewBox="0 0 24 24"><path d="M4 13l2.5-7h11L20 13v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
};

const item = (href, icon, color, title, sub, badge = '') => `<li><a class="list-item" href="${href}"><span class="li-ico" style="background:${color}">${ICONS[icon]}</span><span class="grow"><strong>${title}</strong><br><span class="li-sub">${sub}</span></span>${badge}<span class="li-chev">›</span></a></li>`;

export function render(view) {
  const p = profile();
  const w = currentWeight();
  const pending = pendingSuggestions().length;
  const trophies = trophyList();
  const got = trophies.filter((t) => t.unlocked).length;
  view.innerHTML = `
    <a class="card profile-head" href="#/perfil" style="text-decoration:none;color:inherit">
      ${avatarHtml('lg')}
      <div class="grow"><h2 style="margin:0">${esc(p.name || 'Complete seu perfil')}</h2><div class="muted small">${[p.goal, w ? `${fmtKg(w)} kg` : ''].filter(Boolean).join(' · ') || 'nome, foto, altura e peso'}</div></div>
      <span class="li-chev">›</span>
    </a>
    <div class="group mt"><ul class="list">
      ${item('#/recebidos', 'inbox', 'var(--series-1)', 'Treinos recebidos', 'convide amigos, aceite ou recuse', pending ? `<span class="pill danger">${pending}</span>` : '')}
      ${item('#/progresso?s=trofeus', 'trophy', 'var(--gold)', 'Troféus', `${got} de ${trophies.length} desbloqueados`)}
      ${item('#/perfil', 'user', 'var(--series-3)', 'Perfil e medidas', 'dados usados na análise com IA')}
    </ul></div>
    <div class="group mt"><ul class="list">
      ${item('shortcuts/', 'heart', 'var(--danger)', 'Atalho do Saúde (iPhone)', 'importa dados do relógio Zepp')}
      ${item('#/programa', 'book', 'var(--series-2)', 'Programa e fontes', esc(getProgram().name))}
      ${item('#/config', 'gear', 'var(--faint)', 'Ajustes', 'planilha, tema, nível, aparelhos, dados')}
    </ul></div>`;
}

export function renderProgram(view) {
  const prog = getProgram();
  const r = prog.rules;
  view.innerHTML = `
    <div class="page-head"><h1>Programa</h1><p>${esc(prog.name)}</p></div>
    <div class="card"><h3>Como funciona</h3><p class="small">${esc(r.split_rationale)}</p><p class="small">${esc(r.rotation_rule)}</p><p class="small">${esc(r.adherence_rule)}</p><p class="small">${esc(r.cardio)}</p></div>
    <div class="card mt"><h3>Progressão</h3><p class="small">${esc(r.double_progression.rule)} ${esc(r.double_progression.stall_rule)}</p><p class="small">RIR: ${esc(r.rir.base)}</p><p class="small">${esc(r.reentry_week.note)}</p><p class="small">${esc(r.intermediate_unlock.description)}</p><p class="small">${esc(r.no_squat_policy)}</p></div>
    <div class="section"><div class="section-title"><span>Fontes científicas</span></div>
      <div class="card"><ol class="tips small">${prog.sources.map((s) => `<li>${esc(s.ref)}${s.doi ? ` <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">doi</a>` : ''}<br><span class="muted">${esc(s.used_for)}</span></li>`).join('')}</ol></div></div>`;
}
