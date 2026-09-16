-- =====================================================================================
--  033 — L'ATTESTATION DE LECTURE : PROUVER QU'UNE POLITIQUE A ÉTÉ LUE
--
--  §0  Le périmètre de la migration
--  §1  Un document peut EXIGER une attestation
--  §2  La table « attestations_lecture »
--  §3  La barrière de portée : local → Groupe ouvert, l'inverse fermé
--  §4  Cloisonnement : RLS activée, forcée, quatre politiques
--  §5  Le garde-fou de la barrière
--  §6  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Action **19.1** du `docs/PLAN_PRODUIT.md` : *« un document en vigueur peut exiger une
--  attestation ; l'écran de démarrage la réclame ; le taux de couverture est un
--  indicateur »*. Le critère nomme sa raison d'être : **preuve d'audit ISO 27001 A.5.1**.
--
--  Le produit savait dire qu'une politique existe, qu'elle est en vigueur, et qui l'a
--  approuvée. Il ne savait pas dire **qui l'a lue** — c'est-à-dire la seule chose que
--  demande un auditeur quand il ouvre le chapitre A.5.1. Le chaînon manquait entre la
--  gouvernance et les gens.
--
--  ── CE QU'UNE ATTESTATION EST, ET CE QU'ELLE N'EST PAS ─────────────────────────────
--
--  C'est un **fait daté** : telle personne déclare avoir lu telle version de tel document,
--  à tel instant. Ce n'est ni une approbation (le circuit L8 s'en charge, et la décision y
--  est irréversible), ni une signature électronique — le produit ne prétend pas à la valeur
--  probante d'une signature qualifiée, et le dire vaut mieux que le laisser croire.
--
--  ⚠️ **La VERSION est copiée dans l'attestation, et c'est délibéré.** Une attestation qui
--  dirait seulement « Claire a lu la PSSI » vaudrait zéro le jour où la PSSI change : on
--  saurait qu'elle a lu *quelque chose*. Le numéro de version en vigueur au moment du geste
--  est donc figé dans la ligne — c'est ce qui permet de dire « la version 2.1 a été lue par
--  dix-huit personnes sur vingt » et de repartir à zéro à la 2.2 **sans effacer l'histoire**.
--
--  ── LA BARRIÈRE DE PORTÉE, ET POURQUOI ELLE N'EST PAS SYMÉTRIQUE ───────────────────
--
--  Une personne de Toulouse atteste avoir lu :
--
--    · la **PSSI du Groupe** (document de portée Groupe)      → OUI, c'est le cas normal ;
--    · une **procédure locale de Toulouse**                   → OUI ;
--    · une procédure locale de **l'Allemagne**                → NON, et c'est une fuite.
--
--  C'est **exactement** l'arbitrage du constat N-10, fermé par la migration `030` pour le
--  rattachement d'un document à un traitement : *le sens local → Groupe est ouvert, le sens
--  inverse reste fermé*. On ne le réinvente pas — on reprend le dispositif à l'identique
--  (colonne miroir posée par un déclencheur, deux clés étrangères composites, deux
--  contraintes), parce que c'est celui qui a été audité.
--
--  ⚠️ **Et l'attestation, elle, est TOUJOURS locale** : `filiale_id` est `not null`. Même
--  pour une politique de Groupe, ce sont les gens d'une filiale qui attestent. Une
--  attestation de portée Groupe ne voudrait rien dire — le Groupe ne lit pas, les personnes
--  lisent.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 033_l_attestation_de_lecture.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §1 ajoute une colonne `not null` avec défaut sur une table cloisonnée, et le §3 pose
-- des contraintes qui VALIDENT les lignes existantes. `force row level security` vaut pour
-- le propriétaire : sans réglage, la migration échouerait en `GRC04` sans nommer la cause.
-- Motif du §0 de la `012`. On déclare le groupe ENTIER — un périmètre partiel validerait
-- les seules lignes visibles, en silence.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-033', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — UN DOCUMENT PEUT EXIGER UNE ATTESTATION
-- =====================================================================================
-- Le défaut est `false`, et il ne peut pas être autre chose : rendre l'attestation
-- obligatoire par défaut transformerait, à la première migration, chaque document existant
-- en non-conformité pour tout le personnel. *Un produit qui fabrique des alertes le jour de
-- sa mise à jour apprend à ce qu'on ignore ses alertes.*

