-- ============================================================================
--  migrate-2026-09-activite.sql
--
--  DEUX MANQUES comblés ici :
--
--  A. La fenêtre « Statistiques » ne connaissait que les matchs — et encore,
--     seulement ceux où l'arbitre avait renseigné les joueurs. Rien sur les
--     spectacles, les coachings ni les défis. get_my_activity() rassemble ces
--     compteurs pour la personne connectée.
--
--  B. Un coach ne pouvait pas noter QUI était présent à une séance, et donc
--     personne ne savait combien de coachings ou d'exercices un membre avait
--     suivis. On enregistre la présence à la fin d'une séance jouée en direct
--     (acto_session_attendance), et get_member_activity() la restitue.
--
--  Les matchs continuent de passer par acto_match_results (résultats + étoiles) :
--  on ne double pas ce mécanisme, on l'élargit aux autres formats.
--
--  Idempotent. À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
--  1. Présence aux séances (coaching, spectacle, match)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.acto_sessions (
  id           uuid        primary key default gen_random_uuid(),
  session_uid  text        not null,                    -- id local de la séance (idempotence)
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null check (kind in ('match', 'spectacle', 'entrainement')),
  title        text,
  played_at    timestamptz not null default now(),
  blocks       integer     not null default 0,          -- nombre d'exercices / impros au programme
  seconds      integer     not null default 0,          -- durée cumulée prévue
  unique (session_uid, owner_id)
);
create index if not exists acto_sessions_owner_idx on public.acto_sessions (owner_id, played_at desc);

create table if not exists public.acto_session_attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.acto_sessions(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,   -- null = participant sans compte
  player_name text not null,
  unique (session_id, user_id)
);
create index if not exists acto_attendance_user_idx on public.acto_session_attendance (user_id);

alter table public.acto_sessions           enable row level security;
alter table public.acto_session_attendance enable row level security;

-- Tout passe par les RPC ci-dessous ; on n'ouvre que la lecture de ce qui vous
-- concerne (vos séances, ou celles où vous étiez présent).
drop policy if exists acto_sessions_read on public.acto_sessions;
create policy acto_sessions_read on public.acto_sessions
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from public.acto_session_attendance a
                where a.session_id = acto_sessions.id and a.user_id = auth.uid())
  );
drop policy if exists acto_attendance_read on public.acto_session_attendance;
create policy acto_attendance_read on public.acto_session_attendance
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.acto_sessions s
                where s.id = acto_session_attendance.session_id and s.owner_id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
--  2. Enregistrer une séance et sa feuille de présence
--     Ré-appelable : une séance rejouée écrase sa propre feuille.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_session_attendance(
  p_session_uid text,
  p_kind        text,
  p_title       text,
  p_blocks      integer,
  p_seconds     integer,
  p_participants jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; rec jsonb; v_uid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_session_uid is null or length(btrim(p_session_uid)) = 0 then raise exception 'session_uid required'; end if;
  if coalesce(p_kind, '') not in ('match', 'spectacle', 'entrainement') then raise exception 'bad kind'; end if;

  insert into public.acto_sessions (session_uid, owner_id, kind, title, blocks, seconds)
    values (btrim(p_session_uid), auth.uid(), p_kind, nullif(btrim(coalesce(p_title, '')), ''),
            greatest(0, coalesce(p_blocks, 0)), greatest(0, coalesce(p_seconds, 0)))
  on conflict (session_uid, owner_id) do update
    set kind = excluded.kind, title = excluded.title, blocks = excluded.blocks,
        seconds = excluded.seconds, played_at = now()
  returning id into v_id;

  delete from public.acto_session_attendance where session_id = v_id;
  for rec in select value from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb)) as t(value)
  loop
    v_uid := null;
    begin
      if nullif(btrim(coalesce(rec->>'user_id', '')), '') is not null then v_uid := (rec->>'user_id')::uuid; end if;
    exception when others then v_uid := null;   -- identifiant douteux : on garde le nom
    end;
    begin
      insert into public.acto_session_attendance (session_id, user_id, player_name)
        values (v_id, v_uid, coalesce(nullif(btrim(rec->>'name'), ''), '—'))
      on conflict (session_id, user_id) do nothing;
    exception when others then
      null;   -- un compte supprimé ne doit pas faire échouer toute la feuille
    end;
  end loop;
  return v_id;
end $$;
revoke all on function public.record_session_attendance(text, text, text, integer, integer, jsonb) from public;
grant execute on function public.record_session_attendance(text, text, text, integer, integer, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  3. Mon activité, tous formats confondus
--     « matches » compte les matchs joués (comme participant OU comme arbitre),
--     sans doublon ; les autres comptent les séances enregistrées.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_activity()
returns table(matches bigint, shows bigint, trainings bigint, challenges bigint, impros bigint, played_seconds bigint)
language sql stable security definer set search_path = public as $$
  with mes_seances as (
    select s.id, s.kind, s.blocks, s.seconds
      from public.acto_sessions s
     where s.owner_id = auth.uid()
     union
    select s.id, s.kind, s.blocks, s.seconds
      from public.acto_sessions s
      join public.acto_session_attendance a on a.session_id = s.id
     where a.user_id = auth.uid()
  )
  select
    -- matchs : ceux où j'ai un résultat, plus les séances de type match
    (select count(distinct r.match_uid) from public.acto_match_results r where r.player_user_id = auth.uid())
      + (select count(*) from mes_seances where kind = 'match')                    as matches,
    (select count(*) from mes_seances where kind = 'spectacle')                    as shows,
    (select count(*) from mes_seances where kind = 'entrainement')                 as trainings,
    (select count(*) from public.challenges c
      where c.sender_id = auth.uid() or c.recipient_user_id = auth.uid())          as challenges,
    (select coalesce(sum(blocks), 0) from mes_seances)
      + (select count(*) from public.impro_events e where e.user_id = auth.uid())  as impros,
    (select coalesce(sum(seconds), 0) from mes_seances)
      + (select coalesce(sum(e.duration_played_seconds), 0)
           from public.impro_events e where e.user_id = auth.uid())                as played_seconds;
$$;
revoke all on function public.get_my_activity() from public;
grant execute on function public.get_my_activity() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  4. Activité des membres que J'AI fait jouer (vue du coach)
--     Une ligne par personne ayant participé à au moins une de mes séances.
-- ─────────────────────────────────────────────────────────────────────────────
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
  order by max(s.played_at) desc;
$$;
revoke all on function public.get_member_activity() from public;
grant execute on function public.get_member_activity() to authenticated;
