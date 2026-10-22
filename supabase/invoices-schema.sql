create table if not exists public.invoice_imports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 bank text not null check(bank='nubank'),
 year integer not null, month integer not null check(month between 0 and 11),
 due_date date not null, source_message_id text not null, source_filename text not null,
 fingerprint text not null, pdf_sha256 text,
 total_cents bigint not null, transactions_cents bigint not null, carryover_cents bigint not null, rounding_cents integer not null check(abs(rounding_cents)<=1),
 entry_count integer not null check(entry_count between 1 and 2000),
 status text not null default 'applied' check(status in ('applied','undone')),
 original_invoice jsonb not null, before_payload jsonb,
 imported_at timestamptz not null default now(),
 unique(user_id,bank,due_date)
);
create index if not exists invoice_imports_user_period on public.invoice_imports(user_id,year,month);
create table if not exists public.invoice_category_rules (
 user_id uuid not null references auth.users(id) on delete cascade,
 merchant_key text not null,card_last4 text not null default '',
 category_title text not null,color text not null default '#3D5A80',bg text not null default '#E8F0FA',
 updated_at timestamptz not null default now(),
 primary key(user_id,merchant_key,card_last4)
);
create table if not exists public.invoice_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 card_owners jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.invoice_imports enable row level security;
alter table public.invoice_category_rules enable row level security;
alter table public.invoice_settings enable row level security;
create policy invoice_imports_owner on public.invoice_imports to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy invoice_category_rules_owner on public.invoice_category_rules to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy invoice_settings_owner on public.invoice_settings to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
revoke all on public.invoice_imports,public.invoice_category_rules,public.invoice_settings from anon;
grant select,insert,update on public.invoice_imports,public.invoice_settings to authenticated;
grant select,insert,update,delete on public.invoice_category_rules to authenticated;

