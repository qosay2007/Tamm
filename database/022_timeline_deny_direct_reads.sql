create policy order_status_events_block_direct_access
on public.order_status_events
for all
to anon, authenticated
using (false)
with check (false);
