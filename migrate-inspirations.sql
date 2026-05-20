-- migrate-inspirations.sql
-- Standalone migration that adds the inspiration_videos table + RPCs + RLS
-- + email trigger. Idempotent: safe to re-run.
--
-- Usage (Supabase SQL editor):
--   1. Paste this file → Run
--   2. Then paste seed-inspiration-videos.sql → Run (loads 34 starter entries)
--
-- This file is a subset of supabase-setup-all.sql Part 7. If you already
-- ran supabase-setup-all.sql in its entirety, you can skip this file.
--
-- Prerequisite: html_escape() helper from PART 6 must exist (it does in
-- supabase-setup-all.sql; included below in case of fresh install).

create or replace function public.html_escape(s text)
returns text
language sql
immutable
as $$
  select replace(
           replace(
             replace(
               replace(coalesce(s, ''), '&', '&amp;'),
               '<', '&lt;'),
             '>', '&gt;'),
           '"', '&quot;')
$$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PART 7 — INSPIRATION VIDEOS (community-submitted impro links)     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A curated catalogue of inspirational impro videos (matches, longue form,
-- tutorials, channels) that visitors can browse to discover the art form.
-- Anyone can read approved entries (anon allowed — this is the public
-- show-and-tell), authenticated users can submit new ones (pending), and
-- admins moderate via the same approve/reject flow as user_submissions.

