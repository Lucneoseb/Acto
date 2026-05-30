-- migrate-warmups.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Community-submitted warmup exercises. Mirrors the inspiration_videos design:
--   • anyone (anon) reads approved rows  → the public warmups.html merges them
--     with the static data/warmups.json curated base.
--   • authenticated users submit new ones (pending) via submit_warmup_exercise.
--   • admins moderate (approve/hide/edit/delete) + can add directly (approved).
--
-- Idempotent: safe to re-run. Run AFTER supabase-setup-all.sql (needs is_admin()
-- and html_escape()).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.warmup_exercises (
  id            uuid          primary key default gen_random_uuid(),
  type          text          not null,                 -- Échauffement|Mise en train|Atelier|Situation de jeu
  subtype       text,                                    -- free-ish secondary tag (Voix, Corps, Énergie…)
  name          text          not null,
  description   text          not null,
  duration_seconds integer,                              -- optional countdown length
  participants  text,                                    -- free text ("2 joueurs", "Tous", "10 à 50"…)
  source        text,                                    -- attribution / origin
  locale        text          not null default 'fr',
  submitted_by  uuid          references auth.users(id) on delete set null,
  status        text          not null default 'pending'
                              check (status in ('pending','approved','rejected')),
  approved_by   uuid          references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz   not null default now()
);

-- Type whitelist (NOT VALID + try-validate pattern, legacy-safe).
do $$
begin
  alter table public.warmup_exercises drop constraint if exists warmup_exercises_type_chk;
  alter table public.warmup_exercises
    add constraint warmup_exercises_type_chk
      check (type in ('Échauffement','Mise en train','Atelier','Situation de jeu')) not valid;
  begin
    alter table public.warmup_exercises validate constraint warmup_exercises_type_chk;
  exception when check_violation then
    raise notice 'warmup_exercises_type_chk kept NOT VALID (legacy rows)';
  end;
end$$;

create index if not exists warmup_exercises_status_idx  on public.warmup_exercises (status);
create index if not exists warmup_exercises_type_idx    on public.warmup_exercises (type);
create index if not exists warmup_exercises_locale_idx  on public.warmup_exercises (locale);
create index if not exists warmup_exercises_created_idx on public.warmup_exercises (created_at desc);

-- RLS
alter table public.warmup_exercises enable row level security;

drop policy if exists "anon_read_approved_warmups"  on public.warmup_exercises;
drop policy if exists "owner_read_own_warmups"      on public.warmup_exercises;
drop policy if exists "admins_read_all_warmups"     on public.warmup_exercises;

create policy "anon_read_approved_warmups"
  on public.warmup_exercises for select
  to anon, authenticated
  using (status = 'approved');

create policy "owner_read_own_warmups"
  on public.warmup_exercises for select
  using (submitted_by = auth.uid());

create policy "admins_read_all_warmups"
  on public.warmup_exercises for select
  using (public.is_admin());

