alter table public.orders add column referral_code text;
grant insert(referral_code) on public.orders to authenticated;
create table public.staff_applications(user_id uuid primary key references auth.users(id),created_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','approved','rejected')));
alter table public.staff_applications enable row level security;
revoke all on public.staff_applications from anon,authenticated;
grant select on public.staff_applications to authenticated;
grant insert(user_id) on public.staff_applications to authenticated;
create policy application_read on public.staff_applications for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin'));
create policy application_insert on public.staff_applications for insert to authenticated with check(user_id=auth.uid() and status='pending');
create schema if not exists private;
create function private.approve_marketer(p_user uuid) returns void language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin') then raise exception 'Forbidden'; end if;
update public.staff_applications set status='approved' where user_id=p_user and status='pending'; if not found then raise exception 'No pending application'; end if;
insert into public.staff_roles(user_id,role) values(p_user,'marketer') on conflict do nothing;
if not exists(select 1 from public.staff_roles where user_id=p_user and role='marketer') then raise exception 'Existing incompatible role'; end if;
insert into public.marketers(user_id) values(p_user) on conflict do nothing;
end$$;
revoke all on function private.approve_marketer(uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.approve_marketer(uuid) to authenticated;
create function public.approve_marketer(p_user uuid) returns void language sql security invoker set search_path='' as $$select private.approve_marketer(p_user)$$;
revoke all on function public.approve_marketer(uuid) from public,anon;
grant execute on function public.approve_marketer(uuid) to authenticated;
create function private.order_commission() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.status in ('paid','fulfilled') then
insert into public.commissions(order_id,marketer_id,amount_fils) select new.id,m.user_id,new.price_fils/2 from public.marketers m where m.referral_code=new.referral_code and m.active and m.user_id<>new.user_id on conflict(order_id) do nothing;
end if;
return new; end$$;
revoke all on function private.order_commission() from public,anon,authenticated;
create trigger order_commission after update of status on public.orders for each row execute function private.order_commission();
create table public.withdrawals(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.marketers(user_id),amount_fils integer not null check(amount_fils>0),cliq_alias text not null check(length(cliq_alias) between 1 and 100),status text not null default 'pending' check(status in ('pending','paid','rejected')),created_at timestamptz not null default now());
alter table public.withdrawals enable row level security;
revoke all on public.withdrawals from anon,authenticated;
grant select on public.withdrawals to authenticated;
create policy withdrawal_read on public.withdrawals for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin'));
create function private.request_withdrawal(p_amount integer,p_alias text) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=auth.uid(); available bigint; result uuid; begin
perform 1 from public.marketers where user_id=u and active for update; if not found then raise exception 'Forbidden'; end if;
select coalesce(sum(c.amount_fils),0) into available from public.commissions c join public.orders o on o.id=c.order_id where c.marketer_id=u and o.status in ('paid','fulfilled');
available:=available-(select coalesce(sum(amount_fils),0) from public.withdrawals where user_id=u and status in ('pending','paid'));
if p_amount is null or p_amount<=0 or p_amount>available then raise exception 'Insufficient balance'; end if;
insert into public.withdrawals(user_id,amount_fils,cliq_alias) values(u,p_amount,p_alias) returning id into result; return result; end$$;
revoke all on function private.request_withdrawal(integer,text) from public,anon;
grant execute on function private.request_withdrawal(integer,text) to authenticated;
create function public.request_withdrawal(p_amount integer,p_alias text) returns uuid language sql security invoker set search_path='' as $$select private.request_withdrawal(p_amount,p_alias)$$;
revoke all on function public.request_withdrawal(integer,text) from public,anon;
grant execute on function public.request_withdrawal(integer,text) to authenticated;
grant update(status) on public.withdrawals to authenticated;
create policy withdrawal_review on public.withdrawals for update to authenticated using(status='pending' and exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin')) with check(status in ('paid','rejected') and exists(select 1 from public.staff_roles where user_id=auth.uid() and role='admin'));