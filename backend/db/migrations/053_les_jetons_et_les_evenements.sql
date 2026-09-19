-- =====================================================================================
--  053 — L'OUVERTURE TECHNIQUE : LES JETONS D'API ET LES ÉVÉNEMENTS SORTANTS
--
--  §0   Le périmètre de la migration
--  §1   Les jetons d'API — un SUJET DE DROITS, pas un contournement
--  §2   Les abonnements aux événements
--  §3   La file des événements sortants
--  §3 bis  Ce que toute table métier doit à trois garde-fous déjà posés
--  §4   Les déclencheurs qui ENFILENT — en base, jamais dans les routes
--  §5   `type_entite`
--  §6   Cloisonnement
--  §7   Le garde-fou
--  §8   Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — lot L22, actions 22.1, 22.2 et 22.3
--
--  C'est **le lot qui débloque tous les suivants** : sans jetons ni événements, ni la
--  collecte automatique de preuve (L23), ni la surveillance continue, ni le renvoi d'une
--  action vers l'outil des équipes.
--
--  ── ⚠️ UN JETON EST UN SUJET DE DROITS, ET CE N'EST PAS UNE FORMULE ──────────────
--
--  Le critère 22.1 tient en une phrase : *« il traverse `resoudre()` et la RLS, il ne les
--  contourne pas ».* Concrètement, un appel porteur d'un jeton produit un
--  `PerimetreSession` exactement comme une connexion humaine — même résolution, même
--  cloisonnement, même journal — et la seule différence est **d'où vient l'identité**.
--
--  Ce que cela interdit, et qu'il faut dire : il n'y a **aucun chemin** par lequel un
--  jeton lirait une filiale qui n'est pas la sienne, ni écrirait dans un domaine qu'il ne
--  porte pas. Ce n'est pas une promesse de la route : c'est la RLS, inchangée.
--
--  ⚠️ **Et un jeton ne porte jamais plus que le compte qui l'a créé.** L'intersection se
--  fait à la CRÉATION — niveau, domaines, droit d'export —, et la table garde le login de
--  l'émetteur : toute action d'un jeton est traçable à la personne qui l'a émis (22.2).
--
--  ⚠️ **La limite de ce choix, dite plutôt que tue** : si l'émetteur perd des droits
--  ensuite, le jeton garde les siens jusqu'à son expiration ou sa révocation. Les
--  revérifier à chaque appel exigerait d'interroger l'annuaire à chaque requête — ce qui
--  est cher et fragile. La réponse du produit est donc **l'expiration obligatoire** (le
--  schéma la rend `not null`), la révocation immédiate, et la trace nominative.
--
--  ── ⚠️ LE SECRET N'EST PAS STOCKÉ — ET L'EMPREINTE N'EST PAS UN `scrypt` ────────
--
--  Seule l'empreinte SHA-256 du secret est écrite. Le secret lui-même n'est montré
--  qu'une fois, à la création : le produit ne sait pas le retrouver, et c'est le but.
--
--  ⚠️ **SHA-256 et non `scrypt`, contrairement aux mots de passe** (`src/auth/secours.ts`),
--  et le motif est précis : un mot de passe est choisi par un humain, donc pauvre en
--  entropie, et il faut rendre chaque essai coûteux. Un jeton est **256 bits tirés d'un
--  générateur cryptographique** : il n'y a rien à deviner, et un `scrypt` par requête
--  ferait payer à chaque appel d'API un coût qui ne protège de rien.
--
--  ── ⚠️ LE SERVICE WEB N'APPELLE JAMAIS L'EXTÉRIEUR ──────────────────────────────
--
--  Les événements sortants sont **ENFILÉS** par des déclencheurs (§4) et drainés par une
--  unité systemd distincte, comme les notifications du lot L12 et comme la copie du
--  journal vers l'agrégateur. `cyber-grc.service` garde donc `IPAddressDeny=any` intact :
--  *une barrière physique, pas une promesse*.
--
--  ⚠️ C'est aussi ce qui rend le produit tenable quand la destination est injoignable :
--  une requête d'utilisateur ne peut pas attendre un serveur tiers qui ne répond pas.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-053', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LES JETONS D'API
-- -------------------------------------------------------------------------------------
-- ⚠️ **Cloisonnée, et `filiale_id` est `not null`.** Un jeton de portée Groupe aurait été
-- commode et aurait été la faille : il aurait lu les vingt filiales, et il aurait suffi
-- d'en perdre un. Un jeton appartient à UNE filiale ; une intégration qui en couvre
-- plusieurs en tient plusieurs, et les révoque une par une.
-- =====================================================================================

create table if not exists jetons_api (
    id         id_metier   not null default f_generer_id('JETA'),
    filiale_id id_metier   not null,

    nom text not null,

    -- ⚠️ L'EMPREINTE, jamais le secret. La colonne est unique : deux jetons ne
    -- peuvent pas partager une empreinte, et la recherche à l'authentification se
    -- fait dessus — en temps constant côté index, et sans que le secret existe
    -- nulle part en base.
    empreinte text not null,
    -- Les premiers signes du jeton, pour que l'écran puisse le reconnaître sans le
    -- révéler — « grc_7f3a… ». ⚠️ Ce n'est PAS un secret partiel utilisable : huit
    -- signes sur soixante-quatre ne réduisent pas la recherche à quelque chose
    -- d'atteignable, et c'est la seule façon de distinguer deux jetons à l'écran.
    prefixe   text not null,

    -- ⚠️ **QUI l'a émis** : c'est la moitié « traçabilité » de l'action 22.2. Toute
    -- action d'un jeton est rattachable à une personne, et `cree_par` ne suffit pas —
    -- il dit qui a écrit la LIGNE, ce qui est la même chose aujourd'hui et ne le
    -- restera pas le jour où un jeton en créera un autre.
    emis_par  text not null,

    -- Les trois axes de droits, exactement ceux d'une session humaine.
    niveau        text    not null,
    domaines      text[]  not null,
    peut_exporter boolean not null default false,

    -- ⚠️ **L'EXPIRATION EST OBLIGATOIRE.** Un jeton sans date de fin est un mot de
    -- passe qui ne change jamais : il survit aux départs, aux réorganisations et aux
    -- fuites de dépôt. Le schéma la rend `not null` plutôt que de la recommander.
    expire_le   timestamptz not null,
    revoque_le  timestamptz,
    revoque_par text,

    -- Ce que l'écran montre pour décider d'une révocation : un jeton qui n'a jamais
    -- servi depuis six mois n'a pas besoin de vivre.
    dernier_usage_le timestamptz,
    usages           integer not null default 0,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_jetons_api primary key (id),
    constraint fk_jetons_api_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,

    constraint ck_jetons_api_nom       check (nom <> ''),
    constraint ck_jetons_api_empreinte check (length(empreinte) = 64),
    constraint ck_jetons_api_prefixe   check (length(prefixe) between 4 and 16),
    constraint ck_jetons_api_emis_par  check (emis_par <> ''),
    constraint ck_jetons_api_niveau    check (
        niveau in ('lecture', 'contribution', 'administration')),
    -- ⚠️ Un jeton SANS domaine ne peut rien faire : la ligne serait une invitation à
    -- croire qu'une intégration est en place alors qu'elle échoue à chaque appel.
    constraint ck_jetons_api_domaines  check (cardinality(domaines) >= 1),
    -- La révocation se DATE, dans les deux sens.
    constraint ck_jetons_api_revoque   check ((revoque_le is null) = (revoque_par is null)),
    constraint ck_jetons_api_usages    check (usages >= 0),
    constraint ck_jetons_api_longueurs check (
        length(nom) <= 120 and (revoque_par is null or length(revoque_par) <= 120))
);

