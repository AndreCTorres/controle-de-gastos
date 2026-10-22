create or replace function public.guard_imported_invoice_month()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare invoice_key text;
begin
 for invoice_key in select distinct i->>'invoiceId' from jsonb_array_elements(coalesce(old.data->'sections','[]')) s cross join jsonb_array_elements(s->'items') i where i->>'invoiceId' is not null loop
  if exists(select 1 from public.invoice_imports where id::text=invoice_key and user_id=new.user_id and status='applied')
   and not exists(select 1 from jsonb_array_elements(coalesce(new.data->'sections','[]')) s cross join jsonb_array_elements(s->'items') i where i->>'invoiceId'=invoice_key) then
    raise exception 'O mês contém uma fatura importada. Recarregue a página ou use Desfazer importação antes de substituir todo o mês.' using errcode='40001';
  end if;
 end loop;
 return new;
end;
$$;
create or replace function public.learn_invoice_category_changes()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare section jsonb;item jsonb;old_section text;old_item jsonb;merchant text;card text;title text;
begin
 if auth.uid() is distinct from new.user_id then return new;end if;
 for section in select value from jsonb_array_elements(new.data->'sections') loop
  title:=section->>'title';
  for item in select value from jsonb_array_elements(section->'items') loop
   merchant:=item->>'merchantKey';card:=coalesce(item->>'cardLast4','');
   if item->>'source' is distinct from 'nubank' or merchant is null or item->>'invoiceKind' in ('carryover','rounding') then continue;end if;
   select s->>'title',i into old_section,old_item from jsonb_array_elements(old.data->'sections') s cross join jsonb_array_elements(s->'items') i
    where i->>'id'=item->>'id' and i->>'invoiceId'=item->>'invoiceId' limit 1;
   if old_item is null then continue;end if;
   if upper(old_section)=upper(title) and not(coalesce((item->>'categoryConfirmed')::boolean,false) and not coalesce((old_item->>'categoryConfirmed')::boolean,false)) then continue;end if;
   -- The same merchant/card can belong to several people. Do not learn an ambiguous broad rule.
   if exists(select 1 from jsonb_array_elements(new.data->'sections') other_s cross join jsonb_array_elements(other_s->'items') other_i
    where other_i->>'source'='nubank' and other_i->>'merchantKey'=merchant and coalesce(other_i->>'cardLast4','')=card and upper(other_s->>'title')<>upper(title)) then continue;end if;
   insert into public.invoice_category_rules(user_id,merchant_key,card_last4,category_title,color,bg)
   values(new.user_id,merchant,card,title,coalesce(section->>'color','#3D5A80'),coalesce(section->>'bg','#E8F0FA'))
   on conflict(user_id,merchant_key,card_last4)do update set category_title=excluded.category_title,color=excluded.color,bg=excluded.bg,updated_at=clock_timestamp();
  end loop;
 end loop;
 return new;
end;
$$;
revoke all on function public.guard_imported_invoice_month(),public.learn_invoice_category_changes() from public,anon;
grant execute on function public.guard_imported_invoice_month(),public.learn_invoice_category_changes() to authenticated;
drop trigger if exists guard_imported_invoice_month on public.months;
create trigger guard_imported_invoice_month before update of data on public.months for each row execute function public.guard_imported_invoice_month();
drop trigger if exists learn_invoice_category_changes on public.months;
create trigger learn_invoice_category_changes after update of data on public.months for each row execute function public.learn_invoice_category_changes();
