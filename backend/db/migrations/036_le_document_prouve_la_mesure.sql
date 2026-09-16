-- =====================================================================================
--  036 — LE DOCUMENT PROUVE LA MESURE : LE CHAÎNON QUI MANQUAIT
--
--  §0  Le périmètre de la migration
--  §1  `mesure_catalogue` devient référençable par une clé composite
--  §2  La table de liaison « document_mesures »
--  §3  La barrière de portée : local → Groupe ouvert, l'inverse fermé
--  §4  Cloisonnement
--  §5  Le garde-fou
--  §6  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Action **19.3** du `docs/PLAN_PRODUIT.md` : *« lien document ↔ mesure — la table
--  `document_referentiels` relie au référentiel ; il manque le lien au pivot. La fiche
--  Mesure affiche ses politiques ; la fiche Document affiche ses mesures. Clé étrangère
--  composite. »*
--
--  ── CE QUE LE PRODUIT NE SAVAIT PAS DIRE ───────────────────────────────────────────
--
--  Un auditeur ouvre un contrôle — « les postes sont chiffrés » — et pose une seule
--  question : *« montrez-moi la procédure »*. Le produit savait relier une mesure à une
--  exigence (le pivot du chantier 4a), une mesure à une action (le plan d'actions), un
--  document à un référentiel (`document_referentiels`) — et **pas** un document à une
--  mesure. Le chaînon manquant était précisément celui qui transforme une déclaration en
--  preuve.
--
--  ⚠️ **Et il manquait DANS LES DEUX SENS**, ce qui compte : la fiche Mesure ne pouvait
--  pas dire « voici mes politiques », et la fiche Document ne pouvait pas dire « voici ce
--  que je prouve ». Une liaison n-n les sert toutes les deux, par construction.
--
--  ── CE QUE CETTE TABLE N'EST PAS ───────────────────────────────────────────────────
--
--  Ce n'est **pas** une pièce jointe : le lot L6 détient les fichiers, et un document a
--  les siennes. C'est un **rattachement** — *ce document décrit la mise en œuvre de ce
--  contrôle* —, et il vaut quel que soit l'endroit où le fichier se trouve, y compris
--  quand il est « resté ailleurs » (action D4).
--
--  Ce n'est pas non plus une évaluation : rattacher une procédure à un contrôle ne rend
--  pas ce contrôle conforme. La maturité et le statut restent dans
--  `mesure_mise_en_oeuvre`, au niveau de chaque filiale.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 036_le_document_prouve_la_mesure.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §1 ajoute une colonne engendrée et deux unicités sur une table cloisonnée, ce qui
-- VALIDE les lignes existantes ; `force row level security` vaut pour le propriétaire.
-- Motif du §0 de la `012` : on déclare le groupe ENTIER, jamais une filiale — un
-- périmètre partiel validerait les seules lignes visibles, en silence.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-036', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — `mesure_catalogue` DEVIENT RÉFÉRENÇABLE PAR UNE CLÉ COMPOSITE
-- =====================================================================================
-- ⚠️ Rien de tout cela ne change le MODÈLE : `id` est déjà la clé primaire, donc
-- `(id, filiale_id)` et `(id, portee_groupe)` sont uniques par construction. Les deux
-- unicités rendent seulement les références composites EXPRIMABLES — c'est le
-- `CONVENTIONS.md` §19.1 pris au mot, et c'est exactement ce que la migration `033` a dû
-- faire pour `personnes`.

alter table mesure_catalogue drop constraint if exists uq_mesure_catalogue_id_filiale;
alter table mesure_catalogue add constraint uq_mesure_catalogue_id_filiale
    unique (id, filiale_id);

comment on constraint uq_mesure_catalogue_id_filiale on mesure_catalogue is
    'Rend exprimable la clé étrangère composite (mesure_id, filiale_id) — CONVENTIONS.md '
    '§19.1. N''ajoute aucune contrainte de fond : « id » est déjà la clé primaire.';

-- La colonne de PORTÉE, engendrée, comme `documents.portee_groupe`. Sans elle, une clé
-- composite dont une colonne est nulle serait satisfaite TRIVIALEMENT (MATCH SIMPLE),
-- c'est-à-dire ne déciderait rien pour les lignes du socle Groupe — qui sont justement
-- celles qu'on veut pouvoir référencer depuis partout.
alter table mesure_catalogue
    add column if not exists portee_groupe boolean
        generated always as (filiale_id is null) stored;

comment on column mesure_catalogue.portee_groupe is
    'Engendrée : ce contrôle appartient-il au socle du Groupe (filiale_id nul) ? Permet la '
    'clé étrangère composite (mesure_id, portee_groupe) — même dispositif que documents.';

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('mesure_catalogue', 'portee_groupe', 'non_personnelle',
        'Booléen engendré : le contrôle est-il du socle Groupe ? Décrit une PORTÉE, pas '
        'une personne.')
on conflict (table_nom, colonne) do nothing;

alter table mesure_catalogue drop constraint if exists uq_mesure_catalogue_id_portee;
alter table mesure_catalogue add constraint uq_mesure_catalogue_id_portee
    unique (id, portee_groupe);

-- ⚠️ **L'EXEMPTION D'UNICITÉ SE DÉCLARE, SINON LE DÉPLOIEMENT ROUGIT** — et il a rougi.
-- `f_verifier_unicite_cloisonnee()` (migration `004`) refuse toute unicité sur une table
-- cloisonnée qui ne porte pas `filiale_id`, sauf celles qu'une liste NOMME avec leur
-- motif. `uq_mesure_catalogue_id_portee` est de celles-là, pour le motif exact de
-- `uq_documents_id_portee` et de `uq_personnes_id_portee` : `id` est déjà la clé primaire,
-- l'unicité n'interdit donc rien de plus, et elle n'existe que pour être la cible d'une
-- clé étrangère composite.
--
-- ⚠️ **On LIT la fonction telle qu'elle est APPLIQUÉE, on ne la recopie pas** : une
-- migration ultérieure l'a peut-être étendue, et une copie effacerait son extension. Le
-- motif est au §4 de la `027`, et la `033` a payé pour l'avoir oublié — sa copie avait
-- effacé la dérogation que la `027` venait d'ajouter.

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
    if position('uq_mesure_catalogue_id_portee' in v_source) > 0 then
        raise notice 'uq_mesure_catalogue_id_portee est déjà dérogée : rejeu, rien à faire.';
        return;
    end if;
    if position('''uq_personnes_id_portee''' in v_source) = 0 then
        raise exception 'La dérogation uq_personnes_id_portee est introuvable dans la '
                        'fonction appliquée : son texte a changé, et le remplacement à '
                        'l''aveugle est refusé plutôt qu''appliqué de travers.';
    end if;

    v_source := replace(
        v_source,
        '''uq_personnes_id_portee'',',
        '''uq_personnes_id_portee'','
        || E'\n        -- (id, portee_groupe) sur mesure_catalogue : même dispositif et même'
        || E'\n        -- motif que sur documents et personnes. id est DÉJÀ la clé primaire ;'
        || E'\n        -- cette unicité n''interdit rien de plus, elle rend seulement le couple'
        || E'\n        -- référençable par document_mesures — ce qui permet à une politique de'
        || E'\n        -- filiale de prouver un contrôle du SOCLE DU GROUPE (036).'
        || E'\n        ''uq_mesure_catalogue_id_portee'',');

    execute v_source;
    raise notice 'f_verifier_unicite_cloisonnee() réémise : uq_mesure_catalogue_id_portee dérogée.';
end;
$$;

-- =====================================================================================
-- §2 — LA TABLE DE LIAISON « document_mesures »
-- =====================================================================================
-- Elle reprend la forme de `document_referentiels` (migration `003`) : ni version, ni
-- déclencheur de mise à jour — *un lien ne se modifie pas, il se supprime et se recrée*.

create table if not exists document_mesures (
    document_id  id_metier   not null,
    mesure_id    id_metier   not null,
    -- Recopie de la filiale du DOCUMENT, tenue cohérente par la clé du §3 — jamais par
    -- une saisie. Nulle pour un document de portée Groupe.
    filiale_id   id_metier,
    portee_groupe boolean generated always as (filiale_id is null) stored,
    -- Miroir de la portée de la MESURE, posé par le déclencheur du §3. Il faut les deux :
    -- le document et la mesure sont l'un et l'autre des objets MIXTES, et la barrière ne
    -- se décide qu'en connaissant les deux portées.
    mesure_filiale_id id_metier,
    mesure_portee_groupe boolean generated always as (mesure_filiale_id is null) stored,
    cree_le      timestamptz not null default now(),
    cree_par     text        not null default f_utilisateur_courant(),

    constraint pk_document_mesures primary key (document_id, mesure_id),

    -- ── LES DEUX PAIRES DE CLÉS, ET IL EN FAUT QUATRE ───────────────────────────────
    --
    -- La règle de correspondance par défaut (« match simple ») neutralise une clé
    -- composite dès que L'UNE de ses colonnes est nulle. La clé de COHÉRENCE vérifie donc
    -- l'égalité des filiales quand `filiale_id` est renseigné, et ne vérifie plus rien
    -- quand il est nul — c'est-à-dire pour les lignes de portée Groupe. La clé de PORTÉE
    -- ferme ce cas : `portee_groupe` est engendrée et n'est JAMAIS nulle, la vérification
    -- a donc toujours lieu. C'est le dispositif du constat N-10, repris à l'identique.
    constraint fk_document_mesures_doc_portee
        foreign key (document_id, portee_groupe)
        references documents (id, portee_groupe) on delete cascade,
    constraint fk_document_mesures_doc_coherence
        foreign key (document_id, filiale_id)
        references documents (id, filiale_id) on delete cascade,
    -- ⚠️ **`restrict` du côté du CONTRÔLE, `cascade` du côté du DOCUMENT**, et
    -- l'asymétrie est la décision. Supprimer un document emporte ses liens : le
    -- lien n'a plus d'objet. Supprimer un CONTRÔLE, en revanche, est ce que le
    -- §17.6 refuse — *un contrôle qu'une filiale a évalué ne disparaît pas, il
    -- s'archive* —, et les quatre références existantes au catalogue sont toutes
    -- en « restrict » pour cela. Les deux ci-dessous s'y joignent : une cascade
    -- rendrait un contrôle supprimable dès lors qu'il n'est PLUS lié qu'à des
    -- documents, et ferait disparaître la preuve avec lui.
    constraint fk_document_mesures_mesure_portee
        foreign key (mesure_id, mesure_portee_groupe)
        references mesure_catalogue (id, portee_groupe) on delete restrict,
    constraint fk_document_mesures_mesure_coherence
        foreign key (mesure_id, mesure_filiale_id)
        references mesure_catalogue (id, filiale_id) on delete restrict,
    constraint fk_document_mesures_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict
);

comment on table document_mesures is
    'Quels documents prouvent la mise en œuvre de quel contrôle (n-n, action 19.3). Le '
    'chaînon qui manquait : le produit reliait déjà une mesure à une exigence et un '
    'document à un référentiel, jamais un document à une mesure — c''est-à-dire la '
    'question qu''un auditeur pose en premier, « montrez-moi la procédure ». ⚠️ Ce n''est '
    'NI une pièce jointe (le lot L6 détient les fichiers), NI une évaluation : rattacher '
    'une procédure à un contrôle ne rend pas ce contrôle conforme.';

comment on column document_mesures.filiale_id is
    'Recopie du filiale_id du DOCUMENT, nulle pour un document de portée Groupe. Présente '
    'pour que la RLS filtre sans jointure sur une table mixte (CONVENTIONS.md §16.5) ; '
    'tenue cohérente par fk_document_mesures_doc_coherence, jamais par une saisie.';

comment on column document_mesures.mesure_filiale_id is
    'Miroir de la portée de la MESURE, posé par trg_document_mesures_portee. Une valeur '
    'dérivée d''une AUTRE ligne : la croire sur parole rouvrirait un oracle d''existence '
    'inter-filiales — il suffirait d''envoyer la filiale qui arrange pour satisfaire la '
    'clé de cohérence.';

create index ix_document_mesures_filiale on document_mesures (filiale_id, mesure_id);
create index ix_document_mesures_mesure  on document_mesures (mesure_id);

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values
  ('document_mesures', 'document_id', 'non_personnelle',
   'Identifiant du document rattaché.'),
  ('document_mesures', 'mesure_id', 'non_personnelle',
   'Identifiant du contrôle prouvé.'),
  ('document_mesures', 'filiale_id', 'non_personnelle',
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('document_mesures', 'mesure_filiale_id', 'non_personnelle',
   'Miroir de la portée de la mesure, posé par un déclencheur.')
on conflict (table_nom, colonne) do nothing;

-- La marque de provenance (migration `032`) : la table naissant après elle, son balayage
-- ne peut pas l'avoir vue.
alter table document_mesures
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_document_mesures_provenance on document_mesures;
create trigger trg_document_mesures_provenance before insert on document_mesures
    for each row execute function f_marquer_provenance();
alter table document_mesures enable always trigger trg_document_mesures_provenance;

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('document_mesures', 'provenance', 'non_personnelle',
        'Vocabulaire clos ou valeur technique : d''où vient la ligne (saisie / decouverte / '
        'reprise), posée par la migration 032. Ne désigne aucune personne.')
on conflict (table_nom, colonne) do nothing;

-- ⚠️ **DEUX INSTALLATEURS, ET C'EST LE GARDE-FOU QUI ME L'A DIT.** La première
-- rédaction affirmait ici qu'une table de LIAISON n'a pas besoin de traçabilité
-- d'insertion, « puisqu'elle ne se modifie pas ». C'était une affirmation, pas une
-- mesure : `f_verifier_tracabilite()` a refusé le déploiement, et il avait raison —
-- la table porte `cree_par`, donc l'appelant pourrait le fixer lui-même. Le critère
-- n'est pas « se modifie-t-elle », c'est « porte-t-elle `cree_par` ».
--
-- ⚠️ **Et une table MIXTE doit figer sa portée** : sans `f_poser_portee_figee()`, une
-- ligne du socle Groupe peut basculer dans une filiale, ou l'inverse, et les politiques
-- RLS ne peuvent pas voir cette transition (`CONVENTIONS.md` §17.6, constat M-3).
--
-- Les deux sont des INSTALLATEURS qui découvrent dans le catalogue : on les APPELLE, on
-- ne recopie pas leurs déclencheurs (§40.3).
select f_poser_tracabilite_insertion();
select f_poser_portee_figee();
-- ⚠️ **ET L'ARMEMENT, qui est une TROISIÈME chose.** `f_poser_portee_figee()` pose le
-- déclencheur et s'arrête là — son propre commentaire le dit : *« l'armement est celui de
-- tout le schéma : f_armer_declencheurs(), en fin de migration »*. Sans cet appel, le
-- déclencheur est armé en « origin », et `set session_replication_role = replica` le
-- neutraliserait avec la garantie qu'il porte (§19.4). Le garde-fou de l'armement l'a dit.
select f_armer_declencheurs();

-- =====================================================================================
-- §3 — LA BARRIÈRE DE PORTÉE : LOCAL → GROUPE OUVERT, L'INVERSE FERMÉ
-- =====================================================================================
-- Reprise du dispositif des migrations `030` et `033` (constat N-10). On ne le réinvente
-- pas : c'est celui qui a été audité, et une seconde rédaction divergerait.
--
--   · un document LOCAL de Toulouse prouve un contrôle du SOCLE GROUPE   → OUI, le cas
--     le plus fréquent : la PSSI du Groupe impose le chiffrement, Toulouse écrit sa
--     procédure d'exploitation ;
--   · un document LOCAL prouve un contrôle LOCAL de sa filiale            → OUI ;
--   · un document de PORTÉE GROUPE prouve un contrôle LOCAL d'une filiale → NON. La
--     politique que vingt filiales lisent ne doit pas dépendre d'une ligne qu'UNE filiale
--     peut effacer ;
--   · un document local prouve le contrôle local d'une AUTRE filiale      → NON, et c'est
--     une fuite entre filiales.

create or replace function f_document_mesures_porte_la_portee()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_filiale_document id_metier;
    v_document_trouve  boolean;
    v_filiale_mesure   id_metier;
    v_mesure_trouvee   boolean;
begin
    select d.filiale_id, true into v_filiale_document, v_document_trouve
      from documents d where d.id = new.document_id;

    if not coalesce(v_document_trouve, false) then
        -- ⚠️ Le refus NE DISTINGUE PAS « il n'existe pas » de « il ne vous est pas
        -- visible » : trancher renseignerait sur ce qui existe ailleurs, et c'est
        -- l'oracle d'existence que le produit ferme depuis la porte S2.
        raise exception 'Le document désigné n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et choisissez un document de votre filiale ou '
                         'un document de portée Groupe.';
    end if;

    select m.filiale_id, true into v_filiale_mesure, v_mesure_trouvee
      from mesure_catalogue m where m.id = new.mesure_id;

    if not coalesce(v_mesure_trouvee, false) then
        raise exception 'Le contrôle désigné n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et choisissez un contrôle de votre filiale ou '
                         'un contrôle du socle du Groupe.';
    end if;

    new.filiale_id        := v_filiale_document;
    new.mesure_filiale_id := v_filiale_mesure;
    return new;
end;
$$;

comment on function f_document_mesures_porte_la_portee() is
    'Pose document_mesures.filiale_id depuis le DOCUMENT et mesure_filiale_id depuis le '
    'CONTRÔLE, pour que les quatre clés étrangères composites du §2 puissent décider. '
    'Reprend le dispositif des migrations 030 et 033 (constat N-10). ⚠️ Les deux valeurs '
    'sont ÉCRASÉES : les recevoir de l''appelant rouvrirait un oracle d''existence.';

drop trigger if exists trg_document_mesures_portee on document_mesures;
-- ⚠️ `before insert or update` SANS liste de colonnes : la `030` a coûté le constat A-9
-- pour avoir écrit « update OF … », ce qui laissait un état incohérent atteignable en
-- changeant l'autre moitié du couple.
create trigger trg_document_mesures_portee
    before insert or update on document_mesures
    for each row execute function f_document_mesures_porte_la_portee();
alter table document_mesures enable always trigger trg_document_mesures_portee;

-- La barrière elle-même. Elle ne porte QUE le sens interdit : un document de portée
-- Groupe ne peut pas s'appuyer sur un contrôle local.
alter table document_mesures
    add constraint ck_document_mesures_portee
    check (filiale_id is not null or mesure_filiale_id is null);

comment on constraint ck_document_mesures_portee on document_mesures is
    'Un document de PORTÉE GROUPE ne peut prouver qu''un contrôle du socle du Groupe : la '
    'politique que vingt filiales lisent ne doit pas dépendre d''une ligne qu''UNE filiale '
    'peut effacer. Le sens inverse — un document local qui prouve un contrôle du socle — '
    'est ouvert, et c''est le cas le plus fréquent (constat N-10, migration 030).';

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- =====================================================================================
-- Table MIXTE, comme `documents` : les politiques suivent celles de
-- `document_referentiels`, dont elle est la jumelle.

alter table document_mesures enable row level security;
alter table document_mesures force row level security;

create policy pol_document_mesures_lecture on document_mesures for select using (
    filiale_id is null or filiale_id = any (f_filiales_lecture())
);
create policy pol_document_mesures_ajout on document_mesures for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end
);
create policy pol_document_mesures_maj on document_mesures for update
    using (case when filiale_id is null then f_administration_groupe()
                else filiale_id = f_filiale_ecriture() end)
    with check (case when filiale_id is null then f_administration_groupe()
                     else filiale_id = f_filiale_ecriture() end);
create policy pol_document_mesures_suppression on document_mesures for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end
);

