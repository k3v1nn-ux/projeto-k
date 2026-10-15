// Trophies (bronze/silver/gold/platinum). Progress is derived from the data; once
// unlocked a trophy is stored in the "achievements" table and never taken back.
import * as db from './db.js';
import { snapshot } from './stats.js';
import { toast } from './ui.js';
import { debounce, esc } from './util.js';

export const TIERS = { bronze: 'Bronze', silver: 'Prata', gold: 'Ouro', platinum: 'Platina' };

export const ACHIEVEMENTS = [
  { id: 'first_workout', tier: 'bronze', title: 'Primeiro treino', desc: 'Registre seu primeiro treino.', target: 1, value: (s) => s.totalWorkouts },
  { id: 'streak_3', tier: 'bronze', title: 'Três seguidos', desc: '3 dias planejados seguidos sem faltar (descanso não quebra).', target: 3, value: (s) => s.streakRecord },
  { id: 'first_pr', tier: 'bronze', title: 'Primeiro recorde', desc: 'Bata um recorde pessoal de carga ou de 1RM estimado.', target: 1, value: (s) => s.prCount },
  { id: 'workouts_10', tier: 'bronze', title: '10 treinos', desc: 'Complete 10 treinos (musculação ou cardio).', target: 10, value: (s) => s.totalWorkouts },
  { id: 'health_link', tier: 'bronze', title: 'Relógio conectado', desc: 'Importe dados do Apple Saúde (Zepp) pela primeira vez.', target: 1, value: (s) => s.healthDays },
  { id: 'friend_workout', tier: 'bronze', title: 'Treino em dupla', desc: 'Aceite um treino montado por um amigo.', target: 1, value: (s) => s.acceptedSuggestions },
  { id: 'perfect_week', tier: 'silver', title: 'Semana perfeita', desc: 'Cumpra 100% dos dias planejados de uma semana (seg–dom).', target: 1, value: (s) => s.perfectWeeks },
  { id: 'streak_10', tier: 'silver', title: 'Dez seguidos', desc: '10 dias planejados seguidos sem faltar.', target: 10, value: (s) => s.streakRecord },
  { id: 'cardio_300', tier: 'silver', title: '300 minutos de cardio', desc: 'Acumule 300 min de cardio no mesmo mês.', target: 300, value: (s) => s.bestCardioMonth },
  { id: 'legpress_20', tier: 'silver', title: 'Leg press +20%', desc: 'Suba 20% a carga do leg press em relação ao primeiro registro.', target: 20, value: (s) => s.legPressGainPct, unit: '%' },
  { id: 'workouts_50', tier: 'silver', title: '50 treinos', desc: 'Complete 50 treinos.', target: 50, value: (s) => s.totalWorkouts },
  { id: 'adherence_4w', tier: 'gold', title: 'Um mês de constância', desc: '4 semanas com aderência ≥ 80%.', target: 4, value: (s) => s.weeks80 },
  { id: 'intermediate_unlocked', tier: 'gold', title: 'Nível Intermediário', desc: '8 semanas com aderência ≥ 80% desbloqueiam o treino Intermediário.', target: 8, value: (s) => s.weeks80 },
  { id: 'workouts_100', tier: 'gold', title: '100 treinos', desc: 'Complete 100 treinos.', target: 100, value: (s) => s.totalWorkouts },
];

const PLATINUM = { id: 'platinum', tier: 'platinum', title: 'Platina', desc: 'Desbloqueie todos os outros troféus.', target: ACHIEVEMENTS.length };

export function isUnlocked(id) {
  return Boolean(db.get('achievements', id));
}

/** [{...def, value, unlocked, unlocked_at}] including platinum. */
export function trophyList() {
  const s = snapshot();
  const list = ACHIEVEMENTS.map((a) => {
    const row = db.get('achievements', a.id);
    return { ...a, value: Math.max(0, Math.min(a.target, a.value(s) || 0)), unlocked: Boolean(row), unlocked_at: row?.unlocked_at };
  });
  const done = list.filter((a) => a.unlocked).length;
  const p = db.get('achievements', PLATINUM.id);
  list.push({ ...PLATINUM, value: done, unlocked: Boolean(p), unlocked_at: p?.unlocked_at });
  return list;
}

export function trophyIcon(tier) {
  return `<svg class="ico tier-${tier}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="currentColor" opacity=".16" stroke="none"/><path d="M16 12h16v8a8 8 0 0 1-16 0z" fill="currentColor" stroke="currentColor"/><path d="M16 14h-4a4 4 0 0 0 4 6M32 14h4a4 4 0 0 1-4 6M24 28v6M18 37h12" stroke="currentColor" stroke-width="2.4"/></svg>`;
}

async function check() {
  const list = trophyList();
  const now = new Date().toISOString();
  const fresh = list.filter((a) => a.id !== PLATINUM.id && !a.unlocked && a.value >= a.target);
  const allDone = list.filter((a) => a.id !== PLATINUM.id).every((a) => a.unlocked || fresh.includes(a));
  if (allDone && !list.find((a) => a.id === PLATINUM.id).unlocked) fresh.push(list.find((a) => a.id === PLATINUM.id));
  if (!fresh.length) return;
  await db.save('achievements', fresh.map((a) => ({ id: a.id, unlocked_at: now })));
  if (fresh.length > 3) {
    toast(`${trophyIcon('gold').replace('class="ico', 'class="trophy-ico')}<div><div class="tiny">${fresh.length} troféus desbloqueados</div><div>${fresh.map((a) => esc(a.title)).join(' · ')}</div></div>`, { kind: 'trophy', ms: 5000 });
    return;
  }
  fresh.forEach((a, i) => setTimeout(() => {
    toast(`${trophyIcon(a.tier).replace('class="ico', 'class="trophy-ico')}<div><div class="tiny">Troféu ${TIERS[a.tier]} desbloqueado</div><div>${esc(a.title)}</div>${a.id === 'intermediate_unlocked' ? '<div class="tiny">Ative em Ajustes → Nível</div>' : ''}</div>`, { kind: 'trophy', ms: 4500 });
    navigator.vibrate?.([80, 60, 80]);
  }, i * 900));
}

export const afterDataChange = debounce(() => { check().catch(console.error); }, 600);
