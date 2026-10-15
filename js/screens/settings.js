// "Ajustes": cloud sync (+ diagnostics), theme, training options, unavailable equipment,
// Spotify, Apple Health shortcut and data export.
import * as db from '../db.js';
import { settings, updateSettings, restorePayload, applyRestore } from '../settings.js';
import { api, sync, syncState } from '../sync.js';
import { allExercises, seedTables } from '../program.js';
import { TABLES } from '../schema.js';
import { exportCsv, exportAllCsvZip, exportJson, importJson } from '../export.js';
import { toast, confirmSheet } from '../ui.js';
import { esc, packJson, unpackJson } from '../util.js';
import { isUnlocked } from '../achievements.js';
import { spotifySettingsHtml, bindSpotifySettings } from '../spotify.js';

const GROUP_ORDER = ['peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'quadríceps', 'posteriores', 'glúteos', 'adutores', 'panturrilhas', 'abdômen'];

export function render(view) {
  const s = settings();
  const st = syncState();
  const intermediateOk = isUnlocked('intermediate_unlocked');
  const byGroup = GROUP_ORDER.map((g) => [g, allExercises().filter((e) => e.muscle_group === g)]);

  view.innerHTML = `
    <div class="page-head"><h1>Ajustes</h1></div>

    <div class="section"><div class="section-title">Planilha (Google Sheets)</div>
      <div class="card">
        <form data-form="cloud">
          <label class="field"><span>URL do Web App (Apps Script)</span><input type="url" name="apiUrl" value="${esc(s.apiUrl)}" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off"></label>
          <label class="field"><span>Token secreto</span><input type="password" name="token" value="${esc(s.token)}" autocomplete="off"></label>
          <div class="row gap"><button class="btn primary grow" type="submit">Salvar e testar</button><button class="btn grow" type="button" data-action="sync">Sincronizar</button></div>
        </form>
        <p class="muted small" style="margin-top:10px">Status: <strong>${statusText(st)}</strong>${st.pending ? ` · ${st.pending} registro(s) na fila` : ''}${st.lastSync ? ` · última: ${st.lastSync.toLocaleTimeString('pt-BR')}` : ''}${st.error ? `<br>Erro: ${esc(st.error)}` : ''}</p>
        <div class="row gap wrap"><button class="btn small" data-action="diagnose">Diagnóstico da planilha</button><button class="btn small ghost" data-action="seed">Enviar programa para a planilha</button></div>
        <div data-diag></div>
        <p class="muted tiny" style="margin-top:8px">A URL e o token ficam só neste aparelho. Repita a configuração no Mac.</p>
      </div>
    </div>

    <div class="section"><div class="section-title">Reinstalar sem perder nada</div>
      <div class="card">
        <p class="small" style="margin-top:0"><strong>Automático com Face ID:</strong> salve seu acesso nas Senhas do iCloud (Keychain). Se um dia reinstalar o app, é só tocar no campo de acesso, confirmar com Face ID e tudo volta: planilha, Spotify, chave da IA, ajustes e todos os treinos.</p>
        <form data-form="keychain" autocomplete="on">
          <input type="text" name="username" autocomplete="username" value="${esc(`Antares · ${(db.get('profile', 'me')?.name || 'meu acesso')}`)}" readonly style="margin-bottom:8px">
          <input type="password" name="password" autocomplete="new-password" data-keychain-code placeholder="gerando…">
          <button class="btn primary block mt" type="submit">Salvar no iCloud (Keychain)</button>
        </form>
        <p class="muted tiny" style="margin:8px 0 0">O iPhone pergunta “Salvar senha?”: toque em <strong>Salvar</strong>. Faça de novo se trocar a planilha, a chave da IA ou reconectar o Spotify.</p>
        <details class="mt"><summary class="small">Alternativa: código manual</summary>
          <div class="row gap mt"><button type="button" class="btn grow" data-action="copy-restore">Copiar meu código</button></div>
          <textarea data-restore-out readonly hidden class="mt"></textarea>
          <label class="field mt" style="margin-bottom:8px"><span>Colar código de restauração</span><textarea data-restore-in placeholder="ANT1.…"></textarea></label>
          <button type="button" class="btn block" data-action="restore">Restaurar</button>
        </details>
        <p class="muted tiny" style="margin:8px 0 0">Para receber versões novas do app não é preciso reinstalar: ele se atualiza sozinho.</p>
      </div>
    </div>

    <div class="section"><div class="section-title">Aparência</div>
      <div class="card row between"><span>Tema</span>
        <div class="seg" role="group" aria-label="Tema">
          ${[['auto', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<button data-theme-set="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="section"><div class="section-title">Treino</div>
      <div class="card">
        <div class="row between" style="margin-bottom:12px"><span>Nível ativo</span>
          <div class="seg" role="group" aria-label="Nível">
            <button data-level="base" aria-pressed="${s.level === 'base'}">Base (3×12)</button>
            <button data-level="intermediate" aria-pressed="${s.level === 'intermediate'}" ${intermediateOk ? '' : 'disabled title="Bloqueado"'}>${intermediateOk ? '' : '🔒 '}Avançado (4×12)</button>
          </div>
        </div>
        ${intermediateOk ? '' : '<p class="muted small">O Avançado (4×12) desbloqueia com 8 semanas com pelo menos 3 de 4 treinos (veja Troféus).</p>'}
        <div class="row between" style="margin-bottom:12px"><span>Meta de treinos por semana</span>
          <div class="seg" role="group" aria-label="Meta semanal">${[3, 4, 5].map((n) => `<button data-target="${n}" aria-pressed="${Number(s.weeklyTarget) === n}">${n}</button>`).join('')}</div>
        </div>
        <label class="field"><span>Início do programa (a 1ª semana é de reentrada)</span><input type="date" name="startDate" value="${esc(s.startDate)}"></label>
        <label class="check"><input type="checkbox" name="restSound" ${s.restSound ? 'checked' : ''}> <span>Som ao fim do descanso</span></label>
        <label class="check"><input type="checkbox" name="allowSquatVariants" ${s.allowSquatVariants ? 'checked' : ''}> <span>Permitir afundo/búlgaro como alternativa</span></label>
      </div>
      <details class="card" style="margin-top:12px">
        <summary>Aparelhos indisponíveis na minha unidade (${s.unavailable.length})</summary>
        <p class="muted small" style="margin-top:8px">Marcados aqui são trocados automaticamente pela 1ª alternativa disponível.</p>
        ${byGroup.map(([g, list]) => `<div class="section-title" style="margin-top:12px">${esc(g)}</div>${list.map((e) => `<label class="check"><input type="checkbox" data-unavail="${e.id}" ${s.unavailable.includes(e.id) ? 'checked' : ''}> <span>${esc(e.name_pt)}${e.is_squat_variant ? ' <span class="pill warn">agachamento</span>' : ''}</span></label>`).join('')}`).join('')}
      </details>
    </div>

    <div class="section"><div class="section-title">Spotify</div>${spotifySettingsHtml()}</div>

    <div class="section"><div class="section-title">Apple Saúde (Zepp)</div>
      <div class="card">
        <label class="field"><span>Nome do Atalho do iOS</span><input type="text" name="shortcutName" value="${esc(s.shortcutName)}"></label>
        <a class="btn primary block" href="shortcuts/">Instalar o Atalho “Projeto K Saúde”</a>
        <p class="muted small" style="margin-top:8px">O Atalho envia passos, kcal ativas, FC média e FC de repouso do dia para a planilha e mostra a resposta. Se nada chegar, use o Diagnóstico acima: ele lista as últimas chamadas recebidas pela planilha.</p>
      </div>
    </div>

    <div class="section"><div class="section-title">Dados</div>
      <div class="card stack">
        <div class="row gap"><button class="btn grow" data-action="export-json">Backup JSON</button><label class="btn grow">Importar JSON<input type="file" accept="application/json,.json" data-import hidden></label></div>
        <button class="btn block" data-action="export-zip">Exportar todos os CSV (.zip)</button>
        <div class="chips">${Object.keys(TABLES).map((t) => `<button class="chip" data-csv="${t}">${t}.csv</button>`).join('')}</div>
      </div>
    </div>

    <p class="muted tiny center" style="margin-top:24px">Antares V3 · dados locais em IndexedDB + planilha · imagens: free-exercise-db (domínio público)</p>`;

  bind(view);
  bindKeychain(view);
  bindSpotifySettings(view, () => render(view));
}

/**
 * Lets iOS offer "Save password?": a real form submit with username + password, then the form
 * leaves the page (Safari treats that as a completed sign-in) and comes back.
 */
async function bindKeychain(view) {
  const field = view.querySelector('[data-keychain-code]');
  if (!field) return;
  field.value = `ANT1.${await packJson(restorePayload())}`;
  const form = field.form;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const holder = document.createElement('div');
    form.replaceWith(holder);
    history.pushState(null, '', location.hash);
    setTimeout(() => { holder.replaceWith(form); toast('Se o iPhone perguntou, toque em “Salvar senha”.', { ms: 4000 }); }, 600);
  });
}

