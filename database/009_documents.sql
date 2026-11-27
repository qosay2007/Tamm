create table public.generated_documents(order_id uuid primary key references public.orders(id),service_id text not null,content jsonb not null,created_at timestamptz not null default now());
alter table public.generated_documents enable row level security;
revoke all on public.generated_documents from anon,authenticated;
create function private.generate_document() returns trigger language plpgsql security definer set search_path='' as $$begin
if old.status='pending' and new.status='paid' and new.user_id is null and new.service_id in ('cv','certificate','birthday','wedding') then
insert into public.generated_documents(order_id,service_id,content) values(new.id,new.service_id,jsonb_build_object('name',new.details->>'name','text',new.details->>'text')) on conflict do nothing;
end if;return new;end$$;
revoke all on function private.generate_document() from public,anon,authenticated;
create trigger generate_document after update of status on public.orders for each row execute function private.generate_document();
create function public.get_generated_document(p_order uuid) returns table(service_id text,content jsonb) language sql security definer set search_path='' as $$select d.service_id,d.content from public.generated_documents d join public.orders o on o.id=d.order_id where d.order_id=p_order and o.user_id is null and o.status in ('paid','fulfilled')$$;
revoke all on function public.get_generated_document(uuid) from public;
grant execute on function public.get_generated_document(uuid) to anon,authenticated;