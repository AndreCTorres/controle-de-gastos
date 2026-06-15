import { state } from '../state.js';
import { MONTHS } from '../constants.js';
import { fmt } from '../utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { loadMonthData } from '../db.js';
import { renderIncomes } from '../ui/income.js';
import { renderSections } from '../ui/sections.js';
import { recalc } from '../ui/recalc.js';
import { persistData } from '../persist.js';

// ── Copy month modal ──

let copySourceMonth = null;
let copySourceYear  = null;
let copySelections  = new Set();

function getCopyMode() {
  return document.querySelector('input[name="copyMode"]:checked')?.value || 'withValues';
}

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

  const modeBox = document.createElement('div');
  modeBox.className = 'copy-mode-box';
  modeBox.innerHTML = `
    <label class="copy-mode-option">
      <input type="radio" name="copyMode" value="withValues" checked>
      <span><strong>Copiar itens e valores</strong><small>Bom para gastos recorrentes.</small></span>
    </label>
    <label class="copy-mode-option">
      <input type="radio" name="copyMode" value="structureOnly">
      <span><strong>Copiar somente estrutura</strong><small>Traz categorias e itens zerados.</small></span>
    </label>
  `;
  opts.appendChild(modeBox);

  const hasIncomes = (prevData.incomes || []).some(i => parseFloat(i.val) > 0);
  if (hasIncomes) {
    addCopyOption(opts, 'rendas', '💵 Rendas',
      `${(prevData.incomes || []).filter(i => parseFloat(i.val) > 0).length} fonte(s) de renda`);
  }

  (prevData.sections || []).forEach(sec => {
    const total = (sec.items || []).reduce((a, i) => a + (parseFloat(i.val) || 0), 0);
    const itemCount = (sec.items || []).length;
    addCopyOption(opts, 'sec_' + sec.id, sec.title,
      total > 0 ? `${fmt(total)} em ${itemCount} item(ns)` : `${itemCount} item(ns), sem valores preenchidos`);
  });

  if (opts.querySelectorAll('.copy-option').length === 0 && !hasIncomes) {
    window.showToast(`Sem dados em ${MONTHS[pm]} ${py}`, 'error');
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
  const btn = document.querySelector('#copyModal .modal-btn-primary');
  const originalText = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Copiando...';
  }

  try {
    if (copySelections.has('rendas')) {
      state.incomes = JSON.parse(JSON.stringify(prevData.incomes || [{ id: 'main', label: 'Renda principal', val: '' }]));
      renderIncomes();
    }

    const structureOnly = getCopyMode() === 'structureOnly';
    const selectedSections = (prevData.sections || [])
      .filter(prevSec => copySelections.has('sec_' + prevSec.id))
      .map(prevSec => {
        const clone = JSON.parse(JSON.stringify(prevSec));
        clone.items = (clone.items || []).map(item => ({ ...item, checked: false, ...(structureOnly ? { val: '' } : {}) }));
        return clone;
      });

    selectedSections.forEach(prevSec => {
      const idx = state.sections.findIndex(sec =>
        sec.id === prevSec.id || (sec.title || '').trim().toLowerCase() === (prevSec.title || '').trim().toLowerCase()
      );
      if (idx >= 0) state.sections[idx] = prevSec;
      else state.sections.push(prevSec);
    });

    renderSections();
    recalc();
    await persistData();
    window.closeCopyModal();
    window.showToast(structureOnly ? 'Estrutura copiada com valores zerados!' : 'Dados copiados com sucesso!');
  } catch (err) {
    console.error('confirmCopy:', err);
    window.showToast('Não foi possível copiar os dados. Tente novamente.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
};

document.getElementById('copyModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeCopyModal();
});
