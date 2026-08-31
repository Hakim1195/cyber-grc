-- =====================================================================================
-- 002_metier_noyau.sql — Entités métier du noyau GRC
-- =====================================================================================
-- Lot L1 (schéma relationnel), partie 2/4 : le noyau du modèle métier.
-- Référence de cadrage : docs/PLAN_SERVEUR.md §2 (schéma de données), §2.2 (découpage
-- Groupe / Filiale / Mixte et scission des mesures), §2.5 (liaisons n-n).
-- Modèle applicatif de départ : docs/DATA_MODEL.md §2 (entités), §3 et §4 (relations).
-- Conventions applicables : backend/db/CONVENTIONS.md — en particulier le §16, qui fige
-- le découpage du lot L1 ; ce fichier met en oeuvre le §16.1, ligne « 002 ».
--
-- Contenu :
--   §0  Gardes
--   §1  clients ..................... donneurs d'ordre (filiale)
--   §2  personnes ................... annuaire (MIXTE)
--   §3  exigences ................... exigences contractuelles / internes (filiale)
--   §4  mesure_catalogue ............ DÉFINITION du contrôle (MIXTE)
--   §5  mesure_mise_en_oeuvre ....... ÉVALUATION du contrôle dans une filiale (filiale)
--   §6  evaluations ................. auto-évaluation d'une exigence de référentiel (filiale)
--   §7  risques ..................... scénarios de risque EBIOS F×G×M (filiale)
--   §8  actifs ...................... actifs supports (filiale)
--   §9  processus ................... processus métier / BIA (filiale)
--   §10 Liaisons n-n ................ risque_exigences, actif_risques, processus_actifs,
--                                     actif_dependances, evaluation_mesures
--   §11 Enregistrement de la migration
--
-- Hors de ce fichier, par construction (CONVENTIONS.md §16.1) : actions, incidents,
-- crise, scenarios_pra, tests_pra, mco_actions, prestataires, audits, revues, documents,
-- traitements, mappings, history — tous écrits par 003_metier_operations.sql, qui dépend
-- de celui-ci. Le graphe des clés étrangères est acyclique dans cet ordre : RIEN ici ne
-- référence une table de 003.
--
-- Les politiques RLS ne sont PAS ici : elles sont créées par 004_rls.sql
-- (CONVENTIONS.md §11). Ce fichier se contente de définir « filiale_id » selon le §4.
--
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 002_metier_noyau.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — GARDES
-- =====================================================================================

-- Le socle doit être en place : domaines partagés (id_metier…), fonctions partagées
-- (f_utilisateur_courant, f_maj_tracabilite…) et table filiales, cible de toutes les
-- clés étrangères de cloisonnement.
-- Deux tests SÉPARÉS, et non une condition unique : sur une base entièrement vide, le
-- registre lui-même n'existe pas, et PL/pgSQL prépare une instruction entière avant de
-- l'évaluer — un « or » ne court-circuiterait donc pas la préparation. Le premier test
-- sort avant que la seconde requête ne soit préparée, ce qui rend un message explicite
-- plutôt qu'un « relation migrations_schema does not exist ».
do $$
begin
    if to_regclass('public.migrations_schema') is null then
        raise exception
            'Base vide : appliquez d''abord 001_socle.sql. 002_metier_noyau.sql en dépend '
            '(domaines, fonctions partagées et table filiales). Voir CONVENTIONS.md §16.1.';
    end if;
    if not exists (select 1 from migrations_schema where version = '001') then
        raise exception
            'Migration 001_socle.sql non appliquée : 002_metier_noyau.sql en dépend '
            '(domaines, fonctions partagées et table filiales). Voir CONVENTIONS.md §16.1.';
    end if;
end;
$$;

-- Les privilèges de grc_app / grc_lecture n'ont pas à être répétés ici : 001 a posé des
-- « alter default privileges » AVANT toute création de table (CONVENTIONS.md §14), qui
-- s'appliquent donc aux tables créées ci-dessous.

