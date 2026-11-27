create or replace function private.generate_document() returns trigger language plpgsql security definer set search_path='' as $$begin
if old.status='pending' and new.status='paid' and new.user_id is null and new.service_id in ('cv','certificate','birthday','wedding','card','links','website','menu','catalog') then
insert into public.generated_documents(order_id,service_id,content) values(new.id,new.service_id,jsonb_build_object('name',new.details->>'name','text',new.details->>'text')) on conflict do nothing;
end if;return new;end$$;