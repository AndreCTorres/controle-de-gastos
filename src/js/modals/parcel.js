import { installments, addInstallment } from '../finance.js';
import { persistData, snapshotCurrent } from '../persist.js';
import { repository } from '../db.js';
import { state } from '../state.js';
import { MONTHS, DEFAULT_SECTIONS } from '../constants.js';
import { fmt } from '../utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { loadMonthData, saveMonthData } from '../db.js';
import { buildItemRow } from '../ui/sections.js';
import { recalc } from '../ui/recalc.js';

// ── Parcel (installment purchase) modal ──

let selectedParcelSectionId = null;

window.openParcelModal = function() {
  document.getElementById('parcelTitle').value       = '';
  document.getElementById('parcelTotal').value       = '';
  document.getElementById('parcelCount').value       = '';
  document.getElementById('parcelPreview').style.display = 'none';
  selectedParcelSectionId = null;

  const opts = document.getElementById('parcelSectionOptions');
  opts.innerHTML = '';

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = state.sections.find(s => s.id === sid);
    if (!sec) return;
    const opt     = document.createElement('div');
    opt.className = 'copy-option';opt.tabIndex=0;opt.setAttribute('role','button');
    opt.dataset.sid = sec.id;

    const check = document.createElement('div');
    check.className = 'copy-option-check';
    check.style.borderRadius = '50%';

    const info = document.createElement('div');
    const labelWrap = document.createElement('div');
    labelWrap.className = 'copy-option-label';

    const tag = document.createElement('span');
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#eee';
    tag.style.cssText = `display:inline-block;background:${safeBg};color:${safeColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px`;
    tag.textContent = sec.title;

    labelWrap.appendChild(tag);
    info.appendChild(labelWrap);
    opt.appendChild(check);
    opt.appendChild(info);

    opt.addEventListener('click', () => {
      opts.querySelectorAll('.copy-option').forEach(o => {
        o.classList.remove('selected');
        o.querySelector('.copy-option-check').textContent = '';
      });
      opt.classList.add('selected');
      opt.querySelector('.copy-option-check').textContent = '✓';
      selectedParcelSectionId = sec.id;
    });
    opts.appendChild(opt);
  });

  openModal('parcelModal', '#parcelTitle');
};

window.closeParcelModal = function() {
  closeModal('parcelModal');
  document.getElementById('parcelOverflowWarn').style.display = 'none';
};

window.updateParcelPreview = function() {
  const total   = parseFloat(document.getElementById('parcelTotal').value) || 0;
  const count   = parseInt(document.getElementById('parcelCount').value)   || 0;
  const preview = document.getElementById('parcelPreview');
  const warn    = document.getElementById('parcelOverflowWarn');

  if (total > 0 && count >= 2) {
    document.getElementById('parcelPreviewText').textContent =
      (() => { try { const values=installments(document.getElementById('parcelTotal').value,count,state.currentMonth,state.currentYear); const first=values[0].val,last=values.at(-1).val; return count+' parcelas · '+fmt(Number(first))+(first!==last?' a '+fmt(Number(last)):' cada')+' · total '+fmt(total); } catch(error) { return error.message; } })();
    preview.style.display = 'block';

    let lastMonth = state.currentMonth + (count - 1);
    let lastYear  = state.currentYear;
    while (lastMonth > 11) { lastMonth -= 12; lastYear++; }

    const selectorHorizon = state.currentYear + 2;
    if (lastYear > selectorHorizon) {
      document.getElementById('parcelOverflowYear').textContent = `${MONTHS[lastMonth]}/${lastYear}`;
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
  } else {
    preview.style.display = 'none';
    warn.style.display    = 'none';
  }
};


window.confirmParcel=async function(){
  if(state.busy)return;
  const button=document.querySelector('#parcelModal .modal-btn-primary');
  const title=document.getElementById('parcelTitle').value.trim();
  const count=Number(document.getElementById('parcelCount').value);
  const total=document.getElementById('parcelTotal').value;
  const section=state.sections.find(s=>s.id===selectedParcelSectionId);
  let parcels;
  try{if(!title||!section)throw Error('Informe a descrição e selecione uma categoria.');parcels=installments(total,count,state.currentMonth,state.currentYear);}
  catch(error){window.showToast(error.message,'error');return;}
  state.busy=true;button.disabled=true;button.textContent='Salvando parcelas…';
  const main=document.querySelector('.main');main.inert=true;
  let staged=false;
  try{
    await persistData();
    const purchaseId=crypto.randomUUID(),entries=[];
    for(const parcel of parcels){
      const original=parcel.month===state.currentMonth&&parcel.year===state.currentYear?snapshotCurrent():await loadMonthData(parcel.month,parcel.year);
      const data=original??{incomes:[{id:'main',label:'Renda principal',val:''}],sections:structuredClone(DEFAULT_SECTIONS)};
      entries.push({month:parcel.month,year:parcel.year,payload:addInstallment(data,section,parcel,title,purchaseId)});
    }
    repository.stage(entries.map(e=>({...e,type:'month'})),{label:'Compra parcelada: '+title});
    staged=true;await repository.flush();
    window.closeParcelModal();await window.reloadCurrentMonth();window.showToast(count+' parcelas adicionadas. A soma é igual ao valor da compra.');
    const {populateMonths}=await import('../app.js');await populateMonths();
  }catch(error){
    if(staged){window.closeParcelModal();await window.reloadCurrentMonth();window.showToast('Parcelas guardadas neste dispositivo. Confira o indicador de salvamento.','info');}
    else window.showToast('Não foi possível preparar as parcelas. Nenhuma parcela nova foi gravada.','error');
  }finally{state.busy=false;button.disabled=false;button.textContent='Adicionar parcelas';main.inert=!state.monthReady;}
};

document.getElementById('parcelModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeParcelModal();
});

document.getElementById('parcelTitle').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') window.confirmParcel();
});
