-- ============================================================================
--  migrate-2026-09-quitter-partage.sql
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq).
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  POURQUOI. La liste « Partages avec moi » (coachings, matchs, spectacles)
--  n'offrait aucun moyen de se debarrasser d'un partage : seul le proprietaire
--  pouvait retirer un collaborateur (remove_collaborator lui est reserve). Un
--  coaching partage par erreur, ou devenu inutile, restait dans la liste.
--
--  CE QUE FAIT CE FICHIER. leave_shared_resource(p_id) : la personne connectee
--  quitte un partage. On retire SA ligne de collaborateur — et une eventuelle
--  invitation par e-mail encore en attente a son adresse, sinon
--  claim_my_pending_collaborations() la rattacherait de nouveau au prochain
--  demarrage du Studio. La ressource elle-meme n'est jamais touchee : elle
--  reste au proprietaire et aux autres collaborateurs.
--
--  Le proprietaire ne « quitte » pas sa propre ressource : il la supprime
--  (delete_shared_resource, inchangee).
-- ============================================================================

create or replace function public.leave_shared_resource(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if public.is_resource_owner(p_id) then raise exception 'owner cannot leave'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  delete from public.resource_collaborators c
   where c.resource_id = p_id
     and (c.user_id = auth.uid()
          or (c.user_id is null and v_email is not null and lower(c.invited_email) = v_email));
end $$;
revoke all on function public.leave_shared_resource(uuid) from public;
grant execute on function public.leave_shared_resource(uuid) to authenticated;

-- ============================================================================
--  Verification (depuis l'appli, connecte en tant que collaborateur) : le
--  partage disparait de « Partages avec moi » et reste chez le proprietaire.
-- ============================================================================
