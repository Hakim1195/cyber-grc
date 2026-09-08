-- =====================================================================================
--  018 — LA VERSION EN VIGUEUR D'UN DOCUMENT, ET LA FIN D'UNE SAISIE QUI MENT
-- -------------------------------------------------------------------------------------
--  §1  « en vigueur » sur une pièce jointe — une seule par porteur et par filiale
--  §2  La démotion automatique : une pièce qui cesse d'être délivrable cesse de faire foi
--  §3  D4 — « emplacement » est ASSUMÉ, et étiqueté pour ce qu'il est
--  §4  Le garde-fou : l'unicité, la contrainte et le déclencheur sont là, ou rien ne l'est
--  §5  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — actions D1 et D4 de la vague 9 (`docs/PLAN_EXECUTION.md` §3)
--
--  Le lot L6 livre le COFFRE : dépôt, huit contrôles, ClamAV, quarantaine, délivrance par
--  l'application seule. Ce qui manquait n'est pas le stockage, c'est la GESTION — et le
--  premier manque est le plus visible en audit : **rien ne dit laquelle des pièces
--  déposées sur une fiche document fait foi.**
--
--  Le symptôme, lui, était déjà là et personne ne l'avait nommé : `documents.version_document`
--  est une SAISIE LIBRE. On y tape « 2.1 » et l'on dépose le fichier de la 1.4 ; les deux
--  vivent côte à côte sans qu'aucune contrainte ne les rapproche. Dans un outil produit en
--  audit ISO 27001, c'est la pire forme de faux : il est *plausible*.
--
--  ── LE MODÈLE RETENU, ET IL TIENT EN UNE PHRASE ───────────────────────────────────────
--
--  **La version d'un document est celle que porte la pièce marquée « en vigueur ».** Les
--  autres pièces ne disparaissent pas : elles deviennent l'historique, toujours
--  téléchargeable — c'est justement ce qu'un auditeur demande (« montrez-moi la v1 »).
--
--  Deux colonnes, et pas une de plus :
--
--    · `en_vigueur`    — LAQUELLE fait foi. Au plus une par porteur et par filiale ;
--    · `version_piece` — le numéro que le déposant donne À CE FICHIER, au moment où il
--                        le dépose. C'est de là que `documents.version_document` est
--                        alimenté, au lieu d'être frappé à côté.
--
--  ── POURQUOI L'UNICITÉ PORTE `filiale_id`, ET CE QUE CELA IMPLIQUE ────────────────────
--
--  `CONVENTIONS.md` §19.1 : une unicité qui ne porte pas `filiale_id` sur une table
--  cloisonnée contourne la RLS et devient un ORACLE. Ici le danger est nommé, et c'est
--  très exactement le constat **Q-2** : `documents` est une table MIXTE — une politique de
--  portée Groupe (`filiale_id` nul) peut porter les pièces de PLUSIEURS filiales. Une
--  unicité globale ferait qu'en marquant sa propre pièce « en vigueur », la filiale A
--  recevrait un doublon **causé par une ligne de B qu'elle ne peut pas lire**, et
--  apprendrait au passage que B a publié quelque chose.
--
--  Conséquence assumée, et il faut la connaître : **sur un document de portée Groupe,
--  chaque filiale désigne la version en vigueur parmi les pièces QU'ELLE a déposées.**
--  C'est cohérent avec le reste du lot L6 — une pièce jointe appartient toujours à une
--  filiale, jamais au Groupe — et c'est ce que la RLS d'écriture impose de toute façon :
--  une session ne peut modifier que les pièces de sa filiale active.
--
--  ── CE QUE CETTE MIGRATION NE FAIT PAS (§17.5) ────────────────────────────────────────
--
--  Elle ne rend pas `version_document` non modifiable. La colonne reste écrivable par la
--  couche générique — un document sans aucune pièce jointe garde donc une version saisie à
--  la main, et c'est voulu : la moitié des politiques d'un groupe industriel vivent dans
--  une GED tierce que ce produit ne détient pas (voir le §3, « emplacement »). Ce que la
--  migration garantit, c'est qu'une fois qu'une pièce fait foi, **c'est elle qui dit le
--  numéro** : la route `POST /api/pieces/:entite/:entiteId/:pieceId/en-vigueur` réécrit
--  `version_document` depuis `version_piece`, dans la même transaction, et échoue
--  bruyamment si elle ne peut pas écrire le document.
--
--  Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 018_version_en_vigueur.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §1 — « EN VIGUEUR » SUR UNE PIÈCE JOINTE
-- =====================================================================================

