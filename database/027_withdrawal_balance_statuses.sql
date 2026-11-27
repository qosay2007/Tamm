create or replace function private.request_withdrawal(p_amount integer, p_alias text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); available bigint; result uuid;
begin
  perform 1 from public.marketers where user_id = u and active for update;
  if not found then raise exception 'Forbidden'; end if;

  select coalesce(sum(c.amount_fils), 0) into available
    from public.commissions c
    join public.orders o on o.id = c.order_id
   where c.marketer_id = u and o.status in ('paid','preparing','ready','fulfilled');
  available := available - (
    select coalesce(sum(amount_fils), 0) from public.withdrawals
     where user_id = u and status in ('pending','paid')
  );
  if p_amount is null or p_amount <= 0 or p_amount > available then
    raise exception 'Insufficient balance';
  end if;

  insert into public.withdrawals(user_id, amount_fils, cliq_alias)
  values (u, p_amount, p_alias)
  returning id into result;
  return result;
end $$;
