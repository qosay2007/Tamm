create function public.track_guest_order(p_order uuid) returns table(service_id text,status text,price_fils integer,payment_submitted boolean) language sql security definer set search_path='' as $$select o.service_id,o.status,o.price_fils,o.payment_reference is not null from public.orders o where o.id=p_order and o.user_id is null$$;
revoke all on function public.track_guest_order(uuid) from public;
grant execute on function public.track_guest_order(uuid) to anon,authenticated;
create function private.guard_order_status() returns trigger language plpgsql set search_path='' as $$begin
if old.status=new.status then return new;end if;
if not ((old.status='pending' and new.status in ('paid','cancelled')) or (old.status='paid' and new.status='fulfilled')) then raise exception 'Invalid order transition';end if;
if new.status='paid' and new.user_id is null and new.payment_reference is null then raise exception 'Payment reference required';end if;
return new;end$$;
create trigger guard_order_status before update of status on public.orders for each row execute function private.guard_order_status();
create unique index orders_unique_payment_reference on public.orders(cliq_account_id,lower(trim(payment_reference))) where payment_reference is not null;