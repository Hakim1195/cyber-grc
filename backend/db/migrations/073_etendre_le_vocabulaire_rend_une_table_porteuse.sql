-- =====================================================================================
--  073 — ÉTENDRE `type_entite` REND UNE TABLE PORTEUSE : L'INSTALLATEUR DOIT REPASSER
--
--  §1  Les déclencheurs « les pièces suivent leur porteur », reposés
--  §2  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  La `072` a ajouté trois valeurs au domaine `type_entite`. Le déploiement a **refusé
--  aussitôt**, et il avait raison :
--
--      traitements_pour_client → porteur_sans_declencheur
--
--  🛑 **LE MÉCANISME, ET C'EST UNE CLASSE, PAS UN CAS.** `pieces_jointes` rattache ses
--  fichiers par un lien **polymorphe** dont le type porte le domaine `type_entite`. Une
--  table absente de ce domaine ne peut donc porter aucune pièce ; **dès qu'on l'y ajoute,
--  elle devient porteuse** — et `f_poser_declencheurs_pieces()`, l'installateur qui
--  découvre les porteuses dans le catalogue (migration `017` §3), doit repasser.
--
--  Or la `070` l'avait appelé **avant** que la `072` élargisse le vocabulaire. Il n'avait
--  donc rien vu, et il avait rendu un compte **plausible**.
--
--  ⚠️ **Sans cette migration, supprimer un traitement du registre laisserait sa pièce
--  jointe EN BASE, SUR LE DISQUE et DANS LE QUOTA de la filiale** — et
--  `GET /api/pieces/…` continuerait de la délivrer. Ce sont les constats **Q-232** et
--  **Q-233**, rouverts par un domaine élargi trois migrations plus loin.
--
--  ── LA RÈGLE QUI EN SORT, ET ELLE VAUT POUR TOUTE MIGRATION FUTURE ──────────────
--
--  🛑 **Toute migration qui ajoute une valeur à `type_entite` doit appeler
--  `f_poser_declencheurs_pieces()` DERRIÈRE.** C'est le §40.2 — *l'ordre est une
--  contrainte, pas un style* — sous une forme qu'aucune des cinq migrations précédentes
--  n'avait rencontrée : ici le fait déclenchant n'est pas la création d'une table, c'est
--  **l'élargissement d'un domaine**. Un installateur appelé trop tôt ne se plaint pas : il
--  équipe ce qu'il voit, rend un compte crédible, et laisse le reste démuni.
--
--  ⚠️ C'est aussi la troisième fois que le garde-fou du schéma rattrape un lot qu'il
--  n'avait pas vu naître (`f_verifier_portee_figee()` pour la `046`, `f_verifier_set_null_
--  composites()` pour la `071`, celui-ci pour la `072`). *Un installateur appelable est ce
--  qui permet à un garde de dire « rejouez ceci » au lieu de « c'est cassé ».*
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — LES DÉCLENCHEURS « LES PIÈCES SUIVENT LEUR PORTEUR », REPOSÉS
-- -------------------------------------------------------------------------------------
-- ⚠️ On n'écrit AUCUNE liste : la fonction DÉCOUVRE les porteuses par un prédicat sur le
--    catalogue (§19.4). Lui passer les trois noms du lot ferait de cette migration la
--    quatrième liste écrite à la main du dispositif, et la prochaine table oubliée le
--    serait en silence.
-- =====================================================================================

do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- L'armement est une TROISIÈME chose (§19.4) : `f_poser_declencheurs_pieces()` crée ses
-- déclencheurs en `origin`, et un déclencheur non armé est un déclencheur absent pour le
-- garde de traçabilité. Trois migrations de suite s'y sont fait refuser en septembre.
select f_armer_declencheurs();

-- =====================================================================================
-- §2 — CONSIGNATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('073', 'étendre le domaine « type_entite » rend une table PORTEUSE de pièces '
               'jointes : l''installateur des déclencheurs doit repasser derrière, sans '
               'quoi supprimer une ligne laisse sa pièce en base, sur le disque et dans '
               'le quota — constats Q-232 et Q-233 rouverts par un domaine élargi')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   Retirer les déclencheurs « _pieces » des trois tables du lot. ⚠️ À ne faire qu'en
--   retirant aussi les trois valeurs du domaine « type_entite » (migration 072) : les
--   séparer rouvre exactement le défaut que celle-ci ferme.
-- =====================================================================================