-- =====================================================================================
-- §1 — CLIENTS (« Donneurs d'ordre ») — niveau FILIALE
-- Chaque site a ses propres contrats : un donneur d'ordre de Toulouse n'a pas à être
-- visible en Allemagne (PLAN_SERVEUR §2.2).
-- =====================================================================================

create table clients (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    nom         text        not null,
    secteur     text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_clients         primary key (id),
    constraint fk_clients_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_clients_nom     check (nom <> '')
);

create index ix_clients_filiale on clients (filiale_id, nom);

create trigger trg_clients_maj before update on clients
    for each row execute function f_maj_tracabilite();

comment on table clients is
    'Donneur d''ordre (client) ou périmètre contractuel. Porte les exigences qui lui sont '
    'propres : supprimer un donneur d''ordre supprime ses exigences, et donc leurs actions '
    '(CONVENTIONS.md §8). Identifiant "CLI-…".';
comment on column clients.filiale_id is
    'Filiale propriétaire. "on delete restrict" : une filiale ne se supprime pas, elle SORT '
    'du groupe (PLAN_SERVEUR §2.7).';
comment on column clients.secteur is
    'Secteur d''activité ou description libre (ex. « Aéronautique, Spatial, Défense »).';

-- =====================================================================================
-- §2 — PERSONNES (annuaire) — table MIXTE
-- =====================================================================================

create table personnes (
    id             id_metier   not null,
    -- MIXTE (CONVENTIONS.md §4 et §16.4) : filiale_id NULLABLE, null = portée Groupe.
    -- Justification : l'annuaire est alimenté depuis l'Active Directory du groupe
    -- (PLAN_SERVEUR §1.5) et contient à la fois des personnes rattachées à un site
    -- (le RSSI de Toulouse) et des personnes transverses au groupe (le RSSI groupe, le
    -- DPO, la direction). Imposer un rattachement à une filiale obligerait à dupliquer
    -- ces dernières dans les vingt filiales, avec autant de doublons à maintenir et un
    -- décompte faussé ; l'interdire priverait les sites de leur propre annuaire.
    filiale_id     id_metier,
    utilisateur_id id_metier,
    nom            text        not null,
    fonction       text,
    service        text,
    email          text,
    telephone      text,
    notes          text,
    version        integer     not null default 1,
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    modifie_le     timestamptz,
    modifie_par    text,
    constraint pk_personnes             primary key (id),
    constraint fk_personnes_filiale     foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint fk_personnes_utilisateur foreign key (utilisateur_id)
        references utilisateurs(id) on delete set null,
    constraint ck_personnes_nom         check (nom <> '')
);

create index ix_personnes_filiale     on personnes (filiale_id, nom);
create index ix_personnes_utilisateur on personnes (utilisateur_id) where utilisateur_id is not null;

create trigger trg_personnes_maj before update on personnes
    for each row execute function f_maj_tracabilite();

comment on table personnes is
    'Annuaire des personnes et rôles. Source des suggestions de tous les champs '
    '« Responsable » / « Propriétaire » / « Auditeur » de l''application. Identifiant "PERS-…". '
    'ATTENTION : les entités métier continuent de stocker le NOM en texte libre, sans clé '
    'étrangère vers cette table (DATA_MODEL.md §2). Ce choix est délibéré et conservé côté '
    'serveur : il garantit le round-trip d''un export grc-backup et laisse la saisie libre '
    'possible. Supprimer une personne retire donc la suggestion, jamais les responsables '
    'déjà saisis dans les fiches.';
comment on column personnes.filiale_id is
    'Null = personne de portée Groupe (RSSI groupe, DPO, direction) ; renseigné = personne '
    'rattachée à une filiale. Voir la justification du caractère nullable ci-dessus.';
comment on column personnes.utilisateur_id is
    'Compte applicatif correspondant, quand la personne en a un. Alimenté par le '
    'provisionnement AD (PLAN_SERVEUR §1.5). "on delete set null" : la fiche annuaire '
    'survit à la suppression du compte, comme cree_par survit à celle de son auteur.';
comment on column personnes.fonction is 'Rôle tenu : RSSI, DPO, Responsable IT…';
comment on column personnes.service is  'Équipe ou département de rattachement.';

-- =====================================================================================
-- §3 — EXIGENCES — niveau FILIALE
-- Exigence contractuelle d'un donneur d'ordre, ou exigence interne (client_id nul).
-- =====================================================================================

create table exigences (
    id                id_metier   not null,
    filiale_id        id_metier   not null,
    client_id         id_metier,
    code              text        not null,
    intitule          text        not null,
    statut_conformite text        not null default 'non conforme',
    responsable       text,
    commentaire       text,
    version           integer     not null default 1,
    cree_le           timestamptz not null default now(),
    cree_par          text        not null default f_utilisateur_courant(),
    modifie_le        timestamptz,
    modifie_par       text,
    constraint pk_exigences          primary key (id),
    constraint fk_exigences_filiale  foreign key (filiale_id)
        references filiales(id) on delete restrict,
    -- Cascade du DATA_MODEL.md §3 : « deleteClient supprime les exigences rattachées ».
    constraint fk_exigences_client   foreign key (client_id)
        references clients(id) on delete cascade,
    constraint ck_exigences_code     check (code <> ''),
    constraint ck_exigences_intitule check (intitule <> ''),
    -- Valeurs reprises MOT POUR MOT du DATA_MODEL.md §2 (accents et espaces compris) :
    -- c'est la condition du round-trip grc-backup (CONVENTIONS.md §5).
    constraint ck_exigences_statut   check (statut_conformite in (
        'conforme', 'partiellement conforme', 'non conforme', 'non applicable'))
);

create index ix_exigences_filiale        on exigences (filiale_id, client_id);
create index ix_exigences_filiale_statut on exigences (filiale_id, statut_conformite);

create trigger trg_exigences_maj before update on exigences
    for each row execute function f_maj_tracabilite();

comment on table exigences is
    'Exigence de conformité suivie par la filiale : point d''un cahier des charges client, '
    'ou exigence interne. Identifiant "EX-…". Alimente le taux de conformité et la '
    'déclaration d''applicabilité (SoA).';
comment on column exigences.client_id is
    'Null = exigence INTERNE ; renseigné = exigence portée par un donneur d''ordre. '
    'Cascade : supprimer le donneur d''ordre supprime ses exigences.';
comment on column exigences.code is
    'Code de l''exigence dans son référentiel d''origine (A.5.1, NIS2-21…). Volontairement '
    'sans contrainte d''unicité : deux donneurs d''ordre peuvent numéroter pareillement, et '
    'les reprises de données contiennent des doublons historiques.';
comment on column exigences.statut_conformite is
    'conforme | partiellement conforme | non conforme | non applicable. Pas de valeur vide, '
    'contrairement aux evaluations (§6) : l''application impose un statut dès la création, et '
    'l''import Excel retombe sur « non conforme » quand la colonne est absente.';

-- =====================================================================================
-- §4 — MESURE_CATALOGUE — table MIXTE — la DÉFINITION du contrôle
-- Première moitié de la scission de l'entité « mesures » (PLAN_SERVEUR §2.2,
-- CONVENTIONS.md §16.2). L'entité unique du modèle navigateur portait deux choses de
-- nature différente : la définition d'un contrôle (la même partout) et son évaluation
-- (propre à chaque site). Les garder ensemble rendrait les filiales incomparables et
-- viderait la vision Groupe de son sens.
-- =====================================================================================

