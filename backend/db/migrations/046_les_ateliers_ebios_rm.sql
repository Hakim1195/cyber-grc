-- =====================================================================================
--  046 — EBIOS RM : LE CADRAGE, LES VALEURS MÉTIER, LES ÉVÉNEMENTS REDOUTÉS,
--        LES SOURCES DE RISQUE — ET LA BASE DE CONNAISSANCES DU GROUPE
--
--  §0  Le périmètre de la migration
--  §1  La base de connaissances — niveau GROUPE (action 25.5)
--  §2  L'étude — le cadrage de l'atelier 1
--  §3  Les valeurs métier — elles POINTENT le BIA, elles ne le recopient pas
--  §4  Les événements redoutés — atelier 1
--  §5  Les sources de risque et leurs objectifs visés — atelier 2
--  §6  La pertinence est DÉRIVÉE, et elle n'est qu'une SUGGESTION
--  §7  Le domaine « type_entite » admet les cinq tables
--  §8  Cloisonnement : RLS activée, forcée, quatre politiques par table
--  §9  Le garde-fou — il ÉPROUVE la dérivation, et il mesure « EN ADDITION »
--  §10 Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Lot **L25** du `docs/PLAN_PRODUIT.md`, actions **25.1**, **25.2** et **25.5**. La
--  méthode EBIOS RM est le ticket d'entrée français d'un outil de gestion des risques :
--  un RSSI qui ne peut pas conduire ses cinq ateliers dans l'outil les conduit dans un
--  classeur, et l'outil cesse d'être la source de vérité.
--
--  Cette migration livre les ateliers **1** (cadrage, valeurs métier, événements
--  redoutés) et **2** (sources de risque et objectifs visés), plus la **base de
--  connaissances** de niveau Groupe qui les alimente. Les ateliers 3, 4 et 5 suivent.
--
--  ── ⚠️ LA CONTRAINTE QUI GOUVERNE TOUT LE LOT : EN ADDITION, JAMAIS EN REMPLACEMENT ─
--
--  Le critère d'acceptation de l'action 25.1 est écrit en toutes lettres, et il est
--  NÉGATIF : *« les risques cotés en F × G × M restent valides et lisibles. Une migration
--  qui les réinterpréterait réattribuerait EN SILENCE des cotations produites en audit »*.
--
--  C'est le motif exact qui a fait refuser la renumérotation du catalogue ANSSI (constat
--  **Q-192**) : les auto-évaluations y sont stockées par `(ref_id, code)`, et les
--  renuméroter les aurait réattribuées sans qu'aucun écran ne le dise. Ici, les cotations
--  vivent dans `risques.f_frequence`, `g_gravite`, `m_maitrise`, `score_brut` et
--  `score_residuel` — cinq colonnes que **cette migration ne touche pas**, et dont le
--  garde-fou du §9 vérifie qu'elles sont toujours là.
--
--  Cela veut dire quelque chose de précis, et qu'il faut assumer : **le produit porte
--  DEUX méthodes de cotation en même temps**, la méthode F × G × M héritée et les ateliers
--  EBIOS RM. Elles ne se recouvrent pas, elles ne se recopient pas, et aucune ne
--  réécrit l'autre. Un scénario opérationnel d'EBIOS RM pourra — à l'atelier 5, livré par
--  la migration suivante — être *rattaché* à un risque coté, ce qui est un lien, pas une
--  conversion.
--
--  ⚠️ **Et le garde-fou l'ÉPROUVE au lieu de l'espérer** : il refuse tout déclencheur
--  posé sur une table EBIOS dont la fonction écrit dans `risques`. C'est la forme prise
--  par la même règle aux dérogations (migration `035`, §5) : *dès qu'un traitement doit
--  REPASSER pour remettre une valeur, il peut ne pas repasser — et le jour où il ne
--  repasse pas, le produit affirme en silence quelque chose qui n'est plus vrai.*
--
--  ── CE QUE CETTE MIGRATION NE CRÉE PAS, PARCE QUE ÇA EXISTE DÉJÀ ───────────────────
--
--  L'action 25.2 le dit : *« aucun graphe neuf : le module Cartographie porte déjà les
--  dépendances typées »*. Le principe vaut au-delà de l'atelier 3 :
--
--    · le **socle de sécurité** de l'atelier 1, ce sont les référentiels activés par
--      filiale et le pivot « Mesure de sécurité » — `referentiels_actifs`, `mesures`,
--      `evaluations`. Rien à créer ;
--    · les **biens supports** sont les `actifs`, et leurs dépendances sont
--      `actif_dependances`. Rien à créer ;
--    · les **valeurs métier** de nature « processus » sont les `processus` du BIA, qui
--      portent déjà criticité, RTO et RPO. On les **POINTE** (§3), on ne les recopie pas —
--      motif de l'AIPD (migration `039`), où `traitement_id` est `not null` et où aucune
--      colonne de `traitements` n'a de jumelle : *deux réponses à la même question dans un
--      outil produit en audit, c'est une de trop, et la seconde vieillit sans que personne
--      le sache* ;
--    · le **plan de traitement** de l'atelier 5, ce sont les `actions`. Rien à créer.
--
--  Ce qui manquait vraiment, et que cette migration ajoute, c'est ce qu'EBIOS RM apporte
--  de propre : le **cadrage d'une étude**, les **événements redoutés** attachés à une
--  valeur métier, et les **couples source de risque / objectif visé**.
--
--  ── ⚠️ L'ÉCHELLE N'EST PAS FIGÉE À QUATRE NIVEAUX, ET C'EST DÉLIBÉRÉ ───────────────
--
--  EBIOS RM propose des échelles à quatre niveaux, et l'application en propose quatre.
--  Le **schéma**, lui, borne entre 1 et 10 sans rien imposer de plus, pour deux raisons
--  qui pointent dans le même sens :
--
--    · l'action **25.3** rendra les échelles configurables par filiale et **versionnées** :
--      un `check (between 1 and 4)` posé aujourd'hui serait une barrière que la migration
--      suivante devrait abattre, c'est-à-dire une barrière qui n'en est pas une ;
--    · c'est déjà l'arbitrage de `risques.f_frequence`, écrit en 2026 dans la `002` :
--      *« l'application propose 1 à 4 ; le schéma reste permissif pour absorber la reprise
--      d'un export produit avec une autre échelle »*. Inventer ici une seconde réponse à
--      la même question serait pire que la question.
--
--  La borne 1–10 n'est donc pas une échelle : c'est une **borne de saisie** (contrôle
--  S13), du même genre que les longueurs de texte. Le SENS des niveaux appartient à
--  l'échelle, et l'échelle appartient à l'action 25.3.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 046_les_ateliers_ebios_rm.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §3 AJOUTE une unicité à `processus`, ce qui la VALIDE contre les lignes existantes ;
-- `force row level security` vaut pour le propriétaire. Sans périmètre, la validation ne
-- verrait qu'une partie des lignes — ou échouerait sans nommer sa cause. Motif du §0 de
-- la `012`, et règle du `CONVENTIONS.md` §42 : on déclare le groupe ENTIER, jamais une
-- filiale.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-046', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LA BASE DE CONNAISSANCES — NIVEAU GROUPE (action 25.5)
-- -------------------------------------------------------------------------------------
-- Table MIXTE, calquée sur `risque_catalogue` (migration `012`) : une ligne à
-- `filiale_id` nul appartient au socle du Groupe, une ligne renseignée est l'ajout d'une
-- filiale. C'est le patron du `PLAN_SERVEUR` §2.2, et il n'y a aucune raison d'en
-- inventer un second.
--
-- ⚠️ **Elle porte ce qu'on SAIT, jamais ce qu'on a MESURÉ.** « Un cybercriminel cherche
-- à obtenir une rançon » est une connaissance ; « ce couple-là est pertinent pour notre
-- filiale de Hambourg, à 3 sur 4 » est une évaluation, et elle vit au §5, au niveau de la
-- filiale. C'est très exactement la séparation que `risque_catalogue` tient déjà entre la
-- DÉFINITION d'un risque et son EXPOSITION.
--
-- ── POURQUOI UNE SEULE TABLE POUR DEUX REGISTRES ───────────────────────────────────
--
-- EBIOS RM alimente deux ateliers depuis sa base de connaissances : l'atelier 2 y puise
-- des **sources de risque** avec leurs objectifs visés, l'atelier 4 des **modes
-- opératoires** avec leur phase. Deux tables jumelles auraient porté les mêmes dix
-- colonnes de service, les mêmes quatre politiques, les mêmes deux unicités partielles et
-- les mêmes déclencheurs — et un correctif sur l'une aurait pu ne pas atteindre l'autre.
--
-- Le discriminant est `genre`, **vocabulaire fermé**, et les deux colonnes propres à
-- chaque genre sont tenues par une contrainte qui les lie à lui : un mode opératoire ne
-- peut pas porter d'objectif visé, une source de risque ne peut pas porter de phase.
-- L'omission ÉCHOUE BRUYAMMENT, ce qui est le critère du `CLAUDE.md` pour qu'une liste
-- écrite soit le bon outil.
-- =====================================================================================

