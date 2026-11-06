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
  for(const phrase of ['Tema claro','Nomes personalizados','Compras recorrentes','Conferência de faturas','Salvamento mais confiável','CSV e parcelas'])assert.ok(rows[0].body.includes(phrase));
  await db.exec('set role authenticated');
  assert.equal((await db.query('select * from app_updates')).rows.length,0);
  await db.exec('reset role');
  const publish=await sql('supabase/releases/2026-11-publish.sql');await db.exec(publish);
  const published=(await db.query('select * from app_updates')).rows[0];assert.equal(published.published,true);
  await db.exec(publish);await db.exec(draft);
  const repeated=(await db.query('select * from app_updates')).rows[0];assert.equal(repeated.id,published.id);assert.deepEqual(repeated.created_at,published.created_at);
  await db.exec('set role authenticated');assert.equal((await db.query('select * from app_updates')).rows.length,1);
 }finally{await db.close()}
});
