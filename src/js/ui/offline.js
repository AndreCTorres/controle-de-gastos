import { showConfirmToast } from './toast.js';
import { repository } from '../db.js';
import { state } from '../state.js';
import { openModal,closeModal } from './modal.js';
import { monthTotals } from '../finance.js';
import { fmt } from '../utils.js';
let lastError=null,readOffline=false;
export const setPendingSave=()=>updateSync();
export function showOfflineBanner(){updateSync({offline:true});}
export function hideOfflineBanner(){updateSync();}
function updateSync(detail={}){
  detail=detail??{};
  if(detail.offline!==undefined)readOffline=detail.offline;
  if(detail.error)lastError=detail.error;
  const el=document.getElementById('syncStatus');if(!el)return;
  if(!state.userId){el.hidden=true;return;}
  el.hidden=false;
  const groups=repository.groups(),conflict=groups.some(g=>g.status==='conflict');
  if(state.localSaveError){el.dataset.status='conflict';el.textContent='⚠ Alterações ainda não guardadas';return;}
  el.dataset.status=conflict?'conflict':groups.length?'pending':(!navigator.onLine||readOffline)?'offline':'saved';
  el.textContent=conflict?'⚠ Revisar divergência':groups.length?'◷ '+groups.length+' alteração(ões) no dispositivo':(!navigator.onLine||readOffline)?'Sem acesso à nuvem · cópia local':'✓ Tudo salvo';
  if(!groups.length)lastError=null;
}
window.addEventListener('finance:sync',e=>updateSync(e.detail));
window.addEventListener('online',async()=>{if(!state.userId)return;try{await repository.flush();}catch{}updateSync();});
window.addEventListener('offline',()=>updateSync());
window.addEventListener('storage',()=>updateSync());
window.openSyncDetails=async function(){
  const body=document.getElementById('syncDetails');body.replaceChildren();
  const p=document.createElement('p');p.textContent='As alterações ficam guardadas neste navegador até serem sincronizadas. Divergências entre dispositivos exigem sua revisão.';body.append(p);
  if(lastError){const error=document.createElement('p');error.className='sync-warning';error.textContent=lastError.code==='LOCAL_STORAGE'?lastError.message:'A última sincronização não foi concluída. Sua cópia local continua disponível.';body.append(error);}
  for(const group of repository.groups()){
    const card=document.createElement('div');card.className='sync-group';
    const title=document.createElement('strong');title.textContent=group.label;card.append(title);
    for(const e of group.entries){
      const line=document.createElement('p');line.textContent=(e.type==='month'?(e.month+1)+'/'+e.year:'Metas de '+e.year);
      if(e.type==='month'){const t=monthTotals(e.payload);line.textContent+=' · cópia local: renda '+fmt(t.income)+', despesas '+fmt(t.expenses);}
      card.append(line);
      if(group.status==='conflict'){
        const table=e.type==='month'?'months':'monthly_goals';
        let q=repository.client.from(table).select(e.type==='month'?'data':'goals').eq('user_id',state.userId).eq('year',e.year);
        if(e.type==='month')q=q.eq('month',e.month);
        const {data,error}=await q.maybeSingle();
        const remote=document.createElement('p');
        if(error)remote.textContent='Não foi possível consultar a versão da nuvem.';
        else if(e.type==='month'&&data?.data){const t=monthTotals(data.data);remote.textContent='Nuvem: renda '+fmt(t.income)+', despesas '+fmt(t.expenses);}
        else remote.textContent='Nuvem: '+(data?'há metas salvas para este ano.':'ainda não há registro.');
        card.append(remote);
      }
    }
    if(group.status==='conflict')for(const [choice,label]of [['remote','Usar versão da nuvem'],['local','Reaplicar minha versão']]){
      const button=document.createElement('button');button.className='modal-btn-primary';button.textContent=label;
      button.onclick=()=>showConfirmToast(msg=>{msg.textContent=choice==='local'?'Sua cópia local substituirá os períodos acima na nuvem. Uma cópia de recuperação será mantida neste navegador. Confirmar?':'As alterações locais destes períodos serão arquivadas para recuperação. Carregar os dados da nuvem?';},[{label:'Confirmar',onClick:async()=>{
        try{await repository.resolve(group.id,choice);closeModal('syncModal');await window.reloadCurrentMonth?.();window.showToast('Divergência resolvida.');}catch(error){window.showToast('Não foi possível resolver agora. Tente novamente.','error');}
      }}]);
      card.append(button);
    }
    body.append(card);
  }
  openModal('syncModal');
};
window.retrySync=async()=>{try{await repository.flush();await window.openSyncDetails();}catch{await window.openSyncDetails();}};
window.downloadFullBackup=async()=>{
  const btn=document.getElementById('backupDownloadBtn');btn.disabled=true;
  try{
    const {data:months,error}=await repository.client.from('months').select('month,year,data,updated_at').eq('user_id',state.userId).order('year').order('month');if(error)throw error;
    const {data:goals,error:goalError}=await repository.client.from('monthly_goals').select('year,goals,updated_at').eq('user_id',state.userId);if(goalError)throw goalError;
    const backup={format:'controle-de-gastos',version:2,exportedAt:new Date().toISOString(),months,goals,pending:repository.groups(),recovery:repository.read('cgastos_v2_recovery_'+state.userId,[])};
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));link.download='controle-gastos-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }catch{window.showToast('Não foi possível baixar o backup completo. Verifique a conexão.','error');}
  finally{btn.disabled=false;}
};
setInterval(()=>{if(state.userId&&navigator.onLine&&repository.groups().some(g=>g.status!=='conflict'))repository.flush().catch(()=>{});},30000);
