-- Apply after the existing invoices-*.sql scripts. No historical rows are rewritten.
create table public.invoice_name_rules (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('purchase','merchant')),
  match_key text not null check (length(match_key) between 1 and 1000),
  friendly_name text not null check (length(trim(friendly_name)) between 1 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id,scope,match_key)
);
alter table public.invoice_name_rules enable row level security;
create policy invoice_name_rules_owner on public.invoice_name_rules to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.invoice_name_rules from public,anon;
grant select,insert,update,delete on public.invoice_name_rules to authenticated;

create function public.invoice_name_key(item jsonb,y integer,m integer,scope text)
returns text language sql immutable security invoker set search_path=''
as $$
  select case when coalesce(item->>'merchantKey','')='' or coalesce((item->>'originalAmountCents')::bigint,0)<=0 then null
    when scope='merchant' then jsonb_build_array(item->>'merchantKey',coalesce(item->>'sourceCardLast4',item->>'cardLast4',''))::text
    when scope='purchase' and (item->>'parcelNumber')::integer between 1 and (item->>'parcelCount')::integer
      then jsonb_build_array(item->>'merchantKey',coalesce(item->>'sourceCardLast4',item->>'cardLast4',''),
        (item->>'originalAmountCents')::bigint,(item->>'parcelCount')::integer,y*12+m-(item->>'parcelNumber')::integer+1)::text
    else null end;
$$;

create function public.apply_invoice_names()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare sections jsonb:='[]';items jsonb;section jsonb;item jsonb;previous jsonb;
  known_items jsonb:='{}';previous_data jsonb;purchase_key text;merchant_key text;rule public.invoice_name_rules%rowtype;original_label text;
begin
  if auth.uid() is distinct from new.user_id then return new;end if;
  if not exists(select 1 from public.invoice_name_rules where user_id=new.user_id) then return new;end if;
  if tg_op='UPDATE' then
    previous_data:=old.data;
  else
    -- INSERT triggers also run on the INSERT arm of an UPSERT into an existing month.
    select data into previous_data from public.months
      where user_id=new.user_id and year=new.year and month=new.month;
  end if;
  select coalesce(jsonb_object_agg(jsonb_build_array(i->>'invoiceId',i->>'id')::text,i),'{}') into known_items
    from jsonb_array_elements(coalesce(previous_data->'sections','[]')) s cross join jsonb_array_elements(s->'items') i
    where i->>'invoiceId' is not null;
  for section in select value from jsonb_array_elements(coalesce(new.data->'sections','[]')) loop
    items:='[]';
    for item in select value from jsonb_array_elements(coalesce(section->'items','[]')) loop
      previous:=known_items->jsonb_build_array(item->>'invoiceId',item->>'id')::text;
      -- Only imported entries arriving for the first time: never overwrite a user's saved label.
      if previous is null and item->>'source'='nubank' and item->>'invoicePosition' is not null and item->>'friendlyName' is null then
        purchase_key:=public.invoice_name_key(item,new.year,new.month,'purchase');
        merchant_key:=public.invoice_name_key(item,new.year,new.month,'merchant');
        if purchase_key is not null and (select count(*) from jsonb_array_elements(new.data->'sections') s
          cross join jsonb_array_elements(s->'items') i where i->>'invoicePosition' is not null
          and public.invoice_name_key(i,new.year,new.month,'purchase')=purchase_key)<>1 then purchase_key:=null;end if;
        select * into rule from public.invoice_name_rules r where r.user_id=new.user_id
          and ((r.scope='purchase' and r.match_key=purchase_key) or (r.scope='merchant' and r.match_key=merchant_key))
          order by case r.scope when 'purchase' then 0 else 1 end limit 1;
        if found then
          original_label:=item->>'label';
          item:=item||jsonb_build_object('originalLabel',original_label,'friendlyName',rule.friendly_name,'nameScope',rule.scope,
            'label',rule.friendly_name||case when item->>'parcelNumber' is not null
              then ' ('||(item->>'parcelNumber')||'/'||(item->>'parcelCount')||')' else '' end);
        end if;
      end if;
      items:=items||jsonb_build_array(item);
    end loop;
    sections:=sections||jsonb_build_array(section||jsonb_build_object('items',items));
  end loop;
  new.data:=jsonb_set(new.data,'{sections}',sections);
  return new;
end;
$$;

create function public.learn_invoice_names()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare item jsonb;previous jsonb;known_items jsonb;scope_value text;key_value text;friendly text;
begin
  if auth.uid() is distinct from new.user_id then return new;end if;
  select coalesce(jsonb_object_agg(jsonb_build_array(i->>'invoiceId',i->>'id')::text,i),'{}') into known_items
    from jsonb_array_elements(coalesce(old.data->'sections','[]')) s cross join jsonb_array_elements(s->'items') i
    where i->>'invoiceId' is not null;
  for item in select i from jsonb_array_elements(coalesce(new.data->'sections','[]')) s cross join jsonb_array_elements(s->'items') i loop
    if item->>'source' is distinct from 'nubank' or item->>'invoicePosition' is null then continue;end if;
    previous:=known_items->jsonb_build_array(item->>'invoiceId',item->>'id')::text;
    if previous is null or (item->'friendlyName' is not distinct from previous->'friendlyName'
      and item->'nameScope' is not distinct from previous->'nameScope') then continue;end if;
    scope_value:=item->>'nameScope';friendly:=trim(coalesce(item->>'friendlyName',''));
    if scope_value is null or scope_value not in ('once','purchase','merchant') or length(friendly)>100 then raise exception 'Nome ou abrangência inválidos' using errcode='22023';end if;
    -- A one-month override must not erase the name used by later installments.
    if scope_value='once' then continue;end if;
    key_value:=public.invoice_name_key(item,new.year,new.month,scope_value);
    if key_value is null then raise exception 'Este lançamento permite apenas um nome neste mês' using errcode='22023';end if;
    if friendly='' then
      delete from public.invoice_name_rules where user_id=new.user_id and scope=scope_value and match_key=key_value;
      continue;
    end if;
    if scope_value='purchase' and (select count(*) from jsonb_array_elements(new.data->'sections') s cross join jsonb_array_elements(s->'items') i
      where i->>'invoicePosition' is not null and public.invoice_name_key(i,new.year,new.month,'purchase')=key_value)<>1
      then raise exception 'Há compras semelhantes. Use um nome só para este lançamento' using errcode='22023';end if;
    insert into public.invoice_name_rules(user_id,scope,match_key,friendly_name) values(new.user_id,scope_value,key_value,friendly)
      on conflict(user_id,scope,match_key) do update set friendly_name=excluded.friendly_name,updated_at=clock_timestamp();
  end loop;
  return new;
end;
$$;
revoke all on function public.invoice_name_key(jsonb,integer,integer,text),public.apply_invoice_names(),public.learn_invoice_names() from public,anon;
grant execute on function public.invoice_name_key(jsonb,integer,integer,text),public.apply_invoice_names(),public.learn_invoice_names() to authenticated;
create trigger apply_invoice_names before insert or update of data on public.months for each row execute function public.apply_invoice_names();
create trigger learn_invoice_names after update of data on public.months for each row execute function public.learn_invoice_names();