create table mesure_catalogue (
    id          id_metier   not null,
    -- MIXTE (CONVENTIONS.md §16.2) : filiale_id NULLABLE, null = socle imposé par le
    -- Groupe. Justification : le nullable est la condition des DEUX besoins à la fois —
    -- un socle de contrôles commun, sans lequel la consolidation Groupe additionne des
    -- grandeurs incomparables, et la possibilité pour une filiale d'ajouter les contrôles
    -- propres à son contexte (métier local, exigence d'un donneur d'ordre régional).
    filiale_id  id_metier,
    reference   text,
    nom         text        not null,
    description text,
    domaine     text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_mesure_catalogue         primary key (id),
    constraint fk_mesure_catalogue_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_mesure_catalogue_nom     check (nom <> ''),
    constraint ck_mesure_catalogue_ref     check (reference is null or reference <> '')
);

-- Unicité de la référence, séparément pour le socle Groupe et pour chaque filiale.
-- Deux index partiels plutôt qu'une contrainte unique sur (filiale_id, reference) :
-- « unique » laisserait passer autant de doublons Groupe qu'on veut (les null ne
-- s'égalent pas) et « unique nulls not distinct » interdirait, à l'inverse, plusieurs
-- mesures SANS référence — or la référence est facultative.
create unique index uq_mesure_catalogue_reference_groupe
    on mesure_catalogue (reference)
    where filiale_id is null and reference is not null;
create unique index uq_mesure_catalogue_reference_locale
    on mesure_catalogue (filiale_id, reference)
    where filiale_id is not null and reference is not null;

create index ix_mesure_catalogue_filiale on mesure_catalogue (filiale_id, nom);

create trigger trg_mesure_catalogue_maj before update on mesure_catalogue
    for each row execute function f_maj_tracabilite();

comment on table mesure_catalogue is
    'DÉFINITION d''une mesure de sécurité (le contrôle lui-même : « chiffrement des postes de '
    'travail »), indépendamment de son état dans une filiale. Entité PIVOT du dispositif de '
    'conformité : une mesure couvre n-n plusieurs exigences de référentiels (liaison '
    'evaluation_mesures), ce qui permet de l''évaluer une seule fois — zéro double saisie. '
    'Identifiant "MESURE-…", CELUI DE L''EXPORT grc-backup, inchangé : c''est ce qui rend la '
    'reprise de données exacte (CONVENTIONS.md §16.3).';
comment on column mesure_catalogue.filiale_id is
    'Null = mesure du socle Groupe, applicable partout ; renseigné = mesure LOCALE à une '
    'filiale. Voir la justification du caractère nullable ci-dessus.';
comment on column mesure_catalogue.reference is
    'Référence courte et stable du contrôle (ex. « MES-CHIFF-01 »), facultative. Unique au '
    'sein du socle Groupe, et unique au sein de chaque filiale pour les mesures locales.';
