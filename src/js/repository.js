import { clone } from './finance.js';
export class FinanceRepository {
  constructor({client, storage, userId, notify=()=>{}, tabId=crypto.randomUUID()}) {
    Object.assign(this,{client,storage,userId,notify,tabId});
    this.bases=new Map();this.running=null;
  }
  user(){const id=this.userId();if(!id)throw Error('Entre novamente para acessar seus dados.');return id;}
  key(type,month,year){return type+'_'+year+'_'+(type==='month'?month:'all');}
  cacheKey(id,key){return 'cgastos_v2_cache_'+id+'_'+key;}
  queueKey(id){return 'cgastos_v2_outbox_'+id+'_'+this.tabId;}
  read(key,fallback=null){try{return JSON.parse(this.storage.getItem(key))??fallback;}catch{return fallback;}}
  write(key,data){try{this.storage.setItem(key,JSON.stringify(data));}catch{throw Object.assign(Error('Não foi possível guardar uma cópia neste navegador. Exporte um backup antes de sair.'),{code:'LOCAL_STORAGE'});}}
  groups(id=this.user()){const prefix='cgastos_v2_outbox_'+id+'_';const groups=[];for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(prefix))for(const group of this.read(key,[]))groups.push({...group,queueKey:key});}return groups.sort((a,b)=>a.ts-b.ts);}
  pending(key,id=this.user()){return this.groups(id).flatMap(g=>g.entries.map(e=>({...e,groupId:g.id,groupRevision:g.revision}))).filter(e=>e.key===key).at(-1);}
  async load(type,month,year) {
    const id=this.user(), key=this.key(type,month,year), queued=this.pending(key,id);
    if(queued){this.bases.set(id+'_'+key,{payload:clone(queued.payload),version:queued.expectedUpdatedAt,unknown:queued.unknown,pendingGroupId:queued.groupId,pendingRevision:queued.groupRevision});this.notify();return clone(queued.payload);}
    try {
      let query=this.client.from(type==='month'?'months':'monthly_goals').select(type==='month'?'data, updated_at':'goals, updated_at').eq('user_id',id).eq('year',year);
      if(type==='month')query=query.eq('month',month);
      const {data,error}=await query.maybeSingle();if(error)throw error;
      if(this.userId()!==id)throw Error('A conta mudou durante o carregamento.');
      const result={payload:data?.[type==='month'?'data':'goals']??null,version:data?.updated_at??null};
      this.bases.set(id+'_'+key,clone(result));this.write(this.cacheKey(id,key),result);
      this.notify({offline:false});return clone(result.payload);
    } catch(error) {
      const cached=this.read(this.cacheKey(id,key));
      if(cached){this.bases.set(id+'_'+key,clone(cached));this.notify({offline:true});return clone(cached.payload);}
      // Legacy cache is readable, but has no safe server version: never overwrite blindly.
      const legacyKey=type==='month'?'cgastos_v1_'+id+'_'+year+'_'+month:'cgastos_v1_goals_'+id+'_'+year;
      const legacy=this.read(legacyKey)?.data;
      if(legacy){this.bases.set(id+'_'+key,{payload:clone(legacy),version:null,unknown:true});this.notify({offline:true});return clone(legacy);}
      throw error;
    }
  }
  stage(entries,{label='Alterações do mês',coalesce=false}={}) {
    const id=this.user(), groups=this.read(this.queueKey(id),[]);
    const prepared=entries.map(e=>{
      const key=this.key(e.type,e.month,e.year);
      const existing=this.pending(key,id);
      const base=existing?{version:existing.expectedUpdatedAt,unknown:existing.unknown}:this.bases.get(id+'_'+key);
      if(!base)throw Error('Carregue os dados deste período antes de alterá-los.');
      const loaded=this.bases.get(id+'_'+key);
      return {...clone(e),key,expectedUpdatedAt:base.version,unknown:!!base.unknown,dependsOn:loaded?.pendingGroupId,parentRevision:loaded?.pendingRevision};
    });
    const own=coalesce&&prepared.length===1?groups.find(g=>g.entries.length===1&&g.entries[0].key===prepared[0].key&&!g.sending):null;
    if(own){own.entries=prepared;own.revision++;own.ts=Date.now();own.status='pending';}
    else groups.push({id:crypto.randomUUID(),ts:Date.now(),revision:1,label,status:'pending',entries:prepared});
    this.write(this.queueKey(id),groups);this.notify();
    return own?.id??groups.at(-1).id;
  }
  async save(entries,options={}) {this.stage(entries,options);return this.flush();}
  async flush() {
    if(this.running)return this.running;
    const id=this.user();
    this.running=this.performFlush(id).finally(()=>{this.running=null;this.notify();});
    return this.running;
  }
  async performFlush(id) {
    for(let group; (group=this.groups(id)[0]);){
      if(this.userId()!==id)throw Error('A conta mudou durante a sincronização.');
      if(group.status==='conflict')throw Object.assign(Error('Este período mudou em outro dispositivo. Revise as duas versões.'),{code:'CONFLICT'});
      try {
        // A legacy offline cache cannot establish an expected version without comparison.
        for(const entry of group.entries.filter(e=>e.unknown)){
          let query=this.client.from(entry.type==='month'?'months':'monthly_goals').select(entry.type==='month'?'data, updated_at':'goals, updated_at').eq('user_id',id).eq('year',entry.year);
          if(entry.type==='month')query=query.eq('month',entry.month);
          const {data,error}=await query.maybeSingle();if(error)throw error;
          const legacy=this.read(entry.type==='month'?'cgastos_v1_'+id+'_'+entry.year+'_'+entry.month:'cgastos_v1_goals_'+id+'_'+entry.year)?.data;
          if(JSON.stringify(data?.[entry.type==='month'?'data':'goals']??null)!==JSON.stringify(legacy??null))throw Object.assign(Error('Revise a cópia antiga antes de substituir dados da nuvem.'),{code:'CONFLICT'});
          entry.expectedUpdatedAt=data?.updated_at??null;
        }
        const changes=group.entries.map(e=>({user_id:id,type:e.type,month:e.month,year:e.year,payload:e.payload,expected_updated_at:e.expectedUpdatedAt}));
        const {data,error}=await this.client.rpc('save_finance_batch',{changes});if(error)throw error;
        const groups=this.read(group.queueKey,[]);
        const current=groups.find(g=>g.id===group.id);
        for(const result of data){
          const key=this.key(result.type,result.month,result.year), entry=group.entries.find(e=>e.key===key);
          const base={payload:entry.payload,version:result.updated_at};
          this.bases.set(id+'_'+key,clone(base));this.write(this.cacheKey(id,key),base);
          // Edits made during the request remain queued and now build on the saved revision.
          for(const pending of groups)for(const e of pending.entries)if(e.key===key&&e.expectedUpdatedAt===entry.expectedUpdatedAt){e.expectedUpdatedAt=result.updated_at;e.unknown=false;}
        }
        for(const queue of new Set(this.groups(id).map(g=>g.queueKey))){
          if(queue===group.queueKey)continue;
          const nextGroups=this.read(queue,[]);
          for(const pending of nextGroups)for(const e of pending.entries){
            if(e.dependsOn!==group.id||e.parentRevision!==group.revision)continue;
            const result=data.find(r=>this.key(r.type,r.month,r.year)===e.key);
            if(result){e.expectedUpdatedAt=result.updated_at;e.unknown=false;delete e.dependsOn;delete e.parentRevision;}
          }
          this.write(queue,nextGroups);
        }
        if(current?.revision===group.revision)groups.splice(groups.indexOf(current),1);
        this.write(group.queueKey,groups);
      } catch(error) {
        const conflict=['40001','23505','CONFLICT'].includes(error.code);
        if(conflict){const groups=this.read(group.queueKey,[]);const current=groups.find(g=>g.id===group.id);if(current)current.status='conflict';this.write(group.queueKey,groups);}
        this.notify({error,conflict});
        throw error;
      }
    }
    // Include newer edits queued while a previous revision was in flight.
    if(this.groups(id).some(g=>g.status!=='conflict'))return this.performFlush(id);
    return true;
  }
  async listYear(year) {
    const id=this.user();const {data,error}=await this.client.from('months').select('month, year, data, updated_at').eq('user_id',id).eq('year',year).order('month');
    if(error)throw error;
    const rows=data??[];
    for(const row of rows){const key=this.key('month',row.month,year);if(!this.pending(key,id)){const base={payload:row.data,version:row.updated_at};this.bases.set(id+'_'+key,clone(base));this.write(this.cacheKey(id,key),base);}}
    for(const group of this.groups(id))for(const e of group.entries)if(e.type==='month'&&e.year===year){const idx=rows.findIndex(r=>r.month===e.month);const row={month:e.month,year,data:clone(e.payload),pending:true};if(idx<0)rows.push(row);else rows[idx]=row;}
    return rows.sort((a,b)=>a.month-b.month);
  }
  archive(label,entries){const id=this.user(),key='cgastos_v2_recovery_'+id;const list=this.read(key,[]);list.unshift({at:new Date().toISOString(),label,entries:clone(entries)});this.write(key,list.slice(0,10));}
  async resolve(groupId,choice) {
    const id=this.user(),group=this.groups(id).find(g=>g.id===groupId);if(!group)return;
    this.archive('Antes de resolver divergência',group.entries);
    if(choice==='local')for(const e of group.entries){
      let q=this.client.from(e.type==='month'?'months':'monthly_goals').select('updated_at').eq('user_id',id).eq('year',e.year);
      if(e.type==='month')q=q.eq('month',e.month);
      const {data,error}=await q.maybeSingle();if(error)throw error;e.expectedUpdatedAt=data?.updated_at??null;e.unknown=false;
    }
    const groups=this.read(group.queueKey,[]),index=groups.findIndex(g=>g.id===groupId);
    if(choice==='remote')groups.splice(index,1);
    else groups[index]={...group,status:'pending',revision:group.revision+1};
    this.write(group.queueKey,groups);this.notify();
    if(choice==='local')await this.flush();
  }
}
