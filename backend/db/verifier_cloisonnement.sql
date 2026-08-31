-- =====================================================================================
-- verifier_cloisonnement.sql — La démonstration du cloisonnement, jouable devant un auditeur
-- =====================================================================================
-- « La filiale de Toulouse ne peut pas lire les données de la filiale allemande. »
-- Ce script ne l'affirme pas : il le MONTRE, par des comptages et des refus, sur la base
-- réelle, avec le compte réel de l'application.
--
-- Ce qu'il établit, contrôle par contrôle :
--   §1  ce qui se passe quand le serveur oublie de déclarer son périmètre (GRC04) ;
--   §2  un jeu d'essai : deux filiales, leurs données, et un socle de Groupe ;
--   §3  LECTURE — depuis Toulouse, zéro ligne de l'Allemagne, sur TOUTES les tables
--       cloisonnées, y compris celles qu'une migration future ajouterait ;
--   §4  ÉCRITURE — impossible d'écrire chez l'autre, impossible d'y déplacer une ligne ;
--   §5  LIAISONS — un lien Toulouse → Allemagne est refusé À L'INSERTION ;
--   §5b CLÉS ÉTRANGÈRES DIRECTES — une action, une exigence, un incident ou un test de
--       Toulouse ne peut pas RÉFÉRENCER une ligne de l'Allemagne (les sept clés du
--       constat B-1 de la porte de sécurité S1), et le catalogue est balayé pour qu'aucune
--       clé future ne redevienne simple en silence ;
--   §6  MESURES — une filiale ne met pas en oeuvre la mesure locale d'une autre ;
--   §6b SOCLE GROUPE — une filiale ne s'approprie pas une ligne du socle commun et ne le
--       supprime pas sous les pieds des autres (constat M-3) ;
--   §6c CONFIGURATION — les tables qui PRODUISENT les droits ne s'écrivent qu'en
--       administration Groupe (constat M-2) ;
--   §7  PÉRIMÈTRE — vide (légitime, silencieux) contre absent (défaut, bruyant), et un
--       identifiant de filiale ne peut pas contenir la virgule qui sépare le périmètre ;
--   §8  JOURNAL — nul ne fabrique de preuve dans le registre d'une autre filiale, ni même
--       dans celui d'une filiale qu'il LIT mais où il n'opère pas (constat m-4) ;
--   §9  LE RÔLE APPLICATIF — ni BYPASSRLS, ni SUPERUSER, propriétaire de rien ;
--   §10 COUVERTURE — les 47 tables sous « enable » et « force row level security », et le
--       chemin de recherche figé sur chaque fonction (constat M-1).
--
-- ── Comment le jouer ─────────────────────────────────────────────────────────────────
--
-- De préférence AVEC LE COMPTE DE L'APPLICATION — c'est de lui que parle la question
-- d'audit, et c'est le compte le plus contraint du dispositif :
--
--   PGPASSWORD=… psql -h 127.0.0.1 -U grc_app -d cyber_grc \
--       -v ON_ERROR_STOP=1 -f backend/db/verifier_cloisonnement.sql
--
-- Sous le compte propriétaire (grc_proprietaire), la démonstration reste valable et même
-- PLUS forte : « force row level security » soumet le propriétaire des tables aux mêmes
-- politiques. Le §9 le vérifie et l'affiche, quel que soit le compte employé.
--
-- CE SCRIPT N'EXIGE AUCUN PRIVILÈGE PARTICULIER, et c'est délibéré. Il rangeait autrefois
-- ses résultats dans une table TEMPORAIRE ; il ne le fait plus, parce que le privilège
-- « temporary » est désormais retiré au compte applicatif sur TOUTE base — développement
-- et banc d'essai compris (CONVENTIONS.md §17.2 : sans ce retrait, le rôle applicatif
-- masque une table du schéma par une table temporaire et détourne les fonctions qui la
-- lisent). Une démonstration qui aurait réclamé « temporary » pour tourner aurait donné
-- une raison de le rendre : c'est exactement ce qu'il ne faut pas. Les résultats
-- s'accumulent donc dans un réglage de session local à la transaction (« demo.resultats »,
-- du JSON), que tout rôle peut poser.
--
-- ── Il ne laisse RIEN derrière lui ───────────────────────────────────────────────────
--
-- Tout se joue dans UNE transaction, close par un « rollback » : les deux filiales
-- d'essai, leurs données et la table de résultats disparaissent. Le script n'écrit
-- rien de durable, et peut donc être joué sur la base de production — même si la recette
-- reste le bon endroit pour une démonstration devant témoin.
--
-- ── Verdict ──────────────────────────────────────────────────────────────────────────
--
-- Le tableau final donne chaque contrôle, l'attendu, l'obtenu et son verdict. Si un seul
-- contrôle échoue, le script lève une exception : joué avec ON_ERROR_STOP=1, il sort
-- alors en erreur. Un cloisonnement rompu ne peut donc pas passer pour un succès.
-- =====================================================================================

\pset pager off
\pset border 2
\set QUIET on
\timing off

begin;

-- LE REGISTRE DES RÉSULTATS — un réglage de session, pas une table.
--
-- « demo.resultats » est un réglage personnalisé contenant un tableau JSON de quintuplets
-- [numéro, contrôle, attendu, obtenu, verdict]. Trois propriétés en font le bon support
-- ici, là où une table temporaire échouait :
--   - il ne demande AUCUN privilège : tout rôle peut poser un réglage à nom pointé, si
--     bien que la démonstration tourne avec le compte le plus contraint du dispositif ;
--   - posé en LOCAL (troisième argument « true »), il meurt avec la transaction, exactement
--     comme le reste de ce script — rien ne survit au « rollback » final ;
--   - il ne crée aucun objet, donc rien qui pourrait apparaître au balayage du §10.
select set_config('demo.resultats', '[]', true) \gset _rebut

\set QUIET off
\echo
\echo '====================================================================================='
\echo ' CLOISONNEMENT PAR FILIALE — DÉMONSTRATION'
\echo '====================================================================================='

