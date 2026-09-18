-- =====================================================================================
--  045 — LE PROFIL « RÉPONDANT DE CAMPAGNE » : répondre, et rien d'autre
--
--  §0  Le périmètre de la migration
--  §1  Le profil, et POURQUOI il n'est pas un mécanisme neuf
--  §2  Ses domaines : FERMÉS PAR DÉFAUT, trois ouverts nommément
--  §3  Le garde-fou — un domaine qui apparaît ne s'accorde pas en silence
--  §4  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Action **24.4** du `docs/PLAN_PRODUIT.md` : *« accès contributeur restreint — répondre
--  à une campagne sans accéder au reste du produit »*. Et son critère d'acceptation dit
--  déjà comment : *« le modèle de droits à 3 axes suffit : c'est un PROFIL, pas un
--  mécanisme neuf »*.
--
--  ── ⚠️ CE QUI MANQUAIT VRAIMENT, ET QUI SE MESURE ──────────────────────────────────
--
--  Le lot L24 a livré la campagne le 18/09/2026, et l'a rangée dans le domaine
--  fonctionnel `conformite` — celui de qui répond. Restait une question à laquelle la
--  migration `044` ne répondait pas : **QUI, dans une filiale, peut répondre ?**
--
--  Mesuré sur les huit profils du socle : le contributeur (`CONTRIB`) porte quatre
--  domaines — `actifs`, `actions`, `incidents`, `mco` — et **aucun** ne se projette sur
--  `conformite` (`src/droits/passerelle-api.ts`). Un contributeur ne pouvait donc pas
--  répondre à la campagne qu'on lui adresse. Seuls le RSSI de filiale et la qualité le
--  pouvaient — c'est-à-dire qu'il fallait donner à un répondant les droits d'un RSSI.
--
--  Élargir `CONTRIB` était le geste facile, et il était faux : il aurait accordé la
--  conformité entière — exigences, mesures, correspondances, référentiels — à tous les
--  contributeurs de toutes les filiales, pour une campagne. **Un profil de plus coûte
--  une ligne de convention d'annuaire ; un sur-octroi coûte une revue de droits.**
--
--  ── ⚠️ CE QUE CETTE MIGRATION N'EST PAS ────────────────────────────────────────────
--
--  Elle n'ouvre **aucune** route, n'ajoute **aucune** table et ne change **aucun** droit
--  existant. Elle déclare un profil de plus, dont la convention d'annuaire engendre les
--  groupes `GRC-<CODE>-REPONDANT` — et `deploy/groupes-ad.sh` les DÉCOUVRE dans la table
--  `profils`, si bien qu'aucun fichier de déploiement ne change non plus.
--
--  ⚠️ **Conséquence d'exploitation, à dire** : les groupes d'annuaire correspondants
--  doivent être créés dans l'AD du client — un par filiale. `install.sh` aligne
--  `groupes_ad` tout seul et `groupes-ad.sh --csv` rend la liste à créer ; tant que les
--  groupes n'existent pas dans l'annuaire, **personne ne porte ce profil**, ce qui est
--  la bonne façon d'échouer.
-- =====================================================================================
-- Invocation :
--   psql -v ON_ERROR_STOP=1 -d cyber_grc -f 045_le_profil_repondant.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
do $$
begin
    perform set_config('grc.utilisateur', 'migration-045', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    -- ⚠️ `profils` et `profil_domaines` sont des tables de CONFIGURATION : leur écriture
    --    exige le drapeau d'administration Groupe depuis la porte S1 (constat M-2).
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LE PROFIL
-- =====================================================================================
-- `socle = true` : il est livré PAR LE PRODUIT, comme les huit autres. Le déclarer
-- « hors socle » aurait évité de faire rougir le garde-fou du banc qui épingle la liste —
-- c'est-à-dire aurait contourné la question au lieu de la poser. Le socle passe à NEUF, le
-- banc le dit, et un humain l'a décidé.
insert into profils (id, code, nom, description, niveau_defaut, socle)
values ('PROFIL-REPONDANT', 'REPONDANT', 'Répondant de campagne',
        'Répond aux campagnes d''évaluation que le Groupe adresse à sa filiale, et à rien '
        'd''autre. Voit les référentiels et les exigences pour les évaluer, voit ses '
        'échéances pour savoir ce qui est attendu — et tout le reste du produit lui est '
        'fermé, nommément (action 24.4). Il existe parce que le contributeur ne porte '
        'aucun domaine projeté sur « conformite » : répondre à une campagne aurait exigé '
        'les droits d''un RSSI de filiale.',
        'contribution', true)
on conflict (code) do nothing;

-- =====================================================================================
-- §2 — SES DOMAINES : FERMÉS PAR DÉFAUT, TROIS OUVERTS NOMMÉMENT
-- =====================================================================================
-- ⚠️ **La liste des domaines est DÉCOUVERTE, pas recopiée** — et ici la découverte est
-- le bon outil pour une raison précise (`CLAUDE.md` §3, cas a) : ce profil existe pour
-- FERMER. Si un domaine apparaissait demain et qu'une liste écrite à la main l'avait
-- oublié, l'absence de ligne vaudrait « pas déclaré » — et le §4 du `001_socle.sql` dit
-- pourquoi c'est mauvais : *« aucun » plutôt que l'absence, parce qu'un domaine fermé se
-- relit en revue de droits et qu'une absence ne se relit pas.*
--
-- On part donc de ce que le profil ADMIN déclare — il porte le vocabulaire entier par
-- construction — et l'on ferme tout, avant d'ouvrir trois domaines nommément.
insert into profil_domaines (profil_id, domaine, niveau)
select 'PROFIL-REPONDANT', d.domaine, 'aucun'
  from profil_domaines d
  join profils p on p.id = d.profil_id and p.code = 'ADMIN'
on conflict (profil_id, domaine) do nothing;

-- Les TROIS domaines ouverts, et le motif de chacun.
--
--  · `referentiels` et `exigences` en CONTRIBUTION : ce sont eux qui se projettent sur
--    le domaine fonctionnel `conformite` (`src/droits/passerelle-api.ts`), et c'est ce
--    domaine que la route des campagnes exige. Évaluer une exigence EST répondre.
--  · `echeances` en LECTURE : sans elle, un répondant ne verrait pas ce qu'on attend de
--    lui ni pour quand. Une demande qu'on ne peut pas consulter n'est pas une demande.
--
-- ⚠️ `mesures` et `correspondances` restent FERMÉS, bien qu'ils se projettent aussi sur
--    `conformite` : rattacher une mesure de sécurité à une exigence est un geste de RSSI,
--    pas de répondant. La projection prend le NIVEAU LE PLUS ÉLEVÉ des domaines qui
--    tombent sur `conformite` — deux suffisent donc, et les fermer ne retire rien.
update profil_domaines set niveau = 'contribution'
 where profil_id = 'PROFIL-REPONDANT' and domaine in ('referentiels', 'exigences');
update profil_domaines set niveau = 'lecture'
 where profil_id = 'PROFIL-REPONDANT' and domaine = 'echeances';

-- =====================================================================================
-- §3 — LE GARDE-FOU : UN DOMAINE QUI APPARAÎT NE S'ACCORDE PAS EN SILENCE
-- =====================================================================================
-- ⚠️ Il garde DEUX propriétés, et la seconde est celle qui compte :
--
--  1. le profil couvre **tout** le vocabulaire — un domaine neuf non déclaré chez lui
--     serait une absence, et une absence ne se relit pas en revue de droits ;
--  2. il n'ouvre **que** les trois domaines décidés. Un quatrième ouvert sans décision
--     serait un sur-octroi silencieux, et c'est exactement ce que le profil existe pour
--     éviter : *« répondre à une campagne SANS accéder au reste du produit »*.

create or replace function f_verifier_profil_repondant()
returns table (objet text, anomalie text, detail text)
    language plpgsql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_ouverts text;
    v_manquants text;
begin
    if not exists (select 1 from profils where code = 'REPONDANT') then
        objet    := 'profils';
        anomalie := 'profil_repondant_absent';
        detail   := 'Le profil « REPONDANT » a disparu : plus personne ne peut répondre à '
                    'une campagne sans porter les droits d''un RSSI de filiale (action '
                    '24.4). ⚠️ Les groupes d''annuaire GRC-<CODE>-REPONDANT deviendraient '
                    'alors des groupes sans profil, et la synchronisation refuserait.';
        return next;
        return;
    end if;

    -- (1) Tout le vocabulaire est couvert. La référence est le profil ADMIN, qui le porte
    --     entier par construction.
    select string_agg(d.domaine, ', ' order by d.domaine) into v_manquants
      from profil_domaines d
      join profils a on a.id = d.profil_id and a.code = 'ADMIN'
     where not exists (
        select 1 from profil_domaines r
          join profils p on p.id = r.profil_id and p.code = 'REPONDANT'
         where r.domaine = d.domaine);

    if v_manquants is not null then
        objet    := 'profil_domaines';
        anomalie := 'repondant_domaine_non_decide';
        detail   := format(
            'Le profil REPONDANT ne déclare rien sur : %s. Une ABSENCE n''est pas un '
            'refus — elle ne se relit pas en revue de droits (001_socle.sql §4). '
            'Décidez : « aucun » si le répondant n''y a rien à faire.', v_manquants);
        return next;
    end if;

    -- (2) Il n'ouvre que les trois domaines décidés.
    select string_agg(r.domaine || ' = ' || r.niveau, ', ' order by r.domaine) into v_ouverts
      from profil_domaines r
      join profils p on p.id = r.profil_id and p.code = 'REPONDANT'
     where r.niveau <> 'aucun'
       and not (r.domaine = 'referentiels' and r.niveau = 'contribution')
       and not (r.domaine = 'exigences'    and r.niveau = 'contribution')
       and not (r.domaine = 'echeances'    and r.niveau = 'lecture');

    if v_ouverts is not null then
        objet    := 'profil_domaines';
        anomalie := 'repondant_sur_octroi';
        detail   := format(
            'Le profil REPONDANT ouvre autre chose que les trois domaines décidés : %s. '
            'Il existe pour permettre de RÉPONDRE À UNE CAMPAGNE SANS accéder au reste du '
            'produit (action 24.4) ; chaque domaine de plus lui retire sa raison d''être, '
            'et le fait silencieusement.', v_ouverts);
        return next;
    end if;
end;
$$;

comment on function f_verifier_profil_repondant() is
    'Garde-fou du profil « répondant de campagne » (L24, action 24.4). Il tient DEUX '
    'propriétés : le profil couvre TOUT le vocabulaire des domaines — une absence ne se '
    'relit pas en revue de droits —, et il n''ouvre QUE les trois décidés (référentiels '
    'et exigences en contribution, échéances en lecture). Un quatrième domaine ouvert est '
    'un sur-octroi silencieux, et c''est précisément ce que ce profil existe pour éviter. '
    'Découvert par f_decouvrir_controles_schema().';

grant execute on function f_verifier_profil_repondant() to grc_app;

-- =====================================================================================
-- §4 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
-- =====================================================================================

select f_consigner_controles_schema();

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 045 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, profil répondant compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('045', 'le profil « répondant de campagne » : trois domaines ouverts, tout le '
               'reste FERMÉ nommément — parce que le contributeur ne portait aucun '
               'domaine projeté sur « conformite » et ne pouvait donc pas répondre (24.4)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_profil_repondant();
--   delete from controles_schema where fonction = 'f_verifier_profil_repondant';
--   delete from profil_domaines where profil_id = 'PROFIL-REPONDANT';
--   delete from profils where code = 'REPONDANT';
--   delete from migrations_schema where version = '045';
--   commit;
-- ⚠️ Annuler laisse les groupes d'annuaire GRC-<CODE>-REPONDANT sans profil : la
--    synchronisation de `groupes_ad` refusera jusqu'à ce qu'ils soient retirés aussi.
-- =====================================================================================
