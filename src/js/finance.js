export const clone = value => structuredClone(value);
export const newId = () => crypto.randomUUID();
export function cents(value) {
  if (value === '' || value == null) return 0;
  const raw = typeof value === 'number' ? String(value) : String(value).trim().replace(/^R\$\s*/, '');
  let s = raw;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) throw new Error('Use um valor válido com até duas casas decimais.');
  const sign = s.startsWith('-') ? -1 : 1;
  const [whole, decimal = ''] = s.replace('-', '').split('.');
  const result = sign * (Number(whole) * 100 + Number(decimal.padEnd(2, '0')));
  if (!Number.isSafeInteger(result) || Math.abs(result) > 999999999) throw new Error('Valor fora do limite permitido.');
  return result;
}
export function amount(value) { return cents(value) / 100; }
export function sumValues(items) { return (items || []).reduce((sum, item) => sum + cents(item.val), 0) / 100; }
export function monthTotals(data) {
  const income = sumValues(data.incomes);
  const expenses = (data.sections || []).reduce((sum, sec) => sum + Math.round(sumValues(sec.items) * 100), 0) / 100;
  return { income, expenses, balance: (Math.round(income * 100) - Math.round(expenses * 100)) / 100 };
}
export function installments(total, count, month, year) {
  const value = cents(total);
  if (!Number.isInteger(count) || count < 2 || count > 120 || value < count) throw new Error('Escolha de 2 a 120 parcelas, de pelo menos R$ 0,01 cada.');
  const base = Math.floor(value / count), remainder = value % count;
  return Array.from({length:count}, (_, i) => ({
    month:(month+i)%12, year:year+Math.floor((month+i)/12),
    val:((base+(i<remainder?1:0))/100).toFixed(2), num:i+1, total:count
  }));
}
export function addInstallment(data, section, parcel, title, purchaseId) {
  const result = clone(data);
  let target = result.sections.find(s => s.id === section.id);
  if (!target) { target = {...clone(section), items:[]}; result.sections.push(target); }
  if (!target.items.some(i => i.purchaseId === purchaseId)) target.items.push({
    id:newId(), label:title+' ('+parcel.num+'/'+parcel.total+')', val:parcel.val,
    parcel:true, purchaseId, parcelNumber:parcel.num, parcelCount:parcel.total
  });
  return result;
}
export function captureMonth(state, doc) {
  const incomeRows=new Map([...doc.querySelectorAll('.income-row')].map(row=>[row.dataset.iid,row]));
  const itemRows=new Map([...doc.querySelectorAll('.item-row')].map(row=>[JSON.stringify([row.dataset.sid,row.dataset.iid]),row]));
  return {
    incomes:state.incomes.map(inc => {
      const row=incomeRows.get(String(inc.id));
      return {...inc,label:row?.querySelector('.income-label input')?.value??inc.label,val:row?.querySelector('.income-input')?.value??inc.val};
    }),
    sections:state.sections.map(sec=>({...sec,items:sec.items.map(item=>{
      const row=itemRows.get(JSON.stringify([String(sec.id),String(item.id)]));
      return {...item,label:row?.querySelector('.label-input')?.value??item.label,val:row?.querySelector('.amount-input')?.value??item.val};
    })}))
  };
}
export function csvField(value) {
  let s=String(value??'');
  // An initial apostrophe stops spreadsheet formula execution; the importer removes this escape.
  if (/^[\s]*[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s)) s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function csvRows(text) {
  const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"') {if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c; }
    else if(c==='"'&&!cell){quoted=true;}
    else if(c===';'){row.push(cell);cell='';afterQuote=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';afterQuote=false;}
    else {if(afterQuote&&!/\s/.test(c))throw Error('CSV inválido depois das aspas.');cell+=c;}
  }
  if(quoted)throw Error('Há aspas sem fechamento no CSV.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
export function exportMonthCsv(data, monthLabel, year) {
  const rows=[['Controle de Gastos - '+monthLabel+' '+year],[],['RENDAS']];
  for(const inc of data.incomes)rows.push([inc.label,(cents(inc.val)/100).toFixed(2).replace('.',',')]);
  rows.push(['Total Renda',sumValues(data.incomes).toFixed(2).replace('.',',')]);
  for(const sec of data.sections){rows.push([],[sec.title,'color:'+sec.color,'bg:'+sec.bg,'id:'+sec.id]);for(const item of sec.items)rows.push([item.label,(cents(item.val)/100).toFixed(2).replace('.',','),'meta:'+JSON.stringify(Object.fromEntries(['id','parcel','purchaseId','parcelNumber','parcelCount','checked','source','invoiceId','invoicePosition','transactionDate','merchant','merchantKey','cardLast4','sourceCardLast4','originalAmountCents','invoiceKind','needsReview','categoryOrigin','categoryConfirmed'].filter(k=>item[k]!=null).map(k=>[k,item[k]])))]);}
  const t=monthTotals(data);rows.push([],['TOTAL DESPESAS',t.expenses.toFixed(2).replace('.',',')],['SALDO',t.balance.toFixed(2).replace('.',',')]);
  return '\uFEFF'+rows.map(row=>row.map(csvField).join(';')).join('\r\n');
}

export function copyPreviousMonth(current,previous,options){
 const data=clone(current);
 if(options.incomes)data.incomes=clone(previous.incomes??[]).map(i=>({...i,...(options.structureOnly?{val:''}:{})}));
 for(const source of previous.sections??[]){
  if(!options.sections.includes(source.id))continue;
  const next=clone(source);next.items=(next.items??[]).filter(i=>!i.parcel&&!i.invoiceId).map(i=>({...i,checked:false,...(options.structureOnly?{val:''}:{})}));
  const index=data.sections.findIndex(s=>s.id===source.id||s.title.trim().toLowerCase()===source.title.trim().toLowerCase());
  if(index>=0){next.items.push(...data.sections[index].items.filter(i=>i.parcel||i.invoiceId));data.sections[index]=next;}
  else data.sections.push(next);
 }
 return data;
}