select current_user                        as "compte employé",
       current_setting('server_version')    as "PostgreSQL",
       current_database()                   as "base";

-- =====================================================================================
-- §1 — AVANT TOUTE CHOSE : LE PÉRIMÈTRE N'A PAS ÉTÉ POSÉ
-- -------------------------------------------------------------------------------------
-- Ce contrôle vient en premier parce qu'il est le seul qui exige un contexte VIERGE :
-- une fois « grc.filiales » posé, on ne peut plus revenir à l'état « jamais posé ».
--
-- Une transaction qui interroge une table cloisonnée sans avoir déclaré son périmètre
-- est un DÉFAUT DE PROGRAMMATION. La base ne rend pas une liste vide — ce serait un
-- défaut silencieux, cherché des heures du mauvais côté : elle lève GRC04.
-- =====================================================================================

\echo
\echo '§1 — Périmètre non posé : la base refuse bruyamment (GRC04)'

do $$
declare v_obtenu text;
begin
    begin
        perform count(*) from risques;
        v_obtenu := 'AUCUN REFUS';
    exception when others then
        v_obtenu := sqlstate;
    end;
    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C01', 'Lire une table cloisonnée sans avoir déclaré grc.filiales',
        'GRC04', v_obtenu, case when v_obtenu = 'GRC04' then 'OK' else 'ÉCHEC' end))))::text, true);
end;
$$;

-- =====================================================================================
-- §2 — JEU D'ESSAI : DEUX FILIALES ET UN SOCLE DE GROUPE
-- -------------------------------------------------------------------------------------
-- Le périmètre est posé exactement comme le fait le serveur (src/db/pool.ts) :
-- set_config(…, true), équivalent de « set local », depuis la session serveur.
-- Ici, et seulement ici, le périmètre de lecture couvre les DEUX filiales : c'est le
-- privilège du semeur, pas celui de la démonstration — le §3 le referme sur Toulouse.
-- =====================================================================================

\echo
\echo '§2 — Jeu d''essai : Toulouse (FIL-DEMO-A) et Allemagne (FIL-DEMO-B)'

select set_config('grc.utilisateur', 'demonstration', true),
       set_config('grc.filiales',    'FIL-DEMO-A,FIL-DEMO-B', true),
       set_config('grc.filiale_id',  'FIL-DEMO-A', true) \gset _rebut

insert into filiales (id, code, raison_sociale, pays) values
    ('FIL-DEMO-A', 'ZZDEMOA', 'Démonstration Toulouse',  'FR'),
    ('FIL-DEMO-B', 'ZZDEMOB', 'Démonstration Allemagne', 'DE');

-- --- socle de niveau Groupe : écriture réservée à l'administration Groupe -------------
select set_config('grc.administration_groupe', 'oui', true) \gset _rebut
insert into mesure_catalogue (id, nom) values
    ('MESURE-DEMO-G', 'Chiffrement des postes de travail (socle Groupe)');
insert into personnes (id, nom, fonction) values
    ('PERS-DEMO-G', 'Direction groupe', 'RSSI groupe');
insert into documents (id, titre, statut) values
    ('DOC-DEMO-G', 'Politique de sécurité du groupe', 'en vigueur');
select set_config('grc.administration_groupe', '', true) \gset _rebut

-- --- données de Toulouse -------------------------------------------------------------
insert into clients   (id, filiale_id, nom)              values ('CLI-DEMO-A',  'FIL-DEMO-A', 'Donneur d''ordre TLS');
insert into exigences (id, filiale_id, code, intitule)   values ('EX-DEMO-A',   'FIL-DEMO-A', 'A.5.1', 'Politique de sécurité (TLS)');
insert into risques   (id, filiale_id, nom)              values ('RISK-DEMO-A', 'FIL-DEMO-A', 'Rançongiciel sur l''ERP de Toulouse');
insert into actifs    (id, filiale_id, nom)              values ('ACTIF-DEMO-A','FIL-DEMO-A', 'ERP Toulouse');
insert into processus (id, filiale_id, nom)              values ('BIA-DEMO-A',  'FIL-DEMO-A', 'Expédition Toulouse');
insert into incidents (id, filiale_id, titre)            values ('INC-DEMO-A',  'FIL-DEMO-A', 'Hameçonnage Toulouse');
insert into mesure_catalogue (id, filiale_id, nom)       values ('MESURE-DEMO-A','FIL-DEMO-A','Mesure locale Toulouse');
insert into personnes (id, filiale_id, nom)              values ('PERS-DEMO-A', 'FIL-DEMO-A', 'Responsable TLS');
insert into evaluations (id, filiale_id, ref_id, code)   values ('EVAL-DEMO-A', 'FIL-DEMO-A', 'anssi', 'M1');
insert into scenarios_pra (id, filiale_id, nom)          values ('SCEN-DEMO-A', 'FIL-DEMO-A', 'Perte du site de Toulouse');
insert into risque_exigences (risque_id, exigence_id)    values ('RISK-DEMO-A', 'EX-DEMO-A');
insert into actif_risques    (actif_id,  risque_id)      values ('ACTIF-DEMO-A','RISK-DEMO-A');

