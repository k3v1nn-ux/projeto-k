// "Ajustes": cloud sync, theme, training options, unavailable equipment, friend link,
// Spotify, Apple Health shortcut and data export.
import { settings, updateSettings } from '../settings.js';
import { api, sync, syncState } from '../sync.js';
import { allExercises, seedTables } from '../program.js';
import { TABLES } from '../schema.js';
import { exportCsv, exportAllCsvZip, exportJson, importJson } from '../export.js';
import { toast, confirmSheet } from '../ui.js';
import { esc } from '../util.js';
import { isUnlocked } from '../achievements.js';
import { friendSettingsHtml, bindFriendSettings } from '../friend.js';
import { spotifySettingsHtml, bindSpotifySettings } from '../spotify.js';

const GROUP_ORDER = ['peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'quadríceps', 'posteriores', 'glúteos', 'adutores', 'panturrilhas', 'abdômen'];

export function render(view) {
  const s = settings();
  const st = syncState();
  const intermediateOk = isUnlocked('intermediate_unlocked');
  const byGroup = GROUP_ORDER.map((g) => [g, allExercises().filter((e) => e.muscle_group === g)]);

  view.innerHTML = `
    <h1>Ajustes</h1>

    <div class="section"><div class="section-title">Planilha (Google Sheets)</div>
      <div class="card">
        <form data-form="cloud">
          <label class="field"><span>URL do Web App (Apps Script)</span><input type="url" name="apiUrl" value="${esc(s.apiUrl)}" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off"></label>
          <label class="field"><span>Token secreto</span><input type="password" name="token" value="${esc(s.token)}" autocomplete="off"></label>
          <div class="row gap"><button class="btn primary grow" type="submit">Salvar e testar</button><button class="btn grow" type="button" data-action="sync">Sincronizar</button></div>
        </form>
        <p class="muted small" style="margin-top:10px">Status: <strong>${statusText(st)}</strong>${st.pending ? ` · ${st.pending} registro(s) na fila` : ''}${st.lastSync ? ` · última: ${st.lastSync.toLocaleTimeString('pt-BR')}` : ''}${st.error ? `<br>Erro: ${esc(st.error)}` : ''}</p>
        <button class="btn small ghost" data-action="seed">Enviar exercícios e plano para a planilha</button>
        <p class="muted tiny" style="margin-top:6px">A URL e o token ficam só neste aparelho. Repita a configuração no Mac.</p>
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
            <button data-level="base" aria-pressed="${s.level === 'base'}">Base</button>
            <button data-level="intermediate" aria-pressed="${s.level === 'intermediate'}" ${intermediateOk ? '' : 'disabled title="Bloqueado"'}>${intermediateOk ? '' : '🔒 '}Intermediário</button>
          </div>
        </div>
        ${intermediateOk ? '' : '<p class="muted small">O Intermediário desbloqueia com 8 semanas de aderência ≥ 80% (veja Troféus).</p>'}
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

    <div class="section"><div class="section-title">Treino de um amigo</div>${friendSettingsHtml()}</div>

    <div class="section"><div class="section-title">Spotify</div>${spotifySettingsHtml()}</div>

    <div class="section"><div class="section-title">Apple Saúde (Zepp)</div>
      <div class="card">
        <label class="field"><span>Nome do Atalho do iOS</span><input type="text" name="shortcutName" value="${esc(s.shortcutName)}"></label>
        <p class="muted small">O Atalho lê FC, kcal, passos e sono do app Saúde e envia para a planilha. Passo a passo no README.</p>
      </div>
    </div>

    <div class="section"><div class="section-title">Dados</div>
      <div class="card stack">
        <div class="row gap"><button class="btn grow" data-action="export-json">Backup JSON</button><label class="btn grow">Importar JSON<input type="file" accept="application/json,.json" data-import hidden></label></div>
        <button class="btn block" data-action="export-zip">Exportar todos os CSV (.zip)</button>
        <div class="chips">${Object.keys(TABLES).map((t) => `<button class="chip" data-csv="${t}">${t}.csv</button>`).join('')}</div>
      </div>
    </div>

    <p class="muted tiny center" style="margin-top:24px">Projeto K · dados locais em IndexedDB + planilha · imagens: free-exercise-db (domínio público)</p>`;

  bind(view);
  bindFriendSettings(view, () => render(view));
  bindSpotifySettings(view, () => render(view));
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
    const level = e.target.closest('[data-level]');
    if (level && !level.disabled) {
      updateSettings({ level: level.dataset.level });
      toast(`Nível ${level.dataset.level === 'base' ? 'Base' : 'Intermediário'} ativo`);
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
      case 'export-json': exportJson(); break;
      case 'export-zip': exportAllCsvZip(); break;
      default:
    }
  };
}