create table if not exists ebios_connaissances (
    id            id_metier   not null default f_generer_id('EBCO'),
    -- Nul = socle du Groupe. Renseigné = ajout propre à une filiale. Domaine `id_metier`
    -- et non `text` nu : c'est le constat **Q-310**, qui était lui-même **Q-194** rejoué
    -- sur la table que la même migration venait de créer (corrigé par la `029`).
    filiale_id    id_metier,

    genre         text        not null,
    reference     text,
    nom           text        not null,
    -- Genre « source_risque » seulement : ce que la source CHERCHE. Un couple SR/OV est
    -- l'unité de l'atelier 2 ; les séparer en deux lignes ferait perdre l'appariement.
    objectif_vise text,
    -- Genre « mode_operatoire » seulement : la phase du mode opératoire, au vocabulaire
    -- de l'atelier 4 d'EBIOS RM — connaître, rentrer, trouver, exploiter.
    phase         text,
    -- Famille, en texte LIBRE, et pour le motif écrit mot pour mot à
    -- `risque_catalogue.categorie` : le vocabulaire des menaces bouge plus vite qu'une
    -- migration, et un RSSI ne doit pas attendre une livraison pour nommer ce qu'il voit.
    -- Ce qui est fermé ici, c'est `genre` et `statut`, jamais `categorie`.
    categorie     text,
    description   text,
    origine       text        not null default 'interne',
    statut        text        not null default 'active',
    archive_le    timestamptz,

    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,

    constraint pk_ebios_connaissances primary key (id),
    constraint fk_ebios_connaissances_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,

    constraint ck_ebios_connaissances_genre check (genre in ('source_risque', 'mode_operatoire')),
    constraint ck_ebios_connaissances_nom   check (nom <> ''),
    constraint ck_ebios_connaissances_ref   check (reference is null or reference <> ''),
    constraint ck_ebios_connaissances_cat   check (categorie is null or categorie <> ''),

    -- ⚠️ Les deux colonnes propres à un genre sont LIÉES à lui, dans les deux sens.
    -- Sans ces contraintes, `genre` ne serait qu'une étiquette : une ligne pourrait se
    -- dire « mode opératoire » et porter un objectif visé, et l'écran de l'atelier 2 la
    -- proposerait — ou pas — selon la requête qu'il aurait écrite ce jour-là.
    --
    -- ⚠️ **QUATRE CONTRAINTES ET NON DEUX, et le motif vaut d'être retenu.** La première
    -- rédaction fondait le VOCABULAIRE et le RATTACHEMENT AU GENRE dans un seul `check` :
    -- `phase is null or (genre = 'mode_operatoire' and phase in (…))`. C'était correct, et
    -- `test/reprise/enumerations.test.mjs` l'a refusé — à juste titre. Ce contrôle lit les
    -- valeurs admises DANS LE TEXTE du `check` pour les confronter au vocabulaire que la
    -- reprise connaît ; un prédicat qui mêle deux colonnes lui fait lire « mode_operatoire »
    -- comme une phase possible, et il accuse la reprise d'ignorer une valeur qui n'en est
    -- pas une.
    --
    -- On ne « corrige » pas le contrôle : *une contrainte dit UNE chose*, et deux
    -- contraintes séparées disent mieux ce qu'elles interdisent — le refus nomme alors
    -- laquelle des deux règles a été enfreinte, au lieu d'un prédicat composite que
    -- l'utilisateur doit décoder.
    constraint ck_ebios_connaissances_objectif check (
        objectif_vise is null or objectif_vise <> ''),
    constraint ck_ebios_connaissances_objectif_genre check (
        objectif_vise is null or genre = 'source_risque'),
    constraint ck_ebios_connaissances_phase check (
        phase is null or phase in ('connaitre', 'rentrer', 'trouver', 'exploiter')),
    constraint ck_ebios_connaissances_phase_genre check (
        phase is null or genre = 'mode_operatoire'),

    constraint ck_ebios_connaissances_origine check (origine in ('interne', 'referentiel', 'sectoriel')),
    constraint ck_ebios_connaissances_statut  check (statut in ('active', 'archivee')),
    -- L'égalité — et non deux implications — interdit les deux incohérences d'un coup :
    -- un archivé sans date, une date sans archivage. Motif de `risque_catalogue`.
    constraint ck_ebios_connaissances_archive check ((statut = 'archivee') = (archive_le is not null)),

    -- Bornes de saisie — contrôle S13. Une collection non bornée est une voie de déni de
    -- service applicatif autant qu'un champ mal rempli.
    constraint ck_ebios_connaissances_longueurs check (
        length(nom) <= 300
        and (reference is null or length(reference) <= 60)
        and (objectif_vise is null or length(objectif_vise) <= 300)
        and (categorie is null or length(categorie) <= 120)
        and (description is null or length(description) <= 4000))
);

comment on table ebios_connaissances is
    'Base de connaissances EBIOS RM (action 25.5) : sources de risque avec leurs '
    'objectifs visés (atelier 2) et modes opératoires avec leur phase (atelier 4). '
    'MIXTE comme risque_catalogue : filiale_id nul = socle du Groupe, renseigné = ajout '
    'local. ⚠️ Elle porte ce qu''on SAIT, jamais ce qu''on a MESURÉ — la pertinence d''un '
    'couple pour une filiale donnée vit dans « ebios_sources_risque », au niveau de la '
    'filiale, parce que c''est précisément ce qui distingue Hambourg de Toulouse.';

comment on column ebios_connaissances.genre is
    'source_risque | mode_operatoire. Vocabulaire FERMÉ, et il commande les deux colonnes '
    'propres à chaque genre (objectif_vise, phase) par deux contraintes. Sans elles, '
    'genre ne serait qu''une étiquette.';

comment on column ebios_connaissances.phase is
    'Phase du mode opératoire, au vocabulaire de l''atelier 4 : connaitre | rentrer | '
    'trouver | exploiter. Sans accent ni espace — c''est une valeur stockée, pas un '
    'libellé : l''affichage est traduit par l''écran (lot L10).';

create unique index if not exists uq_ebios_connaissances_reference_groupe
    on ebios_connaissances (filiale_id, reference)
    where filiale_id is null and reference is not null;

-- ⚠️ `(filiale_id, reference)` et non `(reference)` seul, bien que l'index soit déjà borné
-- aux lignes du socle : le garde-fou du `CONVENTIONS.md` §19.1 exige que toute unicité
-- d'une table cloisonnée porte `filiale_id` parmi ses colonnes de clé. L'ajouter ne change
-- RIEN à ce que l'index interdit — la colonne vaut nul sur toutes les lignes couvertes —
-- mais il fait DIRE à l'index ce qu'il borne. C'est la réponse au garde-fou, pas son
-- contournement, et c'est le choix déjà fait par `risque_catalogue`.
create unique index if not exists uq_ebios_connaissances_reference_filiale
    on ebios_connaissances (filiale_id, reference)
    where filiale_id is not null and reference is not null;

create index if not exists ix_ebios_connaissances_genre
    on ebios_connaissances (genre, statut);

-- =====================================================================================
-- §2 — L'ÉTUDE : LE CADRAGE DE L'ATELIER 1
-- -------------------------------------------------------------------------------------
-- ⚠️ **TOUJOURS locale, et `not null`.** Une étude EBIOS RM de portée Groupe voudrait
-- dire que vingt filiales partagent un périmètre, des valeurs métier et des événements
-- redoutés — ce qui est faux par construction : c'est l'exposition qui distingue les
-- filiales, et c'est pour cela que le produit les cloisonne.
--
-- L'étude est l'unité qui rend l'analyse REPRODUCTIBLE : « analyse de risque du site de
-- Hambourg, exercice 2026 ». Sans elle, les valeurs métier et les sources de risque
-- s'accumuleraient sans qu'on puisse dire de quelle analyse elles relèvent, ni comparer
-- celle de cette année à celle de l'an dernier.
-- =====================================================================================

create table if not exists ebios_etudes (
    id          id_metier   not null default f_generer_id('EBET'),
    filiale_id  id_metier   not null,

    nom         text        not null,
    -- Le périmètre de l'étude : ce qu'elle couvre, et ce qu'elle ne couvre pas. EBIOS RM
    -- en fait la première question de l'atelier 1, et une étude sans périmètre écrit est
    -- une étude dont personne ne peut dire si elle a répondu.
    perimetre   text,
    -- Le cadre : commanditaire, objectif, participants, cadre réglementaire invoqué.
    cadre       text,
    responsable text,

    statut      text        not null default 'cadrage',
    debut_le    date        not null default current_date,
    validee_le  date,
    notes       text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_ebios_etudes primary key (id),
    constraint fk_ebios_etudes_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- Cible des clés étrangères composites des §3 et §5 (`CONVENTIONS.md` §19.1).
    constraint uq_ebios_etudes_id_filiale unique (id, filiale_id),

    constraint ck_ebios_etudes_nom    check (nom <> ''),
    constraint ck_ebios_etudes_statut check (statut in ('cadrage', 'en_cours', 'validee', 'archivee')),
    -- Une étude validée porte sa date de validation. L'inverse n'est PAS imposé : une
    -- étude archivée garde la sienne, et c'est ce qu'on veut — archiver n'est pas dévalider.
    constraint ck_ebios_etudes_validee check (statut <> 'validee' or validee_le is not null),
    constraint ck_ebios_etudes_dates   check (validee_le is null or validee_le >= debut_le),
    constraint ck_ebios_etudes_longueurs check (
        length(nom) <= 300
        and (perimetre is null or length(perimetre) <= 4000)
        and (cadre is null or length(cadre) <= 4000)
        and (responsable is null or length(responsable) <= 200)
        and (notes is null or length(notes) <= 4000))
);

