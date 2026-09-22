create extension if not exists pgcrypto;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  department_id uuid not null references public.departments (id),
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id),
  first_name text not null,
  last_name text not null,
  position text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.employees enable row level security;

-- Departments must be readable before authentication so signup can render the selector.
create policy "departments are readable by anon and authenticated users"
  on public.departments
  for select
  to anon, authenticated
  using (true);

create policy "users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can view employees in their department"
  on public.employees
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  );

create policy "users can insert employees in their department"
  on public.employees
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, department_id)
  values (new.id, (new.raw_user_meta_data ->> 'department_id')::uuid);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
