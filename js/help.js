// Floating help bubble (same pattern as FinanceOS's HelpAssistant): category → question → answer,
// static content, no network. Opens on the category of the current screen.
import { $, esc } from './util.js';

const HELP = [
  { id: 'inicio', emoji: '🏠', label: 'Início', description: 'O painel com o resumo de tudo', items: [
    ['O que aparece no Início?', 'Cartões com o resumo das outras abas: treino de hoje, semana, música, números da semana, recomendações, evolução de força, peso, relógio, troféus e treinos recebidos. Toque em um cartão para abrir a aba dele.'],
    ['Como escolho os cartões?', 'Toque em "Personalizar início" (ou no ícone ao lado do título). Ligue ou desligue cada cartão e use as setas para mudar a ordem.'],
  ] },
  { id: 'treino', emoji: '🏋️', label: 'Treino', description: 'Registrar séries, descanso e troca de aparelho', items: [
    ['Como registro uma série?', 'A carga e as repetições já vêm sugeridas. Se fez igual, é só tocar no ✓. Se mudou, ajuste com − e + (a carga anda de 1 em 1 kg) antes de tocar no ✓. O descanso começa sozinho.'],
    ['Como adiciono ou apago uma série?', 'Toque em "＋ Adicionar série" embaixo das séries do exercício. Para apagar, arraste a série para a esquerda e solte.'],
    ['O aparelho está ocupado. E agora?', 'Abra o exercício e toque em "Trocar". Escolha uma alternativa; séries, repetições e descanso continuam iguais. Se a sua unidade não tem o aparelho, marque "não existe na minha unidade" para trocar sempre.'],
    ['O que aparece na tela bloqueada?', 'Ligue em Perfil → Configurar treino → Avisos na tela bloqueada. Ao iniciar o treino e a cada descanso chega um aviso como "Descanso até 18:42 · próximo: Supino". O relógio "Treino 0:45" no topo do app é o tempo desde que você iniciou o treino.'],
    ['Como avalio o treino?', 'Ao finalizar, escolha um emoji de 😫 a 🤩. Se fechar sem avaliar, toque em "Avaliar treino" no topo do treino concluído.'],
    ['O que é 3×12 e quando a carga sobe?', 'No nível Base cada exercício é 3 séries de até 12 repetições (4×12 no Avançado). Quando você faz 12 repetições em todas as séries, o app sugere subir a carga no próximo treino.'],
    ['Posso fazer outro treino hoje?', 'Sim. Toque em "Trocar treino". O app sempre sugere o treino feito há mais tempo, então nenhum grupo muscular fica para trás.'],
    ['Onde configuro o treino?', 'Perfil → Configurar treino: nível (3×12 ou 4×12), meta da semana, dias de descanso, descanso entre séries, cardio de aquecimento, horário da academia, avisos na tela bloqueada e aparelhos que a sua unidade não tem (com fotos).'],
    ['E se eu só fizer cardio?', 'Toque em "Só cardio" e registre os minutos. Os exercícios ficam como não feitos e o treino continua pendente para o próximo dia.'],
  ] },
  { id: 'semana', emoji: '📅', label: 'Semana', description: 'Meta semanal, descanso e rodízio', items: [
    ['Como funciona a meta da semana?', 'A meta é de 4 treinos por semana (dá para mudar em Perfil → Configurar treino). Não existe falta por dia: o que conta é bater a meta da semana.'],
    ['Como marco um dia de descanso?', 'Toque no dia na aba Semana (ou em "Descansar hoje" no Treino). O treino daquele dia passa para o próximo dia livre.'],
    ['Por que a Smart Fit aparece com horário?', 'Aos sábados a academia fecha às 19h e aos domingos às 15h. O app avisa quanto tempo falta nesses dias.'],
  ] },
  { id: 'progresso', emoji: '📈', label: 'Progresso', description: 'Força, corpo, relógio e análise com IA', items: [
    ['O que é o 1RM estimado?', 'É uma estimativa da carga máxima para 1 repetição, calculada pela fórmula de Epley a partir da carga e das repetições. Serve para comparar sua força ao longo do tempo.'],
    ['O que mostra a linha do tempo da evolução?', 'Cada vez que um exercício teve mais séries, mais carga ou mais repetições do que na vez anterior.'],
    ['Como funciona a análise com IA?', 'Em Perfil → Análise com IA, cole sua chave da API da Anthropic. O app envia um resumo numérico dos seus treinos e mostra uma análise com recomendações.'],
  ] },
  { id: 'musica', emoji: '🎵', label: 'Música', description: 'Spotify, YouTube e outros apps', items: [
    ['Posso usar YouTube ou outro app?', 'Sim: na aba Música há atalhos para abrir Spotify, YouTube Music, YouTube, Apple Music e Deezer. Para pausar ou pular, use a tela bloqueada ou a Central de Controle do iPhone, que controlam qualquer app.'],
    ['Por que só o Spotify aparece com capa e controles dentro do app?', 'O iPhone não deixa um app da web ler o que outros apps estão tocando. O Spotify tem uma API própria; por isso dá para controlá-lo daqui (precisa de Premium).'],
  ] },
  { id: 'mais', emoji: '⚙️', label: 'Perfil e ajustes', description: 'Perfil, cores, backup e reinstalação', items: [
    ['Como troco as cores do app?', 'Perfil → Ajustes → Aparência. Escolha o modo (claro/escuro) e uma das cores, ou um tema "Preto +" (fundo preto com uma cor de destaque). A troca é na hora.'],
    ['Como troco meu avatar?', 'Perfil → Meus dados e medidas. Escolha uma das ilustrações ou toque na câmera para usar uma foto.'],
    ['Vou reinstalar o app. Perco tudo?', 'Não. Antes, salve seu acesso em Ajustes → Reinstalar sem perder nada → Salvar no iCloud. Depois de reinstalar, toque no campo de acesso, confirme com Face ID e tudo volta.'],
    ['Preciso reinstalar para atualizar?', 'Não. O app se atualiza sozinho quando você abre. Só é preciso reinstalar quando o ícone ou o nome mudam.'],
  ] },
  { id: 'saude', emoji: '⌚', label: 'Relógio e Saúde', description: 'Dados do Zepp pelo app Saúde', items: [
    ['Como trago os dados do relógio?', 'Instale o Atalho em Perfil → Atalho do Saúde e rode-o uma vez. Ele lê passos, calorias e frequência cardíaca do app Saúde (onde o Zepp grava) e envia para o app.'],
    ['Rodei o Atalho e nada apareceu.', 'A notificação do Atalho mostra a resposta. Se aparecer erro, confira o endereço e o token dentro do Atalho. Em Ajustes → Diagnóstico dá para ver se a chamada chegou.'],
  ] },
];