-- ─── SUBMIT (authenticated → pending) ───
create or replace function public.submit_warmup_exercise(
  p_type             text,
  p_subtype          text,
  p_name             text,
  p_description      text,
  p_duration_seconds integer,
  p_participants     text,
  p_source           text,
  p_locale           text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_desc text;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_name is null then raise exception 'name is empty'; end if;
  if v_desc is null then raise exception 'description is empty'; end if;
  if length(v_name) > 160 then raise exception 'name too long (max 160)'; end if;
  if length(v_desc) > 2000 then raise exception 'description too long (max 2000)'; end if;
  if p_type not in ('Échauffement','Mise en train','Atelier','Situation de jeu') then
    raise exception 'invalid type: %', p_type;
  end if;
  if p_duration_seconds is not null and (p_duration_seconds < 0 or p_duration_seconds > 7200) then
    raise exception 'invalid duration';
  end if;

  insert into public.warmup_exercises (
    type, subtype, name, description, duration_seconds,
    participants, source, locale, submitted_by, status
  ) values (
    p_type,
    nullif(trim(coalesce(p_subtype, '')), ''),
    v_name,
    v_desc,
    p_duration_seconds,
    nullif(trim(coalesce(p_participants, '')), ''),
    nullif(trim(coalesce(p_source, '')), ''),
    coalesce(nullif(p_locale, ''), 'fr'),
    auth.uid(),
    'pending'
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.submit_warmup_exercise(text, text, text, text, integer, text, text, text) from public;
grant  execute on function public.submit_warmup_exercise(text, text, text, text, integer, text, text, text) to authenticated;

-- ─── ADMIN ADD (admin → approved directly) ───
create or replace function public.admin_add_warmup_exercise(
  p_type             text,
  p_subtype          text,
  p_name             text,
  p_description      text,
  p_duration_seconds integer,
  p_participants     text,
  p_source           text,
  p_locale           text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_desc text;
  new_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_name is null then raise exception 'name is empty'; end if;
  if v_desc is null then raise exception 'description is empty'; end if;
  if p_type not in ('Échauffement','Mise en train','Atelier','Situation de jeu') then
    raise exception 'invalid type: %', p_type;
  end if;
  insert into public.warmup_exercises (
    type, subtype, name, description, duration_seconds,
    participants, source, locale, submitted_by, status, approved_by, approved_at
  ) values (
    p_type,
    nullif(trim(coalesce(p_subtype, '')), ''),
    v_name, v_desc, p_duration_seconds,
    nullif(trim(coalesce(p_participants, '')), ''),
    nullif(trim(coalesce(p_source, '')), ''),
    coalesce(nullif(p_locale, ''), 'fr'),
    auth.uid(), 'approved', auth.uid(), now()
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.admin_add_warmup_exercise(text, text, text, text, integer, text, text, text) from public;
grant  execute on function public.admin_add_warmup_exercise(text, text, text, text, integer, text, text, text) to authenticated;

-- ─── SET STATUS (admin) ───
create or replace function public.set_warmup_exercise_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('pending','approved','rejected') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.warmup_exercises
     set status      = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at = case when p_status = 'approved' then now()      else approved_at end
   where id = p_id;
end;
$$;

revoke all on function public.set_warmup_exercise_status(uuid, text) from public;
grant  execute on function public.set_warmup_exercise_status(uuid, text) to authenticated;

-- ─── UPDATE (admin) ───
create or replace function public.update_warmup_exercise(
  p_id               uuid,
  p_type             text,
  p_subtype          text,
  p_name             text,
  p_description      text,
  p_duration_seconds integer,
  p_participants     text,
  p_source           text,
  p_locale           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_desc text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_name is null then raise exception 'name is empty'; end if;
  if v_desc is null then raise exception 'description is empty'; end if;
  if p_type not in ('Échauffement','Mise en train','Atelier','Situation de jeu') then
    raise exception 'invalid type: %', p_type;
  end if;
  update public.warmup_exercises
     set type             = p_type,
         subtype          = nullif(trim(coalesce(p_subtype, '')), ''),
         name             = v_name,
         description      = v_desc,
         duration_seconds = p_duration_seconds,
         participants     = nullif(trim(coalesce(p_participants, '')), ''),
         source           = nullif(trim(coalesce(p_source, '')), ''),
         locale           = coalesce(nullif(p_locale, ''), locale)
   where id = p_id;
end;
$$;

revoke all on function public.update_warmup_exercise(uuid, text, text, text, text, integer, text, text, text) from public;
grant  execute on function public.update_warmup_exercise(uuid, text, text, text, text, integer, text, text, text) to authenticated;

-- ─── DELETE (admin) ───
create or replace function public.delete_warmup_exercise(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only'; end if;
  delete from public.warmup_exercises where id = p_id;
end;
$$;

revoke all on function public.delete_warmup_exercise(uuid) from public;
grant  execute on function public.delete_warmup_exercise(uuid) to authenticated;

-- ─── EMAIL TRIGGER (Resend, optional) ───
create or replace function public.notify_admin_on_new_warmup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_api_key   text;
  v_admin     text;
  v_from      text;
  v_admin_url text;
  v_user_email text;
  v_html      text;
  v_payload   jsonb;
begin
  if NEW.status is distinct from 'pending' then return NEW; end if;
  select value into v_api_key   from public.app_secrets where key = 'resend_api_key';
  select value into v_admin     from public.app_secrets where key = 'admin_email';
  select value into v_from      from public.app_secrets where key = 'from_email';
  select value into v_admin_url from public.app_secrets where key = 'admin_url';
  if v_api_key is null or v_admin is null or v_from is null then return NEW; end if;
  if v_admin_url is null then
    v_admin_url := 'https://acto-theimprostudio.com/admin.html#warmups';
  else
    v_admin_url := regexp_replace(v_admin_url, '#[a-z]+$', '') || '#warmups';
  end if;
  begin
    select email into v_user_email from public.profiles where id = NEW.submitted_by;
  exception when others then v_user_email := null; end;

  v_html :=
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a0f2b;background:#f5f0ea;padding:24px;">' ||
      '<h2 style="color:#b91c4d;margin:0 0 12px;">Nouvel exercice d''échauffement proposé</h2>' ||
      '<blockquote style="background:#fff;border-left:4px solid #ff7a59;padding:12px 16px;margin:16px 0;font-size:1.1rem;">' ||
        public.html_escape(NEW.name) ||
      '</blockquote>' ||
      '<table style="border-collapse:collapse;font-size:0.9rem;">' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Type</td><td>'         || public.html_escape(coalesce(NEW.type, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Sous-type</td><td>'    || public.html_escape(coalesce(NEW.subtype, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Description</td><td>'  || public.html_escape(coalesce(NEW.description, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Soumis par</td><td>'   || public.html_escape(coalesce(v_user_email, NEW.submitted_by::text, '—')) || '</td></tr>' ||
      '</table>' ||
      '<p style="margin-top:24px;">' ||
        '<a href="' || public.html_escape(v_admin_url) || '" style="background:#ff9a73;color:#1a0f2b;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">' ||
          '→ Examiner sur le tableau d''admin' ||
        '</a>' ||
      '</p>' ||
      '<p style="color:#999;font-size:0.8rem;margin-top:32px;">Acto · The Impro Studio</p>' ||
    '</div>';

  v_payload := jsonb_build_object(
    'from', v_from, 'to', jsonb_build_array(v_admin),
    'subject', '[Acto] Nouvel exercice d''échauffement — ' || coalesce(NEW.name, '(sans nom)'),
    'html', v_html
  );
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := v_payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type',  'application/json'
    )
  );
  return NEW;
exception when others then
  raise warning 'notify_admin_on_new_warmup failed: %', SQLERRM;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_admin_on_new_warmup on public.warmup_exercises;
create trigger trg_notify_admin_on_new_warmup
  after insert on public.warmup_exercises
  for each row
  execute function public.notify_admin_on_new_warmup();

-- ─── DONE ───
-- After running: the public warmups page will merge approved rows with the
-- static data/warmups.json. Admin moderation lives at /admin.html#warmups.
