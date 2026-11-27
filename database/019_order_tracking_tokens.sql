create sequence public.order_tracking_seq;

alter table public.orders
  add column tracking_number bigint,
  add column access_token_hash text;

with numbered as (
  select id, row_number() over (order by created_at, id) as tracking_number
  from public.orders
)
update public.orders o
   set tracking_number = n.tracking_number
  from numbered n
 where n.id = o.id;

select setval(
  'public.order_tracking_seq'::regclass,
  greatest(coalesce((select max(tracking_number) from public.orders), 0), 1),
  coalesce((select max(tracking_number) from public.orders), 0) > 0
);

alter table public.orders
  alter column tracking_number set default nextval('public.order_tracking_seq'::regclass),
  alter column tracking_number set not null;

create unique index orders_tracking_number_unique on public.orders(tracking_number);
grant usage, select on sequence public.order_tracking_seq to authenticated;

create or replace function public.get_guest_order_summary(p_order uuid)
returns table(service_id text, status text, price_fils integer, package_tier text, discount_fils integer, payment_submitted boolean)
language sql security definer set search_path = '' as $$
  select o.service_id, o.status, o.price_fils, o.package_tier, o.discount_fils, o.payment_reference is not null
    from public.orders o
   where o.id = p_order and o.user_id is null and o.access_token_hash is null
$$;

create or replace function public.track_guest_order(p_order uuid)
returns table(service_id text, status text, price_fils integer, payment_submitted boolean)
language sql security definer set search_path = '' as $$
  select o.service_id, o.status, o.price_fils, o.payment_reference is not null
    from public.orders o
   where o.id = p_order and o.user_id is null and o.access_token_hash is null
$$;

create or replace function public.get_generated_document(p_order uuid)
returns table(service_id text, content jsonb)
language sql security definer set search_path = '' as $$
  select d.service_id, d.content
    from public.generated_documents d
    join public.orders o on o.id = d.order_id
   where d.order_id = p_order and o.user_id is null and o.access_token_hash is null
     and o.status in ('paid', 'fulfilled')
$$;

create or replace function public.submit_guest_payment(p_order uuid, p_account uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(trim(coalesce(p_reference, ''))) not between 3 and 150 then raise exception 'Invalid reference'; end if;
  update public.orders o
     set cliq_account_id = p_account, payment_reference = trim(p_reference)
   where o.id = p_order and o.user_id is null and o.access_token_hash is null
     and o.status = 'pending' and o.payment_reference is null
     and exists (select 1 from public.cliq_accounts c where c.id = p_account and c.active);
  if not found then raise exception 'Payment submission unavailable'; end if;
end $$;

create function public.submit_guest_package_order_v3(
  p_service text, p_tier text, p_name text, p_phone text, p_details text,
  p_ref text default null, p_coupon text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result_id uuid;
  result_tracking bigint;
  access_token text := encode(extensions.gen_random_bytes(32), 'hex');
  base_price integer;
  final_price integer;
  discount integer := 0;
  normalized_coupon text := upper(trim(coalesce(p_coupon, '')));
  coupon public.coupon_codes%rowtype;
begin
  if p_tier is null or p_tier not in ('basic', 'advanced', 'vip') then raise exception 'Invalid tier'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 100
     or length(trim(coalesce(p_phone, ''))) not between 7 and 25
     or length(trim(coalesce(p_details, ''))) not between 1 and 3000 then raise exception 'Invalid details'; end if;

  select case when p_tier = 'basic' then s.price_fils else p.price_fils end
    into base_price
    from public.services s
    left join public.service_packages p on p.service_id = s.id and p.tier = p_tier
   where s.id = p_service and s.active;
  if base_price is null then raise exception 'Unavailable'; end if;

  if normalized_coupon <> '' then
    select * into coupon from public.coupon_codes c where c.code = normalized_coupon for update;
    if not found or not coupon.active or (coupon.expires_at is not null and coupon.expires_at <= now())
       or (coupon.max_uses is not null and coupon.uses >= coupon.max_uses) then raise exception 'Invalid coupon'; end if;
    discount := least(base_price - 1, (base_price * coupon.discount_percent + 50) / 100);
    update public.coupon_codes set uses = uses + 1 where code = normalized_coupon;
  end if;
  final_price := base_price - discount;

  insert into public.orders(
    user_id, service_id, price_fils, package_tier, discount_fils, coupon_code,
    details, referral_code, access_token_hash
  ) values (
    null, p_service, final_price, p_tier, discount, nullif(normalized_coupon, ''),
    jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone), 'text', trim(p_details)),
    case when p_ref ~ '^[a-f0-9]{32}$' then p_ref else null end,
    encode(extensions.digest(convert_to(access_token, 'UTF8'), 'sha256'), 'hex')
  ) returning id, tracking_number into result_id, result_tracking;

  return jsonb_build_object(
    'order_id', result_id,
    'tracking_number', case when result_tracking < 1000000 then lpad(result_tracking::text, 6, '0') else result_tracking::text end,
    'access_token', access_token
  );
