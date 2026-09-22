-- =====================================================================================
--  061 — LES FICHES RÉFLEXES DE CRISE ENTRENT EN BASE
--
--  §0   Le périmètre de la migration — et la provenance « socle »
--  §1   Les trois tables — MIXTES, socle du Groupe surchargeable par filiale
--  §2   La portée d'une action suit celle de sa fiche
--  §3   Ce que toute table métier doit à trois garde-fous déjà posés
--  §4   Le socle du Groupe — sept fiches, vingt-neuf réflexes, sept contacts
--  §5   `type_entite`
--  §6   Cloisonnement
--  §7   Le garde-fou — il ÉPROUVE, il ne reconnaît pas un mot
--  §8   Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Utilisateur, 22/09/2026 : *« les fiches réflexes dans le module Cellule de crise
--  c'est très bien, mais ça serait top de pouvoir créer et modifier les fiches réflexes,
--  car elles sont à adapter en fonction de l'existant. »*
--
--  Elles étaient **écrites en dur** dans `js/modules/crise.js` : six rôles, vingt-cinq
--  réflexes, sept contacts d'urgence — dont TROIS lignes de tirets bas que personne ne
--  pouvait remplir, et qui imitaient une donnée au lieu de dire « à compléter ». Un groupe de vingt filiales n'a pas une seule organisation de crise,
--  et une fiche réflexe qui ne décrit pas l'organisation réelle est **pire qu'absente** :
--  on la sort de l'armoire au pire moment, et elle envoie appeler quelqu'un qui n'existe
--  pas.
--
--  ── LE PATRON EST CELUI DU SOCLE DE RISQUES ET DES ÉCHELLES ──────────────────────
--
--  Tables **MIXTES** : `filiale_id` nul = socle du Groupe, renseigné = fiche propre à une
--  filiale. Le Groupe pose une base — celle qui était en dur —, chaque site l'adapte sans
--  la perdre, et une filiale qui ne décide rien continue d'avoir des fiches.
--
--  ⚠️ **Une fiche LOCALE remplace celle du socle pour le même rôle**, elle ne s'y ajoute
--  pas : deux fiches pour « Responsable IT / SSI » au moment d'une crise, c'est deux
--  colonnes qui se contredisent sous les yeux de quelqu'un qui n'a pas le temps de
--  choisir. C'est l'écran qui applique la règle, et le §7 la mesure.
--
--  ── ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS ───────────────────────────────────────
--
--  **Elle ne verrouille pas une fiche publiée.** Les échelles de cotation (`049`) sont
--  figées à leur entrée en vigueur, et c'était nécessaire : une cotation se rattache à
--  l'échelle qui l'a produite, et modifier celle-ci rendrait les cotations incomparables.
--  Rien ne se rattache à une fiche réflexe — elle se lit, elle ne produit pas de donnée.
--  Ce qu'on veut savoir d'elle — *qu'a-t-elle dit, et depuis quand ?* — est déjà porté
--  par le **journal d'audit**, qui garde les valeurs avant et après de chaque
--  modification, et par la date d'impression que l'écran porte.
--
--  *Ajouter une machine de révision qui ne sert rien serait du zèle, et le zèle se paie
--  en complexité qu'on ne sait plus retirer.*
--
--  ── ⚠️ ET LE RATTACHEMENT AU RÔLE DE LA CELLULE EST EXPLICITE ───────────────────
--
--  Une fiche vise un `role`, apparié à `crise.role` — comme aujourd'hui, où l'appariement
--  se fait par chaîne de caractères. Ce qui change : l'écran PROPOSE les rôles réellement
--  présents dans la cellule de crise de la filiale, au lieu de laisser deviner. Sans
--  cela, renommer un rôle de la cellule vide le bloc « Titulaire » de sa fiche **sans un
--  mot**, et personne ne s'en aperçoit avant la crise.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION, ET LA PROVENANCE
-- -------------------------------------------------------------------------------------
-- Le §1 crée des tables et valide leurs clés contre `filiales`, cloisonnée ; le §4 sème
-- le socle. Sans périmètre déclaré, la validation ne verrait aucune ligne et la migration
-- passerait pour un mauvais motif (`CONVENTIONS.md` §42).
--
-- ⚠️ **La provenance se DÉCLARE, elle ne s'écrit pas dans les `insert`.** Le déclencheur
-- `f_marquer_provenance()` écrase ce que l'appelant met dans la colonne : la marque est
-- inforgeable par construction, et c'est la condition constitutive n° 1 du jeu de
-- découverte. `socle` est la quatrième valeur, née avec la `049` — une ligne livrée par
-- une migration n'est ni saisie, ni de découverte, ni reprise.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-061', true);
    perform set_config('grc.filiales',
                       coalesce((select string_agg(id, ',') from filiales), ''), true);
    perform set_config('grc.administration_groupe', 'oui', true);
    perform set_config('grc.provenance', 'socle', true);
end;
$$;

-- =====================================================================================
-- §1 — LES TROIS TABLES
-- =====================================================================================

