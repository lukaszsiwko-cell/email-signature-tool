create or replace function public.revoke_signature_delivery(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  delete from public.signature_deliveries
  where token_hash = p_token_hash;
end;
$$;

revoke all on function public.revoke_signature_delivery(text) from public;
grant execute on function public.revoke_signature_delivery(text) to authenticated;
