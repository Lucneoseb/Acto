-- ============================================================================
-- migrate-inspiration-engagement.sql
-- View tracking + per-user A–F ratings for inspiration_videos, plus an admin
-- ranking. Idempotent: safe to re-run. Requires inspiration_videos +
-- public.is_admin() (in supabase-setup-all.sql / migrate-inspirations.sql).
-- ============================================================================

-- 1. Global view counter -----------------------------------------------------
alter table public.inspiration_videos
  add column if not exists view_count integer not null default 0;

-- 2. Per-user view tracking ("which impros I've seen", how many times) --------
create table if not exists public.inspiration_user_views (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  inspiration_id uuid        not null references public.inspiration_videos(id) on delete cascade,
  views          integer     not null default 0,
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, inspiration_id)
);
alter table public.inspiration_user_views enable row level security;
drop policy if exists insp_user_views_own on public.inspiration_user_views;
create policy insp_user_views_own on public.inspiration_user_views
  for select to authenticated using (user_id = auth.uid());
-- writes via RPC only

-- 3. record_inspiration_view — counts a view (anon counts globally; a logged-in
--    viewer also accrues a personal view). View counters are inherently
--    spoofable by anon; acceptable for a community catalogue.
create or replace function public.record_inspiration_view(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_id is null then return; end if;
  update public.inspiration_videos set view_count = view_count + 1
   where id = p_id and status = 'approved';
  if auth.uid() is not null then
    insert into public.inspiration_user_views (user_id, inspiration_id, views, last_viewed_at)
    values (auth.uid(), p_id, 1, now())
    on conflict (user_id, inspiration_id)
      do update set views = inspiration_user_views.views + 1, last_viewed_at = now();
  end if;
end;
$$;
revoke all on function public.record_inspiration_view(uuid) from public;
grant  execute on function public.record_inspiration_view(uuid) to anon, authenticated;

-- 4. Personal A–F ratings (A best … F worst) + a private comment --------------
create table if not exists public.inspiration_ratings (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  inspiration_id uuid        not null references public.inspiration_videos(id) on delete cascade,
  grade          text        not null check (grade in ('A','B','C','D','E','F')),
  comment        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, inspiration_id)
);
create index if not exists insp_ratings_video_idx on public.inspiration_ratings (inspiration_id);

alter table public.inspiration_ratings enable row level security;
drop policy if exists insp_ratings_own   on public.inspiration_ratings;
drop policy if exists insp_ratings_admin on public.inspiration_ratings;
create policy insp_ratings_own on public.inspiration_ratings
  for select to authenticated using (user_id = auth.uid());
create policy insp_ratings_admin on public.inspiration_ratings
  for select to authenticated using (public.is_admin());
-- writes via RPC

create or replace function public.set_inspiration_rating(p_id uuid, p_grade text, p_comment text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_grade is null or p_grade not in ('A','B','C','D','E','F') then raise exception 'invalid grade'; end if;
  if p_comment is not null and length(p_comment) > 2000 then raise exception 'comment too long (max 2000)'; end if;
  insert into public.inspiration_ratings (user_id, inspiration_id, grade, comment, updated_at)
  values (auth.uid(), p_id, p_grade, nullif(trim(coalesce(p_comment, '')), ''), now())
  on conflict (user_id, inspiration_id)
    do update set grade = excluded.grade, comment = excluded.comment, updated_at = now();
end;
$$;
revoke all on function public.set_inspiration_rating(uuid, text, text) from public;
grant  execute on function public.set_inspiration_rating(uuid, text, text) to authenticated;

-- Let a user clear their rating.
create or replace function public.delete_inspiration_rating(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.inspiration_ratings where user_id = auth.uid() and inspiration_id = p_id;
end;
$$;
revoke all on function public.delete_inspiration_rating(uuid) from public;
grant  execute on function public.delete_inspiration_rating(uuid) to authenticated;

-- 5. Admin ranking — views + how many rated + average grade (A=6 … F=1, so
--    a higher average = more loved). Visible only to admins.
create or replace function public.admin_inspiration_stats()
returns table(
  id uuid, title text, content_type text, view_count integer,
  rating_count bigint, avg_grade numeric
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select v.id, v.title, v.content_type, v.view_count,
           count(r.id) as rating_count,
           round(avg(case r.grade
                       when 'A' then 6 when 'B' then 5 when 'C' then 4
                       when 'D' then 3 when 'E' then 2 when 'F' then 1 end)::numeric, 2) as avg_grade
    from public.inspiration_videos v
    left join public.inspiration_ratings r on r.inspiration_id = v.id
    where v.status = 'approved'
    group by v.id, v.title, v.content_type, v.view_count
    order by v.view_count desc, avg_grade desc nulls last, v.title asc;
end;
$$;
revoke all on function public.admin_inspiration_stats() from public;
grant  execute on function public.admin_inspiration_stats() to authenticated;

-- 6. Defense-in-depth: never store a non-http(s) video_url. Escaping protects
--    HTML context but not URL schemes, so a javascript:/data: video_url could
--    otherwise become a clickable href. Nullify it at the source for ALL writers.
create or replace function public.insp_sanitize_video_url()
returns trigger
language plpgsql
as $$
begin
  if new.video_url is not null and new.video_url !~* '^\s*https?://' then
    new.video_url := null;
  end if;
  return new;
end;
$$;
drop trigger if exists insp_sanitize_video_url_trg on public.inspiration_videos;
create trigger insp_sanitize_video_url_trg
  before insert or update on public.inspiration_videos
  for each row execute function public.insp_sanitize_video_url();

-- Clean any already-stored unsafe URLs.
update public.inspiration_videos
   set video_url = null
 where video_url is not null and video_url !~* '^\s*https?://';
