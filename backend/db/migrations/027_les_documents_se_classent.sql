-- =====================================================================================
--  027 — LES DOCUMENTS SE CLASSENT, ET LE REGISTRE LES RATTACHE
-- -------------------------------------------------------------------------------------
--  POURQUOI — deuxième pièce du lot RGPD, demandée par l'utilisateur le 11/09/2026 :
--  *« il faut que la norme RGPD soit appliquée à tout document […] dans ce logiciel,
--  c'est impératif. Il faut que les documents puissent être tagués et classifiés, c'est
--  la base. »*
--
--  La migration `026` a répondu à la question « quelles données personnelles le PRODUIT
--  détient-il ? ». Celle-ci répond à l'autre moitié, qui est celle du métier : **de quoi
--  parle ce document, qui a le droit de le voir, et à quel traitement de l'article 30
--  se rattache-t-il ?**
--
--  Le registre documentaire portait `titre`, `type`, `statut`, `proprietaire` — rien qui
--  dise le NIVEAU DE DIFFUSION, rien qui dise si la pièce contient des données
--  personnelles, rien qui la relie au registre des traitements que le produit tient déjà
--  dans la table `traitements`. Les deux registres cohabitaient sans se connaître.
--
--  ── CE QUE CETTE MIGRATION FAIT, EN QUATRE TEMPS ──────────────────────────────────────
--
--  §1  `traitements` devient MIXTE — et c'est un PRÉREQUIS MESURÉ, pas un supplément.
--      `traitements.filiale_id` est `not null` : un document de portée Groupe — la PSSI,
--      la charte informatique — n'aurait pu pointer vers AUCUN traitement, puisque la clé
--      étrangère de portée (§2) exige que les deux extrémités soient du même côté de la
--      frontière. Rattacher la PSSI du groupe au traitement « journal d'audit » du groupe
--      est précisément le cas d'usage ; il fallait donc ouvrir la table d'abord.
--
--  §2  `documents` reçoit sa CLASSIFICATION : `confidentialite` (quatre niveaux),
--      `donnees_personnelles` (le drapeau), `traitement_id` (le rattachement à l'article
--      30) — et les ÉTIQUETTES libres arrivent dans une table à part.
--
--      ⚠️ **Une table, pas une colonne tableau.** Ce schéma est strictement relationnel et
--      n'a aucune colonne `text[]` : les référentiels couverts par un document, les mesures
--      d'un traitement, les actifs d'un incident sont tous des tables de liaison. Une
--      étiquette n'a aucune raison d'être l'exception — et la table permet de compter, de
--      filtrer et d'indexer, ce qu'un tableau ne donne pas.
--
--  §3  LE GARDE-FOU, ET IL EST DE CLASSE. `f_verifier_references_portee()` ne vérifie pas
--      « documents.traitement_id a ses deux clés » : il vérifie que **toute** référence
--      composite vers une table mixte porte SA CLÉ DE PORTÉE. C'est le constat N-10 de la
--      porte S1, transformé en règle mécanique au lieu d'une vigilance.
--
--  §4  Les deux listes écrites à la main qui doivent bouger : l'unicité délibérément
--      globale `uq_traitements_id_portee`, et les deux colonnes textuelles neuves au
--      registre des données personnelles de la `026`.
--
--  ── CE QU'ON NE FAIT PAS, ET POURQUOI ─────────────────────────────────────────────────
--
--  ⚠️ **Aucune contrainte ne lie `traitement_id` à `donnees_personnelles`.** La tentation
--  était d'exiger que l'un implique l'autre. Ce serait FAUX dans les deux sens : la
--  *procédure* qui décrit un traitement s'y rattache sans contenir la moindre donnée
--  personnelle, et un compte rendu peut nommer des gens sans relever d'un traitement
--  déclaré. Inventer ici un invariant qui n'en est pas donnerait au schéma l'autorité
--  d'une règle métier que personne n'a arbitrée.
--
--  ⚠️ **Aucune contrainte ne refuse « public » + « données personnelles ».** C'est
--  pourtant le signal le plus utile du lot — mais il a des cas légitimes (un document
--  public nomme son DPO, et c'est l'article 13 qui l'exige). Le refuser en base
--  empêcherait l'usage correct ; le produit le SIGNALE donc, à l'écran RGPD, au lieu de
--  l'interdire. Une alerte que l'on peut lever vaut mieux qu'une barrière qu'on contourne.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Même motif qu'au §0 de la migration 012, et il s'est rappelé à moi de la même façon —
-- par un GRC04 qui ne nomme pas sa cause. Cette migration LIT des tables cloisonnées sans
-- jamais écrire de `select` :
--
--   · `add constraint ck_documents_confidentialite` VALIDE les lignes existantes ;
--   · `add constraint fk_documents_traitement_*` les valide aussi.
--
-- `force row level security` s'appliquant au propriétaire lui-même, ces balayages passent
-- par `pol_documents_lecture`, qui appelle `f_filiales_lecture()`.
--
-- On déclare le groupe ENTIER : un périmètre partiel serait PIRE que pas de périmètre —
-- la contrainte se validerait sur les seules lignes visibles, en silence, et se
-- déclarerait valide pour toutes. `set_config(…, true)` vaut `set local` : les réglages
-- meurent avec la transaction.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-027', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — `traitements` DEVIENT MIXTE (Groupe + filiale)
-- =====================================================================================
--
-- Le patron est celui de la migration `012` (approbations), lui-même dérivé de
-- `documents` : `filiale_id` nullable, colonne `portee_groupe` ENGENDRÉE, unicité de
-- portée, déclencheur de portée figée, et les quatre politiques réécrites en « case ».
--
-- ⚠️ AUCUNE MIGRATION DE DONNÉES. Les traitements existants portent tous une filiale et
-- la gardent : « mixte » ouvre une possibilité, elle ne déplace personne. C'est
-- l'inverse de la `012`, qui devait refuser plutôt que de choisir — ici il n'y a rien à
-- choisir, puisque rien ne change de portée.

alter table traitements alter column filiale_id drop not null;

comment on column traitements.filiale_id is
    'Nullable DEPUIS LA 027 : nul = traitement de portée GROUPE, tenu une fois pour tout le '
    'groupe — le pendant exact de documents.filiale_id nul. Renseigné = traitement propre à '
    'une entité juridique, qui reste le cas ordinaire de l''article 30 (chaque responsable de '
    'traitement tient SON registre). La portée Groupe existe pour les traitements que le '
    'GROUPE opère pour toutes ses filiales — l''annuaire commun, le journal d''audit de cet '
    'outil — et sans elle un document de portée Groupe ne pouvait se rattacher à AUCUN '
    'traitement : la clé de portée du §2 exige les deux extrémités du même côté.';

alter table traitements
    add column portee_groupe boolean generated always as (filiale_id is null) stored;

comment on column traitements.portee_groupe is
    'Portée de la ligne, ENGENDRÉE. Sa seule raison d''être est d''offrir aux clés étrangères '
    'composites un couple qui, contrairement à (id, filiale_id), n''est JAMAIS nul — la règle '
    'de correspondance « match simple » neutralisant toute clé composite dont une colonne est '
    'nulle (constat N-10, porte S1). Même dispositif que documents.portee_groupe.';

alter table traitements add constraint uq_traitements_id_portee unique (id, portee_groupe);

comment on constraint uq_traitements_id_portee on traitements is
    'Cible de la clé étrangère de portée de documents.traitement_id et de '
    'traitement_mesures. (id) étant déjà la clé primaire, cette unicité n''interdit rien de '
    'plus : elle rend seulement le couple référençable. Dérogation à l''unicité cloisonnée '
    'inscrite au §4, comme uq_documents_id_portee avant elle.';

-- ── La table de liaison suit son parent ──────────────────────────────────────────────
--
-- `traitement_mesures.filiale_id` est une RECOPIE de la filiale du traitement, tenue par
-- la clé de cohérence et non par une saisie (CONVENTIONS.md §16.5). Le parent pouvant
-- désormais être Groupe, la recopie doit pouvoir l'être aussi — sinon un traitement de
-- portée Groupe ne pourrait porter aucune mesure de sécurité, et l'article 32 est
-- précisément ce que cette liaison sert à consigner.
alter table traitement_mesures alter column filiale_id drop not null;

alter table traitement_mesures
    add column portee_groupe boolean generated always as (filiale_id is null) stored;

-- LES DEUX CLÉS, et il en faut deux — le raisonnement complet est sur
-- fk_document_referentiels_portee (003 §10 bis) et il vaut mot pour mot ici :
--   - filiale_id renseigné -> la clé de cohérence impose traitements.filiale_id égal ;
--   - filiale_id nul       -> la clé de portée impose traitements.filiale_id nul aussi.
-- Sans la seconde, une liaison de portée GROUPE pourrait désigner le traitement LOCAL
-- d'une filiale, et la suppression ordinaire de ce traitement par sa filiale emporterait
-- en cascade une ligne du socle Groupe.
alter table traitement_mesures
    add constraint fk_traitement_mesures_portee
    foreign key (traitement_id, portee_groupe)
    references traitements (id, portee_groupe) on delete cascade;

comment on column traitement_mesures.filiale_id is
    'Recopie du filiale_id du traitement, NULLE pour un traitement de portée Groupe. Tenue '
    'cohérente par fk_traitement_mesures_traitement et fk_traitement_mesures_portee, jamais '
    'par une saisie.';

-- ── Les quatre politiques prennent la forme « mixte », sur les deux tables ────────────
--
-- Écrire une ligne de portée Groupe exige l'administration Groupe, comme toute écriture à
-- `filiale_id` nul (§17.4). La LECTURE, elle, est ouverte à tous : le socle Groupe est
-- commun, et c'est ce qui rend les filiales comparables.
--
-- ⚠️ « case » et non « or » : l'ordre d'évaluation d'un « or » n'est pas garanti et
-- f_filiale_ecriture() lève GRC04. Motif complet au §4 de la migration 004.
do $$
declare
    v_tables constant text[] := array['traitements', 'traitement_mesures'];
    v_lecture constant text :=
        'case when filiale_id is null then true'
        ' else filiale_id = any (f_filiales_lecture()) end';
    v_ecriture constant text :=
        'case when filiale_id is null then f_administration_groupe()'
        ' else filiale_id = f_filiale_ecriture() end';
    t text;
begin
    foreach t in array v_tables loop
        execute format('drop policy if exists %I on %I', 'pol_' || t || '_lecture', t);
        execute format('drop policy if exists %I on %I', 'pol_' || t || '_ajout', t);
        execute format('drop policy if exists %I on %I', 'pol_' || t || '_maj', t);
        execute format('drop policy if exists %I on %I', 'pol_' || t || '_suppression', t);

        execute format('create policy %I on %I for select using (%s)',
                       'pol_' || t || '_lecture', t, v_lecture);
        execute format('create policy %I on %I for insert with check (%s)',
                       'pol_' || t || '_ajout', t, v_ecriture);
        execute format('create policy %I on %I for update using (%s) with check (%s)',
                       'pol_' || t || '_maj', t, v_ecriture, v_ecriture);
        execute format('create policy %I on %I for delete using (%s)',
                       'pol_' || t || '_suppression', t, v_ecriture);

        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_lecture', t,
            'Lecture : un traitement de portée Groupe est lisible de toutes les filiales ; '
            'un traitement local suit le périmètre de la session.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_ajout', t,
            'Ajout : une ligne locale dans la seule filiale active ; une ligne de portée '
            'Groupe seulement en transaction d''administration Groupe. Ce réglage '
            'n''élargit jamais la lecture.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_maj', t,
            'Modification : mêmes conditions que l''ajout, appliquées SÉPARÉMENT à '
            'l''ancienne ligne et à la nouvelle. Le franchissement de la frontière '
            'Groupe/filiale est refusé par le déclencheur trg_' || t || '_portee_figee, '
            'pas par cette politique.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_suppression', t,
            'Suppression : mêmes conditions que l''ajout. Une filiale ne supprime pas le '
            'socle commun.');
    end loop;