alter table pieces_jointes
    add column en_vigueur    boolean not null default false,
    add column version_piece text;

comment on column pieces_jointes.en_vigueur is
    'LA pièce qui fait foi pour son porteur. Au plus une par (filiale, entite_type, '
    'entite_id) — uq_pieces_jointes_en_vigueur. Les autres ne sont pas supprimées : elles '
    'sont l''HISTORIQUE, et restent délivrables, ce qu''un auditeur demande. Une pièce non '
    'délivrable ne peut pas faire foi (ck_pieces_jointes_en_vigueur), et une pièce qui '
    'cesse de l''être est démise automatiquement (trg_pieces_jointes_en_vigueur).';
comment on column pieces_jointes.version_piece is
    'Numéro de version que le déposant donne À CE FICHIER ("1.0", "2.3-projet"). Quand la '
    'pièce est marquée en vigueur sur une fiche document, c''est cette valeur qui alimente '
    'documents.version_document — au lieu d''une saisie libre frappée à côté du fichier, '
    'qui pouvait annoncer une version que le fichier ne portait pas.';

-- ── L'unicité, PARTIELLE et PORTANT LA FILIALE ───────────────────────────────────────
--
-- Partielle : seules les lignes « en vigueur » s'excluent. Sans le « where », toutes les
-- pièces d'un même porteur entreraient en collision et l'on ne pourrait plus en déposer
-- deux — c'est-à-dire qu'on aurait interdit l'historique, qui est la raison d'être du lot.
create unique index uq_pieces_jointes_en_vigueur
    on pieces_jointes (filiale_id, entite_type, entite_id)
    where en_vigueur;

comment on index uq_pieces_jointes_en_vigueur is
    'Au plus UNE pièce en vigueur par porteur et par filiale. PARTIELLE (« where '
    'en_vigueur ») : l''historique reste libre. PORTE filiale_id (CONVENTIONS.md §19.1) — '
    'sans elle, sur un document de portée Groupe, une filiale recevrait un doublon causé '
    'par une ligne invisible d''une autre, ce qui est le constat Q-2.';

-- ── Une pièce non délivrable ne fait pas foi ─────────────────────────────────────────
--
-- Même condition que `CONDITION_DELIVRABLE` de `src/pieces/depot.ts`, et elle est ici
-- pour la même raison qu'elle y est écrite une seule fois : deux copies d'une même
-- condition finissent par ne plus dire la même chose. Celle-ci est la dernière barrière
-- avant qu'un fichier en quarantaine soit désigné comme la version officielle d'une PSSI.
alter table pieces_jointes
    add constraint ck_pieces_jointes_en_vigueur check (
        not en_vigueur or (etat_analyse = 'saine' and not quarantaine));

-- =====================================================================================
-- §2 — LA DÉMOTION AUTOMATIQUE
-- -------------------------------------------------------------------------------------
-- La ré-analyse périodique du stock (`src/pieces/exploitation.ts`) peut mettre en
-- quarantaine un fichier propre depuis six mois — c'est sa raison d'être sur trois ans de
-- rétention. Sans ce déclencheur, cette mise en quarantaine heurterait la contrainte
-- ci-dessus et **la ré-analyse échouerait** : on aurait fermé un défaut en en ouvrant un
-- pire, le dispositif antimalware bloqué par la gestion documentaire.
--
-- ⚠️ Il ne démet QUE ce qui était déjà en vigueur. Une tentative de marquer « en vigueur »
-- une pièce non délivrable n'est PAS silencieusement ramenée à faux — elle heurte la
-- contrainte et échoue bruyamment. C'est la distinction que ce chantier paie depuis dix
-- passages de porte : un refus qui réussit en silence est pire que pas de refus du tout.
-- =====================================================================================

create or replace function f_piece_en_vigueur_suit_l_analyse() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if old.en_vigueur and new.en_vigueur
       and (new.etat_analyse <> 'saine' or new.quarantaine)
    then
        new.en_vigueur := false;
    end if;
    return new;
end;
$$;

comment on function f_piece_en_vigueur_suit_l_analyse() is
    'Démet la pièce qui CESSE d''être délivrable (ré-analyse, mise en quarantaine par '
    'l''exploitation) : elle ne peut plus faire foi. Ne touche PAS une tentative de '
    'marquer en vigueur une pièce déjà non délivrable — celle-là heurte '
    'ck_pieces_jointes_en_vigueur et échoue bruyamment. Conséquence à connaître : le '
    'document garde alors le numéro de version qu''elle portait, et l''écran dit qu''aucune '
    'pièce ne fait plus foi.';

