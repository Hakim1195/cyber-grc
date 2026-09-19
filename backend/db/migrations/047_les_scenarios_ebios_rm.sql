-- =====================================================================================
--  047 — EBIOS RM : L'ÉCOSYSTÈME, LES SCÉNARIOS STRATÉGIQUES ET OPÉRATIONNELS,
--        ET LA DÉCISION DE TRAITEMENT
--
--  §0  Le périmètre de la migration
--  §1  Les parties prenantes — atelier 3, et la cartographie N'EST PAS refaite
--  §2  Le niveau de menace d'une partie prenante est DÉRIVÉ
--  §3  Les scénarios stratégiques — atelier 3
--  §4  Les scénarios opérationnels, et la décision de l'atelier 5
--  §5  Le niveau d'un scénario est DÉRIVÉ
--  §6  Provenance, traçabilité, registre de l'article 30
--  §7  Le domaine « type_entite » admet les trois tables
--  §8  Cloisonnement
--  §9  Les garde-fous — celui du lot, et un garde de CLASSE que le lot d'avant a payé
--  §10 Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Elle achève l'action **25.1** : la `046` a livré les ateliers 1 et 2 — le cadrage, les
--  valeurs métier, les événements redoutés, les couples source de risque / objectif visé.
--  Restaient les trois derniers, et ce sont eux qui font d'EBIOS RM une méthode plutôt
--  qu'un inventaire :
--
--    · **atelier 3** — l'écosystème et les scénarios STRATÉGIQUES : par où une source de
--      risque atteint une valeur métier, et par quelle partie prenante elle passe ;
--    · **atelier 4** — les scénarios OPÉRATIONNELS : le mode opératoire technique, et sa
--      vraisemblance ;
--    · **atelier 5** — le TRAITEMENT : ce qu'on décide de chaque scénario.
--
--  ── ⚠️ CE QUE CETTE MIGRATION NE CRÉE PAS, ET C'EST LE CRITÈRE 25.2 ────────────────
--
--  *« Aucun graphe neuf : le module Cartographie porte déjà les dépendances typées. »*
--  L'atelier 3 d'EBIOS RM s'appuie sur une cartographie de l'écosystème ; le produit en a
--  une. Ce qui manquait n'était pas le graphe, c'était **l'ÉVALUATION d'une partie
--  prenante** — dépendance, pénétration, maturité, confiance — et c'est tout ce que le §1
--  ajoute. Une partie prenante qui est déjà un prestataire du produit le **POINTE**
--  (`prestataire_id`) : ni sa raison sociale, ni sa criticité, ni son niveau d'accès ne
--  sont recopiés.
--
--  ── ⚠️ ET L'ATELIER 5 NE CRÉE AUCUNE TABLE DE PLAN D'ACTIONS ──────────────────────
--
--  Le plan de traitement d'EBIOS RM, ce sont les **actions** du produit, qui existent
--  depuis le premier chantier et savent déjà se rattacher à un risque
--  (`actions.risque_id`). Un scénario opérationnel porte donc une **décision** — éviter,
--  réduire, transférer, accepter — et, facultativement, le **risque** du registre F × G × M
--  auquel il se rattache. À partir de là, le plan d'actions existant s'applique sans
--  qu'une ligne soit écrite ici.
--
--  ⚠️ **C'est un LIEN, pas une conversion.** Rattacher un scénario à un risque n'écrit
--  RIEN dans `risques` : ni cotation, ni niveau, ni score. Le garde-fou de la `046` le
--  mesure déjà pour toutes les tables `ebios_*`, celles-ci comprises — il balaie le
--  catalogue, il ne récite pas une liste.
--
--  ── LA GRAVITÉ NE SE RECOPIE PAS, ET C'EST LA DÉCISION DE CONCEPTION ──────────────
--
--  Un scénario stratégique réalise un **événement redouté**, et sa gravité EST celle de
--  cet événement. Lui donner une colonne `gravite` créerait une seconde réponse à la même
--  question — et la seconde vieillirait dès qu'on réévalue l'atelier 1, sans que personne
--  le sache. C'est le motif de l'AIPD (migration `039`) et celui des valeurs métier
--  (`046`), et un essai le mesure **dans le catalogue** plutôt que de le relire.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 047_les_scenarios_ebios_rm.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §1 AJOUTE une unicité à `actifs`, ce qui la VALIDE contre les lignes existantes ;
-- `force row level security` vaut pour le propriétaire. Motif du §0 de la `012`, règle du
-- `CONVENTIONS.md` §42 : on déclare le groupe ENTIER, jamais une filiale.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-047', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- La cible des clés composites vers `actifs`. Même geste qu'à `processus` dans la `046`
-- et qu'à `prestataires` dans la `042` : sans elle, PostgreSQL refuse la clé composite, et
-- une clé SIMPLE serait satisfaite par un actif INVISIBLE de la filiale voisine (§17.1).
alter table actifs drop constraint if exists uq_actifs_id_filiale;
alter table actifs add  constraint uq_actifs_id_filiale unique (id, filiale_id);

comment on constraint uq_actifs_id_filiale on actifs is
    'Cible des clés étrangères COMPOSITES vers « actifs » (CONVENTIONS.md §17.1). Posée '
    'par la 047 pour ebios_scenarios_operationnels.actif_id — le bien support que le mode '
    'opératoire vise.';

-- =====================================================================================
-- §1 — LES PARTIES PRENANTES — ATELIER 3
-- -------------------------------------------------------------------------------------
-- ⚠️ **La cartographie n'est PAS refaite** (critère 25.2). Ce que cette table ajoute est
-- l'ÉVALUATION d'une partie prenante selon les quatre critères d'EBIOS RM, et le lien
-- vers le prestataire du produit quand c'en est un.
-- =====================================================================================

