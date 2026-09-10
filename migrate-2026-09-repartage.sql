-- ============================================================================
--  Acto — un collaborateur EDITEUR peut repartager la seance
--  A passer dans l'editeur SQL Supabase (projet gssotstyevehbzydzhlq).
--  Idempotent : re-executable sans dommage.
-- ============================================================================
--
--  POURQUOI. add_collaborator() exigeait d'etre PROPRIETAIRE. Quelqu'un a qui
--  on avait partage un coaching « en edition » pouvait donc tout modifier, mais
--  pas le transmettre a un tiers : il devait redemander a l'auteur. Or un coach
--  qui recoit la preparation d'un match doit pouvoir y associer son
--  co-animateur sans repasser par lui.
--
--  CE QUI CHANGE : add_collaborator accepte desormais le proprietaire OU un
--  collaborateur « editor » actif. L'editeur choisit le mode qu'il accorde,
--  edition ou consultation, comme le proprietaire.
--
--  CE QUI NE CHANGE PAS, VOLONTAIREMENT :
--    · set_collaborator_role  → proprietaire seul
--    · remove_collaborator    → proprietaire seul
--    · delete_shared_resource → proprietaire seul
--  Le partage se propage ; l'administration reste chez l'auteur. Un editeur ne
--  peut pas non plus accorder le role 'owner' (deja impossible par ce chemin),
--  ni s'ajouter lui-meme, ni ajouter le proprietaire.
-- ============================================================================

-- ── qui a le droit de partager cette ressource ? ────────────────────────────
create or replace function public.can_share_resource(p_res uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shared_resources r
                  where r.id = p_res and r.owner_id = auth.uid())
      or exists (select 1 from public.resource_collaborators c
                  where c.resource_id = p_res
                    and c.user_id = auth.uid()
                    and c.status = 'active'
                    and c.role = 'editor');
$$;
revoke all on function public.can_share_resource(uuid) from public;
grant  execute on function public.can_share_resource(uuid) to authenticated;

-- ── inviter : proprietaire ou editeur actif ─────────────────────────────────
create or replace function public.add_collaborator(p_res uuid, p_user_id uuid, p_email text, p_label text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_role text := coalesce(nullif(p_role, ''), 'editor'); v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if auth.uid() is null or not public.can_share_resource(p_res) then raise exception 'not allowed'; end if;
  if v_role not in ('editor', 'viewer') then v_role := 'editor'; end if;    -- can't grant 'owner' via this path
  if p_user_id is not null then
    if p_user_id = auth.uid() then raise exception 'cannot add yourself'; end if;
    -- Le proprietaire n'est pas un collaborateur : l'ajouter creerait une ligne
    -- fantome qui apparaitrait en double dans la liste.
    if exists (select 1 from public.shared_resources r where r.id = p_res and r.owner_id = p_user_id) then
      raise exception 'owner is not a collaborator';
    end if;
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

-- ============================================================================
--  Verification, en remplacant l'identifiant par une de tes ressources :
--    select public.can_share_resource('7bea032c-0cb2-4b03-a364-5cd29884a393');
--  true si tu en es proprietaire ou collaborateur en edition.
-- ============================================================================
