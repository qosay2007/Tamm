create or replace function private.guest_order_storage_allowed(p_order uuid, p_operation text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order and o.user_id is null
      and ((p_operation = 'upload' and o.status = 'pending')
        or (p_operation = 'read' and o.status in ('paid','preparing','ready','fulfilled')))
  )
$$;