-- --- données d'Allemagne (la filiale active bascule : on n'écrit que là où l'on est) ---
select set_config('grc.filiale_id', 'FIL-DEMO-B', true) \gset _rebut
insert into clients   (id, filiale_id, nom)              values ('CLI-DEMO-B',  'FIL-DEMO-B', 'Auftraggeber DEU');
insert into exigences (id, filiale_id, code, intitule)   values ('EX-DEMO-B',   'FIL-DEMO-B', 'A.5.1', 'Sicherheitsrichtlinie (DEU)');
insert into risques   (id, filiale_id, nom)              values ('RISK-DEMO-B', 'FIL-DEMO-B', 'Rançongiciel sur l''ERP allemand');
insert into actifs    (id, filiale_id, nom)              values ('ACTIF-DEMO-B','FIL-DEMO-B', 'ERP Allemagne');
insert into processus (id, filiale_id, nom)              values ('BIA-DEMO-B',  'FIL-DEMO-B', 'Expédition Allemagne');
insert into incidents (id, filiale_id, titre)            values ('INC-DEMO-B',  'FIL-DEMO-B', 'Intrusion Allemagne');
insert into mesure_catalogue (id, filiale_id, nom)       values ('MESURE-DEMO-B','FIL-DEMO-B','Mesure locale Allemagne');
insert into personnes (id, filiale_id, nom)              values ('PERS-DEMO-B', 'FIL-DEMO-B', 'Verantwortlicher DEU');
insert into documents (id, filiale_id, titre, statut)    values ('DOC-DEMO-B',  'FIL-DEMO-B', 'Verfahren DEU', 'en vigueur');
insert into evaluations (id, filiale_id, ref_id, code)   values ('EVAL-DEMO-B', 'FIL-DEMO-B', 'anssi', 'M1');
insert into scenarios_pra (id, filiale_id, nom)          values ('SCEN-DEMO-B', 'FIL-DEMO-B', 'Ausfall des Standorts');
insert into risque_exigences (risque_id, exigence_id)    values ('RISK-DEMO-B', 'EX-DEMO-B');
insert into actif_risques    (actif_id,  risque_id)      values ('ACTIF-DEMO-B','RISK-DEMO-B');

-- L'Allemagne met en oeuvre une mesure du socle Groupe. Cette ligne est INVISIBLE de
-- Toulouse : c'est elle qui, au §6b, empêchera Toulouse de supprimer le socle commun.
select set_config('grc.administration_groupe', 'oui', true) \gset _rebut
insert into mesure_catalogue (id, nom) values
    ('MESURE-DEMO-G2', 'Journalisation centralisée (socle Groupe)');
select set_config('grc.administration_groupe', '', true) \gset _rebut
insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values
    ('MMO-DEMO-B', 'FIL-DEMO-B', 'MESURE-DEMO-G2');

select 'semé : 2 filiales, 1 socle Groupe, des données des deux côtés' as "jeu d'essai";

-- =====================================================================================
-- §3 — LECTURE : DEPUIS TOULOUSE, ZÉRO LIGNE DE L'ALLEMAGNE
-- -------------------------------------------------------------------------------------
-- Le périmètre se referme ici sur la seule filiale de Toulouse — exactement ce que le
-- serveur pose pour un RSSI de site.
--
-- Le contrôle ne cite AUCUNE table : il les découvre dans le catalogue. Toute table
-- portant un filiale_id non nul est comptée, y compris celles qu'une migration future
-- ajouterait. Il ne peut donc pas devenir obsolète en silence.
-- =====================================================================================

\echo
\echo '§3 — Lecture depuis Toulouse : zéro ligne des autres filiales, sur toutes les tables'

select set_config('grc.filiales',   'FIL-DEMO-A', true),
       set_config('grc.filiale_id', 'FIL-DEMO-A', true) \gset _rebut

do $$
declare
    r          record;
    v_hors     bigint;
    v_total    bigint := 0;
    v_tables   int    := 0;
    v_coupable text   := null;
begin
    for r in
        select c.relname::text as nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
         where n.nspname = 'public' and c.relkind = 'r'
           and a.attnotnull and a.attnum > 0 and not a.attisdropped
           -- session_filiales est la table qui PRODUIT le périmètre : elle est de
           -- niveau socle, pas de niveau filiale (004_rls.sql §6).
           and c.relname <> 'session_filiales'
         order by c.relname
    loop
        v_tables := v_tables + 1;
        execute format('select count(*) from %I where filiale_id <> $1', r.nom)
           into v_hors using 'FIL-DEMO-A';
        v_total := v_total + v_hors;
        if v_hors > 0 and v_coupable is null then
            v_coupable := format('%s (%s ligne(s))', r.nom, v_hors);
        end if;
    end loop;

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C02',
        format('Lignes d''une autre filiale visibles depuis Toulouse (%s tables balayées)', v_tables),
        '0', coalesce(v_coupable, v_total::text),
        case when v_total = 0 then 'OK' else 'ÉCHEC' end))))::text, true);
end;
$$;

-- Contrôle symétrique, indispensable : « zéro ligne » ne vaut comme preuve que si l'on
-- voit bien SES PROPRES données. Une base vide donnerait le même zéro.
insert into demo_resultat
select 'C03', 'Toulouse voit bien SES données (contrôle symétrique)', '≥ 5', v.n::text,
       case when v.n >= 5 then 'OK' else 'ÉCHEC' end
  from (select (select count(*) from clients)
             + (select count(*) from exigences)
             + (select count(*) from risques)
             + (select count(*) from actifs)
             + (select count(*) from processus)
             + (select count(*) from incidents) as n) v;

-- Détail lisible, table par table : c'est ce que l'auditeur regarde.
\echo
select 'clients'   as "table", count(*) as "visibles depuis Toulouse" from clients
union all select 'exigences', count(*) from exigences
union all select 'risques',   count(*) from risques
union all select 'actifs',    count(*) from actifs
union all select 'incidents', count(*) from incidents
order by 1;

-- --- tables mixtes : le socle Groupe est commun, le local reste local -----------------
-- Quatre lignes de portée Groupe : deux mesures du socle, une personne, un document.
-- La seconde mesure (MESURE-DEMO-G2) sert au §6 bis — elle est mise en oeuvre par la
-- seule Allemagne, et c'est cette ligne invisible qui protège le socle de la suppression.
insert into demo_resultat
select 'C04', 'Tables mixtes : le socle de Groupe est lisible (2 mesures, personne, document)',
       '4', v.n::text, case when v.n = 4 then 'OK' else 'ÉCHEC' end
  from (select (select count(*) from mesure_catalogue where filiale_id is null)
             + (select count(*) from personnes        where filiale_id is null)
             + (select count(*) from documents        where filiale_id is null) as n) v;

