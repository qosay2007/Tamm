create or replace function private.guest_order_storage_allowed(p_order uuid, p_operation text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order and o.user_id is null
      and ((p_operation = 'upload' and o.status = 'pending')
        or (p_operation = 'read' and o.status in ('paid','fulfilled')))
  )
$$;
revoke all on function private.guest_order_storage_allowed(uuid,text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.guest_order_storage_allowed(uuid,text) to anon, authenticated;

drop policy if exists tamm_order_files_upload on storage.objects;
create policy tamm_order_files_upload on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'tamm-order-files'
    and case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.guest_order_storage_allowed(split_part(name, '/', 1)::uuid, 'upload')
      else false end
  );

drop policy if exists tamm_order_files_guest_read on storage.objects;
create policy tamm_order_files_guest_read on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'tamm-order-files'
    and case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.guest_order_storage_allowed(split_part(name, '/', 1)::uuid, 'read')
      else false end
  );