create or replace function public.nubank_merchant_key(value text)
returns text language sql immutable security invoker set search_path=''
as $$
 select regexp_replace(upper(translate(
 regexp_replace(regexp_replace(regexp_replace(coalesce(value,''),'^(Estorno|Crédito) de\s*["“]?','','i'),'\s*-\s*Parcela\s+[0-9]+/[0-9]+\s*$','','i'),'\s*\([0-9]+/[0-9]+\)\s*$',''),
 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),'[^A-Z0-9]','','g');
$$;
create or replace function public.nubank_brl_cents(value text)
returns bigint language sql immutable security invoker set search_path=''
as $$ select (replace(replace(replace(replace(replace(value,'R$',''),' ',''),'−','-'),'.',''),',','.')::numeric*100)::bigint; $$;
create or replace function public.preview_nubank_text(source_text text,source_filename text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
 months text[]:=array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
 t text:=replace(replace(source_text,E'\r\n',E'\n'),E'\r',E'\n');
 due_parts text[]; header text[]; matched text[]; parcel text[]; line text;
 due date; y integer; m integer; d integer; tm integer; ty integer;
 amount bigint; total bigint; prior bigint; paid bigint; net bigint:=0; carry bigint; delta bigint;
 entries jsonb:='[]'::jsonb; active boolean:=false; finance boolean:=false; ignored integer:=0; description text; merchant text;
begin
 if auth.uid() is null then raise exception 'Entre na conta para ler faturas' using errcode='42501'; end if;
 if source_text is null or length(source_text) not between 300 and 400000 then raise exception 'Texto da fatura incompleto ou muito grande' using errcode='22023';end if;
 due_parts:=regexp_match(t,'Data de vencimento:\s*([0-9]{1,2})\s+([A-Z]{3})\s+([0-9]{4})','i');
 if due_parts is null then raise exception 'Vencimento não encontrado' using errcode='22023'; end if;
 y:=due_parts[3]::integer;m:=array_position(months,upper(due_parts[2]));d:=due_parts[1]::integer;
 due:=make_date(y,m,d);
 if source_filename is distinct from 'Nubank_'||due::text||'.pdf' then raise exception 'Arquivo e vencimento não correspondem' using errcode='22023';end if;
 header:=regexp_match(t,'R\$\s*([0-9.]+,[0-9]{2})');
 if header is null then raise exception 'Total não encontrado' using errcode='22023'; end if;
 total:=public.nubank_brl_cents(header[1]);
 header:=regexp_match(t,'Fatura anterior\s+R\$\s*([0-9.]+,[0-9]{2})','i');
 if header is null then raise exception 'Resumo da fatura anterior ausente' using errcode='22023'; end if;
 prior:=public.nubank_brl_cents(header[1]);
 header:=regexp_match(t,'Pagamento recebido\s+[−-]?R\$\s*([0-9.]+,[0-9]{2})','i');
 if header is null then raise exception 'Pagamento anterior ausente' using errcode='22023'; end if;
 paid:=public.nubank_brl_cents(header[1]);
 for line in select regexp_split_to_table(t,E'\n') loop
   if upper(line) like '%TRANSAÇÕES%' then active:=true;end if;
   if not active then continue;end if;
   if lower(line) like '%pagamentos e financiamentos%' then finance:=true;end if;
   matched:=regexp_match(line,'^\s*([0-9]{2})\s+([A-Z]{3})\s+(?:[•●.]{4}\s*([0-9]{4})\s+)?(.+?)\s+([−-]?)\s*R\$\s*([−-]?[0-9.]+,[0-9]{2})\s*$','i');
   if matched is null then
     if line ~* '^\s*[0-9]{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+' then raise exception 'Linha de lançamento não reconhecida' using errcode='22023';end if;
     continue;
   end if;
   description:=trim(regexp_replace(matched[4],'\s+',' ','g'));
   if description ~* '^(Pagamento em|Saldo restante da fatura anterior)' then ignored:=ignored+1;continue;end if;
   amount:=public.nubank_brl_cents(matched[5]||matched[6]);
   tm:=array_position(months,upper(matched[2]));ty:=y-case when tm>m then 1 else 0 end;
   parcel:=regexp_match(description,'\s*-\s*Parcela\s+([0-9]+)/([0-9]+)\s*$','i');
   merchant:=regexp_replace(description,'\s*-\s*Parcela\s+[0-9]+/[0-9]+\s*$','','i');
   entries:=entries||jsonb_build_array(jsonb_build_object('position',jsonb_array_length(entries)+1,
     'date',make_date(ty,tm,matched[1]::integer)::text,'card_last4',matched[3],'description',description,'merchant',merchant,'amount_cents',amount,
     'installment_number',parcel[1]::integer,'installment_count',parcel[2]::integer,
     'kind',case when amount<0 then 'refund' when description ~* '^IOF' then 'tax' when finance then 'fee' else 'purchase' end));
   net:=net+amount;
 end loop;
 if jsonb_array_length(entries) not between 1 and 2000 then raise exception 'Nenhuma transação válida' using errcode='22023';end if;
 carry:=prior-paid;delta:=total-net-carry;
 if abs(delta)>1 then raise exception 'Os lançamentos não conferem com o total da fatura: diferença de % centavos',delta using errcode='22023';end if;
 return jsonb_build_object('schema_version',1,'bank','nubank','year',y,'month',m-1,'due_date',due::text,'source_filename',source_filename,
 'total_cents',total,'transactions_cents',net,'previous_balance_cents',prior,'previous_payment_cents',paid,
 'carryover_cents',carry,'rounding_cents',delta,'entries',entries,'ignored_financing_rows',ignored);
end;
$$;
revoke all on function public.nubank_merchant_key(text),public.nubank_brl_cents(text),public.preview_nubank_text(text,text) from public,anon;
grant execute on function public.nubank_merchant_key(text),public.nubank_brl_cents(text),public.preview_nubank_text(text,text) to authenticated;
