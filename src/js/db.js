import { supabase } from './config.js';
import { state } from './state.js';
import { FinanceRepository } from './repository.js';
let tabId;
try { tabId=sessionStorage.getItem('cgastos_tab_id'); if(!tabId){tabId=crypto.randomUUID();sessionStorage.setItem('cgastos_tab_id',tabId);} }catch{tabId=crypto.randomUUID();}
export const repository=new FinanceRepository({
  client:supabase,storage:localStorage,userId:()=>state.userId,tabId,
  notify:detail=>window.dispatchEvent(new CustomEvent('finance:sync',{detail}))
});
export const loadMonthData=(month,year)=>repository.load('month',month,year);
export const loadYearGoals=year=>repository.load('goals',null,year);
export const saveMonthData=(month,year,payload)=>repository.save([{type:'month',month,year,payload}],{coalesce:true});
export const saveYearGoals=(year,payload)=>repository.save([{type:'goals',year,payload}],{coalesce:true,label:'Metas do ano'});
export const saveMonthsAtomic=(entries,label)=>repository.save(entries.map(e=>({...e,type:'month'})),{label});
export const loadYearData=year=>repository.listYear(year);
export async function loadMonthsWithData(){
  if(!state.userId)return [];
  const {data,error}=await supabase.from('months').select('month, year').eq('user_id',state.userId).order('year').order('month');
  if(error)throw error;
  const entries=[...(data??[])];
  for(const g of repository.groups())for(const e of g.entries)if(e.type==='month'&&!entries.some(r=>r.month===e.month&&r.year===e.year))entries.push({month:e.month,year:e.year});
  return entries;
}
