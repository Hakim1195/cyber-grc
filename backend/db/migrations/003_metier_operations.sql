-- =====================================================================================
-- 003_metier_operations.sql — Entités métier d'opérations de Cyber GRC Groupe
-- =====================================================================================
-- Lot L1 (schéma relationnel), partie 3/4 : ce qui se pilote au quotidien — le plan
-- d'actions, les incidents, la crise, la continuité, les tiers, les audits, la
-- documentation, le registre RGPD, les correspondances et l'historique.
--
-- Référence de cadrage : docs/PLAN_SERVEUR.md §2 (schéma de données) et §2.2 (découpage
-- Groupe / Filiale / Mixte). Modèle applicatif d'origine : docs/DATA_MODEL.md §2 à §4.
-- Conventions applicables : backend/db/CONVENTIONS.md — en particulier §16 (décisions
-- figées du lot L1), dont le §16.1 fixe le contenu exact de ce fichier.
--
-- Dépendances : 001_socle.sql (domaines, fonctions, filiales) puis 002_metier_noyau.sql
-- (clients, personnes, exigences, mesure_catalogue, mesure_mise_en_oeuvre, evaluations,
-- risques, actifs, processus). Le graphe des clés étrangères est acyclique dans cet
-- ordre : rien ici n'est référencé par 002.
--
-- Contenu :
--   §0  Gardes (version PostgreSQL, présence de 002)
--   §1  incidents (+ incident_actifs) ............ registre des incidents (NIS2 / RGPD)
--   §2  actions .................................. plan d'actions, cinq rattachements
--   §3  crise .................................... annuaire de la cellule de crise
--   §4  scenarios_pra ............................ scénarios PCA/PRA (fiches réflexes)
--   §5  tests_pra ................................ exercices, cascade depuis le scénario
--   §6  mco_actions .............................. actions préalables, modèle v10
--   §7  prestataires ............................. tiers et chaîne d'approvisionnement
--   §8  audits ................................... audits internes ISO 27001 §9.2
--   §9  revues ................................... revues de direction ISO 27001 §9.3
--   §10 documents (+ document_referentiels) ...... politiques et procédures (MIXTE)
--   §11 traitements (+ traitement_mesures) ....... registre RGPD article 30
--   §12 mappings (+ mapping_exigences) ........... correspondances (niveau GROUPE)
--   §13 history .................................. relevés d'indicateurs datés
--   §14 Enregistrement de la migration
--
-- Quatre règles transversales, appliquées partout dans ce fichier :
--
--   1. NIVEAU DE CLOISONNEMENT (CONVENTIONS §4 et §16.4) — « mappings » est de niveau
--      Groupe (aucun filiale_id), « documents » est mixte (filiale_id nullable, null =
--      politique Groupe), TOUTES les autres tables sont de niveau filiale, « history »
--      comprise : l'agrégat Groupe est CALCULÉ, jamais stocké — sinon il faudrait le
--      recalculer à chaque entrée ou sortie de filiale, et il divergerait.
--
--   2. UNE CHAÎNE VIDE N'EST PAS UNE VALEUR — le frontend écrit volontiers "" pour un
--      champ non renseigné. Le service applicatif normalise "" en null AVANT écriture :
--      le domaine id_metier l'impose déjà pour les identifiants, et les contraintes de
--      validation ci-dessous acceptent null mais jamais une chaîne vide. Sans cette
--      normalisation, deux représentations du « non renseigné » coexisteraient.
--
--   3. VALEURS DES « check » — CONVENTIONS §5 impose les chaînes françaises exactes du
--      modèle applicatif, accents et espaces compris. Là où DATA_MODEL.md abrège la liste
--      en prose (« hameçonnage, rançongiciel, intrusion… »), la source retenue est le
--      module qui écrit réellement la donnée (js/modules/*.js) : reprendre la prose du
--      DATA_MODEL rejetterait les données existantes. Une liste se fait évoluer par
--      « alter table … drop constraint / add constraint », sans verrou exclusif — c'est
--      exactement pourquoi le §5 refuse les types « enum ».
--
--   4. CLÉS ÉTRANGÈRES COMPOSITES ENTRE TABLES CLOISONNÉES (CONVENTIONS §17.1) — quand
--      l'enfant et le parent portent tous deux un « filiale_id » non nul, la clé porte
--      « (colonne_reference, filiale_id) » et vise « uq_<parent>_id_filiale ». Les
--      contrôles d'intégrité référentielle de PostgreSQL contournent délibérément la Row
--      Level Security : une clé SIMPLE est satisfaite par une ligne d'une autre filiale,
--      invisible — et la suppression de cette ligne, chez elle, détruit ou modifie les
--      nôtres, en y inscrivant l'identité de son auteur. Six des sept clés du constat B-1
--      de la porte de sécurité S1 sont dans ce fichier : les quatre rattachements
--      d'« actions », « incidents.risque_id » et « tests_pra.scenario_id ». L'encadré
--      complet est en tête de 002_metier_noyau.sql.
--
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 003_metier_operations.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — GARDES
-- =====================================================================================

do $$
begin
    if current_setting('server_version_num')::integer < 150000 then
        raise exception
            'PostgreSQL 15 minimum requis, version trouvée : %. Voir backend/db/CONVENTIONS.md §1.',
            current_setting('server_version');
    end if;
end;
$$;

-- Les clés étrangères de ce fichier pointent vers cinq tables créées par 002. Sans ce
-- garde, l'échec serait un « relation … does not exist » sans indication de la marche à
-- suivre. Le contrôle porte sur les tables elles-mêmes, pas sur le registre des
-- migrations : c'est ce dont les contraintes ont besoin.
do $$
declare
    v_manquantes text;
begin
    select string_agg(t, ', ' order by t)
      into v_manquantes
      from unnest(array['exigences', 'risques', 'evaluations', 'actifs', 'mesure_catalogue']) as t
     where to_regclass('public.' || t) is null;

    if v_manquantes is not null then
        raise exception
            'Migration 002_metier_noyau.sql non appliquée : table(s) manquante(s) : %.', v_manquantes
            using hint = 'Ordre imposé : 001_socle.sql, 002_metier_noyau.sql, puis ce fichier. '
                         'Voir backend/db/CONVENTIONS.md §16.1.';
    end if;
end;
$$;

-- Les privilèges de « grc_app » et « grc_lecture » sont posés une fois pour toutes en
-- « alter default privileges » par 001_socle.sql §0 : les tables créées ci-dessous en
-- héritent automatiquement, à condition d'être créées par le même rôle propriétaire.
-- Aucun « grant » n'est donc répété ici (CONVENTIONS.md §14).

-- =====================================================================================
-- §1 — INCIDENTS DE SÉCURITÉ (niveau filiale)
-- -------------------------------------------------------------------------------------
-- Placés AVANT « actions » : le plan d'actions référence les incidents (actions
-- correctives), l'inverse n'est pas vrai. C'est la seule raison pour laquelle l'ordre
-- de ce fichier s'écarte de l'énumération du CONVENTIONS.md §16.1.
-- =====================================================================================

create table incidents (
    id                 id_metier   not null,
    filiale_id         id_metier   not null,
    titre              text        not null,
    type               text,
    gravite            text        not null default 'moyenne',
    statut             text        not null default 'nouveau',
    date_detection     date,
    date_resolution    date,
    description        text,
    actions_immediates text,
    cause_racine       text,
    risque_id          id_metier,
    declaration_anssi  text        not null default 'non requise',
    declaration_cnil   text        not null default 'non requise',
    version            integer     not null default 1,
    cree_le            timestamptz not null default now(),
    cree_par           text        not null default f_utilisateur_courant(),
    modifie_le         timestamptz,
    modifie_par        text,
    constraint pk_incidents         primary key (id),
    -- Cible des clés étrangères composites venues d'actions (CONVENTIONS.md §17.1).
    constraint uq_incidents_id_filiale unique (id, filiale_id),
    constraint fk_incidents_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    -- « délie » et non « supprime » : un incident survit au scénario de risque qu'il a
    -- matérialisé (CONVENTIONS.md §8, ligne deleteRisque).
    --
    -- Clé étrangère COMPOSITE (CONVENTIONS.md §17.1) : le couple (risque, filiale) doit
    -- exister tel quel dans risques. En clé simple, un incident d'ici pouvait pointer un
    -- risque d'une autre filiale — et la suppression de ce risque, chez elle, remettait
    -- risque_id à null ICI, en inscrivant l'identité de son auteur dans modifie_par et en
    -- incrémentant la version de notre ligne. Reproduit à la porte S1 (constat B-1).
    --
    -- « set null (risque_id) » et non « set null » tout court : la forme sans liste
    -- remettrait à null TOUTES les colonnes de la clé, filiale_id comprise, qui est « not
    -- null » — la suppression du risque échouerait alors sur la contrainte au lieu de
    -- délier. La liste de colonnes est disponible depuis PostgreSQL 15, minimum exigé par
    -- le §0 de cette migration.
    constraint fk_incidents_risque  foreign key (risque_id, filiale_id)
        references risques (id, filiale_id) on delete set null (risque_id),
    constraint ck_incidents_titre   check (titre <> ''),
    constraint ck_incidents_type    check (type is null or type in (
        'Hameçonnage', 'Rançongiciel', 'Intrusion / compromission', 'Fuite de données',
        'Déni de service (DoS)', 'Perte / vol de matériel', 'Erreur / mauvaise manipulation',
        'Malveillance interne', 'Autre')),
    constraint ck_incidents_gravite check (gravite in ('faible', 'moyenne', 'élevée', 'critique')),
    constraint ck_incidents_statut  check (statut in ('nouveau', 'en cours', 'résolu', 'clôturé')),
    constraint ck_incidents_declaration_anssi check (
        declaration_anssi in ('non requise', 'à déclarer', 'déclarée')),
    constraint ck_incidents_declaration_cnil  check (
        declaration_cnil  in ('non requise', 'à déclarer', 'déclarée')),
    constraint ck_incidents_dates   check (
        date_resolution is null or date_detection is null or date_resolution >= date_detection)
);

create index ix_incidents_filiale on incidents (filiale_id, date_detection desc);
create index ix_incidents_filiale_statut on incidents (filiale_id, statut);
create index ix_incidents_risque  on incidents (risque_id) where risque_id is not null;

create trigger trg_incidents_maj before update on incidents
    for each row execute function f_maj_tracabilite();

comment on table incidents is
    'Registre des incidents de sécurité (identifiants "INC-…"). Sert de preuve de diligence et '
    'de support aux obligations de déclaration : alerte précoce NIS2 sous 24 h, notification '
    'sous 72 h, violation de données personnelles RGPD sous 72 h. Contient des données à '
    'caractère personnel : relève de la purge RGPD (PLAN_SERVEUR §2.7).';
comment on column incidents.type is
    'Typologie de l''incident. Liste close des valeurs écrites par le module Incidents ; '
    'DATA_MODEL.md §2 l''abrège en prose, ce sont bien ces chaînes-ci qui sont stockées.';
comment on column incidents.risque_id is
    'Scénario de risque EBIOS qui se matérialise. "on delete set null" : supprimer le risque '
    'délie l''incident, il ne le supprime pas (CONVENTIONS.md §8).';
comment on column incidents.declaration_anssi is
    'Suivi de l''obligation de déclaration NIS2. La date d''échéance (détection + 72 h) est '
    'DÉRIVÉE, jamais stockée : elle est recalculée par le service des échéances.';
comment on column incidents.declaration_cnil is
    'Suivi de l''obligation de notification RGPD (72 h). Même règle de dérivation.';

-- ---------------------------------------------------------------------------------
-- Actifs touchés : ancien tableau de chaînes « incidents.actifs_touches[] ».
-- Pas de filiale_id : les deux extrémités sont déjà cloisonnées, la RLS s'applique
-- par jointure (CONVENTIONS.md §7 et §16.5).
-- ---------------------------------------------------------------------------------
create table incident_actifs (
    incident_id id_metier   not null,
    actif_id    id_metier   not null,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    constraint pk_incident_actifs primary key (incident_id, actif_id),
    constraint fk_incident_actifs_incident foreign key (incident_id)
        references incidents(id) on delete cascade,
    constraint fk_incident_actifs_actif    foreign key (actif_id)
        references actifs(id)    on delete cascade
);

create index ix_incident_actifs_actif on incident_actifs (actif_id);

comment on table incident_actifs is
    'Actifs touchés par un incident (n-n). "on delete cascade" des deux côtés : supprimer '
    'l''une des extrémités supprime le lien, jamais l''autre extrémité — c''est exactement '
    'le comportement "délier" attendu de deleteActif (CONVENTIONS.md §8). Table de liaison : '
    'ni version, ni filiale_id ; la clé primaire composite garantit le dédoublonnage que le '
    'frontend confiait au code.';

-- =====================================================================================
-- §2 — PLAN D'ACTIONS (niveau filiale)
-- -------------------------------------------------------------------------------------
-- Une action se rattache à L'UN de : exigence, risque, évaluation de référentiel,
-- incident, ou mesure du catalogue. Les quatre premiers rattachements sont en cascade
-- (l'action perd son objet avec son porteur) ; le cinquième DÉLIE (l'action survit à la
-- mesure et reste au plan d'actions). CONVENTIONS.md §8.
-- =====================================================================================

create table actions (
    id            id_metier   not null,
    filiale_id    id_metier   not null,
    titre         text        not null,
    statut        text        not null default 'à faire',
    priorite      text        not null default 'Moyenne',
    responsable   text,
    echeance      date,
    commentaire   text,
    exigence_id   id_metier,
    risque_id     id_metier,
    evaluation_id id_metier,
    incident_id   id_metier,
    mesure_id     id_metier,
    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,
    constraint pk_actions         primary key (id),
    constraint fk_actions_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    -- Les QUATRE rattachements en cascade sont des clés étrangères COMPOSITES
    -- (CONVENTIONS.md §17.1) : le couple (porteur, filiale) doit exister tel quel. En clé
    -- simple, une action d'ici pouvait se rattacher à une exigence, un risque, une
    -- évaluation ou un incident d'une AUTRE filiale — les contrôles d'intégrité
    -- référentielle ignorant la RLS, la référence était satisfaite par une ligne
    -- invisible. La suppression de ce porteur, chez elle, détruisait alors nos actions.
    -- Quatre des sept clés du constat B-1 de la porte S1.
    --
    -- Rappel de sémantique, utile ici : en « match simple » (le défaut), une clé
    -- composite dont l'une des colonnes est nulle est satisfaite sans contrôle. Une
    -- action sans rattachement — exigence_id nul — passe donc comme avant, ce que la
    -- contrainte ck_actions_rattachement autorise explicitement.
    constraint fk_actions_exigence   foreign key (exigence_id, filiale_id)
        references exigences   (id, filiale_id) on delete cascade,
    constraint fk_actions_risque     foreign key (risque_id, filiale_id)
        references risques     (id, filiale_id) on delete cascade,
    constraint fk_actions_evaluation foreign key (evaluation_id, filiale_id)
        references evaluations (id, filiale_id) on delete cascade,
    constraint fk_actions_incident   foreign key (incident_id, filiale_id)
        references incidents   (id, filiale_id) on delete cascade,
    -- Vise le CATALOGUE, jamais la mise en oeuvre (CONVENTIONS.md §16.3) : l'identifiant
    -- "MESURE-…" est celui qui figure dans les exports grc-backup, ce qui rend la reprise
    -- exacte sans table de correspondance. La mise en oeuvre concernée se déduit du couple
    -- (filiale_id de l'action, mesure_id), unique dans mesure_mise_en_oeuvre.
    --
    -- « restrict » et NON « set null » (CONVENTIONS.md §17.6, amendement du §8). Le §8
    -- disait « conserve les actions (mesure_id -> null) », écrit pour un produit
    -- mono-filiale. Ici, mesure_catalogue est MIXTE : supprimer un contrôle du socle
    -- Groupe remettait à null le mesure_id des actions de VINGT filiales — donc
    -- incrémentait leur « version » (déclencheur f_maj_tracabilite) et inscrivait dans
    -- leurs lignes le « modifie_par » d'un utilisateur qui n'y a jamais travaillé. C'est
    -- la pathologie du constat B-1 : une action de portée Groupe modifie les données d'une
    -- filiale à son insu. Raisonnement complet sur fk_mesure_mise_en_oeuvre_mesure (002 §5).
    --
    -- Le déliage volontaire d'une action reste immédiat et local : « update actions set
    -- mesure_id = null », dans la filiale active, ce que la politique d'écriture autorise.
    constraint fk_actions_mesure     foreign key (mesure_id)
        references mesure_catalogue(id) on delete restrict,
    constraint ck_actions_titre    check (titre <> ''),
    constraint ck_actions_statut   check (statut in ('à faire', 'en cours', 'terminée')),
    constraint ck_actions_priorite check (priorite in ('Basse', 'Moyenne', 'Haute', 'Critique')),
    -- Au plus UN rattachement. « Au plus » et non « exactement un » : une action peut
    -- rester au plan d'actions après avoir été DÉLIÉE de sa mesure (mesure_id remis à null
    -- par la couche applicative, avant que la mesure ne soit retirée du catalogue —
    -- CONVENTIONS.md §17.6), et les reprises de données anciennes contiennent des actions
    -- sans aucun rattachement.
    constraint ck_actions_rattachement check (
        (case when exigence_id   is not null then 1 else 0 end
       + case when risque_id     is not null then 1 else 0 end
       + case when evaluation_id is not null then 1 else 0 end
       + case when incident_id   is not null then 1 else 0 end
       + case when mesure_id     is not null then 1 else 0 end) <= 1)
);

create index ix_actions_filiale    on actions (filiale_id, statut, echeance);
create index ix_actions_exigence   on actions (exigence_id)   where exigence_id   is not null;
create index ix_actions_risque     on actions (risque_id)     where risque_id     is not null;
create index ix_actions_evaluation on actions (evaluation_id) where evaluation_id is not null;
create index ix_actions_incident   on actions (incident_id)   where incident_id   is not null;
create index ix_actions_mesure     on actions (mesure_id)     where mesure_id     is not null;
-- Échéancier : « en retard » est un calcul, jamais une colonne. Cet index le sert.
create index ix_actions_retard on actions (filiale_id, echeance)
    where statut <> 'terminée' and echeance is not null;

create trigger trg_actions_maj before update on actions
    for each row execute function f_maj_tracabilite();

comment on table actions is
    'Plan d''actions (identifiants "ACT-…"). Une action est rattachée à au plus un porteur : '
    'exigence, risque, évaluation de référentiel, incident ou mesure du catalogue. Le retard '
    'est DÉRIVÉ (échéance dépassée et statut différent de "terminée"), jamais stocké.';
comment on column actions.mesure_id is
    'Action portée directement par une mesure de sécurité : elle vaut alors pour toutes les '
    'exigences que cette mesure couvre. Référence le catalogue Groupe, en "on delete restrict" '
    '(CONVENTIONS.md §17.6, amendement du §8) : une mesure encore rattachée à des actions ne '
    'se supprime pas. Délier reste immédiat — "update actions set mesure_id = null" dans la '
    'filiale active — et la couche applicative le fait avant le retrait, dans la même '
    'transaction. Le "set null" automatique a été retiré parce qu''il modifiait les actions de '
    'TOUTES les filiales quand la mesure supprimée appartenait au socle Groupe.';
comment on column actions.filiale_id is
    'Filiale propriétaire de l''action. Rien n''empêche techniquement de viser une mesure '
    'locale d''une AUTRE filiale : cette cohérence relève de la RLS (004) et du service '
    'applicatif, une clé étrangère ne sait pas l''exprimer.';
comment on column actions.echeance is
    'Date d''échéance métier — « date » et non « timestamptz » : une échéance n''a pas d''heure '
    'et ne doit pas glisser d''un jour selon le fuseau du lecteur (CONVENTIONS.md §5).';

-- =====================================================================================
-- §3 — CELLULE DE CRISE (niveau filiale)
-- Annuaire imprimable, conçu pour être lu quand le SI est indisponible.
-- =====================================================================================

create table crise (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    role        text        not null,
    nom         text,
    telephone   text,
    email       text,
    suppleant   text,
    notes       text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_crise         primary key (id),
    constraint fk_crise_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_crise_role    check (role <> '')
);

create index ix_crise_filiale on crise (filiale_id, role);

create trigger trg_crise_maj before update on crise
    for each row execute function f_maj_tracabilite();

comment on table crise is
    'Membres de la cellule de crise (identifiants "CRISE-…"), avec leur rôle, leur suppléant '
    'et leurs coordonnées de secours. Données à caractère personnel : relèvent de la purge '
    'RGPD (PLAN_SERVEUR §2.7).';
comment on column crise.role is
    'Rôle tenu pendant la crise. Volontairement SANS liste close : DATA_MODEL.md ne le déclare '
    'pas comme une énumération, le module propose six rôles dont "Autre", et une filiale '
    'étrangère aura ses propres intitulés. Les fiches réflexes regroupent par cette valeur.';
comment on column crise.nom is
    'Nom saisi en texte, alimenté par autocomplétion depuis l''annuaire "personnes" — SANS clé '
    'étrangère, décision du chantier Personnel : retirer quelqu''un de l''annuaire ne doit pas '
    'vider les fiches où son nom a été saisi (DATA_MODEL.md §2).';

-- =====================================================================================
-- §4 — SCÉNARIOS PCA / PRA (niveau filiale)
-- =====================================================================================

create table scenarios_pra (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    nom         text        not null,
    description text,
    etapes_pca  jsonb       not null default '[]'::jsonb,
    etapes_pra  jsonb       not null default '[]'::jsonb,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_scenarios_pra         primary key (id),
    -- Cible de la clé étrangère composite venue de tests_pra (CONVENTIONS.md §17.1).
    constraint uq_scenarios_pra_id_filiale unique (id, filiale_id),
    constraint fk_scenarios_pra_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_scenarios_pra_nom        check (nom <> ''),
    constraint ck_scenarios_pra_etapes_pca check (jsonb_typeof(etapes_pca) = 'array'),
    constraint ck_scenarios_pra_etapes_pra check (jsonb_typeof(etapes_pra) = 'array')
);

create index ix_scenarios_pra_filiale on scenarios_pra (filiale_id, nom);

create trigger trg_scenarios_pra_maj before update on scenarios_pra
    for each row execute function f_maj_tracabilite();

comment on table scenarios_pra is
    'Scénarios de continuité (PCA) et de reprise (PRA), identifiants "SCEN-…". Supprimer un '
    'scénario supprime ses tests (CONVENTIONS.md §8) : le chantier de rattrapage des tests '
    'orphelins du modèle navigateur n''a plus lieu d''être.';
comment on column scenarios_pra.etapes_pca is
    'Fiche réflexe de continuité : tableau d''étapes {titre, realisateur, responsable, consulte, '
    'informe, actifs, duree, statut}. JSONB assumé et LISTÉ au CONVENTIONS.md §6 — document de '
    'crise lu tel quel, jamais interrogé colonne par colonne.';
comment on column scenarios_pra.etapes_pra is
    'Fiche réflexe de reprise, même structure et même justification que etapes_pca.';

-- =====================================================================================
-- §5 — TESTS PCA / PRA (niveau filiale)
-- =====================================================================================

create table tests_pra (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    scenario_id id_metier   not null,
    date_test   date,
    succes      text,
    type_test   text,
    bilan       text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_tests_pra         primary key (id),
    constraint fk_tests_pra_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    -- LA cascade qui rend le défaut structurellement impossible (PLAN_SERVEUR §2.1) —
    -- rendue COMPOSITE (CONVENTIONS.md §17.1) : le couple (scénario, filiale) doit
    -- exister tel quel. En clé simple, un test d'ici pouvait se rattacher au scénario
    -- d'une autre filiale, et la suppression de ce scénario, chez elle, supprimait notre
    -- test. Septième et dernière clé du constat B-1 de la porte S1.
    constraint fk_tests_pra_scenario foreign key (scenario_id, filiale_id)
        references scenarios_pra (id, filiale_id) on delete cascade,
    constraint ck_tests_pra_succes check (succes is null or succes in ('Oui', 'Non')),
    constraint ck_tests_pra_type   check (type_test is null or type_test in (
        'Théorique (Sur table)', 'Technique (Simulation)', 'Technique (Basculement réel)'))
);

create index ix_tests_pra_filiale  on tests_pra (filiale_id, date_test desc);
create index ix_tests_pra_scenario on tests_pra (scenario_id);

create trigger trg_tests_pra_maj before update on tests_pra
    for each row execute function f_maj_tracabilite();

comment on table tests_pra is
    'Exercices de continuité et de reprise (identifiants "TEST-…"). Preuve d''audit ISO 27001 '
    'et de conformité DORA : un plan non testé ne vaut rien.';
comment on column tests_pra.scenario_id is
    'NON NUL, contrairement au modèle navigateur : un test sans scénario n''a pas d''objet. '
    'C''est la contrepartie de la cascade — le stock d''anciens tests orphelins doit être '
    'réparé ou écarté PAR L''IMPORT (le frontend expose déjà deleteOrphanTests), il ne peut '
    'plus se recréer ensuite.';
comment on column tests_pra.succes is
    '"Oui" / "Non" : valeurs du modèle applicatif conservées telles quelles pour le round-trip '
    'grc-backup, là où un boolean aurait été plus naturel (CONVENTIONS.md §5 le proscrit en '
    'général — dérogation assumée ici, la chaîne est la donnée d''origine).';

-- =====================================================================================
-- §6 — MCO : ACTIONS PRÉALABLES (niveau filiale)
-- -------------------------------------------------------------------------------------
-- Modèle v10 du DATA_MODEL : suivi d'ACTION PLANIFIÉE. L'ancien modèle de vérification
-- récurrente {etat "OK"/"KO", date, notes} est mort ; sa conversion est faite par le
-- service de reprise (normalize v9 -> v10), pas par le schéma.
-- =====================================================================================

create table mco_actions (
    id           id_metier   not null,
    filiale_id   id_metier   not null,
    titre        text        not null,
    description  text,
    responsable  text,
    frequence    text,
    priorite     text        not null default 'Moyenne',
    statut       text        not null default 'À planifier',
    date_prevue  date,
    date_reelle  date,
    date_cloture date,
    avancement   integer     not null default 0,
    commentaire  text,
    version      integer     not null default 1,
    cree_le      timestamptz not null default now(),
    cree_par     text        not null default f_utilisateur_courant(),
    modifie_le   timestamptz,
    modifie_par  text,
    constraint pk_mco_actions         primary key (id),
    constraint fk_mco_actions_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_mco_actions_titre     check (titre <> ''),
    constraint ck_mco_actions_frequence check (frequence is null or frequence in (
        'Ponctuelle', 'Hebdomadaire', 'Mensuelle', 'Trimestrielle', 'Semestrielle', 'Annuelle')),
    constraint ck_mco_actions_priorite  check (priorite in ('Basse', 'Moyenne', 'Haute', 'Critique')),
    constraint ck_mco_actions_statut    check (statut in (
        'À planifier', 'En cours', 'Réalisée', 'Annulée')),
    constraint ck_mco_actions_avancement check (avancement between 0 and 100),
    -- Automatisme du modèle v10, rendu impossible à contredire : une action réalisée est
    -- à 100 %. Le formulaire l'applique déjà ; le moteur d'import devra en faire autant.
    constraint ck_mco_actions_realisee  check (statut <> 'Réalisée' or avancement = 100),
    constraint ck_mco_actions_dates     check (
        date_cloture is null or date_reelle is null or date_cloture >= date_reelle)
);

create index ix_mco_actions_filiale on mco_actions (filiale_id, statut, date_prevue);
-- Le retard est DÉRIVÉ : date_prevue dépassée et statut ni "Réalisée" ni "Annulée"
-- (PraMcoModule.isEnRetard, source unique côté frontend). Cet index sert ce calcul —
-- aucune colonne « en_retard » n'existe, et il ne doit jamais en exister une.
create index ix_mco_actions_retard on mco_actions (filiale_id, date_prevue)
    where statut not in ('Réalisée', 'Annulée') and date_prevue is not null;

create trigger trg_mco_actions_maj before update on mco_actions
    for each row execute function f_maj_tracabilite();

comment on table mco_actions is
    'Actions préalables au maintien en condition opérationnelle du plan de continuité '
    '(identifiants "MCO-…") : vérifications récurrentes planifiées, suivies comme des actions '
    '(statut, avancement, dates). Modèle v10 du DATA_MODEL.md.';
comment on column mco_actions.titre is
    'Définition courte de l''action, affichée en liste ; "description" en porte le détail.';
comment on column mco_actions.date_prevue is
    'Date programmée. Base de l''indicateur « en retard », qui est CALCULÉ et jamais stocké : '
    'une colonne dérivée se désynchronise dès le lendemain.';
comment on column mco_actions.date_reelle is
    'Date de réalisation effective ; complétée automatiquement au passage en "Réalisée".';
comment on column mco_actions.avancement is
    'Progression 0 à 100 %. Contrainte à 100 lorsque le statut vaut "Réalisée".';

-- =====================================================================================
-- §7 — PRESTATAIRES ET TIERS (niveau filiale)
-- Risque fournisseur = criticité (impact si défaillance) x niveau d'accès au SI.
-- =====================================================================================

create table prestataires (
    id           id_metier   not null,
    filiale_id   id_metier   not null,
    societe      text        not null,
    type         text,
    telephone    text,
    email        text,
    notes        text,
    criticite    text,
    acces        text,
    supply_chain jsonb       not null default '{}'::jsonb,
    version      integer     not null default 1,
    cree_le      timestamptz not null default now(),
    cree_par     text        not null default f_utilisateur_courant(),
    modifie_le   timestamptz,
    modifie_par  text,
    constraint pk_prestataires         primary key (id),
    constraint fk_prestataires_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_prestataires_societe check (societe <> ''),
    constraint ck_prestataires_type    check (type is null or type in (
        'Prestataire IT / Cloud', 'Assureur Cyber', 'Client Majeur', 'Autorité', 'Autre')),
    constraint ck_prestataires_criticite check (criticite is null or criticite in (
        'faible', 'moyenne', 'forte', 'vitale')),
    constraint ck_prestataires_acces     check (acces is null or acces in (
        'aucun', 'limite', 'etendu')),
    constraint ck_prestataires_supply_chain check (jsonb_typeof(supply_chain) = 'object')
);

create index ix_prestataires_filiale on prestataires (filiale_id, societe);

create trigger trg_prestataires_maj before update on prestataires
    for each row execute function f_maj_tracabilite();

comment on table prestataires is
    'Prestataires, tiers et contacts d''urgence (identifiants "PREST-…"). Porte l''évaluation '
    'du risque fournisseur exigée par NIS2 (article 21, sécurité de la chaîne '
    'd''approvisionnement) et par DORA.';
comment on column prestataires.telephone is
    'Téléphone d''urgence. La clé correspondante de l''export grc-backup est "phone" : le nom '
    'de colonne est en français, conformément au CONVENTIONS.md §1 — la traduction est faite '
    'par la couche d''accès aux données, comme pour les autres champs renommés de ce fichier.';
comment on column prestataires.criticite is
    'Impact d''une défaillance du tiers. Croisée avec "acces", elle donne le risque inhérent '
    '(Faible / Modéré / Élevé / Critique), qui est CALCULÉ et non stocké.';
comment on column prestataires.acces is
    'Niveau d''accès au système d''information et aux données. Valeurs sans accent, telles que '
    'le frontend les écrit ("limite", "etendu") : le round-trip prime sur l''orthographe.';
comment on column prestataires.supply_chain is
    'Exigences de chaîne d''approvisionnement satisfaites : sac de booléens à clés fixes '
    '(clause, notif, audit, donnees, reversibilite, continuite). JSONB assumé et LISTÉ au '
    'CONVENTIONS.md §6 — ces booléens n''ont aucune vie propre, ils ne sont ni joints ni '
    'interrogés séparément.';

-- =====================================================================================
-- §8 — AUDITS INTERNES (niveau filiale) — ISO 27001 §9.2
-- =====================================================================================

create table audits (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    reference   text        not null,
    statut      text        not null default 'Planifié',
    date_audit  date,
    perimetre   text,
    auditeur    text,
    audite      text,
    synthese    text,
    ref_id      text,
    items       jsonb       not null default '[]'::jsonb,
    constats    jsonb       not null default '[]'::jsonb,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_audits         primary key (id),
    constraint fk_audits_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_audits_reference check (reference <> ''),
    constraint ck_audits_statut    check (statut in ('Planifié', 'En cours', 'Réalisé')),
    constraint ck_audits_ref_id    check (ref_id is null or ref_id <> ''),
    constraint ck_audits_items     check (jsonb_typeof(items)    = 'array'),
    constraint ck_audits_constats  check (jsonb_typeof(constats) = 'array')
);

create index ix_audits_filiale on audits (filiale_id, date_audit desc);

create trigger trg_audits_maj before update on audits
    for each row execute function f_maj_tracabilite();

comment on table audits is
    'Audits internes (identifiants "AUD-…"), ISO 27001 §9.2. Le taux de conformité est CALCULÉ '
    'à partir de la grille (points conformes ou forts, rapportés aux points évalués applicables), '
    'jamais stocké.';
comment on column audits.reference is
    'Référence ou titre de l''audit (ex. "AUD-2026-01"). Clé "ref" dans l''export grc-backup ; '
    'renommée ici pour ne pas se confondre avec "ref_id", qui désigne tout autre chose.';
comment on column audits.ref_id is
    'Référentiel du catalogue STATIQUE sur lequel la grille a été bâtie (anssi-hygiene, '
    'iso-27002-2022, aircyber…), null pour un audit libre. Sans clé étrangère : les catalogues '
    'restent des fichiers, hors base (PLAN_SERVEUR §2.1).';
comment on column audits.items is
    'Grille de points de contrôle, INSTANTANÉ AUTOPORTANT : le texte du point est figé au '
    'moment de la génération, et c''est précisément la garantie d''intégrité de l''audit. Le '
    'normaliser détruirait ce qui a été construit à dessein (CONVENTIONS.md §6).';
comment on column audits.constats is
    'Constats libres, hors grille : [{type "Point fort"/"PA"/"Mineure"/"Majeure", exigence, '
    'desc}]. Même nature figée que la grille, même justification.';

-- =====================================================================================
-- §9 — REVUES DE DIRECTION (niveau filiale) — ISO 27001 §9.3
-- =====================================================================================

create table revues (
    id              id_metier   not null,
    filiale_id      id_metier   not null,
    date_revue      date,
    participants    text,
    donnees_entree  text,
    donnees_sortie  text,
    version         integer     not null default 1,
    cree_le         timestamptz not null default now(),
    cree_par        text        not null default f_utilisateur_courant(),
    modifie_le      timestamptz,
    modifie_par     text,
    constraint pk_revues         primary key (id),
    constraint fk_revues_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict
);

create index ix_revues_filiale on revues (filiale_id, date_revue desc);

create trigger trg_revues_maj before update on revues
    for each row execute function f_maj_tracabilite();

comment on table revues is
    'Revues de direction (identifiants "REV-…"), ISO 27001 §9.3. Le procès-verbal imprimable '
    'en est tiré : leur absence est un constat d''audit classique.';
comment on column revues.participants is
    'Participants, UN NOM PAR LIGNE — format exact du champ multi-personnes du frontend. '
    'Volontairement du texte et non une table de liaison vers "personnes" : l''annuaire ne sert '
    'qu''à l''autocomplétion, la saisie libre reste possible, et un participant extérieur au '
    'groupe doit pouvoir être consigné (DATA_MODEL.md §2, chantier Personnel).';
comment on column revues.donnees_entree is
    'Données d''entrée de la revue (ISO 27001 §9.3.2) : ce qui a été présenté à la direction. '
    'Clé "inputs" de l''export grc-backup.';
comment on column revues.donnees_sortie is
    'Données de sortie (§9.3.3) : décisions, arbitrages, ressources allouées. Clé "outputs" de '
    'l''export grc-backup.';

-- =====================================================================================
-- §10 — DOCUMENTS ET POLITIQUES — TABLE MIXTE
-- -------------------------------------------------------------------------------------
-- Seule table de ce fichier dont le filiale_id est NULLABLE (CONVENTIONS.md §4 et §16.4).
-- =====================================================================================

create table documents (
    id               id_metier   not null,
    -- MIXTE : null = politique de niveau GROUPE, applicable à toutes les filiales
    -- (PSSI, charte informatique du groupe) ; renseigné = procédure locale à un site.
    -- Le nullable est la condition des deux besoins à la fois : sans lui, ou bien la
    -- politique groupe serait recopiée vingt fois — vingt versions qui divergent, et
    -- l'audit ISO 27001 s'en aperçoit —, ou bien les filiales perdraient leurs
    -- procédures propres (PLAN_SERVEUR §2.2).
    filiale_id       id_metier,
    titre            text        not null,
    type             text,
    version_document text,
    proprietaire     text,
    statut           text        not null default 'brouillon',
    date_revue       date,
    emplacement      text,
    notes            text,
    version          integer     not null default 1,
    cree_le          timestamptz not null default now(),
    cree_par         text        not null default f_utilisateur_courant(),
    modifie_le       timestamptz,
    modifie_par      text,
    -- Portée de la ligne, ENGENDRÉE : « vrai » = document du socle Groupe. Sa seule
    -- raison d'être est d'offrir à document_referentiels un couple référençable qui,
    -- contrairement à (id, filiale_id), n'est JAMAIS nul — voir §10 bis, plus bas.
    portee_groupe   boolean generated always as (filiale_id is null) stored,
    constraint pk_documents         primary key (id),
    constraint uq_documents_id_portee unique (id, portee_groupe),
    -- Cible de la clé étrangère composite de document_referentiels. (id) étant déjà la
    -- clé primaire, cette unicité n'ajoute aucune contrainte métier : elle rend
    -- seulement le couple référençable.
    constraint uq_documents_id_filiale unique (id, filiale_id),
    constraint fk_documents_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_documents_titre  check (titre <> ''),
    constraint ck_documents_type   check (type is null or type in (
        'Politique de sécurité (PSSI)', 'Charte informatique', 'Procédure',
        'Politique de sauvegarde', 'Plan de continuité (PCA/PRA)',
        'Politique de contrôle d''accès', 'Politique de gestion des incidents',
        'Registre', 'Autre')),
    constraint ck_documents_statut check (statut in (
        'brouillon', 'en vigueur', 'à réviser', 'obsolète'))
);

create index ix_documents_filiale on documents (filiale_id, statut);
-- Alertes de revue documentaire (échéancier) : revue échue ou proche.
create index ix_documents_revue on documents (date_revue)
    where date_revue is not null;

create trigger trg_documents_maj before update on documents
    for each row execute function f_maj_tracabilite();

comment on table documents is
    'Registre documentaire : politiques, chartes, procédures (identifiants "DOC-…"). Table '
    'MIXTE : filiale_id nul = document de niveau Groupe applicable partout. L''application ne '
    'stocke pas le fichier lui-même — "emplacement" en donne la localisation, et les pièces '
    'jointes du socle (001 §10) prennent le relais quand le fichier doit être conservé.';
comment on column documents.filiale_id is
    'Nullable À DESSEIN (table mixte) : null = politique Groupe applicable à toutes les '
    'filiales, renseigné = procédure locale. Toute politique de lecture RLS devra donc traiter '
    'le cas null comme visible de tous (migration 004).';
comment on column documents.version_document is
    'Version MÉTIER du document, telle que l''auteur la note ("1.0", "2.3-projet") — à ne pas '
    'confondre avec la colonne "version", entière, qui porte le verrouillage optimiste '
    '(CONVENTIONS.md §3). La collision de nom du modèle navigateur est arbitrée ici en faveur '
    'de la colonne technique, homogène sur toutes les tables ; clé "version" de l''export.';
comment on column documents.date_revue is
    'Date de la prochaine revue. Pilote les alertes de l''échéancier ; "échue" est un calcul.';

-- ---------------------------------------------------------------------------------
-- Référentiels couverts par un document : ancien tableau « documents.referentiels[] ».
-- PORTE un filiale_id (CONVENTIONS.md §16.5) parce que documents est mixte et que
-- ref_id ne désigne aucune table.
-- ---------------------------------------------------------------------------------
create table document_referentiels (
    document_id id_metier   not null,
    ref_id      text        not null,
    filiale_id  id_metier,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    -- Même colonne engendrée que chez le parent, et pour la même raison.
    portee_groupe boolean generated always as (filiale_id is null) stored,
    constraint pk_document_referentiels primary key (document_id, ref_id),
    -- ── DEUX CLÉS ÉTRANGÈRES, ET IL EN FAUT DEUX ────────────────────────────────────
    --
    -- La règle de correspondance par défaut (« match simple ») neutralise une clé
    -- composite dès que L'UNE de ses colonnes est nulle. La clé de cohérence ci-dessous
    -- vérifie donc effectivement l'égalité des filiales quand filiale_id est RENSEIGNÉ,
    -- et ne vérifie plus rien quand il est nul — c'est-à-dire précisément pour les lignes
    -- de portée Groupe.
    --
    -- Cet angle mort a été relevé au second passage de la porte de sécurité S1 (constat
    -- N-10) : avec le drapeau d'administration, une ligne de portée GROUPE pouvait
    -- désigner un document LOCAL d'une filiale, et la suppression ordinaire de ce
    -- document par sa filiale emportait alors, en cascade, une ligne de portée Groupe.
    --
    -- La clé de PORTÉE ci-dessous ferme le cas symétrique : portee_groupe est engendrée
    -- et n'est JAMAIS nulle, la vérification a donc toujours lieu. Les deux clés
    -- ensemble épinglent filiale_id dans les deux cas :
    --   - filiale_id renseigné -> fk_..._coherence impose documents.filiale_id égal ;
    --   - filiale_id nul       -> fk_..._portee impose documents.filiale_id nul aussi.
    --
    -- Elle remplace la clé étrangère simple qui existait ici : celle-ci ne garantissait
    -- que l'existence du document et la cascade, ce que la clé de portée fait aussi — en
    -- vérifiant une chose de plus. Déclaratif, et donc AVEUGLE À LA RLS : c'est ce qui
    -- compte, un déclencheur « security invoker » ne verrait pas le document d'une autre
    -- filiale et conclurait à tort.
    constraint fk_document_referentiels_portee foreign key (document_id, portee_groupe)
        references documents (id, portee_groupe) on delete cascade,
    constraint fk_document_referentiels_coherence foreign key (document_id, filiale_id)
        references documents (id, filiale_id) on delete cascade,
    constraint fk_document_referentiels_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_document_referentiels_ref check (ref_id <> '')
);

create index ix_document_referentiels_filiale on document_referentiels (filiale_id, ref_id);
create index ix_document_referentiels_ref     on document_referentiels (ref_id);

comment on table document_referentiels is
    'Référentiels couverts par un document (n-n). Table de liaison : ni version, ni déclencheur '
    'de mise à jour — un lien ne se modifie pas, il se supprime et se recrée ; la seule colonne '
    'hors clé primaire, filiale_id, est une recopie de la filiale du document, tenue cohérente '
    'par fk_document_referentiels_coherence et non par une saisie.';
comment on column document_referentiels.ref_id is
    'Identifiant du référentiel dans le CATALOGUE STATIQUE (anssi-hygiene, iso27001-smsi, '
    'nis2-art21, dora, aircyber). SANS CLÉ ÉTRANGÈRE, et ce n''est pas un oubli : les '
    'catalogues de référentiels restent des fichiers versionnés avec le code, hors base '
    '(PLAN_SERVEUR §2.1) — c''est aussi ce qui évite d''y stocker le texte des normes.';
comment on column document_referentiels.filiale_id is
    'Recopie du filiale_id du document, nul pour un document Groupe. Présent pour que la RLS '
    'filtre sans jointure sur une table mixte (CONVENTIONS.md §16.5) ; tenu cohérent par '
    'fk_document_referentiels_coherence.';

-- =====================================================================================
-- §11 — REGISTRE RGPD (niveau filiale) — article 30
-- Chaque entité juridique tient SON registre : la table est de niveau filiale, sans
-- exception (PLAN_SERVEUR §2.2).
-- =====================================================================================

create table traitements (
    id                   id_metier   not null,
    filiale_id           id_metier   not null,
    nom                  text        not null,
    finalite             text,
    base_legale          text,
    responsable          text,
    personnes_concernees text,
    categories_donnees   text,
    donnees_sensibles    boolean     not null default false,
    destinataires        text,
    transfert_hors_ue    text,
    duree_conservation   text,
    version              integer     not null default 1,
    cree_le              timestamptz not null default now(),
    cree_par             text        not null default f_utilisateur_courant(),
    modifie_le           timestamptz,
    modifie_par          text,
    constraint pk_traitements         primary key (id),
    constraint uq_traitements_id_filiale unique (id, filiale_id),
    constraint fk_traitements_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_traitements_nom  check (nom <> ''),
    constraint ck_traitements_base check (base_legale is null or base_legale in (
        'Consentement', 'Contrat', 'Obligation légale', 'Intérêt légitime',
        'Mission d''intérêt public', 'Sauvegarde des intérêts vitaux'))
);

create index ix_traitements_filiale on traitements (filiale_id, nom);

create trigger trg_traitements_maj before update on traitements
    for each row execute function f_maj_tracabilite();

comment on table traitements is
    'Registre des activités de traitement de données personnelles (identifiants "TRT-…"), '
    'article 30 du RGPD. L''outil héberge ce registre pour chaque filiale — et y figure '
    'lui-même, son journal d''audit conservant des identités trois ans (PLAN_SERVEUR §1.7).';
comment on column traitements.donnees_sensibles is
    'Catégories particulières de données (article 9). Booléen, pas une chaîne "Oui"/"Non" '
    '(CONVENTIONS.md §5).';
comment on column traitements.transfert_hors_ue is
    'Texte libre : "Non", ou le pays et les garanties encadrant le transfert. Un booléen ne '
    'suffirait pas, la garantie fait partie de la réponse attendue par la CNIL.';

-- ---------------------------------------------------------------------------------
-- Mesures de sécurité du traitement : ancien tableau « traitements.mesures_ids[] ».
-- PORTE un filiale_id (CONVENTIONS.md §16.5) : mesure_catalogue est mixte.
-- ---------------------------------------------------------------------------------
create table traitement_mesures (
    traitement_id id_metier   not null,
    mesure_id     id_metier   not null,
    filiale_id    id_metier   not null,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    constraint pk_traitement_mesures primary key (traitement_id, mesure_id),
    -- Clé étrangère COMPOSITE : elle garantit d'un seul tenant l'existence du traitement,
    -- la cascade à sa suppression, et l'égalité des filiales — les deux colonnes étant
    -- non nulles, la vérification a toujours lieu.
    constraint fk_traitement_mesures_traitement foreign key (traitement_id, filiale_id)
        references traitements(id, filiale_id) on delete cascade,
    -- Vise le CATALOGUE (CONVENTIONS.md §16.3), comme actions.mesure_id : c'est
    -- l'identifiant présent dans les exports grc-backup.
    --
    -- « restrict » et NON « cascade » (CONVENTIONS.md §17.6, amendement du §8) : même
    -- motif que les trois autres références au catalogue — une suppression dans le socle
    -- Groupe ne doit pas défaire les rattachements RGPD de filiales qu'elle ne voit pas.
    -- Raisonnement complet sur fk_mesure_mise_en_oeuvre_mesure (002 §5).
    constraint fk_traitement_mesures_mesure foreign key (mesure_id)
        references mesure_catalogue(id) on delete restrict,
    constraint fk_traitement_mesures_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict
);

create index ix_traitement_mesures_filiale on traitement_mesures (filiale_id, mesure_id);
create index ix_traitement_mesures_mesure  on traitement_mesures (mesure_id);

comment on table traitement_mesures is
    'Mesures de sécurité couvrant un traitement RGPD (n-n). Réutilise le pivot "mesure de '
    'sécurité" : les mesures décrites une fois servent la conformité ISO, NIS2 ET le registre '
    'article 30 — zéro double saisie. "on delete cascade" des deux côtés : supprimer la mesure '
    'délie le traitement, elle ne le supprime pas. Table de liaison : ni version, ni déclencheur '
    'de mise à jour — un lien se supprime et se recrée, et filiale_id n''est qu''une recopie de '
    'la filiale du traitement, imposée par la clé étrangère composite.';
comment on column traitement_mesures.filiale_id is
    'Filiale du traitement. Présent parce que mesure_catalogue est mixte : sans lui, la RLS '
    'devrait joindre pour trancher (CONVENTIONS.md §16.5). La cohérence avec la filiale du '
    'traitement est garantie par la clé étrangère composite ; celle avec la filiale de la '
    'mesure ne peut pas l''être par une clé étrangère (une mesure Groupe a filiale_id nul) et '
    'relève du service applicatif.';

-- =====================================================================================
-- §12 — CORRESPONDANCES INTER-RÉFÉRENTIELS — NIVEAU GROUPE
-- -------------------------------------------------------------------------------------
-- Aucune colonne filiale_id (CONVENTIONS.md §16.4) : une équivalence entre une mesure
-- ANSSI et un contrôle ISO est vraie partout ; la définir vingt fois la ferait diverger.
-- Cette table ne contient QUE la surcouche utilisateur — le catalogue par défaut de 28
-- groupes reste statique, dans js/data/mappings.js.
-- =====================================================================================

create table mappings (
    id          id_metier   not null,
    theme       text        not null,
    aide        text,
    masque      boolean     not null default false,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_mappings    primary key (id),
    constraint ck_mappings_theme check (theme <> '')
);

create index ix_mappings_masque on mappings (masque) where masque;

create trigger trg_mappings_maj before update on mappings
    for each row execute function f_maj_tracabilite();

comment on table mappings is
    'Surcouche éditable des correspondances inter-référentiels, de niveau GROUPE. Un '
    'identifiant du catalogue statique ("map-…") vaut REMPLACEMENT du groupe correspondant ; '
    'un identifiant "MAP-…" est un groupe personnalisé. Le catalogue par défaut n''est pas '
    'stocké : il est fusionné à l''affichage.';
comment on column mappings.masque is
    'Vrai = groupe du catalogue MASQUÉ (pierre tombale). Correspond au champ "_deleted" de '
    'l''export grc-backup ; nommé en français, et sans souligné initial, un tel préfixe '
    'n''ayant pas de sens en base.';
comment on column mappings.aide is
    'Note pédagogique affichée en bulle : le logiciel s''adresse aussi à des non-experts, '
    'chaque concept doit pouvoir s''expliquer en une phrase.';

-- ---------------------------------------------------------------------------------
-- Exigences équivalentes d'un groupe : ancien objet « mappings.refs » de forme
-- { <ref_id> : [codes…] }. RELATIONNEL et non jsonb : le CONVENTIONS.md §6 ferme la
-- liste des colonnes jsonb, et un objet de tableaux d'identifiants est précisément
-- l'un des trois cas qu'il proscrit. La forme relationnelle est aussi ce qui permet
-- de retrouver « quels groupes citent l'exigence A.5.1 » sans parcourir du document.
-- ---------------------------------------------------------------------------------
create table mapping_exigences (
    mapping_id id_metier   not null,
    ref_id     text        not null,
    code       text        not null,
    cree_le    timestamptz not null default now(),
    cree_par   text        not null default f_utilisateur_courant(),
    constraint pk_mapping_exigences primary key (mapping_id, ref_id, code),
    constraint fk_mapping_exigences_mapping foreign key (mapping_id)
        references mappings(id) on delete cascade,
    constraint ck_mapping_exigences_ref  check (ref_id <> ''),
    constraint ck_mapping_exigences_code check (code   <> '')
);

create index ix_mapping_exigences_ref on mapping_exigences (ref_id, code);

comment on table mapping_exigences is
    'Exigences déclarées équivalentes au sein d''un groupe de correspondance. Table fille de '
    'niveau Groupe, sans version ni filiale_id. Le couple (ref_id, code) désigne une exigence '
    'du CATALOGUE STATIQUE : sans clé étrangère, pour la même raison que partout ailleurs — '
    'les référentiels ne sont pas en base (PLAN_SERVEUR §2.1).';

-- =====================================================================================
-- §13 — HISTORIQUE DES INDICATEURS (niveau filiale)
-- =====================================================================================

create table history (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    date_point  date        not null,
    horodatage  timestamptz not null default now(),
    metrics     jsonb       not null,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_history         primary key (id),
    -- Un point par jour et par filiale : la clé métier du modèle navigateur, ici imposée
    -- par le schéma au lieu d'être surveillée par le code (upsert du jour).
    constraint uq_history_filiale_date unique (filiale_id, date_point),
    constraint fk_history_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_history_metrics check (jsonb_typeof(metrics) = 'object')
);

create index ix_history_filiale on history (filiale_id, date_point desc);

create trigger trg_history_maj before update on history
    for each row execute function f_maj_tracabilite();

comment on table history is
    'Relevés quotidiens d''indicateurs (identifiants "HIST-…") alimentant les courbes de '
    'tendance. Niveau FILIALE : la série Groupe est CALCULÉE à la lecture, jamais stockée — '
    'un agrégat stocké devrait être recalculé à chaque entrée ou sortie de filiale, et '
    'divergerait (CONVENTIONS.md §16.4). Conservation bornée côté applicatif (180 jours).';
comment on column history.date_point is
    'Jour du relevé : c''est la clé métier. Le point du jour est actualisé tant que la journée '
    'court, les points passés sont figés. Clé "date" de l''export grc-backup.';
comment on column history.horodatage is
    'Date et heure de la dernière écriture du point (clé "ts" de l''export, un entier de '
    'millisecondes côté navigateur — converti en timestamptz, CONVENTIONS.md §5).';
comment on column history.metrics is
    'Indicateurs du jour : {conformite, maturite, expo, risques_crit, actions_retard, '
    'avancement, incidents_ouverts}. JSONB assumé et LISTÉ au CONVENTIONS.md §6 — relevé daté, '
    'en écriture seule, jamais joint ; la liste des indicateurs suivis évoluera, et un schéma '
    'relationnel imposerait une migration à chaque nouvel indicateur.';

-- =====================================================================================
-- §14 bis — TRAÇABILITÉ D'INSERTION, PUIS GARDE-FOU DE SCHÉMA
-- -------------------------------------------------------------------------------------
-- Les deux mêmes instructions qu'en fin de 001_socle.sql, et pour la même raison
-- (CONVENTIONS.md §18.1 et §18.4) : poser les déclencheurs « before insert » sur les
-- tables que ce fichier vient de créer, puis faire échouer la migration si une
-- vérification de schéma rend la moindre ligne.
--
-- Le §18.4 est né de ce qu'un garde-fou appelé par la SEULE migration 004 ne s'exécutait
-- plus jamais sur une base à jour. Toute migration termine désormais par ce couple : c'est
-- ce qui rend le filet réel plutôt que documentaire.
-- =====================================================================================

do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Traçabilité d''insertion : % déclencheur(s) posé(s).', v_poses;
end;
$$;

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('  - [%s] %s : %s (%s)', controle, objet, anomalie, detail),
                      E'\n' order by controle, objet, anomalie),
           count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception E'Vérification du schéma en défaut — % anomalie(s) :\n%',
                        v_nombre, v_anomalies
            using errcode = '42501',
                  hint = 'Voir backend/db/CONVENTIONS.md §18.4 et le §15 bis de 001_socle.sql.';
    end if;

    raise notice 'Schéma vérifié : aucune anomalie sur % table(s) à la création tracée.',
                 (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind in ('r', 'p')
                     and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                  and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped));
end;
$$;

-- =====================================================================================
-- §14 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('003', 'Métier — opérations : plan d''actions, incidents, cellule de crise, scénarios et '
               'tests PCA/PRA, MCO, prestataires, audits, revues de direction, documents, '
               'registre RGPD, correspondances inter-référentiels, historique des indicateurs')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Drops dans l'ordre inverse des créations. À n'exécuter qu'en développement.
--
-- begin;
--   drop table if exists history cascade;
--   drop table if exists mapping_exigences cascade;
--   drop table if exists mappings cascade;
--   drop table if exists traitement_mesures cascade;
--   drop table if exists traitements cascade;
--   drop table if exists document_referentiels cascade;
--   drop table if exists documents cascade;
--   drop table if exists revues cascade;
--   drop table if exists audits cascade;
--   drop table if exists prestataires cascade;
--   drop table if exists mco_actions cascade;
--   drop table if exists tests_pra cascade;
--   drop table if exists scenarios_pra cascade;
--   drop table if exists crise cascade;
--   drop table if exists actions cascade;
--   drop table if exists incident_actifs cascade;
--   drop table if exists incidents cascade;
--   delete from migrations_schema where version = '003';
-- commit;
-- =====================================================================================
