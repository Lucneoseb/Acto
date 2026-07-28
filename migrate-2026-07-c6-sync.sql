-- ============================================================================
--  Acto — migration C6 : « mes matchs suivent mon compte »
--
--  Problème : les matchs/spectacles/entraînements préparés ne vivent que dans le
--  localStorage. Changer de téléphone, vider son cache ou se déconnecter = tout
--  perdu, alors que l'utilisateur EST connecté.
--
--  La table shared_resources (collaboration F2) stocke déjà une session complète
--  (data jsonb) par propriétaire : on la réutilise comme miroir de compte plutôt
--  que de créer une seconde table.
--
--  Deux manques à combler :
--    a) aucune RPC ne liste MES ressources — list_shared_with_me() joint
--       resource_collaborators, et le propriétaire n'y est PAS inséré à la
--       création. Ses propres matchs n'apparaissent donc nulle part.
--    b) resource_type n'accepte que 'match' et 'entrainement' : le Spectacle
--       ne peut pas être enregistré.
--
--  Additif et idempotent : aucune donnée existante n'est modifiée ni supprimée.
--  À coller dans Supabase → SQL Editor → Run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- a) Autoriser le Spectacle
-- ----------------------------------------------------------------------------
alter table public.shared_resources
  drop constraint if exists shared_resources_resource_type_check;

alter table public.shared_resources
  add constraint shared_resources_resource_type_check
  check (resource_type in ('match', 'entrainement', 'spectacle'));

-- share_resource_create rejetait 'spectacle' avant même d'atteindre la table.
create or replace function public.share_resource_create(p_type text, p_title text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_type not in ('match', 'entrainement', 'spectacle') then raise exception 'bad type'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad data'; end if;
  insert into public.shared_resources(owner_id, resource_type, title, data, updated_by)
    values (auth.uid(), p_type, coalesce(p_title, ''), p_data, auth.uid())
    returning id into v_id;
  return v_id;
end $$;


-- ----------------------------------------------------------------------------
-- b) Lister MES ressources (celles dont je suis propriétaire)
--
--    Volontairement léger : ni `data` ni `setlist` — juste de quoi peupler la
--    liste « Mes matchs ». Le contenu complet est chargé à l'ouverture via
--    get_shared_resource(id), qui contrôle déjà les droits.
-- ----------------------------------------------------------------------------
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
   order by r.updated_at desc;
$$;

revoke all on function public.list_my_resources() from public;
grant execute on function public.list_my_resources() to authenticated;


-- ----------------------------------------------------------------------------
-- Vérifications (facultatif)
-- ----------------------------------------------------------------------------
-- select * from public.list_my_resources();       -- vide tant que rien n'est synchronisé
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.shared_resources'::regclass and contype = 'c';