-- ⚠️ UNIQUE et NON cloisonné, délibérément : l'empreinte est tirée de 256 bits
-- d'aléa cryptographique, et deux filiales ne peuvent pas la collisionner. Elle
-- entre dans la liste des unicités globales du `CONVENTIONS.md` §19.1 au même titre
-- que `uq_pieces_jointes_chemin`, et pour le même motif — c'est une valeur que le
-- SERVEUR fabrique, opaque, qu'aucune filiale ne peut deviner.
create unique index if not exists uq_jetons_api_empreinte on jetons_api (empreinte);

create index if not exists ix_jetons_api_filiale
    on jetons_api (filiale_id, expire_le desc);

drop trigger if exists trg_jetons_api_maj on jetons_api;
create trigger trg_jetons_api_maj before update on jetons_api
    for each row execute function f_maj_tracabilite();

comment on table jetons_api is
    'Jeton d''API (lot L22, action 22.1). ⚠️ Un jeton est un SUJET DE DROITS : il '
    'traverse la même résolution de périmètre qu''une session humaine et la même RLS — '
    'il ne les contourne pas. ⚠️ Le SECRET n''est jamais stocké : seule son empreinte '
    'SHA-256, et le secret n''est montré qu''une fois. ⚠️ L''expiration est OBLIGATOIRE : '
    'un jeton sans date de fin est un mot de passe qui ne change jamais.';
comment on column jetons_api.empreinte is
    'SHA-256 du secret. ⚠️ SHA-256 et non scrypt, contrairement aux mots de passe : un '
    'jeton est 256 bits d''aléa cryptographique — il n''y a rien à deviner, et un scrypt '
    'par requête ferait payer à chaque appel un coût qui ne protège de rien.';
comment on column jetons_api.emis_par is
    'Login du compte HUMAIN qui a émis le jeton (action 22.2) : toute action d''un jeton '
    'est traçable à la personne qui l''a émis. ⚠️ Distinct de « cree_par », qui dit qui a '
    'écrit la ligne — la même chose aujourd''hui, et plus le jour où un jeton en créera '
    'un autre.';

-- =====================================================================================
-- §2 — LES ABONNEMENTS AUX ÉVÉNEMENTS (action 22.3)
-- -------------------------------------------------------------------------------------
-- Trois événements, et pas un de plus pour l'instant : la création d'un incident, le
-- franchissement d'une échéance, le refus d'une approbation. Ce sont les trois que le
-- `PLAN_PRODUIT.md` nomme, et ce sont ceux dont un outil tiers a besoin pour réagir.
--
-- ⚠️ **Le vocabulaire est FERMÉ.** Un abonnement à un événement que rien n'émet serait
-- une intégration qu'on croit en place et qui ne se déclenche jamais — le défaut le plus
-- coûteux d'une ouverture technique, parce qu'il ne se voit que le jour où l'on comptait
-- dessus.
-- =====================================================================================

create table if not exists abonnements_evenements (
    id         id_metier   not null default f_generer_id('ABEV'),
    filiale_id id_metier   not null,

    evenement text not null,
    nom       text not null,
    url       text not null,
    actif     boolean not null default true,

    -- ── ⚠️ LE SECRET DE SIGNATURE EST STOCKÉ EN CLAIR, ET C'EST NÉCESSAIRE ──
    --
    -- Partout ailleurs dans ce produit, un secret n'existe qu'en empreinte : le mot
    -- de passe d'un compte de secours, le secret d'un jeton d'API. Ici, c'est
    -- **impossible** — et le dire vaut mieux que le contourner.
    --
    -- Un secret de signature est un secret PARTAGÉ par construction : les deux bouts
    -- doivent le connaître pour que l'un signe et que l'autre vérifie. En garder une
    -- empreinte rendrait la signature incalculable, et l'abonné n'aurait aucun moyen
    -- de distinguer un événement venu de nous d'un événement forgé par quiconque
    -- connaît son URL.
    --
    -- ⚠️ **Ce que son vol permet, dit franchement** : forger des événements VERS
    -- l'abonné. Il ne donne aucune lecture sur ce produit, aucun accès à une filiale,
    -- et il ne sert qu'à une URL. C'est l'asymétrie qui rend ce stockage acceptable —
    -- là où un jeton d'API, lui, ouvre une porte et n'est donc jamais stocké.
    --
    -- ⚠️ **Et la table n'est PAS une entité du registre** : elle ne voyage donc ni
    -- dans le fichier d'échange `grc-backup`, ni dans un export. Le secret ne sort
    -- pas de la base.
    secret_signature text,

    dernier_envoi_le   timestamptz,
    dernier_statut     integer,
    echecs_consecutifs integer not null default 0,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_abonnements_evenements primary key (id),
    constraint fk_abonnements_evenements_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,

    constraint ck_abonnements_evenements_evenement check (
        evenement in ('incident_cree', 'echeance_franchie', 'approbation_refusee')),
    constraint ck_abonnements_evenements_nom check (nom <> ''),
    -- ⚠️ **`https` SEUL, et le motif n'est pas la coquetterie** : la charge porte le
    -- titre d'un incident de sécurité et le nom de la filiale. En clair sur le réseau
    -- du client, c'est une fuite — et elle serait invisible, puisque l'envoi
    -- « réussit ».
    constraint ck_abonnements_evenements_url check (url like 'https://%'),
    constraint ck_abonnements_evenements_echecs check (echecs_consecutifs >= 0),
    constraint ck_abonnements_evenements_longueurs check (
        length(nom) <= 120 and length(url) <= 500
        and (secret_signature is null or length(secret_signature) <= 128))
);

