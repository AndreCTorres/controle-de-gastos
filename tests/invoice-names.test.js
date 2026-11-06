import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceNameKey, canNamePurchase, renameInvoiceItem } from '../src/js/invoice-names.js';
import { exportMonthCsv } from '../src/js/finance.js';
import { parseImportCsv } from '../src/js/csv.js';
const bed={id:'bed',label:'Blue (1/12)',val:'250.00',source:'nubank',merchant:'Blue',merchantKey:'BLUE',sourceCardLast4:'1111',cardLast4:'1111',originalAmountCents:25000,parcelNumber:1,parcelCount:12,invoiceId:'inv',invoicePosition:1};
const data={incomes:[],sections:[{id:'home',title:'Casa',color:'#123456',bg:'#eeeeee',items:[bed]}]};
test('a purchase identity follows installments across December and January, without merging a new purchase or card',()=>{
 const key=invoiceNameKey(bed,2026,11,'purchase');
 assert.equal(key,invoiceNameKey({...bed,parcelNumber:2},2027,0,'purchase'));
 for(const other of [{...bed,parcelNumber:1},{...bed,parcelNumber:2,sourceCardLast4:'2222'},{...bed,parcelNumber:2,originalAmountCents:26000}])assert.notEqual(key,invoiceNameKey(other,2027,0,'purchase'));
});
test('a friendly name preserves source, cents and installment numbering, and survives CSV',()=>{
 const renamed=renameInvoiceItem(data,'bed','Cama','purchase',2026,11);
 const item=renamed.sections[0].items[0];assert.equal(item.label,'Cama (1/12)');assert.equal(item.originalLabel,'Blue (1/12)');assert.equal(item.originalAmountCents,25000);assert.equal(bed.label,'Blue (1/12)');
 const parsed=parseImportCsv(exportMonthCsv(renamed,'Dezembro',2026));assert.equal(parsed.sections[0].items[0].friendlyName,'Cama');assert.equal(parsed.sections[0].items[0].nameScope,'purchase');
 const reset=renameInvoiceItem(renamed,'bed','','purchase',2026,11);assert.equal(reset.sections[0].items[0].label,'Blue (1/12)');
});
test('identical ambiguous purchases require a name for this entry only',()=>{
 const duplicate=structuredClone(data);duplicate.sections[0].items.push({...bed,id:'other',invoicePosition:2});
 assert.equal(canNamePurchase(bed,duplicate.sections,2026,11),false);
 assert.throws(()=>renameInvoiceItem(duplicate,'bed','Cama','purchase',2026,11));
 assert.equal(renameInvoiceItem(duplicate,'bed','Cama','once',2026,11).sections[0].items[1].label,bed.label);
});
test('credits cannot inherit a recurring purchase name and invalid scope or long names are rejected',()=>{
 assert.equal(invoiceNameKey({...bed,originalAmountCents:-25000},2026,11,'merchant'),null);
 assert.throws(()=>renameInvoiceItem(data,'bed','Cama','invalid',2026,11));
 assert.throws(()=>renameInvoiceItem(data,'bed','a'.repeat(101),'once',2026,11));
});
