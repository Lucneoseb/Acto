-- ============================================================================
--  migrate-2026-09-live-private.sql
--
--  DEUX CHOSES, indépendantes l'une de l'autre :
--
--  A. Fermeture de l'ancienne API de partage (shared_match_*), remplacée par
--     share_resource_* / shared_resources. Plus aucun appel côté client (audit
--     2026-09-07 : 50 RPC appelés, aucune de ces quatre). On révoque plutôt que
--     de supprimer : réversible, et les données de shared_matches restent
--     intactes si un vieux partage doit être relu un jour dans l'éditeur SQL.
--
--  B. Canal Realtime PRIVÉ pour le direct (optionnel, à activer sciemment).
--     Aujourd'hui l'écran public s'abonne à un canal nommé par le code de
--     partage, qui est affiché à la salle : n'importe quel spectateur peut donc
--     publier un faux tableau. Le client se protège déjà par un verrou
--     d'émetteur (il ignore tout émetteur autre que le premier vu), ce qui
--     couvre le cas réel — l'arbitre démarre avant que le public ait le code.
--     La partie B ferme le trou complètement : lecture pour tous, écriture
--     réservée au propriétaire du direct.
--
--  Idempotent, comme le reste. À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
--  A. Ancienne API de partage : plus exécutable depuis le navigateur
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.shared_match_create(text, jsonb)') is not null then
    revoke execute on function public.shared_match_create(text, jsonb) from authenticated, anon;
  end if;
  if to_regprocedure('public.shared_match_get(uuid, text)') is not null then
    revoke execute on function public.shared_match_get(uuid, text) from authenticated, anon;
  end if;
  if to_regprocedure('public.shared_match_save(uuid, text, text, jsonb)') is not null then
    revoke execute on function public.shared_match_save(uuid, text, text, jsonb) from authenticated, anon;
  end if;
  if to_regprocedure('public.shared_match_join(uuid, text)') is not null then
    revoke execute on function public.shared_match_join(uuid, text) from authenticated, anon;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
--  B. Canal privé du direct  (À N'APPLIQUER QUE SI TU ACTIVES LE DRAPEAU CLIENT)
--
--  Le client ne bascule sur le canal privé que si js/config.js contient
--  `live: { privateChannel: true }`. Tant que le drapeau est à false, ces
--  politiques ne servent à rien mais ne gênent rien non plus.
--
--  Ordre conseillé :
--    1. exécuter ce fichier ;
--    2. passer le drapeau à true et pousser ;
--    3. tester un direct AVEC un second appareil (écran public) AVANT une
--       représentation. En cas de souci, remettre le drapeau à false : le
--       client retombe sur le canal public, sans rien d'autre à défaire.
--       (Le client sait aussi se rabattre tout seul si l'abonnement privé
--        échoue — voir rtSubscribe / rtEnsurePublisher dans js/suite/live.js.)
--
--  Note : `realtime.messages` et `realtime.topic()` existent sur les projets
--  Supabase à jour. Si la table n'existe pas, ce bloc ne fait rien et le
--  drapeau doit rester à false.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages absent : canal privé non configuré, laisser privateChannel = false';
    return;
  end if;

  -- Lecture : tout le monde, y compris les spectateurs non connectés. C'est le
  -- but du direct — on rejoint avec un code, sans compte.
  execute 'drop policy if exists "acto_live_read" on realtime.messages';
  execute $p$
    create policy "acto_live_read" on realtime.messages
      for select to anon, authenticated
      using (realtime.topic() like 'acto-live:%')
  $p$;

  -- Écriture : uniquement le compte qui a déclaré ce direct (register_live_run
  -- insère la ligne live_runs au nom de l'arbitre). Un spectateur, connecté ou
  -- non, ne peut plus rien publier sur le canal.
  execute 'drop policy if exists "acto_live_write_owner" on realtime.messages';
  execute $p$
    create policy "acto_live_write_owner" on realtime.messages
      for insert to authenticated
      with check (
        exists (
          select 1 from public.live_runs lr
           where 'acto-live:' || lr.code = realtime.topic()
             and lr.owner_id = auth.uid()
             and lr.last_seen > now() - interval '12 hours'
        )
      )
  $p$;
end $$;
