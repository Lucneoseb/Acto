-- ============================================================================
--  migrate-2026-09-collab-noms.sql
--
--  PROBLÈME : depuis le rattrapage des invitations (migrate-2026-09-invitations),
--  la liste des collaborateurs n'identifie plus personne — les lignes existent
--  mais s'affichent « — ».
--
--  Enchaînement exact :
--    • prénom / nom sont devenus FACULTATIFS à l'inscription, donc
--      handle_new_user insère prenom = '' et nom = '' ;
--    • nom_scene est facultatif aussi, souvent NULL ;
--    • une invitation par e-mail n'envoie pas de invited_label (le client passe
--      p_label: null) ;
--    • le rattrapage lie la ligne au compte et met invited_email = NULL.
--    → le coalesce de list_collaborators n'avait plus une seule source de nom
--      et retombait sur '—'.
--
--  CORRECTIONS
--   1. list_collaborators : dernier repli sur l'e-mail RÉEL du compte lié
--      (auth.users), visible du seul propriétaire — comme pour les invités en
--      attente. Un propriétaire doit toujours savoir qui a accès.
--   2. Le rattrapage ne vide plus invited_email : c'est la trace de l'adresse
--      par laquelle on a invité, et elle ne coûte rien à garder.
--   3. On répare les lignes déjà vidées, quand l'e-mail du compte le permet.
--
--  Idempotent. À exécuter après migrate-2026-09-invitations.sql.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
--  1. Un nom exploitable, toujours
-- ─────────────────────────────────────────────────────────────────────────────
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
    order by c.created_at asc;
end $$;
revoke all on function public.list_collaborators(uuid) from public;
grant execute on function public.list_collaborators(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  2. Le rattrapage garde l'adresse d'invitation (trace utile, pas un doublon :
--     la contrainte d'unicité porte sur (resource_id, user_id))
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_my_pending_collaborations()
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_n integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then return 0; end if;

  delete from public.resource_collaborators c
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = v_email
     and exists (select 1 from public.resource_collaborators c2
                  where c2.resource_id = c.resource_id and c2.user_id = auth.uid());

  update public.resource_collaborators c
     set user_id = auth.uid(), status = 'active'   -- invited_email conservé : c'est le seul nom lisible d'un profil vide
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = v_email;
  get diagnostics v_n = row_count;
  return v_n;
exception when others then
  return 0;
end $$;
revoke all on function public.claim_my_pending_collaborations() from public;
grant execute on function public.claim_my_pending_collaborations() to authenticated;

-- même correction pour le trigger d'inscription
create or replace function public.claim_pending_collaborations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.resource_collaborators c
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = lower(new.email)
     and exists (select 1 from public.resource_collaborators c2
                  where c2.resource_id = c.resource_id and c2.user_id = new.id);
  update public.resource_collaborators c
     set user_id = new.id, status = 'active'
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = lower(new.email);
  return new;
exception when others then
  return new;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
--  3. Réparer les lignes déjà vidées par le rattrapage précédent
-- ─────────────────────────────────────────────────────────────────────────────
update public.resource_collaborators c
   set invited_email = lower(u.email)
  from auth.users u
 where c.user_id = u.id
   and c.invited_email is null
   and u.email is not null;
