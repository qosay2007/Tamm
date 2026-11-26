alter table public.orders alter column user_id drop not null;
create function public.submit_guest_order(p_service text,p_name text,p_phone text,p_details text,p_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid; price integer; begin
if length(trim(coalesce(p_name,''))) not between 2 and 100 or length(trim(coalesce(p_phone,''))) not between 7 and 25 or length(trim(coalesce(p_details,''))) not between 1 and 3000 then raise exception 'Invalid details'; end if;
select price_fils into price from public.services where id=p_service and active; if not found then raise exception 'Service unavailable'; end if;
insert into public.orders(user_id,service_id,price_fils,details,referral_code) values(null,p_service,price,jsonb_build_object('name',p_name,'phone',p_phone,'text',p_details),case when p_ref ~ '^[a-f0-9]{32}$' then p_ref else null end) returning id into result;return result;end$$;
revoke all on function public.submit_guest_order(text,text,text,text,text) from public;
grant execute on function public.submit_guest_order(text,text,text,text,text) to anon,authenticated;