import { repository } from '../db.js';
import { snapshotCurrent } from '../persist.js';
import { cents, newId } from '../finance.js';
import { state } from '../state.js';
import { scheduleSave } from '../persist.js';
import { recalc } from './recalc.js';
import { showConfirmToast } from './toast.js';

// ── Income rows ──

function removeIncomeRow(iid){repository.archive('Antes de remover renda',[{type:'month',month:state.currentMonth,year:state.currentYear,payload:snapshotCurrent()}]);state.incomes=state.incomes.filter(i=>i.id!==iid);document.querySelectorAll('.income-row').forEach(r=>{if(r.dataset.iid===iid)r.remove();});recalc();}

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
    <div class="income-label"><input type="text" placeholder="Nome da renda" maxlength="80" value="${String(income.label || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div>
    <div class="income-input-wrap"><span>R$</span><input class="income-input" type="number" placeholder="0,00" step="0.01" min="0" max="9999999" value="${income.val === '' ? '' : (cents(income.val)/100).toFixed(2)}"></div>
    ${canRemove ? '<button class="remove-income-btn" title="Remover renda" aria-label="Remover renda adicional">×</button>' : ''}
  `;
  row.querySelector('.income-input').addEventListener('input', e => {
    const raw = parseFloat(e.target.value);
    if (Number.isFinite(raw) && (raw < 0 || raw > 9999999 || /\.\d{3,}/.test(e.target.value))) e.target.value = Math.min(9999999, Math.max(0, Math.round((raw+Number.EPSILON)*100)/100)).toFixed(2);
    income.val = e.target.value;
    recalc();
  });
  row.querySelector('.income-label input').addEventListener('input', e => { income.label=e.target.value; scheduleSave(); });
  if (canRemove) row.querySelector('.remove-income-btn').addEventListener('click', () => confirmRemoveIncomeRow(income));
  return row;
}

export function renderIncomes() {
  const cont = document.getElementById('income-rows');
  cont.innerHTML = '';
  state.incomes.forEach(inc => cont.appendChild(buildIncomeRow(inc)));
}

window.addIncomeRow = function() {
  const id = newId();
  state.incomes.push({ id, label: `Renda adicional ${state.incomes.length}`, val: '' });
  const cont   = document.getElementById('income-rows');
  const newRow = buildIncomeRow(state.incomes[state.incomes.length - 1]);
  cont.appendChild(newRow);
  newRow.querySelector('.income-label input').focus();
  newRow.querySelector('.income-label input').select();
  scheduleSave();
};
