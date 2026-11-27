-- One-time employee invitations. The raw token is returned to the admin once;
-- only its SHA-256 digest is stored in the database.
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('support','marketer')),
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  revoked_at timestamptz,
  check (claimed_at is null or claimed_by is not null)
);

create index staff_invites_email_pending_idx
  on public.staff_invites (lower(email), expires_at)
  where claimed_at is null and revoked_at is null;

alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from anon, authenticated;

create function public.admin_create_staff_invite_v1(p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_user uuid := auth.uid();
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_role text := lower(trim(coalesce(p_role, '')));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  target_user uuid;
  expiry timestamptz := now() + interval '7 days';
begin
  if admin_user is null or not exists (
    select 1 from public.staff_roles r
    where r.user_id = admin_user and r.role = 'admin'
  ) then
    raise exception 'Admin permission required';
  end if;

  if normalized_role not in ('support','marketer') then
    raise exception 'Invalid staff role';
  end if;
  if normalized_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Invalid email';
  end if;

  select u.id into target_user from auth.users u
   where lower(u.email) = normalized_email limit 1;
  if target_user is not null and exists (
    select 1 from public.staff_roles r where r.user_id = target_user
  ) then
    raise exception 'User already has a staff role';
  end if;

  update public.staff_invites
     set revoked_at = now()
   where lower(email) = normalized_email
     and claimed_at is null and revoked_at is null;

  insert into public.staff_invites(email, role, token_hash, created_by, expires_at)
  values (
    normalized_email,
    normalized_role,
    encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'),
    admin_user,
    expiry
  );

  return jsonb_build_object('invite_token', raw_token, 'role', normalized_role, 'expires_at', expiry);
end;
$$;

revoke all on function public.admin_create_staff_invite_v1(text, text) from public, anon;
grant execute on function public.admin_create_staff_invite_v1(text, text) to authenticated;

create function public.claim_staff_invite_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  confirmed_at timestamptz;
  invite public.staff_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if length(coalesce(p_token, '')) <> 64 or p_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invite unavailable';
  end if;

  select lower(u.email), u.email_confirmed_at
    into current_email, confirmed_at
    from auth.users u where u.id = current_user_id;
  if current_email is null then raise exception 'Authentication required'; end if;
  if confirmed_at is null then raise exception 'Email confirmation required'; end if;

  select i.* into invite
    from public.staff_invites i
   where i.token_hash = encode(extensions.digest(convert_to(lower(p_token), 'UTF8'), 'sha256'), 'hex')
   for update;
  if not found or invite.revoked_at is not null or invite.expires_at <= now()
     or (invite.claimed_at is not null and invite.claimed_by <> current_user_id) then
    raise exception 'Invite unavailable';
  end if;
  if lower(invite.email) <> current_email then
    raise exception 'Invite email mismatch';
  end if;

  if invite.claimed_by = current_user_id and invite.claimed_at is not null then
    return jsonb_build_object('role', invite.role);
  end if;
  if exists (select 1 from public.staff_roles r where r.user_id = current_user_id) then
    raise exception 'User already has a staff role';
  end if;

  insert into public.staff_roles(user_id, role)
  values (current_user_id, invite.role);

  if invite.role = 'marketer' then
    insert into public.marketers(user_id) values (current_user_id)
      on conflict (user_id) do nothing;
    update public.staff_applications
       set status = 'approved'
     where user_id = current_user_id and status = 'pending';
  end if;

  update public.staff_invites
     set claimed_by = current_user_id, claimed_at = now()
   where id = invite.id and claimed_at is null and revoked_at is null;

  return jsonb_build_object('role', invite.role);
end;
$$;

revoke all on function public.claim_staff_invite_v1(text) from public, anon;
grant execute on function public.claim_staff_invite_v1(text) to authenticated;