end;
$$;

-- =====================================================================================
-- §2 — LA CLASSIFICATION DES DOCUMENTS
-- =====================================================================================

alter table documents
    add column confidentialite text not null default 'interne',
    add column donnees_personnelles boolean not null default false,
    add column traitement_id id_metier;

alter table documents add constraint ck_documents_confidentialite
    check (confidentialite in ('public', 'interne', 'confidentiel', 'restreint'));

comment on column documents.confidentialite is
    'Niveau de diffusion, quatre valeurs et pas une de plus : « public » (diffusable hors du '
    'groupe), « interne » (tout le groupe), « confidentiel » (une population nommée), '
    '« restreint » (le cercle le plus étroit — juridique, RH, réponse à incident). ⚠️ Le '
    'défaut est « interne » et NON « public » : un document dont personne n''a tranché la '
    'diffusion ne doit pas être réputé diffusable. NOT NULL à dessein — « non classifié » est '
    'précisément le trou que l''ISO 27001 (A.5.12) et le RGPD demandent de fermer.';

comment on column documents.donnees_personnelles is
    'Vrai si le document CONTIENT des données personnelles — pas s''il en parle. Booléen, pas '
    'une chaîne (CONVENTIONS.md §5). Sert à deux choses : répondre en minutes à une demande '
    'd''exercice de droits, et signaler la combinaison « public + données personnelles » que '
    'la base n''interdit PAS (elle a des cas légitimes : un document public nomme son DPO, '
    'article 13) mais que l''écran RGPD met en évidence.';

