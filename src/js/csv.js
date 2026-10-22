import { cents, csvRows, newId } from './finance.js';
import { DEFAULT_SECTIONS, NEW_SEC_COLORS } from './constants.js';
function labelValue(value){return String(value??'').replace(/^'(?=[\s]*[=+\-@\t\r])/,'');}
function numeric(raw,line){
  let s=String(raw??'').trim().replace(/^R\$\s*/,'');
  if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  let value;try{value=cents(s);}catch{throw Error('Valor inválido na linha '+line+': '+raw+'. Use, por exemplo, 1250,50.');}
  if(value<0)throw Error('Valor negativo na linha '+line+'. Registre um valor maior ou igual a zero.');
  return s===''?'':(value/100).toFixed(2);
}
export function parseImportCsv(raw){
  if(String(raw).length>2000000)throw Error('O CSV excede o limite de 2 MB.');
  const rows=csvRows(raw);if(rows.length<2)throw Error('O CSV está vazio ou incompleto.');
  const incomes=[],sections=[];let section=null,palette=0;
  for(const [index,fields]of rows.entries()){
    const label=labelValue(fields[0]);
    if(!label.trim())throw Error('Descrição vazia na linha '+(index+1)+'.');
    if(fields.length===1&&(label.startsWith('Controle de Gastos')||label.toUpperCase()==='RENDAS'))continue;
    if(['Total Renda','TOTAL DESPESAS','SALDO'].includes(label))continue;
    if((fields[1]??'').startsWith('color:')){
      if(fields.length<3||!(fields[2]??'').startsWith('bg:'))throw Error('Cabeçalho de categoria inválido na linha '+(index+1)+'.');
      const color=fields[1].slice(6),bg=fields[2].slice(3);
      if([color,bg].some(c=>c&&!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)))throw Error('Cor inválida na categoria '+label+'.');
      if(sections.some(s=>s.title.trim().toLowerCase()===label.trim().toLowerCase()))throw Error('A categoria '+label+' aparece mais de uma vez. Una seus itens em um único bloco.');
      const def=DEFAULT_SECTIONS.find(s=>s.title.toLowerCase()===label.trim().toLowerCase()),p=NEW_SEC_COLORS[palette++%NEW_SEC_COLORS.length];
      const stableId=fields[3]?.startsWith('id:')?fields[3].slice(3):null;
      section={id:stableId||def?.id||newId(),title:label,color:color||def?.color||p.color,bg:bg||def?.bg||p.bg,items:[]};
      if(sections.some(s=>s.id===section.id))throw Error('Identificador de categoria duplicado.');
      sections.push(section);continue;
    }
    if(fields.length===1){const def=DEFAULT_SECTIONS.find(s=>s.title.toLowerCase()===label.toLowerCase());if(def){section={...structuredClone(def),items:[]};sections.push(section);continue;}}
    if(fields.length<2||fields.length>3)throw Error('Linha '+(index+1)+' fora do formato nome;valor. Descrições com ponto e vírgula precisam de aspas.');
    const val=numeric(fields[1],index+1);
    if(!section){incomes.push({id:incomes.length===0?'main':newId(),label,val});continue;}
    let metadata={};
    if(fields[2]){
      if(!fields[2].startsWith('meta:'))throw Error('Coluna extra desconhecida na linha '+(index+1)+'.');
      try{const source=JSON.parse(fields[2].slice(5));for(const key of ['id','parcel','purchaseId','parcelNumber','parcelCount','checked'])if(source[key]!=null)metadata[key]=source[key];}catch{throw Error('Metadados inválidos na linha '+(index+1)+'.');}
    }
    section.items.push({...metadata,id:typeof metadata.id==='string'?metadata.id:newId(),label,val});
  }
  if(!sections.length)throw Error('Nenhuma categoria encontrada. Use Nome;color:#COR;bg:#FUNDO.');
  const ids=sections.flatMap(s=>s.items.map(i=>i.id));if(new Set(ids).size!==ids.length)throw Error('Há identificadores de itens repetidos no CSV.');
  if(!incomes.length)incomes.push({id:'main',label:'Renda principal',val:''});
  return {incomes,sections};
}
export function mergeMonthData(current,incoming){
  const data=structuredClone(current);
  const norm=s=>String(s??'').trim().toLowerCase();
  let skipped=0;
  for(const inc of incoming.incomes){
    if(data.incomes.some(i=>norm(i.label)===norm(inc.label)&&cents(i.val)===cents(inc.val))){skipped++;continue;}
    data.incomes.push({...inc,id:newId()});
  }
  for(const section of incoming.sections){
    let target=data.sections.find(s=>s.id===section.id||norm(s.title)===norm(section.title));
    if(!target){target={...section,items:[]};data.sections.push(target);}
    for(const item of section.items){
      if(target.items.some(i=>i.id===item.id||(norm(i.label)===norm(item.label)&&cents(i.val)===cents(item.val)))){skipped++;continue;}
      target.items.push({...item,id:newId()});
    }
  }
  return {data,skipped};
}
