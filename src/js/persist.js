import { repository } from './db.js';
import { state } from './state.js';
import { captureMonth } from './finance.js';
let lastQueued=null;
export function resetSaveSnapshot(){const payload=captureMonth(state,document);state.incomes=payload.incomes;state.sections=payload.sections;lastQueued=state.userId+'_'+state.currentYear+'_'+state.currentMonth+'_'+JSON.stringify(payload);}
export function snapshotCurrent(){
  const payload=captureMonth(state,document);
  state.incomes=payload.incomes;state.sections=payload.sections;
  return payload;
}
export function scheduleSave(){
  if(!state.userId||state.loading||!state.monthReady)return;
  const payload=snapshotCurrent();
  const identity=state.userId+'_'+state.currentYear+'_'+state.currentMonth+'_'+JSON.stringify(payload);
  if(identity===lastQueued)return;
  try {
    repository.stage([{type:'month',month:state.currentMonth,year:state.currentYear,payload}],{coalesce:true});
    state.localSaveError=null;lastQueued=identity;
    clearTimeout(state.saveTimer);
    state.saveTimer=setTimeout(()=>{state.saveTimer=null;persistData().catch(()=>{});},800);
    return true;
  }catch(error){state.localSaveError=error;window.dispatchEvent(new CustomEvent('finance:sync',{detail:{error}}));window.showToast(error.message,'error');return false;}
}
export async function persistData(){
  clearTimeout(state.saveTimer);state.saveTimer=null;
  if(scheduleSave()===false)throw state.localSaveError;clearTimeout(state.saveTimer);state.saveTimer=null;
  try {await repository.flush();return true;}
  catch(error){
    const conflict=['CONFLICT','40001','23505'].includes(error.code);
    window.dispatchEvent(new CustomEvent('finance:sync',{detail:{error,conflict}}));
    throw error;
  }
}
export async function persistFutureMonth(month,year,payload){await repository.save([{type:'month',month,year,payload}]);}
// The durable outbox is written synchronously on every edit, before any network debounce.
window.addEventListener('pagehide',()=>{clearTimeout(state.saveTimer);state.saveTimer=null;});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.userId)persistData().catch(()=>{});});

window.addEventListener('beforeunload',event=>{if(state.localSaveError){event.preventDefault();event.returnValue='';}});
