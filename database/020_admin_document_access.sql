grant select on public.generated_documents to authenticated;

create policy generated_documents_admin_read
  on public.generated_documents
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