const ROUTE_CATEGORY = { inicio: 'inicio', hoje: 'treino', dia: 'treino', ex: 'treino', semana: 'semana', progresso: 'progresso', musica: 'musica', mais: 'mais', perfil: 'mais', config: 'mais', conquistas: 'mais', recebidos: 'mais', programa: 'mais', ia: 'progresso', 'treino-config': 'treino' };
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6V14"/><path d="M12 17.2v.1"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

let state = { stage: 'closed', cat: null, item: null };

function current() {
  const name = (location.hash.replace(/^#\/?/, '') || 'inicio').split(/[/?]/)[0];
  return HELP.find((c) => c.id === ROUTE_CATEGORY[name]) || null;
}

function draw() {
  const host = $('#help');
  const open = state.stage !== 'closed';
  const title = state.stage === 'categories' ? 'Como posso ajudar?' : state.stage === 'items' ? state.cat.label : state.item?.[0] || '';
  let body = '';
  if (state.stage === 'categories') {
    const here = current();
    const list = here ? [here, ...HELP.filter((c) => c !== here)] : HELP;
    body = `<ul class="help-list">${list.map((c) => `<li><button data-cat="${c.id}"><span class="help-emoji">${c.emoji}</span><span class="grow"><strong>${esc(c.label)}</strong>${c === here ? ' <span class="pill accent">esta tela</span>' : ''}<br><span class="li-sub">${esc(c.description)}</span></span></button></li>`).join('')}</ul>`;
  } else if (state.stage === 'items') {
    body = `<ul class="help-list">${state.cat.items.map(([q], i) => `<li><button data-item="${i}"><span class="grow">${esc(q)}</span></button></li>`).join('')}</ul>`;
  } else if (state.stage === 'answer') {
    body = `<div class="help-answer"><p class="tiny muted">${state.cat.emoji} ${esc(state.cat.label)}</p><h3>${esc(state.item[0])}</h3><p class="small">${esc(state.item[1])}</p><button class="link-btn small" data-back>← Outras perguntas sobre ${esc(state.cat.label)}</button></div>`;
  }
  host.innerHTML = `
    ${open ? `<div class="help-panel" role="dialog" aria-label="Ajuda">
      <div class="help-head">${state.stage !== 'categories' ? `<button class="icon-btn" data-back aria-label="Voltar">${BACK}</button>` : ''}<span class="grow">${esc(title)}</span><button class="icon-btn" data-close aria-label="Fechar ajuda">${CLOSE}</button></div>
      <div class="help-body">${body}</div>
      <div class="help-foot">Ajuda · Antares V3</div>
    </div>` : ''}
    <button class="help-fab" data-toggle aria-label="${open ? 'Fechar ajuda' : 'Abrir ajuda'}">${open ? CLOSE : ICON}</button>`;
}

export function initHelp() {
  const host = $('#help');
  host.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-toggle]')) state = state.stage === 'closed' ? { stage: 'categories', cat: null, item: null } : { stage: 'closed' };
    else if (t.matches('[data-close]')) state = { stage: 'closed' };
    else if (t.dataset.cat) state = { stage: 'items', cat: HELP.find((c) => c.id === t.dataset.cat), item: null };
    else if (t.dataset.item) state = { ...state, stage: 'answer', item: state.cat.items[Number(t.dataset.item)] };
    else if (t.matches('[data-back]')) state = state.stage === 'answer' ? { ...state, stage: 'items', item: null } : { stage: 'categories', cat: null, item: null };
    draw();
  });
  window.addEventListener('hashchange', () => { if (state.stage !== 'closed') { state = { stage: 'closed' }; draw(); } });
  draw();
}
