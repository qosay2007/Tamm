alter table public.orders
  add column if not exists discount_fils integer not null default 0 check (discount_fils >= 0),
  add column if not exists coupon_code text;

create table if not exists public.coupon_codes (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,24}$'),
  discount_percent smallint not null check (discount_percent between 1 and 90),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.coupon_codes enable row level security;
revoke all on public.coupon_codes from anon, authenticated;
grant select, insert, update on public.coupon_codes to authenticated;
create policy coupon_admin_read on public.coupon_codes for select to authenticated
  using (exists (select 1 from public.staff_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy coupon_admin_insert on public.coupon_codes for insert to authenticated
  with check (exists (select 1 from public.staff_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy coupon_admin_update on public.coupon_codes for update to authenticated
  using (exists (select 1 from public.staff_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
  with check (exists (select 1 from public.staff_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

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

  insert into public.orders(user_id, service_id, price_fils, package_tier, discount_fils, coupon_code, details, referral_code)
  values (null, p_service, final_price, p_tier, discount, nullif(normalized_coupon, ''),
          jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone), 'text', trim(p_details)),
          case when p_ref ~ '^[a-f0-9]{32}$' then p_ref else null end)
  returning id into result;
  return result;
end $$;
revoke all on function public.submit_guest_package_order_v2(text,text,text,text,text,text,text) from public;
grant execute on function public.submit_guest_package_order_v2(text,text,text,text,text,text,text) to anon, authenticated;

create or replace function public.get_guest_order_summary(p_order uuid)
returns table(service_id text, status text, price_fils integer, package_tier text, discount_fils integer, payment_submitted boolean)
language sql security definer set search_path = '' as $$
  select o.service_id, o.status, o.price_fils, o.package_tier, o.discount_fils, o.payment_reference is not null
    from public.orders o where o.id = p_order and o.user_id is null
$$;
revoke all on function public.get_guest_order_summary(uuid) from public;
grant execute on function public.get_guest_order_summary(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tamm-order-files', 'tamm-order-files', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

create policy tamm_order_files_upload on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'tamm-order-files'
    and case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then exists (select 1 from public.orders o where o.id = split_part(name, '/', 1)::uuid and o.user_id is null and o.status = 'pending')
      else false end
  );
create policy tamm_order_files_guest_read on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'tamm-order-files'
    and case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then exists (select 1 from public.orders o where o.id = split_part(name, '/', 1)::uuid and o.user_id is null and o.status in ('paid','fulfilled'))
      else false end
  );
create policy tamm_order_files_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'tamm-order-files' and exists (select 1 from public.staff_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

create or replace function public.attach_guest_upload(
  p_order uuid, p_path text, p_file_name text, p_content_type text, p_file_size integer
) returns void language plpgsql security definer set search_path = '' as $$
declare safe_name text;
begin
  safe_name := regexp_replace(coalesce(p_file_name, ''), '[^A-Za-z0-9._ -]', '', 'g');
  if p_path is null or p_path !~ ('^' || p_order::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$')
     or length(safe_name) not between 1 and 120
     or p_content_type not in ('image/jpeg','image/png','image/webp','application/pdf')
     or p_file_size is null or p_file_size < 1 or p_file_size > 10485760 then raise exception 'Invalid attachment'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'tamm-order-files' and o.name = p_path) then raise exception 'Attachment not found'; end if;
  update public.orders o
     set details = jsonb_set(o.details, '{attachments}', coalesce(o.details->'attachments', '[]'::jsonb) ||
       jsonb_build_array(jsonb_build_object('path', p_path, 'name', safe_name, 'type', p_content_type, 'size', p_file_size)), true)
   where o.id = p_order and o.user_id is null and o.status = 'pending'
     and jsonb_array_length(coalesce(o.details->'attachments', '[]'::jsonb)) < 5;
  if not found then raise exception 'Upload unavailable'; end if;
end $$;
revoke all on function public.attach_guest_upload(uuid,text,text,text,integer) from public;
grant execute on function public.attach_guest_upload(uuid,text,text,text,integer) to anon, authenticated;

create or replace function private.generate_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'paid' and new.user_id is null then
    insert into public.generated_documents(order_id, service_id, content)
    values (new.id, new.service_id, jsonb_build_object(
      'name', new.details->>'name', 'text', new.details->>'text',
      'package_tier', new.package_tier, 'attachments', coalesce(new.details->'attachments','[]'::jsonb)
    )) on conflict (order_id) do nothing;
  end if;
  return new;
end $$;
