-- =====================================================================================
--  012 — Un socle de risques partagé, et une approbation Groupe qui ne se répète pas
-- -------------------------------------------------------------------------------------
--  §1  risque_catalogue — le socle Groupe, plus les ajouts locaux
--  §2  risques.catalogue_id — le lien, facultatif et non destructif
--  §3  approbations : la portée Groupe (arbitrage utilisateur du 04/09/2026)
--  §4  Vérification, puis enregistrement
--
-- -------------------------------------------------------------------------------------
--  CE QUE CETTE MIGRATION APPLIQUE, ET QUI VIENT DE L'UTILISATEUR
--
--  Deux décisions prises le 04/09/2026, écrites ici parce qu'un arbitrage non consigné
--  se re-débat à la vague suivante :
--
--   (a) « Chaque filiale peut ajouter ses propres risques s'ils ne sont pas déjà
--       présents au niveau groupe. » Il existe donc un SOCLE de risques communs, et les
--       filiales complètent. Aujourd'hui `risques.filiale_id` est `not null` : il n'y a
--       aucun niveau Groupe, et « Rançongiciel » est ressaisi vingt fois, sous vingt
--       libellés, ce qui rend la consolidation muette sur la question qui intéresse une
--       direction — *combien de nos filiales sont exposées à CE risque-là ?*
--
--   (b) « Une décision groupe se valide une fois au groupe. » Aujourd'hui
--       `approbations.filiale_id` est `not null` : la PSSI du groupe reçoit un circuit
--       PAR FILIALE, soit vingt validations pour un document qui n'en demande qu'une.
--
--  ⚠️ Ce que (a) n'est PAS. Ce n'est pas « les risques deviennent de niveau Groupe » —
--  un risque spécifique à Hambourg n'a rien à faire à Paris, et l'ÉVALUATION d'un risque
--  (fréquence, gravité, maîtrise, score résiduel) est locale par nature. C'est la
--  DÉFINITION qui devient commune, et l'évaluation qui reste à la filiale.
--
-- -------------------------------------------------------------------------------------
--  POURQUOI UNE SCISSION, ET PAS UNE COLONNE NULLABLE SUR `risques`
--
--  Rendre `risques.filiale_id` nullable aurait l'air plus simple. C'est l'inverse :
--
--   · `fk_actions_risque` et `fk_incidents_risque` sont COMPOSITES —
--     `(risque_id, filiale_id) references risques(id, filiale_id)`. Une action de filiale
--     rattachée à un risque de portée Groupe (`filiale_id` nul) ne satisferait plus la
--     clé, et il faudrait rejouer sur `actions` et `incidents` le double jeu de clés du
--     patron `documents` / `document_referentiels` ;
--   · surtout, un risque « Groupe » unique porterait UN SEUL couple (F, G, M) pour vingt
--     filiales, alors que l'exposition est précisément ce qui les distingue.
--
--  Le dépôt porte déjà la bonne réponse, et elle est validée : le `PLAN_SERVEUR` §2.2
--  impose de scinder `mesures` en `mesure_catalogue` (Groupe, avec ajouts locaux) et
--  `mesure_mise_en_oeuvre` (Filiale). Les risques appellent la MÊME scission, pour la
--  même raison — *« la définition appartient au Groupe, la mise en œuvre à la filiale »*.
--  On copie donc un patron déjà passé en porte S1, plutôt que d'en inventer un troisième.
--
--  Correspondance, terme à terme :
--
--      mesure_catalogue      →  risque_catalogue   (la définition, Groupe + local)
--      mesure_mise_en_oeuvre →  risques            (l'évaluation, Filiale — INCHANGÉE)
--
--  ⚠️ Rien n'est cassé et rien n'est obligatoire : `risques.catalogue_id` est NULLABLE.
--  Une filiale qui saisit un risque hors catalogue continue exactement comme avant. Le
--  socle est une aide à la comparaison, pas une contrainte de saisie — le brief dit
--  « saisie libre conservée », et il vaut ici comme ailleurs.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION, ET POURQUOI IL EST INDISPENSABLE ICI
-- -------------------------------------------------------------------------------------
-- Les migrations précédentes n'en déclaraient aucun, et n'en avaient pas besoin : elles
-- créaient des objets sans jamais LIRE une table cloisonnée. Celle-ci le fait deux fois,
-- et la seconde n'est pas évidente :
--
--   · §3 vérifie qu'aucun circuit d'approbation de document n'existe déjà ;
--   · §2 ajoute une clé étrangère sur `risques` — et **PostgreSQL VALIDE les lignes
--     existantes**, donc il BALAIE la table. `force row level security` s'appliquant au
--     propriétaire lui-même, ce balayage passe par `pol_risques_lecture`, qui appelle
--     `f_filiales_lecture()`. Sans réglage, la migration échouait en GRC04 à cette ligne
--     précise, et le message ne nommait pas la cause — j'ai dû bissecter au `psql`.
--
-- On déclare donc le groupe ENTIER : c'est le périmètre juste pour une maintenance, et
-- un périmètre partiel serait pire que pas de périmètre — la clé se validerait sur les
-- seules lignes visibles, en silence. `filiales` est lisible sans réglage parce que
-- `pol_filiales_lecture` reconnaît le propriétaire d'emblée (`f_est_proprietaire_base()`).
--
-- `set_config(…, true)` = `set local` : les deux réglages meurent avec la transaction.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-012', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LE SOCLE : risque_catalogue
-- -------------------------------------------------------------------------------------
-- Calque de `mesure_catalogue` (001_socle.sql) : mêmes colonnes de service, mêmes quatre
-- politiques, mêmes deux unicités partielles. Là où il diffère, c'est dit.
-- =====================================================================================

create table risque_catalogue (
    id              text        not null,
    -- Nul = socle du Groupe. Renseigné = ajout propre à une filiale, celui que
    -- l'arbitrage (a) autorise expressément.
    filiale_id      text,
    reference       text,
    nom             text        not null,
    description     text,
    -- Famille EBIOS : « Rançongiciel », « Fuite de données », « Indisponibilité »…
    -- Volontairement LIBRE, et non une liste fermée : le vocabulaire des menaces bouge
    -- plus vite qu'une migration, et une valeur inconnue doit pouvoir entrer sans qu'un
    -- RSSI attende une livraison. Ce qui est fermé, c'est le STATUT.
    categorie       text,
    -- Origine du socle : ce qui vient d'un référentiel se distingue de ce qu'un RSSI a
    -- ajouté. Sert à ne pas archiver par erreur ce qu'une norme impose.
    origine         text        not null default 'interne',
    statut          text        not null default 'active',
    archive_le      timestamptz,
    version         integer     not null default 1,
    cree_le         timestamptz not null default now(),
    cree_par        text        not null default f_utilisateur_courant(),
    modifie_le      timestamptz,
    modifie_par     text,

    constraint pk_risque_catalogue          primary key (id),
    constraint fk_risque_catalogue_filiale  foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint ck_risque_catalogue_nom      check (nom <> ''),
    constraint ck_risque_catalogue_ref      check (reference is null or reference <> ''),
    constraint ck_risque_catalogue_cat      check (categorie is null or categorie <> ''),
    constraint ck_risque_catalogue_origine  check (origine in ('interne', 'referentiel', 'sectoriel')),
    constraint ck_risque_catalogue_statut   check (statut in ('active', 'archivee')),
    -- Un risque archivé porte sa date, et un risque actif n'en porte pas. L'égalité —
    -- et non deux implications — interdit les deux incohérences d'un coup.
    constraint ck_risque_catalogue_archive  check ((statut = 'archivee') = (archive_le is not null))
);

comment on table risque_catalogue is
    'Socle de risques du Groupe (filiale_id nul) et ajouts propres à une filiale '
    '(filiale_id renseigné). Porte la DÉFINITION d''un risque — son nom, sa famille — '
    'jamais son évaluation : fréquence, gravité, maîtrise et score restent dans '
    '« risques », au niveau de la filiale, parce que l''exposition est précisément ce '
    'qui distingue Hambourg de Toulouse. Calque de mesure_catalogue (PLAN_SERVEUR §2.2).';

comment on column risque_catalogue.filiale_id is
    'Nul = socle du Groupe, visible de toutes les filiales et écrit par la seule '
    'administration Groupe. Renseigné = ajout local, écrit et lu par cette filiale seule.';

comment on column risque_catalogue.categorie is
    'Famille de menace, en texte libre : le vocabulaire des menaces bouge plus vite '
    'qu''une migration, et un RSSI ne doit pas attendre une livraison pour nommer ce '
    'qu''il voit. Ce qui est fermé ici, c''est « statut », pas « categorie ».';

-- ── Unicité de la référence, en DEUX index partiels ──────────────────────────────────
-- Exactement comme `mesure_catalogue` : une référence est unique DANS SON NIVEAU. Le
-- socle ne peut pas porter deux fois « R-001 » ; une filiale non plus ; mais une filiale
-- peut porter « R-001 » sans heurter celui du Groupe, qui n'est pas le même objet.
-- ⚠️ `(filiale_id, reference)` ET NON `(reference)` seul, alors que l'index est déjà
-- borné aux lignes du socle. Le pendant de `mesure_catalogue` s'écrit `(reference)`, et il
-- lui a fallu une DÉROGATION NOMMÉE dans `f_verifier_unicite_cloisonnee()` — le garde-fou
-- du §19.1 exige que toute unicité d'une table cloisonnée porte `filiale_id` parmi ses
-- colonnes de clé, et il a refusé cette migration tant qu'elle ne le faisait pas.
--
-- Ajouter `filiale_id` ne change RIEN à ce que l'index interdit — il vaut nul sur toutes
-- les lignes couvertes — mais il fait dire à l'index CE QU'IL BORNE : « unique dans son
-- niveau ». C'est la réponse au garde-fou, et non son contournement : la dérogation
-- existe pour les unicités délibérément globales (le numéro de la chaîne d'audit, le
-- chemin d'une pièce sur le disque), pas pour celles qui sont bel et bien cloisonnées et
-- l'écrivent mal.
--
-- `uq_mesure_catalogue_reference_groupe` gagnerait à être aligné de la même façon : sa
-- dérogation deviendrait alors inutile, et la liste écrite à la main perdrait une entrée.
-- Hors périmètre de cette migration.
create unique index uq_risque_catalogue_reference_groupe
    on risque_catalogue (filiale_id, reference)
    where filiale_id is null and reference is not null;

create unique index uq_risque_catalogue_reference_locale
    on risque_catalogue (filiale_id, reference)
    where filiale_id is not null and reference is not null;

create index ix_risque_catalogue_filiale on risque_catalogue (filiale_id, nom);
create index ix_risque_catalogue_actifs  on risque_catalogue (filiale_id, nom)
    where statut = 'active';

-- ── LES TROIS DÉCLENCHEURS, et le garde-fou les a réclamés un par un ────────────────
--
-- Je ne les avais pas écrits, et `f_verifier_schema()` a refusé la migration en nommant
-- exactement ce qui manquait : « la table porte cree_par mais aucun déclencheur before
-- insert », puis « version ne s'incrémente plus — deux écritures concurrentes sur la même
-- version réussissent toutes les deux et la seconde écrase la première (risque P1) ».
-- C'est le garde-fou qui fait son travail : une table neuve sans traçabilité serait
-- passée sans bruit, et le verrouillage optimiste aurait cessé de protéger CETTE table
-- seulement.
create trigger trg_risque_catalogue_creation before insert on risque_catalogue
    for each row execute function f_init_tracabilite();

create trigger trg_risque_catalogue_maj before update on risque_catalogue
    for each row execute function f_maj_tracabilite();

-- Une entrée du socle ne DEVIENT pas locale, ni l'inverse : sa portée est figée à la
-- création. Sans cela, une filiale pourrait faire descendre au niveau local une entrée du
-- Groupe — ou l'inverse, y faire monter la sienne — et le socle cesserait d'être commun.
create trigger trg_risque_catalogue_portee_figee before update on risque_catalogue
    for each row execute function f_interdit_changement_portee();

-- ── ARMÉS EN « ALWAYS », ET LE GARDE-FOU L'A RÉCLAMÉ AUSSI ─────────────────────────
--
-- Un déclencheur armé en « origin » — le défaut — est neutralisé par
-- `set session_replication_role = replica`, qu'un rôle applicatif peut poser lui-même.
-- La garantie partirait avec lui : traçabilité, incrément de version, portée figée. Tout
-- déclencheur de ce schéma s'arme en « always » (CONVENTIONS.md §19.4), et ce n'est pas
-- une préférence de style : c'est la différence entre une garantie et une convention.
alter table risque_catalogue enable always trigger trg_risque_catalogue_creation;
alter table risque_catalogue enable always trigger trg_risque_catalogue_maj;
alter table risque_catalogue enable always trigger trg_risque_catalogue_portee_figee;

alter table risque_catalogue enable row level security;
alter table risque_catalogue force row level security;

-- ── Les quatre politiques, décalquées de mesure_catalogue ────────────────────────────
--
-- ⚠️ La dissymétrie est le point : le socle Groupe est LU par tout le monde et ÉCRIT par
-- la seule administration Groupe. Un RSSI de site voit le socle, il ne le change pas —
-- sans quoi la comparabilité entre filiales, qui est la raison d'être du socle, serait à
-- la merci du premier site qui renomme « Rançongiciel ».
create policy pol_risque_catalogue_lecture on risque_catalogue for select using (
    case when filiale_id is null then true
         else filiale_id = any (f_filiales_lecture())
    end
);

create policy pol_risque_catalogue_ajout on risque_catalogue for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture()
    end
);

create policy pol_risque_catalogue_maj on risque_catalogue for update using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture()
    end
);

