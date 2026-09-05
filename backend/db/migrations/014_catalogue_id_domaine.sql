-- =====================================================================================
--  014 — `risques.catalogue_id` rejoint le domaine `id_metier`
-- -------------------------------------------------------------------------------------
--  §1  Le changement de type
--  §2  Vérification, puis enregistrement
--
-- -------------------------------------------------------------------------------------
--  LE DÉFAUT, ET IL EST DE LA CLASSE « PERTE DE DONNÉES »
--
--  Constat de la porte S6 : `GET /api/export` puis `POST /api/reprise` en mode
--  « remplacer » rendait **409, zéro ligne restaurée** — sur une base vierge portant
--  **un seul risque saisi à la main**. Le produit ne savait plus relire sa propre
--  sauvegarde.
--
--  ⚠️ Et le même défaut portait sur l'enveloppe de `POST /api/cycle/sortie-filiale`,
--  qui est IRRÉVERSIBLE : l'export d'une filiale est la seule chose qui subsiste
--  d'elle. Un aller-retour cassé transformait une sortie de filiale en destruction.
--
-- -------------------------------------------------------------------------------------
--  LA CAUSE — une convention que j'ai enfreinte sans le voir
--
--  Le modèle navigateur code le « non renseigné » par la CHAÎNE VIDE ; le schéma le
--  code par NULL. Le point de rencontre est `DescriptionColonne.videInterdit`, qui
--  fait convertir `''` en NULL à l'écriture — et qui est **découvert dans
--  `pg_constraint`**, jamais recopié.
--
--  Cette découverte lit les `check` de la table ET ceux du DOMAINE de la colonne :
--  c'est le correctif du constat N-2, écrit après qu'une reprise eut échoué sur une
--  action sans exigence. Le domaine `id_metier` interdit la chaîne vide ; **toute**
--  colonne d'identifiant du schéma le porte.
--
--  Toute, sauf une : la migration `012` a écrit
--
--      alter table risques add column catalogue_id text;
--
--  en `text` nu. La colonne échappait donc à la découverte, `''` atteignait
--  l'insertion, et `fk_risques_catalogue` refusait la ligne.
--
--  ⚠️ **Le correctif N'EST PAS de patcher la découverte.** Elle a raison, elle est
--  générale, et elle marche pour les huit autres colonnes d'identifiant. C'est la
--  colonne qui était hors convention. La remettre dedans referme le défaut **et**
--  empêche qu'il se reproduise : une colonne d'identifiant écrite en `text` nu est
--  désormais la seule anomalie possible, et le garde-fou du §2 la nommera.
--
--  ── Ce que cela dit du chantier ────────────────────────────────────────────────
--
--  Le défaut vivait **entre trois fichiers dont aucun n'avait tort seul** : la
--  migration `012` (une colonne `text`), la couche d'écriture (qui suit une règle
--  juste) et la couche de reprise (qui avertit sans normaliser). Quatrième
--  occurrence de ce motif sur ce chantier, et la plus coûteuse : elle touchait la
--  sauvegarde.
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LE CHANGEMENT DE TYPE
-- -------------------------------------------------------------------------------------
-- Le domaine `id_metier` porte un `check` qui refuse la chaîne vide. Les valeurs
-- existantes sont soit NULL, soit des identifiants engendrés : la conversion ne peut
-- échouer que sur une chaîne vide déjà stockée — précisément ce que l'on ferme.
-- Si une telle valeur existe, la migration doit s'arrêter et le dire, plutôt que de
-- la convertir en NULL en silence : ce serait modifier une donnée sans le dire.
-- =====================================================================================

do $$
declare v_vides bigint;
begin
    perform set_config('grc.utilisateur', 'migration-014', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);

    select count(*) into v_vides from risques where catalogue_id = '';
    if v_vides > 0 then
        raise exception
            '% ligne(s) de « risques » portent un catalogue_id vide. Les convertir en NULL '
            'serait modifier une donnée sans le dire : traiter ces lignes avant de rejouer 014.',
            v_vides;
    end if;
end;
$$;

alter table risques alter column catalogue_id type id_metier;

comment on column risques.catalogue_id is
    'Entrée du socle que ce risque instancie, ou NULL pour un risque saisi librement. '
    'Porte le domaine « id_metier » comme TOUTE colonne d''identifiant du schéma : c''est '
    'ce domaine qui interdit la chaîne vide, et c''est par lui que la couche d''écriture '
    'découvre qu''il faut convertir le « non renseigné » du navigateur en NULL. Écrite en '
    '« text » nu par la migration 012, elle échappait à cette découverte — et le produit '
    'ne savait plus relire sa propre sauvegarde (porte S6).';

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
        raise exception 'Le schéma est en défaut après 014 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie après le retour dans la convention.';
end;
$$;

insert into migrations_schema (version, nom)
values ('014', 'risques.catalogue_id rejoint le domaine id_metier — sans quoi la chaîne vide '
               'du navigateur atteint la clé étrangère et le produit ne sait plus relire sa '
               'propre sauvegarde (porte S6)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   alter table risques alter column catalogue_id type text;
--   delete from migrations_schema where version = '014';
--   commit;
-- ⚠️ La rejouer REMET le défaut : l'export du produit redevient irrelisable, et la
--    sortie d'une filiale — irréversible — perd son unique trace.
-- =====================================================================================
