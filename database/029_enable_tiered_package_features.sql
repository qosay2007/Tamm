create or replace function public.attach_guest_upload(
  p_order uuid, p_path text, p_file_name text, p_content_type text, p_file_size integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  safe_name text;
begin
  safe_name := regexp_replace(coalesce(p_file_name, ''), '[^A-Za-z0-9._ -]', '', 'g');
  if p_path is null
     or p_path !~ ('^' || p_order::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif|pdf)$')
     or length(safe_name) not between 1 and 120
     or p_content_type not in ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf')
     or p_file_size is null or p_file_size < 1 or p_file_size > 10485760 then
    raise exception 'Invalid attachment';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'tamm-order-files' and o.name = p_path
  ) then
    raise exception 'Attachment not found';
  end if;
  update public.orders o
     set details = jsonb_set(
       o.details,
       '{attachments}',
       coalesce(o.details->'attachments', '[]'::jsonb) || jsonb_build_array(
         jsonb_build_object('path', p_path, 'name', safe_name, 'type', p_content_type, 'size', p_file_size)
       ),
       true
     )
   where o.id = p_order
     and o.user_id is null
     and o.status = 'pending'
     and jsonb_array_length(
       case when jsonb_typeof(o.details->'attachments') = 'array'
         then o.details->'attachments' else '[]'::jsonb end
     ) < case
       when o.service_id = 'qr' and o.package_tier = 'basic' then 0
       when o.service_id = 'qr' then 1
       when o.package_tier = 'basic' then 1
       when o.package_tier = 'advanced' then 3
       when o.package_tier = 'vip' then 5
       else 0
     end;
  if not found then raise exception 'Upload unavailable'; end if;
end
$function$;

update public.service_packages p
   set enabled = true
  from public.services s
 where s.id = p.service_id
   and s.active
   and p.tier in ('advanced','vip');
