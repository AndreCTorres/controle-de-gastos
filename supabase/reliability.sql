
-- Atomic writes preserve ownership and reject stale versions across devices.
create or replace function public.save_finance_batch(changes jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  owner uuid := auth.uid();
  entry jsonb; kind text; y integer; m integer;
  actual timestamptz; expected timestamptz; next_version timestamptz;
  results jsonb := '[]'::jsonb;
begin
  if owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if jsonb_typeof(changes) is distinct from 'array' then raise exception 'Expected an array' using errcode='22023'; end if;
  if jsonb_array_length(changes) not between 1 and 120 or octet_length(changes::text)>4000000 then raise exception 'Invalid batch size' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(changes)) <> (select count(distinct (value->>'type',value->>'year',case when value->>'type'='month' then value->>'month' else 'all' end)) from jsonb_array_elements(changes)) then
    raise exception 'Duplicate periods' using errcode='22023';
  end if;
  for entry in select value from jsonb_array_elements(changes) order by value->>'type', (value->>'year')::integer, coalesce((value->>'month')::integer,-1)
  loop
    if entry->>'user_id' is distinct from owner::text then raise exception 'Account changed' using errcode='42501'; end if;
    kind:=entry->>'type'; y:=(entry->>'year')::integer; m:=(entry->>'month')::integer;
    if kind not in ('month','goals') or kind is null or y is null or y not between 2020 and 2200 or (kind='month' and (m is null or m not between 0 and 11)) then raise exception 'Invalid period' using errcode='22023'; end if;
    if not entry ? 'expected_updated_at' or jsonb_typeof(entry->'payload') is distinct from 'object' then raise exception 'Invalid payload or version' using errcode='22023'; end if;
    if kind='month' and (jsonb_typeof(entry->'payload'->'incomes') is distinct from 'array' or jsonb_typeof(entry->'payload'->'sections') is distinct from 'array') then raise exception 'Invalid month structure' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(owner::text || kind || y::text || coalesce(m::text,''),0));
    expected:=(entry->>'expected_updated_at')::timestamptz;
    actual:=null;
    if kind='month' then
      select updated_at into actual from public.months where user_id=owner and year=y and month=m for update;
    else
      select updated_at into actual from public.monthly_goals where user_id=owner and year=y for update;
    end if;
    -- A retry after a lost HTTP response is harmless if the intended payload was already committed.
    if actual is distinct from expected then
      if kind='month' and exists(select 1 from public.months where user_id=owner and year=y and month=m and data=entry->'payload') then
        results:=results||jsonb_build_array(jsonb_build_object('type',kind,'month',m,'year',y,'updated_at',actual));
        continue;
      elsif kind='goals' and exists(select 1 from public.monthly_goals where user_id=owner and year=y and goals=entry->'payload') then
        results:=results||jsonb_build_array(jsonb_build_object('type',kind,'year',y,'updated_at',actual));
        continue;
      end if;
      raise exception 'Data changed in another session' using errcode='40001';
    end if;
    next_version:=greatest(clock_timestamp(),coalesce(actual,'1970-01-01'::timestamptz)+interval '1 microsecond');
    if kind='month' then
      insert into public.months(user_id,month,year,data,updated_at) values(owner,m,y,entry->'payload',next_version)
      on conflict(user_id,month,year) do update set data=excluded.data,updated_at=excluded.updated_at;
    else
      insert into public.monthly_goals(user_id,year,goals,updated_at) values(owner,y,entry->'payload',next_version)
      on conflict(user_id,year) do update set goals=excluded.goals,updated_at=excluded.updated_at;
    end if;
    results:=results||jsonb_build_array(jsonb_build_object('type',kind,'month',m,'year',y,'updated_at',next_version));
  end loop;
  return results;
end;
$$;
revoke all on function public.save_finance_batch(jsonb) from public,anon;
grant execute on function public.save_finance_batch(jsonb) to authenticated;
