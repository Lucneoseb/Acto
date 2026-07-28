-- ============================================================================
--  Acto — migration du 2026-07-27
--  1) Ménage des lignes de test
--  2) Durcissement du vote public (registre des matchs en direct)
--  3) C5 — « Défis reçus » : rattacher le destinataire à l'ouverture du lien
--
--  Idempotent : ré-exécutable sans risque.
--  À coller dans Supabase → SQL Editor → Run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) MÉNAGE — lignes écrites par mes tests (code de match bidon)
-- ----------------------------------------------------------------------------
delete from public.live_votes      where code = 'ZZZZZZ';
delete from public.live_star_votes where code = 'ZZZZZZ';


-- ----------------------------------------------------------------------------
-- 2) DURCISSEMENT DU VOTE PUBLIC
--
--    Problème : cast_live_vote / cast_star_vote sont exécutables par `anon`
--    (c'est voulu : le public vote sans compte) mais n'ont AUCUNE validation du
--    code. Le serveur ne savait même pas qu'un match existait — le code de
--    partage ne vivait que dans le localStorage de l'arbitre. N'importe qui
--    pouvait donc écrire des lignes pour des codes arbitraires.
--
--    Correctif : un registre léger des matchs en direct. L'arbitre (authentifié)
--    y déclare son code en entrant en direct ; les votes ne sont acceptés que
--    pour un code déclaré et encore actif.
-- ----------------------------------------------------------------------------
create table if not exists public.live_runs (
  code       text primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create index if not exists live_runs_last_seen_idx on public.live_runs(last_seen desc);

alter table public.live_runs enable row level security;

-- Personne n'accède à la table en direct : tout passe par les RPC ci-dessous.
drop policy if exists "live_runs_owner_read" on public.live_runs;
create policy "live_runs_owner_read"
  on public.live_runs for select
  using (owner_id = auth.uid());

-- L'arbitre déclare (ou rafraîchit) son match en direct. Appelé au montage du
-- présentateur puis à chaque diffusion, ce qui sert aussi de battement de cœur.
create or replace function public.register_live_run(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_code is null or length(btrim(p_code)) < 4 or length(p_code) > 40 then return; end if;

  insert into public.live_runs(code, owner_id)
    values (upper(btrim(p_code)), auth.uid())
  on conflict (code) do update
    set last_seen = now(),
        -- un code repris par quelqu'un d'autre change de propriétaire seulement
        -- si l'ancien run est abandonné depuis plus de 12 h
        owner_id  = case when public.live_runs.last_seen < now() - interval '12 hours'
                         then excluded.owner_id else public.live_runs.owner_id end;
end $$;

revoke all on function public.register_live_run(text) from public;
grant execute on function public.register_live_run(text) to authenticated;

-- Un code est votable s'il est déclaré et vu il y a moins de 12 h.
create or replace function public.live_run_is_open(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.live_runs
     where code = upper(btrim(coalesce(p_code, '')))
       and last_seen > now() - interval '12 hours'
  );
$$;

grant execute on function public.live_run_is_open(text) to anon, authenticated;

-- Vote impro : mêmes garde-fous qu'avant + le code doit correspondre à un match
-- réellement en cours.
create or replace function public.cast_live_vote(p_code text, p_round int, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_code is null or p_voter is null or p_choice not in (0, 1) then return; end if;
  if length(coalesce(p_voter, '')) > 80 or length(coalesce(p_code, '')) > 40 then return; end if;
  if not public.live_run_is_open(p_code) then return; end if;   -- ← durcissement
  insert into public.live_votes(code, round, voter, choice)
    values (upper(p_code), p_round, p_voter, p_choice::smallint)
  on conflict (code, round, voter) do update set choice = excluded.choice, created_at = now();
end $$;

-- Vote étoile : même durcissement.
create or replace function public.cast_star_vote(p_code text, p_voter text, p_player text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_code is null or p_voter is null or p_player is null then return; end if;
  if length(coalesce(p_voter, '')) > 80 or length(coalesce(p_code, '')) > 40
     or length(coalesce(p_player, '')) > 120 then return; end if;
  if not public.live_run_is_open(p_code) then return; end if;   -- ← durcissement
  insert into public.live_star_votes(code, voter, player)
    values (upper(p_code), p_voter, p_player)
  on conflict (code, voter) do update set player = excluded.player, created_at = now();
end $$;


-- ----------------------------------------------------------------------------
-- 3) C5 — « DÉFIS REÇUS » N'ÉTAIT JAMAIS ALIMENTÉ
--
--    create_challenge force volontairement recipient_user_id à NULL (on ne fait
--    pas confiance à un destinataire déclaré par l'émetteur : il pourrait pousser
--    des défis non sollicités chez un inconnu). Mais AUCUNE autre fonction ne le
--    renseignait ensuite → list_received_challenges() ne pouvait retourner que du
--    vide. L'onglet était structurellement mort.
--
--    Correctif : le destinataire se rattache LUI-MÊME en ouvrant le lien. C'est
--    sûr : il faut posséder le token, et c'est sa propre identité qu'il pose.
--    L'émetteur qui ouvre son propre lien ne se l'attribue pas.
-- ----------------------------------------------------------------------------
create or replace function public.mark_challenge_opened(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.challenges
     set status    = case when status = 'sent' then 'opened' else status end,
         opened_at = coalesce(opened_at, now()),
         -- auto-rattachement : seulement si personne ne l'a encore pris, que
         -- l'appelant est connecté, et qu'il n'est pas l'émetteur lui-même.
         recipient_user_id = case
           when recipient_user_id is null
            and auth.uid() is not null
            and auth.uid() <> sender_id
           then auth.uid()
           else recipient_user_id
         end
   where token = p_token;
end $$;

-- (les droits d'exécution existants restent valables : anon + authenticated,
--  le token reste la seule porte d'entrée)


-- ----------------------------------------------------------------------------
-- Vérifications rapides (facultatif, à exécuter séparément)
-- ----------------------------------------------------------------------------
-- select count(*) from public.live_votes where code = 'ZZZZZZ';        -- doit être 0
-- select public.live_run_is_open('ZZZZZZ');                            -- doit être false
-- select count(*) from public.live_runs;                               -- 0 tant qu'aucun match lancé
