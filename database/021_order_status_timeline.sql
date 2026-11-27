create table public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null check (event_key in ('order_received','payment_submitted','paid','fulfilled','cancelled')),
  created_at timestamptz not null default now()
);
create index order_status_events_order_time on public.order_status_events(order_id, created_at, id);
alter table public.order_status_events enable row level security;
revoke all on public.order_status_events from anon, authenticated;

insert into public.order_status_events(order_id, event_key, created_at)
select id, 'order_received', created_at from public.orders;

create function private.log_order_timeline_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_events(order_id, event_key, created_at)
    values (new.id, 'order_received', new.created_at);
    return new;
  end if;

  if old.payment_reference is null and new.payment_reference is not null then
    insert into public.order_status_events(order_id, event_key)
    values (new.id, 'payment_submitted');
  end if;
  if old.status is distinct from new.status then
    insert into public.order_status_events(order_id, event_key)
    values (new.id, new.status);
  end if;
  return new;
end $$;

create trigger order_timeline_insert
after insert on public.orders
for each row execute function private.log_order_timeline_event();
create trigger order_timeline_update
after update of status, payment_reference on public.orders
for each row execute function private.log_order_timeline_event();

create function public.get_guest_order_timeline_v3(p_tracking_number text, p_access_token text)
returns table(event_key text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select e.event_key, e.created_at
    from public.order_status_events e
    join public.orders o on o.id = e.order_id
   where p_tracking_number ~ '^[0-9]{6,20}$'
     and length(coalesce(p_access_token, '')) = 64
     and o.tracking_number = p_tracking_number::bigint
     and o.user_id is null
     and o.access_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')
   order by e.created_at, e.id
$$;
revoke all on function public.get_guest_order_timeline_v3(text,text) from public;
grant execute on function public.get_guest_order_timeline_v3(text,text) to anon, authenticated;