comment on column mesure_catalogue.domaine is
    'Thème de sécurité de rattachement (gouvernance, exploitation, continuité…). Texte libre '
    'et NON le domaine "domaine_fonctionnel" du modèle de droits, qui décrit un écran de '
    'l''application, pas un sujet de sécurité.';

-- =====================================================================================
-- §5 — MESURE_MISE_EN_OEUVRE — niveau FILIALE — l'ÉVALUATION du contrôle
-- Seconde moitié de la scission (CONVENTIONS.md §16.2). Statut, maturité, responsable et
-- commentaire diffèrent d'un site à l'autre : ils appartiennent à la filiale.
-- =====================================================================================

create table mesure_mise_en_oeuvre (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    mesure_id   id_metier   not null,
    statut      text        not null default '',
    maturite    integer,
    responsable text,
    commentaire text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_mesure_mise_en_oeuvre                primary key (id),
    -- Nom de contrainte fixé par CONVENTIONS.md §16.2 : une filiale n'évalue un contrôle
    -- qu'une fois. C'est aussi ce qui permet de déduire sans ambiguïté la mise en oeuvre
    -- concernée à partir du couple (filiale_id, mesure_id) — §16.3.
    constraint uq_mesure_mise_en_oeuvre_filiale_mesure unique (filiale_id, mesure_id),
    constraint fk_mesure_mise_en_oeuvre_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    -- Une mise en oeuvre sans définition n'a pas d'objet : elle disparaît avec sa mesure.
    constraint fk_mesure_mise_en_oeuvre_mesure  foreign key (mesure_id)
        references mesure_catalogue(id) on delete cascade,
    constraint ck_mesure_mise_en_oeuvre_statut   check (statut in (
        '', 'conforme', 'partiellement conforme', 'non conforme', 'non applicable')),
    constraint ck_mesure_mise_en_oeuvre_maturite check (
        maturite is null or (maturite >= 0 and maturite <= 5))
);

create index ix_mesure_mise_en_oeuvre_filiale on mesure_mise_en_oeuvre (filiale_id, statut);
create index ix_mesure_mise_en_oeuvre_mesure  on mesure_mise_en_oeuvre (mesure_id);

create trigger trg_mesure_mise_en_oeuvre_maj before update on mesure_mise_en_oeuvre
    for each row execute function f_maj_tracabilite();

comment on table mesure_mise_en_oeuvre is
    'ÉTAT d''une mesure du catalogue DANS UNE FILIALE : statut, maturité, responsable, '
    'commentaire. Identifiant "MMO-…", ENGENDRÉ côté serveur — c''est le seul identifiant du '
    'modèle qui n''existe dans aucun export grc-backup (CONVENTIONS.md §2). La propagation '
    '« au plus défavorable » vers les évaluations s''applique au sein d''une même filiale : '
    'pour une évaluation de la filiale F, agréger les mises en oeuvre DE F correspondant aux '
    'mesures du catalogue liées à cette évaluation (§16.3).';
comment on column mesure_mise_en_oeuvre.mesure_id is
    'Mesure du CATALOGUE mise en oeuvre. Jamais une autre mise en oeuvre.';
comment on column mesure_mise_en_oeuvre.statut is
    'Chaîne vide = non évalué (valeur réellement stockée par l''application, à ne pas '
    'confondre avec « non applicable » qui est une décision motivée). Sinon : conforme | '
    'partiellement conforme | non conforme | non applicable.';
comment on column mesure_mise_en_oeuvre.maturite is
    'Niveau de maîtrise de 0 (rien en place) à 5 (processus optimisé), échelle inspirée du '
    'CMMI. Entier et non numeric : c''est un niveau discret choisi dans une liste, pas un '
    'score calculé. Null = non renseigné.';

-- =====================================================================================
-- §6 — EVALUATIONS — niveau FILIALE
-- Auto-évaluation d'UNE exigence D'UN référentiel (ANSSI, ISO 27001, NIS2, DORA,
-- AirCyber). La mise en oeuvre diffère d'un site à l'autre : niveau filiale.
-- =====================================================================================

create table evaluations (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    ref_id      text        not null,
    code        text        not null,
    statut      text        not null default '',
    maturite    integer,
    commentaire text,
    preuves     text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_evaluations           primary key (id),
    -- Clé métier du DATA_MODEL.md §2, portée à la filiale : une exigence de référentiel
    -- n'est évaluée qu'une fois par site. Fournit aussi l'index de liste (filiale en tête).
    constraint uq_evaluations_ref_code  unique (filiale_id, ref_id, code),
    -- Cible du couple référencé par evaluation_mesures (§10) : c'est ce qui interdit à une
    -- ligne de liaison d'annoncer une filiale autre que celle de son évaluation.
    constraint uq_evaluations_id_filiale unique (id, filiale_id),
    constraint fk_evaluations_filiale   foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_evaluations_ref       check (ref_id <> ''),
    constraint ck_evaluations_code      check (code <> ''),
    constraint ck_evaluations_statut    check (statut in (
        '', 'conforme', 'partiellement conforme', 'non conforme', 'non applicable')),
    constraint ck_evaluations_maturite  check (
        maturite is null or (maturite >= 0 and maturite <= 5))
);

