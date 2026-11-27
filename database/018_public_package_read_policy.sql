drop policy if exists package_read on public.service_packages;

create policy package_public_read
  on public.service_packages
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.services s
      where s.id = service_packages.service_id
        and s.active
    )
  );

create policy package_admin_read
  on public.service_packages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_roles r
      where r.user_id = (select auth.uid())
        and r.role = 'admin'
    )
  );