create table if not exists public.inspiration_videos (
  id            uuid          primary key default gen_random_uuid(),
  title         text          not null,
  channel       text,                                                  -- "Chaîne / Troupe" column from the seed sheet
  content_type  text          not null,                                -- chaine|match_impro|spectacle|tutoriel|documentaire|cabaret|format_court
  nature        text,                                                  -- mixte|comparee|na (match d'impro only)
  category      text,                                                  -- libre|a_la_maniere_de|chantee|rimee|sans_paroles|costumee|doublee|silencieuse|sportive|sans_contact|a_2|a_3
  theme         text,
  duration_text text,                                                  -- "7 min" — free-form, matches the seed sheet
  notes         text,
  video_url     text,                                                  -- YouTube / Vimeo / etc. NULL if the entry is a channel ref
  locale        text          not null default 'fr',
  submitted_by  uuid          references auth.users(id) on delete set null,
  status        text          not null default 'pending'
                              check (status in ('pending','approved','rejected')),
  approved_by   uuid          references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz   not null default now()
);

-- Whitelist enums (NOT VALID for legacy-safety, then try-validate).
do $$
begin
  alter table public.inspiration_videos drop constraint if exists inspiration_videos_content_type_chk;
  alter table public.inspiration_videos drop constraint if exists inspiration_videos_nature_chk;
  alter table public.inspiration_videos drop constraint if exists inspiration_videos_category_chk;
  alter table public.inspiration_videos
    add constraint inspiration_videos_content_type_chk
      check (content_type in (
        'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
      )) not valid;
  alter table public.inspiration_videos
    add constraint inspiration_videos_nature_chk
      check (nature is null or nature in ('mixte','comparee','na')) not valid;
  alter table public.inspiration_videos
    add constraint inspiration_videos_category_chk
      check (category is null or category in (
        'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
        'doublee','silencieuse','sportive','sans_contact','a_2','a_3'
      )) not valid;
  begin alter table public.inspiration_videos validate constraint inspiration_videos_content_type_chk;
  exception when check_violation then raise notice 'inspiration_videos_content_type_chk kept NOT VALID'; end;
  begin alter table public.inspiration_videos validate constraint inspiration_videos_nature_chk;
  exception when check_violation then raise notice 'inspiration_videos_nature_chk kept NOT VALID'; end;
  begin alter table public.inspiration_videos validate constraint inspiration_videos_category_chk;
  exception when check_violation then raise notice 'inspiration_videos_category_chk kept NOT VALID'; end;
end$$;

create index if not exists inspiration_videos_status_idx       on public.inspiration_videos (status);
create index if not exists inspiration_videos_content_type_idx on public.inspiration_videos (content_type);
create index if not exists inspiration_videos_locale_idx       on public.inspiration_videos (locale);
create index if not exists inspiration_videos_created_idx      on public.inspiration_videos (created_at desc);

-- 7.2 RLS — public can read approved, owner can read their own pending,
--     admins read everything; writes via the RPCs only.
alter table public.inspiration_videos enable row level security;

drop policy if exists "anon_read_approved_inspirations"     on public.inspiration_videos;
drop policy if exists "owner_read_own_inspirations"         on public.inspiration_videos;
drop policy if exists "admins_read_all_inspirations"        on public.inspiration_videos;

-- ANYONE (incl. unauthenticated) can read approved entries — this is the
-- public catalogue. The page is consumable without an account.
create policy "anon_read_approved_inspirations"
  on public.inspiration_videos for select
  to anon, authenticated
  using (status = 'approved');

create policy "owner_read_own_inspirations"
  on public.inspiration_videos for select
  using (submitted_by = auth.uid());

create policy "admins_read_all_inspirations"
  on public.inspiration_videos for select
  using (public.is_admin());

-- 7.3 SUBMIT RPC — authenticated only. Inserts a pending row. The trigger
--     below pings the admin via Resend (if configured).
create or replace function public.submit_inspiration_video(
  p_title         text,
  p_channel       text,
  p_content_type  text,
  p_nature        text,
  p_category      text,
  p_theme         text,
  p_duration_text text,
  p_notes         text,
  p_video_url     text,
  p_locale        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  new_id  uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'title is empty';
  end if;
  if length(v_title) > 200 then
    raise exception 'title too long (max 200 chars)';
  end if;
  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'notes too long (max 2000 chars)';
  end if;
  if p_content_type not in (
    'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
  ) then
    raise exception 'invalid content_type: %', p_content_type;
  end if;
  if p_nature is not null and p_nature <> '' and p_nature not in ('mixte','comparee','na') then
    raise exception 'invalid nature: %', p_nature;
  end if;
  if p_category is not null and p_category <> '' and p_category not in (
    'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
    'doublee','silencieuse','sportive','sans_contact','a_2','a_3'
  ) then
    raise exception 'invalid category: %', p_category;
  end if;

  insert into public.inspiration_videos (
    title, channel, content_type, nature, category, theme,
    duration_text, notes, video_url, locale, submitted_by, status
  ) values (
    v_title,
    nullif(trim(coalesce(p_channel, '')), ''),
    p_content_type,
    nullif(p_nature, ''),
    nullif(p_category, ''),
    nullif(trim(coalesce(p_theme, '')), ''),
    nullif(trim(coalesce(p_duration_text, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''),
    coalesce(nullif(p_locale, ''), 'fr'),
    auth.uid(),
    'pending'
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.submit_inspiration_video(text, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.submit_inspiration_video(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 7.4 SET STATUS — admin only (approve / reject).
create or replace function public.set_inspiration_video_status(
  p_id     uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_status not in ('pending','approved','rejected') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.inspiration_videos
     set status      = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at = case when p_status = 'approved' then now()      else approved_at end
   where id = p_id;
end;
$$;

revoke all on function public.set_inspiration_video_status(uuid, text) from public;
grant  execute on function public.set_inspiration_video_status(uuid, text) to authenticated;

-- 7.5 EDIT — admin only. Lets the admin tidy up titles / channels /
--     metadata before approving, or fix typos on already-approved rows.
create or replace function public.update_inspiration_video(
  p_id            uuid,
  p_title         text,
  p_channel       text,
  p_content_type  text,
  p_nature        text,
  p_category      text,
  p_theme         text,
  p_duration_text text,
  p_notes         text,
  p_video_url     text,
  p_locale        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'title is empty';
  end if;
  if p_content_type not in (
    'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
  ) then
    raise exception 'invalid content_type: %', p_content_type;
  end if;
  if p_nature is not null and p_nature <> '' and p_nature not in ('mixte','comparee','na') then
    raise exception 'invalid nature: %', p_nature;
  end if;
  if p_category is not null and p_category <> '' and p_category not in (
    'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
    'doublee','silencieuse','sportive','sans_contact','a_2','a_3'
  ) then
    raise exception 'invalid category: %', p_category;
  end if;
  update public.inspiration_videos
     set title         = v_title,
         channel       = nullif(trim(coalesce(p_channel, '')), ''),
         content_type  = p_content_type,
         nature        = nullif(p_nature, ''),
         category      = nullif(p_category, ''),
         theme         = nullif(trim(coalesce(p_theme, '')), ''),
         duration_text = nullif(trim(coalesce(p_duration_text, '')), ''),
         notes         = nullif(trim(coalesce(p_notes, '')), ''),
         video_url     = nullif(trim(coalesce(p_video_url, '')), ''),
         locale        = coalesce(nullif(p_locale, ''), locale)
   where id = p_id;
end;
$$;

revoke all on function public.update_inspiration_video(uuid, text, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.update_inspiration_video(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 7.5b ADMIN ADD — admin-only direct insert with status='approved'.
create or replace function public.admin_add_inspiration_video(
  p_title         text,
  p_channel       text,
  p_content_type  text,
  p_nature        text,
  p_category      text,
  p_theme         text,
  p_duration_text text,
  p_notes         text,
  p_video_url     text,
  p_locale        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  new_id  uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'title is empty';
  end if;
  if length(v_title) > 200 then
    raise exception 'title too long (max 200 chars)';
  end if;
  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'notes too long (max 2000 chars)';
  end if;
  if p_content_type not in (
    'chaine','match_impro','spectacle','tutoriel','documentaire','cabaret','format_court'
  ) then
    raise exception 'invalid content_type: %', p_content_type;
  end if;
  if p_nature is not null and p_nature <> '' and p_nature not in ('mixte','comparee','na') then
    raise exception 'invalid nature: %', p_nature;
  end if;
  if p_category is not null and p_category <> '' and p_category not in (
    'libre','a_la_maniere_de','chantee','rimee','sans_paroles','costumee',
    'doublee','silencieuse','sportive','sans_contact','a_2','a_3'
  ) then
    raise exception 'invalid category: %', p_category;
  end if;
  insert into public.inspiration_videos (
    title, channel, content_type, nature, category, theme,
    duration_text, notes, video_url, locale,
    submitted_by, status, approved_by, approved_at
  ) values (
    v_title,
    nullif(trim(coalesce(p_channel, '')), ''),
    p_content_type,
    nullif(p_nature, ''),
    nullif(p_category, ''),
    nullif(trim(coalesce(p_theme, '')), ''),
    nullif(trim(coalesce(p_duration_text, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''),
    coalesce(nullif(p_locale, ''), 'fr'),
    auth.uid(), 'approved', auth.uid(), now()
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.admin_add_inspiration_video(text, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.admin_add_inspiration_video(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 7.6 DELETE — admin only.
create or replace function public.delete_inspiration_video(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  delete from public.inspiration_videos where id = p_id;
end;
$$;

revoke all on function public.delete_inspiration_video(uuid) from public;
grant  execute on function public.delete_inspiration_video(uuid) to authenticated;

-- 7.7 EMAIL TRIGGER — same Resend pattern as user_submissions. Silently
--     no-ops if app_secrets isn't configured (pg_net + Resend optional).
create or replace function public.notify_admin_on_new_inspiration()
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
  v_subject   text;
  v_user_email text;
  v_html      text;
  v_payload   jsonb;
begin
  if NEW.status is distinct from 'pending' then
    return NEW;
  end if;
  select value into v_api_key   from public.app_secrets where key = 'resend_api_key';
  select value into v_admin     from public.app_secrets where key = 'admin_email';
  select value into v_from      from public.app_secrets where key = 'from_email';
  select value into v_admin_url from public.app_secrets where key = 'admin_url';
  if v_api_key is null or v_admin is null or v_from is null then return NEW; end if;
  if v_admin_url is null then
    v_admin_url := 'https://acto-theimprostudio.com/admin.html#inspirations';
  else
    -- Swap the hash to land on the inspirations tab specifically.
    v_admin_url := regexp_replace(v_admin_url, '#[a-z]+$', '') || '#inspirations';
  end if;
  begin
    select email into v_user_email from public.profiles where id = NEW.submitted_by;
  exception when others then v_user_email := null; end;

  v_subject := '[Acto] Nouvelle inspiration soumise — ' || coalesce(NEW.title, '(sans titre)');
  v_html :=
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a0f2b;background:#f5f0ea;padding:24px;">' ||
      '<h2 style="color:#b91c4d;margin:0 0 12px;">Nouvelle inspiration vidéo proposée</h2>' ||
      '<blockquote style="background:#fff;border-left:4px solid #f5c451;padding:12px 16px;margin:16px 0;font-size:1.1rem;">' ||
        public.html_escape(NEW.title) ||
      '</blockquote>' ||
      '<table style="border-collapse:collapse;font-size:0.9rem;">' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Chaîne / Troupe</td><td>' || public.html_escape(coalesce(NEW.channel, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Type</td><td>'             || public.html_escape(coalesce(NEW.content_type, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Nature</td><td>'           || public.html_escape(coalesce(NEW.nature, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Catégorie</td><td>'        || public.html_escape(coalesce(NEW.category, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Thème</td><td>'            || public.html_escape(coalesce(NEW.theme, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Durée</td><td>'            || public.html_escape(coalesce(NEW.duration_text, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">URL</td><td>'              || public.html_escape(coalesce(NEW.video_url, '—')) || '</td></tr>' ||
        '<tr><td style="padding:4px 12px 4px 0;color:#666;">Soumis par</td><td>'       || public.html_escape(coalesce(v_user_email, NEW.submitted_by::text, '—')) || '</td></tr>' ||
      '</table>' ||
      '<p style="margin-top:24px;">' ||
        '<a href="' || public.html_escape(v_admin_url) || '" style="background:#f5c451;color:#1a0f2b;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">' ||
          '→ Examiner sur le tableau d''admin' ||
        '</a>' ||
      '</p>' ||
      '<p style="color:#999;font-size:0.8rem;margin-top:32px;">Acto · The Impro Studio</p>' ||
    '</div>';

  v_payload := jsonb_build_object(
    'from', v_from, 'to', jsonb_build_array(v_admin),
    'subject', v_subject, 'html', v_html
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
  raise warning 'notify_admin_on_new_inspiration failed: %', SQLERRM;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_admin_on_new_inspiration on public.inspiration_videos;
create trigger trg_notify_admin_on_new_inspiration
  after insert on public.inspiration_videos
  for each row
  execute function public.notify_admin_on_new_inspiration();

-- ─── End of migration. Now run seed-inspiration-videos.sql for the 34 starter entries.