create table if not exists fiches_reflexes (
    id          id_metier   not null default f_generer_id('FICHE'),
    -- Nul = socle du Groupe. Renseigné = fiche propre à une filiale.
    -- ⚠️ Domaine `id_metier` et non `text` nu : constat **Q-310**, qui était **Q-194**
    -- rejoué sur la table que la même migration venait de créer.
    filiale_id  id_metier,
    -- Le rôle de la cellule de crise que cette fiche outille. Apparié à `crise.role`,
    -- en texte : c'est ainsi que la cellule est modélisée depuis la migration `003`, et
    -- lui imposer une clé étrangère interdirait d'écrire la fiche AVANT de désigner le
    -- titulaire — c'est-à-dire au moment où on la prépare.
    role        text        not null,
    -- L'intitulé porté par la carte imprimée. Court À DESSEIN : une fiche réflexe se
    -- lit debout, dans l'urgence.
    titre       text        not null,
    ordre       integer     not null default 100,
    -- ⚠️ **La fiche « commune » n'est pas la première de la liste, c'est une AUTRE
    -- CHOSE**, et une colonne le dit plutôt qu'une position. Elle ne vise aucun rôle —
    -- elle s'adresse à tout le monde —, elle n'a donc pas de titulaire, et elle
    -- s'imprime en pleine largeur en tête. La déduire de « ordre = 0 » aurait marché
    -- jusqu'au jour où quelqu'un réordonne ses fiches, et le produit aurait alors
    -- cherché un titulaire pour « Réflexes communs à tous ».
    commun      boolean     not null default false,
    -- Ce que la fiche dit en plus de ses réflexes — un rappel, un numéro, une consigne
    -- de la direction.
    notes       text,
    actif       boolean     not null default true,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_fiches_reflexes      primary key (id),
    constraint fk_fiches_reflexes_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint ck_fiches_reflexes_role  check (role <> ''),
    constraint ck_fiches_reflexes_titre check (titre <> ''),
    constraint ck_fiches_reflexes_ordre check (ordre between 0 and 9999),
    constraint ck_fiches_reflexes_longueurs check (
        length(role) <= 120 and length(titre) <= 120
        and (notes is null or length(notes) <= 2000))
);

-- ⚠️ **`nulls not distinct`, et c'est la pièce maîtresse.** Une unicité ordinaire traite
-- deux NULL comme distincts : `unique (filiale_id, role)` laisserait le socle du Groupe
-- — dont le `filiale_id` est nul **par construction** — porter deux fiches pour le même
-- rôle, sans un mot. C'est le piège du `CONVENTIONS.md` §45, rencontré pour la troisième
-- fois, et la réponse est la même qu'à la `049`.
create unique index if not exists uq_fiches_reflexes_role
    on fiches_reflexes (filiale_id, lower(role)) nulls not distinct;

create index if not exists ix_fiches_reflexes_filiale
    on fiches_reflexes (filiale_id, ordre);

create trigger trg_fiches_reflexes_maj before update on fiches_reflexes
    for each row execute function f_maj_tracabilite();
alter table fiches_reflexes enable always trigger trg_fiches_reflexes_maj;

comment on table fiches_reflexes is
    'Fiche réflexe de crise : les gestes prioritaires d''un rôle, à faire sans réfléchir. '
    'Table MIXTE — filiale_id nul = socle du Groupe, renseigné = fiche propre à une '
    'filiale, qui REMPLACE celle du socle pour le même rôle. ⚠️ Elles étaient écrites en '
    'dur dans js/modules/crise.js jusqu''au 22/09/2026 : un groupe de vingt filiales n''a '
    'pas une seule organisation de crise, et une fiche qui ne décrit pas l''organisation '
    'réelle est pire qu''absente — on la sort au pire moment.';
comment on column fiches_reflexes.role is
    'Rôle de la cellule de crise outillé par cette fiche, apparié à crise.role EN TEXTE. '
    'Pas de clé étrangère : cela interdirait d''écrire la fiche avant de désigner son '
    'titulaire, c''est-à-dire au moment où on la prépare.';

create table if not exists fiche_reflexe_actions (
    id          id_metier   not null default f_generer_id('FREF'),
    -- ⚠️ Portée RECOPIÉE de la fiche, et tenue par le déclencheur du §2 : une clé
    -- étrangère COMPOSITE ne peut pas le dire, parce que `MATCH SIMPLE` dispense de
    -- contrôle dès qu'une colonne est nulle — et `filiale_id` l'est pour tout le socle
    -- (`CONVENTIONS.md` §45).
    filiale_id  id_metier,
    fiche_id    id_metier   not null,
    ordre       integer     not null default 100,
    texte       text        not null,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_fiche_reflexe_actions primary key (id),
    constraint fk_fiche_reflexe_actions_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- Clé SIMPLE et non composite : la cible est MIXTE, et une clé composite depuis une
    -- ligne de filiale rendrait le socle du Groupe inatteignable (même arbitrage qu'à
    -- `echelle_niveaux.echelle_id`).
    constraint fk_fiche_reflexe_actions_fiche foreign key (fiche_id)
        references fiches_reflexes (id) on delete cascade,
    constraint ck_fiche_reflexe_actions_texte check (texte <> ''),
    constraint ck_fiche_reflexe_actions_ordre check (ordre between 0 and 9999),
    constraint ck_fiche_reflexe_actions_longueur check (length(texte) <= 600)
);

create index if not exists ix_fiche_reflexe_actions_fiche
    on fiche_reflexe_actions (fiche_id, ordre);

create trigger trg_fiche_reflexe_actions_maj before update on fiche_reflexe_actions
    for each row execute function f_maj_tracabilite();
alter table fiche_reflexe_actions enable always trigger trg_fiche_reflexe_actions_maj;

comment on table fiche_reflexe_actions is
    'Les réflexes d''une fiche, ordonnés. ⚠️ Le TEXTE est borné à 600 caractères À '
    'DESSEIN : un réflexe qui ne tient pas en trois lignes n''est pas un réflexe, c''est '
    'une procédure — et on ne lit pas une procédure pendant les dix premières minutes '
    'd''une crise.';

create table if not exists contacts_urgence (
    id          id_metier   not null default f_generer_id('CTCU'),
    filiale_id  id_metier,
    intitule    text        not null,
    coordonnee  text,
    ordre       integer     not null default 100,
    actif       boolean     not null default true,
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_contacts_urgence primary key (id),
    constraint fk_contacts_urgence_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint ck_contacts_urgence_intitule check (intitule <> ''),
    constraint ck_contacts_urgence_ordre    check (ordre between 0 and 9999),
    constraint ck_contacts_urgence_longueurs check (
        length(intitule) <= 200 and (coordonnee is null or length(coordonnee) <= 200))
);