create index if not exists ix_abonnements_evenements_actifs
    on abonnements_evenements (filiale_id, evenement) where actif;

drop trigger if exists trg_abonnements_evenements_maj on abonnements_evenements;
create trigger trg_abonnements_evenements_maj before update on abonnements_evenements
    for each row execute function f_maj_tracabilite();

comment on table abonnements_evenements is
    'Abonnement à un événement sortant (lot L22, action 22.3). ⚠️ Le vocabulaire des '
    'événements est FERMÉ : un abonnement à un événement que rien n''émet serait une '
    'intégration qu''on croit en place et qui ne se déclenche jamais. ⚠️ « https » seul : '
    'la charge porte le titre d''un incident de sécurité et le nom de la filiale.';

-- =====================================================================================
-- §3 — LA FILE DES ÉVÉNEMENTS SORTANTS
-- -------------------------------------------------------------------------------------
-- ⚠️ **UNE FILE, ET NON UN APPEL DEPUIS LA ROUTE.** Le service web n'appelle jamais
-- l'extérieur : il ENFILE, et une unité systemd distincte draine — comme les
-- notifications du lot L12, et comme la copie du journal vers l'agrégateur.
--
-- Trois raisons, et chacune a déjà coûté quelque chose quelque part :
--
--   1. `cyber-grc.service` garde `IPAddressDeny=any` **intact**. C'est une barrière
--      physique, pas une promesse (constat Q-199) ;
--   2. la requête d'un utilisateur ne peut pas attendre un serveur tiers qui ne répond
--      pas. Un webhook synchrone, c'est une création d'incident qui met trente secondes
--      le jour où l'outil d'en face est en panne ;
--   3. un envoi qui échoue doit pouvoir être **rejoué**, et il faut pour cela qu'il
--      existe quelque part.
-- =====================================================================================

-- La cible de la clé composite de `evenements_sortants` — posée AVANT la table qui la
-- référence, sinon PostgreSQL refuse en 42830 « there is no unique constraint matching
-- given keys ». ⚠️ Posée sous condition, et non par « drop … if exists » suivi d'un
-- « add » : la clé étrangère en dépend, et le `drop` échouerait au rejeu (§13).
do $$
begin
    if not exists (select 1 from pg_constraint
                    where conrelid = to_regclass('public.abonnements_evenements')
                      and conname = 'uq_abonnements_evenements_id_filiale')
    then
        alter table abonnements_evenements
            add constraint uq_abonnements_evenements_id_filiale unique (id, filiale_id);
    end if;
end;
$$;

create table if not exists evenements_sortants (
    id         id_metier   not null default f_generer_id('EVSO'),
    filiale_id id_metier   not null,

    abonnement_id id_metier not null,
    evenement     text      not null,
    -- ⚠️ La charge est FIGÉE à l'enfilement, et c'est voulu : un événement décrit ce
    -- qui s'est passé AU MOMENT où cela s'est passé. La recomposer à l'envoi
    -- rapporterait l'état d'aujourd'hui sous une date d'hier.
    charge jsonb not null,

    statut         text    not null default 'en_attente',
    tentatives     integer not null default 0,
    envoye_le      timestamptz,
    dernier_detail text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_evenements_sortants primary key (id),
    constraint fk_evenements_sortants_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- COMPOSITE : une clé simple serait satisfaite par un abonnement INVISIBLE de la
    -- filiale voisine (`CONVENTIONS.md` §17.1), et l'événement d'une filiale partirait
    -- vers l'URL d'une autre. C'est la fuite entre filiales, par la porte de sortie.
    constraint fk_evenements_sortants_abonnement foreign key (abonnement_id, filiale_id)
        references abonnements_evenements (id, filiale_id) on delete cascade,

    constraint ck_evenements_sortants_statut check (
        statut in ('en_attente', 'envoye', 'echec', 'abandonne')),
    constraint ck_evenements_sortants_tentatives check (tentatives >= 0),
    constraint ck_evenements_sortants_envoye check (
        (statut = 'envoye') = (envoye_le is not null)),
    constraint ck_evenements_sortants_charge check (jsonb_typeof(charge) = 'object'),
    constraint ck_evenements_sortants_detail check (
        dernier_detail is null or length(dernier_detail) <= 1000)
);

create index if not exists ix_evenements_sortants_file
    on evenements_sortants (statut, cree_le) where statut in ('en_attente', 'echec');

drop trigger if exists trg_evenements_sortants_maj on evenements_sortants;
create trigger trg_evenements_sortants_maj before update on evenements_sortants
    for each row execute function f_maj_tracabilite();

comment on table evenements_sortants is
    'File des événements à émettre (lot L22, action 22.3). ⚠️ Le service web n''appelle '
    'JAMAIS l''extérieur : il enfile, et une unité systemd distincte draine — comme les '
    'notifications du lot L12. « cyber-grc.service » garde IPAddressDeny=any intact, et '
    'la requête d''un utilisateur n''attend pas un serveur tiers en panne.';

-- =====================================================================================
-- §3 bis — CE QUE TOUTE TABLE MÉTIER DOIT À TROIS GARDE-FOUS DÉJÀ POSÉS
-- =====================================================================================

alter table jetons_api             add column if not exists provenance provenance_ligne not null;
alter table abonnements_evenements add column if not exists provenance provenance_ligne not null;
alter table evenements_sortants    add column if not exists provenance provenance_ligne not null;

