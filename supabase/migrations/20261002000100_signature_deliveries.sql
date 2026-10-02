create extension if not exists pg_cron with schema pg_catalog;

create table public.signature_deliveries (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  artifact_bundle jsonb not null check (
    jsonb_typeof(artifact_bundle) = 'object'
    and jsonb_typeof(artifact_bundle -> 'outlookHtml') = 'string'
    and jsonb_typeof(artifact_bundle -> 'thunderbirdInstaller') = 'string'
    and jsonb_typeof(artifact_bundle -> 'thunderbirdLauncher') = 'string'
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index signature_deliveries_expires_at_idx on public.signature_deliveries (expires_at);

alter table public.signature_deliveries enable row level security;
revoke all on public.signature_deliveries from anon, authenticated;
grant insert on public.signature_deliveries to authenticated;

create policy "users can create signature deliveries for their department"
  on public.signature_deliveries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      join public.employees on employees.department_id = profiles.department_id
      where profiles.id = auth.uid()
        and profiles.department_id = signature_deliveries.department_id
        and employees.id = signature_deliveries.employee_id
    )
  );

create or replace function public.redeem_signature_delivery(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  redeemed_bundle jsonb;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  delete from public.signature_deliveries as delivery
  where delivery.token_hash = p_token_hash
    and delivery.expires_at > statement_timestamp()
  returning delivery.artifact_bundle into redeemed_bundle;

  return redeemed_bundle;
end;
$$;

revoke all on function public.redeem_signature_delivery(text) from public;
grant execute on function public.redeem_signature_delivery(text) to anon, authenticated;

select cron.schedule(
  'purge-expired-signature-deliveries',
  '0 * * * *',
  'delete from public.signature_deliveries where expires_at <= now()'
);
