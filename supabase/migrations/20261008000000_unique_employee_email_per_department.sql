do $$
begin
  if exists (
    select 1
    from public.employees
    where email is not null and btrim(email) <> ''
    group by department_id, lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce unique employee emails: resolve existing duplicate addresses within each department first.';
  end if;
end;
$$;

create unique index employees_department_normalized_email_key
  on public.employees (department_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';