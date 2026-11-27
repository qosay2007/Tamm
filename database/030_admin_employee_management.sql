-- Admin-only employee assignment for verified Supabase Auth accounts.
-- The function never accepts passwords and never grants the admin role.

create or replace function public.admin_list_staff_v1()
returns table(email text, display_name text, role text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  ) then
    raise exception 'Admin permission required';
  end if;

  return query
    select u.email::text, p.display_name::text, r.role::text
    from public.staff_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.user_id = r.user_id
    order by r.role, p.display_name nulls last, u.email;
end;
$$;

revoke all on function public.admin_list_staff_v1() from public, anon;
grant execute on function public.admin_list_staff_v1() to authenticated;

create or replace function public.admin_add_staff_v1(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_role text := lower(trim(coalesce(p_role, '')));
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  ) then
    raise exception 'Admin permission required';
  end if;

  if normalized_role not in ('support', 'marketer') then
    raise exception 'Invalid staff role';
  end if;
  if normalized_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Invalid email';
  end if;

  select u.id into target_user
  from auth.users u
  where lower(u.email) = normalized_email
    and u.email_confirmed_at is not null;

  if target_user is null then
    raise exception 'Verified account not found';
  end if;
  if exists (select 1 from public.staff_roles r where r.user_id = target_user) then
    raise exception 'User already has a staff role';
  end if;

  insert into public.staff_roles(user_id, role) values (target_user, normalized_role);

  if normalized_role = 'marketer' then
    insert into public.marketers(user_id) values (target_user);
    update public.staff_applications
      set status = 'approved'
      where user_id = target_user and status = 'pending';
  end if;
end;
$$;

revoke all on function public.admin_add_staff_v1(text, text) from public, anon;
grant execute on function public.admin_add_staff_v1(text, text) to authenticated;