comment on table ebios_etudes is
    'Étude EBIOS RM d''une filiale (action 25.1, atelier 1) : le cadrage. Elle est '
    'l''unité qui rend l''analyse reproductible — « site de Hambourg, exercice 2026 » — '
    'et sans elle on ne pourrait ni dire de quelle analyse relève une valeur métier, ni '
    'comparer deux exercices. ⚠️ TOUJOURS locale : une étude de portée Groupe voudrait '
    'dire que vingt filiales partagent un périmètre et des événements redoutés, ce qui '
    'est faux par construction.';

comment on column ebios_etudes.statut is
    'cadrage | en_cours | validee | archivee. ⚠️ Ce n''est PAS un état dérivé : c''est une '
    'DÉCISION humaine — quelqu''un déclare l''étude close. La dériver d''un compte '
    'd''ateliers remplis ferait valider une étude que personne n''a relue.';

create index if not exists ix_ebios_etudes_filiale on ebios_etudes (filiale_id, statut);

-- =====================================================================================
-- §3 — LES VALEURS MÉTIER : ELLES POINTENT LE BIA, ELLES NE LE RECOPIENT PAS
-- -------------------------------------------------------------------------------------
-- Une valeur métier d'EBIOS RM est *« un processus ou une information »* — les deux
-- natures, et pas une de plus. Or le produit porte déjà les processus : ce sont ceux du
-- bilan d'impact sur l'activité (`processus`, module BIA), avec leur criticité, leur RTO
-- et leur RPO.
--
-- ⚠️ **On les POINTE, on ne les recopie pas** — motif de l'AIPD (migration `039`), où
-- `traitement_id` est `not null` et où aucune colonne de `traitements` n'a de jumelle :
-- *deux réponses à la même question dans un outil produit en audit, c'est une de trop, et
-- la seconde vieillit sans que personne le sache.* Ici la criticité d'un processus ne
-- sera JAMAIS recopiée : l'écran de l'atelier 1 la lit dans `processus`, à l'instant où
-- on regarde.
--
-- Le lien reste **facultatif** : une valeur métier de nature « information » n'a pas de
-- processus en face, et un RSSI qui conduit son atelier 1 avant d'avoir fait son BIA doit
-- pouvoir avancer. La contrainte dit seulement qu'un processus ne peut être désigné que
-- par une valeur métier qui se dit « processus ».
-- =====================================================================================

-- La cible de la clé composite. `processus` porte `primary key (id)` depuis la `002` et
-- n'a jamais eu son unicité `(id, filiale_id)` : c'est exactement ce que la `042` a dû
-- ajouter à `prestataires` pour la même raison. Sans elle, PostgreSQL refuse la clé
-- composite du §3 — et une clé SIMPLE serait satisfaite par un processus INVISIBLE de la
-- filiale voisine (`CONVENTIONS.md` §17.1).
alter table processus drop constraint if exists uq_processus_id_filiale;
alter table processus add  constraint uq_processus_id_filiale unique (id, filiale_id);

comment on constraint uq_processus_id_filiale on processus is
    'Cible des clés étrangères COMPOSITES vers « processus » (CONVENTIONS.md §17.1). '
    'Posée par la 046 pour ebios_valeurs_metier.processus_id : une clé simple serait '
    'satisfaite par un processus INVISIBLE de la filiale voisine, les contrôles '
    'd''intégrité de PostgreSQL contournant délibérément la RLS.';

create table if not exists ebios_valeurs_metier (
    id           id_metier   not null default f_generer_id('EBVM'),
    filiale_id   id_metier   not null,
    etude_id     id_metier   not null,

    nom          text        not null,
    nature       text        not null,
    -- Le processus du BIA que cette valeur métier EST, ou nul. Facultatif : une valeur
    -- métier de nature « information » n'en a pas, et un atelier 1 conduit avant le BIA
    -- doit pouvoir avancer.
    processus_id id_metier,
    responsable  text,
    description  text,

    version      integer     not null default 1,
    cree_le      timestamptz not null default now(),
    cree_par     text        not null default f_utilisateur_courant(),
    modifie_le   timestamptz,
    modifie_par  text,

    constraint pk_ebios_valeurs_metier primary key (id),
    constraint uq_ebios_valeurs_metier_id_filiale unique (id, filiale_id),
    constraint fk_ebios_valeurs_metier_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,

    -- ⚠️ Clés étrangères COMPOSITES — `CONVENTIONS.md` §17.1. Une clé simple sur
    -- `etude_id` serait satisfaite par une étude INVISIBLE de la filiale voisine : on
    -- pourrait rattacher sa valeur métier à une étude qu'on ne voit pas, et la voisine
    -- qui la supprimerait détruirait ici un travail qu'elle ignore.
    constraint fk_ebios_valeurs_metier_etude
        foreign key (etude_id, filiale_id) references ebios_etudes (id, filiale_id)
        on delete cascade,
    -- `set null` et non `cascade` : supprimer un processus du BIA ne doit pas effacer la
    -- valeur métier de l'étude EBIOS — elle garde son nom, ses événements redoutés et sa
    -- place dans l'analyse. Elle perd seulement le lien.
    --
    -- ⚠️ **`set null (processus_id)` — LA LISTE DE COLONNES EST INDISPENSABLE, ET SON
    -- ABSENCE A ÉTÉ MESURÉE.** Sans elle, PostgreSQL met à NULL **toutes** les colonnes
    -- de la clé, `filiale_id` comprise — or `filiale_id` est `not null`. La suppression
    -- d'un processus échouait alors en `23502`, et le message remis à l'utilisateur
    -- devenait *« Le champ filiale_id est obligatoire »* sur une opération qui n'écrit
    -- rien de tel.
    --
    -- Ce n'est pas une gêne théorique : la purge de `POST /api/reprise` en mode
    -- « remplacer » supprime les processus de la filiale, et **toute restauration de
    -- sauvegarde tombait**. Dix essais de `test/api/reprise-route.test.mjs` l'ont dit
    -- d'un coup — aucune relecture ne l'avait vu, et le cas ne se présente que lorsqu'un
    -- processus RÉFÉRENCÉ est supprimé.
    --
    -- ⚠️ C'est le pendant exact du `CONVENTIONS.md` §38, à une nuance près qui compte :
    -- là-bas, la liste de colonnes **ne sauvait pas**, parce que la clé contenait une
    -- colonne ENGENDRÉE que PostgreSQL refuse d'écrire ; ici la colonne est ordinaire, et
    -- la liste fait exactement ce qu'il faut. *La forme à liste n'est pas inutile ; elle
    -- était inapplicable à ce cas-là.*
    constraint fk_ebios_valeurs_metier_processus
        foreign key (processus_id, filiale_id) references processus (id, filiale_id)
        on delete set null (processus_id),

    constraint ck_ebios_valeurs_metier_nom    check (nom <> ''),
    constraint ck_ebios_valeurs_metier_nature check (nature in ('processus', 'information')),
    -- Un processus ne peut être désigné que par une valeur métier qui se dit processus.
    constraint ck_ebios_valeurs_metier_lien   check (
        processus_id is null or nature = 'processus'),
    constraint ck_ebios_valeurs_metier_longueurs check (
        length(nom) <= 300
        and (responsable is null or length(responsable) <= 200)
        and (description is null or length(description) <= 4000))
);

comment on table ebios_valeurs_metier is
    'Valeur métier d''une étude EBIOS RM (atelier 1) : un processus ou une information '
    'dont la compromission serait redoutée. ⚠️ Elle POINTE le processus du BIA quand elle '
    'en est un (processus_id), elle ne recopie NI sa criticité, NI son RTO, NI son RPO — '
    'motif de l''AIPD (migration 039) : deux réponses à la même question dans un outil '
    'produit en audit, c''est une de trop, et la seconde vieillit sans que personne le '
    'sache.';

comment on column ebios_valeurs_metier.processus_id is
    'Le processus du BIA que cette valeur métier EST, ou nul. ⚠️ « on delete set null » : '
    'supprimer un processus n''efface pas la valeur métier de l''étude — elle garde son '
    'nom, ses événements redoutés et sa place dans l''analyse, elle perd le lien.';

create index if not exists ix_ebios_valeurs_metier_etude
    on ebios_valeurs_metier (filiale_id, etude_id);

-- =====================================================================================
-- §4 — LES ÉVÉNEMENTS REDOUTÉS — ATELIER 1
-- -------------------------------------------------------------------------------------
-- Un événement redouté est l'atteinte à une valeur métier, qualifiée par le **besoin de
-- sécurité** touché et par sa **gravité**. C'est la sortie de l'atelier 1, et l'entrée de
-- l'atelier 3.
--
-- ⚠️ **La gravité n'est PAS recopiée dans `risques.g_gravite`.** Les deux cotations
-- cohabitent sans se parler : celle-ci porte sur un événement redouté d'une étude, celle-là
-- sur un scénario de risque coté en F × G × M. Les faire se répondre demanderait qu'un
-- traitement repasse — et c'est exactement ce que le critère 25.1 interdit.
-- =====================================================================================