end $$;
revoke all on function public.submit_guest_package_order_v3(text,text,text,text,text,text,text) from public;
grant execute on function public.submit_guest_package_order_v3(text,text,text,text,text,text,text) to anon, authenticated;

create function public.get_guest_order_summary_v3(p_tracking_number text, p_access_token text)
returns table(
  order_id uuid, tracking_number text, service_id text, service_title text,
  status text, price_fils integer, package_tier text, discount_fils integer,
  payment_submitted boolean, created_at timestamptz
)
language sql security definer set search_path = '' as $$
  select o.id,
         case when o.tracking_number < 1000000 then lpad(o.tracking_number::text, 6, '0') else o.tracking_number::text end,
         o.service_id, s.title, o.status, o.price_fils, o.package_tier, o.discount_fils,
         o.payment_reference is not null, o.created_at
    from public.orders o join public.services s on s.id = o.service_id
   where p_tracking_number ~ '^[0-9]{6,20}$'
     and length(coalesce(p_access_token, '')) = 64
     and o.tracking_number = p_tracking_number::bigint
     and o.user_id is null
     and o.access_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')
$$;
revoke all on function public.get_guest_order_summary_v3(text,text) from public;
grant execute on function public.get_guest_order_summary_v3(text,text) to anon, authenticated;

create function public.submit_guest_payment_v3(
  p_tracking_number text, p_access_token text, p_account uuid, p_reference text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tracking_number !~ '^[0-9]{6,20}$' or length(coalesce(p_access_token, '')) <> 64
     or length(trim(coalesce(p_reference, ''))) not between 3 and 150 then raise exception 'Invalid payment details'; end if;
  update public.orders o
     set cliq_account_id = p_account, payment_reference = trim(p_reference)
   where o.tracking_number = p_tracking_number::bigint
     and o.access_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')
     and o.user_id is null and o.status = 'pending' and o.payment_reference is null
     and exists (select 1 from public.cliq_accounts c where c.id = p_account and c.active);
  if not found then raise exception 'Payment submission unavailable'; end if;
end $$;
revoke all on function public.submit_guest_payment_v3(text,text,uuid,text) from public;
grant execute on function public.submit_guest_payment_v3(text,text,uuid,text) to anon, authenticated;

create function public.get_generated_document_v3(p_tracking_number text, p_access_token text)
returns table(service_id text, content jsonb)
language sql security definer set search_path = '' as $$
  select d.service_id, d.content
    from public.generated_documents d
    join public.orders o on o.id = d.order_id
   where p_tracking_number ~ '^[0-9]{6,20}$'
     and length(coalesce(p_access_token, '')) = 64
     and o.tracking_number = p_tracking_number::bigint
     and o.access_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')
     and o.user_id is null and o.status in ('paid', 'fulfilled')
     and d.order_id = o.id
$$;
revoke all on function public.get_generated_document_v3(text,text) from public;
grant execute on function public.get_generated_document_v3(text,text) to anon, authenticated;

create or replace function public.submit_guest_package_order_v2(
  p_service text, p_tier text, p_name text, p_phone text, p_details text,
  p_ref text default null, p_coupon text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  result uuid;
  base_price integer;
  final_price integer;
  discount integer := 0;
  normalized_coupon text := upper(trim(coalesce(p_coupon, '')));
  coupon public.coupon_codes%rowtype;
begin
  if p_tier is null or p_tier not in ('basic', 'advanced', 'vip') then raise exception 'Invalid tier'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 100
     or length(trim(coalesce(p_phone, ''))) not between 7 and 25
     or length(trim(coalesce(p_details, ''))) not between 1 and 3000 then raise exception 'Invalid details'; end if;
  select case when p_tier = 'basic' then s.price_fils else p.price_fils end into base_price
    from public.services s left join public.service_packages p on p.service_id = s.id and p.tier = p_tier
   where s.id = p_service and s.active;
  if base_price is null then raise exception 'Unavailable'; end if;
  if normalized_coupon <> '' then
    select * into coupon from public.coupon_codes c where c.code = normalized_coupon for update;
    if not found or not coupon.active or (coupon.expires_at is not null and coupon.expires_at <= now())
       or (coupon.max_uses is not null and coupon.uses >= coupon.max_uses) then raise exception 'Invalid coupon'; end if;
    discount := least(base_price - 1, (base_price * coupon.discount_percent + 50) / 100);
    update public.coupon_codes set uses = uses + 1 where code = normalized_coupon;
  end if;
  final_price := base_price - discount;
  insert into public.orders(user_id, service_id, price_fils, package_tier, discount_fils, coupon_code, details, referral_code)
  values (null, p_service, final_price, p_tier, discount, nullif(normalized_coupon, ''),
          jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone), 'text', trim(p_details)),
          case when p_ref ~ '^[a-f0-9]{32}$' then p_ref else null end)
  returning id into result;
  return result;
end $$;

-- The legacy UUID routes remain valid for orders created before this migration.
-- New orders require both the short tracking number and the high-entropy access token.
