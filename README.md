# Antares V3 — treino pessoal

PWA pessoal de treino (mobile-first, offline-first) para a Smart Fit: rodízio Superior/Inferior com meta semanal, registro de séries em 1 toque, cronômetro de descanso, progressão de carga, progresso com recomendações e análise por IA (Claude), perfil e medidas, troféus, treinos montados por amigos, aba de música (Spotify) e dados do relógio (Zepp → Apple Saúde).

**App:** https://k3v1nn-ux.github.io/projeto-k/

> Antares é a supergigante vermelha do coração de Escorpião: daí o logo (estrela de quatro pontas prateada com núcleo levemente quente). O visual usa superfícies de vidro translúcido com desfoque (como o Liquid Glass do iOS) tons de **azul** por padrão (Azul, Marinho e Esmeralda, com fundo e vidro tingidos) e os temas **Preto +** (Lima, Ciano, Amarelo, Vermelho, Roxo e Preto total): fundo preto de verdade (bom para a tela OLED do iPhone), cartões em cinza escuro para dar profundidade e uma única cor de destaque, como recomendam as diretrizes de tema escuro do Material Design. Escolha em Perfil → Ajustes → Aparência.

---

## Sumário
1. [Arquitetura](#1-arquitetura)
2. [Limitações do iPhone (e como o app contorna)](#2-limitações-do-iphone-e-como-o-app-contorna)
3. [Configurar a planilha + Apps Script](#3-configurar-a-planilha--apps-script)
4. [Publicar no GitHub Pages](#4-publicar-no-github-pages)
5. [Adicionar à Tela de Início (iPhone e Mac)](#5-adicionar-à-tela-de-início-iphone-e-mac)
6. [Spotify](#6-spotify)
7. [Atalho do iOS: Zepp → Saúde → planilha](#7-atalho-do-ios-zepp--saúde--planilha)
8. [Treino montado por um amigo](#8-treino-montado-por-um-amigo)
9. [Programa de treino e fontes](#9-programa-de-treino-e-fontes)
9b. [Telas e análise com IA](#9b-telas-e-análise-com-ia)
10. [Modelo de dados](#10-modelo-de-dados)
11. [Desenvolvimento](#11-desenvolvimento)
12. [Licenças](#12-licenças)

---

## 1. Arquitetura

```
 iPhone / Mac (Safari, app na Tela de Início)
 ┌──────────────────────────────────────────────┐
 │ HTML + CSS + JS puro (ES modules, sem build) │
 │  ├─ IndexedDB: todos os registros + "outbox" │──┐  POST text/plain (sem preflight CORS)
 │  ├─ Service worker: app, programa e imagens  │  │  { action, token, ... }
 │  └─ localStorage: ajustes (URL, token, tema) │  ▼
 └──────────────────────────────────────────────┘  Google Apps Script (Web App, doPost)
                                                    │
 Atalho do iOS (Saúde/Zepp) ── POST action=health ─▶│──▶ Google Sheets (uma aba por tabela)
 Amigo (link, sem login)   ── POST action=suggest ─▶│
```

- **Offline-first:** cada série é gravada no IndexedDB e numa fila (`outbox`) **na mesma transação**. A sincronização roda ao abrir o app, ao voltar o sinal, ao voltar para o app e a cada minuto enquanto houver pendências, com espera exponencial (5 s → 5 min). Nada se perde sem internet.
- **Sincronização:** `push` envia a fila; `pull` traz o que mudou desde a última vez (pelo `synced_at` do servidor). Conflitos: vence a edição mais recente (`updated_at`), com uma exceção: uma sessão real sempre vence uma "falta" automática.
- **Vários aparelhos:** cada aparelho tem seu IndexedDB; a planilha é a fonte da verdade. Configure URL e token no iPhone e no Mac.
- **Segredos:** a URL do Web App e o token ficam só no `localStorage` do aparelho (tela Ajustes). Nada sensível está no repositório.
- **Gráficos:** Chart.js 4.4.1 (cópia local em `vendor/`, funciona offline).

Estrutura:

```
index.html, manifest.webmanifest, sw.js
css/app.css
js/app.js          roteador, cabeçalho, inicialização
js/db.js           IndexedDB + outbox
js/sync.js         sincronização com o Apps Script
js/program.js      rodízio (próximo treino, projeção da semana), trocas, reentrada
js/progression.js  dupla progressão, histórico, tendência, recordes (Epley)
js/workout.js      sessão: iniciar, registrar, cardio, descanso, finalizar
js/timer.js        descanso, som, wake lock
js/stats.js        aderência semanal, sequência, volume, corpo
js/recommend.js    recomendações por regras
js/ai.js           análise com Claude (SDK oficial carregado sob demanda)
js/achievements.js troféus
js/friend.js, js/spotify.js, js/export.js
js/screens/*.js    telas (hoje, semana, música, progresso, mais, perfil, recebidos…)
data/program.json  programa, exercícios, fontes, equipamentos
data/seed/*.csv    seed das abas exercises e plans
apps-script/Code.gs
tools/             geração de dados, imagens, ícones, servidor de dev e mock do Apps Script
```

## 2. Limitações do iPhone (e como o app contorna)

| Pedido | Realidade no iOS | Solução adotada |
|---|---|---|
| Vibrar no fim do descanso | O Safari do iOS **não tem** `navigator.vibrate` (nem no app da Tela de Início). | Aviso visual forte (barra pisca) + som. No Mac/Android, vibra. |
| Alarme do descanso com a tela bloqueada | O iOS suspende a página; não existe notificação local agendada para PWA (só Web Push, que exigiria servidor). | O cronômetro é calculado pelo relógio (volta certo ao reabrir) e o app pede **Screen Wake Lock** para a tela não apagar durante o treino. |
| Som com o Spotify tocando | Áudio da página pode pausar a música. | `navigator.audioSession.type = 'transient'` (Safari 16.4+): o bipe só abaixa a música. O som é liberado no 1º toque (exigência do iOS). Respeita a chave de silêncio. |
| Login do Spotify no app da Tela de Início | O retorno do login às vezes abre no Safari em vez do app, e os dois não compartilham armazenamento. | Se acontecer, conecte o Spotify uma vez pelo Safari normal ou tente de novo pelo app; o token é renovado sozinho depois. Sem conexão, aparece o player embutido da playlist. |
| Atalho agendado com o iPhone bloqueado | Os dados do Saúde ficam criptografados com o aparelho bloqueado. | Agende a automação num horário em que você costuma usar o celular (ex.: 21h30) ou rode o Atalho pelo botão ao finalizar o treino. |

## 3. Configurar a planilha + Apps Script

1. Abra a sua planilha do Google (a que será o banco).
2. **Extensões → Apps Script.** Apague o conteúdo de `Código.gs` e cole o arquivo [`apps-script/Code.gs`](apps-script/Code.gs). Salve.
3. No seletor de funções escolha **`initialize`** e clique em **Executar**. Autorize o acesso (é o seu próprio script). Ele cria as abas e gera o **token**.
4. Abra **Registro de execução** e copie a linha `TOKEN (cole em Configurações do app): ...`.
5. **Implantar → Nova implantação →** tipo **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa** (necessário para o app chamar sem login; o token protege os dados)
6. Copie a **URL do app da Web** (termina em `/exec`).
7. No app: **Ajustes → Planilha** → cole URL e token → **Salvar e testar**. Depois toque em **Enviar exercícios e plano para a planilha** para preencher as abas `exercises` e `plans` (ou importe `data/seed/*.csv` manualmente).
8. Repita o passo 7 no Mac.

> **Atualizou o `Code.gs`?** (a v2.1 é necessária para perfil com foto, peso, IA, diagnóstico e abas legíveis) Cole o arquivo novo, salve e use *Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar*. Assim a URL e o token continuam os mesmos.
>
> **Abas legíveis:** a v2 mantém as abas técnicas (o banco do app) e gera, a cada sincronização, **📊 Resumo** (um treino por linha, em português) e **📋 Séries** (cada série com o nome do exercício). Use essas duas para ler no Numbers/Sheets.
>
> **Diagnóstico:** Ajustes → **Diagnóstico da planilha** mostra a versão do script, quantas linhas há em cada aba e as últimas chamadas recebidas (aba `_log`). Se o Atalho do Saúde "não manda nada", é aqui que se vê se a chamada chegou e qual erro voltou.
>
> **Vazou o token?** Rode `rotateToken` no editor e cole o novo token no app.
>
> **Privacidade:** o app não precisa que a planilha esteja compartilhada por link (o script roda como você). Se ela estiver como "qualquer pessoa com o link", quem tiver o link vê seus dados de treino e saúde. Prefira compartilhar só com o e-mail do seu amigo.

## 4. Publicar no GitHub Pages

O repositório já está publicado em `https://k3v1nn-ux.github.io/projeto-k/` (Settings → Pages → branch `main`, pasta `/`). HTTPS é automático (obrigatório para PWA e para o OAuth do Spotify).

Para publicar uma mudança:
1. Aumente `VERSION` em `sw.js` (ex.: `pk-v3` → `pk-v4`). Sem isso, os aparelhos continuam com a versão em cache.
2. `git commit` e `git push`. Em ~1 min o Pages atualiza. Na próxima abertura, o app baixa a nova versão e recarrega sozinho.

## 5. Adicionar à Tela de Início (iPhone e Mac)

> **Não precisa reinstalar para atualizar:** o app baixa versões novas sozinho (feche e abra). Só é preciso apagar e adicionar de novo quando o **ícone ou o nome** mudam.
>
> **Reinstalar com Face ID (recomendado):** em **Ajustes → Reinstalar sem perder nada**, toque em **Salvar no iCloud (Keychain)** e aceite "Salvar senha". Numa instalação nova, a tela Hoje mostra "Já usava o Antares?": toque no campo, escolha o acesso salvo (Face ID) e toque em **Restaurar**.
>
> **Reinstalou? Nada se perde (alternativa manual):** o iPhone apaga os dados de um app da Tela de Início junto com o ícone. Antes de apagar, vá em **Ajustes → Reinstalar sem perder nada → Copiar meu código** e cole no app Notas. Na instalação nova, cole o código no mesmo lugar e toque em **Restaurar**: planilha, token, Spotify, chave da IA e ajustes voltam, e os treinos, o perfil e a foto são baixados da planilha. O código contém seus tokens: não compartilhe.

- **iPhone:** abra o link no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**. Abra sempre pelo ícone (tela cheia, e o iOS não apaga os dados de apps instalados).
- **Mac:** Safari → **Arquivo → Adicionar ao Dock** (macOS Sonoma+), ou Chrome → ícone de instalar na barra de endereço.

Na primeira abertura, o service worker baixa o app, o programa e todas as imagens (~3 MB) para funcionar sem internet.

## 6. Spotify

Controle remoto do app oficial do Spotify via Web API (OAuth Authorization Code + PKCE, sem servidor). A música toca no Spotify; o app só controla. A aba **Música** tem o player completo (capa, faixa, progresso, play/pause, anterior/próxima, suas playlists e aparelhos) e a tela Hoje tem um minicontrole.

1. Acesse https://developer.spotify.com/dashboard → **Create app**.
2. **Redirect URI:** `https://k3v1nn-ux.github.io/projeto-k/` (exatamente assim, com a barra final). Marque **Web API**.
3. Em **User Management**, adicione o e-mail da sua conta Spotify (apps em modo de desenvolvimento só aceitam usuários cadastrados).
4. Copie o **Client ID** → no app, aba **Música** → **Controle do Spotify dentro do app** → cole → **Conectar Spotify**.
5. Opcional: cole o link de uma playlist (plano B: player embutido + botão "Abrir no Spotify").

Limitações: exige **Spotify Premium**; o app do Spotify precisa estar aberto/ativo no iPhone (se não houver aparelho ativo, o app tenta acordar o último aparelho e, se não houver nenhum, abre o Spotify). O Web Playback SDK (tocar no navegador) não funciona no Safari do iOS, por isso não é usado.

## 7. Atalho do iOS: Zepp → Saúde → planilha

O Zepp já envia os dados ao app Saúde. Não existe API pública do Zepp, então o caminho é **Saúde → Atalho → Apps Script** (aba `health_imports`). Nada de scraping ou API não oficial.

**Jeito rápido (arquivo pronto, v2):** no iPhone, abra https://k3v1nn-ux.github.io/projeto-k/shortcuts/ e toque em **Baixar o Atalho** (ou Perfil → Atalho do Saúde), toque em **Adicionar Atalho** e cole a URL `/exec` e o token quando ele pedir. Ele envia passos, kcal ativas, FC média e FC de repouso do dia e **mostra na notificação a resposta da planilha** (`{"ok":true,...}` ou o erro, como `unauthorized (token errado)`). O arquivo é gerado e assinado por `python3 tools/make_shortcut.py` e não contém URL nem token. Se você instalou a v1, apague-a no app Atalhos antes.

**Jeito manual:** crie no app **Atalhos** um atalho chamado **`Projeto K Saúde`** (o nome pode ser trocado em Ajustes). Os nomes das ações podem variar um pouco conforme a versão do iOS:

1. **Receber** entrada do tipo *Texto*; se não houver entrada: *Continuar*.
2. **Dividir texto** (Entrada do Atalho) por *Personalizado* `|` → item 1 = data, item 2 = minutos do treino (vem do botão "Importar do Saúde" do app; vazio quando roda pela automação).
3. **Formatar data** (Data Atual) → formato personalizado `yyyy-MM-dd` → variável **Dia** (use a data recebida, se houver).
4. **Encontrar amostras de saúde** → *Frequência Cardíaca em Repouso*, Data de Início *hoje*, Limite 1 → **FC repouso**.
5. **Encontrar amostras de saúde** → *Frequência Cardíaca*, Data de Início *hoje* → **Calcular estatísticas: Média** → **FC média**.
6. **Encontrar amostras de saúde** → *Energia Ativa*, hoje → **Calcular estatísticas: Soma** → **kcal**.
7. **Encontrar amostras de saúde** → *Passos*, hoje → **Soma** → **Passos**.
8. *(Opcional)* **Encontrar amostras de saúde** → *Análise do Sono*, últimas 24 h, valor *Dormindo* → obter **Duração** → **Soma** → dividir por 3600 → **Sono (h)**.
9. **Se** minutos tem valor: **Encontrar amostras de saúde** → *Frequência Cardíaca* nos últimos *minutos* → **Média** → **FC treino**.
10. **Obter conteúdo do URL**:
    - URL: a URL `/exec` do Apps Script
    - Método: **POST**, Corpo da solicitação: **JSON**
    - Campos: `action` = `health`, `token` = seu token, `date` = Dia, `resting_hr` = FC repouso, `avg_hr` = FC média, `active_kcal` = kcal, `steps` = Passos, `sleep_h` = Sono, `workout_avg_hr` = FC treino, `workout_min` = minutos, `source` = `Zepp via Saúde`
11. *(Opcional)* **Abrir URL** `https://k3v1nn-ux.github.io/projeto-k/#/analytics`.

Na primeira execução o iOS pede permissão para ler cada tipo de dado do Saúde.

**Disparar ao terminar o treino:** na tela de resumo, o botão **Importar dados do Saúde** abre `shortcuts://run-shortcut?name=Projeto%20K%20Saúde&input=text&text=AAAA-MM-DD|minutos`.

**Automação diária:** Atalhos → **Automação** → **+** → **Hora do Dia** (ex.: 21h30, Diariamente) → **Executar Imediatamente** → ação **Executar Atalho: Projeto K Saúde**. Lembre: com o iPhone bloqueado o Saúde não libera os dados; escolha um horário em que você costuma usar o celular.

Os dados aparecem em **Progresso → Relógio**, cruzados com a sessão do dia (FC do treino, kcal, FC de repouso, passos e sono).

## 8. Treino montado por um amigo

- **Perfil → Treinos recebidos → Gerar link de convite.** O link abre uma tela simples (sem login) onde o amigo monta **um ou vários dias** (exercícios da base, séries, repetições, descanso e observações).
- Com a planilha configurada, o link leva a URL do Apps Script e um **token de sugestão** (diferente do seu token; só permite gravar na aba `suggestions`). O treino aparece no app ("Novo treino de [nome]" + selo na aba Perfil). Em **Treinos recebidos** você marca quais dias quer e escolhe a data de cada um: aceitar tudo, só alguns dias (status `partial`) ou recusar. Cada dia aceito vira o treino daquela data; o rodízio se reorganiza em volta.
- **Plano B sem backend:** ao enviar, o amigo recebe também um link `#/importar?w=...` com o treino comprimido (deflate + base64url) na própria URL, para mandar pelo WhatsApp. Ao abrir no seu aparelho, ele vira uma sugestão.

## 9. Programa de treino e fontes

Perfil considerado: iniciante na prática (≈2 meses com muitas faltas), objetivo de recomposição corporal. **Sem agachamento** (preferência pessoal): nenhuma variação no plano; afundo e búlgaro existem só como alternativas marcadas `is_squat_variant`, desligadas por padrão (Ajustes).

### Rodízio com meta semanal

Em vez de dias fixos, o app usa um **rodízio**: Superior A → Inferior A → Superior B → Inferior B, com **meta de 4 treinos por semana** (ajustável para 3–5 em Ajustes).

- O treino sugerido é sempre o que está **há mais tempo sem ser feito**. Trocou o treino de hoje, descansou ou pulou um dia? Nada se perde: o pendente vai para o próximo dia de treino e nenhum grupo muscular fica para trás.
- **Você escolhe os dias de descanso**: toque em "Descansar hoje" (ou em qualquer dia na aba Semana). Os dias de descanso preferidos (padrão: qua, sáb, dom) só orientam a previsão da semana.
- **Cardio** é o aquecimento de todo treino (8–10 min, etapa 1 da tela Hoje). Também dá para fazer **só cardio** num dia: o cardio é registrado, os exercícios ficam como não feitos e o treino continua pendente. Dia só de cardio não conta como treino.
- **Aderência** é semanal (treinos ÷ meta). Não existe "falta" por dia.

**Justificativa:** Superior/Inferior 4x por semana treina cada grupo **2x por semana**, a frequência com melhor resultado para hipertrofia [1], com ~9–12 séries semanais nos grupos grandes, o ponto de partida recomendado [2, 3], em sessões de ~50–60 min. Cardio curto e leve como aquecimento interfere pouco na hipertrofia [11] e soma minutos para a meta de atividade [12].

**Superior A:** supino reto c/ halteres 3×8–12 · remada baixa 3×8–12 · desenvolvimento c/ halteres 3×8–12 · puxada frontal 3×8–12 · elevação lateral 2×12–15 · rosca alternada 2×10–12 · tríceps na polia 2×10–12

**Inferior A:** leg press 45° 3×10–12 · stiff c/ halteres 3×8–12 · cadeira extensora 3×12–15 · mesa flexora 3×10–12 · panturrilha em pé 3×10–15 · abdominal na polia 2×12–15

**Superior B:** remada máquina 3×8–12 · supino inclinado c/ halteres 3×8–12 · puxada c/ triângulo 3×10–12 · voador 3×12–15 · crucifixo invertido 2×12–15 · rosca martelo 2×10–12 · tríceps francês na polia 2×10–12

**Inferior B:** elevação pélvica 3×8–12 · leg press 45° (pés altos) 3×12–15 · cadeira flexora 3×10–12 · abdutora 2×12–15 · adutora 2×12–15 · panturrilha sentado 3×12–15 · elevação de pernas 2×10–15

**Aparelhos da Smart Fit.** A rede tem parceria de equipamentos com a [Matrix Fitness](https://www.americanspa.com/press-releases/matrix-fitness-smart-fit-announce-partnership) (linhas Aura/Ultra/Versa), e os próprios artigos da Smart Fit citam leg press, cadeira extensora, flexora deitada, crunch machine (abdominal), pulley, Smith, polias, halteres, barras e cadeira abdutora ([1](https://www.smartfit.com.br/news/academia/voce-conhece-os-aparelhos-de-academia/), [2](https://www.smartfit.com.br/news/fitness/5-aparelhos-da-academia-para-empinar-o-bumbum/)). O programa prioriza esses aparelhos (ex.: abdominal máquina e panturrilha no leg press no Inferior A, tríceps máquina e glúteo máquina como alternativas) e cada exercício mostra um selo: *aparelho padrão*, *linha Matrix (comum)*, *peso livre/polia* ou *depende da unidade*. O remo ergométrico saiu do cardio (não é padrão na rede). Não há lista oficial por unidade, por isso todo exercício tem alternativas.

Cada exercício tem 1–2 alternativas com equipamento padrão de academia (máquina, polia, halteres, barra, smith). O botão **Trocar** muda na hora; "não existe na minha unidade" troca sempre. O detalhe completo (com notas de carga) está em [`data/program.json`](data/program.json).

### Regras

- **Séries e repetições:** **3×12** no nível Base e **4×12** no Avançado. A carga sobe quando você fecha 12 repetições em todas as séries.
- **Adicionar série:** botão **＋ Adicionar série** abaixo das séries do exercício.
- **Apagar série:** arraste a série para a esquerda (registrada = apaga o registro; ainda não feita = sai do treino de hoje).
- **Smart Fit:** sábado fecha às 19h e domingo às 15h; a tela Hoje avisa quanto tempo falta e a Semana mostra o horário.
- **Descanso:** 120 s nos compostos, 60–90 s nos isolados [8, 9]. O cronômetro inicia sozinho ao registrar a série.
- **Intensidade:** RIR 1–3 (parar com 1–3 repetições "na reserva"); não é preciso ir à falha [5, 6, 7].
- **Faixas:** 8–12 repetições na maioria, 12–15 nos isolados e panturrilha [4].
- **Dupla progressão** [10]: fechou todas as séries no topo da faixa → próximo treino sobe a carga (+1–2,5 kg em superiores, +2,5–5 kg em inferiores/máquinas, conforme o incremento do aparelho) e volta ao início da faixa. Ficou abaixo do mínimo em 2 treinos seguidos → reduz ~10%. A sugestão já vem preenchida: registrar é 1 toque.
- **Recordes:** carga máxima e 1RM estimado por **Epley** (carga × (1 + reps/30)) [14], comparando com treinos anteriores.
- **Aquecimento:** 8–10 min de cardio leve (registrado como cardio do dia) + 1 min de mobilidade + 2 séries de aproximação (50% × 10, 75% × 5) no 1º exercício.
- **Semana de reentrada:** a 1ª semana (a partir de "Início do programa" em Ajustes) tem 1 série a menos por exercício e RIR 3–4, para achar as cargas. O músculo recupera rápido após pausas [13].
- **Sem faltas diárias:** a semana é avaliada pela meta. Sessões deixadas "em andamento" em dias passados são fechadas sozinhas (feito/parcial/só cardio).
- **Nível Intermediário:** bloqueado até **8 semanas (não precisam ser seguidas) com pelo menos 3 de 4 treinos (≥ 75%)**, exibido como troféu. Ele mantém a divisão, com 3–4 séries por exercício, um exercício extra por dia (~14–16 séries semanais nos grupos grandes) e RIR 0–2.

### Fontes

1. Schoenfeld, Ogborn, Krieger. *Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy.* Sports Med, 2016. doi:10.1007/s40279-016-0543-8
2. Schoenfeld, Ogborn, Krieger. *Dose-response relationship between weekly resistance training volume and increases in muscle mass.* J Sports Sci, 2017. doi:10.1080/02640414.2016.1210197
3. Pelland et al. *The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency.* SportRxiv (preprint), 2024. doi:10.51224/SRXIV.460
4. Schoenfeld, Grgic, Van Every, Plotkin. *Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum.* Sports, 2021. doi:10.3390/sports9020032
5. Refalo et al. *Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy.* Sports Med, 2023. doi:10.1007/s40279-022-01784-y
6. Robinson et al. *Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy.* Sports Med, 2024. doi:10.1007/s40279-024-02069-2
7. Helms et al. *Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale.* Strength Cond J, 2016. doi:10.1519/SSC.0000000000000218
8. Schoenfeld et al. *Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men.* J Strength Cond Res, 2016. doi:10.1519/JSC.0000000000001272
9. Singer et al. *Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy.* Front Sports Act Living, 2024. doi:10.3389/fspor.2024.1429789
10. ACSM. *Progression Models in Resistance Training for Healthy Adults.* Med Sci Sports Exerc, 2009. doi:10.1249/MSS.0b013e3181915670
11. Wilson et al. *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises.* J Strength Cond Res, 2012. doi:10.1519/JSC.0b013e31823a3e2d
12. Bull et al. *World Health Organization 2020 guidelines on physical activity and sedentary behaviour.* Br J Sports Med, 2020. doi:10.1136/bjsports-2020-102955
13. Ogasawara et al. *Comparison of muscle hypertrophy following 6-month of continuous and periodic strength training.* Eur J Appl Physiol, 2013. doi:10.1007/s00421-012-2511-9
14. Epley B. *Poundage Chart.* Boyd Epley Workout, 1985.

## 9b. Telas e análise com IA

| Aba | O que tem |
|---|---|
| **Início** | Painel com cartões de todas as abas (treino de hoje, semana, música, números da semana, recomendações, evolução de força, peso, relógio, troféus, treinos recebidos). Toque em um cartão para abrir a aba; **Personalizar início** liga, desliga e reordena os cartões. |
| **Treino** | Treino sugerido com anel de progresso, cronômetro do treino, faixa da semana, etapa 1 (cardio de aquecimento), etapa 2 (exercícios em acordeão, séries pré-preenchidas, 1 toque para registrar, descanso automático), trocar treino/aparelho, descansar hoje, só cardio, minicontrole de música. Dias passados podem ser editados. |
| **Semana** | Resumo (treinos/meta, séries, volume, minutos, cardio, séries por grupo, recordes) e seg–dom com detalhes de cada dia (exercícios, séries, volume, duração, cardio, recordes, horário da Smart Fit); tocar num dia mostra o treino e permite marcar/tirar descanso. |
| **Música** | Player do Spotify, playlists e aparelhos (ou o player embutido da playlist sem login). |
| **Progresso** | *Visão geral* (semana, sequência, recomendações, mapa de frequência, treinos por semana) · *Treinos* (equilíbrio do rodízio, séries por grupo vs referência, cardio, histórico) · *Força* (exercícios diferentes e realizados, dias em que as séries aumentaram, aumentos de carga, linha do tempo da evolução, gráfico por exercício, tabela com 1RM e tendência, recordes) · *Corpo* (peso, IMC, força relativa, medidas) · *Relógio* (dados do Saúde). (Troféus e IA ficam em Perfil.) |
| **Perfil** | *Você*: Meus dados e medidas, Conquistas, Análise com IA · *Social*: Treinos de amigos · *App*: Música, **Configurar treino** (nível 3×12/4×12, meta semanal, dias de descanso, descanso entre séries, cardio de aquecimento, som, avisos na tela bloqueada, horário da academia, afundo/búlgaro e aparelhos que a unidade não tem, escolhidos por foto), Ajustes, Atalho do Saúde, Programa e fontes. |
| **Fim do treino** | Resumo + **avaliação por emoji** (😫 😕 🙂 😀 🤩), salva no treino (coluna `rating` em `sessions` e "Avaliação" no 📊 Resumo). |
| **Tela bloqueada** | iPhone com o app na Tela de Início (iOS 16.4+): com os avisos ligados, chega "Treino em andamento" ao iniciar e "Descanso até 18:42 · próximo: …" a cada série. Um app da web não tem Live Activity; o aviso é o equivalente possível. O relógio "Treino 0:45" no topo é o tempo desde o início do treino. |

**Recomendações (sem IA):** regras locais apontam treinos que faltam na semana, exercícios parados há 3 treinos (com alternativas), grupos com pouco volume, rodízio desequilibrado, muitos dias sem treinar, hora de deload, peso sem registro ou caindo demais para o objetivo, pouco cardio e sono curto.

**Análise com IA (Progresso → IA):** usa o modelo **Claude Opus 5.5** (`claude-opus-5-5`) pelo SDK oficial `@anthropic-ai/sdk` (carregado do jsDelivr só quando você pede a análise), com raciocínio adaptativo, resposta em streaming e fallback do servidor se a requisição for recusada. O app envia um **resumo numérico** (perfil, semanas, força por exercício, séries por grupo, peso, médias do relógio, exercícios indisponíveis), nunca a planilha inteira. Para usar, crie uma chave em https://console.anthropic.com → API Keys e cole na aba IA; ela fica só no aparelho. Cada análise custa poucos centavos de dólar. As análises ficam salvas na aba `ai_reports`.

**Perfil:** nome, avatar (24 ilustrações [DiceBear](https://www.dicebear.com) *Notionists* e *Lorelei*, licença CC0) ou foto, nascimento, sexo, altura, objetivo, experiência e observações (aba `profile`); altura e peso são registrados com data (aba `body_logs`; as colunas de gordura e cintura ficam vazias) para mostrar a evolução e alimentar a IA.

**Ícone e nome:** "Antares" com a estrela de quatro pontas. Para o iOS pegar o ícone novo, copie o código de restauração, apague o app da Tela de Início, adicione de novo e restaure.

**Zoom:** o app bloqueia pinça e duplo toque (viewport + `touch-action: manipulation` + bloqueio dos gestos do Safari), sem atrapalhar toques rápidos nos botões + e −.

## 10. Modelo de dados

Cada aba da planilha tem cabeçalho na linha 1. Todas as tabelas sincronizadas têm também `updated_at` (ISO, do aparelho), `deleted` (exclusão lógica) e `synced_at` (definido pelo servidor). Datas são `AAAA-MM-DD` no fuso do aparelho.

| Aba | Colunas | Observações |
|---|---|---|
| `exercises` | id, name_pt, muscle_group, equipment, media_url, instructions, alternatives, is_squat_variant, active | seed; fonte da verdade é `data/program.json` |
| `plans` | id, level, slot, rotation_order, session_name, exercise_id, order, sets, rep_min, rep_max, rest_seconds, notes | seed; `slot`: upper_a, lower_a, upper_b, lower_b |
| `sessions` | id, date, planned_session, level, start_time, end_time, duration_min, status, notes, swaps_json, synced_at, **slot** | `id` = data (1 sessão por dia). status: `in_progress`, `done` (≥ 75% das séries), `partial`, `cardio` (só cardio), `rest` (descanso escolhido). `slot` = posição no rodízio. `swaps_json` = trocas de aparelho do dia |
| `set_logs` | id, session_id, exercise_id, set_number, load_kg, reps, rpe, timestamp, is_pr | `exercise_id` é o exercício feito (após troca) |
| `cardio_logs` | id, session_id, type, duration_min, avg_hr, notes, synced_at, **phase** | type: esteira, bike, elíptico, escada, remo · phase: `pre` (aquecimento) ou `only` (dia só de cardio) |
| `achievements` | id, unlocked_at | troféus nunca são retirados |
| `suggestions` | id, author, created_at, payload_json, status, target_date | payload com 1+ dias · status: pending, accepted, partial, rejected · target_date: datas aceitas |
| `overrides` | id, date, suggestion_id, session_name, payload_json | treino de amigo aceito para uma data (substitui o plano do dia) |
| `health_imports` | id, date, resting_hr, avg_hr, active_kcal, steps, sleep_h, workout_avg_hr, workout_min, source | `id` = data; enviado pelo Atalho |
| `profile` | id, name, birth_date, sex, height_cm, goal, experience, notes, synced_at, **photo** | uma linha (`id` = `me`); `photo` = foto 192 px em JPEG (data URL), para voltar após reinstalar |
| `body_logs` | id, date, weight_kg, body_fat_pct, waist_cm, notes | `id` = data |
| `ai_reports` | id, created_at, model, text | análises geradas pela IA |
| `📊 Resumo`, `📋 Séries` | — | abas legíveis, recriadas pelo script a cada sincronização |
| `_log` | time, action, ok, error, detail | últimas chamadas recebidas (diagnóstico) |

**Backup:** Ajustes → Dados → **Backup JSON** (tudo) / **Importar JSON** / **CSV** por tabela ou todos num `.zip` (abre no Numbers).

## 11. Desenvolvimento

```bash
python3 tools/dev_server.py 8787
```

```bash
node tools/mock-apps-script.mjs
```

- O mock imita o Apps Script em `http://localhost:8788` (token `test-token`), inclusive recusando preflight CORS, para testar a sincronização sem Google.
- Em `localhost` o service worker só é registrado com `?sw` na URL, para as edições aparecerem sem trocar a versão.
- `python3 tools/generate_data.py` regenera `data/program.json` e `data/seed/*.csv` (o programa é definido nesse script).
- `python3 tools/fetch_media.py` baixa e reduz as imagens; `python3 tools/make_icons.py` gera os ícones.

## 12. Licenças

- Imagens dos exercícios: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), Unlicense (domínio público). Exercícios sem imagem mostram "Ver no YouTube".
- [Chart.js](https://www.chartjs.org/) 4.4.1, MIT.
