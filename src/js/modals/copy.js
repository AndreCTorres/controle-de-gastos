import { copyPreviousMonth } from '../finance.js';
import { repository } from '../db.js';
import { snapshotCurrent } from '../persist.js';
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
      <span><strong>Copiar itens e valores</strong><small>Bom para gastos recorrentes. Parcelas não são copiadas.</small></span>
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

  const invoiceMonth=(state.invoiceImports??[]).some(inv=>inv.status==='applied');
  if(invoiceMonth){const note=document.createElement('p');note.className='invoice-details';note.textContent='Este mês já tem uma fatura importada. Para evitar repetir gastos, a cópia traz somente as rendas.';opts.append(note);}
  (invoiceMonth?[]:(prevData.sections || [])).forEach(sec => {
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


window.confirmCopy=async function(){
 if(state.busy||copySelections.size===0){if(!state.busy)window.showToast('Selecione pelo menos uma opção','error');return;}
 const button=document.querySelector('#copyModal .modal-btn-primary');state.busy=true;button.disabled=true;
 const main=document.querySelector('.main');main.inert=true;
 try{
  await persistData();
  const prev=await loadMonthData(copySourceMonth,copySourceYear);if(!prev)throw Error('Mês de origem indisponível.');
  const before=snapshotCurrent(),structureOnly=getCopyMode()==='structureOnly';
  repository.archive('Antes de copiar mês anterior',[{type:'month',month:state.currentMonth,year:state.currentYear,payload:before}]);
  const data=copyPreviousMonth(before,prev,{incomes:copySelections.has('rendas'),sections:[...copySelections].filter(k=>k.startsWith('sec_')).map(k=>k.slice(4)),structureOnly});
  state.incomes=data.incomes;state.sections=data.sections;renderIncomes();renderSections();recalc();
  await persistData();window.closeCopyModal();window.showToast(structureOnly?'Estrutura copiada com valores zerados.':'Dados recorrentes copiados; parcelas atuais preservadas.');
 }catch(error){window.showToast('A cópia não foi sincronizada. Confira o indicador de salvamento antes de tentar novamente.','error');}
 finally{state.busy=false;button.disabled=false;main.inert=!state.monthReady;}
};

document.getElementById('copyModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeCopyModal();
});
