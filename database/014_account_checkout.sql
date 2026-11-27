create function public.submit_checkout_order(
  p_service text, p_name text, p_phone text, p_details text, p_ref text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  buyer uuid := auth.uid();
  order_id uuid;
begin
  if p_service = 'qr' and (
    trim(coalesce(p_details, '')) !~* '^https?://[^[:space:]]+$'
    or octet_length(trim(p_details)) > 2000
  ) then
    raise exception 'Invalid QR link';
  end if;

  order_id := public.submit_guest_order(p_service, p_name, p_phone, p_details, p_ref);
  if buyer is not null then
    update public.orders set user_id = buyer where id = order_id;
  end if;
  return order_id;
end;
$$;
revoke all on function public.submit_checkout_order(text, text, text, text, text) from public;
grant execute on function public.submit_checkout_order(text, text, text, text, text) to anon, authenticated;

create or replace function public.track_guest_order(p_order uuid)
returns table(service_id text, status text, price_fils integer, payment_submitted boolean)
language sql security definer set search_path = '' as $$
  select o.service_id, o.status, o.price_fils, o.payment_reference is not null
  from public.orders o
  where o.id = p_order and (o.user_id is null or o.user_id = auth.uid());
$$;

create or replace function public.submit_guest_payment(p_order uuid, p_account uuid, p_reference text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if length(trim(coalesce(p_reference, ''))) not between 3 and 150 then
    raise exception 'Invalid reference';
  end if;

  update public.orders
  set cliq_account_id = p_account, payment_reference = trim(p_reference)
  where id = p_order
    and (user_id is null or user_id = auth.uid())
    and status = 'pending' and payment_reference is null
    and exists (select 1 from public.cliq_accounts where id = p_account and active);

  if not found then raise exception 'Payment submission unavailable'; end if;
end;
$$;

create or replace function private.guard_order_status()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'pending' and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid' and new.status = 'fulfilled')
  ) then
    raise exception 'Invalid order transition';
  end if;
  if new.status = 'paid' and new.payment_reference is null then
    raise exception 'Payment reference required';
  end if;
  return new;
end;
$$;

create or replace function private.generate_document()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'paid' then
    insert into public.generated_documents(order_id, service_id, content)
    values (new.id, new.service_id, jsonb_build_object('name', new.details->>'name', 'text', new.details->>'text'))
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.get_generated_document(p_order uuid)
returns table(service_id text, content jsonb)
language sql security definer set search_path = '' as $$
  select d.service_id, d.content
  from public.generated_documents d
  join public.orders o on o.id = d.order_id
  where d.order_id = p_order and (o.user_id is null or o.user_id = auth.uid())
    and o.status in ('paid', 'fulfilled');
$$;

insert into public.generated_documents(order_id, service_id, content)
select id, service_id, jsonb_build_object('name', details->>'name', 'text', details->>'text')
from public.orders
where user_id is not null and status in ('paid', 'fulfilled')
on conflict (order_id) do nothing;