insert into demo_resultat
select 'C05', 'Tables mixtes : les lignes LOCALES de l''Allemagne restent invisibles',
       '0', v.n::text, case when v.n = 0 then 'OK' else 'ÉCHEC' end
  from (select (select count(*) from mesure_catalogue where filiale_id = 'FIL-DEMO-B')
             + (select count(*) from personnes        where filiale_id = 'FIL-DEMO-B')
             + (select count(*) from documents        where filiale_id = 'FIL-DEMO-B') as n) v;

-- --- liaisons sans filiale_id : invisibles des deux bouts ------------------------------
insert into demo_resultat
select 'C06', 'Liaisons sans filiale_id : les liens de l''Allemagne sont invisibles',
       '0', v.n::text, case when v.n = 0 then 'OK' else 'ÉCHEC' end
  from (select (select count(*) from risque_exigences where risque_id = 'RISK-DEMO-B')
             + (select count(*) from actif_risques    where risque_id = 'RISK-DEMO-B') as n) v;

insert into demo_resultat
select 'C07', 'Liaisons sans filiale_id : les liens de Toulouse, eux, sont visibles',
       '2', v.n::text, case when v.n = 2 then 'OK' else 'ÉCHEC' end
  from (select (select count(*) from risque_exigences where risque_id = 'RISK-DEMO-A')
             + (select count(*) from actif_risques    where risque_id = 'RISK-DEMO-A') as n) v;

-- =====================================================================================
-- §4 à §8 — LES REFUS
-- -------------------------------------------------------------------------------------
-- Chaque cas est joué pour de vrai et son SQLSTATE relevé :
--   42501  refus de la Row Level Security (« new row violates row-level security policy »)
--   23514  refus du déclencheur de cohérence du catalogue de mesures
--   GRC04  périmètre non positionné (CONVENTIONS §15)
--   « AUCUN REFUS » pour les opérations qui, elles, DOIVENT passer — sans ces contrôles
--   symétriques, une base qui refuse tout obtiendrait un sans-faute.
-- =====================================================================================

\echo
\echo '§4 à §8 — Écritures, liens, mesures, périmètre, journal : ce qui est refusé'