-- ── LE RATTACHEMENT AU REGISTRE DE L'ARTICLE 30 ─────────────────────────────────────
--
-- Deux clés, pour la raison exposée au §1 et démontrée par le constat N-10. Ici la
-- conséquence de l'oubli serait la plus visible du schéma : une politique de portée
-- GROUPE rattachée au traitement LOCAL d'une filiale, et l'effacement de ce traitement
-- par sa filiale viderait le rattachement d'un document que les dix-neuf autres lisent.
--
-- ⚠️ `restrict`, et ce n'est PAS le premier choix — c'est le second, après une mesure.
--
-- `on delete set null (traitement_id)` était écrit ici : la forme à colonnes de
-- PostgreSQL 15, qui semblait faite pour ce cas — ne mettre à nul QUE la colonne
-- référençante, en laissant tranquille la colonne engendrée. **PostgreSQL 17 la refuse
-- quand même** :
--
--     ERREUR : invalid ON DELETE action for foreign key constraint containing
--              generated column   (SQLSTATE 42601)
--
-- Le contrôle porte sur la présence d'une colonne engendrée dans la clé, pas sur les
-- colonnes que l'action toucherait. Tout `set null` est donc hors de portée ici, et
-- fabriquer une colonne de portée NON engendrée pour contourner serait ajouter un endroit
-- de plus où se tromper — ce que le §2 de la migration 012 refuse explicitement.
--
-- `restrict` est donc la barrière, et le DÉLIAGE vit dans la couche applicative, à la
-- filiale près : c'est exactement le dispositif arbitré au bloquant B-1 de la porte S1
-- pour `mesure_catalogue` (`CONVENTIONS.md` §17.6). La couche délie d'abord, dans le
-- périmètre de celui qui supprime, puis supprime ; si un rattachement subsiste AILLEURS,
-- la base rend `23503` et le produit répond « archivez-le au lieu de le supprimer ». Une
-- suppression qui délierait les documents des dix-neuf autres filiales, elle, serait le
-- bloquant B-1 rouvert.
alter table documents
    add constraint fk_documents_traitement_portee
    foreign key (traitement_id, portee_groupe)
    references traitements (id, portee_groupe) on delete restrict;

alter table documents
    add constraint fk_documents_traitement_coherence
    foreign key (traitement_id, filiale_id)
    references traitements (id, filiale_id) on delete restrict;

comment on column documents.traitement_id is
    'Traitement du registre RGPD (article 30) dont ce document relève — la politique de '
    'conservation d''un traitement, la procédure d''exercice des droits, l''analyse '
    'd''impact. Les deux registres que le produit tenait SANS SE CONNAÎTRE sont reliés ici. '
    '⚠️ Aucun lien avec « donnees_personnelles », et ce n''est pas un oubli : la procédure '
    'qui décrit un traitement s''y rattache sans contenir la moindre donnée personnelle.';

create index ix_documents_traitement on documents (traitement_id)
    where traitement_id is not null;
create index ix_documents_confidentialite on documents (filiale_id, confidentialite);

