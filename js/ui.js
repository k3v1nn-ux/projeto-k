// Toasts and bottom sheets.
import { $ } from './util.js';

export function toast(html, { kind = '', ms = 2800 } = {}) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Opens a bottom sheet. Returns { el, close }. */
export function sheet(html, { onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  const close = () => {
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 220);
    onClose?.();
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  return { el: backdrop.querySelector('.sheet'), close };
}

export function confirmSheet(title, body, okLabel = 'Confirmar', { danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet(`
      <h3>${title}</h3>
      <p class="muted">${body}</p>
      <div class="row gap">
        <button class="btn ghost grow" data-close>Cancelar</button>
        <button class="btn ${danger ? 'danger' : 'primary'} grow" data-ok>${okLabel}</button>
      </div>`, { onClose: () => { if (!answered) resolve(false); } });
    s.el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      resolve(true);
      s.close();
    });
  });
}