alter table documents
    add column if not exists attestation_requise boolean not null default false;

comment on column documents.attestation_requise is
    'Ce document exige-t-il une attestation de lecture (action 19.1, ISO 27001 A.5.1) ? '
    'Défaut « false » : rendre l''attestation obligatoire par défaut transformerait chaque '
    'document existant en non-conformité le jour de la migration.';

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('documents', 'attestation_requise', 'non_personnelle',
        'Booléen de configuration du document : dit si une attestation de lecture est '
        'exigée. Ne désigne aucune personne.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §1 bis — LE JOURNAL GAGNE L'ACTION « attestation »
-- =====================================================================================
-- Le critère 19.1 le demande en toutes lettres : *« Action `attestation` au journal »*.
-- Sans elle, le geste serait tracé en « creation », et l'on ne pourrait pas répondre à la
-- question que pose un auditeur : *« montrez-moi les attestations de lecture »*.
--
-- ⚠️ **Le vocabulaire est fermé DES DEUX CÔTÉS** : cette contrainte fait FACE au type
-- `ActionJournal` de `src/auth/journal.ts`. Une action présente d'un seul côté fait échouer
-- l'insertion en 23514 — et c'est le comportement voulu : dans les deux sens, l'omission
-- crie (`CONVENTIONS.md` §29.2).
--
-- On vérifie d'abord que la contrainte EXISTE : cette migration en REMPLACE une, elle n'en
-- crée pas. Sans ce garde, une contrainte disparue serait recréée en silence, et le
-- remplacement deviendrait une création (motif du §0 de la `009`).

do $$
begin
    if not exists (
        select 1 from pg_constraint k
          join pg_class c on c.oid = k.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'journal_audit'
           and k.conname = 'ck_journal_audit_action' and k.contype = 'c')
    then
        raise exception
            'ck_journal_audit_action est introuvable sur journal_audit : cette migration '
            'REMPLACE une contrainte, elle n''en crée pas une.'
            using hint = 'Voir 001_socle.sql §9, 009_perimetre_actif.sql §1, CONVENTIONS.md §23.';
    end if;
end;
$$;

-- Une SEULE instruction : PostgreSQL retire et repose dans la même opération, et VALIDE la
-- nouvelle contre les lignes existantes. Il n'existe donc aucun instant — pas même dans
-- cette transaction — où le journal accepterait une action hors vocabulaire.
--
-- Les vingt-deux valeurs existantes sont recopiées À L'IDENTIQUE et dans le même ordre,
-- pour que le différentiel de ce fichier se lise en une ligne : la vingt-troisième.

alter table journal_audit
    drop constraint ck_journal_audit_action,
    add  constraint ck_journal_audit_action check (action in (
        'connexion_reussie', 'connexion_echouee', 'deconnexion',
        'session_expiree', 'session_revoquee', 'refus_autorisation',
        'creation', 'modification', 'suppression', 'consultation_sensible',
        'export', 'import', 'administration', 'approbation',
        'analyse_antivirus', 'purge', 'archivage',
        'demarrage', 'arret', 'verification_journal',
        'changement_perimetre', 'verification_integrite',
        -- ── Lot L19, action 19.1 ────────────────────────────────────────────────────
        -- Une personne déclare avoir lu une version d'un document. L'entrée porte le
        -- document en « entite_id », et la personne et la version en « valeurs_apres » —
        -- « resume » reste une phrase fixe (§29.5).
        'attestation'));

comment on constraint ck_journal_audit_action on journal_audit is
    'Vocabulaire fermé des actions du journal d''audit (CONVENTIONS.md §29.2). Vingt valeurs '
    'depuis 001_socle.sql ; « changement_perimetre » par la 009 ; « verification_integrite » '
    'par la 020 ; « attestation » par la 033 (action 19.1, preuve ISO 27001 A.5.1). Elle fait '
    'FACE au type ActionJournal de src/auth/journal.ts : une action présente d''un seul côté '
    'fait échouer l''insertion en 23514, ce qui est le comportement voulu — dans les deux '
    'sens, l''omission crie.';

-- =====================================================================================
-- §2 — LA TABLE « attestations_lecture »
-- =====================================================================================

-- ⚠️ **UNE UNICITÉ COMPOSITE MANQUAIT SUR `personnes`**, et la migration a échoué en
-- l'écrivant : « there is no unique constraint matching given keys for referenced table
-- personnes ». C'est le `CONVENTIONS.md` §19.1 pris au mot — *toute clé étrangère qui doit
-- être cloisonnée vise un couple (id, filiale_id), et ce couple doit être unique chez le
-- parent*. `documents` la portait déjà (`uq_documents_id_filiale`) ; `personnes`, non,
-- parce qu'aucune table ne la référençait encore de cette façon.
--
-- Elle ne change RIEN au modèle : `id` est déjà la clé primaire, donc (id, filiale_id) est
-- unique par construction. Elle rend seulement la référence composite EXPRIMABLE.

alter table personnes drop constraint if exists uq_personnes_id_filiale;
alter table personnes add constraint uq_personnes_id_filiale unique (id, filiale_id);

comment on constraint uq_personnes_id_filiale on personnes is
    'Rend exprimable la clé étrangère composite (personne_id, filiale_id) — CONVENTIONS.md '
    '§19.1. N''ajoute aucune contrainte de fond : « id » est déjà la clé primaire.';

-- Et la colonne de PORTÉE, engendrée, comme `documents.portee_groupe` : c'est elle qui
-- permet d'exprimer « ce document / cette personne est de niveau Groupe » dans une clé
-- étrangère. Sans elle, une clé composite dont une colonne est nulle serait satisfaite
-- TRIVIALEMENT (MATCH SIMPLE), c'est-à-dire ne déciderait rien.
alter table personnes
    add column if not exists portee_groupe boolean
        generated always as (filiale_id is null) stored;

comment on column personnes.portee_groupe is
    'Engendrée : la personne est-elle de niveau Groupe (filiale_id nul) ? Permet la clé '
    'étrangère composite (personne_id, portee_groupe) — même dispositif que documents.';

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('personnes', 'portee_groupe', 'non_personnelle',
        'Booléen engendré : la personne est-elle de niveau Groupe ? Décrit une PORTÉE, pas '
        'une personne.')
on conflict (table_nom, colonne) do nothing;

alter table personnes drop constraint if exists uq_personnes_id_portee;
alter table personnes add constraint uq_personnes_id_portee unique (id, portee_groupe);

create table if not exists attestations_lecture (
    id                       id_metier   not null default f_generer_id('ATT'),
    -- ⚠️ TOUJOURS locale : ce sont les personnes qui lisent, pas le Groupe.
    filiale_id               id_metier   not null,
    document_id              id_metier   not null,
    personne_id              id_metier   not null,
    -- Les miroirs de portée, posés par le déclencheur du §3. Il en faut DEUX, et la
    -- symétrie n'est pas décorative : une personne aussi peut être de portée Groupe — un
    -- RSSI du Groupe, par exemple —, et sans son miroir il ne pourrait JAMAIS attester.
    document_filiale_id      id_metier,
    document_portee_groupe   boolean generated always as (document_filiale_id is null) stored,
    personne_filiale_id      id_metier,
    personne_portee_groupe   boolean generated always as (personne_filiale_id is null) stored,
    -- La version EN VIGUEUR au moment du geste, figée. Voir l'en-tête : sans elle, une
    -- attestation ne dit pas CE QUI a été lu.
    version_document         text,
    atteste_le               timestamptz not null default now(),
    commentaire              text,
    version                  integer     not null default 1,
    cree_le                  timestamptz not null default now(),
    cree_par                 text        not null default f_utilisateur_courant(),
    modifie_le               timestamptz,
    modifie_par              text,

    constraint pk_attestations_lecture primary key (id),

    -- ⚠️ L'UNICITÉ PORTE `filiale_id` — `CONVENTIONS.md` §19.1. Sans elle, une filiale
    -- occuperait le couple (document, personne) d'une autre : la seconde recevrait un
    -- refus de doublon causé par une ligne qu'elle NE VOIT PAS, et personne ne saurait
    -- pourquoi (constat Q-2).
    constraint uq_attestations_lecture_geste
        unique (document_id, personne_id, filiale_id),

    constraint fk_attestations_lecture_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- La personne, par son miroir — même dispositif que le document. Sans clé composite,
    -- une ligne INVISIBLE de la filiale voisine satisferait la contrainte (§17.1).
    constraint fk_attestations_lecture_personne_filiale
        foreign key (personne_id, personne_filiale_id) references personnes (id, filiale_id)
        on delete cascade,
    constraint fk_attestations_lecture_personne_portee
        foreign key (personne_id, personne_portee_groupe)
        references personnes (id, portee_groupe) on delete cascade,

    -- Les deux moitiés de la barrière de portée, posées au §3.
    constraint fk_attestations_lecture_document_filiale
        foreign key (document_id, document_filiale_id) references documents (id, filiale_id)
        on delete cascade,
    constraint fk_attestations_lecture_document_portee
        foreign key (document_id, document_portee_groupe)
        references documents (id, portee_groupe) on delete cascade,

    constraint ck_attestations_lecture_commentaire
        check (commentaire is null or length(commentaire) <= 2000)
);

comment on table attestations_lecture is
    'Qui a lu quelle version de quelle politique, et quand (action 19.1). Preuve d''audit '
    'ISO 27001 A.5.1. ⚠️ Ce n''est ni une approbation — le circuit L8 s''en charge, et sa '
    'décision est irréversible — ni une signature électronique : le produit ne prétend pas '
    'à la valeur probante d''une signature qualifiée.';

comment on column attestations_lecture.version_document is
    'La version EN VIGUEUR au moment du geste, FIGÉE. Sans elle, une attestation ne dirait '
    'pas CE QUI a été lu, et vaudrait zéro dès la révision suivante du document.';

-- Le registre de l'article 30 réclame une décision pour chaque colonne (constat Q-295).
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('attestations_lecture', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('attestations_lecture', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('attestations_lecture', 'document_id', 'non_personnelle', null, null, null, null,
   'Identifiant du document attesté.'),
  ('attestations_lecture', 'document_filiale_id', 'non_personnelle', null, null, null, null,
   'Miroir de la portée du document, posé par un déclencheur.'),
  -- ⚠️ `personnelle` EXIGE les quatre champs structurés — finalité, base légale, durée,
  -- régime d'expiration —, et la migration a échoué en l'oubliant : le registre refuse
  -- une déclaration incomplète. C'est ce qu'on lui demande de faire, et c'est ce qu'on
  -- présente à un DPO.
  ('attestations_lecture', 'personne_id', 'personnelle',
   'Preuve d''audit ISO 27001 A.5.1 : démontrer que les politiques de sécurité ont été '
   'portées à la connaissance du personnel.',
   'Intérêt légitime',
   1095,
   'supprimer',
   'Désigne une personne de l''annuaire — c''est l''objet même de la table : « qui a lu ». '
   '⚠️ Le régime est « supprimer », et NON « anonymiser », parce que le garde-fou du '
   'registre l''a refusé avec raison : anonymiser consiste à remplacer un NOM par une '
   'mention neutre, et cette colonne porte un IDENTIFIANT (domaine id_metier), pas un nom. '
   'La purge y chercherait un nom qui n''y est pas. ⚠️ Et il faut en assumer le coût : '
   'quand une personne exerce son droit à l''effacement, ses attestations partent avec elle '
   '(clé étrangère « on delete cascade »), donc le taux de couverture historique perd cette '
   'ligne. C''est le bon arbitrage — le droit de la personne prime sur le confort de '
   'l''indicateur —, mais il se dit plutôt qu''il ne se découvre.'),
  ('attestations_lecture', 'version_document', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos ou valeur technique : le numéro de version du document lu.'),
  -- ⚠️ « signaler » est un RÉGIME D'EXPIRATION, pas une NATURE. La première rédaction
  -- l'avait écrit en nature, et la contrainte l'a refusé : les deux vocabulaires sont
  -- clos et distincts — nature ∈ {personnelle, non_personnelle}, a_expiration ∈
  -- {anonymiser, supprimer, conserver, signaler}. C'est une saisie libre dont le SUJET
  -- n'est pas une personne mais où un nom peut figurer : elle est donc « personnelle »
  -- et son régime est « signaler » — le produit montre l'emplacement à un humain au lieu
  -- d'effacer une phrase qu'il détruirait.
  ('attestations_lecture', 'commentaire', 'personnelle',
   'Permettre à la personne qui atteste de porter une réserve ou une précision.',
   'Intérêt légitime',
   1095,
   'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom peut figurer au milieu '
   'd''une phrase. Le remplacer détruirait la phrase — d''où le régime « signaler ».')
on conflict (table_nom, colonne) do nothing;

-- Le registre est semé pour les colonnes de traçabilité par le dispositif existant ;
-- « provenance » l'est par la migration 032, qui découvre les tables porteuses. La table
-- étant créée APRÈS, on la rattrape ici — sans quoi le déploiement rougirait.
alter table attestations_lecture
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_attestations_lecture_provenance on attestations_lecture;
create trigger trg_attestations_lecture_provenance before insert on attestations_lecture
    for each row execute function f_marquer_provenance();
alter table attestations_lecture enable always trigger trg_attestations_lecture_provenance;

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('attestations_lecture', 'provenance', 'non_personnelle',
        'Vocabulaire clos ou valeur technique : d''où vient la ligne (saisie / decouverte / '
        'reprise), posée par la migration 032. Ne désigne aucune personne.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §3 — LA BARRIÈRE DE PORTÉE : LOCAL → GROUPE OUVERT, L'INVERSE FERMÉ
-- =====================================================================================
-- Reprise à l'identique du dispositif de la migration `030` (constat N-10). On ne le
-- réinvente pas : c'est celui qui a été audité, et une seconde rédaction divergerait.

create or replace function f_attestation_porte_la_portee_du_document()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_filiale_cible   id_metier;
    v_trouve          boolean;
    v_filiale_personne id_metier;
    v_personne_trouvee boolean;
begin
    select d.filiale_id, true into v_filiale_cible, v_trouve
      from documents d
     where d.id = new.document_id;

    select p.filiale_id, true into v_filiale_personne, v_personne_trouvee
      from personnes p
     where p.id = new.personne_id;

    if not coalesce(v_personne_trouvee, false) then
        raise exception 'La personne désignée n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et choisissez une personne de votre filiale ou '
                         'une personne de portée Groupe.';
    end if;

    new.personne_filiale_id := v_filiale_personne;

    if not coalesce(v_trouve, false) then
        -- ⚠️ Le refus NE DISTINGUE PAS « il n'existe pas » de « il ne vous est pas
        -- visible » : trancher renseignerait sur ce qui existe ailleurs, et c'est
        -- l'oracle d'existence que le produit ferme depuis la porte S2.
        raise exception 'Le document désigné n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et choisissez un document de votre filiale ou '
                         'un document de portée Groupe.';
    end if;

    new.document_filiale_id := v_filiale_cible;
    return new;
end;
$$;

comment on function f_attestation_porte_la_portee_du_document() is
    'Pose attestations_lecture.document_filiale_id depuis le document attesté, pour que les '
    'deux clés étrangères composites du §2 puissent décider. Reprend le dispositif de la '
    'migration 030 (constat N-10).';

drop trigger if exists trg_attestations_lecture_portee on attestations_lecture;
-- ⚠️ `before insert or update` SANS liste de colonnes : la `030` a coûté le constat A-9
-- pour avoir écrit « update OF traitement_id », ce qui laissait un état incohérent
-- atteignable en changeant l'autre moitié du couple.
create trigger trg_attestations_lecture_portee
    before insert or update on attestations_lecture
    for each row execute function f_attestation_porte_la_portee_du_document();
alter table attestations_lecture enable always trigger trg_attestations_lecture_portee;

-- La barrière elle-même. ⚠️ `attestations_lecture.filiale_id` étant `not null`, la moitié
-- « Groupe → local » du constat N-10 ne peut pas se produire ici : il n'existe pas
-- d'attestation de portée Groupe. Reste la moitié qui compte, et c'est celle-ci :
alter table attestations_lecture
    add constraint ck_attestations_lecture_portee
    check ((document_filiale_id is null or document_filiale_id = filiale_id)
       and (personne_filiale_id is null or personne_filiale_id = filiale_id));

comment on constraint ck_attestations_lecture_portee on attestations_lecture is
    'Une attestation ne peut viser qu''un document de SA filiale ou un document de portée '
    'Groupe. Viser le document local d''une filiale voisine serait une fuite entre filiales '
    '— c''est l''arbitrage du constat N-10, repris de la migration 030.';

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- =====================================================================================

alter table attestations_lecture enable row level security;
alter table attestations_lecture force row level security;

create policy pol_attestations_lecture_lecture on attestations_lecture for select using (
    filiale_id = any (f_filiales_lecture())
);
create policy pol_attestations_lecture_ajout on attestations_lecture for insert with check (
    filiale_id = f_filiale_ecriture()
);
create policy pol_attestations_lecture_maj on attestations_lecture for update
    using (filiale_id = f_filiale_ecriture())
    with check (filiale_id = f_filiale_ecriture());
create policy pol_attestations_lecture_suppression on attestations_lecture for delete using (
    filiale_id = f_filiale_ecriture()
);

comment on policy pol_attestations_lecture_lecture on attestations_lecture is
    'Une attestation est TOUJOURS locale (filiale_id not null) : elle suit donc le périmètre '
    'de lecture, sans le cas « portée Groupe » que portent les tables mixtes.';

-- Traçabilité imposée à l'insertion, comme sur toute table qui porte `cree_par` (§3).
--
-- ⚠️ **On APPELLE l'installateur, on ne recopie pas son déclencheur.**
-- `f_poser_tracabilite_insertion()` (migration `001`) découvre dans le catalogue toutes
-- les tables portant `cree_par` et leur pose ce qu'il faut. Écrire le déclencheur à la
-- main ici aurait été une seconde rédaction de la même règle — et la première rédaction
-- de cette migration l'a fait, en appelant une fonction qui n'existe pas. *Le bon geste
-- est de demander à celui dont c'est le métier.*
select f_poser_tracabilite_insertion();

-- Et la MISE À JOUR. ⚠️ Le garde a rougi sur son absence, et il avait raison : sans
-- « before update », `version` cesse d'être un compteur, et deux écritures concurrentes
-- sur la même version passent toutes les deux — c'est le risque P1 du projet, le
-- verrouillage optimiste, réduit à un champ décoratif (`CONVENTIONS.md` §18.1).
drop trigger if exists trg_attestations_lecture_maj on attestations_lecture;
create trigger trg_attestations_lecture_maj before update on attestations_lecture
    for each row execute function f_maj_tracabilite();
alter table attestations_lecture enable always trigger trg_attestations_lecture_maj;


-- ⚠️ **L'EXEMPTION D'UNICITÉ SE DÉCLARE, SINON LE DÉPLOIEMENT ROUGIT** — et il a rougi.
-- `f_verifier_unicite_cloisonnee()` (migration `004`) refuse toute unicité sur une table
-- cloisonnée qui ne porte pas `filiale_id`, sauf celles qu'une liste NOMME avec leur motif.
-- `uq_personnes_id_portee` est de celles-là, pour le motif exact de `uq_documents_id_portee` :
-- `id` est déjà la clé primaire, l'unicité n'interdit donc rien de plus, et elle n'existe que
-- pour être la cible d'une clé étrangère composite.
--
-- ⚠️ **ET LA PREMIÈRE RÉDACTION A RECOPIÉ LA FONCTION ENTIÈRE DEPUIS LA `004`.** Elle a
-- fonctionné, puis le déploiement a rougi sur `uq_traitements_id_portee` : la `027` avait
-- ajouté cette dérogation-là, et ma copie l'avait **effacée**. C'est, mot pour mot, la faute
-- que le `CONVENTIONS.md` proscrit — *on ne remplace pas une fonction dont on n'a lu qu'une
-- partie* —, commise en croyant l'éviter, parce que j'avais lu la 004 en entier sans voir
-- qu'une autre migration l'avait étendue depuis.
--
-- Le bon geste existait déjà dans le dépôt, au §4 de la `027` : on lit la fonction **telle
-- qu'elle est appliquée**, on insère la dérogation neuve À CÔTÉ de celle qui lui sert de
-- modèle, et **on refuse d'agir si le texte a changé** plutôt que d'appliquer de travers.

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
    if position('uq_personnes_id_portee' in v_source) > 0 then
        raise notice 'uq_personnes_id_portee est déjà dérogée : rejeu, rien à faire.';
        return;
    end if;
    if position('''uq_documents_id_portee''' in v_source) = 0 then
        raise exception 'La dérogation uq_documents_id_portee est introuvable dans la '
                        'fonction appliquée : son texte a changé, et le remplacement '
                        'à l''aveugle est refusé plutôt qu''appliqué de travers.';
    end if;

    v_source := replace(
        v_source,
        '''uq_documents_id_portee'',',
        '''uq_documents_id_portee'','
        || E'\n        -- (id, portee_groupe) sur personnes : même dispositif et même motif'
        || E'\n        -- que sur documents. id est DÉJÀ la clé primaire ; cette unicité'
        || E'\n        -- n''interdit donc rien de plus, elle rend seulement le couple'
        || E'\n        -- référençable par attestations_lecture — ce qui est ce qui permet à'
        || E'\n        -- une personne de PORTÉE GROUPE d''attester dans une filiale (033).'
        || E'\n        ''uq_personnes_id_portee'',');

    execute v_source;
    raise notice 'f_verifier_unicite_cloisonnee() réémise : uq_personnes_id_portee dérogée.';
end;
$$;

-- =====================================================================================
-- §5 — LE GARDE-FOU DE LA BARRIÈRE
-- =====================================================================================
-- ⚠️ **Sans lui, tout le §3 se retire sous zéro anomalie.** C'est le constat Q-313, mot
-- pour mot : les cinq pièces de la `030` se retiraient une par une, et le garde générique
-- ne les voyait pas parce qu'il reconnaissait une colonne NOMMÉE `filiale_id`. La règle qui
-- en est sortie est au `CONVENTIONS.md` §39.7 — *une barrière nommée se garde aussi
-- nommément* —, et c'est ce que fait cette fonction : elle nomme ses cinq pièces.

create or replace function f_verifier_barriere_attestation()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
    -- Les CINQ pièces, nommées. Une par ligne, avec ce que sa disparition rouvrirait.
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('genre','colonne','nom','document_filiale_id',
            'effet','le miroir de la portée disparaît, et les deux clés composites ne '
                   'peuvent plus décider : une attestation peut alors viser le document '
                   'local d''une filiale voisine'),
        jsonb_build_object('genre','colonne','nom','document_portee_groupe',
            'effet','la moitié « portée Groupe » de la barrière ne peut plus être vérifiée'),
        jsonb_build_object('genre','contrainte','nom','ck_attestations_lecture_portee',
            'effet','la barrière N-10 tombe : une filiale atteste sur le document local '
                   'd''une autre'),
        jsonb_build_object('genre','contrainte','nom','fk_attestations_lecture_document_filiale',
            'effet','le rattachement au document n''est plus cloisonné : une ligne INVISIBLE '
                   'de la filiale voisine satisfait la clé (CONVENTIONS §17.1)'),
        jsonb_build_object('genre','colonne','nom','personne_filiale_id',
            'effet','le miroir de la portée de la PERSONNE disparaît : une attestation peut '
                   'alors désigner une personne de la filiale voisine'),
        jsonb_build_object('genre','contrainte','nom','fk_attestations_lecture_personne_filiale',
            'effet','le rattachement à la personne n''est plus cloisonné : une ligne '
                   'INVISIBLE de la filiale voisine satisfait la clé'),
        jsonb_build_object('genre','contrainte','nom','uq_attestations_lecture_geste',
            'effet','le même geste peut être inscrit deux fois, et le TAUX de couverture — '
                   'qui est l''indicateur de l''action 19.1 — dépasse 100 %%')
    );
    v_piece jsonb;
    v_ok    boolean;
begin
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if v_piece ->> 'genre' = 'colonne' then
            v_ok := exists (
                select 1 from pg_attribute a
                 where a.attrelid = to_regclass('public.attestations_lecture')
                   and a.attname = v_piece ->> 'nom'
                   and a.attnum > 0 and not a.attisdropped);
        else
            v_ok := exists (
                select 1 from pg_constraint c
                 where c.conrelid = to_regclass('public.attestations_lecture')
                   and c.conname = v_piece ->> 'nom'
                   -- ⚠️ `convalidated` : une contrainte reposée « not valid » garde son
                   -- prédicat et n'a JAMAIS vérifié les lignes déjà en base. C'est le
                   -- constat Q-319 ; l'existence ne suffit pas.
                   and c.convalidated);
        end if;

        if not v_ok then
            objet    := 'attestations_lecture.' || (v_piece ->> 'nom');
            anomalie := 'barriere_attestation_incomplete';
            detail   := format(
                'Cette pièce de la barrière de portée (migration 033 §3) a disparu ou n''est '
                'pas validée. Ce que sa disparition rouvre : %s. ⚠️ Les cinq pièces sont '
                'nommées ici UNE PAR UNE — un garde de classe ne voit pas la disparition '
                'd''une paire (CONVENTIONS.md §39.7, constat Q-313).',
                v_piece ->> 'effet');
            return next;
        end if;
    end loop;

    -- Le déclencheur qui POSE le miroir : sans lui, la colonne reste nulle et les deux
    -- clés composites sont satisfaites trivialement (MATCH SIMPLE). ⚠️ On mesure `tgtype`
    -- et `tgenabled`, jamais le seul nom — leçon du constat Q-281.
    --   tgtype 1 = FOR EACH ROW · 2 = BEFORE · 4 = INSERT · 16 = UPDATE
    for r in
        select t.tgtype, t.tgenabled
          from pg_trigger t
         where t.tgrelid = to_regclass('public.attestations_lecture')
           and not t.tgisinternal
           and t.tgfoid = 'f_attestation_porte_la_portee_du_document'::regproc
    loop
        if (r.tgtype & 23) <> 23 or r.tgenabled <> 'A' then
            objet    := 'attestations_lecture.trg_attestations_lecture_portee';
            anomalie := 'barriere_attestation_declencheur_devoye';
            detail   := 'Le déclencheur qui pose « document_filiale_id » ne se déclenche plus '
                        '« before insert OR UPDATE for each row », ou n''est pas armé '
                        '« always » (tgtype=' || r.tgtype::text || ', tgenabled='
                        || r.tgenabled::text || '). ⚠️ Le miroir reste alors NUL, et une clé '
                        'étrangère composite dont une colonne est nulle est satisfaite '
                        'TRIVIALEMENT : la barrière ne décide plus rien.';
            return next;
        end if;
    end loop;

    if not exists (
        select 1 from pg_trigger t
         where t.tgrelid = to_regclass('public.attestations_lecture')
           and not t.tgisinternal
           and t.tgfoid = 'f_attestation_porte_la_portee_du_document'::regproc)
    then
        objet    := 'attestations_lecture.trg_attestations_lecture_portee';
        anomalie := 'barriere_attestation_sans_declencheur';
        detail   := 'Aucun déclencheur n''appelle f_attestation_porte_la_portee_du_document() : '
                    '« document_filiale_id » n''est plus posé, donc nul, donc les deux clés '
                    'composites sont satisfaites trivialement. La barrière est morte.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_barriere_attestation() is
    'Garde-fou : les cinq pièces NOMMÉES de la barrière de portée des attestations, plus le '
    'déclencheur qui pose le miroir — mesuré par tgtype et tgenabled. Constats Q-281, Q-313, '
    'Q-319. Découvert par f_decouvrir_controles_schema(), appelé par f_verifier_schema().';

-- =====================================================================================
-- §6 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('033', 'l''attestation de lecture : qui a lu quelle version de quelle politique — '
               'preuve d''audit ISO 27001 A.5.1, avec la barrière de portée du constat N-10')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_barriere_attestation();
--   delete from controles_schema where fonction = 'f_verifier_barriere_attestation';
--   drop table if exists attestations_lecture;
--   drop function if exists f_attestation_porte_la_portee_du_document();
--   delete from colonnes_personnelles where table_nom = 'attestations_lecture';
--   alter table documents drop column if exists attestation_requise;
--   delete from colonnes_personnelles where table_nom = 'documents' and colonne = 'attestation_requise';
--   delete from migrations_schema where version = '033';
--   commit;
--   -- ⚠️ Annuler DÉTRUIT les attestations recueillies. Ce sont des preuves d'audit :
--   --    exportez-les avant, ou l'on ne saura plus qui avait lu quoi.
-- =====================================================================================