function statusText(st) {
  return { local: 'só neste aparelho (sem planilha)', offline: 'offline — salvo localmente', syncing: 'sincronizando…', ok: 'sincronizado', error: 'erro — vou tentar de novo', idle: '—' }[st.status] || st.status;
}

function bind(view) {
  view.onsubmit = async (e) => {
    const form = e.target.closest('[data-form=cloud]');
    if (!form) return;
    e.preventDefault();
    const apiUrl = form.apiUrl.value.trim();
    const token = form.token.value.trim();
    try {
      await api('ping', {}, { url: apiUrl, token });
      updateSettings({ apiUrl, token });
      toast('Conectado à planilha ✓');
      await sync();
    } catch (err) {
      toast(`Falha ao conectar: ${esc(err.message)}`, { ms: 5000 });
    }
    render(view);
  };

  view.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.unavail) {
      const set = new Set(settings().unavailable);
      if (t.checked) set.add(t.dataset.unavail); else set.delete(t.dataset.unavail);
      updateSettings({ unavailable: Array.from(set) });
      return;
    }
    if (t.matches('[data-import]') && t.files[0]) {
      try {
        const n = await importJson(t.files[0]);
        toast(`${n} registro(s) importados`);
      } catch (err) {
        toast(`Arquivo inválido: ${esc(err.message)}`);
      }
      return;
    }
    if (t.name === 'startDate' && t.value) updateSettings({ startDate: t.value });
    if (t.name === 'restSound') updateSettings({ restSound: t.checked });
    if (t.name === 'allowSquatVariants') updateSettings({ allowSquatVariants: t.checked });
    if (t.name === 'shortcutName') updateSettings({ shortcutName: t.value.trim() || 'Projeto K Saúde' });
  };

  view.onclick = async (e) => {
    const theme = e.target.closest('[data-theme-set]');
    if (theme) {
      updateSettings({ theme: theme.dataset.themeSet });
      render(view);
      return;
    }
    const target = e.target.closest('[data-target]');
    if (target) {
      updateSettings({ weeklyTarget: Number(target.dataset.target) });
      render(view);
      return;
    }
    const level = e.target.closest('[data-level]');
    if (level && !level.disabled) {
      updateSettings({ level: level.dataset.level });
      toast(`Nível ${level.dataset.level === 'base' ? 'Base (3×12)' : 'Avançado (4×12)'} ativo`);
      render(view);
      return;
    }
    const csv = e.target.closest('[data-csv]');
    if (csv) {
      exportCsv(csv.dataset.csv);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'sync': {
        const ok = await sync();
        toast(ok ? 'Sincronizado ✓' : `Não sincronizou: ${statusText(syncState())}`);
        render(view);
        break;
      }
      case 'seed': {
        if (!(await confirmSheet('Enviar programa?', 'Sobrescreve as abas exercises e plans da planilha com o programa atual.', 'Enviar'))) return;
        try {
          await api('seed', { tables: seedTables() });
          toast('Abas exercises e plans atualizadas ✓');
        } catch (err) {
          toast(`Erro: ${esc(err.message)}`);
        }
        break;
      }
      case 'diagnose': {
        const out = view.querySelector('[data-diag]');
        out.innerHTML = '<p class="muted small">Consultando a planilha…</p>';
        try {
          const r = await api('status');
          const counts = Object.entries(r.counts || {}).map(([t, n]) => `${t}: ${n}`).join(' · ');
          out.innerHTML = `<div class="card flat mt small"><strong>Apps Script v${esc(r.version)}</strong> ✓<br><span class="muted">${esc(counts)}</span>
            <div class="section-title" style="margin:10px 0 4px">Últimas chamadas recebidas</div>
            ${(r.logs || []).map((l) => `<div class="tiny">${esc(new Date(l.time).toLocaleString('pt-BR'))} · <strong>${esc(l.action)}</strong> · ${l.ok ? '✓' : `✗ ${esc(l.error)}`}${l.detail ? `<br><span class="muted">${esc(l.detail)}</span>` : ''}</div>`).join('') || '<div class="tiny muted">Nenhuma ainda.</div>'}
            ${(r.logs || []).some((l) => l.action === 'health') ? '' : '<p class="tiny muted" style="margin-top:6px">Nenhuma chamada do Atalho (health) chegou. Confira a URL e o token dentro do Atalho.</p>'}</div>`;
        } catch (err) {
          out.innerHTML = `<div class="banner warn mt"><span class="grow small">${/desconhecida/.test(err.message) ? 'O Apps Script publicado é a versão antiga. Cole o Code.gs novo e publique uma nova versão (veja o README).' : `Falhou: ${esc(err.message)}`}</span></div>`;
        }
        break;
      }
      case 'copy-restore': {
        const code = `ANT1.${await packJson(restorePayload())}`;
        const out = view.querySelector('[data-restore-out]');
        out.hidden = false;
        out.value = code;
        out.select();
        try { await navigator.clipboard.writeText(code); toast('Código copiado. Cole no app Notas.'); } catch { toast('Copie o código selecionado'); }
        break;
      }
      case 'restore': {
        const raw = view.querySelector('[data-restore-in]').value.trim();
        try {
          if (!raw.startsWith('ANT1.')) throw new Error('formato');
          applyRestore(await unpackJson(raw.slice(5)));
          toast('Restaurado. Baixando seus dados da planilha…', { ms: 4000 });
          await sync();
          render(view);
        } catch {
          toast('Código inválido. Copie de novo do aparelho antigo.');
        }
        break;
      }
      case 'export-json': exportJson(); break;
      case 'export-zip': exportAllCsvZip(); break;
      default:
    }
  };
}