create trigger trg_pieces_jointes_en_vigueur before update on pieces_jointes
    for each row execute function f_piece_en_vigueur_suit_l_analyse();

-- « always » et non l'armement par défaut : tout déclencheur de ce schéma s'arme ainsi
-- (CONVENTIONS.md §19.4), sans quoi « set session_replication_role = replica » le
-- neutraliserait — et la garantie qu'il porte avec lui.
alter table pieces_jointes enable always trigger trg_pieces_jointes_en_vigueur;

-- =====================================================================================
-- §3 — D4 : « emplacement » EST ASSUMÉ, ET ÉTIQUETÉ POUR CE QU'IL EST
-- -------------------------------------------------------------------------------------
-- L'action D4 demandait de trancher : assumer la colonne en l'étiquetant « document resté
-- ailleurs », ou la retirer. **Elle est assumée**, et le motif est mesurable plutôt
-- qu'esthétique :
--
--   · la retirer ferait perdre la valeur à la reprise d'un export ANTÉRIEUR — le critère
--     d'acceptation de D4 exige alors un round-trip qui la préserve, c'est-à-dire une
--     colonne de recueil : on aurait retiré le champ pour le remettre sous un autre nom ;
--   · un groupe de vingt filiales a une GED, un intranet, un coffre qualité. Nier qu'un
--     document puisse vivre ailleurs ne le ferait pas rentrer ici ; cela ferait seulement
--     que le produit ne saurait plus où il est.
--
-- Ce que D4 exige vraiment, c'est que le champ **ne puisse plus être confondu avec une
-- pièce détenue par l'application**. Cela se joue en trois endroits, et le commentaire de
-- colonne est le premier — c'est lui que lit qui écrit une route ou une migration.
-- Les deux autres sont l'étiquette de l'écran et la note qui l'accompagne
-- (`js/modules/documents.js`).
-- =====================================================================================

comment on column documents.emplacement is
    'DOCUMENT RESTÉ AILLEURS — chemin réseau, GED, intranet, coffre qualité. C''est une '
    'RÉFÉRENCE, pas un fichier : l''application ne la lit pas, ne la vérifie pas, ne la '
    'délivre pas, et ne saura jamais si ce qui est au bout a changé. Ce que l''application '
    'DÉTIENT, analyse, empreinte et délivre, ce sont les pieces_jointes de la fiche, dont '
    'l''une porte « en vigueur » (migration 018). Les deux coexistent à dessein ; ce qui '
    'n''est pas admis, c''est de les confondre — d''où cette étiquette, action D4 de la '
    'vague 9.';

comment on column documents.version_document is
    'Version MÉTIER du document, telle que l''auteur la note ("1.0", "2.3-projet") — à ne '
    'pas confondre avec la colonne "version", entière, qui porte le verrouillage optimiste '
    '(CONVENTIONS.md §3). ⚠️ Depuis la migration 018, dès qu''une pièce jointe de la fiche '
    'est marquée « en vigueur », c''est ELLE qui dit ce numéro : la route en-vigueur y '
    'recopie pieces_jointes.version_piece dans la même transaction. La saisie libre ne '
    'subsiste que pour un document dont aucun fichier n''est détenu ici.';

-- =====================================================================================
-- §4 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- Un garde-fou que rien n'appelle est un commentaire (§18.4) : celui-ci se BRANCHE SEUL,
-- par la convention de découverte de `f_verifier_schema()` — nom en « f_verifier_ », aucun
-- argument, rendant (objet, anomalie, detail).
--
-- Ce qu'il attrape est le geste le plus probable : quelqu'un qui, gêné par un doublon,
-- « répare » en retirant l'index. La promesse « une seule version fait foi » disparaîtrait
-- alors sans un mot, et deux pièces marquées en vigueur donneraient deux réponses à la
-- question d'audit. Il vérifie les TROIS pièces du dispositif, parce qu'aucune ne suffit
-- seule — et que retirer la contrainte laisserait marquer en vigueur un fichier infecté.
-- =====================================================================================

create or replace function f_verifier_piece_en_vigueur()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_index_ok      boolean;
    v_porte_filiale boolean;
