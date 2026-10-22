import test from 'node:test';
import assert from 'node:assert/strict';
import { FinanceRepository } from '../src/js/repository.js';
class Storage {constructor(){this.map=new Map();}get length(){return this.map.size;}key(n){return [...this.map.keys()][n];}getItem(k){return this.map.get(k)??null;}setItem(k,v){this.map.set(k,v);}}
function setup(){
 const storage=new Storage(),rows=new Map();let network=true,version=0,calls=0,gate=null;
 const getKey=(table,f)=>table+'_'+f.year+'_'+(f.month??'all');
 const client={
 from(table){const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},order(){return this;},
 async maybeSingle(){if(!network)return {error:{code:'NETWORK'}};return {data:structuredClone(rows.get(getKey(table,filters))??null)}},
 then(resolve){if(!network)return resolve({error:{code:'NETWORK'}});resolve({data:[...rows.entries()].filter(([key])=>key.startsWith(table+'_'+filters.year+'_')).map(([key,row])=>({month:Number(key.split('_')[2]),year:filters.year,...structuredClone(row)}))});}
 };},
 async rpc(name,{changes}){calls++;if(gate)await gate;if(!network)return {error:{code:'NETWORK'}};const updated=[];
 for(const c of changes){const key=getKey(c.type==='month'?'months':'monthly_goals',c),row=rows.get(key);if((row?.updated_at??null)!==c.expected_updated_at)return {error:{code:'40001'}};updated.push([key,{[c.type==='month'?'data':'goals']:structuredClone(c.payload),updated_at:'v'+(++version)},c]);}
 for(const [key,row]of updated)rows.set(key,row);
 return {data:updated.map(([,row,c])=>({type:c.type,month:c.month,year:c.year,updated_at:row.updated_at}))};}
 };
 const repo=new FinanceRepository({client,storage,userId:()=> 'owner',tabId:'tab1'});
 return {repo,storage,rows,client,setNetwork:v=>network=v,setGate:v=>gate=v,getCalls:()=>calls};
}
const payload=n=>({incomes:[{id:'main',label:'Renda',val:String(n)}],sections:[]});
test('reading a month never writes or queues a save',async()=>{
 const {repo,getCalls}=setup();assert.equal(await repo.load('month',0,2026),null);assert.equal(repo.groups().length,0);assert.equal(getCalls(),0);
});
test('offline edits survive a reload and sync every month and goals',async()=>{
 const s=setup();for(const m of [0,1])await s.repo.load('month',m,2026);await s.repo.load('goals',null,2026);s.setNetwork(false);
 for(const m of [0,1])s.repo.stage([{type:'month',month:m,year:2026,payload:payload(m+1)}]);
 s.repo.stage([{type:'goals',year:2026,payload:{0:{c:300}}}]);
 await assert.rejects(s.repo.flush());
 const reloaded=new FinanceRepository({client:s.client,storage:s.storage,userId:()=> 'owner',tabId:'tab2'});
 assert.equal((await reloaded.load('month',0,2026)).incomes[0].val,'1');
 assert.equal(reloaded.groups().length,3);s.setNetwork(true);await reloaded.flush();
 assert.equal(reloaded.groups().length,0);assert.equal(s.rows.size,3);
});
test('a changed remote version blocks stale overwrites',async()=>{
 const s=setup();await s.repo.load('month',0,2026);s.repo.stage([{type:'month',month:0,year:2026,payload:payload(10)}]);
 s.rows.set('months_2026_0',{data:payload(20),updated_at:'other'});
 await assert.rejects(s.repo.flush());assert.equal(s.repo.groups()[0].status,'conflict');assert.equal(s.rows.get('months_2026_0').data.incomes[0].val,'20');
 assert.equal((await s.repo.load('month',0,2026)).incomes[0].val,'10');
});
test('edits made during an in-flight request are not lost',async()=>{
 const s=setup();await s.repo.load('month',0,2026);
 s.repo.stage([{type:'month',month:0,year:2026,payload:payload(10)}],{coalesce:true});
 let release;const barrier=new Promise(r=>release=r);s.setGate(barrier);
 const saving=s.repo.flush();await new Promise(r=>setTimeout(r,0));
 s.repo.stage([{type:'month',month:0,year:2026,payload:payload(30)}],{coalesce:true});
 s.setGate(null);release();await saving;
 assert.equal(s.rows.get('months_2026_0').data.incomes[0].val,'30');assert.equal(s.repo.groups().length,0);assert.equal(s.getCalls(),2);
});
test('atomic group is retained intact if one period conflicts',async()=>{
 const s=setup();for(const m of [0,1])await s.repo.load('month',m,2026);
 s.repo.stage([0,1].map(month=>({type:'month',month,year:2026,payload:payload(10)})),{label:'Compra'});
 s.rows.set('months_2026_1',{data:payload(20),updated_at:'other'});
 await assert.rejects(s.repo.flush());assert.equal(s.rows.has('months_2026_0'),false);assert.equal(s.repo.groups()[0].entries.length,2);
});
test('different users never inherit local pending data',async()=>{
 const s=setup();await s.repo.load('month',0,2026);s.repo.stage([{type:'month',month:0,year:2026,payload:payload(10)}]);
 const other=new FinanceRepository({client:s.client,storage:s.storage,userId:()=> 'other',tabId:'other'});
 assert.equal(other.groups().length,0);
});
test('storage failure is surfaced before reporting a local save',async()=>{
 const s=setup();await s.repo.load('month',0,2026);s.storage.setItem=()=>{throw Error('quota')};
 assert.throws(()=>s.repo.stage([{type:'month',month:0,year:2026,payload:payload(1)}]),/cópia/);
});
test('explicit conflict resolution archives the local revision',async()=>{
 const s=setup();await s.repo.load('month',0,2026);s.repo.stage([{type:'month',month:0,year:2026,payload:payload(10)}]);
 s.rows.set('months_2026_0',{data:payload(20),updated_at:'other'});await assert.rejects(s.repo.flush());
 const g=s.repo.groups()[0];await s.repo.resolve(g.id,'local');
 assert.equal(s.rows.get('months_2026_0').data.incomes[0].val,'10');assert.equal(s.repo.read('cgastos_v2_recovery_owner').length,1);
});

test('editing a queued month after reload continues from its pending predecessor',async()=>{
 const s=setup();await s.repo.load('month',0,2026);s.repo.stage([{type:'month',month:0,year:2026,payload:payload(10)}],{coalesce:true});
 const next=new FinanceRepository({client:s.client,storage:s.storage,userId:()=> 'owner',tabId:'tab-new'});
 await next.load('month',0,2026);next.stage([{type:'month',month:0,year:2026,payload:payload(40)}],{coalesce:true});
 await next.flush();assert.equal(s.rows.get('months_2026_0').data.incomes[0].val,'40');assert.equal(next.groups().length,0);
});
test('a separate tab with stale remote data cannot overwrite another tab silently',async()=>{
 const s=setup();await s.repo.load('month',0,2026);
 const other=new FinanceRepository({client:s.client,storage:s.storage,userId:()=> 'owner',tabId:'independent'});
 await other.load('month',0,2026);
 s.repo.stage([{type:'month',month:0,year:2026,payload:payload(10)}],{coalesce:true});
 other.stage([{type:'month',month:0,year:2026,payload:payload(90)}],{coalesce:true});
 await assert.rejects(other.flush());assert.equal(s.rows.get('months_2026_0').data.incomes[0].val,'10');assert.equal(other.groups()[0].status,'conflict');
});