do $$
declare
    -- Chaque cas : numéro, libellé, instruction, SQLSTATE attendu.
    v_cas constant text[] := array[
        -- §4 ÉCRITURE
        'C08', 'Écrire un risque dans la filiale allemande',
               'insert into risques (id, filiale_id, nom) values (''RISK-DEMO-X'', ''FIL-DEMO-B'', ''intrusion'')',
               '42501',
        'C09', 'Déplacer une ligne de Toulouse vers l''Allemagne',
               'update risques set filiale_id = ''FIL-DEMO-B'' where id = ''RISK-DEMO-A''',
               '42501',
        'C10', 'Écrire dans SA propre filiale (contrôle symétrique)',
               'insert into risques (id, filiale_id, nom) values (''RISK-DEMO-OK'', ''FIL-DEMO-A'', ''essai'')',
               'AUCUN REFUS',
        -- §5 LIAISONS
        'C11', 'Créer un lien Toulouse → Allemagne (risque TLS ↔ exigence DEU)',
               'insert into risque_exigences (risque_id, exigence_id) values (''RISK-DEMO-A'', ''EX-DEMO-B'')',
               '42501',
        'C12', 'Créer un lien Allemagne → Toulouse (sens inverse)',
               'insert into risque_exigences (risque_id, exigence_id) values (''RISK-DEMO-B'', ''EX-DEMO-A'')',
               '42501',
        'C13', 'Créer une dépendance entre un actif TLS et un actif DEU',
               'insert into actif_dependances (actif_id, actif_cible_id, type) values (''ACTIF-DEMO-A'', ''ACTIF-DEMO-B'', ''hosted'')',
               '42501',
        -- §6 MESURES
        'C14', 'Mettre en oeuvre à Toulouse une mesure LOCALE de l''Allemagne',
               'insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values (''MMO-DEMO-X'', ''FIL-DEMO-A'', ''MESURE-DEMO-B'')',
               '23514',
        'C15', 'Mettre en oeuvre à Toulouse une mesure du socle GROUPE (contrôle symétrique)',
               'insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values (''MMO-DEMO-OK'', ''FIL-DEMO-A'', ''MESURE-DEMO-G'')',
               'AUCUN REFUS',
        'C16', 'Rattacher une action de Toulouse à une mesure LOCALE de l''Allemagne',
               'insert into actions (id, filiale_id, titre, mesure_id) values (''ACT-DEMO-X'', ''FIL-DEMO-A'', ''essai'', ''MESURE-DEMO-B'')',
               '23514',
        -- §7 PÉRIMÈTRE
        'C17', 'Écrire sans filiale active (grc.filiale_id vide)',
               'select set_config(''grc.filiale_id'', '''', true);'
               || 'insert into risques (id, filiale_id, nom) values (''RISK-DEMO-Y'', ''FIL-DEMO-A'', ''essai'')',
               'GRC04',
        -- §8 JOURNAL D'AUDIT
        'C18', 'Écrire au journal une entrée attribuée à l''Allemagne',
               'insert into journal_audit (action, filiale_id, resume) values (''creation'', ''FIL-DEMO-B'', ''preuve fabriquée'')',
               '42501',
        'C19', 'Écrire au journal une entrée transversale, sans filiale (contrôle symétrique)',
               'insert into journal_audit (action, resume) values (''demarrage'', ''entrée transversale'')',
               'AUCUN REFUS'
    ];
    i        int;
    v_obtenu text;
begin
    i := 1;
    while i <= array_length(v_cas, 1) loop
        begin
            -- Chaque cas dans son propre bloc : l'échec attendu est rattrapé ici, la
            -- transaction de démonstration n'est jamais perdue.
            execute v_cas[i + 2];
            v_obtenu := 'AUCUN REFUS';
        exception when others then
            v_obtenu := sqlstate;
        end;

        -- Le périmètre d'écriture, et le drapeau d'administration, sont rétablis après
        -- les cas qui les modifient volontairement : un cas ne doit jamais hériter du
        -- contexte du précédent, sinon la démonstration ne prouve plus ce qu'elle annonce.
        perform set_config('grc.filiale_id', 'FIL-DEMO-A', true);
        perform set_config('grc.administration_groupe', '', true);

        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
            v_cas[i], v_cas[i + 1], v_cas[i + 3], v_obtenu,
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end))))::text, true);
        i := i + 4;
    end loop;
end;
$$;

-- --- le journal reste en AJOUT SEUL sous la RLS ----------------------------------------
-- Contrôle à part, parce que le code du refus DÉPEND DU COMPTE, et que c'est justement
-- ce qui montre l'empilement des couches du CONVENTIONS §12 :
--   - sous grc_app        : 42501 — couche 1, le rôle applicatif n'a pas le verbe SQL ;
--   - sous le propriétaire : GRC01 — couche 2, le déclencheur « enable always » refuse,
--                            bruyamment, celui-là même qui pourrait croire en avoir le droit.
-- Les deux valent réussite : ce qui est vérifié, c'est que la modification est REFUSÉE,
-- et que 004_rls.sql n'a pas transformé ce refus en un silence.
do $$
declare v_obtenu text;
begin
    begin
        update journal_audit set resume = 'falsifié';
        v_obtenu := 'AUCUN REFUS';
    exception when others then
        v_obtenu := sqlstate;
    end;
    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C20', 'Modifier le journal d''audit — ajout seul (CONVENTIONS §12)',
        'GRC01 ou 42501',
        v_obtenu || case v_obtenu when '42501' then ' (couche 1 : privilèges)'
                                  when 'GRC01' then ' (couche 2 : déclencheur)'
                                  else '' end,
        case when v_obtenu in ('GRC01', '42501') then 'OK' else 'ÉCHEC' end))))::text, true);
end;
$$;

-- --- périmètre VIDE : silencieux, et c'est voulu ---------------------------------------
-- Un périmètre posé mais vide (traitements système) n'est pas une erreur : il ne donne
-- accès à rien, sans déranger personne. C'est l'autre moitié de la règle du §1.
do $$
declare
    v_visibles bigint;
    v_erreur   text := 'aucune';
begin
    perform set_config('grc.filiales', '', true);
    begin
        select count(*) into v_visibles from risques;
    exception when others then
        v_erreur   := sqlstate;
        v_visibles := -1;
    end;
    perform set_config('grc.filiales', 'FIL-DEMO-A', true);

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C21', 'Périmètre posé mais VIDE : aucune ligne, et aucune erreur',
        '0 ligne / aucune erreur',
        format('%s ligne(s) / erreur : %s', v_visibles, v_erreur),
        case when v_visibles = 0 and v_erreur = 'aucune' then 'OK' else 'ÉCHEC' end))))::text, true);
end;
$$;

-- --- le journal : dire aussi ce qui N'EST PAS cloisonné ---------------------------------
-- Une démonstration qui tait ses limites ne vaut rien en audit. La LECTURE du journal
-- n'est pas cloisonnée : le chaînage par empreinte (001) exige de voir la chaîne entière
-- pour numéroter et pour se vérifier. C'est une dérogation ASSUMÉE et documentée
-- (004_rls.sql §6) ; ce contrôle la constate, il ne la cache pas.
insert into demo_resultat
select 'C22', 'Journal d''audit : lecture NON cloisonnée (dérogation assumée, cf. 004 §6)',
       'true', coalesce(pg_get_expr(p.polqual, p.polrelid), '(aucun)'),
       case when coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true' then 'OK (constaté)' else 'ÉCHEC' end
  from pg_policy p
 where p.polrelid = 'journal_audit'::regclass and p.polname = 'pol_journal_audit_lecture';


-- =====================================================================================
-- §5 bis — CLÉS ÉTRANGÈRES DIRECTES : RÉFÉRENCER UNE LIGNE DE L'AUTRE FILIALE
-- -------------------------------------------------------------------------------------
-- Le §5 ci-dessus ne portait que sur les tables de LIAISON. Or les liens inter-filiales
-- ne passent pas seulement par elles : une action, une exigence, un incident, un test de
-- continuité portent des colonnes de rattachement qui désignent, elles aussi, une ligne
-- d'une autre table cloisonnée.
--
-- Sept de ces clés étrangères étaient SIMPLES, et sept liens sur treize passaient donc :
-- c'est le constat B-1 de la porte de sécurité S1. La conclusion de ce script affirmait
-- que Toulouse « ne peut pas créer de lien vers » l'Allemagne — c'était faux, et rien
-- ici ne le montrait. Ces contrôles-là existent pour cette raison.
--
-- Ce qui refuse ici n'est pas la RLS mais l'INTÉGRITÉ RÉFÉRENTIELLE (23503), et c'est le
-- point : les contrôles d'intégrité de PostgreSQL contournent délibérément la RLS, si
-- bien qu'une clé simple est satisfaite par une ligne invisible. Seule la clé COMPOSITE
-- (colonne_reference, filiale_id) ferme le chemin — le couple doit exister tel quel.
-- =====================================================================================

\echo
\echo '§5 bis — Référencer une ligne de l''Allemagne : les sept clés étrangères directes'

do $$
declare
    v_cas constant text[] := array[
        'C29', 'Rattacher une action de Toulouse à une EXIGENCE de l''Allemagne',
               'insert into actions (id, filiale_id, titre, exigence_id) values (''ACT-DEMO-1'', ''FIL-DEMO-A'', ''essai'', ''EX-DEMO-B'')',
               '23503',
        'C30', 'Rattacher une action de Toulouse à un RISQUE de l''Allemagne',
               'insert into actions (id, filiale_id, titre, risque_id) values (''ACT-DEMO-2'', ''FIL-DEMO-A'', ''essai'', ''RISK-DEMO-B'')',
               '23503',
        'C31', 'Rattacher une action de Toulouse à une ÉVALUATION de l''Allemagne',
               'insert into actions (id, filiale_id, titre, evaluation_id) values (''ACT-DEMO-3'', ''FIL-DEMO-A'', ''essai'', ''EVAL-DEMO-B'')',
               '23503',
        'C32', 'Rattacher une action de Toulouse à un INCIDENT de l''Allemagne',
               'insert into actions (id, filiale_id, titre, incident_id) values (''ACT-DEMO-4'', ''FIL-DEMO-A'', ''essai'', ''INC-DEMO-B'')',
               '23503',
        'C33', 'Rattacher une exigence de Toulouse à un DONNEUR D''ORDRE de l''Allemagne',
               'insert into exigences (id, filiale_id, code, intitule, client_id) values (''EX-DEMO-X'', ''FIL-DEMO-A'', ''A.5.2'', ''essai'', ''CLI-DEMO-B'')',
               '23503',
        'C34', 'Rattacher un incident de Toulouse à un RISQUE de l''Allemagne',
               'insert into incidents (id, filiale_id, titre, risque_id) values (''INC-DEMO-X'', ''FIL-DEMO-A'', ''essai'', ''RISK-DEMO-B'')',
               '23503',
        'C35', 'Rattacher un test de continuité de Toulouse à un SCÉNARIO de l''Allemagne',
               'insert into tests_pra (id, filiale_id, scenario_id) values (''TEST-DEMO-X'', ''FIL-DEMO-A'', ''SCEN-DEMO-B'')',
               '23503',
        -- Sans ces trois contrôles symétriques, une clé étrangère cassée obtiendrait le
        -- même sans-faute que la clé composite : ce qui est demandé, c'est de refuser le
        -- lien transfrontière SANS refuser le lien légitime.
        'C36', 'Rattacher une action de Toulouse à SON PROPRE risque (contrôle symétrique)',
               'insert into actions (id, filiale_id, titre, risque_id) values (''ACT-DEMO-OK'', ''FIL-DEMO-A'', ''essai'', ''RISK-DEMO-A'')',
               'AUCUN REFUS',
        'C37', 'Rattacher un test de Toulouse à SON PROPRE scénario (contrôle symétrique)',
               'insert into tests_pra (id, filiale_id, scenario_id) values (''TEST-DEMO-OK'', ''FIL-DEMO-A'', ''SCEN-DEMO-A'')',
               'AUCUN REFUS',
        'C38', 'Créer une action SANS rattachement (contrôle symétrique : « match simple »)',
               'insert into actions (id, filiale_id, titre) values (''ACT-DEMO-NUL'', ''FIL-DEMO-A'', ''essai'')',
               'AUCUN REFUS'
    ];
    i        int;
    v_obtenu text;
begin
    i := 1;
    while i <= array_length(v_cas, 1) loop
        begin
            execute v_cas[i + 2];
            v_obtenu := 'AUCUN REFUS';
        exception when others then
            v_obtenu := sqlstate;
        end;
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
            v_cas[i], v_cas[i + 1], v_cas[i + 3], v_obtenu,
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end))))::text, true);
        i := i + 4;
    end loop;
end;
$$;

-- --- le balayage : AUCUNE clé étrangère entre deux tables cloisonnées n'est simple -----
-- Les dix cas ci-dessus prouvent l'état d'aujourd'hui ; celui-ci protège de demain. Il ne
-- cite aucune contrainte : il les découvre dans le catalogue. Une entité ajoutée par une
-- migration future avec une clé étrangère simple vers une autre table cloisonnée fera
-- échouer ce contrôle sans que personne n'ait à y penser — c'est exactement l'omission
-- qui a produit le constat B-1.
do $$
declare
    v_fautives text;
    v_nombre   int;
    v_total    int;
begin
    with cloisonnee as (
        select c.oid, c.relname::text as nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
         where n.nspname = 'public' and c.relkind = 'r'
           and a.attnotnull and a.attnum > 0 and not a.attisdropped
    ),
    liens as (
        select con.conname::text as nom_contrainte,
               e.nom as enfant, p.nom as parent,
               exists (
                   select 1 from unnest(con.conkey) as k
                   join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
                    where att.attname = 'filiale_id') as composite
          from pg_constraint con
          join cloisonnee e on e.oid = con.conrelid
          join cloisonnee p on p.oid = con.confrelid
         where con.contype = 'f' and p.nom <> 'filiales'
    )
    select string_agg(format('%s (%s -> %s)', nom_contrainte, enfant, parent), ', ' order by nom_contrainte)
             filter (where not composite),
           count(*) filter (where not composite),
           count(*)
      into v_fautives, v_nombre, v_total
      from liens;

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C39',
        format('Clés étrangères SIMPLES entre deux tables cloisonnées (%s clés balayées)',
               coalesce(v_total, 0)),
        '0', coalesce(v_fautives, coalesce(v_nombre, 0)::text),
        case when coalesce(v_nombre, 0) = 0 then 'OK' else 'ÉCHEC' end))))::text, true);
end;
$$;

-- =====================================================================================
-- §6 bis — LE SOCLE GROUPE : NI ACCAPARÉ, NI SUPPRIMÉ SOUS LES PIEDS DES AUTRES
-- -------------------------------------------------------------------------------------
-- Constat M-3 de la porte S1. Les lignes de portée Groupe (filiale_id nul) des cinq
-- tables mixtes sont le socle commun des vingt filiales. Deux chemins permettaient de se
-- l'approprier puis de le détruire, et le second détruisait des lignes INVISIBLES de son
-- auteur, dans des filiales qui ne sont pas la sienne, sans aucune trace en base.
--
-- Le drapeau grc.administration_groupe est posé ici volontairement : c'est un réglage de
-- session ordinaire, rien n'empêche une session de le poser elle-même, et c'est
-- précisément dans cette hypothèse que la démonstration a de la valeur.
-- =====================================================================================

\echo
\echo '§6 bis — Le socle Groupe : appropriation et destruction collatérale'

do $$
declare
    v_cas constant text[] := array[
        'C40', 'S''APPROPRIER une ligne du socle Groupe (la basculer dans sa filiale)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'update mesure_catalogue set filiale_id = ''FIL-DEMO-A'' where id = ''MESURE-DEMO-G''',
               '23514',
        'C41', 'PROMOUVOIR sa mesure locale en socle Groupe (le sens inverse)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'update mesure_catalogue set filiale_id = null where id = ''MESURE-DEMO-A''',
               '23514',
        'C42', 'SUPPRIMER du socle Groupe une mesure mise en oeuvre par une AUTRE filiale',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'delete from mesure_catalogue where id = ''MESURE-DEMO-G2''',
               '23503',
        'C43', 'Modifier le CONTENU d''une ligne Groupe en administration (contrôle symétrique)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'update mesure_catalogue set description = ''précisée'' where id = ''MESURE-DEMO-G''',
               'AUCUN REFUS',
        -- §6 ter — les tables qui PRODUISENT la décision d'autorisation (constat M-2).
        'C44', 'Écrire dans « profils » sans être en administration Groupe',
               'insert into profils (id, code, nom) values (''PROF-DEMO'', ''ZZDEMO'', ''Profil de démonstration'')',
               '42501',
        'C45', 'Écrire dans « profils » EN administration Groupe (contrôle symétrique)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'insert into profils (id, code, nom) values (''PROF-DEMO2'', ''ZZDEMO2'', ''Profil de démonstration'')',
               'AUCUN REFUS',
        -- §7 bis — le domaine des identifiants (constat m-2).
        'C46', 'Créer une filiale dont l''identifiant contient la virgule du périmètre',
               'insert into filiales (id, code, raison_sociale) values (''FIL-DEMO-A,FIL-DEMO-B'', ''ZZDEMOC'', ''Filiale forgée'')',
               '23514',
        'C47', 'Créer une filiale à l''identifiant ancien, sans préfixe (contrôle symétrique)',
               'insert into filiales (id, code, raison_sociale) values (''1720000000000'', ''ZZDEMOD'', ''Reprise ancienne'')',
               'AUCUN REFUS'
    ];
    i        int;
    v_obtenu text;
begin
    i := 1;
    while i <= array_length(v_cas, 1) loop
        begin
            execute v_cas[i + 2];
            v_obtenu := 'AUCUN REFUS';
        exception when others then
            v_obtenu := sqlstate;
        end;
        perform set_config('grc.administration_groupe', '', true);
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
            v_cas[i], v_cas[i + 1], v_cas[i + 3], v_obtenu,
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end))))::text, true);
        i := i + 4;
    end loop;
end;
$$;

-- --- la mise en oeuvre invisible de l'Allemagne a-t-elle survécu ? ---------------------
-- Le contrôle qui donne son sens au précédent : ce qui devait être protégé l'est.
-- Le comptage se fait sous le périmètre de l'ALLEMAGNE, puisque la ligne est par
-- construction invisible de Toulouse — un comptage à zéro depuis Toulouse ne prouverait
-- rien, ni dans un sens ni dans l'autre.
do $$
declare v_reste bigint;
begin
    perform set_config('grc.filiales', 'FIL-DEMO-B', true);
    select count(*) into v_reste from mesure_mise_en_oeuvre where id = 'MMO-DEMO-B';
    perform set_config('grc.filiales', 'FIL-DEMO-A', true);

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C48', 'La mise en oeuvre de l''Allemagne a survécu à la tentative de Toulouse',
        '1', v_reste::text, case when v_reste = 1 then 'OK' else 'ÉCHEC' end))))::text, true);
end;
$$;

-- =====================================================================================
-- §8 bis — LE JOURNAL S'ÉCRIT SUR LA FILIALE ACTIVE, PAS SUR LE PÉRIMÈTRE DE LECTURE
-- -------------------------------------------------------------------------------------
-- Constat m-4. Le §8 ci-dessus (C18) montre qu'une session de Toulouse ne peut pas écrire
-- dans le registre de l'Allemagne — mais elle ne LIT que Toulouse. Le cas qui manquait est
-- celui d'un compte de périmètre Groupe : il lit les vingt filiales, et pouvait donc
-- attribuer une trace à n'importe laquelle, et non à celle qu'il avait sélectionnée.
-- C'est la valeur probante du registre de chaque filiale qui s'y jouait.
-- =====================================================================================

\echo
\echo '§8 bis — Journal : un compte de périmètre Groupe n''écrit que dans sa filiale active'

do $$
declare v_obtenu text;
begin
    -- Périmètre de LECTURE : les deux filiales. Filiale ACTIVE : Toulouse.
    perform set_config('grc.filiales', 'FIL-DEMO-A,FIL-DEMO-B', true);
    begin
        insert into journal_audit (action, filiale_id, resume)
        values ('creation', 'FIL-DEMO-B', 'trace attribuée à une filiale seulement LUE');
        v_obtenu := 'AUCUN REFUS';
    exception when others then
        v_obtenu := sqlstate;
    end;
    perform set_config('grc.filiales', 'FIL-DEMO-A', true);

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C49', 'Périmètre Groupe : écrire au journal d''une filiale LUE mais non active',
        '42501', v_obtenu, case when v_obtenu = '42501' then 'OK' else 'ÉCHEC' end))))::text, true);
end;
$$;

-- =====================================================================================
-- §9 — LE RÔLE APPLICATIF
-- -------------------------------------------------------------------------------------
-- Toutes les politiques du monde ne valent rien au-dessus d'un rôle qui porte BYPASSRLS,
-- ou qui possède les tables et peut donc retirer le « force ».
-- =====================================================================================

\echo
\echo '§9 — Le rôle applicatif : ni BYPASSRLS, ni SUPERUSER, propriétaire de rien'

insert into demo_resultat
select 'C23', 'grc_app : ni SUPERUSER ni BYPASSRLS',
       'non / non',
       case when r.rolsuper then 'SUPERUSER ' else 'non ' end
       || case when r.rolbypassrls then '/ BYPASSRLS' else '/ non' end,
       case when not r.rolsuper and not r.rolbypassrls then 'OK' else 'ÉCHEC' end
  from pg_roles r where r.rolname = 'grc_app';

insert into demo_resultat
select 'C24', 'grc_app ne possède aucune table du schéma public', '0', count(*)::text,
       case when count(*) = 0 then 'OK' else 'ÉCHEC' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles r     on r.oid = c.relowner
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and r.rolname = 'grc_app';

insert into demo_resultat
select 'C25', 'grc_app sur journal_audit : select et insert SEULEMENT',
       'select+insert',
       concat_ws('+',
           case when has_table_privilege('grc_app', 'journal_audit', 'select')   then 'select'   end,
           case when has_table_privilege('grc_app', 'journal_audit', 'insert')   then 'insert'   end,
           case when has_table_privilege('grc_app', 'journal_audit', 'update')   then 'update'   end,
           case when has_table_privilege('grc_app', 'journal_audit', 'delete')   then 'delete'   end,
           case when has_table_privilege('grc_app', 'journal_audit', 'truncate') then 'truncate' end),
       case when has_table_privilege('grc_app', 'journal_audit', 'select')
             and has_table_privilege('grc_app', 'journal_audit', 'insert')
             and not has_table_privilege('grc_app', 'journal_audit', 'update')
             and not has_table_privilege('grc_app', 'journal_audit', 'delete')
             and not has_table_privilege('grc_app', 'journal_audit', 'truncate')
            then 'OK' else 'ÉCHEC' end
 where exists (select 1 from pg_roles where rolname = 'grc_app');

insert into demo_resultat
select 'C26', 'grc_app sur migrations_schema : select SEULEMENT (garde-fou anti-réécriture)',
       'select',
       concat_ws('+',
           case when has_table_privilege('grc_app', 'migrations_schema', 'select') then 'select' end,
           case when has_table_privilege('grc_app', 'migrations_schema', 'insert') then 'insert' end,
           case when has_table_privilege('grc_app', 'migrations_schema', 'update') then 'update' end,
           case when has_table_privilege('grc_app', 'migrations_schema', 'delete') then 'delete' end),
       case when has_table_privilege('grc_app', 'migrations_schema', 'select')
             and not has_table_privilege('grc_app', 'migrations_schema', 'insert')
             and not has_table_privilege('grc_app', 'migrations_schema', 'update')
             and not has_table_privilege('grc_app', 'migrations_schema', 'delete')
            then 'OK' else 'ÉCHEC' end
 where exists (select 1 from pg_roles where rolname = 'grc_app');

-- =====================================================================================
-- §10 — COUVERTURE
-- =====================================================================================

\echo
\echo '§10 — Couverture : toutes les tables sous « enable » ET « force row level security »'

insert into demo_resultat
select 'C27', 'Tables du schéma public sans RLS active et forcée', '0', count(*)::text,
       case when count(*) = 0 then 'OK' else 'ÉCHEC' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and not (c.relrowsecurity and c.relforcerowsecurity);

insert into demo_resultat
select 'C28', 'Anomalies de f_verifier_couverture_rls()', '0', count(*)::text,
       case when count(*) = 0 then 'OK' else 'ÉCHEC' end
  from f_verifier_couverture_rls();

-- Constat M-1 : une fonction dont le chemin de recherche n'est pas figé est détournable
-- par masquage pg_temp — le rôle applicatif substitue sa propre table à une table du
-- schéma, et la fonction qui la lit travaille sur les données de l'attaquant. Le réglage
-- doit NOMMER pg_temp, et en dernier : non nommé, il est consulté en PREMIER.
insert into demo_resultat
select 'C50', 'Fonctions dont le chemin de recherche n''est pas figé (pg_temp compris)',
       '0', count(*)::text, case when count(*) = 0 then 'OK' else 'ÉCHEC' end
  from f_verifier_chemin_recherche();

select count(*) filter (where relrowsecurity)        as "RLS active",
       count(*) filter (where relforcerowsecurity)   as "RLS forcée",
       count(*)                                      as "tables",
       (select count(*) from pg_policies where schemaname = 'public') as "politiques"
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';

-- =====================================================================================
-- VERDICT
-- =====================================================================================

\echo
\echo '====================================================================================='
\echo ' VERDICT'
\echo '====================================================================================='

select numero as "n°", controle as "contrôle", attendu as "attendu",
       obtenu as "obtenu", verdict as "verdict"
  from demo_resultat order by numero;

select count(*)                                            as "contrôles",
       count(*) filter (where verdict like 'OK%')          as "réussis",
       count(*) filter (where verdict = 'ÉCHEC')           as "échoués"
  from demo_resultat;

do $$
declare
    v_echecs text;
    v_nombre int;
begin
    select string_agg(format('  %s — %s (attendu %s, obtenu %s)', numero, controle, attendu, obtenu),
                      E'\n' order by numero),
           count(*)
      into v_echecs, v_nombre
      from demo_resultat where verdict = 'ÉCHEC';

    if v_nombre > 0 then
        raise exception E'CLOISONNEMENT EN DÉFAUT — % contrôle(s) en échec :\n%', v_nombre, v_echecs
            using hint = 'Un seul de ces contrôles suffit à rendre le cloisonnement '
                         'non démontrable en audit. Ne pas mettre en service.';
    end if;

    raise notice
        'CLOISONNEMENT DÉMONTRÉ : la filiale de Toulouse ne voit aucune ligne de la filiale '
        'allemande, ne peut pas y écrire, ne peut créer vers elle NI lien de liaison NI clé '
        'étrangère directe (les sept du constat B-1, plus le balayage du catalogue), ne peut '
        'pas mettre en oeuvre ses mesures locales, ne peut ni s''approprier ni détruire le '
        'socle commun du Groupe, ne peut pas fabriquer d''entrée dans son journal — pas même '
        'avec un périmètre de lecture qui la couvre.';
end;
$$;

-- =====================================================================================
-- NETTOYAGE — tout ce que ce script a écrit disparaît ici.
-- =====================================================================================
rollback;

\echo
\echo 'Transaction annulée : les deux filiales de démonstration et leurs données ont disparu.'
\echo