create trigger trg_evaluations_maj before update on evaluations
    for each row execute function f_maj_tracabilite();

comment on table evaluations is
    'Auto-évaluation d''une exigence d''un référentiel par une filiale. Identifiant "EVAL-…". '
    'Une exigence sans enregistrement est « non évaluée » : l''enregistrement naît à la '
    'première évaluation. Aucun index supplémentaire n''est créé, uq_evaluations_ref_code '
    'jouant déjà ce rôle (filiale_id en tête, CONVENTIONS.md §4).';
comment on column evaluations.ref_id is
    'Identifiant du référentiel dans le CATALOGUE STATIQUE (anssi-hygiene, iso27001-smsi, '
    'iso-27002-2022, nis2-art21, dora, aircyber). Sans clé étrangère : les catalogues restent '
    'des fichiers, hors base (PLAN_SERVEUR §2.1) — c''est aussi ce qui interdit d''y stocker le '
    'texte des normes. À ne pas confondre avec referentiels_actifs, qui dit quels référentiels '
    'sont dans le périmètre du site.';
comment on column evaluations.code is
    'Code de l''exigence DANS le référentiel (ex. « 22 » pour la 22e mesure d''hygiène ANSSI).';
comment on column evaluations.statut is
    'Chaîne vide = non évalué. Pour les référentiels déclarés « scoring: conformite » '
    '(questionnaire AirCyber), les mêmes valeurs sont affichées Oui / Non / N-A et '
    '« partiellement conforme » n''est plus proposé — mais reste admis, d''anciennes réponses '
    'ayant pu le recevoir par propagation.';
comment on column evaluations.maturite is
    'Échelle CMMI 0 à 5. Non utilisée par les questionnaires (AirCyber) : la valeur y est '
    'préservée si elle existe, mais ni saisie ni interprétée.';
comment on column evaluations.preuves is
    'Références des preuves (l''application ne stocke pas les fichiers ici : voir '
    'pieces_jointes, créée par le socle).';

-- =====================================================================================
-- §7 — RISQUES — niveau FILIALE
-- Scénario de risque inspiré d'EBIOS RM, méthode F × G × M.
-- =====================================================================================

create table risques (
    id             id_metier   not null,
    filiale_id     id_metier   not null,
    nom            text        not null,
    f_frequence    numeric,
    g_gravite      numeric,
    m_maitrise     numeric,
    score_brut     numeric,
    score_residuel numeric,
    niveau         text,
    description    text,
    version        integer     not null default 1,
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    modifie_le     timestamptz,
    modifie_par    text,
    constraint pk_risques         primary key (id),
    constraint fk_risques_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_risques_nom     check (nom <> ''),
    constraint ck_risques_f       check (f_frequence is null or f_frequence >= 0),
    constraint ck_risques_g       check (g_gravite   is null or g_gravite   >= 0),
    -- Coefficient de maîtrise : 1 = pas maîtrisé, 0,05 = globalement maîtrisé. Une valeur
    -- supérieure à 1 aggraverait le risque brut, ce que la méthode n'admet pas.
    constraint ck_risques_m       check (m_maitrise is null or (m_maitrise >= 0 and m_maitrise <= 1)),
    constraint ck_risques_scores  check (
        (score_brut is null or score_brut >= 0) and (score_residuel is null or score_residuel >= 0)),
    constraint ck_risques_niveau  check (niveau is null or niveau in ('faible', 'élevé', 'critique'))
);

create index ix_risques_filiale on risques (filiale_id, niveau);

create trigger trg_risques_maj before update on risques
    for each row execute function f_maj_tracabilite();

comment on table risques is
    'Scénario de risque coté selon la méthode F × G × M (EBIOS RM). Identifiant "RISK-…". '
    'L''échelle de cotation est une décision de niveau Groupe (PLAN_SERVEUR §2.2) : sans '
    'échelle commune, les risques des filiales ne s''additionnent pas.';
comment on column risques.f_frequence is
    'Fréquence / vraisemblance. L''application propose 1 à 4 ; le schéma reste permissif '
    '(positif) pour absorber la reprise d''un export produit avec une autre échelle — le '
    'contrôle de l''échelle appartient au code applicatif, pas au schéma.';
comment on column risques.g_gravite is  'Gravité. Même remarque que f_frequence.';
comment on column risques.m_maitrise is 'Coefficient de maîtrise, entre 0 et 1 (1 = aucune maîtrise).';
comment on column risques.score_brut is
    'f_frequence × g_gravite. Colonne ordinaire et NON colonne générée : une colonne générée '
    'refuse toute valeur fournie à l''insertion, ce qui casserait la reprise d''un export '
    'grc-backup, où le score est présent dans le fichier.';
