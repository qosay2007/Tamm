-- Add explicit production and delivery stages without changing existing orders.
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending','paid','preparing','ready','fulfilled','cancelled'));

alter table public.order_status_events
  drop constraint if exists order_status_events_event_key_check;

alter table public.order_status_events
  add constraint order_status_events_event_key_check
  check (event_key in ('order_received','payment_submitted','paid','preparing','ready','fulfilled','cancelled'));

create or replace function public.admin_set_order_status_v1(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_status text; proof_required boolean; proof_path text; payment_ref text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_roles r where r.user_id = auth.uid() and r.role = 'admin'
  ) then raise exception 'Admin permission required'; end if;
  if p_status not in ('paid','preparing','ready','fulfilled','cancelled') then
    raise exception 'Invalid order status';
  end if;

  select o.status, o.payment_proof_required, o.payment_proof_path, o.payment_reference
    into current_status, proof_required, proof_path, payment_ref
    from public.orders o where o.id = p_order for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status = 'paid' then
    if current_status <> 'pending' then raise exception 'Order is not awaiting payment'; end if;
    if payment_ref is null then raise exception 'Customer has not submitted the transfer reference'; end if;
    if proof_required and proof_path is null then raise exception 'Payment proof is required before approval'; end if;
  elsif p_status = 'cancelled' then
    if current_status <> 'pending' then raise exception 'Only pending orders can be cancelled'; end if;
  elsif p_status = 'preparing' then
    if current_status <> 'paid' then raise exception 'Order must have confirmed payment before preparation'; end if;
  elsif p_status = 'ready' then
    if current_status <> 'preparing' then raise exception 'Order must be in preparation before it can be marked ready'; end if;
  elsif p_status = 'fulfilled' then
    if current_status not in ('paid','ready') then raise exception 'Order is not ready for delivery'; end if;
  end if;

  update public.orders
     set status = p_status,
         payment_reviewed_at = case when p_status = 'paid' then now() else payment_reviewed_at end,
         payment_reviewed_by = case when p_status = 'paid' then auth.uid() else payment_reviewed_by end
   where id = p_order and status = current_status;
  if not found then raise exception 'Order status changed; refresh and retry'; end if;
end $$;

create or replace function public.get_generated_document(p_order uuid)
returns table(service_id text, content jsonb)
language sql security definer set search_path = '' as $$
  select d.service_id, d.content
    from public.generated_documents d
    join public.orders o on o.id = d.order_id
   where d.order_id = p_order and o.user_id is null
     and o.access_token_hash is null and o.status in ('paid','preparing','ready','fulfilled')
$$;

create or replace function public.get_generated_document_v3(p_tracking_number text, p_access_token text)
returns table(service_id text, content jsonb)
language sql security definer set search_path = '' as $$
  select d.service_id, d.content
    from public.generated_documents d
    join public.orders o on o.id = d.order_id
   where p_tracking_number ~ '^[0-9]{6,20}$'
     and length(coalesce(p_access_token, '')) = 64
     and o.tracking_number = p_tracking_number::bigint
     and o.access_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')
     and o.user_id is null and o.status in ('paid','preparing','ready','fulfilled')
     and d.order_id = o.id
$$;

revoke all on function public.get_generated_document(uuid) from public;
grant execute on function public.get_generated_document(uuid) to anon, authenticated;
revoke all on function public.get_generated_document_v3(text,text) from public;
grant execute on function public.get_generated_document_v3(text,text) to anon, authenticated;