create table if not exists ebios_evenements_redoutes (
    id                id_metier   not null default f_generer_id('EBER'),
    filiale_id        id_metier   not null,
    valeur_metier_id  id_metier   not null,

    nom               text        not null,
    -- Le besoin de sécurité atteint. Vocabulaire des quatre critères DICP, celui que
    -- portent déjà les actifs du produit.
    besoin            text        not null,
    -- 1 à 4 dans l'application ; le SCHÉMA borne seulement la saisie (voir l'en-tête).
    gravite           smallint,
    impacts           text,
    description       text,

    version           integer     not null default 1,
    cree_le           timestamptz not null default now(),
    cree_par          text        not null default f_utilisateur_courant(),
    modifie_le        timestamptz,
    modifie_par       text,

    constraint pk_ebios_evenements_redoutes primary key (id),
    constraint uq_ebios_evenements_redoutes_id_filiale unique (id, filiale_id),
    constraint fk_ebios_evenements_redoutes_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_ebios_evenements_redoutes_valeur
        foreign key (valeur_metier_id, filiale_id)
        references ebios_valeurs_metier (id, filiale_id) on delete cascade,

    constraint ck_ebios_evenements_redoutes_nom    check (nom <> ''),
    constraint ck_ebios_evenements_redoutes_besoin check (besoin in (
        'disponibilite', 'integrite', 'confidentialite', 'tracabilite')),
    constraint ck_ebios_evenements_redoutes_gravite check (
        gravite is null or (gravite >= 1 and gravite <= 10)),
    constraint ck_ebios_evenements_redoutes_longueurs check (
        length(nom) <= 300
        and (impacts is null or length(impacts) <= 4000)
        and (description is null or length(description) <= 4000))
);

comment on table ebios_evenements_redoutes is
    'Événement redouté d''une valeur métier (atelier 1) : l''atteinte, le besoin de '
    'sécurité touché, la gravité. ⚠️ Sa gravité n''est JAMAIS recopiée dans '
    'risques.g_gravite : les deux cotations cohabitent sans se parler, et les faire se '
    'répondre demanderait qu''un traitement repasse — ce que le critère 25.1 interdit '
    'nommément (EN ADDITION, jamais en remplacement).';

comment on column ebios_evenements_redoutes.gravite is
    'Gravité de l''atteinte. L''application propose 1 à 4 ; le schéma borne 1 à 10 sans '
    'rien imposer de plus, parce que l''action 25.3 rendra les échelles configurables et '
    'VERSIONNÉES par filiale. Une borne à quatre niveaux serait une barrière que la '
    'migration suivante devrait abattre — c''est-à-dire une barrière qui n''en est pas '
    'une. Même arbitrage qu''à risques.f_frequence (migration 002).';

create index if not exists ix_ebios_evenements_redoutes_valeur
    on ebios_evenements_redoutes (filiale_id, valeur_metier_id);

-- =====================================================================================
-- §5 — LES SOURCES DE RISQUE ET LEURS OBJECTIFS VISÉS — ATELIER 2
-- -------------------------------------------------------------------------------------
-- L'unité de l'atelier 2 est le **couple** « source de risque / objectif visé » : un
-- concurrent qui cherche un plan de fabrication et un concurrent qui cherche à nuire à
-- l'image sont deux couples, pas une source avec deux notes. Les deux colonnes sont donc
-- `not null` toutes les deux, sur la même ligne.
--
-- ⚠️ **La décision de RETENIR un couple appartient à un humain**, et elle se justifie.
-- Le produit calcule une pertinence (§6) — il la propose. C'est `retenue` qui engage, et
-- la contrainte exige alors sa justification : un couple retenu sans motif est
-- exactement ce qu'un auditeur demandera six mois plus tard, et que personne ne saura
-- redire.
-- =====================================================================================

create table if not exists ebios_sources_risque (
    id              id_metier   not null default f_generer_id('EBSR'),
    filiale_id      id_metier   not null,
    etude_id        id_metier   not null,

    source          text        not null,
    objectif_vise   text        not null,
    -- L'entrée de la base de connaissances que ce couple instancie, ou nul pour un couple
    -- saisi librement. Voir le commentaire de la colonne pour l'arbitrage de la clé.
    connaissance_id id_metier,

    -- Les trois critères d'évaluation d'un couple, au vocabulaire d'EBIOS RM. La
    -- PERTINENCE, elle, ne se range pas : elle se dérive (§6).
    motivation      smallint,
    ressources      smallint,
    activite        smallint,

    retenue         boolean     not null default false,
    justification   text,

    version         integer     not null default 1,
    cree_le         timestamptz not null default now(),
    cree_par        text        not null default f_utilisateur_courant(),
    modifie_le      timestamptz,
    modifie_par     text,

    constraint pk_ebios_sources_risque primary key (id),
    constraint uq_ebios_sources_risque_id_filiale unique (id, filiale_id),
    constraint fk_ebios_sources_risque_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_ebios_sources_risque_etude
        foreign key (etude_id, filiale_id) references ebios_etudes (id, filiale_id)
        on delete cascade,

    -- ⚠️ CLÉ SIMPLE VERS LA BASE DE CONNAISSANCES, ET C'EST UN ARBITRAGE REPRIS, PAS UN
    -- OUBLI. Le `CONVENTIONS.md` §17.1 exige `filiale_id` dans toute clé étrangère ; la
    -- règle ne peut pas s'appliquer telle quelle vers une table MIXTE, où le socle porte
    -- `filiale_id` nul : une clé composite depuis une table dont le `filiale_id` n'est
    -- jamais nul rendrait le socle Groupe INATTEIGNABLE, c'est-à-dire l'inverse du but.
    --
    -- C'est mot pour mot la situation de `risques.catalogue_id` vers `risque_catalogue`
    -- (migration `012` §2), et la réponse est la même — *inventer ici une troisième
    -- réponse à la même question serait pire que la question*. Ce que cela laisse ouvert,
    -- dit franchement : une filiale pourrait rattacher son couple à l'ajout LOCAL d'une
    -- autre, si elle en devinait l'identifiant — 52 bits d'aléa cryptographique. Oracle
    -- d'existence faible, atteignable seulement par une attaque délibérée. Le contrôle
    -- qui reste est réel : la RLS ne LAISSE PAS LIRE l'ajout local d'une autre filiale,
    -- donc aucun écran ne le propose et il ne revient jamais.
    constraint fk_ebios_sources_risque_connaissance
        foreign key (connaissance_id) references ebios_connaissances (id) on delete set null,

    constraint ck_ebios_sources_risque_source    check (source <> ''),
    constraint ck_ebios_sources_risque_objectif  check (objectif_vise <> ''),
    constraint ck_ebios_sources_risque_criteres  check (
        (motivation is null or (motivation >= 1 and motivation <= 10))
        and (ressources is null or (ressources >= 1 and ressources <= 10))
        and (activite   is null or (activite   >= 1 and activite   <= 10))),
    -- ⚠️ Retenir un couple ENGAGE l'étude : les ateliers 3 et 4 ne travailleront que sur
    -- les couples retenus. La justification n'est donc pas une politesse, c'est la trace
    -- de la décision — et c'est la pièce qu'un auditeur demande en premier.
    constraint ck_ebios_sources_risque_retenue check (
        retenue = false or (justification is not null and justification <> '')),
    constraint ck_ebios_sources_risque_longueurs check (
        length(source) <= 300
        and length(objectif_vise) <= 300
        and (justification is null or length(justification) <= 4000))
);

comment on table ebios_sources_risque is
    'Couple « source de risque / objectif visé » d''une étude (atelier 2). L''unité est le '
    'COUPLE : un concurrent qui cherche un plan de fabrication et un concurrent qui cherche '
    'à nuire à l''image sont deux lignes, pas une source à deux notes. ⚠️ La PERTINENCE '
    'n''est pas une colonne — elle se dérive (f_ebios_pertinence) et n''est qu''une '
    'SUGGESTION ; ce qui engage est « retenue », qui exige sa justification.';

comment on column ebios_sources_risque.retenue is
    'La DÉCISION humaine de retenir le couple pour les ateliers 3 et 4. ⚠️ Elle n''est '
    'jamais dérivée de la pertinence : un produit qui retiendrait tout seul les couples '
    'au-dessus d''un seuil ferait porter à un calcul une décision qui engage l''étude. Le '
    'produit PROPOSE (f_ebios_pertinence), un humain DÉCIDE — et il se justifie, ce que la '
    'contrainte ck_ebios_sources_risque_retenue impose.';

create index if not exists ix_ebios_sources_risque_etude
    on ebios_sources_risque (filiale_id, etude_id);

-- =====================================================================================
-- §5 bis — LA MARQUE DE PROVENANCE, LA TRAÇABILITÉ, LE REGISTRE DE L'ARTICLE 30
-- =====================================================================================
-- Les cinq tables naissent APRÈS la migration `032` : son balayage ne peut pas les avoir
-- vues, on les rattrape ici, sinon le déploiement rougit.

alter table ebios_connaissances        add column if not exists provenance provenance_ligne not null;
alter table ebios_etudes               add column if not exists provenance provenance_ligne not null;
alter table ebios_valeurs_metier       add column if not exists provenance provenance_ligne not null;
alter table ebios_evenements_redoutes  add column if not exists provenance provenance_ligne not null;
alter table ebios_sources_risque       add column if not exists provenance provenance_ligne not null;

do $$
declare
    v_table text;
