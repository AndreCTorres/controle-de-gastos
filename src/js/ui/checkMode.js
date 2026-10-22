import { state } from '../state.js';
import { scheduleSave } from '../persist.js';
import { showConfirmToast } from './toast.js';

function getCheckStats() {
  const items = state.sections.flatMap(sec => sec.items || []);
  const total = items.length;
  const checked = items.filter(item => item.checked).length;
  return { total, checked };
}

function updateSectionCheckCounters() {
  document.querySelectorAll('.section[data-sid]').forEach(sectionEl => {
    const sec = state.sections.find(s => s.id === sectionEl.dataset.sid);
    const counter = sectionEl.querySelector('.section-check-counter');
    if (!sec || !counter) return;
    const items = sec.items || [];
    const checked = items.filter(item => item.checked).length;
    counter.textContent = `${checked}/${items.length}`;
  });
}

window.updateCheckModeUI = function updateCheckModeUI() {
  const bar = document.getElementById('checkModeBar');
  const progress = document.getElementById('checkModeProgress');
  const fill = document.getElementById('checkModeFill');
  const launchBtn = document.querySelector('.check-mode-launch-btn');
  if (!bar || !progress || !fill) return;

  const { total, checked } = getCheckStats();
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  document.body.classList.toggle('check-mode-active', state.checkMode);
  bar.hidden = !state.checkMode;
  if (launchBtn) launchBtn.classList.toggle('active', state.checkMode);
  progress.textContent = `${checked}/${total} itens conferidos`;
  fill.style.width = `${pct}%`;

  document.querySelectorAll('.item-row[data-iid]').forEach(row => {
    const sec = state.sections.find(s => s.id === row.dataset.sid);
    const item = sec?.items.find(i => i.id === row.dataset.iid);
    row.classList.toggle('checked', !!item?.checked);
    row.querySelector('.item-check-toggle')?.setAttribute('aria-pressed',item?.checked?'true':'false');
  });

  updateSectionCheckCounters();
};

window.toggleCheckMode = function toggleCheckMode() {
  state.checkMode = !state.checkMode;
  window.updateCheckModeUI();
  window.showToast(state.checkMode
    ? 'Modo conferência ativado. Clique nos itens para marcar.'
    : 'Modo conferência desativado.');
};

window.toggleItemChecked = function toggleItemChecked(sid, iid) {
  const sec = state.sections.find(s => s.id === sid);
  const item = sec?.items.find(i => i.id === iid);
  if (!item) return;
  item.checked = !item.checked;
  window.updateCheckModeUI();
  scheduleSave();
};

window.resetMonthChecks = function resetMonthChecks() {
  const { checked } = getCheckStats();
  if (checked === 0) {
    window.showToast('Nenhum item conferido neste mês.', 'info');
    return;
  }

  showConfirmToast(msgDiv => {
    msgDiv.append('Limpar todas as marcações de conferência deste mês?');
  }, [
    {
      label: 'Limpar',
      style: { background: 'var(--danger)' },
      onClick: () => {
        state.sections.forEach(sec => (sec.items || []).forEach(item => { item.checked = false; }));
        window.updateCheckModeUI();
        scheduleSave();
        window.showToast('Marcações limpas.');
      },
    },
  ]);
};
