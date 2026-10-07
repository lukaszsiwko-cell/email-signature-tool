insert into public.profiles (id, department_id)
select users.id, departments.id
from auth.users as users
join public.departments as departments
  on departments.id::text = (users.raw_user_meta_data ->> 'department_id')
on conflict (id) do nothing;