create index if not exists ix_contacts_urgence_filiale
    on contacts_urgence (filiale_id, ordre);

create trigger trg_contacts_urgence_maj before update on contacts_urgence
    for each row execute function f_maj_tracabilite();
alter table contacts_urgence enable always trigger trg_contacts_urgence_maj;

comment on table contacts_urgence is
    'Contacts d''urgence de la fiche réflexe. Table MIXTE : les références publiques '
    '(CERT-FR, CNIL, cybermalveillance) sont au socle du Groupe ; l''assurance cyber, '
    'l''infogérant et le prestataire de réponse à incident sont propres à chaque filiale. '
    '⚠️ « coordonnee » est NULLABLE à dessein : le socle livre trois lignes à remplir, et '
    'une ligne vide qui se voit vaut mieux qu''une ligne absente qu''on oublie.';
comment on column contacts_urgence.coordonnee is
    'Numéro, adresse ou site. Nul = « à compléter » : c''est le cas des trois lignes que '
    'le socle livre en attente : assurance cyber, infogérant, prestataire de réponse à
   incident.';

-- =====================================================================================
-- §2 — LA PORTÉE D'UNE ACTION SUIT CELLE DE SA FICHE
-- -------------------------------------------------------------------------------------
-- ⚠️ **Une clé étrangère composite ne suffit PAS ici**, et le motif est celui du
-- `CONVENTIONS.md` §45 : `MATCH SIMPLE` dispense de tout contrôle dès qu'une colonne de
-- la clé est nulle — et `filiale_id` l'est pour **tout le socle du Groupe**. Une action
-- de filiale pourrait donc se rattacher à une fiche du socle, et réciproquement, sans
-- qu'aucune contrainte déclarative ne le voie.
--
-- Le déclencheur, lui, le voit. Il refuse aussi une fiche INVISIBLE dans le périmètre de
-- la session : la clé simple ne distingue pas « inexistante » de « chez la voisine ».
-- =====================================================================================

create or replace function f_action_suit_sa_fiche()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_portee  text;
    v_trouvee boolean;
begin
    select f.filiale_id, true into v_portee, v_trouvee
      from fiches_reflexes f where f.id = new.fiche_id;

    if not coalesce(v_trouvee, false) then
        raise exception
            'fiche_reflexe_actions : la fiche « % » est introuvable dans le périmètre de '
            'cette session.', new.fiche_id
            using errcode = '23514',
                  hint = 'Un réflexe ne se rattache qu''à une fiche que la session peut '
                         'lire : le socle du Groupe, ou une fiche de sa propre filiale.';
    end if;

    if new.filiale_id is distinct from v_portee then
        raise exception
            'fiche_reflexe_actions : la portée d''un réflexe (%) doit être celle de sa '
            'fiche (%).', coalesce(new.filiale_id, 'Groupe'), coalesce(v_portee, 'Groupe')
            using errcode = '23514',
                  hint = 'Une clé étrangère composite ne peut pas le dire : MATCH SIMPLE '
                         'dispense de contrôle dès qu''une colonne est nulle, et '
                         'filiale_id l''est pour tout le socle (CONVENTIONS.md §45).';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_fiche_reflexe_actions_portee on fiche_reflexe_actions;
create trigger trg_fiche_reflexe_actions_portee
    before insert or update of filiale_id, fiche_id on fiche_reflexe_actions
    for each row execute function f_action_suit_sa_fiche();
alter table fiche_reflexe_actions
    enable always trigger trg_fiche_reflexe_actions_portee;

-- =====================================================================================
-- §3 — CE QUE TOUTE TABLE MÉTIER DOIT AUX GARDE-FOUS DÉJÀ POSÉS
-- -------------------------------------------------------------------------------------
-- La marque de provenance (`032`), la traçabilité à l'insertion (§18.1), les
-- déclencheurs de pièces jointes (§40) et le figeage de portée. Les installateurs
-- DÉCOUVRENT dans le catalogue : on les APPELLE, on ne leur donne pas de liste (§40.3).
-- =====================================================================================

alter table fiches_reflexes       add column if not exists provenance provenance_ligne not null;
alter table fiche_reflexe_actions add column if not exists provenance provenance_ligne not null;
alter table contacts_urgence      add column if not exists provenance provenance_ligne not null;

do $$
declare v_table text;
begin
    foreach v_table in array array['fiches_reflexes', 'fiche_reflexe_actions',
                                   'contacts_urgence'] loop
        execute format('drop trigger if exists trg_%s_provenance on %I', v_table, v_table);
        execute format('create trigger trg_%s_provenance before insert on %I '
                       'for each row execute function f_marquer_provenance()',
                       v_table, v_table);
        execute format('alter table %I enable always trigger trg_%s_provenance',
                       v_table, v_table);
    end loop;
end;
$$;