create table if not exists ebios_parties_prenantes (
    id             id_metier   not null default f_generer_id('EBPP'),
    filiale_id     id_metier   not null,
    etude_id       id_metier   not null,

    nom            text        not null,
    categorie      text        not null,
    -- Le tiers du produit que cette partie prenante EST, ou nul. Facultatif : une partie
    -- prenante peut être un client, une autorité, une entité interne — toutes choses que
    -- le registre des prestataires ne porte pas.
    prestataire_id id_metier,

    -- Les quatre critères de l'atelier 3. L'application propose 1 à 4 ; le schéma borne
    -- la SAISIE, pas l'échelle (même arbitrage que la `046`, voir son en-tête).
    dependance     smallint,
    penetration    smallint,
    maturite       smallint,
    confiance      smallint,

    notes          text,

    version        integer     not null default 1,
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    modifie_le     timestamptz,
    modifie_par    text,

    constraint pk_ebios_parties_prenantes primary key (id),
    constraint uq_ebios_parties_prenantes_id_filiale unique (id, filiale_id),
    constraint fk_ebios_parties_prenantes_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_ebios_parties_prenantes_etude
        foreign key (etude_id, filiale_id) references ebios_etudes (id, filiale_id)
        on delete cascade,
    -- ⚠️ `set null (prestataire_id)` — LA LISTE DE COLONNES, `CONVENTIONS.md` §43.
    -- Sans elle, PostgreSQL nullifie AUSSI `filiale_id`, qui est `not null` : supprimer un
    -- prestataire référencé échouerait en 23502, et la purge de « remplacer » avec lui.
    -- C'est le défaut que la `046` a payé de dix essais tombés d'un coup.
    constraint fk_ebios_parties_prenantes_prestataire
        foreign key (prestataire_id, filiale_id) references prestataires (id, filiale_id)
        on delete set null (prestataire_id),

    constraint ck_ebios_parties_prenantes_nom check (nom <> ''),
    -- ⚠️ Vocabulaire FERMÉ, contrairement à `risque_catalogue.categorie` qui est libre —
    -- et la différence se justifie. Là-bas il s'agit de NOMMER une menace, et le
    -- vocabulaire des menaces bouge plus vite qu'une migration. Ici il s'agit de RANGER
    -- l'écosystème en familles, et ces familles sont celles de la méthode : une valeur
    -- hors liste n'est pas un besoin neuf, c'est une erreur de modélisation que l'atelier
    -- doit voir. L'omission échoue donc bruyamment, ce qui est le critère du `CLAUDE.md` §3.
    constraint ck_ebios_parties_prenantes_categorie check (categorie in (
        'client', 'fournisseur', 'partenaire', 'entite_interne', 'autorite')),
    constraint ck_ebios_parties_prenantes_criteres check (
        (dependance  is null or (dependance  >= 1 and dependance  <= 10))
        and (penetration is null or (penetration >= 1 and penetration <= 10))
        and (maturite    is null or (maturite    >= 1 and maturite    <= 10))
        and (confiance   is null or (confiance   >= 1 and confiance   <= 10))),
    constraint ck_ebios_parties_prenantes_longueurs check (
        length(nom) <= 300 and (notes is null or length(notes) <= 4000))
);

comment on table ebios_parties_prenantes is
    'Partie prenante de l''écosystème, évaluée selon les quatre critères de l''atelier 3 '
    'd''EBIOS RM (dépendance, pénétration, maturité cyber, confiance). ⚠️ Elle POINTE le '
    'prestataire du produit quand c''en est un — ni raison sociale, ni criticité, ni '
    'niveau d''accès ne sont recopiés (critère 25.2). ⚠️ Et le NIVEAU DE MENACE n''est '
    'pas une colonne : il se dérive (f_ebios_niveau_menace), parce qu''une colonne devrait '
    'être remise à jour après chaque révision d''un critère.';

comment on column ebios_parties_prenantes.categorie is
    'client | fournisseur | partenaire | entite_interne | autorite. Vocabulaire FERMÉ : '
    'ce sont les familles de la méthode, et une valeur hors liste est une erreur de '
    'modélisation que l''atelier doit voir, non un besoin que le produit doit absorber.';

create index if not exists ix_ebios_parties_prenantes_etude
    on ebios_parties_prenantes (filiale_id, etude_id);

-- =====================================================================================
-- §2 — LE NIVEAU DE MENACE EST DÉRIVÉ
-- -------------------------------------------------------------------------------------
-- EBIOS RM le construit en deux temps : l'**exposition** (dépendance × pénétration) et la
-- **fiabilité cyber** (maturité × confiance) ; le niveau de menace est leur rapport. Une
-- partie prenante très pénétrante dont on dépend beaucoup, et dont la maturité et la
-- confiance sont faibles, est celle par laquelle on se fait atteindre.
--
-- ⚠️ **Elle rend `null` dès qu'un critère manque** — même décision qu'à
-- `f_ebios_pertinence` : une menace calculée sur trois critères sur quatre aurait l'air
-- mesurée sans l'être, et c'est ce chiffre-là qui est cité en comité (critère 25.4).
--
-- `immutable` : elle ne dépend que de ses arguments.
-- =====================================================================================

create or replace function f_ebios_niveau_menace(
    p_dependance  smallint,
    p_penetration smallint,
    p_maturite    smallint,
    p_confiance   smallint
)
returns numeric
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        when p_dependance is null or p_penetration is null
          or p_maturite is null or p_confiance is null then null
        -- La fiabilité ne peut pas valoir zéro : les deux critères sont bornés à 1 au
        -- plus bas par `ck_ebios_parties_prenantes_criteres`. Le garde du §9 l'éprouve.
        else round((p_dependance::numeric * p_penetration)
                   / (p_maturite::numeric * p_confiance), 2)
    end;
$$;