comment on column risques.score_residuel is 'score_brut × m_maitrise. Même remarque que score_brut.';
comment on column risques.niveau is
    'Niveau dérivé du score résiduel : faible (< 3) | élevé (3 à 7,9) | critique (>= 8). '
    'Stocké tel quel par l''application ; null tant qu''il n''a pas été calculé.';

-- =====================================================================================
-- §8 — ACTIFS — niveau FILIALE
-- =====================================================================================

create table actifs (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    nom         text        not null,
    type        text,
    criticite   text,
    responsable text,
    description text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_actifs           primary key (id),
    constraint fk_actifs_filiale   foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_actifs_nom       check (nom <> ''),
    -- Valeurs reprises MOT POUR MOT du DATA_MODEL.md §2, majuscules et accents compris.
    constraint ck_actifs_type      check (type is null or type in (
        'Matériel', 'Logiciel', 'Donnée', 'Service', 'Humain')),
    constraint ck_actifs_criticite check (criticite is null or criticite in (
        'faible', 'modérée', 'élevée', 'critique'))
);

create index ix_actifs_filiale on actifs (filiale_id, criticite);

create trigger trg_actifs_maj before update on actifs
    for each row execute function f_maj_tracabilite();

comment on table actifs is
    'Actif support du système d''information : matériel, logiciel, donnée, service, humain. '
    'Identifiant "ACTIF-…". Cible de l''analyse d''impact de la cartographie, via '
    'actif_dependances (§10).';
comment on column actifs.type is
    'Matériel | Logiciel | Donnée | Service | Humain. Casse et accents significatifs : ce sont '
    'les valeurs stockées par l''application, restituées telles quelles à l''export.';
comment on column actifs.criticite is
    'faible | modérée | élevée | critique — en minuscules ici, contrairement à la criticité des '
    'processus (§9) qui est capitalisée. La différence est HÉRITÉE du modèle navigateur et '
    'conservée à dessein : l''uniformiser casserait le round-trip grc-backup.';

-- =====================================================================================
-- §9 — PROCESSUS (BIA, ISO 22301) — niveau FILIALE
-- =====================================================================================

create table processus (
    id          id_metier   not null,
    filiale_id  id_metier   not null,
    nom         text        not null,
    criticite   text,
    rto         text,
    rpo         text,
    responsable text,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_processus         primary key (id),
    constraint fk_processus_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_processus_nom     check (nom <> '')
);

create index ix_processus_filiale on processus (filiale_id, criticite);

create trigger trg_processus_maj before update on processus
    for each row execute function f_maj_tracabilite();

comment on table processus is
    'Processus métier analysé au titre du bilan d''impact sur l''activité (BIA, ISO 22301). '
    'Identifiant "BIA-…" — et, pour les reprises anciennes, un identifiant SANS préfixe : le '
    'domaine id_metier est permissif pour cette raison (CONVENTIONS.md §2).';
comment on column processus.criticite is
    'Criticité du processus. Sans contrainte de valeurs, contrairement aux actifs : le '
    'DATA_MODEL.md la type en texte libre et l''application y écrit des libellés capitalisés '
    '(« Faible », « Modérée », « Élevée », « Critique »). Y poser un « check » ferait échouer '
    'la reprise d''exports anciens sans rien apporter au métier.';
comment on column processus.rto is
    'Objectif de délai de reprise, stocké tel qu''affiché (« 4 heures », « 0h (Immédiat - PRA '
    'Actif) »). Texte et non « interval » : c''est un LIBELLÉ choisi dans une liste, pas une '
    'durée calculée, et l''export doit le rendre à l''identique.';
comment on column processus.rpo is 'Objectif de perte de données maximale. Même remarque que rto.';

-- =====================================================================================
-- §10 — LIAISONS N-N
-- Les tableaux de chaînes du modèle navigateur deviennent de vraies tables de liaison,
-- contraintes des deux côtés (CONVENTIONS.md §7). Le dédoublonnage, jusqu'ici laissé au
-- code, est garanti par la clé primaire composite.
--
-- Régime commun (CONVENTIONS.md §3) : pas de colonne « version » — elle est portée par
-- l'entité parente — et traçabilité réduite à cree_le / cree_par. Aucune de ces tables ne
-- porte de colonne modifiable : une liaison se crée et se supprime, elle ne se modifie
-- pas. Elles n'ont donc ni modifie_le / modifie_par, ni déclencheur, conformément au §3
-- (« déclencheur f_maj_horodatage() SI la ligne est modifiable »).
--
-- « on delete cascade » des deux côtés : supprimer une extrémité supprime le LIEN, jamais
-- l'autre extrémité. C'est exactement le comportement « délier » des cascades du §8.
-- =====================================================================================

