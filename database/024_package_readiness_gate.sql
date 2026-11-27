alter table public.service_packages
  add column enabled boolean not null default false;

grant update(enabled) on public.service_packages to authenticated;

drop policy if exists package_public_read on public.service_packages;
create policy package_public_read
  on public.service_packages
  for select
  to anon, authenticated
  using (
    enabled and exists (
      select 1 from public.services s
       where s.id = service_packages.service_id and s.active
    )
  );

create function private.guard_order_package_readiness()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.package_tier in ('advanced','vip') and not exists (
    select 1 from public.service_packages p
     where p.service_id = new.service_id and p.tier = new.package_tier and p.enabled
  ) then
    raise exception 'Selected package is not available for sale';
  end if;
  return new;
end $$;

create trigger order_package_readiness
before insert or update of service_id, package_tier on public.orders
for each row execute function private.guard_order_package_readiness();
