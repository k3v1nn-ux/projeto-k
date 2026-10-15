// Rule-based recommendations shown in Progresso (no AI needed): weekly progress, stalled
// exercises, low volume per muscle group, rotation balance, gaps, deload, body weight, cardio.
import * as db from './db.js';
import { exercise, slotDef, weekProjection, weeklyTarget, rotation } from './program.js';
import { strengthTable, weekAdherence, weekStreaks, slotBalance, daysSinceLastLift, volumeByGroup, cardioMinutes, bodyLogs, profile, liftSessions } from './stats.js';
import { dateKey, addDays, weekStart, daysBetween, fmtDay } from './util.js';

const BIG_GROUPS = ['peito', 'costas', 'quadríceps', 'posteriores', 'glúteos', 'ombros'];

/** [{ level: good|info|warn, icon, title, text }] most relevant first. */
export function recommendations(today = dateKey()) {
  const out = [];
  const week = weekAdherence(weekStart(today), today);
  const proj = weekProjection(today);
  const missing = Math.max(0, weeklyTarget() - week.lifts);
  const nextDay = Object.entries(proj).filter(([d, p]) => d >= today && (p.kind === 'today' || p.kind === 'planned')).sort()[0];

  if (missing === 0) {
    out.push({ level: 'good', icon: '✅', title: 'Meta da semana batida', text: `${week.lifts} treinos nesta semana. Descanse bem: recuperação também gera resultado.` });
  } else if (nextDay) {
    const name = nextDay[1].slot === 'friend' ? 'treino do amigo' : slotDef(nextDay[1].slot)?.session_name;
    out.push({ level: 'info', icon: '📅', title: `${missing > 1 ? 'Faltam' : 'Falta'} ${missing} treino${missing > 1 ? 's' : ''} nesta semana`, text: `Próximo: ${name} (${nextDay[0] === today ? 'hoje' : fmtDay(nextDay[0])}).` });
  }
  if (missing > 0 && daysBetween(today, addDays(weekStart(today), 6)) + 1 < missing) {
    out.push({ level: 'warn', icon: '⏳', title: 'Não dá mais para bater a meta', text: 'Sem problema: o treino que faltar passa para a próxima semana automaticamente. Não compense com dois treinos no mesmo dia.' });
  }

  const gap = daysSinceLastLift(today);
  if (gap !== null && gap >= 4) out.push({ level: 'warn', icon: '⏱️', title: `${gap} dias sem musculação`, text: 'Volte com cargas um pouco mais leves no primeiro treino (parando umas 3 repetições antes da falha) e retome a progressão no seguinte.' });

  for (const row of strengthTable().filter((r) => r.trend === 'stalled').slice(0, 2)) {
    const alt = row.ex.alternatives.map(exercise).find(Boolean);
    out.push({ level: 'warn', icon: '📉', title: `${row.ex.name_pt} parado há 3 treinos`, text: `Tente: +1 série, cadência mais lenta, ou reduzir ~10% da carga e reconstruir.${alt ? ` Outra opção é trocar por ${alt.name_pt} por 3–4 semanas.` : ''}` });
  }
  const rising = strengthTable().filter((r) => r.trend === 'up' && r.changePct > 0).sort((a, b) => b.changePct - a.changePct)[0];
  if (rising) out.push({ level: 'good', icon: '📈', title: `${rising.ex.name_pt}: +${rising.changePct}% no 1RM estimado`, text: 'A dupla progressão está funcionando. Continue subindo a carga quando fechar o topo da faixa.' });

  const lifts = liftSessions();
  if (lifts.length >= 4) {
    const vol = volumeByGroup(addDays(today, -13), today);
    const low = BIG_GROUPS.filter((g) => (vol[g]?.sets || 0) / 2 < 7);
    if (low.length) out.push({ level: 'info', icon: '🎯', title: `Pouco volume em ${low.slice(0, 3).join(', ')}`, text: 'Nas últimas 2 semanas ficou abaixo de ~7 séries semanais. Priorize terminar esses exercícios antes de cortar o treino.' });

    const bal = slotBalance(28, today);
    const counts = Object.values(bal);
    if (Math.max(...counts) - Math.min(...counts) >= 2) {
      const fewest = rotation().reduce((a, d) => (bal[d.slot] < bal[a.slot] ? d : a));
      out.push({ level: 'info', icon: '⚖️', title: 'Rodízio desequilibrado', text: `Nas últimas 4 semanas o ${fewest.session_name} foi o menos feito (${bal[fewest.slot]}x). O app já vai sugeri-lo antes dos outros.` });
    }
  }

  const streak = weekStreaks(today);
  if (streak.current >= 6) out.push({ level: 'info', icon: '🔋', title: `${streak.current} semanas seguidas na meta`, text: 'Considere uma semana de deload: mesmas cargas com metade das séries, para recuperar articulações e voltar mais forte.' });

  const cardio = cardioMinutes(addDays(today, -6), today);
  if (lifts.length >= 2 && cardio < 60) out.push({ level: 'info', icon: '🚴', title: `${cardio} min de cardio nos últimos 7 dias`, text: 'Os 10 min de aquecimento antes de cada treino já somam ~40 min/semana. Some uma caminhada leve para chegar a 150 min de atividade.' });

  const p = profile();
  const logs = bodyLogs();
  if (!p.name || !p.height_cm || !logs.length) {
    out.push({ level: 'info', icon: '👤', title: 'Complete seu perfil', text: 'Nome, altura e peso deixam a análise com IA e as métricas de corpo (IMC, força relativa) mais precisas.' });
  } else {
    const last = logs[logs.length - 1];
    if (daysBetween(last.date, today) > 14) out.push({ level: 'info', icon: '⚖️', title: 'Registre seu peso', text: `Último registro em ${fmtDay(last.date, { weekday: false })}. Pese-se em jejum, 1x por semana.` });
    const monthAgo = [...logs].reverse().find((b) => daysBetween(b.date, last.date) >= 21);
    if (monthAgo) {
      const diff = Math.round((last.weight_kg - monthAgo.weight_kg) * 10) / 10;
      if (/massa|recomp/i.test(p.goal || '') && diff < -1.5) out.push({ level: 'warn', icon: '🍽️', title: `Peso caiu ${Math.abs(diff)} kg em ~1 mês`, text: 'Para ganhar massa/recompor, a perda deve ser lenta ou nula. Reveja calorias e proteína (~1,6–2,2 g/kg/dia).' });
      else if (diff !== 0) out.push({ level: 'good', icon: '⚖️', title: `Peso ${diff > 0 ? '+' : ''}${diff} kg em ~1 mês`, text: 'Acompanhe junto com a força: subir carga mantendo o peso estável é sinal de recomposição.' });
    }
  }

  const sleep = db.all('health_imports').filter((h) => h.date > addDays(today, -7) && h.sleep_h > 0);
  if (sleep.length >= 3) {
    const avg = sleep.reduce((a, h) => a + h.sleep_h, 0) / sleep.length;
    if (avg < 7) out.push({ level: 'warn', icon: '😴', title: `Sono médio de ${avg.toFixed(1)} h`, text: 'Abaixo de 7 h a recuperação e o ganho de força caem. Tente dormir 30 min mais cedo.' });
  }
  return out;
}