-- ── LES ÉTIQUETTES LIBRES ────────────────────────────────────────────────────────────
--
-- Une table, pas une colonne tableau : voir l'en-tête. Sa forme est celle de
-- `document_referentiels`, à ceci près que la valeur est saisie et non choisie dans un
-- catalogue — d'où la normalisation, qui est le seul point délicat.
create table document_etiquettes (
    document_id   id_metier   not null,
    -- L'étiquette est la CLÉ : elle est donc normalisée à l'écriture, sans quoi
    -- « RGPD », « rgpd » et « Rgpd » seraient trois étiquettes distinctes sur la même
    -- fiche et le filtrage n'en trouverait qu'une. La normalisation est faite par le
    -- déclencheur ci-dessous, DANS LA BASE : la faire dans la route laisserait passer
    -- l'import, la reprise et psql — c'est la leçon du relais de cascade (§8.1).
    etiquette     text        not null,
    filiale_id    id_metier,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    portee_groupe boolean generated always as (filiale_id is null) stored,
    constraint pk_document_etiquettes primary key (document_id, etiquette),
    constraint fk_document_etiquettes_portee foreign key (document_id, portee_groupe)
        references documents (id, portee_groupe) on delete cascade,
    constraint fk_document_etiquettes_coherence foreign key (document_id, filiale_id)
        references documents (id, filiale_id) on delete cascade,
    constraint fk_document_etiquettes_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_document_etiquettes_valeur check (
        etiquette <> '' and length(etiquette) <= 48
        -- Ni virgule ni point-virgule : une étiquette voyage dans des listes jointes
        -- (filtres d'écran, export CSV), et un séparateur dans la valeur y scinderait
        -- l'étiquette en deux. Même raisonnement que la virgule interdite dans
        -- id_metier (001 §17.3).
        and etiquette !~ '[,;]'
        -- Déjà normalisée : le déclencheur passe avant, ce contrôle ferme le chemin
        -- qui l'aurait désarmé.
        and etiquette = btrim(etiquette)
        and etiquette !~ '\s\s')
);

create index ix_document_etiquettes_filiale on document_etiquettes (filiale_id, etiquette);
create index ix_document_etiquettes_valeur  on document_etiquettes (etiquette);

comment on table document_etiquettes is
    'Étiquettes libres d''un document (n-n avec des valeurs saisies). Table de liaison : ni '
    'version, ni déclencheur de mise à jour — une étiquette ne se modifie pas, elle se '
    'supprime et se recrée. ⚠️ UNE TABLE ET NON UNE COLONNE TABLEAU : ce schéma est '
    'strictement relationnel, et la table donne le comptage, le filtrage et l''index qu''un '
    'text[] ne donne pas.';
comment on column document_etiquettes.etiquette is
    'Valeur saisie, NORMALISÉE à l''écriture par trg_document_etiquettes_normalise (espaces '
    'ramenés à un, extrémités rognées). La casse est CONSERVÉE — « PSSI » n''est pas '
    '« pssi » à l''œil d''un lecteur — mais l''unicité est insensible à la casse, tenue par '
    'le même déclencheur : la seconde écriture d''une variante de casse est refusée.';
comment on column document_etiquettes.filiale_id is
    'Recopie du filiale_id du document, nulle pour un document Groupe. Tenue cohérente par '
    'les deux clés étrangères, jamais par une saisie.';

-- ── La normalisation vit DANS LA BASE ────────────────────────────────────────────────
create or replace function f_normaliser_etiquette() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    new.etiquette := btrim(regexp_replace(new.etiquette, '\s+', ' ', 'g'));

    if new.etiquette = '' then
        raise exception 'Une étiquette vide (ou faite d''espaces) ne classe rien.'
            using errcode = '23514',
                  hint = 'Saisissez un mot, ou retirez l''étiquette.';
    end if;

    -- Unicité insensible à la casse : la clé primaire, elle, est sensible. Sans ce
    -- contrôle, « RGPD » et « rgpd » coexisteraient sur la même fiche et le filtre par
    -- étiquette n'en ramènerait qu'une — un filtre qui perd des lignes en silence est
    -- pire que pas de filtre.
    if exists (select 1 from document_etiquettes e
                where e.document_id = new.document_id
                  and lower(e.etiquette) = lower(new.etiquette))
    then
        raise exception 'Ce document porte déjà l''étiquette « % », à la casse près.',
                        new.etiquette
            using errcode = '23505',
                  hint = 'Les étiquettes sont uniques par document, sans égard à la casse.';
    end if;

    return new;
end;
$$;

comment on function f_normaliser_etiquette() is
    'Normalise l''étiquette à l''insertion (espaces internes ramenés à un, extrémités '
    'rognées) et refuse un doublon à la casse près sur le même document. ⚠️ DANS LA BASE et '
    'non dans la route : l''import généralisé, la reprise d''un export et psql écrivent aussi '
    'dans cette table, et une route ne voit que son chemin — il y en a toujours un de plus '
    '(CONVENTIONS.md §8.1).';

create trigger trg_document_etiquettes_normalise
    before insert on document_etiquettes
    for each row execute function f_normaliser_etiquette();

alter table document_etiquettes enable row level security;
alter table document_etiquettes force row level security;

create policy pol_document_etiquettes_lecture on document_etiquettes for select using (
    case when filiale_id is null then true
         else filiale_id = any (f_filiales_lecture()) end
);
create policy pol_document_etiquettes_ajout on document_etiquettes for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end
);
create policy pol_document_etiquettes_maj on document_etiquettes for update
    using (case when filiale_id is null then f_administration_groupe()
                else filiale_id = f_filiale_ecriture() end)
    with check (case when filiale_id is null then f_administration_groupe()
                     else filiale_id = f_filiale_ecriture() end);
create policy pol_document_etiquettes_suppression on document_etiquettes for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end
);

comment on policy pol_document_etiquettes_lecture on document_etiquettes is
    'Lecture : les étiquettes d''un document de portée Groupe sont lisibles de toutes les '
    'filiales, comme le document lui-même ; celles d''un document local suivent le périmètre.';
comment on policy pol_document_etiquettes_ajout on document_etiquettes is
    'Ajout : dans la seule filiale active ; sur le socle Groupe, en administration Groupe.';
comment on policy pol_document_etiquettes_maj on document_etiquettes is
    'Modification : mêmes conditions que l''ajout. Une étiquette se supprime et se recrée '
    'plutôt qu''elle ne se modifie ; cette politique existe pour que la table ne soit pas '
    'en écriture muette (f_verifier_couverture_rls l''exige).';
comment on policy pol_document_etiquettes_suppression on document_etiquettes is
    'Suppression : dans la seule filiale active ; sur le socle Groupe, en administration '
    'Groupe.';

grant select, insert, update, delete on document_etiquettes to grc_app;
grant select on document_etiquettes to grc_lecture;

