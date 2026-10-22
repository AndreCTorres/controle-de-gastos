import { supabase } from '../config.js';
import { state } from '../state.js';
import { repository } from '../db.js';
import { persistData,snapshotCurrent } from '../persist.js';
import { invoiceSummary,applyInvoiceCategories } from '../invoice-model.js';
import { fmt } from '../utils.js';
import { openModal,closeModal } from './modal.js';
import { renderIncomes } from './income.js';
import { renderSections } from './sections.js';
import { recalc } from './recalc.js';
import { showConfirmToast } from './toast.js';
let reviewing=null;
export async function loadInvoiceImports(month,year){
 const user=state.userId;if(!user)return [];
 const key='cgastos_v2_invoices_'+user+'_'+year+'_'+month;
 try{
  const {data,error}=await supabase.from('invoice_imports').select('id,due_date,total_cents,transactions_cents,carryover_cents,rounding_cents,entry_count,source_message_id,source_filename,status,imported_at').eq('user_id',user).eq('year',year).eq('month',month).order('due_date');
  if(error)throw error;repository.write(key,data??[]);return data??[];
 }catch{return repository.read(key,[]);}
}
const money=c=>fmt(Number(c)/100);
function paragraph(parent,text,className=''){const p=document.createElement('p');p.textContent=text;if(className)p.className=className;parent.append(p);return p;}
window.renderInvoicePanel=function(){
 const panel=document.getElementById('invoicePanel');if(!panel)return;
 panel.replaceChildren();
 const invoices=(state.invoiceImports??[]).filter(i=>i.status==='applied');panel.hidden=!invoices.length;
 for(const invoice of invoices){
  const summary=invoiceSummary(state.sections,invoice),card=document.createElement('article');card.className='invoice-card';
  const head=document.createElement('div');head.className='invoice-head';
  const title=document.createElement('strong');title.textContent='Fatura Nubank · '+invoice.due_date.slice(8,10)+'/'+invoice.due_date.slice(5,7);
  const total=document.createElement('strong');total.textContent=money(invoice.total_cents);head.append(title,total);card.append(head);
  paragraph(card,summary.transactions.length+' lançamentos · '+(summary.reconciled?'Total conferido com o PDF':'Há diferenças em relação à fatura'),summary.reconciled?'invoice-ok':'invoice-warning');
  paragraph(card,'Compras e encargos: '+money(summary.chargesCents)+' · Créditos/estornos: '+money(summary.creditsCents),'invoice-details');
  if(Number(invoice.carryover_cents)!==0)paragraph(card,'Saldo anterior: '+money(invoice.carryover_cents)+' — incluído no total a pagar, separado das compras deste ciclo.','invoice-details');
  if(Number(invoice.rounding_cents)!==0)paragraph(card,'Ajuste de centavos do documento: '+money(invoice.rounding_cents),'invoice-details');
  const actions=document.createElement('div');actions.className='invoice-actions';
  const review=document.createElement('button');review.type='button';review.className='modal-btn-primary';review.textContent=summary.review.length?'Revisar '+summary.review.length+' classificações':'Ver classificações';review.onclick=()=>openReview(invoice);actions.append(review);
  const email=document.createElement('a');email.textContent='Ver e-mail da fatura';email.href='https://mail.google.com/mail/u/?authuser='+encodeURIComponent(state.userEmail)+'#all/'+encodeURIComponent(invoice.source_message_id);email.target='_blank';email.rel='noopener noreferrer';actions.append(email);
  const undo=document.createElement('button');undo.type='button';undo.className='invoice-undo';undo.textContent='Desfazer importação';
  undo.onclick=()=>showConfirmToast(msg=>{msg.textContent='Remover somente os lançamentos desta fatura? Rendas e outros dados do mês serão mantidos. A automação respeitará essa decisão e não importará esta fatura novamente.';},[{label:'Desfazer',onClick:async()=>{
   await persistData();const {data,error}=await supabase.from('months').select('updated_at').eq('user_id',state.userId).eq('year',state.currentYear).eq('month',state.currentMonth).maybeSingle();if(error)throw error;
   const response=await supabase.rpc('undo_invoice_import',{p_import_id:invoice.id,p_expected_updated_at:data?.updated_at??null,p_user_id:state.userId});if(response.error)throw response.error;await window.reloadCurrentMonth();window.showToast('Importação desfeita; os outros dados foram mantidos.');
  }}]);actions.append(undo);card.append(actions);panel.append(card);
 }
};
function openReview(invoice){
 reviewing=invoice;
 document.getElementById('invoiceReviewAll').checked=false;
 drawReview();
 openModal('invoiceReviewModal');
}
function drawReview(){
 if(!reviewing)return;const body=document.getElementById('invoiceReviewBody');body.replaceChildren();
 const all=document.getElementById('invoiceReviewAll').checked,summary=invoiceSummary(state.sections,reviewing);
 const items=all?summary.transactions:summary.review;
 document.getElementById('invoiceReviewCount').textContent=items.length+' lançamentos exibidos. Os valores são os da fatura; escolha a categoria de cada um.';
 for(const item of items){
  const sec=state.sections.find(s=>s.items.some(i=>i.id===item.id)),row=document.createElement('div');row.className='invoice-review-row';
  const info=document.createElement('div');const label=document.createElement('strong');label.textContent=item.label;info.append(label);
  paragraph(info,[item.transactionDate?.split('-').reverse().join('/'),item.cardLast4?'Cartão •'+item.cardLast4:'NuPay/crédito sem cartão identificado',money(item.originalAmountCents)].filter(Boolean).join(' · '),'invoice-details');
  const select=document.createElement('select');select.dataset.itemId=item.id;select.setAttribute('aria-label','Categoria de '+item.label);
  for(const section of state.sections.filter(s=>s.id!=='nbcat_carryover')){const option=document.createElement('option');option.value=section.id;option.textContent=section.title;option.selected=section.id===sec.id;select.append(option);}
  row.append(info,select);body.append(row);
 }
 document.getElementById('invoiceReviewSave').disabled=!items.length;
}
window.closeInvoiceReview=()=>closeModal('invoiceReviewModal');
document.getElementById('invoiceReviewAll').addEventListener('change',drawReview);
window.confirmInvoiceReview=async()=>{
 if(state.busy||!reviewing)return;const button=document.getElementById('invoiceReviewSave');button.disabled=true;state.busy=true;
 try{
  const choices=[...document.querySelectorAll('#invoiceReviewBody select')].map(s=>({itemId:s.dataset.itemId,sectionId:s.value}));
  const data=applyInvoiceCategories(snapshotCurrent(),reviewing.id,choices);state.incomes=data.incomes;state.sections=data.sections;
  renderIncomes();renderSections();recalc();await persistData();closeModal('invoiceReviewModal');window.showToast('Categorias confirmadas. As correções serão usadas nas próximas faturas.');
 }catch{window.showToast('As categorias ficaram no dispositivo. Confira o salvamento para concluir.','error');}
 finally{state.busy=false;button.disabled=false;window.renderInvoicePanel();}
};
