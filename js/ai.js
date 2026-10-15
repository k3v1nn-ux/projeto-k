// AI progress analysis with Claude (official Anthropic SDK, loaded on demand in the browser).
// The API key is the user's own and stays in this device's localStorage.
import * as db from './db.js';
import { settings } from './settings.js';
import { exercise, getProgram, weeklyTarget, sessionSlot } from './program.js';
import {
  allWeeks, totals, strengthTable, volumeByGroup, profile, bodyLogs, age, bmi, liftSessions, cardioMinutes, slotBalance,
} from './stats.js';
import { dateKey, addDays, uuid, nowIso } from './util.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
export const AI_MODEL = 'claude-opus-5-5';

const SYSTEM = `Você é um treinador de força e hipertrofia baseado em evidências, analisando os dados de treino de um aluno que usa o app Projeto K numa academia Smart Fit.
Escreva em português do Brasil, direto e motivador, sem enrolação. Use os números fornecidos; não invente dados que não estão no resumo. Se faltar informação (ex.: peso não registrado), diga o que registrar.
Respeite as preferências do aluno: ele não faz nenhuma variação de agachamento; só sugira equipamentos comuns de academia.
Estruture em Markdown com estas seções curtas:
## Resumo
## O que está funcionando
## Pontos de atenção
## Próximas 2 semanas (3 a 5 ações concretas: cargas, séries, exercícios, frequência, sono/alimentação)
## Corpo e composição (só se houver dados de peso/medidas)
Sem avisos médicos genéricos longos; uma linha basta se algo exigir profissional.`;

/** Compact, number-only summary of the user's data for the prompt. */
export function buildSummary(today = dateKey()) {
  const p = profile();
  const weeks = allWeeks(today).slice(-12);
  const strength = strengthTable().slice(0, 20).map((r) => ({
    exercicio: r.ex.name_pt, grupo: r.ex.muscle_group, sessoes: r.sessions, melhor_1rm_kg: Math.round(r.best * 10) / 10,
    maior_carga_kg: r.top, variacao_1rm_pct: r.changePct, tendencia: r.trend, ultimo_treino: r.last,
  }));
  const vol = volumeByGroup(addDays(today, -13), today);
  const lifts = liftSessions();
  const health = db.all('health_imports').filter((h) => h.date > addDays(today, -30));
  const avg = (k) => {
    const v = health.map((h) => h[k]).filter((x) => x > 0);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const t = totals();
  return {
    hoje: today,
    perfil: {
      nome: p.name || null, idade: age(p.birth_date, today), sexo: p.sex || null, altura_cm: p.height_cm || null,
      objetivo: p.goal || null, experiencia: p.experience || null, observacoes: p.notes || null, imc: bmi(),
    },
    programa: {
      nivel: settings().level, meta_treinos_semana: weeklyTarget(), divisao: 'Rodízio Superior A / Inferior A / Superior B / Inferior B',
      inicio: settings().startDate, regras: getProgram().rules.double_progression.rule,
    },
    totais: { treinos: t.workouts, series: t.sets, volume_total_kg: Math.round(t.tonnage), duracao_media_min: t.avgDuration, cardio_min_total: t.cardioMinutes },
    semanas: weeks.map((w) => ({ inicio: w.start, treinos: w.lifts, meta: w.target, dias_so_cardio: w.cardio })),
    ultimos_treinos: lifts.slice(-10).map((s) => ({
      data: s.date, treino: s.planned_session, rodizio: sessionSlot(s), status: s.status, duracao_min: s.duration_min,
      series: (db.index('set_logs', 'session_id').get(s.id) || []).length,
    })),
    forca_por_exercicio: strength,
    series_ultimas_2_semanas_por_grupo: Object.fromEntries(Object.entries(vol).map(([g, v]) => [g, v.sets])),
    equilibrio_rodizio_28_dias: slotBalance(28, today),
    cardio_min_ultimos_7_dias: cardioMinutes(addDays(today, -6), today),
    peso: bodyLogs().slice(-12).map((b) => ({ data: b.date, kg: b.weight_kg, gordura_pct: b.body_fat_pct || null, cintura_cm: b.waist_cm || null })),
    relogio_30_dias: health.length ? { fc_repouso: avg('resting_hr'), passos: avg('steps'), sono_h: avg('sleep_h'), kcal_ativas: avg('active_kcal') } : null,
    exercicios_indisponiveis: settings().unavailable.map((id) => exercise(id)?.name_pt).filter(Boolean),
  };
}

/**
 * Streams an analysis. onText receives the text so far. Resolves to the saved ai_reports row.
 * Refusal fallback is enabled server-side ("default" routing) so a declined request is retried
 * on a fallback model inside the same call.
 */
export async function analyze({ onText, question = '' } = {}) {
  const apiKey = settings().anthropicKey;
  if (!apiKey) throw new Error('Informe sua chave da API da Anthropic primeiro.');
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const summary = buildSummary();
  const userText = `Dados do aluno (JSON):\n${JSON.stringify(summary)}\n\n${question ? `Pergunta específica do aluno: ${question}` : 'Faça a análise de progresso completa.'}`;

  const stream = client.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: userText }],
  });
  let text = '';
  stream.on('text', (delta) => {
    text += delta;
    onText?.(text);
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('A análise foi recusada pelo modelo. Tente reformular a pergunta.');
  }
  const finalText = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('') || text;
  return db.save('ai_reports', { id: uuid(), created_at: nowIso(), model: message.model || AI_MODEL, text: finalText });
}

/** Minimal, safe Markdown → HTML (headings, bold, lists, paragraphs). */
export function renderMarkdown(md) {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  const out = [];
  let list = false;
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*]\s+(.*)/) || line.match(/^\s*\d+\.\s+(.*)/);
    if (li) {
      if (!list) { out.push('<ul>'); list = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (list) { out.push('</ul>'); list = false; }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) out.push(`<h3>${inline(h[2])}</h3>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}
