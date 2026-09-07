-- ============================================================================
--  migrate-2026-09-invitations.sql
--
--  PROBLÈME (constaté 2026-09-07) : inviter quelqu'un par e-mail ne lui donnait
--  jamais accès s'il avait DÉJÀ un compte Acto — c'est-à-dire le cas normal,
--  quand on partage avec sa troupe.
--
--  Pourquoi : add_collaborator insérait une ligne « pending » avec
--  invited_email et user_id NULL. La seule chose qui transformait ces lignes en
--  accès réel était le trigger claim_pending_collaborations, posé
--  « after insert on auth.users » — donc uniquement à l'INSCRIPTION. Un compte
--  existant ne repassait jamais par là, et list_shared_with_me ne renvoie que
--  les lignes `status = 'active'` avec un user_id. L'invitation restait en
--  attente indéfiniment, sans que personne ne soit prévenu.
--
--  CE QUE FAIT CE FICHIER
--   1. add_collaborator résout l'e-mail vers un compte existant : accès actif
--      immédiat, comme un ajout par nom de scène.
--   2. claim_my_pending_collaborations() : rattrape les invitations déjà en
--      attente pour l'utilisateur connecté (appelée par le Studio au
--      démarrage). C'est ce qui répare les invitations envoyées avant ce
--      correctif.
--   3. Un e-mail « Untel vous a partagé un coaching » part à chaque invitation
--      (Resend, comme les notifications admin). Sans configuration Resend, la
--      fonction ne fait rien — l'invitation marche quand même.
--
--  Idempotent. À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
--  1. add_collaborator : un e-mail déjà inscrit devient un accès actif
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.add_collaborator(p_res uuid, p_user_id uuid, p_email text, p_label text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_role text := coalesce(nullif(p_role, ''), 'editor');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_uid uuid;
begin
  if auth.uid() is null or not public.is_resource_owner(p_res) then raise exception 'not owner'; end if;
  if v_role not in ('editor', 'viewer') then v_role := 'editor'; end if;    -- can't grant 'owner' via this path

  -- Un e-mail qui correspond à un compte existant vaut un ajout par nom de
  -- scène : sans cette résolution, l'invitation restait « en attente » à vie.
  if p_user_id is null and v_email is not null then
    select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
    if v_uid is not null then p_user_id := v_uid; end if;
  end if;

  if p_user_id is not null then
    if p_user_id = auth.uid() then raise exception 'owner is not a collaborator'; end if;
    -- une invitation e-mail en attente pour la même ressource ferait doublon
    delete from public.resource_collaborators
     where resource_id = p_res and user_id is null and v_email is not null
       and lower(invited_email) = v_email;
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
revoke all on function public.add_collaborator(uuid, uuid, text, text, text) from public;
grant execute on function public.add_collaborator(uuid, uuid, text, text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  2. Rattrapage : réclamer ses invitations en attente à la connexion
--     (le trigger d'inscription ne couvrait que les nouveaux comptes)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_my_pending_collaborations()
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_n integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then return 0; end if;

  -- Même précaution que le trigger d'inscription : on écarte d'abord les
  -- invitations qui feraient doublon avec un accès déjà actif.
  delete from public.resource_collaborators c
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = v_email
     and exists (select 1 from public.resource_collaborators c2
                  where c2.resource_id = c.resource_id and c2.user_id = auth.uid());

  update public.resource_collaborators c
     set user_id = auth.uid(), status = 'active', invited_email = null
   where c.user_id is null and c.invited_email is not null
     and lower(c.invited_email) = v_email;
  get diagnostics v_n = row_count;
  return v_n;
exception when others then
  return 0;   -- jamais bloquer l'ouverture du Studio pour ça
end $$;
revoke all on function public.claim_my_pending_collaborations() from public;
grant execute on function public.claim_my_pending_collaborations() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  3. E-mail d'invitation (Resend, même mécanique que les alertes admin)
--     Sans app_secrets configuré → ne fait rien, sans bloquer l'invitation.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_collaborator_invited()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_api_key text; v_from text; v_site text;
  v_dest text; v_inviteur text; v_titre text; v_type text; v_type_lbl text;
  v_role_lbl text; v_lien text; v_sujet text; v_html text; v_payload jsonb;
begin
  select value into v_api_key from public.app_secrets where key = 'resend_api_key';
  select value into v_from    from public.app_secrets where key = 'from_email';
  if v_api_key is null or v_from is null then return NEW; end if;
  select value into v_site from public.app_secrets where key = 'site_url';
  if v_site is null then v_site := 'https://acto-theimprostudio.com'; end if;

  -- destinataire : l'e-mail d'invitation, ou celui du compte ajouté
  v_dest := lower(nullif(btrim(coalesce(NEW.invited_email, '')), ''));
  if v_dest is null and NEW.user_id is not null then
    select lower(u.email) into v_dest from auth.users u where u.id = NEW.user_id;
  end if;
  if v_dest is null then return NEW; end if;

  -- qui invite, et à quoi
  select coalesce(nullif(btrim(p.nom_scene), ''), nullif(btrim(p.prenom), ''), p.email, 'Quelqu''un')
    into v_inviteur from public.profiles p where p.id = NEW.invited_by;
  select r.title, r.resource_type into v_titre, v_type
    from public.shared_resources r where r.id = NEW.resource_id;

  v_type_lbl := case v_type
    when 'entrainement' then 'coaching'
    when 'spectacle'    then 'spectacle'
    else 'match'
  end;
  v_role_lbl := case when NEW.role = 'viewer'
    then 'Vous pouvez le consulter.'
    else 'Vous pouvez le modifier avec ' || coalesce(v_inviteur, 'cette personne') || ', en temps réel.'
  end;
  v_lien := v_site || '/collab/' || NEW.resource_id::text;
  v_sujet := coalesce(v_inviteur, 'Quelqu''un') || ' vous a partagé un ' || v_type_lbl || ' sur Acto';

  v_html :=
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0c0814;color:#f5f0ea;padding:28px">' ||
    '<h1 style="color:#f5c451;font-size:20px;margin:0 0 14px">Acto — The Impro Studio</h1>' ||
    '<p style="line-height:1.6;margin:0 0 10px"><strong>' || public.html_escape(coalesce(v_inviteur, 'Quelqu''un')) ||
      '</strong> vous a partagé un ' || v_type_lbl ||
      case when coalesce(btrim(v_titre), '') <> ''
        then ' : <strong>' || public.html_escape(v_titre) || '</strong>' else '' end || '.</p>' ||
    '<p style="line-height:1.6;margin:0 0 18px;color:rgba(245,240,234,.75)">' || v_role_lbl || '</p>' ||
    '<p style="margin:0 0 18px"><a href="' || v_lien || '" style="display:inline-block;background:#f5c451;color:#1a0f2b;' ||
      'text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Ouvrir le ' || v_type_lbl || '</a></p>' ||
    '<p style="font-size:12px;color:rgba(245,240,234,.5);line-height:1.5;margin:0">' ||
      'Si le bouton ne fonctionne pas : ' || v_lien || '<br />' ||
      'Connectez-vous avec cette adresse (' || public.html_escape(v_dest) || ') pour retrouver le partage.' ||
    '</p></div>';

  v_payload := jsonb_build_object(
    'from', v_from, 'to', jsonb_build_array(v_dest), 'subject', v_sujet, 'html', v_html
  );
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := v_payload,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_api_key, 'Content-Type', 'application/json')
  );
  return NEW;
exception when others then
  return NEW;   -- un e-mail raté ne doit jamais empêcher un partage
end $$;

drop trigger if exists trg_notify_collaborator_invited on public.resource_collaborators;
create trigger trg_notify_collaborator_invited
  after insert on public.resource_collaborators
  for each row execute function public.notify_collaborator_invited();


-- ─────────────────────────────────────────────────────────────────────────────
--  Rattrapage immédiat (facultatif) : lier les invitations en attente aux
--  comptes qui existent déjà. À exécuter une fois, ici, dans l'éditeur SQL —
--  auth.uid() étant nul dans cette console, on ne peut pas passer par la RPC.
-- ─────────────────────────────────────────────────────────────────────────────
update public.resource_collaborators c
   set user_id = u.id, status = 'active', invited_email = null
  from auth.users u
 where c.user_id is null
   and c.invited_email is not null
   and lower(c.invited_email) = lower(u.email)
   and not exists (select 1 from public.resource_collaborators c2
                    where c2.resource_id = c.resource_id and c2.user_id = u.id);
