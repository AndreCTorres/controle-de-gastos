import { state } from '../state.js';
// ── Toast notifications ──

const TOAST_ICONS        = { success: '✓', error: '✕', info: 'ℹ' };
const TOAST_DRAIN_COLORS = { success: 'var(--green)', error: 'var(--danger)', info: 'var(--primary)' };
const TOAST_DURATION     = 2800;

window.showToast = function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  clearTimeout(t._timer);
  clearTimeout(t._drainTimer);

  const icon       = TOAST_ICONS[type]       || TOAST_ICONS.success;
  const drainColor = TOAST_DRAIN_COLORS[type] || TOAST_DRAIN_COLORS.success;

  // Reset classes and content before reflow
  t.className = 'toast ' + type;
  t.style.setProperty('--drain-color', drainColor);
  t.style.setProperty('--drain-dur', TOAST_DURATION + 'ms');
  t.style.position = 'fixed';
  t.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-text"></div>`;

  t.querySelector('.toast-text').textContent = msg;

  // Force reflow so the transition plays from the start
  void t.offsetWidth;
  t.classList.add('show');

  // Start drain animation on the next frame — the CSS duration already matches TOAST_DURATION
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('draining')));

  // Dismiss after the full duration (add a couple ms so the bar visually completes first)
  t._timer = setTimeout(() => {
    t.classList.remove('show');
    t._drainTimer = setTimeout(() => t.classList.remove('draining'), 300);
  }, TOAST_DURATION + 50);
};

/** Show a toast with custom action buttons.
 *  buttons: Array<{ label, style?, onClick }>
 *  A "Cancelar" button is always prepended automatically.
 */
export function showConfirmToast(msgBuilder, buttons) {
  const origin={user:state.userId,month:state.currentMonth,year:state.currentYear};
  const t = document.getElementById('toast');
  clearTimeout(t._timer);clearTimeout(t._drainTimer);t.className='toast confirm';

  const msgDiv = document.createElement('div');
  msgDiv.className = 'toast-confirm-msg';
  msgBuilder(msgDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'toast-confirm-actions';

  const dismiss = () => {
    clearTimeout(t._timer);
    clearTimeout(t._drainTimer);
    t.classList.remove('show');
    setTimeout(() => { t.className = 'toast'; t.innerHTML = ''; }, 300);
  };

  buttons.forEach(({ label, style, onClick }) => {
    const btn = document.createElement('button');
    btn.className = 'toast-confirm-ok';
    if (style) Object.assign(btn.style, style);
    btn.textContent = label;
    btn.addEventListener('click', async () => { if(state.busy)return; dismiss(); if(origin.user!==state.userId||origin.month!==state.currentMonth||origin.year!==state.currentYear){window.showToast('O período mudou. Abra a ação novamente.','info');return;} state.busy=true;const main=document.querySelector('.main');main.inert=true;try { await onClick(); } catch { window.showToast('A alteração não foi concluída. Confira o salvamento e tente novamente.', 'error'); }finally{state.busy=false;main.inert=!state.monthReady;} });
    actionsDiv.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'toast-confirm-cancel';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', dismiss);
  actionsDiv.insertBefore(cancelBtn, actionsDiv.firstChild);

  t.innerHTML = '';
  t.appendChild(msgDiv);
  t.appendChild(actionsDiv);
  void t.offsetWidth;
  t.classList.add('show');
}
