import { state } from '../state.js';
import { scheduleSave } from '../persist.js';
import { recalc } from './recalc.js';
import { showConfirmToast } from './toast.js';

// ── Income rows ──

function removeIncomeRow(iid) {
  state.incomes = state.incomes.filter(i => i.id !== iid);
  const row = document.querySelector(`.income-row[data-iid="${iid}"]`);
  if (row) {
    row.style.opacity    = '0';
    row.style.transform  = 'translateY(-4px)';
    row.style.transition = 'all 0.2s';
    setTimeout(() => row.remove(), 220);
  }
  setTimeout(recalc, 250);
}

function confirmRemoveIncomeRow(income) {
  showConfirmToast(msgDiv => {
    msgDiv.append('Remover a renda ');
    const strong = document.createElement('strong');
    strong.textContent = `"${income.label || 'adicional'}"`;
    msgDiv.appendChild(strong);
    msgDiv.append('?');
  }, [
    {
      label: 'Remover',
      style: { background: 'var(--danger)' },
      onClick: () => {
        removeIncomeRow(income.id);
        window.showToast('Renda removida');
      },
    },
  ]);
}

export function buildIncomeRow(income) {
  const row = document.createElement('div');
  row.className   = 'income-row';
  row.dataset.iid = income.id;
  const canRemove = income.id !== 'main';
  row.innerHTML = `
    <div class="income-label"><input type="text" placeholder="Nome da renda" maxlength="80" value="${(income.label || '').replace(/"/g, '&quot;')}"></div>
    <div class="income-input-wrap"><span>R$</span><input class="income-input" type="number" placeholder="0,00" step="0.01" min="0" max="9999999" value="${income.val || ''}"></div>
    ${canRemove ? '<button class="remove-income-btn" title="Remover renda" aria-label="Remover renda adicional">×</button>' : ''}
  `;
  row.querySelector('.income-input').addEventListener('input', e => {
    const raw = parseFloat(e.target.value);
    if (!isNaN(raw) && raw < 0) e.target.value = '0';
    recalc();
  });
  row.querySelector('.income-label input').addEventListener('input', scheduleSave);
  if (canRemove) row.querySelector('.remove-income-btn').addEventListener('click', () => confirmRemoveIncomeRow(income));
  return row;
}

export function renderIncomes() {
  const cont = document.getElementById('income-rows');
  cont.innerHTML = '';
  state.incomes.forEach(inc => cont.appendChild(buildIncomeRow(inc)));
}

window.addIncomeRow = function() {
  const id = 'inc' + (state.incomeNextId++);
  state.incomes.push({ id, label: `Renda adicional ${state.incomes.length}`, val: '' });
  const cont   = document.getElementById('income-rows');
  const newRow = buildIncomeRow(state.incomes[state.incomes.length - 1]);
  cont.appendChild(newRow);
  newRow.querySelector('.income-label input').focus();
  newRow.querySelector('.income-label input').select();
  scheduleSave();
};
