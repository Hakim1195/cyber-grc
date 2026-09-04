-- =====================================================================================
--  013 — Le journal apprend à nommer le socle de risques
-- -------------------------------------------------------------------------------------
--  §1  Le domaine « type_entite » admet « risque_catalogue »
--  §2  Vérification, puis enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI CE FICHIER EXISTE PLUTÔT QU'UNE LIGNE DE PLUS DANS 012
--
--  Ces quelques lignes ont d'abord été écrites DANS `012`, après que celle-ci eut été
--  appliquée à la recette. `db/migrate.mjs` l'a refusé, et il a eu raison :
--
--      ERR Une migration déjà appliquée a été modifiée depuis :
--          Une migration appliquée ne se réécrit jamais (CONVENTIONS.md §13).
--          Écrivez une nouvelle migration qui corrige, ou restaurez le fichier d'origine.
--
--  Ce que le garde-fou protège n'est pas une règle de style. Une base ayant déjà joué
--  `012` ne rejouera jamais sa version corrigée : la recette serait restée SANS cette
--  ligne pendant que toute base neuve l'aurait eue — deux schémas différents portant le
--  même numéro, et l'écart ne se voyant qu'à la première création d'un risque de
--  catalogue **en production**. Le contrôle compare une empreinte ; il n'a rien à
--  interpréter, et c'est ce qui le rend fiable.
--
-- -------------------------------------------------------------------------------------
--  CE QUE CETTE MIGRATION CORRIGE, ET COMMENT LE DÉFAUT S'EST MANIFESTÉ
--
--  `journal_audit.entite_type` porte le domaine `type_entite`, dont le `check` énumère
--  les entités désignables par un rattachement polymorphe. Or **toute création écrit une
--  entrée au journal** : une table absente du domaine est donc, très exactement,
--  INCRÉABLE.
--
--  Mesuré en exposant `risque_catalogue` par la couche générique : la table était juste,
--  ses politiques étaient justes, et la création rendait
--  `400 « Une valeur de l'enregistrement n'est pas admise »` — un message qui ne désigne
--  rien, parce que `type_entite_check` n'est pas un `ck_<table>_<sujet>` et ne se traduit
--  donc pas en vocabulaire métier. Le défaut n'était pas dans la table : il était dans la
--  TRACE.
--
--  ⚠️ `referentiels_actifs` figure DÉJÀ dans le domaine depuis `001` : quelqu'un avait
--  prévu son exposition il y a des mois, et elle n'est jamais venue (constat Q-150). Une
--  demi-promesse ne fait rougir personne — une table inutilisée ne casse rien.
--
--  ⚠️ PostgreSQL n'ajoute pas une valeur à un domaine : il faut réécrire la contrainte
--  entière, donc RECOPIER la liste. C'est une seconde copie de ce que `001` porte, et
--  c'est le genre de duplication qui diverge en silence. Ce qui la rend tenable :
--  `test/base/vocabulaire.test.mjs` confronte le domaine au **registre applicatif**, les
--  deux découverts — les valeurs lues dans `pg_catalog`, les entités dans le code
--  compilé —, et rougit dès qu'une entité du produit n'y figure pas.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE DOMAINE ADMET LA TABLE DU SOCLE
-- =====================================================================================

alter domain type_entite drop constraint type_entite_check;
alter domain type_entite add constraint type_entite_check
    check (value in (
        'clients', 'personnes', 'exigences', 'actions', 'risques', 'actifs', 'processus',
        'crise', 'scenarios_pra', 'tests_pra', 'prestataires', 'mco_actions',
        'audits', 'revues', 'evaluations',
        'mesures', 'mesure_catalogue', 'mesure_mise_en_oeuvre',
        'incidents', 'documents', 'traitements', 'mappings', 'history',
        'filiales', 'utilisateurs', 'profils', 'groupes_ad', 'sessions',
        'referentiels_actifs', 'pieces_jointes', 'approbations', 'imports', 'parametres',
        -- La table du socle de risques, créée par `012`.
        'risque_catalogue'
    ));

-- =====================================================================================
-- §2 — VÉRIFICATION, PUIS ENREGISTREMENT
-- =====================================================================================

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 013 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie après l''extension du vocabulaire.';
end;
$$;

insert into migrations_schema (version, nom)
values ('013', 'Le domaine « type_entite » admet « risque_catalogue » — sans quoi la table '
               'du socle est incréable, toute création écrivant au journal')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   alter domain type_entite drop constraint type_entite_check;
--   alter domain type_entite add constraint type_entite_check
--       check (value in ( … la liste de 001, sans 'risque_catalogue' … ));
--   delete from migrations_schema where version = '013';
--   commit;
-- ⚠️ La rejouer rend « risque_catalogue » INCRÉABLE : la table subsiste, et toute
--    tentative d'y écrire rend 400 sans dire pourquoi.
-- =====================================================================================
