create or replace function public.classify_nubank_entries(invoice jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 owner_id uuid:=auth.uid(); target_period integer:=(invoice->>'year')::integer*12+(invoice->>'month')::integer;
 history jsonb; entry jsonb; result jsonb:='[]'::jsonb; candidate jsonb; candidates text[];
 owners jsonb; v_key text; card text; card_owner text; title text; origin text; review boolean;
 color text; bg text; previous_id text; used_ids text[]:=array[]::text[]; rule public.invoice_category_rules%rowtype;
begin
 if owner_id is null then raise exception 'Entre na conta' using errcode='42501';end if;
 select coalesce(card_owners,'{}'::jsonb) into owners from public.invoice_settings where user_id=owner_id;
 select coalesce(jsonb_agg(jsonb_build_object('history_id',m.year::text||'_'||m.month::text||'_'||(i.value->>'id'),
  'period',m.year*12+m.month,'title',s.value->>'title','color',s.value->>'color','bg',s.value->>'bg',
  'key',public.nubank_merchant_key(i.value->>'label'),'amount_cents',round(coalesce(nullif(i.value->>'val',''),'0')::numeric*100),
  'parcel',regexp_match(i.value->>'label','\(([0-9]+)/([0-9]+)\)\s*$'))
  order by m.year desc,m.month desc,s.ordinality,i.ordinality),'[]'::jsonb) into history
 from public.months m cross join lateral jsonb_array_elements(m.data->'sections') with ordinality s
 cross join lateral jsonb_array_elements(s.value->'items') with ordinality i
 where m.user_id=owner_id and m.year*12+m.month<target_period and coalesce(i.value->>'val','')<>'';
 for entry in select value from jsonb_array_elements(invoice->'entries') order by (value->>'position')::integer loop
  v_key:=public.nubank_merchant_key(entry->>'merchant');card:=entry->>'card_last4';
  if card is null and (entry->>'amount_cents')::bigint<0 then
   select e->>'card_last4' into card from jsonb_array_elements(invoice->'entries') e
   where public.nubank_merchant_key(e->>'merchant')=v_key and (e->>'amount_cents')::bigint>0 and e->>'card_last4' is not null limit 1;
  end if;
  card_owner:=owners->>coalesce(card,'');title:=null;origin:=null;review:=false;candidate:=null;
  select * into rule from public.invoice_category_rules where user_id=owner_id and invoice_category_rules.merchant_key=v_key and card_last4=coalesce(card,'');
  if found then title:=rule.category_title;color:=rule.color;bg:=rule.bg;origin:='confirmed_rule';end if;
  if title is null and entry->>'installment_number' is not null then
   select h into candidate from jsonb_array_elements(history) h where h->>'key'=v_key
    and (h->>'amount_cents')::bigint=(entry->>'amount_cents')::bigint and h->'parcel'<>'null'::jsonb
    and (h->'parcel'->>1)::integer=(entry->>'installment_count')::integer
    and (h->'parcel'->>0)::integer+target_period-(h->>'period')::integer=(entry->>'installment_number')::integer
    and not (h->>'history_id'=any(used_ids))
   order by (h->>'period')::integer desc limit 1;
   if candidate is not null then used_ids:=array_append(used_ids,candidate->>'history_id');title:=candidate->>'title';origin:='previous_installment';end if;
  end if;
  if title is null then
   select array_agg(distinct h->>'title') into candidates from jsonb_array_elements(history) h
   where h->>'key'=v_key and (h->>'period')::integer=(select max((h2->>'period')::integer) from jsonb_array_elements(history) h2 where h2->>'key'=v_key);
   if array_length(candidates,1)=1 then title:=candidates[1];origin:='history';end if;
  end if;
  if title is null and v_key like '%PADOCA%' then title:='Padoca';origin:='merchant_alias';end if;
  if title is null and v_key like '%FRANGOREAL%' then title:='Marmitas';origin:='suggestion';review:=true;end if;
  if title is null and v_key ~ '(UBER|99RIDE)' and card_owner is not null then
   title:=case when card_owner='Paula' then 'UBER/99 (PAULA)' else 'UBER/99 (ANDRÉ)' end;origin:='card_owner';
  end if;
  if title is null then
   if card_owner='Paula' then title:='PAULA';origin:='card_owner';
   elsif card_owner='André' then title:=case when entry->>'installment_number' is not null then 'GERAL (ANDRÉ) - PARCELADO' else 'GERAL (ANDRÉ) - À VISTA' end;origin:='suggestion';review:=true;
   else title:='A conferir (Nubank)';origin:='unclassified';review:=true;end if;
  end if;
  if origin<>'confirmed_rule' then
   select h into candidate from jsonb_array_elements(history) h where upper(h->>'title')=upper(title) order by (h->>'period')::integer desc limit 1;
   color:=coalesce(candidate->>'color','#7A6010');bg:=coalesce(candidate->>'bg','#FFF4D6');
   title:=coalesce(candidate->>'title',title);
  end if;
  result:=result||jsonb_build_array(entry||jsonb_build_object('merchant_key',v_key,'classification_card',card,
   'category_title',title,'category_color',color,'category_bg',bg,'classification',origin,'needs_review',review));
 end loop;
 return result;
end;
$$;
revoke all on function public.classify_nubank_entries(jsonb) from public,anon;
grant execute on function public.classify_nubank_entries(jsonb) to authenticated;
