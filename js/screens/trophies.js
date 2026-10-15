// "Troféus": PSN/Steam-style list, locked ones in gray with progress.
import { trophyList, trophyIcon, TIERS } from '../achievements.js';
import { esc, fmtDay, dateKey } from '../util.js';

const ORDER = ['platinum', 'gold', 'silver', 'bronze'];

export function render(view) {
  const list = trophyList();
  const unlocked = list.filter((a) => a.unlocked);
  const count = (tier) => `${list.filter((a) => a.tier === tier && a.unlocked).length}/${list.filter((a) => a.tier === tier).length}`;
  const sorted = [...list].sort((a, b) => (b.unlocked - a.unlocked) || ORDER.indexOf(a.tier) - ORDER.indexOf(b.tier));
  view.innerHTML = `
    <h1>Troféus</h1>
    <p class="muted">${unlocked.length} de ${list.length} desbloqueados</p>
    <div class="row gap wrap" style="margin-bottom:14px">
      ${ORDER.map((t) => `<span class="pill"><span class="tier-${t}">●</span> ${TIERS[t]} ${count(t)}</span>`).join('')}
    </div>
    <div class="trophies">
      ${sorted.map((a) => `
        <div class="card trophy ${a.unlocked ? '' : 'locked'}">
          ${trophyIcon(a.tier)}
          <div class="grow">
            <div class="row between"><strong>${esc(a.title)}</strong><span class="tiny tier-${a.tier}">${TIERS[a.tier]}</span></div>
            <div class="small muted">${esc(a.desc)}</div>
            ${a.unlocked
              ? `<div class="tiny muted" style="margin-top:4px">Desbloqueado em ${fmtDay(dateKey(new Date(a.unlocked_at)), { weekday: false })}</div>`
              : `<div class="bar"><i style="width:${Math.round((a.value / a.target) * 100)}%"></i></div><div class="tiny muted" style="margin-top:3px">${a.value}${a.unit || ''}/${a.target}${a.unit || ''}</div>`}
          </div>
        </div>`).join('')}
    </div>`;
}