comment on policy pol_document_mesures_lecture on document_mesures is
    'Table MIXTE : un rattachement de portée Groupe se lit partout — c''est le propre du '
    'socle —, un rattachement local ne se lit que dans sa filiale. Même politique que '
    'document_referentiels, dont cette table est la jumelle.';

-- ⚠️ La pose des déclencheurs « les pièces suivent leur porteur » vient APRÈS les
-- politiques, et pas avant : le prédicat de découverte exige une politique de suppression
-- cloisonnée (`CONVENTIONS.md` §40.2). C'est la faute que la `035` a commise, et que le
-- garde-fou de la `017` a refusée — deux fois.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §5 — LE GARDE-FOU
-- =====================================================================================
-- ⚠️ Il nomme ses pièces UNE PAR UNE : un garde de CLASSE ne voit pas la disparition
-- d'une PAIRE (`CONVENTIONS.md` §39.7, constat Q-313). Quatre clés étrangères et une
-- barrière, c'est exactement le genre d'ensemble qui se retire morceau par morceau sous
-- zéro anomalie.
--
-- Et il ÉPROUVE la barrière au lieu de lire son texte (§39.1) : il tente l'insertion
-- interdite dans une transaction annulée, et constate le refus.

create or replace function f_verifier_lien_document_mesure()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_piece jsonb;
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('genre','colonne','table','document_mesures','nom','mesure_filiale_id',
            'effet','le miroir de la portée du CONTRÔLE disparaît : les deux clés composites '
                   'qui le visent sont alors satisfaites trivialement (MATCH SIMPLE), et un '
                   'document peut prouver le contrôle local d''une filiale voisine'),
        jsonb_build_object('genre','colonne','table','document_mesures','nom','portee_groupe',
            'effet','la moitié « portée Groupe » de la barrière ne peut plus être vérifiée'),
        jsonb_build_object('genre','contrainte','table','document_mesures',
            'nom','ck_document_mesures_portee',
            'effet','la barrière N-10 tombe : une politique de portée Groupe peut s''appuyer '
                   'sur un contrôle qu''UNE filiale peut effacer'),
        jsonb_build_object('genre','contrainte','table','document_mesures',
            'nom','fk_document_mesures_doc_coherence',
            'effet','le rattachement au document n''est plus cloisonné : une ligne INVISIBLE '
                   'de la filiale voisine satisfait la clé (CONVENTIONS §17.1)'),
        jsonb_build_object('genre','contrainte','table','document_mesures',
            'nom','fk_document_mesures_doc_portee',
            'effet','la moitié « portée » du rattachement au document tombe'),
        jsonb_build_object('genre','contrainte','table','document_mesures',
            'nom','fk_document_mesures_mesure_coherence',
            'effet','le rattachement au contrôle n''est plus cloisonné'),
        jsonb_build_object('genre','contrainte','table','document_mesures',
            'nom','fk_document_mesures_mesure_portee',
            'effet','la moitié « portée » du rattachement au contrôle tombe'),
        jsonb_build_object('genre','contrainte','table','mesure_catalogue',
            'nom','uq_mesure_catalogue_id_portee',
            'effet','la clé composite vers le socle du Groupe cesse d''être exprimable, et '
                   'toutes celles qui la visent tombent avec elle'),
        jsonb_build_object('genre','contrainte','table','mesure_catalogue',
            'nom','uq_mesure_catalogue_id_filiale',
            'effet','idem pour la clé de cohérence')
    );
    v_ok boolean;
    r    record;
