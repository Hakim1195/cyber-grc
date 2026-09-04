-- =====================================================================================
--  011 — LES FONCTIONS « SECURITY DEFINER » CESSENT D'ÊTRE EXÉCUTABLES PAR PUBLIC
-- -------------------------------------------------------------------------------------
--  Constat **Q-136**, porte S5. Classe « fuite de données ».
--
--  §1  Le défaut, et pourquoi il s'est produit
--  §2  Les deux fonctions reprennent leurs droits
--  §3  Le garde-fou qui empêche la CLASSE d'erreur
--  §4  Consignation, puis vérification
--  §5  Enregistrement
--
-- -------------------------------------------------------------------------------------
--  §1 — LE DÉFAUT, ET POURQUOI IL S'EST PRODUIT
--
--  La migration `010` a fermé une fuite (Q-132) et en a ouvert une plus petite par la
--  fonction même qui la fermait. Elle écrit :
--
--      execute 'grant execute on function f_filiales_actives() to grc_app';
--
--  ...sans le `revoke execute ... from public` que `008` fait TROIS LIGNES AVANT son
--  propre grant. En PostgreSQL, `EXECUTE` est accordé à PUBLIC **par défaut** : un grant
--  qui n'est pas précédé d'un revoke n'ajoute rien, il ne fait que le confirmer.
--
--  Mesuré par l'auditeur : `grc_lecture`, à qui la table `filiales` rend désormais ZÉRO
--  ligne, obtient par `f_filiales_actives()` la liste complète des filiales actives du
--  groupe. Le resserrement était donc contournable par la porte de service qu'il avait
--  lui-même posée.
--
--  ⚠️ L'audit en a trouvé UNE ; il y en avait DEUX. `f_perimetre_groupe()`, rendue
--  « security definer » par la même migration `010`, n'a jamais reçu de grant du tout —
--  elle est donc restée au défaut, c'est-à-dire PUBLIC. Elle ne rend qu'un booléen, mais
--  la propriété qu'on veut n'est pas « celle-ci fuit peu » : c'est qu'AUCUNE fonction
--  « security definer » ne soit joignable par qui n'en a pas besoin.
--
--  C'est pourquoi ce fichier ne corrige pas deux fonctions : il pose le garde-fou du §3,
--  qui **découvre** les fonctions « security definer » et refuse celles que PUBLIC peut
--  appeler. La parade n'est jamais la vigilance (CONVENTIONS.md §19.5).
-- =====================================================================================

begin;

-- =====================================================================================
-- §2 — LES DEUX FONCTIONS REPRENNENT LEURS DROITS
-- -------------------------------------------------------------------------------------
-- `revoke` D'ABORD, `grant` ensuite — l'ordre inverse ne retire rien, puisque le revoke
-- emporterait le grant qu'on vient de poser.
-- =====================================================================================

revoke execute on function f_filiales_actives() from public;
revoke execute on function f_perimetre_groupe() from public;

do $$
begin
    -- `grc_app` : le serveur applicatif. Il appelle f_filiales_actives() pour résoudre
    -- un périmètre, et f_perimetre_groupe() lui est nécessaire parce que les POLITIQUES
    -- l'invoquent — un prédicat RLS s'exécute sous le rôle qui interroge.
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant execute on function f_filiales_actives() to grc_app';
        execute 'grant execute on function f_perimetre_groupe() to grc_app';
    end if;

    -- `grc_lecture` : supervision, lecture seule. Il a besoin de f_perimetre_groupe()
    -- pour la même raison — les politiques de `filiales` et de `journal_audit` l'appellent
    -- sur SES requêtes aussi, et sans le droit d'exécution il obtiendrait une erreur de
    -- privilège au lieu d'un refus de périmètre : un message qui nomme un rouage interne
    -- (contrôle S12) au lieu de dire « ce n'est pas votre périmètre ».
    --
    -- ⚠️ Il N'OBTIENT PAS f_filiales_actives() : c'est exactement la fuite du constat
    -- Q-136. Un compte de supervision n'a aucune raison de lire la liste des filiales du
    -- groupe par une porte que le resserrement a ouverte pour l'authentification.
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant execute on function f_perimetre_groupe() to grc_lecture';
    end if;
end;
$$;