do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Traçabilité à l''insertion : % table(s) équipée(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §4 — LE SOCLE DU GROUPE
-- -------------------------------------------------------------------------------------
-- ⚠️ **Le contenu est celui qui était en dur** dans `js/modules/crise.js`, engendré
-- depuis ce fichier et non retranscrit : six rôles, vingt-cinq réflexes, sept contacts —
-- plus les QUATRE réflexes communs, qui n'étaient même pas dans la constante : ils
-- vivaient dans le GABARIT de `renderFiches()`, en dur au milieu du balisage.
-- Une transcription à la main aurait perdu un réflexe sans que personne le voie — et
-- c'est le réflexe perdu qu'on cherchera le jour venu.
--
-- ⚠️ **Semé PUIS vérifié** : le §4 bis recompte, et refuse la migration si le compte ne
-- tombe pas. Un semis silencieusement partiel est la forme la plus discrète du défaut.
-- =====================================================================================

with souhaite (rang, role, titre) as (values
  (0, 'Tous', 'Réflexes communs à tous'),
  (1, 'Directeur de crise (Décisionnel)', 'Directeur de crise'),
  (2, 'Responsable IT / SSI (Opérationnel)', 'Responsable IT / SSI'),
  (3, 'Responsable Communication', 'Responsable Communication'),
  (4, 'Responsable Juridique / RH', 'Juridique / RH'),
  (5, 'Expert technique (Interne/Externe)', 'Expert technique'),
  (6, 'Autre', 'Logistique / Sécurité physique')
), inseres as (
    insert into fiches_reflexes (filiale_id, role, titre, ordre, commun)
    select null, s.role, s.titre, s.rang * 10, s.rang = 0
      from souhaite s
     where not exists (select 1 from fiches_reflexes f
                        where f.filiale_id is null and lower(f.role) = lower(s.role))
    returning id, role
)
select count(*) from inseres;

with souhaite (rang_fiche, rang, texte) as (values
  -- ⚠️ Ces quatre-là n'étaient même pas dans la constante `FICHES` : ils vivaient
  --    dans le GABARIT de `renderFiches()`, en dur au milieu du balisage. Un réflexe
  --    écrit dans un gabarit est un réflexe que personne ne peut adapter.
  (0, 1, 'Rester calme et méthodique ; ne payer aucune rançon sans décision de la cellule.'),
  (0, 2, 'Utiliser les canaux de secours (téléphone, hors SI compromis) ; considérer la messagerie professionnelle comme compromise.'),
  (0, 3, 'Tout horodater dans une main courante unique (heure, fait, décision, auteur).'),
  (0, 4, 'Ne rien communiquer à l''extérieur sans validation du Directeur de crise.'),
  (1, 1, 'Activer officiellement la cellule de crise et consigner l''heure de déclenchement.'),
  (1, 2, 'Réunir les membres via un canal de secours (téléphone / SMS) si la messagerie est indisponible.'),
  (1, 3, 'Qualifier la gravité et décider du périmètre à isoler ou à arrêter.'),
  (1, 4, 'Arbitrer la communication (interne, clients, presse) et les déclarations réglementaires.'),
  (1, 5, 'Décider de l''activation du PRA, du recours aux prestataires et à l''assurance cyber.'),
  (1, 6, 'Faire tenir une main courante horodatée de toutes les décisions.'),
  (2, 1, 'Isoler du réseau les systèmes touchés (débrancher le câble, couper Wi-Fi / VPN) SANS les éteindre — préserver la mémoire et les preuves.'),
  (2, 2, 'Préserver les preuves : journaux, images disque ; ne rien supprimer ni réinstaller dans l''urgence.'),
  (2, 3, 'Identifier le point d''entrée (hameçonnage, faille, compte compromis) et stopper la propagation.'),
  (2, 4, 'Réinitialiser les comptes à privilèges, révoquer sessions, clés et secrets exposés.'),
  (2, 5, 'Vérifier l''intégrité et l''isolement des sauvegardes AVANT toute restauration.'),
  (2, 6, 'Rendre compte de l''état technique au Directeur de crise à intervalles réguliers.'),
  (3, 1, 'Préparer des éléments de langage validés par la Direction et le Juridique.'),
  (3, 2, 'Diffuser des consignes internes (ne pas parler à la presse, vigilance e-mails et pièces jointes).'),
  (3, 3, 'Centraliser les sollicitations presse et clients via un point de contact unique.'),
  (3, 4, 'Ne communiquer que des informations confirmées ; éviter tout détail technique exploitable.'),
  (4, 1, 'Évaluer les obligations de notification : CERT-FR / ANSSI (NIS2, alerte sous 24 h) ; CNIL (RGPD, sous 72 h si données personnelles).'),
  (4, 2, 'Préparer l''information des personnes concernées en cas de risque élevé (RGPD).'),
  (4, 3, 'Conserver les preuves à valeur probante et envisager le dépôt de plainte.'),
  (4, 4, 'Mobiliser l''assurance cyber et vérifier les obligations contractuelles envers les clients.'),
  (5, 1, 'Mener l''analyse : recherche du patient zéro et des indicateurs de compromission (IOC).'),
  (5, 2, 'Contenir puis éradiquer la menace ; assainir avant toute remise en service.'),
  (5, 3, 'Documenter les IOC et les partager pour renforcer la surveillance.'),
  (6, 1, 'Sécuriser les locaux et les accès physiques si nécessaire.'),
  (6, 2, 'Assurer la logistique de la cellule (salle de repli, moyens de secours, intendance).')
), cible as (
    select s.rang, s.texte, f.id as fiche_id
      from souhaite s
      join (values
  (0, 'Tous', 'Réflexes communs à tous'),
  (1, 'Directeur de crise (Décisionnel)', 'Directeur de crise'),
  (2, 'Responsable IT / SSI (Opérationnel)', 'Responsable IT / SSI'),
  (3, 'Responsable Communication', 'Responsable Communication'),
  (4, 'Responsable Juridique / RH', 'Juridique / RH'),
  (5, 'Expert technique (Interne/Externe)', 'Expert technique'),
  (6, 'Autre', 'Logistique / Sécurité physique')
           ) as r(rang, role, titre) on r.rang = s.rang_fiche
      join fiches_reflexes f on f.filiale_id is null and lower(f.role) = lower(r.role)
)
insert into fiche_reflexe_actions (filiale_id, fiche_id, ordre, texte)
select null, c.fiche_id, c.rang * 10, c.texte
  from cible c
 where not exists (select 1 from fiche_reflexe_actions a
                    where a.fiche_id = c.fiche_id and a.ordre = c.rang * 10);

with souhaite (rang, intitule, coordonnee) as (values
(1, 'CERT-FR / ANSSI (déclaration d''incident)', 'cert.ssi.gouv.fr'),
  (2, 'CNIL (violation de données, sous 72 h)', 'cnil.fr — notifier une violation'),
  (3, 'Assistance cybermalveillance', 'cybermalveillance.gouv.fr'),
  (4, 'Forces de l''ordre / dépôt de plainte', '17 (police-secours)'),
  (5, 'Assurance cyber (police n° ____)', '______________________'),
  (6, 'Infogérant / Hébergeur', '______________________'),
  (7, 'Prestataire réponse à incident', '______________________')
)
insert into contacts_urgence (filiale_id, intitule, coordonnee, ordre)
select null, s.intitule,
       -- ⚠️ Les trois lignes de tirets bas du code d'origine deviennent des VIDES
       --    ASSUMÉS. Une ligne « ______________________ » n'est pas une coordonnée :
       --    elle imite une donnée. `null` se lit « à compléter », et l'écran le dit.
       case when s.coordonnee ~ '^_+$' then null else s.coordonnee end,
       s.rang * 10
  from souhaite s
 where not exists (select 1 from contacts_urgence c
                    where c.filiale_id is null and c.intitule = s.intitule);

-- ── §4 bis — LE SEMIS SE VÉRIFIE, il ne se suppose pas ───────────────────────────────
do $$
declare
    v_fiches   integer;
    v_actions  integer;
    v_contacts integer;
begin
    select count(*) into v_fiches   from fiches_reflexes       where filiale_id is null;
    select count(*) into v_actions  from fiche_reflexe_actions where filiale_id is null;
    select count(*) into v_contacts from contacts_urgence      where filiale_id is null;
    if v_fiches < 7 or v_actions < 29 or v_contacts < 7 then
        raise exception 'Le socle des fiches réflexes est INCOMPLET : % fiche(s), '
                        '% réflexe(s), % contact(s) — attendu au moins 7 / 29 / 7. '
                        'Un semis partiel livre une fiche à laquelle il manque le geste '
                        'qu''on cherchera le jour venu.', v_fiches, v_actions, v_contacts;
    end if;
    raise notice 'Socle des fiches réflexes : % fiches, % réflexes, % contacts.',
                 v_fiches, v_actions, v_contacts;
end;
$$;

-- =====================================================================================
-- §5 — `type_entite` GAGNE TROIS VALEURS
-- -------------------------------------------------------------------------------------
-- Sans elles, la table est INCRÉABLE : toute création écrit au journal, et
-- `journal_audit.entite_type` porte ce domaine. Le refus arrive en 400 « Une valeur de
-- l'enregistrement n'est pas admise », qui ne désigne rien (`CONVENTIONS.md` §40.1).
-- =====================================================================================

do $$
declare
    v_def text;
    v_nom text;
begin
    select pg_get_constraintdef(oid), conname into v_def, v_nom
      from pg_constraint
     where contypid = 'type_entite'::regtype and contype = 'c';
    if v_def is null then
        raise exception 'Le domaine type_entite est introuvable : 061 suppose 001.';
    end if;
    if v_def like '%fiches_reflexes%' then
        raise notice 'type_entite porte déjà les valeurs de 061.';
    else
        execute 'alter domain type_entite drop constraint ' || quote_ident(v_nom);
        execute 'alter domain type_entite add constraint type_entite_check check ('
             || replace(substring(v_def from 7), ']))',
                        ', ''fiches_reflexes''::text, ''fiche_reflexe_actions''::text, '
                        '''contacts_urgence''::text]))')
             || ')';
    end if;
end;
$$;

do $$
begin
    if (select pg_get_constraintdef(oid) from pg_constraint
         where contypid = 'type_entite'::regtype and contype = 'c')
       not like '%contacts_urgence%'
    then
        raise exception 'type_entite n''a pas gagné les trois valeurs de 061 : la '
                        'substitution n''a pas mordu, et les tables seraient INCRÉABLES.';
    end if;
end;
$$;

-- =====================================================================================
-- §6 — CLOISONNEMENT — le patron MIXTE
-- -------------------------------------------------------------------------------------
-- Le socle du Groupe (filiale_id nul) est LISIBLE de toutes les filiales : c'est ce qui
-- permet à une filiale qui ne décide rien d'avoir quand même des fiches. Il n'est
-- ÉCRIVABLE que par l'administration Groupe. Une fiche locale n'est lisible et écrivable
-- que de sa filiale.
-- =====================================================================================

alter table fiches_reflexes       enable row level security;
alter table fiches_reflexes       force  row level security;
alter table fiche_reflexe_actions enable row level security;
alter table fiche_reflexe_actions force  row level security;
alter table contacts_urgence      enable row level security;
alter table contacts_urgence      force  row level security;

do $$
declare
    v_table text;
begin
    foreach v_table in array array['fiches_reflexes', 'fiche_reflexe_actions',
                                   'contacts_urgence'] loop
        execute format('drop policy if exists pol_%s_lecture on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_ajout on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_maj on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_suppression on %I', v_table, v_table);

        execute format(
            'create policy pol_%s_lecture on %I for select using '
            '(case when filiale_id is null then true '
            '      else filiale_id = any (f_filiales_lecture()) end)', v_table, v_table);
        execute format(
            'create policy pol_%s_ajout on %I for insert with check '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end)', v_table, v_table);
        execute format(
            'create policy pol_%s_maj on %I for update using '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end) with check '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end)', v_table, v_table);
        execute format(
            'create policy pol_%s_suppression on %I for delete using '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end)', v_table, v_table);

        execute format('grant select, insert, update, delete on %I to grc_app', v_table);
    end loop;
end;
$$;

comment on policy pol_fiches_reflexes_lecture on fiches_reflexes is
    'Le socle du Groupe (filiale_id nul) est lisible de TOUTES les filiales : c''est ce '
    'qui donne des fiches à une filiale qui n''a rien décidé. Une fiche LOCALE ne l''est '
    'que de sa filiale — et c''est la barrière qui rend inoffensive la clé simple du §2.';

-- Le figeage de portée, et les déclencheurs de pièces jointes. ⚠️ APRÈS le §6 :
-- `f_poser_declencheurs_pieces()` découvre les tables porteuses par un prédicat dont
-- l'une des conditions est « la politique de SUPPRESSION est cloisonnée ». Appelée avant
-- que les politiques existent, elle ne voit pas les tables neuves, équipe toutes les
-- autres, rend un compte plausible — et les laisse démunies SANS UNE ERREUR (§40.2).
select f_poser_portee_figee();
-- ⚠️ **`f_armer_declencheurs()` N'EST PAS DÉCORATIF.** `f_poser_portee_figee()` crée ses
-- déclencheurs en armement « origin » — le défaut de PostgreSQL —, et un déclencheur
-- armé en « origin » est neutralisé par « set session_replication_role = replica », avec
-- la garantie qu'il porte. Trouvé par `f_verifier_declencheurs()`, qui a refusé le
-- déploiement sur les TROIS tables (`CONVENTIONS.md` §19.4, constat Q-281).
select f_armer_declencheurs();

do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §6 bis — LE REGISTRE DE L'ARTICLE 30 DU PRODUIT LUI-MÊME
-- -------------------------------------------------------------------------------------
-- ⚠️ **Deux colonnes demandent une vraie décision, et ce sont celles des contacts.**
-- « Assurance cyber (police n° ____) » et « Prestataire réponse à incident » se
-- remplissent avec un NOM et un NUMÉRO DE PORTABLE — c'est même leur objet. Ce sont donc
-- des données personnelles, en régime « signaler » : les remplacer détruirait le contact
-- au moment où on en a besoin, et le produit ne peut pas décider à la place d'un humain.
-- =====================================================================================

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('fiches_reflexes', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('fiches_reflexes', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Portée de la ligne : nul = socle du Groupe.'),
  ('fiches_reflexes', 'role', 'non_personnelle', null, null, null, null,
   'Rôle de la cellule de crise : une FONCTION, jamais une personne. Le titulaire vit '
   'dans « crise », qui est déjà au registre.'),
  ('fiches_reflexes', 'titre', 'non_personnelle', null, null, null, null,
   'Intitulé de la carte imprimée.'),
  ('fiches_reflexes', 'ordre', 'non_personnelle', null, null, null, null,
   'Rang d''affichage.'),
  ('fiches_reflexes', 'notes', 'personnelle',
   'Consigner ce que la fiche dit en plus de ses réflexes — un rappel, une consigne.',
   'Intérêt légitime', 1095, 'signaler',
   'SAISIE LIBRE dont le sujet est la conduite de crise, pas une personne — mais un nom '
   'y figure souvent (« prévenir M. Ollier avant toute communication »). Le remplacer '
   'détruirait la consigne au moment où on la lit. Régime « signaler ».'),
  ('fiches_reflexes', 'actif', 'non_personnelle', null, null, null, null,
   'Booléen d''affichage.'),
  ('fiches_reflexes', 'commun', 'non_personnelle', null, null, null, null,
   'Booléen : la fiche s''adresse à TOUT LE MONDE et ne vise aucun rôle. Elle n''a donc '
   'pas de titulaire, et s''imprime en pleine largeur en tête.'),
  ('fiches_reflexes', 'provenance', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : d''où vient la ligne (saisie / decouverte / reprise / socle).'),
  ('fiches_reflexes', 'version', 'non_personnelle', null, null, null, null,
   'Compteur de verrouillage optimiste.'),
  ('fiches_reflexes', 'cree_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('fiches_reflexes', 'cree_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),
  ('fiches_reflexes', 'modifie_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('fiches_reflexes', 'modifie_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),

  ('fiche_reflexe_actions', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit.'),
  ('fiche_reflexe_actions', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Portée de la ligne, recopiée de sa fiche.'),
  ('fiche_reflexe_actions', 'fiche_id', 'non_personnelle', null, null, null, null,
   'Référence à la fiche porteuse.'),
  ('fiche_reflexe_actions', 'ordre', 'non_personnelle', null, null, null, null,
   'Rang du réflexe dans la fiche.'),
  ('fiche_reflexe_actions', 'texte', 'personnelle',
   'Le geste à faire, tel qu''on le lira debout, dans l''urgence.',
   'Intérêt légitime', 1095, 'signaler',
   'SAISIE LIBRE dont le sujet est un GESTE, pas une personne — mais un nom y figure '
   'parfois (« appeler Mme Ferrand avant d''isoler la production »). Le remplacer '
   'détruirait le réflexe. Régime « signaler » : le produit montre, un humain tranche.'),
  ('fiche_reflexe_actions', 'provenance', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : d''où vient la ligne.'),
  ('fiche_reflexe_actions', 'version', 'non_personnelle', null, null, null, null,
   'Compteur de verrouillage optimiste.'),
  ('fiche_reflexe_actions', 'cree_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('fiche_reflexe_actions', 'cree_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),
  ('fiche_reflexe_actions', 'modifie_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('fiche_reflexe_actions', 'modifie_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),

  ('contacts_urgence', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit.'),
  ('contacts_urgence', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Portée de la ligne : nul = socle du Groupe.'),
  ('contacts_urgence', 'intitule', 'personnelle',
   'Nommer qui appeler pendant une crise.',
   'Intérêt légitime', 1095, 'signaler',
   '⚠️ Les lignes du SOCLE nomment des organismes (CERT-FR, CNIL) ; celles d''une '
   'filiale nomment souvent une PERSONNE — « Jean Ollier, astreinte infogérance ». '
   'Régime « signaler » : anonymiser détruirait le contact au moment où on en a besoin, '
   'et le produit ne peut pas décider à la place d''un humain.'),
  ('contacts_urgence', 'coordonnee', 'personnelle',
   'Joindre ce contact pendant une crise.',
   'Intérêt légitime', 1095, 'signaler',
   '⚠️ Un NUMÉRO DE PORTABLE personnel y figure presque toujours : c''est même l''objet '
   'd''un contact d''urgence. Même régime que l''intitulé, et pour le même motif.'),
  ('contacts_urgence', 'ordre', 'non_personnelle', null, null, null, null,
   'Rang d''affichage.'),
  ('contacts_urgence', 'actif', 'non_personnelle', null, null, null, null,
   'Booléen d''affichage.'),
  ('contacts_urgence', 'provenance', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : d''où vient la ligne.'),
  ('contacts_urgence', 'version', 'non_personnelle', null, null, null, null,
   'Compteur de verrouillage optimiste.'),
  ('contacts_urgence', 'cree_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('contacts_urgence', 'cree_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.'),
  ('contacts_urgence', 'modifie_le', 'non_personnelle', null, null, null, null,
   'Horodatage technique.'),
  ('contacts_urgence', 'modifie_par', 'personnelle',
   'Traçabilité de l''écriture, exigée de toute table métier (ISO 27001 A.8.15).',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de l''utilisateur, comme sur toute table du schéma.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §7 — LE GARDE-FOU — IL ÉPROUVE, IL NE RECONNAÎT PAS UN MOT
-- -------------------------------------------------------------------------------------
-- Quatre propriétés, et chacune ferme un défaut qui se verrait **le jour de la crise**,
-- c'est-à-dire trop tard :
--
--  1. le SOCLE existe et il est complet — six fiches au moins, et chacune porte au moins
--     un réflexe. Une fiche vide imprimée est pire qu'une fiche absente : on la sort de
--     l'armoire et on y cherche un geste qui n'y est pas ;
--  2. une fiche ne porte pas deux fois le même rôle dans la même portée — l'unicité
--     `nulls not distinct`, ÉPROUVÉE et non relue ;
--  3. la portée d'un réflexe suit celle de sa fiche — le déclencheur du §2 est ARMÉ,
--     et armé en « always » ;
--  4. un réflexe vide est refusé.
--
-- ⚠️ **Il n'écrit RIEN** : `f_verifier_schema()` est `stable`, et c'est ce qui l'empêche
-- d'agir sur ce qu'il inspecte (`CONVENTIONS.md` §39.8). La leçon a été payée à la `060`.
-- =====================================================================================

create or replace function f_verifier_fiches_reflexes()
returns table(objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_n        integer;
    v_verdict  boolean;
    v_creuses  text;
begin
    -- ── (1) LE SOCLE EST-IL LÀ, ET COMPLET ? ───────────────────────────────────────
    --
    -- ⚠️ Ce garde LIT des lignes, et il en a le DROIT : ces trois tables sont MIXTES, et
    -- il ne lit que la portée GROUPE (`filiale_id is null`), qui n'appartient à aucune
    -- filiale. Le §41 interdit de lire une ligne CLOISONNÉE — ici il n'y en a pas, et
    -- `install.sh` appelle f_verifier_schema() sans périmètre : une lecture de filiale
    -- rendrait zéro et conclurait au vert parce qu'elle ne voit rien.
    select count(*) into v_n from fiches_reflexes where filiale_id is null and actif;
    if v_n < 7 then
        objet    := 'fiches_reflexes';
        anomalie := 'socle_incomplet';
        detail   := format('le socle du Groupe ne porte que %s fiche(s) active(s) sur les '
                           '7 livrées : une organisation de crise amputée se découvre le '
                           'jour de la crise', v_n);
        return next;
    end if;

    select string_agg(f.role, ', ') into v_creuses
      from fiches_reflexes f
     where f.filiale_id is null
       and not exists (select 1 from fiche_reflexe_actions a where a.fiche_id = f.id);
    if v_creuses is not null then
        objet    := 'fiche_reflexe_actions';
        anomalie := 'fiche_sans_reflexe';
        detail   := format('ces fiches du socle ne portent AUCUN réflexe : %s. Une fiche '
                           'vide imprimée est pire qu''une fiche absente — on la sort de '
                           'l''armoire et on y cherche un geste qui n''y est pas',
                           v_creuses);
        return next;
    end if;

    -- ── (1 bis) AUCUNE COORDONNÉE N'IMITE UNE DONNÉE ──────────────────────────────
    --
    -- ⚠️ Le code d'origine livrait « ______________________ » pour les trois contacts
    -- qu'une filiale doit remplir. Une ligne de tirets bas **imite une donnée** : elle
    -- passe tout contrôle de présence, elle s'imprime, et le jour de la crise on
    -- compose un numéro qui n'existe pas. Le semis pose `null`, qui se lit « à
    -- compléter » — et ce garde refuse que la forme revienne.
    select string_agg(c.intitule, ', ') into v_creuses
      from contacts_urgence c
     where c.filiale_id is null and c.coordonnee ~ '^[_\s-]+$';
    if v_creuses is not null then
        objet    := 'contacts_urgence';
        anomalie := 'coordonnee_imitee';
        detail   := format('ces contacts du socle portent une coordonnée faite de tirets '
                           'ou d''espaces : %s. Elle IMITE une donnée — elle s''imprime, '
                           'et le jour de la crise on compose un numéro qui n''existe '
                           'pas. « null » se lit « à compléter ».', v_creuses);
        return next;
    end if;

    -- ── (2) L'UNICITÉ, ÉPROUVÉE ────────────────────────────────────────────────────
    --
    -- ⚠️ `nulls not distinct` est la pièce maîtresse, et une unicité ORDINAIRE passerait
    -- toute relecture de texte : les deux se ressemblent. On MESURE donc la propriété
    -- dans le catalogue — `indnullsnotdistinct` —, qui ne se laisse pas imiter.
    if not exists (
        select 1 from pg_index i
          join pg_class c on c.oid = i.indexrelid
         where c.relname = 'uq_fiches_reflexes_role' and i.indnullsnotdistinct)
    then
        objet    := 'fiches_reflexes';
        anomalie := 'unicite_socle_laxiste';
        detail   := 'uq_fiches_reflexes_role n''est pas « nulls not distinct » : le socle '
                    'du Groupe, dont filiale_id est nul par construction, peut porter DEUX '
                    'fiches pour le même rôle — deux cartes qui se contredisent sous les '
                    'yeux de quelqu''un qui n''a pas le temps de choisir (CONVENTIONS.md §45)';
        return next;
    end if;

    -- ── (3) LE DÉCLENCHEUR DE PORTÉE EST ARMÉ, ET ARMÉ « always » ──────────────────
    --
    -- ⚠️ On mesure `tgenabled`, pas l'existence : un déclencheur armé en « origin » est
    -- neutralisé par « set session_replication_role = replica », et la garantie avec lui.
    -- C'est le constat **Q-281**, et sa leçon : les gardes de `017` et `019` vérifiaient
    -- qu'un déclencheur EXISTE, jamais son armement.
    if not exists (
        select 1 from pg_trigger t
         where t.tgrelid = 'fiche_reflexe_actions'::regclass
           and t.tgname = 'trg_fiche_reflexe_actions_portee'
           and not t.tgisinternal
           and t.tgenabled = 'A')
    then
        objet    := 'fiche_reflexe_actions';
        anomalie := 'portee_non_tenue';
        detail   := 'trg_fiche_reflexe_actions_portee est absent ou n''est pas armé en '
                    '« always » : un réflexe d''une filiale pourrait se rattacher à une '
                    'fiche du socle, ce qu''aucune clé étrangère composite ne voit '
                    '(MATCH SIMPLE dispense de contrôle dès qu''une colonne est nulle)';
        return next;
    end if;

    -- ── (4) UN RÉFLEXE VIDE EST-IL REFUSÉ ? ────────────────────────────────────────
    --
    -- Soumis au prédicat RÉEL de la contrainte, jamais à son texte : un
    -- « check (… or true) » passerait sinon au vert sous zéro anomalie (constat Q-312).
    v_verdict := f_contrainte_accepte('fiche_reflexe_actions',
                                      'ck_fiche_reflexe_actions_texte',
                                      jsonb_build_object('texte', ''));
    if v_verdict is null then
        objet    := 'fiche_reflexe_actions';
        anomalie := 'contrainte_non_mesurable';
        detail   := 'ck_fiche_reflexe_actions_texte est absente, ou son prédicat appelle '
                    'une fonction que ce garde refuse d''évaluer (constat A-4)';
        return next;
    elsif v_verdict then
        objet    := 'fiche_reflexe_actions';
        anomalie := 'reflexe_vide_admis';
        detail   := 'un réflexe VIDE est accepté : la carte imprimée porterait une puce '
                    'sans texte, et personne ne saurait s''il manque un geste ou s''il '
                    'n''y en a pas';
        return next;
    end if;

    -- Le contre-témoin : un réflexe LÉGITIME doit passer. Un garde qui n'éprouve que des
    -- refus est muet sur une contrainte devenue « false » — c'est-à-dire sur une table
    -- où plus rien n'entre, ce qui rend zéro anomalie pour la pire des raisons.
    v_verdict := f_contrainte_accepte('fiche_reflexe_actions',
                                      'ck_fiche_reflexe_actions_texte',
                                      jsonb_build_object('texte', 'Isoler le poste.'));
    if v_verdict is not null and not v_verdict then
        objet    := 'fiche_reflexe_actions';
        anomalie := 'cas_nominal_refuse';
        detail   := 'un réflexe légitime est REFUSÉ : la table est inutilisable, et le '
                    'garde-fou se tairait — ce qu''il fait aussi quand tout va bien';
        return next;
    end if;
end;
$$;

comment on function f_verifier_fiches_reflexes() is
    'Garde-fou du lot des fiches réflexes : le socle est complet et aucune fiche n''est '
    'vide, l''unicité du socle est « nulls not distinct » (MESURÉE dans le catalogue, '
    'CONVENTIONS.md §45), le déclencheur de portée est armé en « always » (tgenabled, '
    'leçon Q-281), et un réflexe vide est refusé — éprouvé sur le prédicat RÉEL avec son '
    'CONTRE-TÉMOIN. ⚠️ Il ne lit que la portée GROUPE : une lecture de filiale rendrait '
    'zéro sous install.sh, qui appelle sans périmètre (§41).';

grant execute on function f_verifier_fiches_reflexes() to grc_app;

-- =====================================================================================
-- §8 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select count(*), string_agg(format('%s/%s: %s', objet, anomalie, detail), ' | ')
      into v_nombre, v_anomalies
      from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 061 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, fiches réflexes comprises.';
end;
$$;

insert into migrations_schema (version, nom)
values ('061', 'les fiches réflexes de crise entrent en base : sept fiches, vingt-neuf '
               'réflexes et sept contacts d''urgence quittent le code pour un socle de '
               'Groupe SURCHARGEABLE par filiale — une fiche qui ne décrit pas '
               'l''organisation réelle est pire qu''absente')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_fiches_reflexes();
--   delete from controles_schema where fonction = 'f_verifier_fiches_reflexes';
--   drop table if exists fiche_reflexe_actions;
--   drop table if exists contacts_urgence;
--   drop table if exists fiches_reflexes;
--   drop function if exists f_action_suit_sa_fiche();
--   delete from colonnes_personnelles where table_nom in
--       ('fiches_reflexes', 'fiche_reflexe_actions', 'contacts_urgence');
--   delete from migrations_schema where version = '061';
--   commit;
-- ⚠️ **Annuler DÉTRUIT les fiches adaptées par les filiales.** Le socle, lui, se
--    resème — il est engendré depuis le code. Ce qui ne se retrouve pas, c'est ce
--    qu'une filiale a écrit de son organisation réelle, et c'est précisément la
--    valeur de ce lot. Exportez avant.
--    Le domaine `type_entite` garde ses trois valeurs : les retirer casserait la
--    relecture du journal d'audit, qui les cite.
-- =====================================================================================
