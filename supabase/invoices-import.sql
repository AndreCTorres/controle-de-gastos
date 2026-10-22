create or replace function public.apply_nubank_invoice(p_invoice jsonb,p_source_message_id text,p_user_id uuid,p_expected_updated_at timestamptz default null,p_pdf_sha256 text default null)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 owner_id uuid:=auth.uid(); y integer; m integer; due date; invoice_id uuid:=gen_random_uuid();
 total bigint; net bigint; carry bigint; rounding integer; prior bigint; paid bigint;
 n integer; minimum_position integer; maximum_position integer; unique_positions integer;
 fingerprint_value text; prior_import public.invoice_imports%rowtype;
 before_data jsonb; working jsonb; actual_version timestamptz; next_version timestamptz;
 classified jsonb; entry jsonb; item jsonb; target_index integer; target_title text; label text;
 reviews integer:=0; extra jsonb;
begin
 if owner_id is null or owner_id is distinct from p_user_id then raise exception 'Conta incorreta para importar' using errcode='42501';end if;
 if p_invoice->>'bank' is distinct from 'nubank' or jsonb_typeof(p_invoice->'entries') is distinct from 'array' then raise exception 'Fatura inválida' using errcode='22023';end if;
 if p_source_message_id is null or p_source_message_id !~ '^[a-f0-9]{8,64}$' then raise exception 'Origem Gmail inválida' using errcode='22023';end if;
 due:=(p_invoice->>'due_date')::date;y:=(p_invoice->>'year')::integer;m:=(p_invoice->>'month')::integer;
 if due is null or y is null or m is null or y not between 2020 and 2200 or m not between 0 and 11 or y<>extract(year from due)::integer or m<>extract(month from due)::integer-1 then raise exception 'Competência inválida' using errcode='22023';end if;
 if p_invoice->>'source_filename' is distinct from 'Nubank_'||due::text||'.pdf' then raise exception 'Arquivo não corresponde à fatura' using errcode='22023';end if;
 total:=(p_invoice->>'total_cents')::bigint;net:=(p_invoice->>'transactions_cents')::bigint;carry:=(p_invoice->>'carryover_cents')::bigint;rounding:=(p_invoice->>'rounding_cents')::integer;
 prior:=(p_invoice->>'previous_balance_cents')::bigint;paid:=(p_invoice->>'previous_payment_cents')::bigint;
 if total is null or net is null or carry is null or rounding is null or prior is null or paid is null or abs(rounding)>1 or carry<>prior-paid or total<>net+carry+rounding then raise exception 'Resumo da fatura não confere' using errcode='22023';end if;
 select count(*),min((e->>'position')::integer),max((e->>'position')::integer),count(distinct(e->>'position')::integer) into n,minimum_position,maximum_position,unique_positions from jsonb_array_elements(p_invoice->'entries') e;
 if n not between 1 and 2000 or minimum_position<>1 or maximum_position<>n or unique_positions<>n then raise exception 'Posições de lançamentos inválidas' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_invoice->'entries') e where
   jsonb_typeof(e->'amount_cents') is distinct from 'number' or (e->>'amount_cents')::numeric<>trunc((e->>'amount_cents')::numeric) or abs((e->>'amount_cents')::numeric)>999999999
   or coalesce(length(e->>'description'),0) not between 1 and 250 or coalesce(length(e->>'merchant'),0) not between 1 and 250
   or e->>'date' is null or (e->>'date')::date>due or (e->>'date')::date<due-interval '1 year'
   or (e->>'card_last4' is not null and e->>'card_last4' !~ '^[0-9]{4}$')
   or ((e->>'installment_number' is null)<>(e->>'installment_count' is null))
   or (e->>'installment_number' is not null and ((e->>'installment_number')::integer<1 or (e->>'installment_count')::integer not between 2 and 120 or (e->>'installment_number')::integer>(e->>'installment_count')::integer))
 )then raise exception 'Lançamento inválido' using errcode='22023';end if;
 if net<>(select sum((e->>'amount_cents')::bigint) from jsonb_array_elements(p_invoice->'entries') e) then raise exception 'Soma das transações divergente' using errcode='22023';end if;
 fingerprint_value:=md5(jsonb_build_object('due',due,'total',total,'carry',carry,'rounding',rounding,'entries',
   (select jsonb_agg(jsonb_build_array(e->'position',e->'date',e->'card_last4',regexp_replace(e->>'description','\s+',' ','g'),e->'amount_cents',e->'installment_number',e->'installment_count') order by (e->>'position')::integer) from jsonb_array_elements(p_invoice->'entries') e))::text);
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||'month'||y::text||m::text,0));
 select * into prior_import from public.invoice_imports where user_id=owner_id and bank='nubank' and due_date=due for update;
 if found then
   if prior_import.fingerprint<>fingerprint_value then raise exception 'Já existe uma fatura diferente para este vencimento. Revise antes de substituir.' using errcode='40001';end if;
   return jsonb_build_object('status',case when prior_import.status='undone' then 'undone' else 'already_imported' end,'id',prior_import.id,'entries',prior_import.entry_count,'total_cents',prior_import.total_cents);
 end if;
 select data,updated_at into before_data,actual_version from public.months where user_id=owner_id and year=y and month=m for update;
 if actual_version is distinct from p_expected_updated_at then raise exception 'O mês mudou em outro dispositivo. Recarregue antes de importar.' using errcode='40001';end if;
 -- Unattributed existing entries must be reconciled by the owner, never silently removed or duplicated.
 if exists(select 1 from jsonb_array_elements(coalesce(before_data->'sections','[]')) s cross join jsonb_array_elements(s->'items') i
  join jsonb_array_elements(p_invoice->'entries') e on public.nubank_merchant_key(i->>'label')=public.nubank_merchant_key(e->>'merchant') and round(coalesce(nullif(i->>'val',''),'0')::numeric*100)=(e->>'amount_cents')::bigint
  where i->>'invoiceId' is null and coalesce(i->>'val','')<>'') then raise exception 'Há lançamentos manuais semelhantes neste mês. Concilie-os antes de importar a fatura.' using errcode='40001';end if;
 working:=coalesce(before_data,'{"incomes":[{"id":"main","label":"Renda principal","val":""}],"sections":[]}'::jsonb);
 if working->'sections'='[{"id":"supermercado","title":"Supermercado","color":"#2D6A4F","bg":"#E8F5EE","items":[{"id":"s1","label":"Alimentos / Hortifruti","val":""},{"id":"s2","label":"Carnes e proteínas","val":""},{"id":"s3","label":"Laticínios","val":""},{"id":"s4","label":"Padaria e cereais","val":""},{"id":"s5","label":"Higiene pessoal","val":""},{"id":"s6","label":"Limpeza e Descartáveis","val":""}]},{"id":"moradia","title":"Moradia & Contas","color":"#1D5A8A","bg":"#E8F0FA","items":[{"id":"m2","label":"Conta de luz","val":""},{"id":"m3","label":"Conta de água","val":""},{"id":"m4","label":"Gás","val":""},{"id":"m5","label":"Internet","val":""}]},{"id":"transporte","title":"Transporte","color":"#A05C1A","bg":"#FDF0E0","items":[{"id":"t1","label":"Gasolina / Combustível","val":""},{"id":"t2","label":"Seguro do carro","val":""},{"id":"t3","label":"IPVA / licenciamento","val":""},{"id":"t4","label":"Manutenção","val":""}]},{"id":"saude","title":"Saúde & Bem-estar","color":"#6B3594","bg":"#F3ECF9","items":[{"id":"h1","label":"Academia / esportes","val":""},{"id":"h2","label":"Médico / consultas","val":""},{"id":"h3","label":"Remédios / farmácia","val":""},{"id":"h4","label":"Plano de saúde","val":""}]},{"id":"lazer","title":"Lazer & Outros","color":"#B83A2A","bg":"#FDF0EF","items":[{"id":"l1","label":"Restaurantes","val":""},{"id":"l2","label":"Streaming","val":""},{"id":"l3","label":"Roupas / Calçados","val":""},{"id":"l4","label":"Outros gastos","val":""}]}]'::jsonb then working:=jsonb_set(working,'{sections}','[]'::jsonb);end if;
 classified:=public.classify_nubank_entries(p_invoice);
 for entry in select value from jsonb_array_elements(classified) loop
  target_title:=entry->>'category_title';
  select (s.ordinality-1)::integer into target_index from jsonb_array_elements(working->'sections') with ordinality s where upper(s.value->>'title')=upper(target_title) limit 1;
  if target_index is null then
   target_index:=jsonb_array_length(working->'sections');
   working:=jsonb_set(working,'{sections}',working->'sections'||jsonb_build_array(jsonb_build_object('id','nbcat_'||substr(md5(upper(target_title)),1,16),'title',target_title,'color',entry->>'category_color','bg',entry->>'category_bg','items','[]'::jsonb)));
  end if;
  label:=entry->>'description';
  if entry->>'installment_number' is not null then label:=(entry->>'merchant')||' ('||(entry->>'installment_number')||'/'||(entry->>'installment_count')||')';end if;
  item:=jsonb_strip_nulls(jsonb_build_object('id','nb_'||to_char(due,'YYYYMMDD')||'_'||lpad(entry->>'position',4,'0'),'label',label,
   'val',to_char((entry->>'amount_cents')::numeric/100,'FM9999999990.00'),'source','nubank','invoiceId',invoice_id::text,'invoicePosition',(entry->>'position')::integer,
   'transactionDate',entry->>'date','merchant',entry->>'merchant','merchantKey',entry->>'merchant_key','cardLast4',entry->>'classification_card','sourceCardLast4',entry->>'card_last4',
   'originalAmountCents',(entry->>'amount_cents')::bigint,'invoiceKind',entry->>'kind',
   'parcel',case when entry->>'installment_number' is not null then true else null end,
   'parcelNumber',(entry->>'installment_number')::integer,'parcelCount',(entry->>'installment_count')::integer,
   'needsReview',(entry->>'needs_review')::boolean,'categoryOrigin',entry->>'classification'));
  if (entry->>'needs_review')::boolean then reviews:=reviews+1;end if;
  working:=jsonb_set(working,array['sections',target_index::text,'items'],(working#>array['sections',target_index::text,'items'])||jsonb_build_array(item));
 end loop;
 if carry<>0 or rounding<>0 then
  target_index:=jsonb_array_length(working->'sections');
  extra:='[]'::jsonb;
  if carry<>0 then extra:=extra||jsonb_build_array(jsonb_build_object('id','nb_'||to_char(due,'YYYYMMDD')||'_carry','label',case when carry>0 then 'Saldo não quitado da fatura anterior' else 'Crédito da fatura anterior' end,'val',to_char(carry::numeric/100,'FM9999999990.00'),'source','nubank','invoiceId',invoice_id::text,'invoiceKind','carryover','originalAmountCents',carry));end if;
  if rounding<>0 then extra:=extra||jsonb_build_array(jsonb_build_object('id','nb_'||to_char(due,'YYYYMMDD')||'_round','label','Ajuste de centavos da fatura','val',to_char(rounding::numeric/100,'FM9999999990.00'),'source','nubank','invoiceId',invoice_id::text,'invoiceKind','rounding','originalAmountCents',rounding));end if;
  working:=jsonb_set(working,'{sections}',working->'sections'||jsonb_build_array(jsonb_build_object('id','nbcat_carryover','title','Saldo anterior (Nubank)','color','#7A6010','bg','#FFF4D6','items',extra)));
 end if;
 next_version:=greatest(clock_timestamp(),coalesce(actual_version,'1970-01-01'::timestamptz)+interval '1 microsecond');
 insert into public.months(user_id,month,year,data,updated_at)values(owner_id,m,y,working,next_version)on conflict(user_id,month,year)do update set data=excluded.data,updated_at=excluded.updated_at;
 insert into public.invoice_imports(id,user_id,bank,year,month,due_date,source_message_id,source_filename,fingerprint,pdf_sha256,total_cents,transactions_cents,carryover_cents,rounding_cents,entry_count,original_invoice,before_payload)
 values(invoice_id,owner_id,'nubank',y,m,due,p_source_message_id,p_invoice->>'source_filename',fingerprint_value,p_pdf_sha256,total,net,carry,rounding,n,p_invoice,before_data);
 return jsonb_build_object('status','imported','id',invoice_id,'entries',n,'total_cents',total,'transactions_cents',net,'carryover_cents',carry,'reviews',reviews,'updated_at',next_version);
end;
$$;
create or replace function public.undo_invoice_import(p_import_id uuid,p_expected_updated_at timestamptz,p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare owner_id uuid:=auth.uid();inv public.invoice_imports%rowtype;current_data jsonb;actual timestamptz;next_data jsonb;next_version timestamptz;
begin
 if owner_id is null or owner_id is distinct from p_user_id then raise exception 'Conta incorreta' using errcode='42501';end if;
 select * into inv from public.invoice_imports where id=p_import_id and user_id=owner_id;
 if not found then raise exception 'Fatura não encontrada' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||'month'||inv.year::text||inv.month::text,0));
 select * into inv from public.invoice_imports where id=p_import_id and user_id=owner_id for update;
 if inv.status='undone' then return jsonb_build_object('status','already_undone');end if;
 select data,updated_at into current_data,actual from public.months where user_id=owner_id and year=inv.year and month=inv.month for update;
 if actual is distinct from p_expected_updated_at then raise exception 'O mês mudou. Recarregue antes de desfazer.' using errcode='40001';end if;
 select jsonb_set(current_data,'{sections}',coalesce(jsonb_agg(s||jsonb_build_object('items',(select coalesce(jsonb_agg(i),'[]') from jsonb_array_elements(s->'items') i where i->>'invoiceId' is distinct from p_import_id::text))),'[]')) into next_data from jsonb_array_elements(current_data->'sections') s;
 update public.invoice_imports set status='undone' where id=p_import_id and user_id=owner_id;
 next_version:=greatest(clock_timestamp(),actual+interval '1 microsecond');
 update public.months set data=next_data,updated_at=next_version where user_id=owner_id and year=inv.year and month=inv.month;
 return jsonb_build_object('status','undone','updated_at',next_version);
end;
$$;
revoke all on function public.apply_nubank_invoice(jsonb,text,uuid,timestamptz,text),public.undo_invoice_import(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.apply_nubank_invoice(jsonb,text,uuid,timestamptz,text),public.undo_invoice_import(uuid,timestamptz,uuid) to authenticated;
