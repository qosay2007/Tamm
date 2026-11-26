alter table public.orders add column cliq_account_id uuid references public.cliq_accounts(id), add column payment_reference text check(length(payment_reference)<=150);
create function public.submit_guest_payment(p_order uuid,p_account uuid,p_reference text) returns void language plpgsql security definer set search_path='' as $$begin
if length(trim(coalesce(p_reference,''))) not between 3 and 150 then raise exception 'Invalid reference';end if;
update public.orders set cliq_account_id=p_account,payment_reference=trim(p_reference) where id=p_order and user_id is null and status='pending' and payment_reference is null and exists(select 1 from public.cliq_accounts where id=p_account and active);
if not found then raise exception 'Payment submission unavailable';end if;end$$;
revoke all on function public.submit_guest_payment(uuid,uuid,text) from public;
grant execute on function public.submit_guest_payment(uuid,uuid,text) to anon,authenticated;
create or replace function private.order_commission() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.status in ('paid','fulfilled') then insert into public.commissions(order_id,marketer_id,amount_fils) select new.id,m.user_id,new.price_fils/2 from public.marketers m where m.referral_code=new.referral_code and m.active and m.user_id is distinct from new.user_id on conflict(order_id) do nothing;end if;return new;end$$;