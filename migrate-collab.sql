-- ============================================================================
--  migrate-collab.sql — F2: account-based collaborative editing of matchs &
--  entraînements (real server tables + RLS + named collaborators with roles).
--
--  A Suite session (match or entraînement) can be shared to the server. The
--  OWNER adds named COLLABORATORS (found by nom de scène → immediate access, or
--  by email → 'pending' until they sign up and the row is claimed). Each has a
--  role (owner/editor/viewer). Live co-edit runs client-side over a Supabase
--  Realtime broadcast channel keyed by the resource id; this table is the
--  durable, RLS-protected source of truth (last-write-wins).
--
--  Replaces the #80 token-link model (shared_matches). Additive + idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── the shared resource (a match OR entraînement session, server-side) ──────
create table if not exists public.shared_resources (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('match', 'entrainement')),
  title         text not null default '',
  data          jsonb not null,                                    -- full Suite session object
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists shared_resources_owner_idx on public.shared_resources(owner_id);

-- ── collaborators (named accounts + roles; email invites are 'pending') ─────
create table if not exists public.resource_collaborators (
  id            uuid primary key default gen_random_uuid(),
  resource_id   uuid not null references public.shared_resources(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,  -- null while invited-by-email & unclaimed
  invited_email text,
  invited_label text,                                              -- nom de scène shown before claim
  role          text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  status        text not null default 'active' check (status in ('active', 'pending')),
  invited_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (resource_id, user_id),
  -- email is stored lower-cased (see add_collaborator), so a plain-column unique is
  -- enough — Postgres does NOT allow an expression like lower(...) in a table constraint.
  unique (resource_id, invited_email)
);
create index if not exists rc_user_idx  on public.resource_collaborators(user_id) where user_id is not null;
create index if not exists rc_email_idx on public.resource_collaborators(lower(invited_email)) where invited_email is not null;
create index if not exists rc_res_idx   on public.resource_collaborators(resource_id);

alter table public.shared_resources     enable row level security;
alter table public.resource_collaborators enable row level security;

-- ── access helpers (SECURITY DEFINER → bypass RLS internally, no recursion) ─
create or replace function public.can_access_resource(p_res uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_resources r
                  where r.id = p_res and r.owner_id = auth.uid())
      or exists (select 1 from public.resource_collaborators c
                  where c.resource_id = p_res and c.user_id = auth.uid() and c.status = 'active');
$$;
create or replace function public.can_edit_resource(p_res uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_resources r
                  where r.id = p_res and r.owner_id = auth.uid())
      or exists (select 1 from public.resource_collaborators c
                  where c.resource_id = p_res and c.user_id = auth.uid()
                    and c.status = 'active' and c.role in ('owner', 'editor'));
$$;
create or replace function public.is_resource_owner(p_res uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_resources r where r.id = p_res and r.owner_id = auth.uid());
$$;
revoke all on function public.can_access_resource(uuid) from public;
revoke all on function public.can_edit_resource(uuid) from public;
revoke all on function public.is_resource_owner(uuid) from public;
grant execute on function public.can_access_resource(uuid) to authenticated;
grant execute on function public.can_edit_resource(uuid) to authenticated;
grant execute on function public.is_resource_owner(uuid) to authenticated;

-- ── RLS: read for owner + active collaborators; writes go through the RPCs ──
drop policy if exists sr_access_select on public.shared_resources;
create policy sr_access_select on public.shared_resources
  for select using (public.can_access_resource(id));
drop policy if exists sr_owner_all on public.shared_resources;
create policy sr_owner_all on public.shared_resources
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists rc_read on public.resource_collaborators;
create policy rc_read on public.resource_collaborators
  for select using (user_id = auth.uid() or public.is_resource_owner(resource_id));

-- ── create: push a local session to the server (owner) → returns id ─────────
create or replace function public.share_resource_create(p_type text, p_title text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_type not in ('match', 'entrainement') then raise exception 'bad type'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad data'; end if;
  insert into public.shared_resources(owner_id, resource_type, title, data, updated_by)
    values (auth.uid(), p_type, coalesce(p_title, ''), p_data, auth.uid())
    returning id into v_id;
  return v_id;
end $$;

-- ── save: last-write-wins update (owner or active editor) ───────────────────
create or replace function public.save_shared_resource(p_id uuid, p_title text, p_data jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_now timestamptz;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not public.can_edit_resource(p_id) then raise exception 'not allowed'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad data'; end if;
  update public.shared_resources
     set data = p_data, title = coalesce(p_title, title), updated_at = now(), updated_by = auth.uid()
   where id = p_id
   returning updated_at into v_now;
  if v_now is null then raise exception 'not found'; end if;
  return v_now;
end $$;

-- ── get: the resource + my role (owner or active collaborator) ──────────────
create or replace function public.get_shared_resource(p_id uuid)
returns table(id uuid, resource_type text, title text, data jsonb, updated_at timestamptz, is_owner boolean, my_role text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not public.can_access_resource(p_id) then raise exception 'not allowed'; end if;
  return query
    select r.id, r.resource_type, r.title, r.data, r.updated_at,
           (r.owner_id = auth.uid()) as is_owner,
           case when r.owner_id = auth.uid() then 'owner'
                else coalesce((select c.role from public.resource_collaborators c
                                where c.resource_id = r.id and c.user_id = auth.uid() and c.status = 'active'), 'viewer')
           end as my_role
    from public.shared_resources r
    where r.id = p_id;
end $$;

-- ── "Partagés avec moi" (resources I collaborate on, not mine) ──────────────
drop function if exists public.list_shared_with_me();   -- return signature changed (added kind)
create or replace function public.list_shared_with_me()
returns table(id uuid, resource_type text, kind text, title text, updated_at timestamptz, role text, owner_name text)
language sql security definer set search_path = public stable as $$
  select r.id, r.resource_type, coalesce(r.data->>'kind', r.resource_type), r.title, r.updated_at, c.role,
         coalesce(nullif(btrim(op.nom_scene), ''), nullif(btrim(op.prenom), ''), 'Acto')
  from public.resource_collaborators c
  join public.shared_resources r on r.id = c.resource_id
  left join public.profiles op on op.id = r.owner_id
  where c.user_id = auth.uid() and c.status = 'active'
  order by r.updated_at desc;
$$;
revoke all on function public.list_shared_with_me() from public;
grant execute on function public.list_shared_with_me() to authenticated;

-- ── collaborators of a resource (owner or a collaborator can read the list) ─
create or replace function public.list_collaborators(p_res uuid)
returns table(id uuid, user_id uuid, name text, role text, status text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_access_resource(p_res) then raise exception 'not allowed'; end if;
  return query
    select c.id, c.user_id,
           coalesce(nullif(btrim(p.nom_scene), ''), nullif(btrim(p.prenom), ''), nullif(btrim(c.invited_label), ''), c.invited_email, '—'),
           c.role, c.status
    from public.resource_collaborators c
    left join public.profiles p on p.id = c.user_id
    where c.resource_id = p_res
    order by c.created_at asc;
end $$;

-- ── add a collaborator (owner only): by user_id → active, or email → pending ─
create or replace function public.add_collaborator(p_res uuid, p_user_id uuid, p_email text, p_label text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_role text := coalesce(nullif(p_role, ''), 'editor'); v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if auth.uid() is null or not public.is_resource_owner(p_res) then raise exception 'not owner'; end if;
  if v_role not in ('editor', 'viewer') then v_role := 'editor'; end if;    -- can't grant 'owner' via this path
  if p_user_id is not null then
    if p_user_id = auth.uid() then raise exception 'owner is not a collaborator'; end if;
    insert into public.resource_collaborators(resource_id, user_id, invited_label, role, status, invited_by)
      values (p_res, p_user_id, nullif(btrim(coalesce(p_label, '')), ''), v_role, 'active', auth.uid())
      on conflict (resource_id, user_id) do update set role = excluded.role, status = 'active'
      returning id into v_id;
  elsif v_email is not null then
    insert into public.resource_collaborators(resource_id, invited_email, invited_label, role, status, invited_by)
      values (p_res, v_email, nullif(btrim(coalesce(p_label, '')), ''), v_role, 'pending', auth.uid())
      on conflict (resource_id, invited_email) do update set role = excluded.role
      returning id into v_id;
  else
    raise exception 'need a user or an email';
  end if;
  return v_id;
end $$;

-- ── change a collaborator role / remove (owner only) ────────────────────────
create or replace function public.set_collaborator_role(p_res uuid, p_collab uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_resource_owner(p_res) then raise exception 'not owner'; end if;
  if coalesce(p_role, '') not in ('editor', 'viewer') then raise exception 'bad role'; end if;
  update public.resource_collaborators set role = p_role where id = p_collab and resource_id = p_res;
end $$;
create or replace function public.remove_collaborator(p_res uuid, p_collab uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_resource_owner(p_res) then raise exception 'not owner'; end if;
  delete from public.resource_collaborators where id = p_collab and resource_id = p_res;
end $$;

-- ── owner deletes a shared resource entirely ────────────────────────────────
create or replace function public.delete_shared_resource(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_resource_owner(p_id) then raise exception 'not owner'; end if;
  delete from public.shared_resources where id = p_id;   -- collaborators cascade
end $$;

revoke all on function public.share_resource_create(text, text, jsonb) from public;
revoke all on function public.save_shared_resource(uuid, text, jsonb) from public;
revoke all on function public.get_shared_resource(uuid) from public;
revoke all on function public.list_collaborators(uuid) from public;
revoke all on function public.add_collaborator(uuid, uuid, text, text, text) from public;
revoke all on function public.set_collaborator_role(uuid, uuid, text) from public;
revoke all on function public.remove_collaborator(uuid, uuid) from public;
revoke all on function public.delete_shared_resource(uuid) from public;
grant execute on function public.share_resource_create(text, text, jsonb) to authenticated;
grant execute on function public.save_shared_resource(uuid, text, jsonb) to authenticated;
grant execute on function public.get_shared_resource(uuid) to authenticated;
grant execute on function public.list_collaborators(uuid) to authenticated;
grant execute on function public.add_collaborator(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.set_collaborator_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_collaborator(uuid, uuid) to authenticated;
grant execute on function public.delete_shared_resource(uuid) to authenticated;

-- ── claim pending email-invites when the invited person signs up ────────────
create or replace function public.claim_pending_collaborations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Drop pending email-invites that would collide with an already-active row for
  -- this (resource, user) — else the unique(resource_id,user_id) constraint would
  -- raise and, since this runs in the signup transaction, BLOCK signup.
  delete from public.resource_collaborators c
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = lower(new.email)
     and exists (select 1 from public.resource_collaborators c2
                  where c2.resource_id = c.resource_id and c2.user_id = new.id);
  update public.resource_collaborators c
     set user_id = new.id, status = 'active', invited_email = null
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = lower(new.email);
  return new;
exception when others then
  return new;   -- never let collaboration-claiming break account creation
end $$;
drop trigger if exists trg_claim_pending_collaborations on auth.users;
create trigger trg_claim_pending_collaborations
  after insert on auth.users
  for each row execute function public.claim_pending_collaborations();