create policy pol_risque_catalogue_suppression on risque_catalogue for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture()
    end
);

grant select, insert, update, delete on risque_catalogue to grc_app;
grant select on risque_catalogue to grc_lecture;

-- =====================================================================================
-- §2 — LE LIEN : risques.catalogue_id
-- -------------------------------------------------------------------------------------
-- Facultatif, et non destructif. Un risque saisi librement reste un risque valide : la
-- colonne est nullable, et aucun chemin d'écriture existant ne la renseigne.
-- =====================================================================================

alter table risques add column catalogue_id text;

alter table risques add constraint fk_risques_catalogue
    foreign key (catalogue_id) references risque_catalogue (id) on delete set null;

create index ix_risques_catalogue on risques (catalogue_id) where catalogue_id is not null;

comment on column risques.catalogue_id is
    'Entrée du socle que ce risque instancie, ou nul pour un risque saisi librement. '
    'C''est ce lien qui permet de répondre « combien de nos filiales sont exposées à CE '
    'risque-là » — la question qu''une consolidation additionnant des libellés libres ne '
    'peut pas poser. Sa suppression DÉLIE (on delete set null) : archiver une entrée du '
    'socle ne doit jamais effacer l''analyse de risque d''une filiale.';

-- ⚠️ CLÉ SIMPLE, ET C'EST UN ARBITRAGE, PAS UN OUBLI.
--
-- Le `CONVENTIONS.md` §17.1 exige que toute clé étrangère porte `filiale_id` : une clé
-- simple est satisfaite par une ligne INVISIBLE de la filiale voisine. La règle ne peut
-- pas s'appliquer telle quelle vers une table MIXTE — le socle a `filiale_id` nul, et une
-- clé composite `(catalogue_id, filiale_id)` depuis `risques` (dont le `filiale_id` n'est
-- jamais nul) rendrait le socle Groupe INATTEIGNABLE, c'est-à-dire l'inverse du but.
--
-- Ce que cela laisse ouvert, dit franchement : une filiale pourrait rattacher son risque
-- à l'ajout LOCAL d'une autre filiale, si elle en devinait l'identifiant — 52 bits d'aléa
-- cryptographique (§2). C'est un oracle d'existence faible, atteignable seulement par une
-- attaque délibérée, jamais par accident.
--
-- Deux raisons de s'en tenir là :
--   · `mesure_mise_en_oeuvre.mesure_id -> mesure_catalogue(id)` est une clé simple pour
--     exactement la même raison, et elle est passée par la porte S1. Inventer ici une
--     troisième réponse à la même question serait pire que la question ;
--   · le patron plus fort existe (`documents` / `document_referentiels` : colonne
--     engendrée `portee_groupe` et DEUX clés). L'appliquer demande une colonne de plus
--     sur `risques` que la couche applicative devrait poser — donc un endroit de plus où
--     se tromper. À reprendre pour LES DEUX tables à la fois, ou pour aucune.
--
-- Le contrôle qui reste, et il est réel : la RLS. Une filiale ne LIT pas l'ajout local
-- d'une autre, donc elle ne peut ni le choisir dans un écran ni le voir revenir.

