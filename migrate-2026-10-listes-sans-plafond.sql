-- ============================================================================
--  migrate-2026-10-listes-sans-plafond.sql
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq).
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  POURQUOI. Supabase ne renvoie jamais plus de 1000 lignes par reponse
--  (max_rows), quel que soit le limit demande. Le client lit desormais toutes
--  les listes PAR PAGES (actoUtils.readAllPages, js/utils.js) — voir aussi
--  migrate-2026-10-defis-sans-plafond.sql pour les defis.
--
--  Pour que deux pages ne se chevauchent jamais, chaque appel doit trier
--  exactement pareil : le tri de chaque fonction se termine donc par une cle
--  unique. Sans elle, deux lignes ex aequo (meme date de mise a jour, meme
--  nombre de vues) pouvaient changer de place d'un appel a l'autre, et l'une
--  sauter ou apparaitre deux fois.
--
--  Cinq fonctions sont concernees ; chacune est reprise MOT POUR MOT de sa
--  derniere version en ligne, seul le tri change :
--   · list_my_resources       (migrate-2026-07-c6-sync.sql)     : « Sur mon compte »
--   · list_shared_with_me     (migrate-collab.sql)              : « Partages avec moi »
--   · list_collaborators      (migrate-2026-09-collab-noms.sql) : collaborateurs
--   · get_member_activity     (migrate-2026-09-activite.sql)    : activite des membres
--   · admin_inspiration_stats (migrate-inspiration-engagement.sql) : stats admin
--
--  Meme signature qu'avant : « create or replace » suffit, et les anciennes
--  versions du client (une seule requete) marchent toujours.
-- ============================================================================

-- ── coachings / matchs « Sur mon compte » ──────────────────────────────────
create or replace function public.list_my_resources()
returns table(
  id            uuid,
  resource_type text,
  kind          text,
  title         text,
  match_date    text,
  nb_impros     int,
  updated_at    timestamptz
)
language sql security definer set search_path = public stable as $$
  select r.id,
         r.resource_type,
         coalesce(r.data->>'kind', r.resource_type),
         r.title,
         coalesce(r.data->>'matchDate', ''),
         coalesce(jsonb_array_length(case
           when jsonb_typeof(r.data->'setlist') = 'array' then r.data->'setlist'
           else '[]'::jsonb end), 0),
         r.updated_at
    from public.shared_resources r
   where r.owner_id = auth.uid()
   order by r.updated_at desc, r.id;
$$;
revoke all on function public.list_my_resources() from public;
grant execute on function public.list_my_resources() to authenticated;

-- ── « Partages avec moi » ───────────────────────────────────────────────────
create or replace function public.list_shared_with_me()
returns table(id uuid, resource_type text, kind text, title text, updated_at timestamptz, role text, owner_name text)
language sql security definer set search_path = public stable as $$
  select r.id, r.resource_type, coalesce(r.data->>'kind', r.resource_type), r.title, r.updated_at, c.role,
         coalesce(nullif(btrim(op.nom_scene), ''), nullif(btrim(op.prenom), ''), 'Acto')
  from public.resource_collaborators c
  join public.shared_resources r on r.id = c.resource_id
  left join public.profiles op on op.id = r.owner_id
  where c.user_id = auth.uid() and c.status = 'active'
  order by r.updated_at desc, r.id, c.id;
$$;
revoke all on function public.list_shared_with_me() from public;
grant execute on function public.list_shared_with_me() to authenticated;

-- ── collaborateurs d'une ressource ──────────────────────────────────────────
create or replace function public.list_collaborators(p_res uuid)
returns table(id uuid, user_id uuid, name text, role text, status text)
language plpgsql security definer set search_path = public as $$
declare v_proprio boolean;
begin
  if auth.uid() is null or not public.can_access_resource(p_res) then raise exception 'not allowed'; end if;
  v_proprio := public.is_resource_owner(p_res);
  return query
    select c.id, c.user_id,
           -- Ordre de préférence : nom de scène, prénom, libellé d'invitation,
           -- puis l'adresse — celle de l'invitation ou, à défaut, celle du
           -- compte lié. Les adresses ne sont montrées qu'au propriétaire :
           -- un simple collaborateur n'a pas à voir celles des autres.
           coalesce(
             nullif(btrim(p.nom_scene), ''),
             nullif(btrim(p.prenom), ''),
             nullif(btrim(c.invited_label), ''),
             case when v_proprio then nullif(btrim(c.invited_email), '') end,
             case when v_proprio then nullif(btrim(u.email), '') end,
             '—'
           ),
           c.role, c.status
    from public.resource_collaborators c
    left join public.profiles p on p.id = c.user_id
    left join auth.users     u on u.id = c.user_id
    where c.resource_id = p_res
    order by c.created_at asc, c.id;
end $$;
revoke all on function public.list_collaborators(uuid) from public;
grant execute on function public.list_collaborators(uuid) to authenticated;

-- ── activite des membres (onglet Compte) ────────────────────────────────────
-- Cle unique : les colonnes du group by (une ligne par groupe).
create or replace function public.get_member_activity()
returns table(user_id uuid, name text, trainings bigint, matches bigint, shows bigint, blocks bigint, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select
    a.user_id,
    coalesce(nullif(btrim(p.nom_scene), ''), nullif(btrim(p.prenom), ''), max(a.player_name), '—') as name,
    count(*) filter (where s.kind = 'entrainement') as trainings,
    count(*) filter (where s.kind = 'match')        as matches,
    count(*) filter (where s.kind = 'spectacle')    as shows,
    coalesce(sum(s.blocks), 0)                      as blocks,
    max(s.played_at)                                as last_seen
  from public.acto_session_attendance a
  join public.acto_sessions s on s.id = a.session_id
  left join public.profiles p on p.id = a.user_id
  where s.owner_id = auth.uid()
  group by a.user_id, p.nom_scene, p.prenom
  order by max(s.played_at) desc, a.user_id, p.nom_scene, p.prenom;
$$;
revoke all on function public.get_member_activity() from public;
grant execute on function public.get_member_activity() to authenticated;

-- ── statistiques des inspirations (admin) ───────────────────────────────────
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
    order by v.view_count desc, avg_grade desc nulls last, v.title asc, v.id;
end;
$$;
revoke all on function public.admin_inspiration_stats() from public;
grant  execute on function public.admin_inspiration_stats() to authenticated;
