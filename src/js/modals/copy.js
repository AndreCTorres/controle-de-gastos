import { state } from '../state.js';
import { MONTHS } from '../constants.js';
import { fmt } from '../utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { loadMonthData } from '../db.js';
import { renderIncomes } from '../ui/income.js';
import { renderSections } from '../ui/sections.js';
import { recalc } from '../ui/recalc.js';

// ── Copy month modal ──

let copySourceMonth = null;
let copySourceYear  = null;
let copySelections  = new Set();

window.openCopyModal = async function() {
  let pm = state.currentMonth - 1, py = state.currentYear;
  if (pm < 0) { pm = 11; py--; }
  copySourceMonth = pm;
  copySourceYear  = py;

  const prevData = await loadMonthData(pm, py);
  if (!prevData) {
    window.showToast(`Sem dados em ${MONTHS[pm]} ${py}`, 'error');
    return;
  }

  document.getElementById('copyTargetMonth').textContent = `${MONTHS[state.currentMonth]} ${state.currentYear}`;
  const opts = document.getElementById('copyOptions');
  opts.innerHTML = '';
  copySelections  = new Set();

  const hasIncomes = (prevData.incomes || []).some(i => parseFloat(i.val) > 0);
  if (hasIncomes) {
    addCopyOption(opts, 'rendas', '💵 Rendas',
      `${(prevData.incomes || []).filter(i => parseFloat(i.val) > 0).length} fonte(s) de renda`);
  }

  (prevData.sections || []).forEach(sec => {
    const total = (sec.items || []).reduce((a, i) => a + (parseFloat(i.val) || 0), 0);
    if (total > 0) addCopyOption(opts, 'sec_' + sec.id, sec.title, fmt(total) + ' em itens preenchidos');
  });

  if (opts.children.length === 0) {
    window.showToast(`Sem valores preenchidos em ${MONTHS[pm]} ${py}`, 'error');
    return;
  }

  openModal('copyModal');
};

export function addCopyOption(container, id, label, sub) {
  const el = document.createElement('div');
  el.className  = 'copy-option';
  el.dataset.id = id;

  const check = document.createElement('div');
  check.className = 'copy-option-check';

  const info = document.createElement('div');

  const labelEl = document.createElement('div');
  labelEl.className   = 'copy-option-label';
  labelEl.textContent = label;

  const subEl = document.createElement('div');
  subEl.className   = 'copy-option-sub';
  subEl.textContent = sub;

  info.appendChild(labelEl);
  info.appendChild(subEl);
  el.appendChild(check);
  el.appendChild(info);

  el.addEventListener('click', () => {
    if (copySelections.has(id)) { copySelections.delete(id); el.classList.remove('selected'); }
    else                         { copySelections.add(id);    el.classList.add('selected'); }
  });
  container.appendChild(el);
}

window.closeCopyModal = function() {
  closeModal('copyModal');
};

window.confirmCopy = async function() {
  if (copySelections.size === 0) { window.showToast('Selecione pelo menos uma opção', 'error'); return; }

  const prevData = await loadMonthData(copySourceMonth, copySourceYear);
  if (!prevData) return;

  if (copySelections.has('rendas')) {
    state.incomes = JSON.parse(JSON.stringify(prevData.incomes || [{ id: 'main', label: 'Renda principal', val: '' }]));
    renderIncomes();
  }

  state.sections = state.sections.map(sec => {
    const selKey  = 'sec_' + sec.id;
    if (!copySelections.has(selKey)) return sec;
    const prevSec = (prevData.sections || []).find(s => s.id === sec.id);
    if (!prevSec) return sec;
    return { ...sec, items: JSON.parse(JSON.stringify(prevSec.items)) };
  });

  renderSections();
  recalc();
  window.closeCopyModal();
  window.showToast('Dados copiados com sucesso!');
};

document.getElementById('copyModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeCopyModal();
});
