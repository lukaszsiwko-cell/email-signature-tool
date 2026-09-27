-- Adds the UPDATE and DELETE row-level security policies that were missing
-- from the initial department-scoped data foundation (which only added
-- SELECT/INSERT). Reuses the same department-scoping predicate.

create policy "users can update employees in their department"
  on public.employees
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  );

create policy "users can delete employees in their department"
  on public.employees
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.department_id = employees.department_id
    )
  );
