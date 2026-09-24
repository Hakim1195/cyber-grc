-- =====================================================================================
--  066 — L'INVENTAIRE REND LA VERSION, SANS QUOI LA CORRECTION S'ÉCRASE EN SILENCE
--
--  §1  La fonction, refaite
--  §2  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  `f_filiales_inventaire()` est née à la migration `065` pour que l'écran « Filiales »
--  voie le groupe entier. Elle rendait l'identité administrative d'une filiale — et pas
--  sa `version`.
--
--  🛑 **Or le 24/09/2026 au soir, cette identité devient CORRIGEABLE** (`PUT
--  /api/filiales/:id`), et une écriture sans verrouillage optimiste est une écriture qui
--  écrase. Deux administrateurs sur la même fiche, chacun corrigeant un champ : le second
--  enregistrement effacerait le premier, **et personne ne le saurait**. C'est le risque
--  P1 du `PLAN_SERVEUR`, celui pour lequel tout le produit porte une colonne `version`.
--
--  L'écran doit donc recevoir la version qu'il a lue, et la renvoyer. `update … where
--  version = $n` fait le reste, et rend `409` quand elle a bougé.
--
--  ── POURQUOI UN `DROP` ET NON UN `CREATE OR REPLACE` ─────────────────────────────
--
--  PostgreSQL refuse `create or replace` dès que le **type de retour** change : ajouter
--  une colonne au `returns table` en est un. La fonction est donc retirée puis refaite,
--  dans la même transaction — aucune fenêtre pendant laquelle elle n'existerait pour un
--  appelant, et le `grant` est reposé juste après (un `drop` emporte les privilèges, et
--  l'oublier rendrait l'écran muet avec un `permission denied`).
--
--  ⚠️ **Pourquoi ne pas l'avoir prévue dès la `065`** : parce qu'à ce moment-là
--  l'identité d'une filiale n'était modifiable par personne — `update filiales` n'existait
--  nulle part dans le serveur. Ajouter une version « au cas où » aurait été une colonne
--  servie sans emploi. Elle est ajoutée le jour où elle sert, et c'est écrit plutôt que tu.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LA FONCTION, REFAITE
-- =====================================================================================

drop function if exists f_filiales_inventaire();

create function f_filiales_inventaire()
returns table (
    id              id_metier,
    code            text,
    raison_sociale  text,
    pays            text,
    statut          text,
    date_entree     date,
    date_sortie     date,
    version         integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    -- L'ordre est celui de l'écran : les actives d'abord, puis le reste par code.
    -- Le trier ici plutôt qu'en TypeScript évite qu'un second tri diverge du premier.
    select f.id, f.code, f.raison_sociale, f.pays, f.statut,
           f.date_entree, f.date_sortie, f.version
      from filiales f
     order by case f.statut when 'active' then 0 else 1 end, f.code;
$$;

-- ⚠️ Le `drop` a emporté les privilèges : sans ces deux lignes, l'écran « Filiales »
-- répondrait « permission denied for function f_filiales_inventaire » — et PostgreSQL
-- accorde EXECUTE à PUBLIC par défaut sur une fonction neuve, ce qu'une fonction
-- « security definer » ne doit jamais laisser (constat Q-136).
revoke all on function f_filiales_inventaire() from public;
grant execute on function f_filiales_inventaire() to grc_app;

comment on function f_filiales_inventaire() is
    'L''identité administrative de TOUTES les filiales, tous statuts, hors de tout '
    'périmètre de session — ce que l''écran « Filiales » affiche, et ce qu''il corrige. '
    'La « version » est rendue depuis la migration 066 : sans elle, deux corrections '
    'concurrentes s''écraseraient en silence (risque P1). Aucune donnée métier n''est '
    'ouverte ; la barrière est la déclaration d''accès de la route.';

-- =====================================================================================
-- §2 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('066', 'l''inventaire des filiales rend leur « version » : l''identité devient '
               'corrigeable, et une écriture sans verrouillage optimiste est une écriture '
               'qui écrase la correction d''un autre sans que personne le sache')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   Revenir à la signature de la `065` — et RETIRER d'abord `PUT /api/filiales/:id`,
--   sans quoi la correction perdrait son verrou et écraserait en silence.
-- =====================================================================================