-- =====================================================================================
-- §3 — APPROBATIONS DE PORTÉE GROUPE
-- -------------------------------------------------------------------------------------
-- « Une décision groupe se valide une fois au groupe » — arbitrage utilisateur du
-- 04/09/2026, constat Q-153.
-- =====================================================================================

-- La table est vide à cette révision : aucune approbation n'a encore été prononcée, donc
-- AUCUNE migration de données. Si elle ne l'était pas, il faudrait décider quel circuit
-- de quelle filiale devient LE circuit du groupe — et ce n'est pas une décision que du
-- SQL peut prendre. La garde ci-dessous refuse plutôt que de choisir.
do $$
declare v_nombre bigint;
begin
    -- Le périmètre du groupe entier est posé au §0 : la question est « existe-t-il un
    -- circuit de document QUELQUE PART ? », et un périmètre partiel y répondrait « non »
    -- à tort.
    select count(*) into v_nombre from approbations where objet_type = 'document';
    if v_nombre > 0 then
        raise exception
            'La table « approbations » porte % circuit(s) de document : la portée Groupe '
            'ne peut pas être ouverte sans décider lesquels deviennent le circuit unique '
            'du Groupe. Traiter la reprise avant de rejouer 012.', v_nombre;
    end if;
end;
$$;

