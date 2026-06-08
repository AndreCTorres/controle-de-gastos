import { state } from '../state.js';
import { openModal, closeModal } from '../ui/modal.js';
import { loadYearGoals, saveYearGoals } from '../db.js';
import { recalc } from '../ui/recalc.js';

// ── Monthly goals modal ──

window.openGoalsModal = async function() {
  // Reload year goals in case they changed
  state.yearGoals = (await loadYearGoals(state.currentYear)) || {};
  const monthGoals = state.yearGoals[state.currentMonth] || {};

  const body = document.getElementById('goalsModalBody');
  body.innerHTML = '';

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid  = el.dataset.sid;
    const sec  = state.sections.find(s => s.id === sid);
    if (!sec) return;
    const goal = monthGoals[sid] || '';

    const row = document.createElement('div');
    row.className = 'goal-row';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'goal-row-label';
    const tag = document.createElement('span');
    tag.className = 'goal-tag';
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#eee';
    tag.style.background = safeBg;
    tag.style.color = safeColor;
    tag.textContent = sec.title;
    labelDiv.appendChild(tag);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'goal-input-wrap';
    const currency = document.createElement('span');
    currency.className = 'goal-currency';
    currency.textContent = 'R$';
    const input = document.createElement('input');
    input.className = 'goal-input';
    input.type = 'number';
    input.placeholder = 'Sem meta';
    input.step = '0.01';
    input.min = '0';
    input.max = '9999999';
    input.dataset.sid = sid;
    if (goal) input.value = goal;
    input.addEventListener('focus', () => { input.style.borderColor = 'var(--primary)'; });
    input.addEventListener('blur',  () => { input.style.borderColor = 'var(--border)'; });
    inputWrap.appendChild(currency);
    inputWrap.appendChild(input);

    row.appendChild(labelDiv);
    row.appendChild(inputWrap);
    body.appendChild(row);
  });

  openModal('goalsModal');
};

window.closeGoalsModal = function() {
  closeModal('goalsModal');
};

window.confirmGoals = async function() {
  const monthGoals = {};
  document.querySelectorAll('.goal-input[data-sid]').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) monthGoals[inp.dataset.sid] = v;
  });

  state.yearGoals[state.currentMonth] = monthGoals;

  try {
    await saveYearGoals(state.currentYear, state.yearGoals);
    recalc();
    window.closeGoalsModal();
    window.showToast('Metas salvas!');
  } catch (err) {
    window.showToast('Erro ao salvar metas. Tente novamente.', 'error');
  }
};

document.getElementById('goalsModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeGoalsModal();
});