begin
    foreach v_table in array array['ebios_connaissances', 'ebios_etudes',
                                   'ebios_valeurs_metier', 'ebios_evenements_redoutes',
                                   'ebios_sources_risque']
    loop
        execute format('drop trigger if exists trg_%s_provenance on %I', v_table, v_table);
        execute format('create trigger trg_%s_provenance before insert on %I '
                       'for each row execute function f_marquer_provenance()', v_table, v_table);
        -- Et la MISE À JOUR : sans « before update », `version` cesse d'être un compteur
        -- et le verrouillage optimiste — le risque P1 du projet — devient décoratif (§18.1).
        execute format('drop trigger if exists trg_%s_maj on %I', v_table, v_table);
        execute format('create trigger trg_%s_maj before update on %I '
                       'for each row execute function f_maj_tracabilite()', v_table, v_table);
    end loop;
end;
$$;

-- ⚠️ On APPELLE l'installateur, on ne recopie pas son déclencheur :
-- `f_poser_tracabilite_insertion()` (migration `001`) découvre dans le CATALOGUE toutes
-- les tables portant `cree_par` et leur pose ce qu'il faut.
select f_poser_tracabilite_insertion();

-- ── ⚠️ LA PORTÉE D'UNE TABLE MIXTE SE FIGE, ET LE GARDE-FOU L'A EXIGÉ ──────────────
--
-- `ebios_connaissances` est MIXTE : `filiale_id` nul = socle du Groupe, renseigné = ajout
-- local. Sans déclencheur, un `update` pourrait faire BASCULER une ligne d'un niveau à
-- l'autre — et les politiques RLS ne voient pas cette transition : elles jugent la ligne
-- avant et la ligne après, chacune valide de son côté (`CONVENTIONS.md` §17.6, constat
-- M-3). Une entrée du socle Groupe deviendrait alors l'ajout d'une filiale, ou l'inverse.
--
-- ⚠️ **Écrit ici parce que `f_verifier_portee_figee()` a REFUSÉ le déploiement** — la
-- première rédaction de cette migration l'avait oublié, exactement comme la `035` avait
-- oublié `f_poser_declencheurs_pieces()`. C'est la troisième fois qu'un installateur
-- appelable rattrape un lot qu'il n'a pas vu naître, et c'est ce qu'on veut : l'oubli
-- est BRUYANT (§40.4).
select f_poser_portee_figee();

