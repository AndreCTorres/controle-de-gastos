import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, installments, addInstallment, exportMonthCsv, monthTotals } from '../src/js/finance.js';
import { parseImportCsv,mergeMonthData } from '../src/js/csv.js';
const source={incomes:[{id:'main',label:'Renda; "extra"',val:'1250.50'}],sections:[{id:'custom1',title:'Casa; extras',color:'#234567',bg:'#eeeeee',items:[{id:'a',label:'=1+1\nsegunda linha',val:'33.34',parcel:true,purchaseId:'p',parcelNumber:1,parcelCount:3,checked:true},{id:'b',label:'Outros',val:'0.10'},{id:'c',label:'Mais',val:'0.20'}]}]};
test('money accepts BRL and rejects ambiguous or invalid values',()=>{
 for(const [raw,want]of [['1250,50',125050],['1.250,50',125050],['0.1',10],['R$ 3,99',399],['',0]])assert.equal(cents(raw),want);
 for(const raw of ['1,2,3','5abc','Infinity','1.234'])assert.throws(()=>cents(raw));
});
test('installments sum to the original cent, including year changes',()=>{
 for(const total of ['100.00','0.03','9999999.00'])for(const count of [2,3,12,120]){
  if(cents(total)<count)continue;
  const values=installments(total,count,11,2026);
  assert.equal(values.reduce((s,p)=>s+cents(p.val),0),cents(total));
  assert.equal(values[1].month,0);assert.equal(values[1].year,2027);
  assert.ok(Math.max(...values.map(p=>cents(p.val)))-Math.min(...values.map(p=>cents(p.val)))<=1);
 }
 for(const n of [1,121,2.5,NaN])assert.throws(()=>installments('100',n,0,2026));
 assert.throws(()=>installments('0.01',2,0,2026));
});
test('custom category is created for future installments and retry is idempotent',()=>{
 const original={incomes:[],sections:[]},section=source.sections[0],p=installments('100',3,11,2026)[0];
 const data=addInstallment(original,section,p,'Compra','purchase');
 assert.equal(original.sections.length,0);assert.equal(data.sections[0].items.length,1);
 assert.equal(data.sections[0].items[0].val,'33.34');
 assert.equal(addInstallment(data,section,p,'Compra','purchase').sections[0].items.length,1);
});
test('CSV round trip preserves quotes, semicolons, multiline labels, metadata and totals',()=>{
 const csv=exportMonthCsv(source,'Outubro',2026),parsed=parseImportCsv(csv);
 assert.equal(parsed.incomes[0].label,source.incomes[0].label);
 assert.equal(parsed.sections[0].title,source.sections[0].title);
 assert.deepEqual(parsed.sections[0].items,source.sections[0].items);
 assert.deepEqual(monthTotals(parsed),monthTotals(source));
 assert.ok(csv.includes("'=1+1"));
});
test('CSV reads large Brazilian decimal values and rejects malformed rows',()=>{
 const input='Salário;1250,50\nCasa;color:;bg:\nConta;1.234,56';
 const data=parseImportCsv(input);assert.equal(data.incomes[0].val,'1250.50');assert.equal(data.sections[0].items[0].val,'1234.56');
 for(const bad of ['abc','1.234,567','1,234'])assert.throws(()=>parseImportCsv(input.replace('1.234,56',bad)));
 assert.throws(()=>parseImportCsv('Salário;10\nCasa;color:;bg:\n"sem fechar;20'));
});
test('repeated merge import skips equal entries and never overwrites another income',()=>{
 const first=mergeMonthData(source,source);assert.equal(first.data.sections[0].items.length,3);assert.equal(first.data.incomes.length,1);
 const changed=structuredClone(source);changed.incomes[0].val='300.00';
 const merged=mergeMonthData(source,changed);assert.equal(merged.data.incomes.length,2);assert.equal(merged.data.incomes[0].val,'1250.50');
 assert.equal(monthTotals({incomes:[],sections:[{items:[{val:'0.10'},{val:'0.20'}]}]}).expenses,0.3);
});

test('copying recurring expenses skips old installments and preserves current ones',async()=>{
 const {copyPreviousMonth}=await import('../src/js/finance.js');
 const previous=structuredClone(source),current=structuredClone(source);
 previous.sections[0].items[0].label='Parcela antiga';current.sections[0].items[0].label='Parcela atual';
 const result=copyPreviousMonth(current,previous,{incomes:true,sections:['custom1'],structureOnly:true});
 assert.equal(result.incomes[0].val,'');assert.equal(result.sections[0].items.filter(i=>i.parcel).length,1);
 assert.equal(result.sections[0].items.find(i=>i.parcel).label,'Parcela atual');
 assert.ok(result.sections[0].items.filter(i=>!i.parcel).every(i=>i.val===''));
 assert.equal(current.sections[0].items[1].val,'0.10');
});

test('month snapshot keeps metadata and reads matching section rows only',async()=>{
 const {captureMonth}=await import('../src/js/finance.js');
 const itemRow={dataset:{sid:'different',iid:'same'},querySelector:s=>({value:'999'})};
 const doc={querySelectorAll:s=>s==='.item-row'?[itemRow]:[]};
 const state={incomes:[],sections:[{id:'selected',items:[{id:'same',label:'Original',val:'12.34',parcel:true,purchaseId:'purchase'}]}]};
 const result=captureMonth(state,doc);
 assert.equal(result.sections[0].items[0].val,'12.34');assert.equal(result.sections[0].items[0].purchaseId,'purchase');
});
