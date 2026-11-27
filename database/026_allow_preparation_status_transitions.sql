create or replace function private.guard_order_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'pending' and new.status in ('paid','cancelled'))
    or (old.status = 'paid' and new.status in ('preparing','fulfilled'))
    or (old.status = 'preparing' and new.status = 'ready')
    or (old.status = 'ready' and new.status = 'fulfilled')
  ) then raise exception 'Invalid order transition'; end if;
  if new.status = 'paid' and new.user_id is null and new.payment_reference is null then
    raise exception 'Payment reference required';
  end if;
  return new;
end $$;