-- --- risques.exigences_liees[] -------------------------------------------------------
create table risque_exigences (
    risque_id   id_metier   not null,
    exigence_id id_metier   not null,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    constraint pk_risque_exigences          primary key (risque_id, exigence_id),
    constraint fk_risque_exigences_risque   foreign key (risque_id)
        references risques(id) on delete cascade,
    constraint fk_risque_exigences_exigence foreign key (exigence_id)
        references exigences(id) on delete cascade
);

-- Index de parcours inverse : sert la fiche d'une exigence, et la cascade déclenchée par
-- la suppression d'une exigence (le premier sens est couvert par la clé primaire).
create index ix_risque_exigences_exigence on risque_exigences (exigence_id);

comment on table risque_exigences is
    'Exigences couvertes par un scénario de risque (ex-tableau risques.exigences_liees[]). '
    'Pas de filiale_id : les deux extrémités sont déjà cloisonnées, la RLS s''applique par '
    'jointure (CONVENTIONS.md §16.5). Supprimer une exigence DÉLIE les risques ; supprimer un '
    'risque délie les exigences — aucune des deux entités n''en disparaît.';

-- --- actifs.risques_lies[] -----------------------------------------------------------
create table actif_risques (
    actif_id  id_metier   not null,
    risque_id id_metier   not null,
    cree_le   timestamptz not null default now(),
    cree_par  text        not null default f_utilisateur_courant(),
    constraint pk_actif_risques        primary key (actif_id, risque_id),
    constraint fk_actif_risques_actif  foreign key (actif_id)
        references actifs(id) on delete cascade,
    constraint fk_actif_risques_risque foreign key (risque_id)
        references risques(id) on delete cascade
);

create index ix_actif_risques_risque on actif_risques (risque_id);

comment on table actif_risques is
    'Risques pesant sur un actif (ex-tableau actifs.risques_lies[]). Supprimer un risque '
    'DÉLIE les actifs concernés, conformément au DATA_MODEL.md §3.';

-- --- processus.actifs_lies[] ---------------------------------------------------------
create table processus_actifs (
    processus_id id_metier   not null,
    actif_id     id_metier   not null,
    cree_le      timestamptz not null default now(),
    cree_par     text        not null default f_utilisateur_courant(),
    constraint pk_processus_actifs           primary key (processus_id, actif_id),
    constraint fk_processus_actifs_processus foreign key (processus_id)
        references processus(id) on delete cascade,
    constraint fk_processus_actifs_actif     foreign key (actif_id)
        references actifs(id) on delete cascade
);

create index ix_processus_actifs_actif on processus_actifs (actif_id);

comment on table processus_actifs is
    'Actifs dont dépend un processus métier (ex-tableau processus.actifs_lies[]). Support de '
    'l''analyse d''impact : c''est par cette liaison qu''une panne d''actif se traduit en '
    'processus critiques touchés, et qu''un actif dont dépendent au moins deux processus '
    'critiques est signalé comme point de défaillance unique (SPOF).';