-- =====================================================================================
-- §3 — LE GARDE-FOU : AUCUNE « SECURITY DEFINER » N'EST JOIGNABLE PAR PUBLIC
-- -------------------------------------------------------------------------------------
-- Il se BRANCHE tout seul (§18.4, §19.4) et il DÉCOUVRE : il parcourt le catalogue plutôt
-- que de réciter les fonctions qu'on connaît. Une « security definer » écrite demain sans
-- son revoke fait rougir l'installation le jour où elle est écrite.
--
-- ⚠️ PORTÉE EXACTE (§17.5) : il constate un PRIVILÈGE, pas une innocuité. Une fonction
-- « security definer » correctement fermée peut toujours rendre trop de choses à qui a le
-- droit de l'appeler ; cela, seuls les essais le disent.
-- =====================================================================================

create or replace function f_verifier_privileges_definer()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
    v_vues integer := 0;
begin
    for r in
        select p.oid, p.proname::text as nom, p.proacl
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prosecdef
    loop
        v_vues := v_vues + 1;

        -- `proacl` nul = droits PAR DÉFAUT, c'est-à-dire EXECUTE à PUBLIC. C'est le cas
        -- le plus traître : rien n'a été écrit, donc rien ne saute aux yeux à la relecture.
        if r.proacl is null then
            objet := r.nom || '()'; anomalie := 'definer_public_par_defaut';
            detail := 'Aucun privilège explicite : PostgreSQL accorde EXECUTE à PUBLIC par '
                      'défaut. Une fonction « security definer » s''exécute sous le '
                      'propriétaire — la laisser joignable par tous annule le cloisonnement '
                      'qu''elle sert à contourner légitimement (constat Q-136).';
            return next;
        elsif exists (select 1 from unnest(r.proacl) a where a::text like '=%') then
            objet := r.nom || '()'; anomalie := 'definer_execute_par_public';
            detail := 'PUBLIC conserve EXECUTE. Il manque un « revoke execute … from '
                      'public » AVANT le grant : un grant seul ne retire rien, il confirme '
                      'le défaut (constat Q-136).';
            return next;
        end if;
    end loop;

    -- Contrôle de matière : sans fonction à examiner, ce garde-fou rendrait vert en
    -- n'éprouvant rien. Le schéma en porte au moins trois depuis 008 et 010.
    if v_vues < 3 then
        objet := 'f_verifier_privileges_definer'; anomalie := 'balayage_sans_matiere';
        detail := format('Seulement %s fonction(s) « security definer » vue(s) : le '
                         'balayage ne mord plus, et son vert ne dit plus rien.', v_vues);
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_privileges_definer() is
    'Aucune fonction « security definer » du schéma ne doit être exécutable par PUBLIC. '
    'Elle s''exécute sous le PROPRIÉTAIRE : la laisser joignable par tous rend au premier '
    'venu le contournement de cloisonnement qu''elle accorde légitimement à un appelant '
    'précis. Deux formes, et la première est la plus traître : « proacl » nul, c''est-à-dire '
    'les droits par DÉFAUT — rien n''a été écrit, donc rien ne saute aux yeux. '
    'Né du constat Q-136 : la migration 010 a fermé une fuite et en a rouvert une plus '
    'petite par la fonction même qui la fermait, faute d''un « revoke … from public » que '
    'la migration voisine faisait trois lignes avant son grant. '
    'PORTÉE EXACTE (§17.5) : il constate un privilège, jamais une innocuité.';

-- =====================================================================================
-- §4 — CONSIGNATION, PUIS VÉRIFICATION
-- =====================================================================================

do $$
declare
    v_nombre integer;
begin
    select count(*) into v_nombre from f_consigner_controles_schema();
    raise notice 'Registre des garde-fous : % mouvement(s). Total consigné : %.',
                 v_nombre, (select count(*) from controles_schema);

    if not exists (select 1 from controles_schema
                    where fonction = 'f_verifier_privileges_definer') then
        raise exception 'f_verifier_privileges_definer() n''a pas été consignée (§20.1).'
            using hint = 'Propriétaire de la base, ni « security definer » ni volatile, '
                         'chemin de recherche figé finissant par pg_temp.';
    end if;
end;
$$;

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('%s / %s', objet, anomalie), ', '), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 011 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie après le resserrement des privilèges.';
end;
$$;

-- =====================================================================================
-- §5 — ENREGISTREMENT
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('011', 'Les fonctions « security definer » cessent d''être exécutables par PUBLIC '
               '(constat Q-136) ; garde-fou f_verifier_privileges_definer')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   grant execute on function f_filiales_actives() to public;
--   grant execute on function f_perimetre_groupe() to public;
--   select f_retirer_controle_schema('f_verifier_privileges_definer', 'annulation de 011');
--   drop function if exists f_verifier_privileges_definer();
--   delete from migrations_schema where version = '011';
--   commit;
-- ⚠️ La rejouer REMET la fuite du constat Q-136.
-- =====================================================================================