-- Les deux tables devenues mixtes, plus la table neuve, réclament leur déclencheur de
-- portée figée. DÉCOUVERT, jamais énuméré : c'est f_tables_mixtes() qui décide.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_portee_figee();
    raise notice 'Portée figée : % déclencheur(s) posé(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §3 — LE GARDE-FOU, ET IL EST DE CLASSE
-- =====================================================================================
--
-- ⚠️ **Ce garde-fou ne vérifie pas les trois références que cette migration ajoute.** Il
-- vérifie LA RÈGLE dont elles sont trois instances, et il l'a prouvé en naissant : écrit
-- avant que `fk_traitement_mesures_portee` existe, il l'a réclamée.
--
-- La règle, énoncée au constat N-10 de la porte S1 et jamais mécanisée depuis :
--
--   Une clé étrangère composite qui vise une table MIXTE en passant par `filiale_id`
--   ne vérifie RIEN quand `filiale_id` est nul — la règle de correspondance « match
--   simple » de SQL neutralise toute clé composite dont une colonne est nulle. Or
--   `filiale_id` nul est exactement la portée Groupe, c'est-à-dire le cas le plus
--   partagé du schéma. Il faut donc une SECONDE clé, passant par une colonne qui n'est
--   jamais nulle : `portee_groupe`, engendrée.
--
-- Hors de cette classe, et à dessein : les références SIMPLES à une table mixte
-- (`risques.catalogue_id`, `actions.mesure_id`, `mesure_mise_en_oeuvre.mesure_id`). Elles
-- n'ont jamais prétendu vérifier l'égalité des filiales, leur oracle d'existence faible
-- est arbitré par écrit au §2 de la migration 012, et les faire rougir ici rouvrirait une
-- décision prise — un garde-fou qui crie sur ce qui est arbitré cesse d'être lu.
create or replace function f_verifier_references_portee()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
begin
    for r in
        -- Toute clé étrangère COMPOSITE dont l'une des colonnes référençantes est un
        -- `filiale_id` NULLABLE, et dont la table visée est MIXTE.
        select con.conname::text        as contrainte,
               src.relname::text        as source,
               cible.relname::text      as cible,
               con.conrelid             as src_oid
          from pg_constraint con
          join pg_class     src   on src.oid = con.conrelid
          join pg_class     cible on cible.oid = con.confrelid
          join pg_namespace n     on n.oid = src.relnamespace and n.nspname = 'public'
         where con.contype = 'f'
           and array_length(con.conkey, 1) > 1
           and cible.relname::text in (select nom from f_tables_mixtes())
           and exists (
                 select 1 from pg_attribute a
                  where a.attrelid = con.conrelid
                    and a.attnum = any (con.conkey)
                    and a.attname = 'filiale_id'
                    and not a.attnotnull)
         order by 1
    loop
        -- La compagne attendue : une autre clé étrangère de la MÊME table vers la MÊME
        -- cible, passant par `portee_groupe`. On ne compare pas les noms — un nom se
        -- change —, on regarde les colonnes.
        if not exists (
            select 1
              from pg_constraint c2
              join pg_class cible2 on cible2.oid = c2.confrelid
             where c2.contype = 'f'
               and c2.conrelid = r.src_oid
               and cible2.relname::text = r.cible
               and exists (
                     select 1 from pg_attribute a2
                      where a2.attrelid = c2.conrelid
                        and a2.attnum = any (c2.conkey)
                        and a2.attname = 'portee_groupe'))
        then
            objet    := r.source || '.' || r.contrainte;
            anomalie := 'reference_portee_sans_compagne';
            detail   := format(
                'Cette clé étrangère composite vise « %s », qui est MIXTE, en passant par un '
                'filiale_id NULLABLE : quand filiale_id est nul — c''est-à-dire pour toute '
                'ligne de portée Groupe — la règle « match simple » la neutralise et elle ne '
                'vérifie plus RIEN. Il manque une seconde clé vers « %s » passant par la '
                'colonne engendrée portee_groupe, qui n''est jamais nulle. Sans elle, une '
                'ligne de portée GROUPE peut désigner une ligne LOCALE d''une filiale, et la '
                'suppression ordinaire de celle-ci emporte le socle commun (constat N-10, '
                'porte S1).', r.cible, r.cible);
            return next;
        end if;
    end loop;
    return;
end;
$$;

comment on function f_verifier_references_portee() is
    'Constat N-10 de la porte S1, mécanisé au lieu d''être confié à la vigilance : toute clé '
    'étrangère COMPOSITE visant une table mixte par un filiale_id nullable doit avoir sa '
    'compagne passant par portee_groupe. Découverte dans le catalogue, jamais récitée — une '
    'table qui devient mixte fait entrer d''un coup toutes ses références dans le périmètre. '
    'Hors classe à dessein : les références SIMPLES à une table mixte, arbitrées au §2 de la '
    'migration 012. Un schéma sain ne renvoie AUCUNE ligne.';

grant execute on function f_verifier_references_portee() to grc_app;

-- ── Et le garde-fou de la classification elle-même ───────────────────────────────────
--
-- Il mesure le CONTENU des contraintes, pas leur nom : une contrainte renommée est
-- visible, une contrainte vidée de sa substance ne l'est pas. C'est la leçon du constat
-- Q-283 — « le garde mesure la longueur, pas l'originalité » — et de la migration 025.
create or replace function f_verifier_classification_documents()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_niveaux constant text[] := array['public', 'interne', 'confidentiel', 'restreint'];
    v_source  text;
    v_niveau  text;
    r         record;
