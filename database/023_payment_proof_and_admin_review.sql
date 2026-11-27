alter table public.orders
  add column payment_proof_path text,
  add column payment_proof_required boolean not null default true,
  add column payment_reviewed_at timestamptz,
  add column payment_reviewed_by uuid references auth.users(id);

-- Existing orders predate the proof upload field and remain reviewable.
update public.orders set payment_proof_required = false;

alter table public.orders add constraint orders_payment_proof_path_format
  check (payment_proof_path is null or payment_proof_path ~ ('^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'));

create function public.submit_guest_payment_v4(
  p_tracking_number text, p_access_token text, p_account uuid, p_reference text, p_proof_path text
) returns void language plpgsql security definer set search_path = '' as $$
declare target_order uuid;
begin
  if p_tracking_number !~ '^[0-9]{6,20}$' or length(coalesce(p_access_token, '')) <> 64
     or length(trim(coalesce(p_reference, ''))) not between 3 and 150 then
    raise exception 'Invalid payment details';
  end if;

  select o.id into target_order
    from public.orders o
   where o.tracking_number = p_tracking_number::bigint
     and o.access_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')
     and o.user_id is null and o.status = 'pending' and o.payment_reference is null
   for update;
  if target_order is null then raise exception 'Payment submission unavailable'; end if;

  if p_proof_path is null or p_proof_path !~ ('^' || target_order::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$')
     or not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'tamm-order-files' and o.name = p_proof_path
     ) then
    raise exception 'Payment proof is required';
  end if;

  update public.orders o
     set cliq_account_id = p_account,
         payment_reference = trim(p_reference),
         payment_proof_path = p_proof_path
   where o.id = target_order and o.status = 'pending' and o.payment_reference is null
     and exists (select 1 from public.cliq_accounts c where c.id = p_account and c.active);
  if not found then raise exception 'Payment submission unavailable'; end if;
end $$;
revoke all on function public.submit_guest_payment_v4(text,text,uuid,text,text) from public;
grant execute on function public.submit_guest_payment_v4(text,text,uuid,text,text) to anon, authenticated;

create function public.admin_set_order_status_v1(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_status text; proof_required boolean; proof_path text; payment_ref text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_roles r where r.user_id = auth.uid() and r.role = 'admin'
  ) then raise exception 'Admin permission required'; end if;
  if p_status not in ('paid','fulfilled','cancelled') then raise exception 'Invalid order status'; end if;

  select o.status, o.payment_proof_required, o.payment_proof_path, o.payment_reference
    into current_status, proof_required, proof_path, payment_ref
    from public.orders o where o.id = p_order for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status = 'paid' then
    if current_status <> 'pending' then raise exception 'Order is not awaiting payment'; end if;
    if payment_ref is null then raise exception 'Customer has not submitted the transfer reference'; end if;
    if proof_required and proof_path is null then raise exception 'Payment proof is required before approval'; end if;
    update public.orders set status = 'paid', payment_reviewed_at = now(), payment_reviewed_by = auth.uid()
     where id = p_order and status = 'pending';
  elsif p_status = 'cancelled' then
    if current_status <> 'pending' then raise exception 'Only pending orders can be cancelled'; end if;
    update public.orders set status = 'cancelled' where id = p_order and status = 'pending';
  else
    if current_status <> 'paid' then raise exception 'Order is not ready for delivery'; end if;
    update public.orders set status = 'fulfilled' where id = p_order and status = 'paid';
  end if;
  if not found then raise exception 'Order status changed; refresh and retry'; end if;
end $$;
revoke all on function public.admin_set_order_status_v1(uuid,text) from public, anon;
grant execute on function public.admin_set_order_status_v1(uuid,text) to authenticated;
