import { cents,clone } from './finance.js';
export function invoiceSummary(sections,invoice){
 const items=sections.flatMap(s=>s.items??[]).filter(i=>i.invoiceId===invoice.id);
 const transactions=items.filter(i=>i.invoicePosition!=null);
 const totalCents=items.reduce((s,i)=>s+cents(i.val),0);
 const chargesCents=transactions.filter(i=>cents(i.val)>0).reduce((s,i)=>s+cents(i.val),0);
 const creditsCents=transactions.filter(i=>cents(i.val)<0).reduce((s,i)=>s+cents(i.val),0);
 const review=transactions.filter(i=>i.needsReview&&!i.categoryConfirmed);
 return {items,transactions,totalCents,chargesCents,creditsCents,review,
  reconciled:totalCents===Number(invoice.total_cents)&&transactions.length===invoice.entry_count};
}
export function applyInvoiceCategories(data,invoiceId,choices){
 const next=clone(data),seen=new Set();
 for(const choice of choices){
  if(seen.has(choice.itemId))throw Error('Lançamento repetido na revisão.');seen.add(choice.itemId);
  const from=next.sections.find(s=>s.items.some(i=>i.id===choice.itemId&&i.invoiceId===invoiceId));
  const dest=next.sections.find(s=>s.id===choice.sectionId);
  if(!from||!dest)throw Error('Categoria ou lançamento indisponível. Abra a revisão novamente.');
  const index=from.items.findIndex(i=>i.id===choice.itemId),item=from.items[index];
  item.needsReview=false;item.categoryConfirmed=true;item.categoryOrigin='manual';
  if(from!==dest){from.items.splice(index,1);dest.items.push(item);}
 }
 return next;
}