begin
    -- 1. Les deux colonnes existent, portent LE TYPE ATTENDU, et sont NOT NULL.
    --    « Non classifié » est le trou que ce lot ferme ; une colonne nullable le
    --    rouvrirait sans un mot. Et le TYPE est vérifié parce qu'il porte du sens :
    --    `donnees_personnelles` ramenée à du texte accepterait « non », « Non », « n »
    --    et « faux » comme autant de vérités distinctes — c'est le §5 des conventions,
    --    et c'est un défaut que ce produit a déjà connu.
    for r in
        select * from (values ('confidentialite', 'text'),
                              ('donnees_personnelles', 'boolean')) as v(nom, typ)
    loop
        if not exists (
            select 1 from pg_attribute a
             where a.attrelid = to_regclass('public.documents')
               and a.attname = r.nom and a.attnum > 0 and not a.attisdropped
               and a.attnotnull
               and format_type(a.atttypid, a.atttypmod) = r.typ)
        then
            objet    := 'documents.' || r.nom;
            anomalie := 'classification_absente_ou_facultative';
            detail   := format(
                'La colonne de classification manque, elle accepte le nul, ou elle n''est '
                'plus de type « %s » : un document sans niveau de diffusion déclaré est '
                'exactement ce que l''ISO 27001 A.5.12 et le RGPD demandent de fermer.',
                r.typ);
            return next;
        end if;
    end loop;

    -- 2. La contrainte de niveaux existe ET elle porte LES QUATRE. Un contrôle qui se
    --    contente du nom laisserait passer « check (confidentialite in ('public')) ».
    select pg_get_constraintdef(con.oid) into v_source
      from pg_constraint con
     where con.conrelid = to_regclass('public.documents')
       and con.conname = 'ck_documents_confidentialite';

    if v_source is null then
        objet    := 'documents.ck_documents_confidentialite';
        anomalie := 'niveaux_non_bornes';
        detail   := 'Aucune contrainte ne borne les niveaux de confidentialité : « diffusion '
                    'libre » deviendrait une valeur comme une autre, à une faute de frappe '
                    'près, et le filtrage par niveau perdrait des documents en silence.';
        return next;
    else
        foreach v_niveau in array v_niveaux loop
            if position('''' || v_niveau || '''' in v_source) = 0 then
                objet    := 'documents.ck_documents_confidentialite';
                anomalie := 'niveau_de_diffusion_perdu';
                detail   := format('Le niveau « %s » ne figure plus dans la contrainte : '
                                   '%s. Les quatre niveaux sont le vocabulaire de la '
                                   'classification, et en retirer un rend inécrivables les '
                                   'documents qui le portaient.', v_niveau, v_source);
                return next;
            end if;
        end loop;
    end if;

    -- 3. La normalisation des étiquettes est un DÉCLENCHEUR ARMÉ SUR L'INSERTION, pas une
    --    fonction que quelqu'un se souviendra d'appeler. Mesure de l'ÉVÉNEMENT — constat
    --    Q-281 : deux gardes vérifiaient qu'un déclencheur existe sans jamais regarder à
    --    quoi il répond, et les deux barrières étaient mortes sous un verdict vert.
    --      tgtype : 1 = ROW, 2 = BEFORE, 4 = INSERT.
    if not exists (
        select 1 from pg_trigger t
         where t.tgrelid = to_regclass('public.document_etiquettes')
           and not t.tgisinternal
           and t.tgname = 'trg_document_etiquettes_normalise'
           and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4
           and t.tgenabled = 'A')
    then
        objet    := 'document_etiquettes.trg_document_etiquettes_normalise';
        anomalie := 'normalisation_non_armee';
        detail   := 'Le déclencheur de normalisation des étiquettes manque, ne répond pas à '
                    '« before insert … for each row », ou n''est pas armé « always » (il '
                    'serait alors muet pour le propriétaire des tables, donc pour toute '
                    'migration et toute reprise). « RGPD » et « rgpd » deviendraient deux '
                    'étiquettes, et le filtre par étiquette perdrait des lignes sans le dire.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_classification_documents() is
    'Vérifie que la classification documentaire tient : les deux colonnes existent et sont '
    'obligatoires, la contrainte de niveaux porte LES QUATRE valeurs (son CONTENU, pas son '
    'nom — constat Q-283), et la normalisation des étiquettes est un déclencheur ARMÉ sur '
    'l''insertion (son ÉVÉNEMENT, pas son existence — constat Q-281). Un schéma sain ne '
    'renvoie AUCUNE ligne.';

grant execute on function f_verifier_classification_documents() to grc_app;

-- =====================================================================================
-- §4 — LES LISTES ÉCRITES À LA MAIN QUI DOIVENT BOUGER
-- =====================================================================================
--
-- ⚠️ Réémission de `f_verifier_unicite_cloisonnee()` : une migration appliquée ne se
-- réécrit jamais, elle se corrige dans la suivante (§23). La fonction est reprise TELLE
-- QU'ELLE EST APPLIQUÉE, avec une seule différence — `uq_traitements_id_portee` entre
-- dans les unicités délibérément globales, avec son motif. C'est le cas (a) du
-- `CLAUDE.md` §3 : l'incomplétude de cette liste échoue bruyamment, et un humain doit
-- dire si l'unicité qui apparaît est voulue.
do $$
declare v_source text;
begin
    select pg_get_functiondef(p.oid) into v_source
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'f_verifier_unicite_cloisonnee';

    if v_source is null then
        raise exception 'f_verifier_unicite_cloisonnee() est introuvable : la 004 n''a pas '
                        'été appliquée, et cette migration n''a rien à corriger.';
    end if;
    if position('uq_traitements_id_portee' in v_source) > 0 then
        raise notice 'uq_traitements_id_portee est déjà dérogée : rejeu, rien à faire.';
        return;
    end if;
    if position('''uq_documents_id_portee''' in v_source) = 0 then
        raise exception 'La dérogation uq_documents_id_portee est introuvable dans la '
                        'fonction appliquée : son texte a changé, et le remplacement '
                        'à l''aveugle est refusé plutôt qu''appliqué de travers.';
    end if;

    -- On insère la nouvelle dérogation À CÔTÉ de celle qui lui sert de modèle, sans
    -- toucher au reste d'une seule lettre.
    v_source := replace(
        v_source,
        '''uq_documents_id_portee'',',
        '''uq_documents_id_portee'','
        || E'\n        -- (id, portee_groupe) sur traitements : même dispositif et même motif que'
        || E'\n        -- sur documents (migration 027). id est DÉJÀ la clé primaire ; cette'
        || E'\n        -- unicité n''interdit donc rien de plus, elle rend seulement le couple'
        || E'\n        -- référençable par documents.traitement_id et par traitement_mesures.'
        || E'\n        ''uq_traitements_id_portee'',');

    execute v_source;
    raise notice 'f_verifier_unicite_cloisonnee() réémise : uq_traitements_id_portee dérogée.';
end;
$$;

-- ── Les colonnes textuelles neuves, décidées au registre de la 026 ───────────────────
--
-- Aucune des deux n'est réclamée par f_verifier_colonnes_personnelles() — ni leur nom ni
-- leur table n'en font des candidates. On répond quand même : le registre est celui qu'on
-- présente au DPO d'un client, et « la question ne s'est pas posée » n'y est pas une
-- réponse. ⚠️ `do update` et non `do nothing` : au rejeu, une justification corrigée
-- dans le fichier doit atteindre la base (leçon de la 026).
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
('documents', 'confidentialite', 'non_personnelle', null, null, null, null,
 'Niveau de diffusion d''un document : « public », « interne », « confidentiel », « restreint ». Une classification, jamais une personne.'),
('document_etiquettes', 'etiquette', 'non_personnelle', null, null, null, null,
 'Étiquette de classement saisie par l''utilisateur (48 signes au plus). Décidée NON PERSONNELLE parce que c''est un libellé de classement, pas un champ de personne — et parce que la liste des étiquettes est affichée à tous ceux qui voient le document. ⚠️ Si l''usage démentait ce choix — des noms de personnes employés comme étiquettes —, le régime à retenir serait « signaler », comme crise.notes : une étiquette est trop courte pour être anonymisée sans perdre son sens.')
on conflict (table_nom, colonne) do update
set nature        = excluded.nature,
    finalite      = excluded.finalite,
    base_legale   = excluded.base_legale,
    duree_jours   = excluded.duree_jours,
    a_expiration  = excluded.a_expiration,
    justification = excluded.justification;

-- =====================================================================================
-- §4 bis — LE VERROU D'APPROBATION ADMET LA MENTION QUE LA PURGE ÉCRIT VRAIMENT
-- =====================================================================================
--
-- ⚠️ **DÉFAUT TROUVÉ PAR LE BANC, dans le travail de la veille, et il valait la peine.**
--
-- Le §3 de la migration `026` a ouvert le verrou d'irréversibilité à l'anonymisation :
-- la DÉCISION reste indélébile, le NOM ne l'est plus. C'était juste, et ça ne marchait
-- pas — parce que les deux moitiés ne parlaient pas de la même chose :
--
--   · le verrou n'admettait la ligne que si `acteur_libelle` devenait **vide** et
--     `acteur_id` **nul** ;
--   · la purge, elle, écrit la **mention neutre** — « personne retirée » — et ne touche
--     pas à `acteur_id`.
--
-- Mesuré : `POST /api/cycle/purge-rgpd` sur une personne dont le nom figure dans une
-- décision **rendue** répond **409 GRC02**, *« étape d'approbation déjà tranchée »*. La
-- purge entière échoue. Chacune des deux moitiés était correcte seule ; aucun essai ne
-- faisait passer l'une dans l'autre — **c'est la classe du constat Q-194**, pour la
-- deuxième fois sur ce lot.
--
-- ── POURQUOI LA MENTION, ET PAS LE VIDE ───────────────────────────────────────────────
--
-- C'est le PRODUIT qui a raison, pas le verrou. Dans un rapport d'audit, un acteur vide
-- se lit « personne n'a validé » ; « personne retirée » se lit *« le nom a été retiré »*.
-- La seconde est la vérité, la première est un faux. Le §35.3 fixe donc cette mention mot
-- pour mot, et c'est elle qui doit passer.
--
-- ── ET POURQUOI LA BASE LA CONNAÎT DÉSORMAIS ─────────────────────────────────────────
--
-- Le verrou ne peut pas admettre n'importe quelle valeur : **substituer un nom à un autre
-- serait falsifier l'attribution d'une décision**, c'est-à-dire exactement ce que
-- l'irréversibilité existe pour empêcher. Il lui faut donc connaître la mention, et une
-- valeur écrite à deux endroits diverge en silence. Elle est posée ici, en base, et le
-- banc compare les deux (`test/cycle/purge.test.mjs`).
create or replace function f_mention_neutre() returns text
    language sql immutable
    set search_path = pg_catalog, public, pg_temp as
$$ select 'personne retirée'::text $$;

comment on function f_mention_neutre() is
    'La mention qui remplace un nom retiré par la purge RGPD (`CONVENTIONS.md` §35.3), '
    'déclarée EN BASE parce que le verrou d''approbation doit la reconnaître : admettre '
    'n''importe quelle valeur reviendrait à laisser substituer un nom à un autre, donc à '
    'falsifier l''attribution d''une décision. Le miroir TypeScript est `MENTION_NEUTRE` '
    '(`src/cycle/index.ts`), et un essai exige que les deux disent la même chose.';

grant execute on function f_mention_neutre() to grc_app;

-- Réémission du verrou — le §23 : une migration appliquée ne se réécrit pas, elle se
-- corrige dans la suivante. Le corps est celui de la `026`, à DEUX conditions près,
-- toutes deux sur la seule identité de l'acteur.
create or replace function f_approbations_verrou_decision() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_statut        text := old.statut;
    v_anonymisation boolean;
begin
    if v_statut in ('approuve', 'refuse') then
        if tg_op = 'UPDATE' then
            -- L'écriture ne touche-t-elle QUE l'identité de l'acteur ? Les colonnes qui
            -- portent la décision sont comparées une à une : rien d'autre ne peut bouger.
            v_anonymisation :=
                    new.statut          is not distinct from old.statut
                and new.etape           is not distinct from old.etape
                and new.ordre           is not distinct from old.ordre
                and new.objet_type      is not distinct from old.objet_type
                and new.objet_id        is not distinct from old.objet_id
                and new.date_decision   is not distinct from old.date_decision
                and new.commentaire     is not distinct from old.commentaire
                and new.filiale_id      is not distinct from old.filiale_id
                and new.version_objet   is not distinct from old.version_objet
                and new.empreinte_objet is not distinct from old.empreinte_objet
                -- …et elle doit RETIRER l'acteur, jamais le REMPLACER. Le compte peut être
                -- délié (nul) ou rester tel quel — la purge anonymise la fiche
                -- `utilisateurs` par ailleurs —, mais il ne peut pas devenir QUELQU'UN
                -- D'AUTRE : ce serait attribuer la décision à un tiers.
                and (new.acteur_id is null or new.acteur_id is not distinct from old.acteur_id)
                -- Le libellé part, ou devient la mention neutre du §35.3. Ces deux valeurs
                -- et elles seules : toute autre serait une substitution de nom.
                and coalesce(new.acteur_libelle, '') in ('', f_mention_neutre());
            if v_anonymisation then
                return new;
            end if;
        end if;

        raise exception
            'Étape d''approbation déjà tranchée (%) : la décision est irréversible.', v_statut
            using errcode = 'GRC02',
                  hint    = 'Créez une nouvelle version de l''objet : le circuit repart du début. '
                            'Voir backend/db/CONVENTIONS.md §15. ⚠️ Une ANONYMISATION est admise '
                            '— elle retire l''acteur sans toucher à la décision, et c''est ce qui '
                            'permet au produit de répondre à une demande d''effacement RGPD sans '
                            'détruire la preuve que le circuit a eu lieu (constat Q-284).';
    end if;

    -- ⚠️ **CES TROIS LIGNES ONT ÉTÉ PERDUES UNE FOIS, ET LE BANC L'A DIT.** Le déclencheur
    -- est « before update OR DELETE » : dans une suppression, `new` est NUL, et un
    -- « return new » ANNULE la suppression au lieu de la laisser passer. Une étape
    -- « annule » ou « en_attente » — qui n'a rien tranché — devenait indestructible, en
    -- silence. C'est la faute exacte que le 10/09 avait déjà coûtée sur
    -- `f_pieces_suivent_leur_porteur()` : *on ne remplace pas une fonction dont on n'a lu
    -- qu'une partie.* Ici c'est le corps de la `026` qui a été réécrit de mémoire ; le
    -- corps appliqué se lit avec `pg_get_functiondef()`, et c'est de là qu'il vient
    -- désormais.
    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

comment on function f_approbations_verrou_decision() is
    'Une décision d''approbation (« approuve » / « refuse ») ne se modifie ni ne s''efface — '
    'y compris en SQL, y compris pour l''administrateur. ⚠️ UNE SEULE écriture est admise : '
    'celle qui RETIRE l''identité de l''acteur sans toucher à la décision (constat Q-284, '
    'RGPD art. 17). Le libellé ne peut devenir que le vide ou f_mention_neutre(), et le '
    'compte ne peut qu''être délié : substituer un nom à un autre reviendrait à attribuer '
    'la décision à un tiers, ce que l''irréversibilité existe pour empêcher.';

-- =====================================================================================
-- §5 — VÉRIFICATION, PUIS ENREGISTREMENT
-- =====================================================================================

-- La traçabilité d'insertion de la table neuve, et l'armement de tout ce que cette
-- migration a posé : découverts, jamais énumérés.
do $$
declare v_poses integer; v_armes integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    v_armes := f_armer_declencheurs();
    raise notice 'Traçabilité d''insertion : % posé(s) ; % déclencheur(s) armé(s).',
                 v_poses, v_armes;
end;
$$;

do $$
declare v_mouvements text;
begin
    select string_agg(format('%s : %s', garde_fou, mouvement), ', ')
      into v_mouvements from f_consigner_controles_schema();
    if v_mouvements is not null then
        raise notice 'Registre des garde-fous : %', v_mouvements;
    end if;
end;
$$;

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 027 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, classification documentaire comprise.';
end;
$$;

insert into migrations_schema (version, nom)
values ('027', 'les documents se classent (confidentialité, données personnelles, '
               'étiquettes) et se rattachent au registre de l''article 30 — traitements '
               'ouverts à la portée Groupe (lot RGPD, pièces 1 et 2)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_classification_documents();
--   drop function if exists f_verifier_references_portee();
--   drop table if exists document_etiquettes;
--   drop function if exists f_normaliser_etiquette();
--   alter table documents drop constraint if exists fk_documents_traitement_portee;
--   alter table documents drop constraint if exists fk_documents_traitement_coherence;
--   alter table documents drop constraint if exists ck_documents_confidentialite;
--   alter table documents drop column if exists traitement_id,
--                         drop column if exists donnees_personnelles,
--                         drop column if exists confidentialite;
--   alter table traitement_mesures drop constraint if exists fk_traitement_mesures_portee;
--   alter table traitement_mesures drop column if exists portee_groupe;
--   alter table traitements drop constraint if exists uq_traitements_id_portee;
--   alter table traitements drop column if exists portee_groupe;
--   -- ⚠️ Le « drop not null » ne se rétablit qu'après avoir vérifié qu'aucune ligne n'est
--   --    passée en portée Groupe entre-temps ; c'est pourquoi il n'est pas écrit ici.
--   delete from controles_schema where fonction in
--       ('f_verifier_references_portee', 'f_verifier_classification_documents');
--   delete from migrations_schema where version = '027';
--   commit;
-- =====================================================================================
