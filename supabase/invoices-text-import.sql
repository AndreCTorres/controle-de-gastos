create or replace function public.import_nubank_text(
 p_source_text text,p_source_filename text,p_source_message_id text,p_user_id uuid,
 p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() <> p_user_id then
  raise exception 'Conta inválida para esta importação' using errcode='42501';
 end if;
 return public.apply_nubank_invoice(
  public.preview_nubank_text(p_source_text,p_source_filename),
  p_source_message_id,p_user_id,p_expected_updated_at,null
 );
end;
$$;
revoke all on function public.import_nubank_text(text,text,text,uuid,timestamptz) from public,anon;
grant execute on function public.import_nubank_text(text,text,text,uuid,timestamptz) to authenticated;