comment on function f_ebios_niveau_menace(smallint, smallint, smallint, smallint) is
    'Niveau de menace d''une partie prenante (atelier 3) : exposition (dépendance × '
    'pénétration) rapportée à la fiabilité cyber (maturité × confiance). ⚠️ Rend « null » '
    'dès qu''un critère manque — pas d''estimation par défaut, motif du critère 25.4. '
    'Plus le nombre est GRAND, plus la partie prenante est une voie d''atteinte : au-delà '
    'de 1, on dépend d''elle plus qu''on ne peut lui faire confiance.';

grant execute on function f_ebios_niveau_menace(smallint, smallint, smallint, smallint) to grc_app;
grant execute on function f_ebios_niveau_menace(smallint, smallint, smallint, smallint) to grc_lecture;

-- =====================================================================================
-- §3 — LES SCÉNARIOS STRATÉGIQUES — ATELIER 3
-- -------------------------------------------------------------------------------------
-- Un scénario stratégique est un CHEMIN : une source de risque retenue atteint un
-- événement redouté, éventuellement en passant par une partie prenante.
--
-- ⚠️ **AUCUNE colonne `gravite`.** La gravité d'un scénario stratégique EST celle de
-- l'événement redouté qu'il réalise. Une colonne ici créerait une seconde réponse à la
-- même question, et la seconde vieillirait dès qu'on réévalue l'atelier 1 — sans que
-- personne le sache. Un essai le mesure dans le catalogue (motif de l'AIPD, `039`).
-- =====================================================================================

create table if not exists ebios_scenarios_strategiques (
    id                   id_metier   not null default f_generer_id('EBSS'),
    filiale_id           id_metier   not null,
    etude_id             id_metier   not null,

    source_id            id_metier   not null,
    evenement_redoute_id id_metier   not null,
    -- Par où le chemin passe. Facultatif : une source de risque peut atteindre
    -- directement, sans intermédiaire — c'est même le cas le plus simple.
    partie_prenante_id   id_metier,

    nom                  text        not null,
    chemin               text,
    notes                text,

    version              integer     not null default 1,
    cree_le              timestamptz not null default now(),
    cree_par             text        not null default f_utilisateur_courant(),
    modifie_le           timestamptz,
    modifie_par          text,

    constraint pk_ebios_scenarios_strategiques primary key (id),
    constraint uq_ebios_scenarios_strategiques_id_filiale unique (id, filiale_id),
    constraint fk_ebios_scenarios_strategiques_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_ebios_scenarios_strategiques_etude
        foreign key (etude_id, filiale_id) references ebios_etudes (id, filiale_id)
        on delete cascade,
    -- Le scénario n'existe pas sans sa source ni sans son événement redouté : `cascade`.
    constraint fk_ebios_scenarios_strategiques_source
        foreign key (source_id, filiale_id)
        references ebios_sources_risque (id, filiale_id) on delete cascade,
    constraint fk_ebios_scenarios_strategiques_evenement
        foreign key (evenement_redoute_id, filiale_id)
        references ebios_evenements_redoutes (id, filiale_id) on delete cascade,
    -- Il existe SANS partie prenante : `set null`, et sa liste de colonnes (§43).
    constraint fk_ebios_scenarios_strategiques_partie
        foreign key (partie_prenante_id, filiale_id)
        references ebios_parties_prenantes (id, filiale_id)
        on delete set null (partie_prenante_id),

    constraint ck_ebios_scenarios_strategiques_nom check (nom <> ''),
    constraint ck_ebios_scenarios_strategiques_longueurs check (
        length(nom) <= 300
        and (chemin is null or length(chemin) <= 4000)
        and (notes is null or length(notes) <= 4000))
);

comment on table ebios_scenarios_strategiques is
    'Scénario stratégique (atelier 3) : par où une source de risque RETENUE atteint un '
    'événement redouté, et par quelle partie prenante elle passe. ⚠️ AUCUNE colonne de '
    'gravité : elle EST celle de l''événement redouté réalisé, et la recopier créerait '
    'une seconde réponse à la même question — qui vieillirait dès la prochaine '
    'réévaluation de l''atelier 1, sans que personne le sache.';

create index if not exists ix_ebios_scenarios_strategiques_etude
    on ebios_scenarios_strategiques (filiale_id, etude_id);

-- =====================================================================================
-- §4 — LES SCÉNARIOS OPÉRATIONNELS, ET LA DÉCISION DE L'ATELIER 5
-- -------------------------------------------------------------------------------------
-- L'atelier 4 décrit le mode opératoire technique d'un chemin stratégique, et lui donne
-- une vraisemblance. L'atelier 5 décide quoi en faire.
--
-- ⚠️ **Le plan d'actions n'est PAS refait** : `actions.risque_id` existe depuis le premier
-- chantier. Rattacher un scénario à un risque du registre suffit pour que tout le plan
-- d'actions existant s'applique — et ce rattachement est un LIEN, pas une conversion :
-- rien n'est écrit dans `risques` (critère 25.1, mesuré par le garde-fou de la `046`).
-- =====================================================================================

create table if not exists ebios_scenarios_operationnels (
    id                       id_metier   not null default f_generer_id('EBSO'),
    filiale_id               id_metier   not null,
    scenario_strategique_id  id_metier   not null,

    nom                      text        not null,
    mode_operatoire          text,
    -- Le mode opératoire TYPE du socle de connaissances, ou nul. Clé SIMPLE vers une table
    -- MIXTE : même arbitrage qu'à `ebios_sources_risque.connaissance_id` (§5 de la `046`)
    -- et qu'à `risques.catalogue_id` (§2 de la `012`).
    connaissance_id          id_metier,
    -- Le bien support visé. Facultatif : un mode opératoire peut viser l'organisation.
    actif_id                 id_metier,
    vraisemblance            smallint,

    -- ── Atelier 5 : le traitement ──────────────────────────────────────────────
    decision                 text,
    justification_decision   text,
    -- Le risque du registre F × G × M auquel ce scénario se rattache, ou nul. ⚠️ UN LIEN,
    -- PAS UNE CONVERSION : rien n'est écrit dans « risques ».
    risque_id                id_metier,

    notes                    text,

    version                  integer     not null default 1,
    cree_le                  timestamptz not null default now(),
    cree_par                 text        not null default f_utilisateur_courant(),
    modifie_le               timestamptz,
    modifie_par              text,

    constraint pk_ebios_scenarios_operationnels primary key (id),
    constraint uq_ebios_scenarios_operationnels_id_filiale unique (id, filiale_id),
    constraint fk_ebios_scenarios_operationnels_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_ebios_scenarios_operationnels_strategique
        foreign key (scenario_strategique_id, filiale_id)
        references ebios_scenarios_strategiques (id, filiale_id) on delete cascade,
    constraint fk_ebios_scenarios_operationnels_connaissance
        foreign key (connaissance_id) references ebios_connaissances (id) on delete set null,
    -- ⚠️ Les deux `set null` COMPOSITES nomment leur colonne — `CONVENTIONS.md` §43.
    constraint fk_ebios_scenarios_operationnels_actif
        foreign key (actif_id, filiale_id) references actifs (id, filiale_id)
        on delete set null (actif_id),
    constraint fk_ebios_scenarios_operationnels_risque
        foreign key (risque_id, filiale_id) references risques (id, filiale_id)
        on delete set null (risque_id),

    constraint ck_ebios_scenarios_operationnels_nom check (nom <> ''),
    constraint ck_ebios_scenarios_operationnels_vraisemblance check (
        vraisemblance is null or (vraisemblance >= 1 and vraisemblance <= 10)),
    constraint ck_ebios_scenarios_operationnels_decision check (
        decision is null or decision in ('eviter', 'reduire', 'transferer', 'accepter')),
    -- ⚠️ **ACCEPTER SE JUSTIFIE, et c'est la seule des quatre décisions qui l'exige.**
    -- Les trois autres produisent un travail que quelqu'un verra ; accepter ne produit
    -- RIEN — c'est la décision qui disparaît si personne n'écrit pourquoi, et c'est
    -- exactement celle qu'un auditeur vient chercher. Même forme que
    -- `ck_ebios_sources_risque_retenue` (046).
    constraint ck_ebios_scenarios_operationnels_acceptation check (
        decision is distinct from 'accepter'
        or (justification_decision is not null and justification_decision <> '')),
    constraint ck_ebios_scenarios_operationnels_longueurs check (
        length(nom) <= 300
        and (mode_operatoire is null or length(mode_operatoire) <= 4000)
        and (justification_decision is null or length(justification_decision) <= 4000)
        and (notes is null or length(notes) <= 4000))
);

comment on table ebios_scenarios_operationnels is
    'Scénario opérationnel (atelier 4) : le mode opératoire technique d''un chemin '
    'stratégique, sa vraisemblance — et la DÉCISION de l''atelier 5. ⚠️ Le plan d''actions '
    'n''est pas refait : rattacher le scénario à un risque du registre (risque_id) suffit '
    'pour que « actions.risque_id » s''applique. ⚠️ Et c''est un LIEN, pas une conversion : '
    'rien n''est écrit dans « risques », ce que f_verifier_ebios_cadrage() mesure.';

comment on column ebios_scenarios_operationnels.decision is
    'eviter | reduire | transferer | accepter (atelier 5). ⚠️ « accepter » exige sa '
    'justification, et c''est la seule des quatre : les trois autres produisent un travail '
    'que quelqu''un verra, accepter ne produit rien — c''est la décision qui disparaît si '
    'personne n''écrit pourquoi, et celle qu''un auditeur vient chercher.';

create index if not exists ix_ebios_scenarios_operationnels_strategique
    on ebios_scenarios_operationnels (filiale_id, scenario_strategique_id);
create index if not exists ix_ebios_scenarios_operationnels_risque
    on ebios_scenarios_operationnels (risque_id) where risque_id is not null;

-- =====================================================================================
-- §5 — LE NIVEAU D'UN SCÉNARIO EST DÉRIVÉ
-- -------------------------------------------------------------------------------------
-- Gravité × vraisemblance, comme toute matrice de risque. ⚠️ Les seuils ne sont PAS ceux
-- de `risques.niveau` (faible < 3, élevé 3 à 7,9, critique ≥ 8), et il faut le dire : là-
-- bas le score est un produit **fréquence × gravité** pondéré par la maîtrise, ici c'est
-- le produit de deux axes bornés à quatre. Reprendre les seuils de l'un pour l'autre
-- rendrait « critique » presque tout, ou presque rien.
--
-- ⚠️ Et elle rend `null` dès qu'un terme manque, comme ses deux sœurs.
-- =====================================================================================

create or replace function f_ebios_niveau_scenario(
    p_gravite       smallint,
    p_vraisemblance smallint
)
returns text
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        when p_gravite is null or p_vraisemblance is null then null
        when p_gravite * p_vraisemblance <= 3  then 'faible'
        when p_gravite * p_vraisemblance <= 6  then 'significatif'
        when p_gravite * p_vraisemblance <= 9  then 'eleve'
        else 'critique'
    end;
$$;

comment on function f_ebios_niveau_scenario(smallint, smallint) is
    'Niveau d''un scénario opérationnel : gravité × vraisemblance, en quatre paliers — '
    'faible, significatif, eleve, critique. ⚠️ Les seuils diffèrent de risques.niveau à '
    'DESSEIN : là-bas le score est fréquence × gravité pondéré par la maîtrise, ici c''est '
    'le produit de deux axes bornés à quatre. ⚠️ Rend « null » dès qu''un terme manque — '
    'et la GRAVITÉ vient de l''événement redouté, jamais d''une colonne du scénario.';

grant execute on function f_ebios_niveau_scenario(smallint, smallint) to grc_app;
grant execute on function f_ebios_niveau_scenario(smallint, smallint) to grc_lecture;

-- =====================================================================================
-- §6 — PROVENANCE, TRAÇABILITÉ, REGISTRE DE L'ARTICLE 30
-- =====================================================================================

alter table ebios_parties_prenantes       add column if not exists provenance provenance_ligne not null;
alter table ebios_scenarios_strategiques  add column if not exists provenance provenance_ligne not null;
alter table ebios_scenarios_operationnels add column if not exists provenance provenance_ligne not null;

do $$
declare v_table text;
begin
    foreach v_table in array array['ebios_parties_prenantes', 'ebios_scenarios_strategiques',
                                   'ebios_scenarios_operationnels']
    loop
        execute format('drop trigger if exists trg_%s_provenance on %I', v_table, v_table);
        execute format('create trigger trg_%s_provenance before insert on %I '
                       'for each row execute function f_marquer_provenance()', v_table, v_table);
        execute format('drop trigger if exists trg_%s_maj on %I', v_table, v_table);
        execute format('create trigger trg_%s_maj before update on %I '
                       'for each row execute function f_maj_tracabilite()', v_table, v_table);
    end loop;
end;
$$;

select f_poser_tracabilite_insertion();

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  -- ── ebios_parties_prenantes ───────────────────────────────────────────────────────
  ('ebios_parties_prenantes', 'nom', 'personnelle',
   'Nommer la partie prenante de l''écosystème évaluée à l''atelier 3 : sans son nom, '
   'l''évaluation ne désigne personne et le chemin d''attaque n''est pas traçable.',
   'Intérêt légitime', 1095, 'signaler',
   'C''est normalement une ORGANISATION — un fournisseur, un client, une autorité. Mais la '
   'catégorie « entite_interne » admet une équipe, et une équipe se désigne parfois par la '
   'personne qui la porte. Régime « signaler » : le produit montre l''emplacement à un '
   'humain au lieu d''effacer un nom qui est peut-être celui d''une société.'),
  ('ebios_parties_prenantes', 'categorie', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (client | fournisseur | partenaire | entite_interne | autorite).'),
  ('ebios_parties_prenantes', 'notes', 'personnelle',
   'Consigner ce que l''évaluation des quatre critères ne dit pas : un incident passé, '
   'une clause contractuelle, un contact.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre sans sujet imposé : un nom peut y figurer. Régime « signaler ».'),

  -- ── ebios_scenarios_strategiques ──────────────────────────────────────────────────
  ('ebios_scenarios_strategiques', 'nom', 'non_personnelle', null, null, null, null,
   'Intitulé d''un chemin d''attaque (« le concurrent passe par le mainteneur de la '
   'supervision »). Il désigne des organisations et des systèmes, pas une personne.'),
  ('ebios_scenarios_strategiques', 'chemin', 'personnelle',
   'Décrire par où la source de risque atteint la valeur métier — c''est la pièce que '
   'l''atelier 4 reprend pour en faire un mode opératoire technique.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre dont le sujet est un chemin technique et organisationnel ; un nom peut y '
   'figurer (« via le compte d''administration de X »). Régime « signaler ».'),
  ('ebios_scenarios_strategiques', 'notes', 'personnelle',
   'Consigner ce qui ne rentre dans aucun autre champ du scénario.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre sans sujet imposé. Régime « signaler ».'),

  -- ── ebios_scenarios_operationnels ─────────────────────────────────────────────────
  ('ebios_scenarios_operationnels', 'nom', 'non_personnelle', null, null, null, null,
   'Intitulé d''un mode opératoire (« hameçonnage ciblé puis élévation de privilèges »).'),
  ('ebios_scenarios_operationnels', 'mode_operatoire', 'personnelle',
   'Décrire les actions élémentaires de l''attaquant — c''est ce qui rend le scénario '
   'vérifiable, et ce sur quoi porte la décision de l''atelier 5.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre dont le sujet est une technique d''attaque ; un nom peut y figurer '
   '(« compte de service de X »). Le remplacer détruirait la phrase, et cette phrase est '
   'l''analyse. Régime « signaler ».'),
  ('ebios_scenarios_operationnels', 'decision', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos (eviter | reduire | transferer | accepter).'),
  ('ebios_scenarios_operationnels', 'justification_decision', 'personnelle',
   'Motiver la décision de traitement — et, pour « accepter », c''est la seule trace '
   'qu''une décision a été prise plutôt qu''oubliée.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre dont le sujet est une décision d''analyse ; un nom peut y figurer '
   '(« accepté en comité par X »). Régime « signaler ».'),
  ('ebios_scenarios_operationnels', 'notes', 'personnelle',
   'Consigner ce qui ne rentre dans aucun autre champ du scénario.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre sans sujet imposé. Régime « signaler ».')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §7 — LE DOMAINE « type_entite » ADMET LES TROIS TABLES
-- =====================================================================================
-- Sans cela elles sont INCRÉABLES : toute création écrit au journal (`CONVENTIONS.md`
-- §40.1). On LIT le prédicat appliqué, on insère à côté de son modèle, et on REFUSE
-- d'agir si le texte a changé (motif du §4 de la `027`).

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := '''ebios_sources_risque''';
    v_ajouts   constant text := '''ebios_sources_risque'', ''ebios_parties_prenantes'', '
                                '''ebios_scenarios_strategiques'', '
                                '''ebios_scenarios_operationnels''';
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable : la 001 n''a pas été appliquée.';
    end if;
    if position('''ebios_parties_prenantes''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà les tables de la 047 : rejeu, rien à faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « ebios_sources_risque » est introuvable dans le '
                        'prédicat appliqué de type_entite_check : son texte a changé, et '
                        'la substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);
    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais les trois tables des ateliers 3 à 5.';
end;
$$;

-- =====================================================================================
-- §8 — CLOISONNEMENT
-- =====================================================================================
-- Trois tables purement locales : le patron des dérogations, celui de la `046`.

alter table ebios_parties_prenantes       enable row level security;
alter table ebios_parties_prenantes       force  row level security;
alter table ebios_scenarios_strategiques  enable row level security;
alter table ebios_scenarios_strategiques  force  row level security;
alter table ebios_scenarios_operationnels enable row level security;
alter table ebios_scenarios_operationnels force  row level security;

do $$
declare v_table text;
begin
    foreach v_table in array array['ebios_parties_prenantes', 'ebios_scenarios_strategiques',
                                   'ebios_scenarios_operationnels']
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

grant select, insert, update, delete on ebios_parties_prenantes       to grc_app;
grant select, insert, update, delete on ebios_scenarios_strategiques  to grc_app;
grant select, insert, update, delete on ebios_scenarios_operationnels to grc_app;
grant select on ebios_parties_prenantes       to grc_lecture;
grant select on ebios_scenarios_strategiques  to grc_lecture;
grant select on ebios_scenarios_operationnels to grc_lecture;

select f_armer_declencheurs();

-- ⚠️ APRÈS les politiques, jamais avant : le prédicat de découverte exige que la politique
-- de SUPPRESSION soit cloisonnée (`CONVENTIONS.md` §40.2).
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §9 — LES GARDE-FOUS
-- =====================================================================================

-- ── 9.1 — UN GARDE DE CLASSE, et le lot d'avant l'a payé ────────────────────────────
--
-- ⚠️ **`CONVENTIONS.md` §43, écrit après que la `046` eut coûté dix essais tombés d'un
-- coup.** Un `on delete set null` sans liste de colonnes nullifie TOUTE la clé — donc
-- `filiale_id`, qui est `not null` partout. Supprimer un parent RÉFÉRENCÉ échoue alors en
-- 23502, la purge de « remplacer » avec lui, et **toute restauration de sauvegarde**.
--
-- Le §43.4 disait qu'un garde de CLASSE « restait à écrire » et que chaque clé nommait la
-- sienne en attendant. Le voici : il balaie le CATALOGUE, il ne récite rien, et il couvre
-- les clés qu'aucune migration n'a encore écrites.
--
-- ⚠️ Il ne juge PAS les clés simples : sur une clé à une colonne, `set null` sans liste
-- nullifie cette colonne et rien d'autre — c'est le comportement voulu, et l'exiger de
-- nommer sa colonne unique serait du bruit.

create or replace function f_verifier_set_null_composites()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    for r in
        select c.conrelid::regclass::text as table_nom,
               c.conname::text            as contrainte,
               array_length(c.conkey, 1)  as colonnes
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
         where c.contype = 'f'
           and c.confdeltype = 'n'            -- on delete set null
           and array_length(c.conkey, 1) > 1  -- clé COMPOSITE
           and c.confdelsetcols is null       -- … sans liste de colonnes
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.contrainte;
        anomalie := 'set_null_sans_liste_de_colonnes';
        detail   := format(
            'Cette clé étrangère porte « on delete set null » sur %s colonnes SANS nommer '
            'celle(s) à nullifier. PostgreSQL les met alors TOUTES à null — y compris '
            '« filiale_id », qui est « not null » sur toute table cloisonnée. Supprimer un '
            'parent RÉFÉRENCÉ échoue en 23502 ; la purge de « POST /api/reprise » en mode '
            '« remplacer » balaie toutes les tables cloisonnées, donc TOUTE RESTAURATION DE '
            'SAUVEGARDE tombe. ⚠️ Et rien ne le dit tant qu''aucun parent référencé n''est '
            'supprimé : le schéma se crée, les gardes passent, les écrans marchent. Écrivez '
            '« on delete set null (<colonne>) » — CONVENTIONS.md §43.', r.colonnes);
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_set_null_composites() is
    'Garde de CLASSE (CONVENTIONS.md §43) : aucune clé étrangère COMPOSITE ne porte '
    '« on delete set null » sans nommer la ou les colonnes à nullifier. Sans la liste, '
    'PostgreSQL nullifie toute la clé — « filiale_id » compris — et toute suppression d''un '
    'parent référencé échoue en 23502, purge de « remplacer » comprise. ⚠️ Il balaie le '
    'CATALOGUE : il couvre les clés qu''aucune migration n''a encore écrites, ce qu''une '
    'liste nominative ne peut pas faire. Découvert par f_decouvrir_controles_schema().';

-- ── 9.2 — LE GARDE DU LOT ───────────────────────────────────────────────────────────
--
-- ⚠️ Il ÉPROUVE les deux dérivations (§39.1) et nomme ses pièces UNE PAR UNE (§39.7).
-- Son contrôle le plus important est le **4** : aucune colonne de gravité sur un scénario
-- stratégique. C'est une propriété NÉGATIVE, et elle ne se mesure qu'en la cherchant.

create or replace function f_verifier_ebios_scenarios()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_menace constant jsonb := jsonb_build_array(
        jsonb_build_object('d',4,'p',4,'m',1,'c',1,'attendu','16.00',
            'effet','la partie prenante la plus dangereuse — on dépend d''elle, elle '
                    'pénètre partout, elle n''est ni mûre ni fiable — cesserait de '
                    'ressortir, et l''atelier 3 classerait l''écosystème à l''envers'),
        jsonb_build_object('d',1,'p',1,'m',4,'c',4,'attendu','0.06',
            'effet','la partie prenante la plus sûre cesserait de l''être'),
        jsonb_build_object('d',2,'p',2,'m',2,'c',2,'attendu','1.00',
            'effet','le point d''équilibre — on dépend d''elle autant qu''on peut lui '
                    'faire confiance — se déplacerait'),
        jsonb_build_object('d',null,'p',4,'m',2,'c',2,'attendu',null,
            'effet','LE PRODUIT INVENTERAIT UN NIVEAU DE MENACE à partir de trois '
                    'critères sur quatre. C''est le défaut que le critère 25.4 nomme : un '
                    'chiffre qui a l''air mesuré sans l''être est pire que pas de chiffre')
    );
    v_niveau constant jsonb := jsonb_build_array(
        jsonb_build_object('g',1,'v',1,'attendu','faible',
            'effet','le scénario le moins grave et le moins vraisemblable ressortirait '
                    'au-dessus de « faible », et le plan de traitement s''y perdrait'),
        jsonb_build_object('g',4,'v',4,'attendu','critique',
            'effet','LE SCÉNARIO LE PLUS GRAVE ET LE PLUS VRAISEMBLABLE CESSERAIT D''ÊTRE '
                    'CRITIQUE. C''est celui sur lequel l''atelier 5 décide en premier'),
        jsonb_build_object('g',2,'v',2,'attendu','significatif',
            'effet','les paliers intermédiaires se confondraient'),
        -- ⚠️ LES DEUX CÔTÉS DU SEUIL, et la première rédaction n'en portait qu'un —
        -- fausse, de surcroît : elle attendait « critique » pour 3 × 3 = 9, que le
        -- prédicat range dans « eleve ». Le garde-fou l'a dit à la première application.
        -- *Un témoin qui se trompe de valeur ne mesure pas la fonction, il mesure la
        -- mémoire de celui qui l'a écrit* — d'où les deux bornes, qui se contrediraient
        -- si le seuil bougeait d'un cran dans l'un ou l'autre sens.
        jsonb_build_object('g',3,'v',3,'attendu','eleve',
            'effet','le seuil haut se déplacerait : 9 est le DERNIER « eleve », et c''est '
                    'ce que le commentaire de la fonction annonce'),
        jsonb_build_object('g',3,'v',4,'attendu','critique',
            'effet','le seuil haut se déplacerait dans l''autre sens : 12 est le PREMIER '
                    '« critique », et l''atelier 5 décide de ceux-là en premier'),
        jsonb_build_object('g',null,'v',4,'attendu',null,
            'effet','un scénario sans gravité recevrait un niveau : or la gravité vient '
                    'de l''événement redouté, et son absence est une information')
    );
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('t','ebios_parties_prenantes','n','fk_ebios_parties_prenantes_etude',
            'e','une partie prenante peut se rattacher à une étude INVISIBLE de la filiale '
                'voisine (CONVENTIONS §17.1)'),
        jsonb_build_object('t','ebios_parties_prenantes','n','fk_ebios_parties_prenantes_prestataire',
            'e','le lien vers le tiers du produit n''est plus cloisonné : l''écran '
                'afficherait la raison sociale d''un prestataire d''une AUTRE filiale'),
        jsonb_build_object('t','ebios_parties_prenantes','n','ck_ebios_parties_prenantes_categorie',
            'e','l''écosystème ne se range plus en familles, et la cartographie de '
                'l''atelier 3 perd ses axes'),
        jsonb_build_object('t','ebios_scenarios_strategiques','n','fk_ebios_scenarios_strategiques_source',
            'e','un chemin d''attaque peut partir d''une source INVISIBLE de la voisine'),
        jsonb_build_object('t','ebios_scenarios_strategiques','n','fk_ebios_scenarios_strategiques_evenement',
            'e','un chemin d''attaque peut viser un événement redouté INVISIBLE de la '
                'voisine — et c''est de lui que le scénario tire sa gravité'),
        jsonb_build_object('t','ebios_scenarios_strategiques','n','fk_ebios_scenarios_strategiques_partie',
            'e','le passage par une partie prenante n''est plus cloisonné'),
        jsonb_build_object('t','ebios_scenarios_operationnels','n','fk_ebios_scenarios_operationnels_strategique',
            'e','un mode opératoire peut se rattacher à un chemin INVISIBLE de la voisine'),
        jsonb_build_object('t','ebios_scenarios_operationnels','n','fk_ebios_scenarios_operationnels_risque',
            'e','LE LIEN VERS LE REGISTRE F × G × M N''EST PLUS CLOISONNÉ : un scénario '
                'pointerait un risque INVISIBLE d''une autre filiale, et l''écran '
                'afficherait sa cotation — une fuite entre filiales sur la donnée la plus '
                'sensible du produit'),
        jsonb_build_object('t','ebios_scenarios_operationnels','n','ck_ebios_scenarios_operationnels_acceptation',
            'e','ACCEPTER UN RISQUE SANS ÉCRIRE POURQUOI redevient possible. C''est la '
                'seule des quatre décisions qui ne produit aucun travail visible : sans sa '
                'justification, elle est indistinguable d''un oubli — et c''est exactement '
                'ce qu''un auditeur vient chercher'),
        jsonb_build_object('t','ebios_scenarios_operationnels','n','ck_ebios_scenarios_operationnels_decision',
            'e','le vocabulaire du traitement n''est plus fermé, et le plan de l''atelier 5 '
                'ne se compte plus'),
        jsonb_build_object('t','actifs','n','uq_actifs_id_filiale',
            'e','la cible de la clé composite vers « actifs » disparaît, et avec elle la '
                'seule chose qui empêche un mode opératoire de viser un actif invisible')
    );
    v_cas jsonb;
    v_rendu text;
begin
    -- ── 1. Les deux dérivations existent-elles ? ────────────────────────────────────
    if to_regprocedure('public.f_ebios_niveau_menace(smallint, smallint, smallint, smallint)') is null
       or to_regprocedure('public.f_ebios_niveau_scenario(smallint, smallint)') is null then
        objet    := 'f_ebios_niveau_menace / f_ebios_niveau_scenario';
        anomalie := 'derivation_scenarios_absente';
        detail   := 'Une des deux dérivations des ateliers 3 à 5 a disparu. Sans elles, '
                    'l''écosystème ne se classe plus et le plan de traitement n''a plus '
                    'd''ordre de priorité.';
        return next;
        return;
    end if;

    -- ── 2. LE NIVEAU DE MENACE, ÉPROUVÉ (§39.1) ────────────────────────────────────
    for v_cas in select * from jsonb_array_elements(v_menace) loop
        v_rendu := f_ebios_niveau_menace((v_cas->>'d')::smallint, (v_cas->>'p')::smallint,
                                         (v_cas->>'m')::smallint, (v_cas->>'c')::smallint)::text;
        if v_rendu is distinct from (v_cas->>'attendu') then
            objet    := 'f_ebios_niveau_menace';
            anomalie := 'derivation_menace_fausse';
            detail   := format(
                'Dépendance « %s », pénétration « %s », maturité « %s », confiance « %s » : '
                'la fonction rend « %s » au lieu de « %s ». Ce que cela produit : %s.',
                coalesce(v_cas->>'d','(null)'), coalesce(v_cas->>'p','(null)'),
                coalesce(v_cas->>'m','(null)'), coalesce(v_cas->>'c','(null)'),
                coalesce(v_rendu,'(null)'), coalesce(v_cas->>'attendu','(null)'),
                v_cas->>'effet');
            return next;
        end if;
    end loop;

    -- ── 3. LE NIVEAU D'UN SCÉNARIO, ÉPROUVÉ ────────────────────────────────────────
    for v_cas in select * from jsonb_array_elements(v_niveau) loop
        v_rendu := f_ebios_niveau_scenario((v_cas->>'g')::smallint, (v_cas->>'v')::smallint);
        if v_rendu is distinct from (v_cas->>'attendu') then
            objet    := 'f_ebios_niveau_scenario';
            anomalie := 'derivation_niveau_scenario_fausse';
            detail   := format(
                'Gravité « %s », vraisemblance « %s » : la fonction rend « %s » au lieu de '
                '« %s ». Ce que cela produit : %s.',
                coalesce(v_cas->>'g','(null)'), coalesce(v_cas->>'v','(null)'),
                coalesce(v_rendu,'(null)'), coalesce(v_cas->>'attendu','(null)'),
                v_cas->>'effet');
            return next;
        end if;
    end loop;

    -- ── 4. ⚠️ AUCUNE COLONNE DE GRAVITÉ SUR UN SCÉNARIO STRATÉGIQUE ────────────────
    --
    -- La gravité EST celle de l'événement redouté réalisé. Une colonne ici créerait une
    -- seconde réponse à la même question, et la seconde vieillirait dès qu'on réévalue
    -- l'atelier 1 — sans que personne le sache. Mesuré dans le CATALOGUE.
    if exists (
        select 1 from pg_attribute a
         where a.attrelid = to_regclass('public.ebios_scenarios_strategiques')
           and a.attname in ('gravite', 'gravite_scenario', 'niveau')
           and a.attnum > 0 and not a.attisdropped)
    then
        objet    := 'ebios_scenarios_strategiques';
        anomalie := 'gravite_dupliquee';
        detail   := 'Cette table porte une colonne de gravité ou de niveau. La gravité '
                    'd''un scénario stratégique EST celle de l''événement redouté qu''il '
                    'réalise : la recopier crée une seconde réponse à la même question, et '
                    'la seconde vieillit dès la prochaine réévaluation de l''atelier 1, '
                    'sans que personne le sache. Elle se lit par la jointure, jamais par '
                    'une colonne (motif de l''AIPD, migration 039).';
        return next;
    end if;

    -- ── 5. Les pièces nommées ───────────────────────────────────────────────────────
    for v_cas in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.' || (v_cas->>'t'))
               and c.conname = v_cas->>'n'
               and c.convalidated)
        then
            objet    := (v_cas->>'t') || '.' || (v_cas->>'n');
            anomalie := 'ebios_scenario_piece_manquante';
            detail   := format(
                'Cette pièce des ateliers 3 à 5 a disparu ou n''est pas validée. Ce que sa '
                'disparition rouvre : %s.', v_cas->>'e');
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_ebios_scenarios() is
    'Garde-fou des ateliers 3, 4 et 5 d''EBIOS RM : les deux dérivations sont ÉPROUVÉES '
    'sur neuf cas témoins, dont deux tiennent le « pas d''estimation par défaut » (§39.1) ; '
    'les onze pièces du schéma sont nommées UNE PAR UNE (§39.7) ; et — surtout — la table '
    'des scénarios stratégiques ne porte AUCUNE colonne de gravité, parce que celle-ci est '
    'celle de l''événement redouté réalisé. Cette dernière propriété est NÉGATIVE : elle ne '
    'se voit pas à l''usage, elle ne se mesure qu''en la cherchant.';

-- =====================================================================================
-- §10 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('047', 'EBIOS RM, ateliers 3 à 5 : l''écosystème et ses parties prenantes évaluées, '
               'les scénarios stratégiques — dont la gravité n''est PAS recopiée —, les '
               'scénarios opérationnels et la décision de traitement. Plus un garde de '
               'CLASSE : aucune clé composite en « set null » sans sa liste de colonnes '
               '(CONVENTIONS.md §43, que la 046 a payé de dix essais)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_ebios_scenarios();
--   drop function if exists f_verifier_set_null_composites();
--   delete from controles_schema where fonction in ('f_verifier_ebios_scenarios',
--                                                   'f_verifier_set_null_composites');
--   drop table if exists ebios_scenarios_operationnels;
--   drop table if exists ebios_scenarios_strategiques;
--   drop table if exists ebios_parties_prenantes;
--   drop function if exists f_ebios_niveau_menace(smallint, smallint, smallint, smallint);
--   drop function if exists f_ebios_niveau_scenario(smallint, smallint);
--   delete from colonnes_personnelles where table_nom like 'ebios\_scenarios%'
--                                        or table_nom = 'ebios_parties_prenantes';
--   alter table actifs drop constraint if exists uq_actifs_id_filiale;
--   delete from migrations_schema where version = '047';
--   commit;
--   ⚠️ Annuler DÉTRUIT les chemins d'attaque analysés et les décisions de traitement —
--     y compris les « accepter » et leurs justifications, qui sont la pièce qu'un
--     auditeur demande en premier. Exportez avant.
-- =====================================================================================