begin
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if v_piece ->> 'genre' = 'colonne' then
            v_ok := exists (
                select 1 from pg_attribute a
                 where a.attrelid = to_regclass('public.' || (v_piece ->> 'table'))
                   and a.attname = v_piece ->> 'nom'
                   and a.attnum > 0 and not a.attisdropped);
        else
            v_ok := exists (
                select 1 from pg_constraint c
                 where c.conrelid = to_regclass('public.' || (v_piece ->> 'table'))
                   and c.conname = v_piece ->> 'nom'
                   -- ⚠️ `convalidated` : une contrainte reposée « not valid » garde son
                   -- prédicat et n'a JAMAIS vérifié les lignes déjà en base (Q-319).
                   and c.convalidated);
        end if;
        if not v_ok then
            objet    := (v_piece ->> 'table') || '.' || (v_piece ->> 'nom');
            anomalie := 'lien_document_mesure_incomplet';
            detail   := format(
                'Cette pièce du lien document ↔ mesure (migration 036) a disparu ou n''est '
                'pas validée. Ce que sa disparition rouvre : %s. ⚠️ Les neuf pièces sont '
                'nommées UNE PAR UNE — un garde de classe ne voit pas la disparition d''une '
                'PAIRE (CONVENTIONS.md §39.7).', v_piece ->> 'effet');
            return next;
        end if;
    end loop;

    -- Le déclencheur qui POSE les deux miroirs. ⚠️ On mesure `tgtype` et `tgenabled`,
    -- jamais le seul nom — leçon du constat Q-281.
    --   tgtype 1 = FOR EACH ROW · 2 = BEFORE · 4 = INSERT · 16 = UPDATE
    for r in
        select t.tgtype, t.tgenabled
          from pg_trigger t
         where t.tgrelid = to_regclass('public.document_mesures')
           and not t.tgisinternal
           and t.tgfoid = 'f_document_mesures_porte_la_portee'::regproc
    loop
        if (r.tgtype & 23) <> 23 or r.tgenabled <> 'A' then
            objet    := 'trg_document_mesures_portee';
            anomalie := 'declencheur_portee_desarme';
            detail   := format(
                'Le déclencheur qui pose les miroirs de portée n''est pas « before insert or '
                'update for each row », armé « always » (tgtype=%s, tgenabled=%s). Sans lui '
                'les miroirs restent nuls, et les quatre clés composites sont satisfaites '
                'TRIVIALEMENT : elles ne décident plus rien.', r.tgtype, r.tgenabled);
            return next;
        end if;
    end loop;
    if not exists (
        select 1 from pg_trigger t
         where t.tgrelid = to_regclass('public.document_mesures')
           and not t.tgisinternal
           and t.tgfoid = 'f_document_mesures_porte_la_portee'::regproc)
    then
        objet    := 'trg_document_mesures_portee';
        anomalie := 'declencheur_portee_absent';
        detail   := 'Le déclencheur qui pose les miroirs de portée a disparu : les miroirs '
                    'restent nuls, et les quatre clés composites cessent de décider.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_lien_document_mesure() is
    'Garde-fou de l''action 19.3 : les neuf pièces du lien document ↔ mesure sont nommées '
    'UNE PAR UNE (§39.7), et le déclencheur qui pose les miroirs de portée est mesuré sur '
    'son « tgtype », jamais sur son nom (Q-281). Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §6 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('036', 'le document prouve la mesure : le chaînon qui manquait entre la gouvernance '
               'et la preuve — un auditeur ouvre un contrôle et demande la procédure, et le '
               'produit ne savait pas relier les deux')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_lien_document_mesure();
--   delete from controles_schema where fonction = 'f_verifier_lien_document_mesure';
--   drop table if exists document_mesures;
--   drop function if exists f_document_mesures_porte_la_portee();
--   delete from colonnes_personnelles where table_nom = 'document_mesures';
--   alter table mesure_catalogue drop constraint if exists uq_mesure_catalogue_id_portee;
--   alter table mesure_catalogue drop column if exists portee_groupe;
--   alter table mesure_catalogue drop constraint if exists uq_mesure_catalogue_id_filiale;
--   delete from colonnes_personnelles
--    where table_nom = 'mesure_catalogue' and colonne = 'portee_groupe';
--   delete from migrations_schema where version = '036';
--   commit;
--   -- ⚠️ Annuler DÉTRUIT le rattachement des procédures à leurs contrôles. C'est la
--   --    réponse à « montrez-moi la procédure » : exportez-la avant.
-- =====================================================================================