alter table approbations alter column filiale_id drop not null;

comment on column approbations.filiale_id is
    'Nul = décision de portée Groupe, prononcée UNE FOIS pour tout le groupe — le cas '
    'd''une politique dont documents.filiale_id est nul. Renseigné = décision d''une '
    'filiale sur un objet qui lui appartient. Arbitrage utilisateur du 04/09/2026 '
    '(constat Q-153) : avant lui, la PSSI du groupe recevait un circuit par filiale, '
    'soit vingt validations pour un document qui n''en demande qu''une.';

-- ── L'unicité doit compter les NULL comme ÉGAUX ─────────────────────────────────────
--
-- `unique (filiale_id, objet_type, objet_id, etape, ordre)` traite par défaut deux NULL
-- comme DISTINCTS : deux approbations Groupe de la même étape passeraient toutes les
-- deux, et le circuit aurait deux décisions pour un tour. `nulls not distinct` (PG 15+)
-- ferme exactement ce cas.
alter table approbations drop constraint uq_approbations_etape;
alter table approbations add constraint uq_approbations_etape
    unique nulls not distinct (filiale_id, objet_type, objet_id, etape, ordre);

-- ── DEVENUE MIXTE, ELLE RÉCLAME SA PORTÉE FIGÉE ─────────────────────────────────────
--
-- Le garde-fou du §17.6 (constat M-3) l'a exigé dès que `filiale_id` est devenu nullable,
-- et il a raison : sans lui, une décision prononcée AU GROUPE pourrait basculer dans une
-- filiale — ou l'inverse —, et **les politiques RLS ne voient pas cette transition**. Sur
-- une table dont tout l'objet est de figer qui a validé quoi, ce serait le défaut le plus
-- grave possible : une approbation qui change de portée après coup.
create trigger trg_approbations_portee_figee before update on approbations
    for each row execute function f_interdit_changement_portee();

