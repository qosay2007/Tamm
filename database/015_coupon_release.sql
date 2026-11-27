create or replace function private.release_coupon_on_cancel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'cancelled' and new.coupon_code is not null then
    update public.coupon_codes set uses = greatest(uses - 1, 0) where code = new.coupon_code;
  end if;
  return new;
end $$;
revoke all on function private.release_coupon_on_cancel() from public, anon, authenticated;
create trigger release_coupon_on_cancel
  after update of status on public.orders
  for each row execute function private.release_coupon_on_cancel();