begin
    select exists (
        select 1 from pg_index i
          join pg_class c on c.oid = i.indexrelid
         where c.relname = 'uq_pieces_jointes_en_vigueur'
           and i.indisunique and i.indpred is not null)
      into v_index_ok;

    if not v_index_ok then
        objet    := 'pieces_jointes.en_vigueur';
        anomalie := 'unicite_absente';
        detail   := 'L''index unique PARTIEL « uq_pieces_jointes_en_vigueur » a disparu, ou '
                    'a cessé d''être unique ou partiel. Sans lui, deux pièces d''une même '
                    'fiche peuvent porter « en vigueur » en même temps : la question '
                    '« quelle version fait foi ? » reçoit alors deux réponses, dans un '
                    'outil produit en audit ISO 27001. Rejouez le §1 de la migration 018.';
        return next;
    else
        select bool_or(a.attname = 'filiale_id')
          from pg_index i
          join pg_class c on c.oid = i.indexrelid
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
         where c.relname = 'uq_pieces_jointes_en_vigueur'
          into v_porte_filiale;

        if not coalesce(v_porte_filiale, false) then
            objet    := 'uq_pieces_jointes_en_vigueur';
            anomalie := 'unicite_sans_filiale';
            detail   := 'L''unicité de la version en vigueur ne porte plus « filiale_id ». '
                        'Sur un document de PORTÉE GROUPE, qui peut recevoir les pièces de '
                        'plusieurs filiales, elle devient un ORACLE : une filiale reçoit un '
                        'doublon causé par une ligne qu''elle ne peut pas lire, et apprend '
                        'ainsi que sa voisine a publié. C''est le constat Q-2 '
                        '(CONVENTIONS.md §19.1).';
            return next;
        end if;
    end if;

    if not exists (
        select 1 from pg_constraint
         where conname = 'ck_pieces_jointes_en_vigueur'
           and conrelid = 'pieces_jointes'::regclass)
    then
        objet    := 'pieces_jointes.en_vigueur';
        anomalie := 'contrainte_delivrable_absente';
        detail   := '« ck_pieces_jointes_en_vigueur » a disparu : un fichier en quarantaine '
                    'ou dont l''analyse a échoué pourrait être désigné comme la version '
                    'officielle d''une politique de sécurité. La contrainte est la dernière '
                    'barrière — la route la précède, elle ne la remplace pas.';
        return next;
    end if;

    if not exists (
        select 1 from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = 'pieces_jointes'::regclass
           and not t.tgisinternal
           and p.proname = 'f_piece_en_vigueur_suit_l_analyse')
    then
        objet    := 'pieces_jointes';
        anomalie := 'demotion_absente';
        detail   := 'Le déclencheur « trg_pieces_jointes_en_vigueur » a disparu. '
                    'Conséquence immédiate et non évidente : la RÉ-ANALYSE PÉRIODIQUE '
                    'échouera sur toute pièce en vigueur qu''elle veut mettre en '
                    'quarantaine, puisque ck_pieces_jointes_en_vigueur le refuse. Le '
                    'dispositif antimalware serait bloqué par la gestion documentaire.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_piece_en_vigueur() is
    'Vérifie les TROIS pièces du dispositif « version en vigueur » (migration 018, action '
    'D1) : l''index unique partiel existe ET porte filiale_id, la contrainte de '
    'délivrabilité existe, le déclencheur de démotion existe. Aucune ne suffit seule — '
    'sans l''index deux versions font foi, sans la contrainte un fichier infecté peut '
    'faire foi, sans le déclencheur la ré-analyse antivirale échoue. Un schéma sain ne '
    'renvoie AUCUNE ligne.';

grant execute on function f_verifier_piece_en_vigueur() to grc_app;

-- =====================================================================================
-- §5 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
-- =====================================================================================

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
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 018 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, version en vigueur comprise.';
end;
$$;

insert into migrations_schema (version, nom)
values ('018', 'la version en vigueur d''un document — « en vigueur » sur une pièce jointe, '
               'unicité partielle par filiale, démotion suivant l''analyse, et « emplacement » '
               'assumé comme référence externe (actions D1 et D4)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop trigger if exists trg_pieces_jointes_en_vigueur on pieces_jointes;
--   drop function if exists f_piece_en_vigueur_suit_l_analyse();
--   drop function if exists f_verifier_piece_en_vigueur();
--   delete from controles_schema where fonction = 'f_verifier_piece_en_vigueur';
--   alter table pieces_jointes drop constraint if exists ck_pieces_jointes_en_vigueur;
--   drop index if exists uq_pieces_jointes_en_vigueur;
--   alter table pieces_jointes drop column if exists en_vigueur, drop column if exists version_piece;
--   delete from migrations_schema where version = '018';
--   commit;
-- ⚠️ La rejouer rend à `documents.version_document` son statut de saisie libre : le
--    numéro annoncé et le fichier déposé peuvent alors diverger sans qu'aucune contrainte
--    ne le voie. C'est le défaut que cette migration ferme.
-- =====================================================================================
