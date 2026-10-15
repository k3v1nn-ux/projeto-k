# Projeto K — Gym Dashboard

PWA pessoal de treino (mobile-first, offline-first) para a Smart Fit: plano semanal, registro de séries em até 2 toques, cronômetro de descanso, progressão de carga, analytics, troféus, treino montado por amigo, controle do Spotify e dados do relógio (Zepp → Apple Saúde).

**App:** https://k3v1nn-ux.github.io/projeto-k/

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
js/program.js      plano do dia, trocas, semana de reentrada
js/progression.js  dupla progressão, histórico, recordes (Epley)
js/workout.js      sessão: iniciar, registrar, finalizar, faltas
js/timer.js        descanso, som, wake lock
js/stats.js        aderência, sequência, volume
js/achievements.js troféus
js/friend.js, js/spotify.js, js/export.js
js/screens/*.js    telas
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

> **Atualizou o `Code.gs`?** Use *Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão*. Assim a URL continua a mesma.
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

- **iPhone:** abra o link no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**. Abra sempre pelo ícone (tela cheia, e o iOS não apaga os dados de apps instalados).
- **Mac:** Safari → **Arquivo → Adicionar ao Dock** (macOS Sonoma+), ou Chrome → ícone de instalar na barra de endereço.

Na primeira abertura, o service worker baixa o app, o programa e todas as imagens (~3 MB) para funcionar sem internet.

## 6. Spotify

Controle remoto do app oficial do Spotify via Web API (OAuth Authorization Code + PKCE, sem servidor). A música toca no Spotify; a página só controla (capa, faixa, play/pause, anterior/próxima, escolher playlist).

1. Acesse https://developer.spotify.com/dashboard → **Create app**.
2. **Redirect URI:** `https://k3v1nn-ux.github.io/projeto-k/` (exatamente assim, com a barra final). Marque **Web API**.
3. Em **User Management**, adicione o e-mail da sua conta Spotify (apps em modo de desenvolvimento só aceitam usuários cadastrados).
4. Copie o **Client ID** → no app, **Ajustes → Spotify** → cole → **Conectar Spotify**.
5. Opcional: cole o link de uma playlist (plano B: player embutido + botão "Abrir no Spotify").

Limitações: exige **Spotify Premium**; o app do Spotify precisa estar aberto/ativo no iPhone (se não houver aparelho ativo, o app tenta acordar o último aparelho e, se não houver nenhum, abre o Spotify). O Web Playback SDK (tocar no navegador) não funciona no Safari do iOS, por isso não é usado.

## 7. Atalho do iOS: Zepp → Saúde → planilha

O Zepp já envia os dados ao app Saúde. Não existe API pública do Zepp, então o caminho é **Saúde → Atalho → Apps Script** (aba `health_imports`). Nada de scraping ou API não oficial.

**Jeito rápido (arquivo pronto):** no iPhone, abra https://k3v1nn-ux.github.io/projeto-k/shortcuts/ e toque em **Baixar o Atalho** (ou Ajustes → Apple Saúde → Baixar o Atalho), toque em **Adicionar Atalho** e cole a URL `/exec` e o token quando ele pedir. Ele envia passos, kcal ativas, FC média e FC de repouso do dia. O arquivo é gerado e assinado por `python3 tools/make_shortcut.py` e não contém URL nem token.

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

Os dados aparecem em **Analytics → Relógio**, cruzados com a sessão do dia (FC do treino, kcal, FC de repouso, passos e sono).

## 8. Treino montado por um amigo

- **Ajustes → Treino de um amigo → Gerar link.** O link abre uma tela simples (sem login) onde o amigo escolhe exercícios da base, séries, repetições, descanso e observações.
- Com a planilha configurada, o link leva a URL do Apps Script e um **token de sugestão** (diferente do seu token; só permite gravar na aba `suggestions`). O treino chega como `pending` e aparece no app: **"Novo treino de [nome]"** → ver → **Aceitar** (vira o treino do dia escolhido) ou **Recusar**.
- **Plano B sem backend:** ao enviar, o amigo recebe também um link `#/importar?w=...` com o treino comprimido (deflate + base64url) na própria URL, para mandar pelo WhatsApp. Ao abrir no seu aparelho, ele vira uma sugestão.

## 9. Programa de treino e fontes

Perfil considerado: iniciante na prática (≈2 meses com muitas faltas), objetivo de recomposição corporal. **Sem agachamento** (preferência pessoal): nenhuma variação no plano; afundo e búlgaro existem só como alternativas marcadas `is_squat_variant`, desligadas por padrão (Ajustes).

### Semana (nível Base)

| Dia | Sessão | Por quê |
|---|---|---|
| Segunda | Superior A | |
| Terça | Inferior A | |
| Quarta | Cardio zona 2 (25–35 min) + mobilidade | recuperação ativa entre os blocos |
| Quinta | Superior B | |
| Sexta | Inferior B | |
| Sábado | Cardio zona 2 + mobilidade | |
| Domingo | Descanso | não conta como falta nem quebra a sequência |

**Justificativa:** Superior/Inferior 4x por semana treina cada grupo **2x por semana**, a frequência com melhor resultado para hipertrofia [1], com ~9–12 séries semanais nos grupos grandes, o ponto de partida recomendado [2, 3], em sessões de ~50–60 min. Nunca há dois dias seguidos para os mesmos músculos. Os dois dias de cardio leve somam saúde cardiovascular sem atrapalhar a hipertrofia [11, 12].

**Superior A:** supino reto c/ halteres 3×8–12 · remada baixa 3×8–12 · desenvolvimento c/ halteres 3×8–12 · puxada frontal 3×8–12 · elevação lateral 2×12–15 · rosca alternada 2×10–12 · tríceps na polia 2×10–12

**Inferior A:** leg press 45° 3×10–12 · stiff c/ halteres 3×8–12 · cadeira extensora 3×12–15 · mesa flexora 3×10–12 · panturrilha em pé 3×10–15 · abdominal na polia 2×12–15

**Superior B:** remada máquina 3×8–12 · supino inclinado c/ halteres 3×8–12 · puxada c/ triângulo 3×10–12 · voador 3×12–15 · crucifixo invertido 2×12–15 · rosca martelo 2×10–12 · tríceps francês na polia 2×10–12

**Inferior B:** elevação pélvica 3×8–12 · leg press 45° (pés altos) 3×12–15 · cadeira flexora 3×10–12 · abdutora 2×12–15 · adutora 2×12–15 · panturrilha sentado 3×12–15 · elevação de pernas 2×10–15

Cada exercício tem 1–2 alternativas com equipamento padrão de academia (máquina, polia, halteres, barra, smith). O botão **Trocar** muda na hora; "não existe na minha unidade" troca sempre. O detalhe completo (com notas de carga) está em [`data/program.json`](data/program.json).

### Regras

- **Descanso:** 120 s nos compostos, 60–90 s nos isolados [8, 9]. O cronômetro inicia sozinho ao registrar a série.
- **Intensidade:** RIR 1–3 (parar com 1–3 repetições "na reserva"); não é preciso ir à falha [5, 6, 7].
- **Faixas:** 8–12 repetições na maioria, 12–15 nos isolados e panturrilha [4].
- **Dupla progressão** [10]: fechou todas as séries no topo da faixa → próximo treino sobe a carga (+1–2,5 kg em superiores, +2,5–5 kg em inferiores/máquinas, conforme o incremento do aparelho) e volta ao início da faixa. Ficou abaixo do mínimo em 2 treinos seguidos → reduz ~10%. A sugestão já vem preenchida: registrar é 1 toque.
- **Recordes:** carga máxima e 1RM estimado por **Epley** (carga × (1 + reps/30)) [14], comparando com treinos anteriores.
- **Aquecimento:** 5 min de esteira/bike leve + 1 min de mobilidade + 2 séries de aproximação (50% × 10, 75% × 5) no 1º exercício.
- **Semana de reentrada:** a 1ª semana (a partir de "Início do programa" em Ajustes) tem 1 série a menos por exercício e RIR 3–4, para achar as cargas. O músculo recupera rápido após pausas [13].
- **Faltas:** dia planejado de musculação/cardio sem sessão até 23h59 vira `missed` automaticamente.
- **Nível Intermediário:** bloqueado até **8 semanas (não precisam ser seguidas) com aderência ≥ 80%**, exibido como troféu. Ele mantém a divisão, com 3–4 séries por exercício, um exercício extra por dia (~14–16 séries semanais nos grupos grandes) e RIR 0–2.

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

## 10. Modelo de dados

Cada aba da planilha tem cabeçalho na linha 1. Todas as tabelas sincronizadas têm também `updated_at` (ISO, do aparelho), `deleted` (exclusão lógica) e `synced_at` (definido pelo servidor). Datas são `AAAA-MM-DD` no fuso do aparelho.

| Aba | Colunas | Observações |
|---|---|---|
| `exercises` | id, name_pt, muscle_group, equipment, media_url, instructions, alternatives, is_squat_variant, active | seed; fonte da verdade é `data/program.json` |
| `plans` | id, level, weekday, session_name, exercise_id, order, sets, rep_min, rep_max, rest_seconds, notes | seed; weekday 1 = segunda … 7 = domingo |
| `sessions` | id, date, planned_session, level, start_time, end_time, duration_min, status, notes, swaps_json | `id` = data (1 sessão por dia). status: `in_progress`, `done` (≥ 75% das séries), `partial`, `missed`. Descanso não gera linha. `swaps_json` guarda as trocas de aparelho do dia |
| `set_logs` | id, session_id, exercise_id, set_number, load_kg, reps, rpe, timestamp, is_pr | `exercise_id` é o exercício feito (após troca) |
| `cardio_logs` | id, session_id, type, duration_min, avg_hr, notes | type: esteira, bike, elíptico, escada, remo |
| `achievements` | id, unlocked_at | troféus nunca são retirados |
| `suggestions` | id, author, created_at, payload_json, status, target_date | status: pending, accepted, rejected |
| `overrides` | id, date, suggestion_id, session_name, payload_json | treino de amigo aceito para uma data (substitui o plano do dia) |
| `health_imports` | id, date, resting_hr, avg_hr, active_kcal, steps, sleep_h, workout_avg_hr, workout_min, source | `id` = data; enviado pelo Atalho |

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