alter table approbations enable always trigger trg_approbations_portee_figee;

-- ── Les quatre politiques prennent la forme « mixte » ────────────────────────────────
--
-- ⚠️ Écrire une décision de portée Groupe exige l'administration Groupe, comme toute
-- écriture à `filiale_id` nul (§17.4). Ce n'est pas une barrière de la base — le rôle
-- applicatif peut poser le réglage —, c'est la déclaration d'accès de la route qui
-- décide, et la base refuse le chemin qui aurait oublié de la faire.
drop policy pol_approbations_lecture     on approbations;
drop policy pol_approbations_ajout       on approbations;
drop policy pol_approbations_maj         on approbations;
drop policy pol_approbations_suppression on approbations;

create policy pol_approbations_lecture on approbations for select using (
    case when filiale_id is null then true
         else filiale_id = any (f_filiales_lecture())
    end
);

create policy pol_approbations_ajout on approbations for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture()
    end
);

create policy pol_approbations_maj on approbations for update using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture()
    end
);

create policy pol_approbations_suppression on approbations for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture()
    end
);

-- =====================================================================================
-- §4 — VÉRIFICATION, PUIS ENREGISTREMENT
-- -------------------------------------------------------------------------------------
-- Le point d'appel unique, comme toute migration depuis 005 : un garde-fou qu'on
-- n'appelle pas est un commentaire.
-- =====================================================================================

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 012 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie après le socle de risques.';
end;
$$;

insert into migrations_schema (version, nom)
values ('012', 'Socle de risques partagé (risque_catalogue, Groupe + ajouts locaux) et '
               'approbations de portée Groupe — arbitrages utilisateur du 04/09/2026')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   alter table risques drop constraint fk_risques_catalogue;
--   alter table risques drop column catalogue_id;
--   drop table risque_catalogue;
--   alter table approbations drop constraint uq_approbations_etape;
--   alter table approbations add constraint uq_approbations_etape
--       unique (filiale_id, objet_type, objet_id, etape, ordre);
--   alter table approbations alter column filiale_id set not null;  -- refuse si des
--                                                                   -- circuits Groupe existent
--   -- puis rétablir les quatre politiques de 004_rls.sql §6.
--   delete from migrations_schema where version = '012';
--   commit;
-- ⚠️ La rejouer perd le socle de risques et TOUS les liens catalogue_id.
-- =====================================================================================
