create policy staff_invites_deny_direct_access
  on public.staff_invites
  for all
  to anon, authenticated
  using (false)
  with check (false);
