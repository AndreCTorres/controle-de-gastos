import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const make=(id,number=1,card='1111',value=25000)=>({id,label:`Blue (${number}/12)`,val:(value/100).toFixed(2),source:'nubank',merchantKey:'BLUE',merchant:'Blue',sourceCardLast4:card,cardLast4:card,originalAmountCents:value,parcelNumber:number,parcelCount:12,invoiceId:id+'-invoice',invoicePosition:1});
const payload=items=>({incomes:[],sections:[{id:'home',items}]});
test('database learns names, applies them during import, isolates owners and cards, and removes rules on reset',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;
   create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
   create table public.months(user_id uuid references auth.users,year integer,month integer,data jsonb,primary key(user_id,year,month));
   alter table public.months enable row level security;
   create policy owner on public.months to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
   grant select,insert,update on public.months to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261106180948_invoice_friendly_names.sql',import.meta.url),'utf8'));
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
  const insert=async(month,items,user=owner,year=2026)=>db.query('insert into months values($1,$2,$3,$4)',[user,year,month,payload(items)]);
  const get=async(month,user=owner,year=2026)=>(await db.query('select data from months where user_id=$1 and year=$2 and month=$3',[user,year,month])).rows[0].data.sections[0].items;
  const first=make('first');await insert(11,[first]);
  const named={...first,label:'Cama (1/12)',originalLabel:first.label,friendlyName:'Cama',nameScope:'purchase'};
  await db.query('update months set data=$1 where year=2026 and month=11',[payload([named])]);
  assert.equal((await db.query('select friendly_name from invoice_name_rules')).rows[0].friendly_name,'Cama');
  await insert(10,[make('ambiguous-a',12),{...make('ambiguous-b',12),invoicePosition:2}],owner,2027);
  assert.deepEqual((await get(10,owner,2027)).map(i=>i.label),['Blue (12/12)','Blue (12/12)']);
  await insert(0,[make('next',2),{...make('new',1),invoicePosition:2}, {...make('card',2,'2222'),invoicePosition:3}],owner,2027);
  const next=await get(0,owner,2027);assert.equal(next[0].label,'Cama (2/12)');assert.equal(next[1].label,'Blue (1/12)');assert.equal(next[2].label,'Blue (2/12)');assert.equal(next[0].originalAmountCents,25000);
  // No broad rule is learned merely by importing a matching entry.
  assert.equal((await db.query('select count(*)::int n from invoice_name_rules')).rows[0].n,1);
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
  assert.equal((await db.query('select count(*)::int n from invoice_name_rules')).rows[0].n,0);
  await insert(0,[make('other',2)],other,2027);assert.equal((await get(0,other,2027))[0].label,'Blue (2/12)');
  await assert.rejects(db.query('insert into invoice_name_rules values($1,$2,$3,$4,now())',[owner,'merchant','stolen','Stolen']));
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
  await db.query('update months set data=$1 where year=2026 and month=11',[payload([{...named,label:'Só dezembro (1/12)',friendlyName:'Só dezembro',nameScope:'once'}])]);
  assert.equal((await db.query('select friendly_name from invoice_name_rules')).rows[0].friendly_name,'Cama');
  await db.query('update months set data=$1 where year=2026 and month=11',[payload([{...named,label:first.label,friendlyName:''}])]);
  assert.equal((await db.query('select count(*)::int n from invoice_name_rules')).rows[0].n,0);
  await insert(1,[make('after-reset',3)],owner,2027);assert.equal((await get(1,owner,2027))[0].label,'Blue (3/12)');
  // Merchant rules apply to recurring purchases but not credits; purchase rules take priority.
  const broad={...named,friendlyName:'Loja da casa',label:'Loja da casa (1/12)',nameScope:'merchant'};
  await db.query('update months set data=$1 where year=2026 and month=11',[payload([broad])]);
  await insert(2,[make('recurring',4),{...make('credit',4,'1111',-25000),invoicePosition:2}],owner,2027);
  assert.equal((await get(2,owner,2027))[0].label,'Loja da casa (4/12)');assert.equal((await get(2,owner,2027))[1].label,'Blue (4/12)');
  // An import into an already existing month follows the same path as a fresh month.
  await insert(3,[],owner,2027);
  await db.query('update months set data=$1 where year=2027 and month=3',[payload([make('existing-month',5)])]);
  assert.equal((await get(3,owner,2027))[0].label,'Loja da casa (5/12)');
  const specific=(await get(0,owner,2027))[0];
  await db.query('update months set data=$1 where year=2027 and month=0',[payload([{...specific,friendlyName:'Cama exclusiva',label:'Cama exclusiva (2/12)',nameScope:'purchase'}])]);
  await insert(4,[make('priority',6)],owner,2027);
  assert.equal((await get(4,owner,2027))[0].label,'Cama exclusiva (6/12)');
  assert.equal((await db.query("select count(*)::int n from invoice_name_rules where scope='merchant'")).rows[0].n,1);
  // A regular save uses UPSERT: its BEFORE INSERT trigger must preserve existing labels.
  const legacy=(await get(1,owner,2027))[0];
  await db.query('insert into months values($1,$2,$3,$4) on conflict(user_id,year,month) do update set data=excluded.data',
    [owner,2027,1,payload([{...legacy,label:'Nome já editado'}])]);
  assert.equal((await get(1,owner,2027))[0].label,'Nome já editado');
  // New entries added by an import to that same month still get the saved rule.
  await db.query('insert into months values($1,$2,$3,$4) on conflict(user_id,year,month) do update set data=excluded.data',
    [owner,2027,1,payload([{...legacy,label:'Nome já editado'},{...make('new-on-upsert',3),invoicePosition:2}])]);
  assert.equal((await get(1,owner,2027))[0].label,'Nome já editado');
  assert.equal((await get(1,owner,2027))[1].label,'Loja da casa (3/12)');

 }finally{await db.close();}
});
