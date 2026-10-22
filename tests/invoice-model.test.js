import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceSummary,applyInvoiceCategories } from '../src/js/invoice-model.js';
import { exportMonthCsv,copyPreviousMonth } from '../src/js/finance.js';
import { parseImportCsv } from '../src/js/csv.js';
const invoice={id:'invoice-test',entry_count:3,total_cents:121500};
const data={incomes:[{id:'main',label:'Renda',val:''}],sections:[
 {id:'a',title:'Pessoal',color:'#123456',bg:'#eeeeee',items:[
 {id:'one',label:'Compra igual',val:'610.00',source:'nubank',invoiceId:invoice.id,invoicePosition:1,transactionDate:'2026-10-01',originalAmountCents:61000,merchantKey:'LOJA',cardLast4:'1111'},
 {id:'two',label:'Compra igual',val:'610.00',source:'nubank',invoiceId:invoice.id,invoicePosition:2,originalAmountCents:61000,needsReview:true},
 {id:'refund',label:'Crédito de loja',val:'-10.00',source:'nubank',invoiceId:invoice.id,invoicePosition:3,originalAmountCents:-1000,needsReview:true},
 {id:'carry',label:'Saldo anterior',val:'5.00',source:'nubank',invoiceId:invoice.id,invoiceKind:'carryover'}]},
 {id:'b',title:'Outra pessoa',color:'#654321',bg:'#eeeeee',items:[]}
]};
test('invoice totals preserve duplicate purchases and subtract credits once',()=>{
 const result=invoiceSummary(data.sections,invoice);
 assert.equal(result.transactions.length,3);assert.equal(result.chargesCents,122000);
 assert.equal(result.creditsCents,-1000);assert.equal(result.totalCents,121500);
 assert.equal(result.review.length,2);assert.equal(result.reconciled,true);
});
test('a missing source entry is reported as a discrepancy',()=>{
 const copy=structuredClone(data);copy.sections[0].items.splice(0,1);
 assert.equal(invoiceSummary(copy.sections,invoice).reconciled,false);
});
test('category corrections preserve original cents and source metadata',()=>{
 const next=applyInvoiceCategories(data,invoice.id,[{itemId:'refund',sectionId:'b'}]);
 assert.equal(data.sections[1].items.length,0);assert.equal(next.sections[1].items[0].val,'-10.00');
 assert.equal(next.sections[1].items[0].categoryConfirmed,true);assert.equal(next.sections[1].items[0].needsReview,false);
 assert.equal(invoiceSummary(next.sections,invoice).totalCents,121500);
});
test('review cannot move another invoice or silently create a category',()=>{
 assert.throws(()=>applyInvoiceCategories(data,'different',[{itemId:'one',sectionId:'b'}]));
 assert.throws(()=>applyInvoiceCategories(data,invoice.id,[{itemId:'one',sectionId:'missing'}]));
 assert.throws(()=>applyInvoiceCategories(data,invoice.id,[{itemId:'one',sectionId:'b'},{itemId:'one',sectionId:'b'}]));
});
test('signed invoice CSV round trip preserves origin and equal legitimate entries',()=>{
 const parsed=parseImportCsv(exportMonthCsv(data,'Outubro',2026));
 assert.equal(parsed.sections[0].items.length,4);
 assert.equal(parsed.sections[0].items[2].val,'-10.00');
 assert.equal(parsed.sections[0].items[0].invoiceId,invoice.id);
 assert.equal(parsed.sections[0].items[0].originalAmountCents,61000);
 assert.equal(invoiceSummary(parsed.sections,invoice).reconciled,true);
});
test('copying another month does not copy posted card expenses or credits',()=>{
 const next=copyPreviousMonth({incomes:[],sections:[]},data,{incomes:false,sections:['a'],structureOnly:false});
 assert.equal(next.sections[0].items.length,0);
 const preserved=copyPreviousMonth(data,data,{incomes:false,sections:['a'],structureOnly:true});
 assert.equal(preserved.sections[0].items.filter(i=>i.invoiceId).length,4);
});
