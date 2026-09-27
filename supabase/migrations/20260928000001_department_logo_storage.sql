insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('department-logos', 'department-logos', false, 2097152, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;

-- departments only had a SELECT policy before this slice (F-01); setting a logo
-- requires letting a department's own members update their own department row.
create policy "users can update their own department"
  on public.departments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = departments.id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = departments.id
    )
  );

create policy "users can view their department's logo"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );

create policy "users can upload their department's logo"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );

create policy "users can replace their department's logo"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  )
  with check (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );

create policy "users can delete their department's logo"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'department-logos'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = (storage.foldername(name))[1]::uuid
    )
  );
