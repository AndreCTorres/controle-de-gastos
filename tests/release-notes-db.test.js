import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const sql=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('release draft stays hidden, publishing is idempotent, and the announcement includes the user-facing changes',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role authenticated;');
  await db.exec(await sql('supabase/updates.sql'));
  await db.exec('grant select on public.app_updates to authenticated;');
  const draft=await sql('supabase/releases/2026-11-draft.sql');
  await db.exec(draft);await db.exec(draft);
  await db.exec("update app_updates set body='Rascunho em revisão'");await db.exec(draft);
  let rows=(await db.query('select * from app_updates')).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].published,false);
  for(const phrase of ['Escolha como visualizar','Dê nomes às suas compras parceladas','Personalize suas compras recorrentes'])assert.ok(rows[0].body.includes(phrase));
  await db.exec('set role authenticated');
  assert.equal((await db.query('select * from app_updates')).rows.length,0);
  await db.exec('reset role');
  const publish=await sql('supabase/releases/2026-11-publish.sql');await db.exec(publish);
  const published=(await db.query('select * from app_updates')).rows[0];assert.equal(published.published,true);
  await db.exec(publish);await db.exec(draft);
  const repeated=(await db.query('select * from app_updates')).rows[0];assert.equal(repeated.id,published.id);assert.deepEqual(repeated.created_at,published.created_at);
  await db.exec('set role authenticated');assert.equal((await db.query('select * from app_updates')).rows.length,1);
  await db.exec('reset role');
  await db.query('insert into app_updates(title,body,published)values($1,$2,true)',['Ajustes visuais de novembro de 2026','Correções de aparência']);
  await db.exec(await sql('supabase/releases/2026-11-editorial-correction.sql'));
  const visible=(await db.query('select * from app_updates where published=true')).rows;
  assert.equal(visible.length,1);assert.equal(visible[0].id,published.id);assert.deepEqual(visible[0].created_at,published.created_at);
  assert.equal(visible[0].body.split('\n').length,3);
  assert.equal((await db.query('select count(*)::int n from app_updates')).rows[0].n,2);

 }finally{await db.close()}
});
