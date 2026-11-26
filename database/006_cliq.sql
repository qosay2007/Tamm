create table public.cliq_accounts(id uuid primary key default gen_random_uuid(),beneficiary text not null check(length(beneficiary) between 1 and 100),alias text not null unique check(length(alias) between 1 and 100),active boolean not null default true,is_default boolean not null default false,check(not is_default or active));
create unique index cliq_one_default on public.cliq_accounts(is_default) where is_default;
alter table public.cliq_accounts enable row level security;
revoke all on public.cliq_accounts from anon,authenticated;
grant select on public.cliq_accounts to anon,authenticated;
grant insert,update on public.cliq_accounts to authenticated;
create policy cliq_public_read on public.cliq_accounts for select to anon,authenticated using(active);
create policy cliq_admin_manage on public.cliq_accounts for all to authenticated using(exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin')) with check(exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin'));
create function public.set_default_cliq(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$begin
if not exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin') then raise exception 'Forbidden'; end if;
update public.cliq_accounts set is_default=false where is_default;
update public.cliq_accounts set is_default=true where id=p_id and active;
if not found then raise exception 'Account unavailable'; end if;end$$;
revoke all on function public.set_default_cliq(uuid) from public,anon;
grant execute on function public.set_default_cliq(uuid) to authenticated;