do $$
declare v_table text;
begin
    foreach v_table in array array['jetons_api', 'abonnements_evenements',
                                   'evenements_sortants'] loop
        execute format('drop trigger if exists trg_%s_provenance on %I', v_table, v_table);
        execute format('create trigger trg_%s_provenance before insert on %I '
                       'for each row execute function f_marquer_provenance()',
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

-- ── Le registre de l'article 30 ───────────────────────────────────────────────────────
--
-- ⚠️ **`jetons_api.emis_par` EST une donnée personnelle**, et c'est la seule de ce lot à
-- l'être franchement : c'est le login d'une personne identifiée, conservé pour rattacher
-- les appels d'une intégration à qui l'a mise en place. Elle relève du régime
-- « anonymiser » — la trace de l'émission doit survivre à l'effacement du compte, sinon
-- on perd la seule chose qui rend un jeton redevable.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('jetons_api', 'nom', 'non_personnelle', null, null, null, 'signaler',
   'Intitulé donné au jeton par celui qui le crée — « Collecte Active Directory ». '
   'Prose libre : quelqu''un peut y écrire « jeton de Untel ». Régime « signaler ».'),
  ('jetons_api', 'emis_par', 'personnelle',
   'Rattacher les appels d''une intégration à la personne qui l''a mise en place '
   '(action 22.2) : un jeton sans émetteur nommé est une porte dont personne ne répond.',
   'Intérêt légitime', 1095, 'anonymiser',
   'Login du compte humain émetteur. ⚠️ « anonymiser » et non « supprimer » : la trace de '
   'l''émission doit survivre au départ de la personne, sinon on perd la seule chose qui '
   'rend un jeton redevable. Trois ans, comme le journal d''audit.'),
  ('jetons_api', 'empreinte', 'non_personnelle', null, null, null, null,
   'SHA-256 du secret. Ne désigne personne, et ne permet pas de retrouver le secret.'),
  ('jetons_api', 'prefixe', 'non_personnelle', null, null, null, null,
   'Les premiers signes du jeton, pour le reconnaître à l''écran sans le révéler.'),
  ('jetons_api', 'niveau', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : lecture | contribution | administration.'),
  -- ⚠️ **Le premier `text[]` du schéma, et le garde-fou l'a réclamé** : il a fallu
  -- ranger le type « _text » parmi les PORTEURS (§7 bis) pour que cette colonne
  -- devienne candidate. Sans cela, elle échappait au registre qu'on présente à un DPO —
  -- exactement le constat A-3, où huit colonnes « jsonb » passaient au travers.
  ('jetons_api', 'domaines', 'non_personnelle', null, null, null, null,
   'Les domaines fonctionnels que le jeton porte — « conformite », « risques ». Un '
   'vocabulaire de DROITS, clos par le produit ; il ne désigne aucune personne.'),
  ('jetons_api', 'revoque_par', 'personnelle',
   'Savoir qui a révoqué un jeton : une révocation est une décision de sécurité.',
   'Intérêt légitime', 1095, 'anonymiser',
   'Login du compte qui a révoqué. Même régime que emis_par, et pour le même motif.'),
  ('abonnements_evenements', 'evenement', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : incident_cree | echeance_franchie | approbation_refusee.'),
  ('abonnements_evenements', 'nom', 'non_personnelle', null, null, null, 'signaler',
   'Intitulé de l''abonnement. Prose libre : régime « signaler ».'),
  ('abonnements_evenements', 'url', 'non_personnelle', null, null, null, 'signaler',
   'Adresse de l''outil abonné. ⚠️ Une URL peut porter un identifiant de personne dans '
   'son chemin ou sa chaîne de requête — c''est fréquent chez les outils de suivi. '
   'Régime « signaler » : on ne purge pas une adresse d''intégration à l''aveugle.'),
  ('abonnements_evenements', 'secret_signature', 'non_personnelle', null, null, null, 'conserver',
   'Secret PARTAGÉ de signature, stocké en clair parce qu''une signature ne se calcule '
   'pas depuis une empreinte. Il ne désigne personne. ⚠️ « conserver » : l''effacer au '
   'départ d''une personne casserait une intégration qui n''a rien à voir avec elle.'),
  ('evenements_sortants', 'evenement', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos, recopié de l''abonnement au moment de l''enfilement.'),
  ('evenements_sortants', 'statut', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : en_attente | envoye | echec | abandonne.'),
  ('evenements_sortants', 'dernier_detail', 'non_personnelle', null, null, null, 'signaler',
   'Message d''erreur du dernier envoi, tel que la pile réseau l''a rendu. Il peut '
   'contenir une URL, donc un identifiant. Régime « signaler ».'),
  -- ⚠️ « conserver » et non « signaler » : la colonne est `jsonb`, et le régime
  -- « signaler » construit une comparaison TEXTUELLE que la base refuse — la purge,
  -- transactionnelle, s'en avorterait pour toutes les filiales (constat Q-300).
  ('evenements_sortants', 'charge', 'non_personnelle', null, null, null, 'conserver',
   'Charge figée de l''événement — le titre d''un incident, la référence d''une échéance. '
   '⚠️ « conserver » et non « signaler » parce que la colonne est jsonb : le régime '
   '« signaler » y construirait une comparaison textuelle que la base refuse, et la '
   'purge — transactionnelle — s''avorterait pour toutes les filiales (constat Q-300). '
   'La purge du porteur emporte l''événement par cascade.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §4 — LES DÉCLENCHEURS QUI ENFILENT — EN BASE, JAMAIS DANS LES ROUTES
-- -------------------------------------------------------------------------------------
-- ⚠️ **C'est la règle du `CONVENTIONS.md` §8.1, et elle a déjà coûté deux constats** :
-- *« une route ne voit que son chemin ; il y en a toujours un de plus »*. Un incident
-- naît par la route générique, par le moteur d'import du lot L7, par la reprise d'une
-- sauvegarde, et par `psql`. Enfiler depuis la route laisserait trois de ces chemins
-- muets — et l'intégration d'en face ne verrait jamais les incidents importés.
--
-- ⚠️ **L'événement `echeance_franchie` n'a PAS de déclencheur, et c'est délibéré** : une
-- échéance ne s'écrit pas, elle se DÉRIVE d'une date et de l'horloge. Il n'y a aucune
-- ligne dont l'insertion la signale. C'est l'unité de drainage qui la calcule, sur le
-- même mécanisme que les relances du lot L12 — et cela tient parce qu'elle s'exécute
-- périodiquement de toute façon.
-- =====================================================================================

create or replace function f_enfiler_evenement()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_evenement constant text := tg_argv[0];
    v_abonnement record;
    v_charge jsonb;
begin
    -- ⚠️ **On sort TÔT s'il n'y a pas d'abonné.** Sans cela, chaque création
    -- d'incident paierait un parcours de table pour rien, sur toutes les
    -- installations — et elles n'auront, pour la plupart, jamais d'abonnement.
    -- ⚠️ `filiale_id` peut être NUL sur une table MIXTE — `approbations` l'est. Un
    -- objet de portée Groupe n'appartient à aucune filiale, et rien ne dit à laquelle
    -- des vingt son événement devrait partir. On sort, plutôt que de choisir.
    if new.filiale_id is null then
        return new;
    end if;
    if not exists (select 1 from abonnements_evenements a
                    where a.filiale_id = new.filiale_id
                      and a.evenement = v_evenement and a.actif)
    then
        return new;
    end if;

    -- La charge : ce que l'abonné a besoin de savoir, et RIEN DE PLUS.
    --
    -- ⚠️ **Pas le contenu de l'incident.** Un webhook part vers un outil tiers, sur
    -- le réseau du client ou au-delà : y mettre la description d'un incident de
    -- sécurité serait une extraction de données par une porte qu'on vient d'ouvrir.
    -- L'abonné reçoit de quoi VENIR CHERCHER — l'identifiant et le type —, avec le
    -- jeton d'API qui le borne. C'est la même discipline que le §29.5 sur le journal.
    v_charge := jsonb_build_object(
        'evenement', v_evenement,
        'entite',    tg_table_name::text,
        'id',        new.id,
        'filiale',   new.filiale_id,
        'survenu_le', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));

    for v_abonnement in
        select a.id from abonnements_evenements a
         where a.filiale_id = new.filiale_id
           and a.evenement = v_evenement and a.actif
    loop
        insert into evenements_sortants
            (filiale_id, abonnement_id, evenement, charge)
        values (new.filiale_id, v_abonnement.id, v_evenement, v_charge);
    end loop;

    return new;
end;
$$;

comment on function f_enfiler_evenement() is
    'Enfile un événement sortant pour chaque abonnement ACTIF de la filiale (action '
    '22.3). ⚠️ Posé EN BASE et non dans les routes : un incident naît par la route '
    'générique, par l''import du lot L7, par la reprise et par psql — enfiler depuis la '
    'route laisserait trois chemins muets (CONVENTIONS.md §8.1). ⚠️ La charge ne porte '
    'PAS le contenu : l''abonné reçoit de quoi VENIR CHERCHER, avec un jeton qui le '
    'borne. Un webhook part vers un tiers ; y mettre la description d''un incident de '
    'sécurité serait une extraction par la porte qu''on vient d''ouvrir.';

drop trigger if exists trg_incidents_evenement on incidents;
create trigger trg_incidents_evenement after insert on incidents
    for each row execute function f_enfiler_evenement('incident_cree');
alter table incidents enable always trigger trg_incidents_evenement;

-- ⚠️ **`statut` et non « decision »** : la colonne de `approbations` s'appelle ainsi
-- depuis le lot L8, et son vocabulaire est clos à cinq valeurs. Le `when` ne se
-- déclenche qu'au PASSAGE à « refuse » — sans lui, ré-enregistrer une approbation déjà
-- refusée enfilerait un événement de plus à chaque fois, et l'outil d'en face recevrait
-- le même refus dix fois.
--
-- ⚠️ **Et `approbations.filiale_id` est NULLABLE** : la table est mixte depuis la
-- migration `012` — *« une décision groupe se valide une fois au groupe »*. Un refus de
-- portée Groupe ne trouve donc aucun abonnement (ceux-ci portent `filiale_id not null`)
-- et n'enfile rien. C'est le comportement voulu : un abonnement appartient à une
-- filiale, et rien ne dit à laquelle des vingt un refus du Groupe devrait partir.
drop trigger if exists trg_approbations_evenement on approbations;
create trigger trg_approbations_evenement after update on approbations
    for each row
    when (new.statut = 'refuse' and old.statut is distinct from 'refuse')
    execute function f_enfiler_evenement('approbation_refusee');
alter table approbations enable always trigger trg_approbations_evenement;

-- =====================================================================================
-- §5 — `type_entite`
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := quote_literal('referentiel_traductions');
    v_ajouts   constant text := quote_literal('referentiel_traductions') || ', '
                             || quote_literal('jetons_api') || ', '
                             || quote_literal('abonnements_evenements') || ', '
                             || quote_literal('evenements_sortants');
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable.';
    end if;
    if position(quote_literal('jetons_api') in v_predicat) > 0 then
        raise notice 'type_entite admet deja les jetons : rejeu, rien a faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « referentiel_traductions » est introuvable dans le '
                        'predicat applique de type_entite_check : son texte a change, et '
                        'la substitution a l''aveugle est refusee (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);
    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet desormais les trois tables de l''ouverture technique.';
end;
$$;

-- =====================================================================================
-- §6 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Trois tables ORDINAIRES, strictement cloisonnées — pas de cas « portée Groupe ».
--
-- ⚠️ **Et c'est une décision de sécurité, pas une commodité.** Un jeton de portée Groupe
-- aurait lu les vingt filiales, et il aurait suffi d'en perdre un. Un abonnement de
-- portée Groupe aurait envoyé les incidents de toutes les filiales à une seule URL.
-- =====================================================================================

do $$
declare v_table text;
begin
    foreach v_table in array array['jetons_api', 'abonnements_evenements',
                                   'evenements_sortants'] loop
        execute format('alter table %I enable row level security', v_table);
        execute format('alter table %I force  row level security', v_table);

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

        execute format('grant select, insert, update, delete on %I to grc_app', v_table);
        execute format('grant select on %I to grc_lecture', v_table);
    end loop;
end;
$$;

comment on policy pol_jetons_api_lecture on jetons_api is
    'Strictement cloisonnee, sans cas « portee Groupe » — et c''est une decision de '
    'securite : un jeton de portee Groupe aurait lu les vingt filiales, et il aurait '
    'suffi d''en perdre un.';

select f_armer_declencheurs();

do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Declencheurs « les pieces suivent leur porteur » : % table(s) equipee(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §6 bis — DEUX GARDE-FOUS DÉJÀ POSÉS, ÉLARGIS
-- -------------------------------------------------------------------------------------
-- ⚠️ **Les deux ont REFUSÉ le déploiement, et les deux avaient raison.**
--
--   1. `f_verifier_types_ranges()` — le type `text[]` n'était rangé nulle part. Il est
--      le premier du schéma (`jetons_api.domaines`), et il est **PORTEUR** : ce qu'on met
--      dans un tableau de texte n'est pas décidé par son type. L'oublier aurait laissé
--      une colonne échapper au registre de l'article 30 — le constat **A-3**, où huit
--      colonnes « jsonb » passaient au travers parce que le balayage s'arrêtait au texte.
--
--   2. `f_verifier_unicite_cloisonnee()` — l'unicité de l'empreinte d'un jeton ne porte
--      pas `filiale_id`, et elle ne le doit pas : l'authentification cherche le jeton par
--      son empreinte **AVANT** de savoir de quelle filiale il relève. C'est elle qui le
--      dit. Une unicité par filiale n'interdirait pas deux jetons de même empreinte dans
--      deux filiales, et la recherche rendrait deux lignes.
--
-- ⚠️ Les deux fonctions sont reposées EN ENTIER, à l'identique sauf leur liste : leur
-- texte a été extrait du catalogue et une seule substitution y a été appliquée, refusée
-- si le bloc visé n'était pas retrouvé mot pour mot. *On ne remplace pas une fonction
-- dont on n'a lu qu'une partie.*
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_types_ranges()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- Les types dont AUCUNE valeur ne peut être un nom, une adresse, un identifiant de
    -- personne. C'est une DÉCISION, et elle est ici parce qu'elle est ici qu'on l'applique.
    v_sans_personne constant text[] := array[
        'bool', 'date', 'int2', 'int4', 'int8', 'numeric', 'float4', 'float8',
        'timestamptz', 'timestamp', 'time', 'timetz', 'interval'
    ];
    -- Les types qui PEUVENT en porter, et dont les colonnes sont donc réclamées au registre.
    v_porteurs constant text[] := array[
        'text', 'varchar', 'bpchar',   -- la prose, les noms, les identifiants
        'jsonb', 'json',               -- un document figé recopie ce qu'on y a mis
        'inet', 'cidr', 'macaddr',     -- une adresse désigne un poste, donc une personne
        'xml', 'bytea',                -- un contenu opaque : on ne présume rien
        -- ⚠️ **LE TABLEAU DE TEXTE, ajouté par la migration `053`.** Le premier du
        -- schéma est `jetons_api.domaines`. Il est PORTEUR pour la raison qui vaut
        -- pour `text` : ce qu'on y met n'est pas décidé par le type. Et l'oublier
        -- aurait laissé une colonne échapper au registre qu'on présente à un DPO —
        -- c'est très exactement le constat **A-3**, où huit colonnes « jsonb »
        -- passaient au travers parce que le balayage s'arrêtait au texte.
        '_text'
    ];
    r record;
begin
    for r in
        select distinct coalesce(bt.typname, t.typname)::text as nom
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_type t on t.oid = a.atttypid
          left join pg_type bt on bt.oid = nullif(t.typbasetype, 0)
         where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
           and t.typtype = 'b'
           and not (coalesce(bt.typname, t.typname)::text = any (v_sans_personne))
           and not (coalesce(bt.typname, t.typname)::text = any (v_porteurs))
         order by 1
    loop
        objet    := r.nom;
        anomalie := 'type_non_range';
        detail   := 'Un type de ce nom apparaît dans le schéma, et rien ne dit s''il peut '
                    'porter une donnée personnelle. Rangez-le dans '
                    'f_verifier_types_ranges() : « porteur » — ses colonnes seront alors '
                    'réclamées au registre de l''article 30 — ou « jamais une personne ». '
                    '⚠️ Ne pas répondre, c''est ce qu''a fait le renversement de la '
                    'migration 029 : il s''arrêtait au texte, et huit colonnes « jsonb » '
                    'échappaient au registre qu''on présente à un DPO (constat A-3).';
        return next;
    end loop;
    return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.f_verifier_unicite_cloisonnee()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- Les unicités DÉLIBÉRÉMENT globales sur une table cloisonnée. Cinq, chacune motivée
    -- par une raison qui ne vaut que pour elle. Toute autre est une anomalie : la liste
    -- ne dispense pas du balayage, elle en est la seule sortie de secours, et le bloc
    -- final vérifie qu'aucune de ces cinq n'a disparu — une exemption périmée élargirait
    -- la dérogation en silence (§19.5).
    v_globales constant text[] := array[
        -- Numérotation de la chaîne d'audit : elle est GROUPE par construction. Le
        -- chaînage par empreinte relie toutes les entrées entre elles, filiales
        -- comprises ; une numérotation par filiale ne serait plus une chaîne (§12).
        'uq_journal_audit_numero',
        -- Chemin de stockage d'une pièce jointe : c'est un chemin de SYSTÈME DE FICHIERS,
        -- unique sur le disque par nature. Le nom est engendré par le serveur et opaque
        -- (§17.1 de la migration 001) : une filiale ne peut pas le deviner pour occuper
        -- celui d'une autre, et le collisionner par hasard n'arrive pas.
        'uq_pieces_jointes_chemin',
        -- (id, portee_groupe) sur documents : id est DÉJÀ la clé primaire, cette unicité
        -- n'interdit donc rien de plus qu'elle. Elle n'existe que pour être la cible de
        -- la clé étrangère composite de document_referentiels (constat N-10, §17.10).
        'uq_documents_id_portee',
        -- (id, portee_groupe) sur personnes : même dispositif et même motif
        -- que sur documents. id est DÉJÀ la clé primaire ; cette unicité
        -- n'interdit donc rien de plus, elle rend seulement le couple
        -- référençable par attestations_lecture — ce qui est ce qui permet à
        -- une personne de PORTÉE GROUPE d'attester dans une filiale (033).
        'uq_personnes_id_portee',
        -- (id, portee_groupe) sur mesure_catalogue : même dispositif et même
        -- motif que sur documents et personnes. id est DÉJÀ la clé primaire ;
        -- cette unicité n'interdit rien de plus, elle rend seulement le couple
        -- référençable par document_mesures — ce qui permet à une politique de
        -- filiale de prouver un contrôle du SOCLE DU GROUPE (036).
        'uq_mesure_catalogue_id_portee',
        -- (id, portee_groupe) sur analyses_impact : même dispositif et même
        -- motif que sur documents, personnes et mesure_catalogue. id est DÉJÀ
        -- la clé primaire ; cette unicité n'interdit rien de plus, elle rend
        -- seulement le couple référençable par analyse_mesures (039).
        'uq_analyses_impact_id_portee',
        -- (id, portee_groupe) sur traitements : même dispositif et même motif que
        -- sur documents (migration 027). id est DÉJÀ la clé primaire ; cette
        -- unicité n'interdit donc rien de plus, elle rend seulement le couple
        -- référençable par documents.traitement_id et par traitement_mesures.
        'uq_traitements_id_portee',
        -- Référence d'une mesure de catalogue de portée GROUPE : index PARTIEL, borné à
        -- « filiale_id is null ». Il ne porte donc que sur des lignes du socle commun,
        -- que seule l'administration Groupe écrit. Le pendant local
        -- (uq_mesure_catalogue_reference_locale) porte bien filiale_id, lui.
        'uq_mesure_catalogue_reference_groupe',
        -- Nom d'un groupe AD : l'unicité n'est pas la nôtre, c'est celle de l'annuaire.
        -- Deux filiales ne peuvent pas revendiquer le même groupe AD, et c'est le but.
        'uq_groupes_ad_nom',
        -- (id, referentiel_id) sur referentiel_domaines : **exactement le cas de
        -- `uq_documents_id_portee` ci-dessus**, et pour la même raison. `id` est DÉJÀ la
        -- clé primaire : cette unicité n'interdit rien de plus qu'elle, et n'existe que
        -- pour être la CIBLE de la clé étrangère composite de `referentiel_exigences`
        -- (migration `051` §3). Cette clé-là est ce qui empêche une exigence de déclarer
        -- un référentiel autre que celui de son domaine — donc ce qui empêche son code,
        -- moitié droite de `evaluations(ref_id, code)`, d'être compté sous le mauvais
        -- référentiel. ⚠️ Lui ajouter `filiale_id` serait PIRE que l'omettre : la table
        -- est MIXTE, `filiale_id` y est nul pour tout le socle, et `MATCH SIMPLE`
        -- dispense alors la clé étrangère de tout contrôle (`CONVENTIONS.md` §45).
        'uq_referentiel_domaines_id_referentiel',
        -- Empreinte d'un jeton d'API (migration `053`) : c'est le SHA-256 d'un secret
        -- tiré de 256 bits d'aléa cryptographique, fabriqué par le serveur. Deux
        -- filiales ne peuvent pas la collisionner, et aucune ne peut la deviner pour
        -- occuper celle d'une autre. Même motif que `uq_pieces_jointes_chemin`.
        --
        -- ⚠️ Et elle DOIT être globale : l'authentification cherche le jeton par son
        -- empreinte AVANT de savoir de quelle filiale il relève — c'est elle qui le
        -- dit. Une unicité par filiale n'interdirait pas deux jetons de même
        -- empreinte dans deux filiales, et la recherche rendrait deux lignes.
        'uq_jetons_api_empreinte'
    ];
    r record;
    v_nom text;
begin
    for r in
        select c.relname::text                             as tbl,
               coalesce(con.conname::text, i.relname::text) as nom,
               case con.contype
                   when 'x' then 'contrainte d''exclusion'
                   when 'u' then 'contrainte d''unicité'
                   else 'index unique sans contrainte'
               end                                          as genre,
               pg_get_indexdef(ix.indexrelid)               as definition,
               exists (
                   select 1
                     from unnest(ix.indkey) with ordinality k(att, pos)
                     join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
                    where a.attname = 'filiale_id'
                      and k.pos <= ix.indnkeyatts)          as porte_filiale
          from pg_index ix
          join pg_class     i   on i.oid = ix.indexrelid
          join pg_class     c   on c.oid = ix.indrelid
          join pg_namespace n   on n.oid = c.relnamespace
          left join pg_constraint con
                 on con.conindid = ix.indexrelid and con.contype in ('u', 'p', 'x')
         where n.nspname = 'public'
           and c.relkind in ('r', 'p')
           -- unicité (index seul ou contrainte) ET exclusion : l'index d'une contrainte
           -- d'exclusion n'est pas « unique », il faut donc l'attraper par la contrainte.
           and (ix.indisunique or con.contype = 'x')
           and not ix.indisprimary
           -- « cloisonnée » a un sens précis et un seul dans ce dépôt : la table porte
           -- une colonne filiale_id (CONVENTIONS §4).
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'filiale_id'
                          and a.attnum > 0 and not a.attisdropped)
         order by c.relname, 2
    loop
        if r.porte_filiale or r.nom = any (v_globales) then
            continue;
        end if;

        objet    := r.tbl || '.' || r.nom;
        anomalie := 'unicite_transfrontaliere';
        detail   := format(
            '%s sur une table cloisonnée, sans filiale_id parmi ses colonnes de clé : une '
            'filiale occupe une valeur dans l''espace d''une autre, qui ne peut plus '
            'l''employer et reçoit un doublon sans détail sur une ligne invisible '
            '(CONVENTIONS.md §19.1). Définition : %s', r.genre, r.definition);
        return next;
    end loop;

    -- Une exemption qui ne désigne plus rien élargit la dérogation à la prochaine
    -- contrainte qui reprendrait ce nom, et ne se voit pas. On la réclame.
    foreach v_nom in array v_globales loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'exemption_obsolete';
            detail   := 'unicité déclarée délibérément globale dans '
                        'f_verifier_unicite_cloisonnee(), mais introuvable : la dérogation '
                        'ne porte plus sur rien et couvrirait toute contrainte future qui '
                        'reprendrait ce nom';
            return next;
        end if;
    end loop;

    return;
end;
$function$;

-- =====================================================================================
-- §7 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ Il ÉPROUVE les contraintes au lieu de lire leur texte (`CONVENTIONS.md` §39.1), et
-- il nomme ses pièces UNE PAR UNE (§39.7).
--
-- Son contrôle le plus important n'est pas sur les tables : c'est le **4**, qui mesure
-- que les deux déclencheurs d'enfilement sont armés « always » ET sur le bon ÉVÉNEMENT.
-- Un déclencheur dont l'événement a été déplacé passe pour vivant et ne déclenche plus
-- rien — c'est le constat **Q-281**, où deux barrières mortes rendaient zéro anomalie
-- pendant que leur verdict vert était cité dans trois documents.
-- =====================================================================================

create or replace function f_verifier_ouverture()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$fn$
declare
    v_temoins constant jsonb := jsonb_build_array(
        jsonb_build_object('t','jetons_api','n','ck_jetons_api_niveau',
            'ligne', jsonb_build_object('niveau','superadmin'),
            'e','UN NIVEAU HORS VOCABULAIRE devient ecrivable. La resolution du perimetre '
                'ne le reconnaitrait pas, et le jeton se comporterait comme le niveau le '
                'plus bas — ou le plus haut, selon la redaction du jour'),
        jsonb_build_object('t','jetons_api','n','ck_jetons_api_domaines',
            'ligne', jsonb_build_object('domaines', jsonb_build_array()),
            'e','UN JETON SANS DOMAINE devient ecrivable : la ligne existe, l''ecran '
                'affiche une integration en place, et chaque appel est refuse'),
        jsonb_build_object('t','jetons_api','n','ck_jetons_api_empreinte',
            'ligne', jsonb_build_object('empreinte','trop-court'),
            'e','une empreinte tronquee devient ecrivable'),
        jsonb_build_object('t','jetons_api','n','ck_jetons_api_revoque',
            'ligne', jsonb_build_object('revoque_le','2026-01-01T00:00:00Z'),
            'e','une revocation SANS AUTEUR devient ecrivable : on saurait qu''un acces a '
                'ete coupe, jamais par qui — dans un produit qui sert de preuve'),
        jsonb_build_object('t','abonnements_evenements','n','ck_abonnements_evenements_evenement',
            'ligne', jsonb_build_object('evenement','tout'),
            'e','un abonnement a un evenement QUE RIEN N''EMET devient ecrivable : '
                'l''integration a l''air en place et ne se declenche jamais'),
        jsonb_build_object('t','abonnements_evenements','n','ck_abonnements_evenements_url',
            'ligne', jsonb_build_object('url','http://exemple.interne/webhook'),
            'e','UNE DESTINATION EN CLAIR devient ecrivable. La charge porte le nom de la '
                'filiale et l''identifiant d''un incident de securite : en clair sur le '
                'reseau du client, c''est une fuite — et elle est invisible, puisque '
                'l''envoi « reussit »'),
        jsonb_build_object('t','evenements_sortants','n','ck_evenements_sortants_statut',
            'ligne', jsonb_build_object('statut','peut-etre'),
            'e','le vocabulaire de la file cesse d''etre clos, et le drainage ne sait plus '
                'ce qu''il doit reprendre'),
        jsonb_build_object('t','evenements_sortants','n','ck_evenements_sortants_envoye',
            'ligne', jsonb_build_object('statut','envoye'),
            'e','UN EVENEMENT « ENVOYE » SANS DATE D''ENVOI devient ecrivable : la file se '
                'vide sans qu''on puisse dire quand, ni prouver qu''elle l''a ete')
    );
    v_ligne_valide constant jsonb := jsonb_build_object(
        'niveau', 'lecture',
        'domaines', jsonb_build_array('conformite'),
        'empreinte', repeat('a', 64),
        'prefixe', 'grc_7f3a',
        'nom', 'Collecte Active Directory',
        'emis_par', 'rssi.tls',
        'evenement', 'incident_cree',
        'url', 'https://suivi.exemple.interne/webhook',
        'statut', 'en_attente');
    v_piece jsonb;
    v_accepte boolean;
    -- Les deux declencheurs d'enfilement. ⚠️ `tgtype` : bit 4 = insert, bit 16 = update.
    v_declencheurs constant jsonb := jsonb_build_array(
        jsonb_build_object('t','incidents','n','trg_incidents_evenement','bit', 4,
            'e','un incident cree n''enfile plus rien : l''outil de suivi du client ne '
                'voit plus aucun incident, et personne ne s''en apercoit avant le jour ou '
                'l''on comptait dessus'),
        jsonb_build_object('t','approbations','n','trg_approbations_evenement','bit', 16,
            'e','un refus d''approbation n''enfile plus rien'));
    v_d jsonb;
    v_tgtype smallint;
    v_tgenabled "char";
begin
    if to_regclass('public.jetons_api') is null
       or to_regclass('public.abonnements_evenements') is null
       or to_regclass('public.evenements_sortants') is null
    then
        objet    := 'ouverture';
        anomalie := 'tables_ouverture_absentes';
        detail   := 'Une des trois tables du lot L22 a disparu.';
        return next;
        return;
    end if;

    -- ── 2. LES CONTRAINTES SONT EPROUVEES, pas lues (§39.1) ────────────────────────
    for v_piece in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n',
                                          v_piece -> 'ligne');
        if v_accepte is null then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_ouverture_non_mesurable';
            detail   := format('Le predicat de « %s » n''a pas pu etre evalue sur sa ligne '
                               'temoin. On ne prend PAS « je n''ai pas pu mesurer » pour '
                               '« c''est bon » (constat Q-292).', v_piece ->> 'n');
            return next;
        elsif v_accepte then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_ouverture_videe';
            detail   := format('La contrainte « %s » ACCEPTE la ligne temoin %s, qu''elle '
                               'doit refuser. Ce que cela produit : %s.',
                               v_piece ->> 'n', v_piece -> 'ligne', v_piece ->> 'e');
            return next;
        end if;
    end loop;

    -- ── 3. ET LE NON-BRUIT : une ligne ordinaire passe ─────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n', v_ligne_valide);
        if v_accepte is distinct from true then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_ouverture_refuse_le_normal';
            detail   := format('La contrainte « %s » refuse une ligne parfaitement '
                               'ordinaire. Une barriere qui refuse tout satisfait le '
                               'controle precedent et rend le produit inutilisable : les '
                               'deux sens sont necessaires.', v_piece ->> 'n');
            return next;
        end if;
    end loop;

    -- ── 4. ⚠️ LES DEUX DECLENCHEURS — EVENEMENT ET ARMEMENT ───────────────────────
    for v_d in select * from jsonb_array_elements(v_declencheurs) loop
        select t.tgtype, t.tgenabled into v_tgtype, v_tgenabled
          from pg_trigger t
         where t.tgrelid = to_regclass('public.' || (v_d ->> 't'))
           and t.tgname = v_d ->> 'n' and not t.tgisinternal;

        if v_tgtype is null then
            objet    := (v_d ->> 't') || '.' || (v_d ->> 'n');
            anomalie := 'declencheur_evenement_absent';
            detail   := format('Le declencheur « %s » a disparu. Ce que cela produit : %s.',
                               v_d ->> 'n', v_d ->> 'e');
            return next;
        else
            if (v_tgtype & (v_d ->> 'bit')::smallint) = 0 then
                objet    := (v_d ->> 't') || '.' || (v_d ->> 'n');
                anomalie := 'declencheur_evenement_deplace';
                detail   := format('Le declencheur « %s » existe, mais son EVENEMENT a '
                                   'change : il ne se declenche plus sur ce qu''il doit '
                                   'surveiller. Ce que cela produit : %s.',
                                   v_d ->> 'n', v_d ->> 'e');
                return next;
            end if;
            if v_tgenabled <> 'A' then
                objet    := (v_d ->> 't') || '.' || (v_d ->> 'n');
                anomalie := 'declencheur_evenement_mal_arme';
                detail   := format('Le declencheur « %s » n''est pas arme « always » : un '
                                   '« set session_replication_role = replica » le '
                                   'desarmerait, et la reprise d''une sauvegarde '
                                   'n''enfilerait plus rien. Ce que cela produit : %s.',
                                   v_d ->> 'n', v_d ->> 'e');
                return next;
            end if;
        end if;
    end loop;

    return;
end;
$fn$;

comment on function f_verifier_ouverture() is
    'Garde-fou de l''ouverture technique (lot L22, actions 22.1 a 22.3). Les huit pieces '
    'nommees sont EPROUVEES dans les deux sens — elles refusent leur ligne temoin ET '
    'acceptent une ligne ordinaire (§39.1) —, et les deux declencheurs d''enfilement sont '
    'mesures sur leur EVENEMENT (tgtype) et leur ARMEMENT (tgenabled), jamais sur leur '
    'seule existence : c''est le constat Q-281, ou deux barrieres mortes rendaient zero '
    'anomalie. Decouvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §8 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('053', 'L''ouverture technique (lot L22, actions 22.1 a 22.3) : les jetons d''API '
               '— sujets de droits qui traversent la RLS au lieu de la contourner, dont le '
               'secret n''est jamais stocke et dont l''expiration est OBLIGATOIRE —, les '
               'abonnements aux evenements, et la FILE des evenements sortants, enfilee '
               'par des declencheurs EN BASE et drainee par une unite distincte : le '
               'service web n''appelle jamais l''exterieur')
on conflict (version) do nothing;

commit;