-- --- actifs.dependances[] ------------------------------------------------------------
create table actif_dependances (
    actif_id       id_metier   not null,
    actif_cible_id id_metier   not null,
    type           text        not null default 'dep',
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    -- DÉROGATION ASSUMÉE au CONVENTIONS.md §7 (« clé primaire composite sur le COUPLE
    -- d'identifiants »), justifiée ici comme le §1 l'exige : la clé du modèle navigateur
    -- est le TRIPLET. Le frontend refuse un doublon sur (cible, type) — et donc autorise
    -- délibérément deux liens entre les deux mêmes actifs quand ils sont de natures
    -- différentes (« A est hébergé sur B » ET « A est sauvegardé par B », le second ne
    -- propageant pas de panne). Une clé sur le seul couple ferait échouer la reprise d'un
    -- export grc-backup contenant ce cas, par violation de clé primaire. L'intention du §7
    -- — un dédoublonnage garanti par le schéma et non par le code — est préservée : c'est
    -- exactement la règle de dédoublonnage du frontend qui est portée en contrainte.
    constraint pk_actif_dependances        primary key (actif_id, actif_cible_id, type),
    constraint fk_actif_dependances_actif  foreign key (actif_id)
        references actifs(id) on delete cascade,
    constraint fk_actif_dependances_cible  foreign key (actif_cible_id)
        references actifs(id) on delete cascade,
    -- Un actif ne dépend pas de lui-même (CONVENTIONS.md §7) : la cartographie boucle et
    -- l'analyse d'impact remonterait un rayon d'impact absurde.
    constraint ck_actif_dependances_boucle check (actif_id <> actif_cible_id),
    constraint ck_actif_dependances_type   check (type in ('dep', 'hosted', 'flux', 'backup'))
);

-- Les deux clés étrangères visent la même table : la cascade « purge des dépendances
-- entrantes » (DATA_MODEL.md §3) a besoin de cet index sur la seconde colonne, que la clé
-- primaire ne couvre pas.
create index ix_actif_dependances_cible on actif_dependances (actif_cible_id);

comment on table actif_dependances is
    'Dépendances typées entre actifs (ex-tableau actifs.dependances[], v9 du modèle '
    'navigateur). Une arête A → B se lit « A a besoin de B », SAUF pour le type "backup". '
    'Supprimer un actif purge ses dépendances DANS LES DEUX SENS — sortantes et entrantes — '
    'grâce aux deux "on delete cascade" : c''est la classe de défaut (arêtes orphelines) que '
    'le passage en base rend structurellement impossible.';
comment on column actif_dependances.actif_cible_id is
    'Actif dont dépend actif_id (le « to » du modèle navigateur).';
comment on column actif_dependances.type is
    'dep = dépend de | hosted = hébergé sur | flux = alimenté par (flux de données) | '
    'backup = sauvegardé par. Les trois premiers PROPAGENT une panne dans l''analyse '
    'd''impact ; "backup" ne la propage pas — il porte la restauration, pas la disponibilité.';

-- --- evaluations.mesure_ids[] --------------------------------------------------------
create table evaluation_mesures (
    evaluation_id id_metier   not null,
    mesure_id     id_metier   not null,
    -- Cette liaison porte un filiale_id, contrairement aux précédentes : l'une de ses
    -- extrémités (mesure_catalogue) est de niveau MIXTE, donc non cloisonnée par elle-même
    -- (CONVENTIONS.md §16.5). Sans cette colonne, la RLS ne saurait pas à quelle filiale
    -- rattacher le lien.
    filiale_id    id_metier   not null,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    constraint pk_evaluation_mesures primary key (evaluation_id, mesure_id),
    -- Clé étrangère COMPOSITE : le couple (évaluation, filiale) doit exister tel quel dans
    -- evaluations. C'est ce qui interdit à une ligne de liaison d'annoncer une filiale
    -- autre que celle de son évaluation — un tel écart serait une brèche de cloisonnement,
    -- la RLS de cette table filtrant sur filiale_id.
    constraint fk_evaluation_mesures_evaluation foreign key (evaluation_id, filiale_id)
        references evaluations (id, filiale_id) on delete cascade,
    -- Vise le CATALOGUE, jamais la mise en oeuvre (CONVENTIONS.md §16.3) : l'identifiant
    -- écrit dans un export grc-backup est celui du catalogue ; le traduire vers un "MMO-…"
    -- propre à la filiale exigerait une table de correspondance à la reprise.
    constraint fk_evaluation_mesures_mesure     foreign key (mesure_id)
        references mesure_catalogue(id) on delete cascade,
    constraint fk_evaluation_mesures_filiale    foreign key (filiale_id)
        references filiales(id) on delete restrict
);

create index ix_evaluation_mesures_filiale on evaluation_mesures (filiale_id, mesure_id);
create index ix_evaluation_mesures_mesure  on evaluation_mesures (mesure_id);

comment on table evaluation_mesures is
    'Couverture : « cette exigence de référentiel est couverte par ce contrôle » (ex-tableau '
    'evaluations.mesure_ids[], v12 du modèle navigateur — une exigence peut être couverte par '
    'PLUSIEURS mesures). Supprimer une mesure DÉLIE les évaluations (la ligne de liaison '
    'disparaît, l''évaluation reste) ; supprimer une évaluation retire ses liens. '
    'La propagation « au plus défavorable » se calcule à partir de cette liaison : statut le '
    'plus faible — conforme seulement si TOUTES le sont —, maturité la plus basse, '
    '« non applicable » neutre, « non évalué » ignoré.';
comment on column evaluation_mesures.filiale_id is
    'Filiale du lien, nécessairement celle de l''évaluation (garanti par la clé étrangère '
    'composite). Présent parce que mesure_catalogue est de niveau mixte.';

-- =====================================================================================
-- §11 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('002', 'Métier (noyau) : clients, personnes, exigences, catalogue et mise en oeuvre '
               'des mesures, évaluations, risques, actifs, processus, et leurs liaisons n-n')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Ordre inverse des créations. À n'exécuter qu'en développement : en production, ce bloc
-- détruit les données de conformité de toutes les filiales.
--
-- begin;
--   drop table if exists evaluation_mesures, actif_dependances, processus_actifs,
--                        actif_risques, risque_exigences cascade;
--   drop table if exists processus, actifs, risques, evaluations,
--                        mesure_mise_en_oeuvre, mesure_catalogue,
--                        exigences, personnes, clients cascade;
--   delete from migrations_schema where version = '002';
-- commit;
-- =====================================================================================