-- Le registre de l'article 30 réclame une décision pour CHAQUE colonne candidate
-- (constat Q-295), et complète pour toute colonne « personnelle » (constat Q-296).
-- ⚠️ `f_colonnes_candidates()` écarte les colonnes de DOMAINE (id_metier,
-- provenance_ligne) et les types incapables de porter une personne (smallint, boolean,
-- date, timestamptz) : ne sont réclamées ici que les colonnes « text ».
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  -- ── ebios_connaissances : une base de connaissances de MENACES ────────────────────
  ('ebios_connaissances', 'genre', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (source_risque | mode_operatoire). Ne désigne aucune personne.'),
  ('ebios_connaissances', 'reference', 'non_personnelle', null, null, null, null,
   'Référence d''une entrée du socle de connaissances — un code, pas une personne.'),
  ('ebios_connaissances', 'nom', 'non_personnelle', null, null, null, null,
   'Nom d''une source de risque TYPE (« cybercriminel », « concurrent ») ou d''un mode '
   'opératoire type. ⚠️ C''est une CATÉGORIE d''attaquant, jamais un individu : le '
   'produit ne nomme pas de suspect, et l''écran le dit.'),
  ('ebios_connaissances', 'objectif_vise', 'non_personnelle', null, null, null, null,
   'Ce que la source de risque TYPE cherche à obtenir. Une finalité d''attaque, pas une personne.'),
  ('ebios_connaissances', 'phase', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos de l''atelier 4 (connaitre | rentrer | trouver | exploiter).'),
  ('ebios_connaissances', 'categorie', 'non_personnelle', null, null, null, null,
   'Famille de menace en texte libre — le vocabulaire des menaces, pas un annuaire.'),
  ('ebios_connaissances', 'description', 'personnelle',
   'Décrire une source de risque type ou un mode opératoire type pour que les ateliers 2 et 4 '
   's''appuient sur un savoir partagé plutôt que sur la mémoire de celui qui anime.',
   'Intérêt légitime',
   1095,
   'signaler',
   'Saisie libre dont le sujet est une MENACE et non une personne — mais un nom peut '
   'figurer au milieu d''une phrase (« mode opératoire observé chez X »). Le remplacer '
   'détruirait la phrase, et cette phrase est un savoir. Régime « signaler » : le produit '
   'montre l''emplacement à un humain au lieu d''effacer. Idem derogations.motif.'),
  ('ebios_connaissances', 'origine', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (interne | referentiel | sectoriel) : d''où vient l''entrée du socle.'),
  ('ebios_connaissances', 'statut', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (active | archivee).'),

  -- ── ebios_etudes ──────────────────────────────────────────────────────────────────
  ('ebios_etudes', 'nom', 'non_personnelle', null, null, null, null,
   'Intitulé de l''étude (« site de Hambourg, exercice 2026 ») : un périmètre et une date.'),
  ('ebios_etudes', 'perimetre', 'personnelle',
   'Décrire ce que l''étude couvre et ce qu''elle ne couvre pas — la première question de '
   'l''atelier 1, et celle qu''un auditeur pose pour savoir si l''analyse a répondu.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre dont le sujet est un périmètre technique et organisationnel ; un nom peut '
   'y figurer (« hors périmètre : le laboratoire de X »). Régime « signaler ».'),
  ('ebios_etudes', 'cadre', 'personnelle',
   'Consigner le commanditaire, l''objectif et les participants de l''étude — sans quoi on '
   'ne sait plus, deux ans après, qui a demandé quoi ni qui était dans la salle.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre où les participants sont souvent NOMMÉS. Le remplacer détruirait la trace '
   'de qui a conduit l''analyse — une pièce d''audit. Régime « signaler ».'),
  ('ebios_etudes', 'responsable', 'personnelle',
   'Savoir qui pilote l''étude et à qui s''adresser pour la faire avancer ou la relire.',
   'Intérêt légitime', 1095, 'anonymiser',
   'Nom saisi librement, souvent repris de l''annuaire — idem actifs.responsable. '
   'Anonymisé à l''expiration : l''étude garde tout son sens pour un auditeur sans nommer '
   'qui la pilotait il y a trois ans.'),
  ('ebios_etudes', 'statut', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (cadrage | en_cours | validee | archivee).'),
  ('ebios_etudes', 'notes', 'personnelle',
   'Consigner ce qui ne rentre dans aucun autre champ de l''étude.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre sans sujet imposé : un nom peut y figurer. Régime « signaler ».'),

  -- ── ebios_valeurs_metier ──────────────────────────────────────────────────────────
  ('ebios_valeurs_metier', 'nom', 'non_personnelle', null, null, null, null,
   'Nom d''un processus ou d''une information — une valeur métier, jamais une personne.'),
  ('ebios_valeurs_metier', 'nature', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (processus | information).'),
  ('ebios_valeurs_metier', 'responsable', 'personnelle',
   'Savoir qui répond de la valeur métier — le « propriétaire » au sens d''EBIOS RM.',
   'Intérêt légitime', 1095, 'anonymiser',
   'Nom saisi librement, souvent repris de l''annuaire — idem actifs.responsable.'),
  ('ebios_valeurs_metier', 'description', 'personnelle',
   'Décrire la valeur métier : ce qu''elle porte, pour qui, et ce que sa perte coûterait.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre dont le sujet n''est pas une personne, mais où un nom peut figurer au '
   'milieu d''une phrase. Régime « signaler ».'),

  -- ── ebios_evenements_redoutes ─────────────────────────────────────────────────────
  ('ebios_evenements_redoutes', 'nom', 'non_personnelle', null, null, null, null,
   'Intitulé de l''atteinte redoutée (« divulgation du plan de fabrication »).'),
  ('ebios_evenements_redoutes', 'besoin', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos DICP (disponibilite | integrite | confidentialite | tracabilite).'),
  ('ebios_evenements_redoutes', 'impacts', 'personnelle',
   'Décrire les impacts de l''atteinte — financiers, légaux, d''image, humains.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre : les impacts humains peuvent NOMMER (« mise en danger de l''équipe de '
   'X »). Le remplacer détruirait la phrase, et c''est elle qui justifie la gravité. '
   'Régime « signaler ».'),
  ('ebios_evenements_redoutes', 'description', 'personnelle',
   'Préciser l''événement redouté au-delà de son intitulé.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre dont le sujet n''est pas une personne. Régime « signaler ».'),

  -- ── ebios_sources_risque ──────────────────────────────────────────────────────────
  ('ebios_sources_risque', 'source', 'non_personnelle', null, null, null, null,
   'Catégorie d''attaquant retenue pour l''étude (« concurrent », « initié malveillant »). '
   '⚠️ Une CATÉGORIE, jamais un individu : le produit ne désigne pas de suspect. Le jour '
   'où quelqu''un y écrirait un nom, ce serait un usage détourné, et le guide le dit.'),
  ('ebios_sources_risque', 'objectif_vise', 'non_personnelle', null, null, null, null,
   'Ce que la source cherche à obtenir : une finalité d''attaque, pas une personne.'),
  ('ebios_sources_risque', 'justification', 'personnelle',
   'Motiver la décision de retenir — ou d''écarter — un couple source/objectif pour la '
   'suite de l''étude. C''est la pièce qu''un auditeur demande en premier.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre dont le sujet est une décision d''analyse ; un nom peut y figurer (« signalé '
   'par X en comité »). Le remplacer détruirait la phrase, qui est la trace de la décision. '
   'Régime « signaler ».')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §6 — LA PERTINENCE EST DÉRIVÉE, ET ELLE N'EST QU'UNE SUGGESTION
-- -------------------------------------------------------------------------------------
-- ⚠️ **Un seul endroit**, et c'est celui-ci. La route l'appelle, le garde-fou du §9
-- l'éprouve, l'écran affiche ce qu'elle rend. Une seconde rédaction — un `case` dans une
-- requête, une moyenne dans le navigateur — se mettrait à diverger au premier ajustement,
-- et deux comptes de la même grandeur est ce qu'un outil produit en audit ne peut pas se
-- permettre (constat **Q-219**, à l'échelle d'un chiffre).
--
-- ── ⚠️ ELLE NE DEVINE RIEN : UN CRITÈRE ABSENT REND `null` ────────────────────────
--
-- C'est la décision qui compte, et elle est le pendant exact du critère de l'action 25.4 :
-- *« une valeur en euros n'est affichée QUE si ses hypothèses sont saisies. Pas
-- d'estimation par défaut : un chiffre inventé en comité de direction est pire que pas de
-- chiffre »*. Traiter un critère manquant comme un zéro, ou comme une moyenne des deux
-- autres, produirait une pertinence qui a l'air mesurée et qui ne l'est pas.
--
-- ── ET POURQUOI CE N'EST QU'UNE SUGGESTION ───────────────────────────────────────
--
-- EBIOS RM demande à l'animateur de JUGER la pertinence d'un couple, les trois critères
-- étant des aides au jugement. Un produit qui retiendrait tout seul les couples au-dessus
-- d'un seuil ferait porter à une moyenne une décision qui engage toute la suite de
-- l'étude — les ateliers 3 et 4 ne travaillent que sur les couples retenus. Le produit
-- PROPOSE, un humain DÉCIDE : c'est `retenue`, et elle exige sa justification (§5).
--
-- `immutable` : elle ne lit ni la date, ni la base — elle ne dépend que de ses arguments.
-- =====================================================================================

create or replace function f_ebios_pertinence(
    p_motivation smallint,
    p_ressources smallint,
    p_activite   smallint
)
returns smallint
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        -- ⚠️ Un seul critère absent suffit à taire la suggestion. Voir l'en-tête : une
        -- pertinence calculée sur deux critères sur trois aurait l'air mesurée sans l'être.
        when p_motivation is null or p_ressources is null or p_activite is null then null
        else round((p_motivation + p_ressources + p_activite)::numeric / 3)::smallint
    end;
$$;

comment on function f_ebios_pertinence(smallint, smallint, smallint) is
    'Pertinence SUGGÉRÉE d''un couple source de risque / objectif visé (atelier 2) : la '
    'moyenne arrondie des trois critères d''EBIOS RM — motivation, ressources, activité. '
    '⚠️ DEUX propriétés, et chacune a un motif : (1) elle rend « null » dès qu''un critère '
    'manque — pas d''estimation par défaut, motif du critère 25.4 ; (2) elle ne DÉCIDE '
    'rien — retenir un couple engage les ateliers 3 et 4, et c''est « retenue », saisie '
    'par un humain et justifiée, qui le fait. Le produit propose, un humain décide.';

grant execute on function f_ebios_pertinence(smallint, smallint, smallint) to grc_app;
grant execute on function f_ebios_pertinence(smallint, smallint, smallint) to grc_lecture;

-- =====================================================================================
-- §7 — LE DOMAINE « type_entite » ADMET LES CINQ TABLES
-- -------------------------------------------------------------------------------------
-- ⚠️ Sans cela les cinq tables sont **INCRÉABLES** : toute création écrit au journal, et
-- `journal_audit.entite_type` porte ce domaine. Le refus arrive en
-- `400 « Une valeur de l'enregistrement n'est pas admise »`, qui ne désigne rien
-- (`CONVENTIONS.md` §40.1 — et le piège a été retendu à chaque lot depuis la `013`).
--
-- On ne recopie PAS la liste : on **lit le prédicat appliqué**, on insère les valeurs
-- neuves à côté de celle qui leur sert de modèle, et **on refuse d'agir si le texte a
-- changé** plutôt que d'appliquer de travers (motif du §4 de la `027`).
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := '''campagne_filiales''';
    v_ajouts   constant text := '''campagne_filiales'', ''ebios_connaissances'', '
                                '''ebios_etudes'', ''ebios_valeurs_metier'', '
                                '''ebios_evenements_redoutes'', ''ebios_sources_risque''';
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable : la 001 n''a pas été appliquée, '
                        'et cette migration n''a rien à étendre.';
    end if;
    if position('''ebios_etudes''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà les tables EBIOS : rejeu, rien à faire.';
        return;
    end if;
    -- Le modèle : la dernière valeur ajoutée par la `044`. Son absence signifie que le
    -- texte a changé depuis, et l'insertion à l'aveugle est refusée.
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « campagne_filiales » est introuvable dans le prédicat '
                        'appliqué de type_entite_check : son texte a changé, et la '
                        'substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais les cinq tables EBIOS RM.';
end;
$$;

-- =====================================================================================
-- §8 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Quatre tables purement locales (`filiale_id not null`) suivent le patron des
-- dérogations. `ebios_connaissances`, MIXTE, suit celui de `risque_catalogue` : le socle
-- du Groupe est lisible de toutes les filiales et écrit par la seule administration
-- Groupe ; un ajout local est lu et écrit par sa filiale seule.
-- =====================================================================================

alter table ebios_connaissances       enable row level security;
alter table ebios_connaissances       force  row level security;
alter table ebios_etudes              enable row level security;
alter table ebios_etudes              force  row level security;
alter table ebios_valeurs_metier      enable row level security;
alter table ebios_valeurs_metier      force  row level security;
alter table ebios_evenements_redoutes enable row level security;
alter table ebios_evenements_redoutes force  row level security;
alter table ebios_sources_risque      enable row level security;
alter table ebios_sources_risque      force  row level security;

-- ── La base de connaissances : MIXTE, calque exact de risque_catalogue ─────────────
drop policy if exists pol_ebios_connaissances_lecture     on ebios_connaissances;
drop policy if exists pol_ebios_connaissances_ajout       on ebios_connaissances;
drop policy if exists pol_ebios_connaissances_maj         on ebios_connaissances;
drop policy if exists pol_ebios_connaissances_suppression on ebios_connaissances;

create policy pol_ebios_connaissances_lecture on ebios_connaissances for select using (
    case when filiale_id is null then true
         else filiale_id = any (f_filiales_lecture()) end);
create policy pol_ebios_connaissances_ajout on ebios_connaissances for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);
create policy pol_ebios_connaissances_maj on ebios_connaissances for update
    using (case when filiale_id is null then f_administration_groupe()
                else filiale_id = f_filiale_ecriture() end)
    with check (case when filiale_id is null then f_administration_groupe()
                     else filiale_id = f_filiale_ecriture() end);
create policy pol_ebios_connaissances_suppression on ebios_connaissances for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);

comment on policy pol_ebios_connaissances_lecture on ebios_connaissances is
    'Le socle du Groupe (filiale_id nul) est lisible de TOUTES les filiales : c''est '
    'l''objet même d''une base de connaissances partagée. Un ajout LOCAL ne l''est que de '
    'sa filiale — ce qui est aussi la barrière qui rend inoffensive la clé simple de '
    'ebios_sources_risque.connaissance_id (§5).';

-- ── Les quatre tables d'étude : purement locales ───────────────────────────────────
do $$
declare
    v_table text;
begin
    foreach v_table in array array['ebios_etudes', 'ebios_valeurs_metier',
                                   'ebios_evenements_redoutes', 'ebios_sources_risque']
    loop
        execute format('drop policy if exists pol_%s_lecture on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_ajout on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_maj on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_suppression on %I', v_table, v_table);

        execute format(
            'create policy pol_%s_lecture on %I for select using '
            '(filiale_id = any (f_filiales_lecture()))', v_table, v_table);
        execute format(
            'create policy pol_%s_ajout on %I for insert with check '
            '(filiale_id = f_filiale_ecriture())', v_table, v_table);
        execute format(
            'create policy pol_%s_maj on %I for update using '
            '(filiale_id = f_filiale_ecriture()) with check '
            '(filiale_id = f_filiale_ecriture())', v_table, v_table);
        execute format(
            'create policy pol_%s_suppression on %I for delete using '
            '(filiale_id = f_filiale_ecriture())', v_table, v_table);
    end loop;
end;
$$;

grant select, insert, update, delete on ebios_connaissances       to grc_app;
grant select, insert, update, delete on ebios_etudes              to grc_app;
grant select, insert, update, delete on ebios_valeurs_metier      to grc_app;
grant select, insert, update, delete on ebios_evenements_redoutes to grc_app;
grant select, insert, update, delete on ebios_sources_risque      to grc_app;
grant select on ebios_connaissances       to grc_lecture;
grant select on ebios_etudes              to grc_lecture;
grant select on ebios_valeurs_metier      to grc_lecture;
grant select on ebios_evenements_redoutes to grc_lecture;
grant select on ebios_sources_risque      to grc_lecture;

select f_armer_declencheurs();

-- ⚠️ **LA POSE VIENT ICI, ET PAS PLUS HAUT — L'ORDRE EST UNE CONTRAINTE, PAS UN STYLE.**
-- `f_poser_declencheurs_pieces()` découvre les tables porteuses par un prédicat dont
-- l'une des trois conditions est *« la politique de SUPPRESSION de la table est
-- cloisonnée »*. Appelée avant le §8, elle ne verrait pas les cinq tables neuves : elle
-- équiperait toutes les autres, rendrait un compte plausible, et **les laisserait démunies
-- sans une erreur** (`CONVENTIONS.md` §40.2). Sans elle, supprimer une étude laisserait
-- ses pièces jointes en base, sur le disque et dans le quota — constats Q-232 / Q-233.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §9 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ Il **ÉPROUVE** au lieu de lire un texte (`CONVENTIONS.md` §39.1), et il nomme ses
-- pièces UNE PAR UNE — un garde de CLASSE ne voit pas la disparition d'une PAIRE
-- (§39.7, constat Q-313).
--
-- Son contrôle le plus important n'est pas sur les tables neuves : c'est le **4**, qui
-- mesure que la cotation F × G × M héritée est intacte. C'est le critère d'acceptation de
-- l'action 25.1, rendu mécanique — *une réserve écrite n'est pas une réserve traitée*.
-- =====================================================================================

create or replace function f_verifier_ebios_cadrage()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les cas témoins de la dérivation. Le troisième et le quatrième sont ceux qui
    -- comptent : ils tiennent le « pas d'estimation par défaut ».
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('m', 4, 'r', 4, 'a', 4, 'attendu', 4,
            'effet', 'la pertinence d''un couple maximal cesserait d''être maximale, et '
                     'l''atelier 2 classerait les couples à l''envers'),
        jsonb_build_object('m', 1, 'r', 1, 'a', 1, 'attendu', 1,
            'effet', 'la pertinence d''un couple minimal cesserait d''être minimale'),
        jsonb_build_object('m', 4, 'r', 1, 'a', 1, 'attendu', 2,
            'effet', 'la moyenne des trois critères ne serait plus la moyenne : un '
                     'attaquant très motivé mais sans moyens passerait devant un attaquant '
                     'outillé et actif'),
        jsonb_build_object('m', null, 'r', 4, 'a', 4, 'attendu', null,
            'effet', 'LE PRODUIT INVENTERAIT UNE PERTINENCE À PARTIR DE DEUX CRITÈRES SUR '
                     'TROIS. C''est le défaut que le critère 25.4 nomme : un chiffre qui a '
                     'l''air mesuré sans l''être est pire que pas de chiffre, parce qu''il '
                     'est cité en comité de direction'),
        jsonb_build_object('m', 4, 'r', null, 'a', 4, 'attendu', null,
            'effet', 'idem : un critère absent doit taire la suggestion, quel qu''il soit'),
        jsonb_build_object('m', 4, 'r', 4, 'a', null, 'attendu', null,
            'effet', 'idem : un critère absent doit taire la suggestion, quel qu''il soit')
    );
    v_cas_un jsonb;
    v_rendu  smallint;
    v_attendu smallint;

    -- Les pièces nommées des §1 à §5. ⚠️ UNE PAR UNE : la disparition d'une PAIRE (une
    -- clé composite, une contrainte liée à un genre) ne se voit pas d'un garde de classe.
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('t','ebios_valeurs_metier','n','fk_ebios_valeurs_metier_etude',
            'e','le rattachement d''une valeur métier à son étude n''est plus cloisonné : '
                'une ligne INVISIBLE de la filiale voisine satisfait la clé (§17.1), et '
                'l''on rattache son travail à une étude qu''on ne voit pas'),
        jsonb_build_object('t','ebios_valeurs_metier','n','fk_ebios_valeurs_metier_processus',
            'e','le lien vers le processus du BIA n''est plus cloisonné : une valeur '
                'métier pointerait un processus INVISIBLE d''une autre filiale, et '
                'l''écran afficherait sa criticité — une fuite entre filiales'),
        jsonb_build_object('t','ebios_valeurs_metier','n','ck_ebios_valeurs_metier_lien',
            'e','une valeur métier de nature « information » pourrait désigner un '
                'processus : la nature cesserait de vouloir dire quoi que ce soit'),
        jsonb_build_object('t','ebios_evenements_redoutes','n','fk_ebios_evenements_redoutes_valeur',
            'e','un événement redouté peut se rattacher à une valeur métier INVISIBLE de '
                'la filiale voisine'),
        jsonb_build_object('t','ebios_evenements_redoutes','n','ck_ebios_evenements_redoutes_besoin',
            'e','le besoin de sécurité n''est plus au vocabulaire DICP : les événements '
                'redoutés ne se regroupent plus, et l''atelier 1 perd sa synthèse'),
        jsonb_build_object('t','ebios_sources_risque','n','fk_ebios_sources_risque_etude',
            'e','un couple source/objectif peut se rattacher à une étude INVISIBLE de la '
                'filiale voisine'),
        jsonb_build_object('t','ebios_sources_risque','n','ck_ebios_sources_risque_retenue',
            'e','UN COUPLE PEUT ÊTRE RETENU SANS JUSTIFICATION. Les ateliers 3 et 4 ne '
                'travaillent que sur les couples retenus : la décision qui engage toute la '
                'suite de l''étude deviendrait intraçable, et c''est la pièce qu''un '
                'auditeur demande en premier'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_genre',
            'e','le genre d''une entrée de la base de connaissances n''est plus fermé : '
                'l''atelier 2 se verrait proposer des modes opératoires et l''atelier 4 '
                'des sources de risque'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_phase',
            'e','un mode opératoire pourrait porter une phase hors du vocabulaire de '
                'l''atelier 4, et l''écran ne saurait plus les regrouper'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_phase_genre',
            'e','une SOURCE DE RISQUE pourrait porter une phase : « genre » ne serait '
                'plus qu''une étiquette, et l''atelier 2 se verrait proposer des modes '
                'opératoires'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_objectif',
            'e','un objectif visé vide devient possible — or c''est la moitié du couple '
                'que l''atelier 2 instancie'),
        jsonb_build_object('t','ebios_connaissances','n','ck_ebios_connaissances_objectif_genre',
            'e','un MODE OPÉRATOIRE pourrait porter un objectif visé : même effet que '
                'ci-dessus, dans l''autre sens'),
        jsonb_build_object('t','processus','n','uq_processus_id_filiale',
            'e','la cible de la clé composite vers « processus » disparaît — et avec elle '
                'la seule chose qui empêche une clé SIMPLE d''être satisfaite par un '
                'processus invisible de la filiale voisine')
    );
    v_piece jsonb;

    -- ⚠️ LES CINQ COLONNES DE LA COTATION HÉRITÉE. C'est le critère 25.1, rendu mécanique.
    v_cotation constant text[] := array['f_frequence', 'g_gravite', 'm_maitrise',
                                        'score_brut', 'score_residuel'];
    v_colonne text;
    -- Les cinq tables du lot, nommées UNE PAR UNE pour le contrôle du domaine (§5) :
    -- une table absente de `type_entite` est INCRÉABLE, et le refus qui remonte à
    -- l'utilisateur ne désigne rien (`CONVENTIONS.md` §40.1).
    v_table   text;
begin
    -- ── 1. La dérivation existe-t-elle seulement ? ──────────────────────────────────
    if to_regprocedure('public.f_ebios_pertinence(smallint, smallint, smallint)') is null then
        objet    := 'f_ebios_pertinence';
        anomalie := 'derivation_pertinence_absente';
        detail   := 'La fonction qui suggère la pertinence d''un couple source/objectif a '
                    'disparu. L''atelier 2 n''a plus d''aide au classement — et, pire, un '
                    'appelant pourrait en réécrire une seconde ailleurs, qui divergerait.';
        return next;
        return;
    end if;

    -- ── 2. LA DÉRIVATION EST ÉPROUVÉE, pas lue (§39.1) ─────────────────────────────
    for v_cas_un in select * from jsonb_array_elements(v_cas) loop
        v_attendu := (v_cas_un ->> 'attendu')::smallint;
        v_rendu   := f_ebios_pertinence((v_cas_un ->> 'm')::smallint,
                                        (v_cas_un ->> 'r')::smallint,
                                        (v_cas_un ->> 'a')::smallint);
        if v_rendu is distinct from v_attendu then
            objet    := 'f_ebios_pertinence';
            anomalie := 'derivation_pertinence_fausse';
            detail   := format(
                'Motivation « %s », ressources « %s », activité « %s » : la fonction rend '
                '« %s » au lieu de « %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE '
                'la dérivation sur des valeurs témoins — il ne lit pas le texte de la '
                'fonction (§39.1).',
                coalesce(v_cas_un ->> 'm', '(null)'),
                coalesce(v_cas_un ->> 'r', '(null)'),
                coalesce(v_cas_un ->> 'a', '(null)'),
                coalesce(v_rendu::text, '(null)'),
                coalesce(v_attendu::text, '(null)'),
                v_cas_un ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 3. Les pièces nommées ───────────────────────────────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.' || (v_piece ->> 't'))
               and c.conname = v_piece ->> 'n'
               -- ⚠️ `convalidated` : une contrainte reposée « not valid » garde son
               -- prédicat et n'a JAMAIS vérifié les lignes déjà en base — constat Q-319.
               and c.convalidated)
        then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'ebios_piece_manquante';
            detail   := format(
                'Cette pièce des ateliers EBIOS RM a disparu ou n''est pas validée. Ce que '
                'sa disparition rouvre : %s.', v_piece ->> 'e');
            return next;
        end if;
    end loop;

    -- ── 4. ⚠️ LA COTATION HÉRITÉE EST INTACTE — le critère 25.1, rendu mécanique ────
    --
    -- *« Les risques cotés en F × G × M restent valides et lisibles. Une migration qui les
    -- réinterpréterait réattribuerait EN SILENCE des cotations produites en audit. »*
    -- Ce contrôle est ici parce qu'une phrase dans un plan ne retient personne : c'est le
    -- motif du constat Q-192, et celui de toute la §39 du CONVENTIONS.md.
    foreach v_colonne in array v_cotation loop
        if not exists (
            select 1 from pg_attribute a
             where a.attrelid = to_regclass('public.risques')
               and a.attname = v_colonne and a.attnum > 0 and not a.attisdropped)
        then
            objet    := 'risques.' || v_colonne;
            anomalie := 'cotation_heritee_perdue';
            detail   := format(
                'La colonne « %s » de la cotation F × G × M a disparu de « risques ». '
                'L''action 25.1 se fait EN ADDITION, jamais en remplacement : les risques '
                'déjà cotés ont été produits en audit, et les réinterpréter les '
                'réattribuerait EN SILENCE. C''est le motif qui a fait refuser la '
                'renumérotation du catalogue ANSSI (constat Q-192).', v_colonne);
            return next;
        end if;
    end loop;

    -- ── 4 bis. ⚠️ LE « set null » NE NULLIFIE QUE `processus_id` ───────────────────
    --
    -- Sans sa liste de colonnes, PostgreSQL met à NULL **toutes** les colonnes de la
    -- clé — `filiale_id` comprise, qui est `not null`. Supprimer un processus RÉFÉRENCÉ
    -- échoue alors en 23502, et la purge de `POST /api/reprise` en mode « remplacer »
    -- avec elle : **toute restauration de sauvegarde tombe**.
    --
    -- Le garde MESURE la liste dans le catalogue (`confdelsetcols`) au lieu de se fier au
    -- texte de la migration : c'est la règle du §39.1, et c'est aussi la seule façon de
    -- voir qu'une migration ultérieure a reposé la clé sans elle.
    if exists (
        select 1
          from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'processus_id'
                             and a.attnum > 0 and not a.attisdropped
         where c.conrelid = to_regclass('public.ebios_valeurs_metier')
           and c.conname = 'fk_ebios_valeurs_metier_processus'
           and c.confdeltype = 'n'
           and c.confdelsetcols is distinct from array[a.attnum])
    then
        objet    := 'ebios_valeurs_metier.fk_ebios_valeurs_metier_processus';
        anomalie := 'ebios_set_null_trop_large';
        detail   := 'Le « on delete set null » de cette clé ne se limite pas à '
                    '« processus_id ». PostgreSQL met alors à NULL toutes les colonnes de '
                    'la clé, « filiale_id » comprise — et elle est « not null ». '
                    'Supprimer un processus RÉFÉRENCÉ échoue en 23502, la purge de '
                    '« remplacer » avec lui, et TOUTE RESTAURATION DE SAUVEGARDE TOMBE. '
                    'Le message remis à l''utilisateur parle alors d''un champ '
                    '« filiale_id » obligatoire sur une opération qui n''écrit rien de tel.';
        return next;
    end if;

    -- ── 5. LES CINQ TABLES SONT DÉSIGNABLES PAR « type_entite » ────────────────────
    --
    -- Sans cela elles sont INCRÉABLES : toute création écrit au journal, et
    -- `journal_audit.entite_type` porte ce domaine (`CONVENTIONS.md` §40.1). Le refus
    -- arrive à l'utilisateur en `400 « Une valeur de l'enregistrement n'est pas admise »`,
    -- qui ne désigne rien.
    --
    -- ⚠️ **Le contrôle est ici et pas seulement au banc**, alors que
    -- `test/base/vocabulaire.test.mjs` confronte déjà ce domaine au registre applicatif :
    -- le banc ne tourne pas sur la machine du client, et `f_verifier_schema()` si. Un
    -- domaine amputé par une migration future doit refuser le DÉPLOIEMENT, pas attendre
    -- qu'un développeur rejoue le banc.
    foreach v_table in array array['ebios_connaissances', 'ebios_etudes',
                                   'ebios_valeurs_metier', 'ebios_evenements_redoutes',
                                   'ebios_sources_risque']
    loop
        begin
            -- ⚠️ On ÉPROUVE le domaine — on ne lit pas le texte de son prédicat (§39.1).
            -- Un garde qui chercherait la sous-chaîne passerait au vert sur un prédicat
            -- devenu « … or true », qui admet tout et ne garantit rien (constat Q-312).
            perform v_table::type_entite;
        exception when others then
            objet    := v_table;
            anomalie := 'ebios_entite_non_designable';
            detail   := format(
                'Le domaine « type_entite » n''admet pas « %s » : la table est INCRÉABLE, '
                'parce que toute création écrit au journal et que journal_audit.entite_type '
                'porte ce domaine. Le refus arrive à l''utilisateur en 400 « Une valeur de '
                'l''enregistrement n''est pas admise », qui ne désigne rien '
                '(CONVENTIONS.md §40.1).', v_table);
            return next;
        end;
    end loop;

    -- ── 6. ⚠️ AUCUNE TABLE EBIOS N'ÉCRIT DANS « risques » ──────────────────────────
    --
    -- Mesuré dans le CATALOGUE, pas dans une liste : tout déclencheur posé sur une table
    -- EBIOS est examiné, et l'on refuse celui dont la fonction touche à `risques`. Sans
    -- ce contrôle, « en addition » tiendrait à la seule bonne volonté du prochain — et la
    -- forme du défaut serait la pire qui soit : *quelque chose réussit en silence alors
    -- que c'est faux*. Motif du §5 de la `035`.
    for v_table in
        select c.relname::text
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         where c.relname like 'ebios\_%'
           and exists (
                 select 1 from pg_trigger t
                   join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = c.oid and not t.tgisinternal
                    and p.prosrc ~* '\m(update|insert\s+into|delete\s+from)\s+risques\M')
         order by 1
    loop
        objet    := v_table;
        anomalie := 'ebios_ecrit_dans_risques';
        detail   := 'Un déclencheur de cette table EBIOS écrit dans « risques ». C''est '
                    'exactement ce que le critère 25.1 refuse : les cotations F × G × M '
                    'ont été produites en audit, et un traitement qui les réinterprète les '
                    'réattribue EN SILENCE. Les deux méthodes cohabitent sans se parler ; '
                    'le lien entre un scénario opérationnel et un risque coté est un LIEN, '
                    'pas une conversion.';
        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_ebios_cadrage() is
    'Garde-fou des ateliers 1 et 2 d''EBIOS RM (actions 25.1, 25.2, 25.5) : la dérivation '
    'de la pertinence est ÉPROUVÉE sur six cas témoins dont trois tiennent le « pas '
    'd''estimation par défaut » (§39.1), les onze pièces du schéma sont nommées UNE PAR '
    'UNE (§39.7), et — surtout — la cotation F × G × M héritée est mesurée INTACTE, '
    'colonne par colonne, et aucun déclencheur EBIOS n''écrit dans « risques ». Ce dernier '
    'contrôle EST le critère d''acceptation de l''action 25.1, rendu mécanique : une '
    'phrase dans un plan ne retient personne. Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §10 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('046', 'EBIOS RM, ateliers 1 et 2 : le cadrage d''une étude, les valeurs métier '
               'qui POINTENT le BIA, les événements redoutés, les couples source de '
               'risque / objectif visé, et la base de connaissances du Groupe. ⚠️ EN '
               'ADDITION : la cotation F × G × M héritée n''est ni touchée ni '
               'réinterprétée, et un garde-fou le mesure')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_ebios_cadrage();
--   delete from controles_schema where fonction = 'f_verifier_ebios_cadrage';
--   drop table if exists ebios_sources_risque;
--   drop table if exists ebios_evenements_redoutes;
--   drop table if exists ebios_valeurs_metier;
--   drop table if exists ebios_etudes;
--   drop table if exists ebios_connaissances;
--   drop function if exists f_ebios_pertinence(smallint, smallint, smallint);
--   delete from colonnes_personnelles where table_nom like 'ebios\_%';
--   alter table processus drop constraint if exists uq_processus_id_filiale;
--   delete from migrations_schema where version = '046';
--   commit;
--   ⚠️ Annuler DÉTRUIT les analyses de risque conduites selon la méthode EBIOS RM —
--     valeurs métier, événements redoutés, couples retenus et leurs justifications.
--     Exportez avant. La cotation F × G × M, elle, n'est pas touchée : c'est tout
--     l'objet du « EN ADDITION ».
-- =====================================================================================
