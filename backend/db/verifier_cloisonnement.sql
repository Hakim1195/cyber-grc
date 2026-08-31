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
--   §6d CATALOGUE DE MESURES — un contrôle du socle déjà mis en oeuvre ou référencé par
--       une filiale ne se supprime pas ; délier puis supprimer, dans la même transaction,
--       fonctionne toujours (CONVENTIONS.md §17.6) ;
--   §7  PÉRIMÈTRE — vide (légitime, silencieux) contre absent (défaut, bruyant), et un
--       identifiant de filiale ne peut pas contenir la virgule qui sépare le périmètre ;
--   §8  JOURNAL — nul ne fabrique de preuve dans le registre d'une autre filiale, ni même
--       dans celui d'une filiale qu'il LIT mais où il n'opère pas (constat m-4) ;
--   §8b FILIALE D'ÉCRITURE — on n'écrit pas dans une filiale que l'on ne lit pas : la
--       base recoupe grc.filiale_id et grc.filiales, elle ne s'en remet pas au code
--       (constat BLOQUANT N-1, CONVENTIONS.md §17.9) ;
--   §8c CONFIGURATION, SUITE — « filiales » ne s'écrit qu'en administration Groupe, et
--       une filiale ne pose pas son fichier comme logo d'une autre (constat N-2) ; un
--       contrôle du socle indestructible S'ARCHIVE (N-6) ; l'acteur du journal vient de
--       la session (N-5) ; les déclencheurs de cohérence sont armés en « always » (N-11) ;
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
-- d'essai, leurs données et le registre des résultats disparaissent. Le script n'écrit
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
        'GRC04', v_obtenu, case when v_obtenu = 'GRC04' then 'OK' else 'ÉCHEC' end)))::text, true);
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

-- Créer une filiale est un acte d'ADMINISTRATION GROUPE depuis le second passage de la
-- porte de sécurité S1 (constat N-2) : « filiales » a rejoint les tables de configuration
-- (CONVENTIONS.md §17.4). Le semis le déclare, comme il le fait déjà pour le socle
-- ci-dessous. Le fait que cette ligne ait dû être ajoutée est le constat lui-même : la
-- démonstration reposait jusque-là sur une écriture que n'importe quelle filiale pouvait
-- faire sur la fiche de n'importe quelle autre.
select set_config('grc.administration_groupe', 'oui', true) \gset _rebut
insert into filiales (id, code, raison_sociale, pays) values
    ('FIL-DEMO-A', 'ZZDEMOA', 'Démonstration Toulouse',  'FR'),
    ('FIL-DEMO-B', 'ZZDEMOB', 'Démonstration Allemagne', 'DE');
select set_config('grc.administration_groupe', '', true) \gset _rebut

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
-- Une pièce jointe de Toulouse, pour éprouver au §8 quater le chemin du LOGO : c'est par
-- lui que la filiale A modifiait la fiche de la filiale B (constat N-2).
insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier, type_mime,
                            taille_octets, sha256, chemin_stockage)
    values ('PJ-DEMO-A', 'FIL-DEMO-A', 'filiales', 'FIL-DEMO-A', 'logo-toulouse.png',
            'image/png', 4096, repeat('a', 64), '/magasin/demo/pj-demo-a');

-- Toulouse rattache SA mesure locale : de quoi éprouver le cas 1 du CONVENTIONS §17.6
-- (délier, puis supprimer, dans la même transaction).
insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values
    ('MMO-DEMO-A', 'FIL-DEMO-A', 'MESURE-DEMO-A');
insert into actions (id, filiale_id, titre, mesure_id) values
    ('ACT-DEMO-A', 'FIL-DEMO-A', 'Chiffrer les postes', 'MESURE-DEMO-A');

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

-- L'Allemagne référence des contrôles du socle Groupe, par les QUATRE chemins possibles
-- — un contrôle distinct pour chacun, plus un cinquième que personne n'utilise. Ces
-- lignes sont INVISIBLES de Toulouse : ce sont elles qui, au §6 bis et au §6 quater,
-- empêcheront Toulouse de supprimer le socle commun (CONVENTIONS.md §17.6).
select set_config('grc.administration_groupe', 'oui', true) \gset _rebut
insert into mesure_catalogue (id, nom) values
    ('MESURE-DEMO-G2', 'Journalisation centralisée (socle Groupe)'),
    ('MESURE-DEMO-G3', 'Revue des habilitations (socle Groupe)'),
    ('MESURE-DEMO-G4', 'Sauvegardes testées (socle Groupe)'),
    ('MESURE-DEMO-G5', 'Cloisonnement réseau (socle Groupe)'),
    ('MESURE-DEMO-G6', 'Contrôle du socle que personne n''utilise');
select set_config('grc.administration_groupe', '', true) \gset _rebut
insert into traitements (id, filiale_id, nom) values
    ('TRT-DEMO-B', 'FIL-DEMO-B', 'Gehaltsabrechnung');
insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values
    ('MMO-DEMO-B', 'FIL-DEMO-B', 'MESURE-DEMO-G2');
insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values
    ('EVAL-DEMO-B', 'MESURE-DEMO-G3', 'FIL-DEMO-B');
insert into traitement_mesures (traitement_id, mesure_id, filiale_id) values
    ('TRT-DEMO-B', 'MESURE-DEMO-G4', 'FIL-DEMO-B');
insert into actions (id, filiale_id, titre, mesure_id) values
    ('ACT-DEMO-B', 'FIL-DEMO-B', 'Revoir les habilitations', 'MESURE-DEMO-G5');

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
        case when v_total = 0 then 'OK' else 'ÉCHEC' end)))::text, true);
end;
$$;

-- Contrôle symétrique, indispensable : « zéro ligne » ne vaut comme preuve que si l'on
-- voit bien SES PROPRES données. Une base vide donnerait le même zéro.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C03', 'Toulouse voit bien SES données (contrôle symétrique)', '≥ 5', v.n::text,
               case when v.n >= 5 then 'OK' else 'ÉCHEC' end
          from (select (select count(*) from clients)
                     + (select count(*) from exigences)
                     + (select count(*) from risques)
                     + (select count(*) from actifs)
                     + (select count(*) from processus)
                     + (select count(*) from incidents) as n) v
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- Détail lisible, table par table : c'est ce que l'auditeur regarde.
\echo
select 'clients'   as "table", count(*) as "visibles depuis Toulouse" from clients
union all select 'exigences', count(*) from exigences
union all select 'risques',   count(*) from risques
union all select 'actifs',    count(*) from actifs
union all select 'incidents', count(*) from incidents
order by 1;

-- --- tables mixtes : le socle Groupe est commun, le local reste local -----------------
-- Huit lignes de portée Groupe : six mesures du socle, une personne, un document. Les
-- quatre mesures MESURE-DEMO-G2 à G5 servent au §6 quater — chacune n'est référencée que par
-- l'Allemagne, par l'un des quatre chemins possibles, et ce sont ces lignes invisibles qui
-- protègent le socle de la suppression. MESURE-DEMO-G6, elle, n'est utilisée par personne.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C04', 'Tables mixtes : le socle de Groupe est lisible (6 mesures, personne, document)',
               '8', v.n::text, case when v.n = 8 then 'OK' else 'ÉCHEC' end
          from (select (select count(*) from mesure_catalogue where filiale_id is null)
                     + (select count(*) from personnes        where filiale_id is null)
                     + (select count(*) from documents        where filiale_id is null) as n) v
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C05', 'Tables mixtes : les lignes LOCALES de l''Allemagne restent invisibles',
               '0', v.n::text, case when v.n = 0 then 'OK' else 'ÉCHEC' end
          from (select (select count(*) from mesure_catalogue where filiale_id = 'FIL-DEMO-B')
                     + (select count(*) from personnes        where filiale_id = 'FIL-DEMO-B')
                     + (select count(*) from documents        where filiale_id = 'FIL-DEMO-B') as n) v
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- --- liaisons sans filiale_id : invisibles des deux bouts ------------------------------
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C06', 'Liaisons sans filiale_id : les liens de l''Allemagne sont invisibles',
               '0', v.n::text, case when v.n = 0 then 'OK' else 'ÉCHEC' end
          from (select (select count(*) from risque_exigences where risque_id = 'RISK-DEMO-B')
                     + (select count(*) from actif_risques    where risque_id = 'RISK-DEMO-B') as n) v
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C07', 'Liaisons sans filiale_id : les liens de Toulouse, eux, sont visibles',
               '2', v.n::text, case when v.n = 2 then 'OK' else 'ÉCHEC' end
          from (select (select count(*) from risque_exigences where risque_id = 'RISK-DEMO-A')
                     + (select count(*) from actif_risques    where risque_id = 'RISK-DEMO-A') as n) v
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

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
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end)))::text, true);
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
        case when v_obtenu in ('GRC01', '42501') then 'OK' else 'ÉCHEC' end)))::text, true);
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
        case when v_visibles = 0 and v_erreur = 'aucune' then 'OK' else 'ÉCHEC' end)))::text, true);
end;
$$;

-- --- le journal : dire aussi ce qui N'EST PAS cloisonné ---------------------------------
-- Une démonstration qui tait ses limites ne vaut rien en audit. La LECTURE du journal
-- n'est pas cloisonnée : le chaînage par empreinte (001) exige de voir la chaîne entière
-- pour numéroter et pour se vérifier. C'est une dérogation ASSUMÉE et documentée
-- (004_rls.sql §6) ; ce contrôle la constate, il ne la cache pas.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C22', 'Journal d''audit : lecture NON cloisonnée (dérogation assumée, cf. 004 §6)',
               'true', coalesce(pg_get_expr(p.polqual, p.polrelid), '(aucun)'),
               case when coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true' then 'OK (constaté)' else 'ÉCHEC' end
          from pg_policy p
         where p.polrelid = 'journal_audit'::regclass and p.polname = 'pol_journal_audit_lecture'
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;


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
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end)))::text, true);
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
        case when coalesce(v_nombre, 0) = 0 then 'OK' else 'ÉCHEC' end)))::text, true);
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
        -- Le drapeau est posé ici parce que le contrôle porte sur le DOMAINE id_metier,
        -- pas sur la politique d'écriture de « filiales » (celle-là est éprouvée en C60).
        'C47', 'Créer une filiale à l''identifiant ancien, sans préfixe (contrôle symétrique)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'insert into filiales (id, code, raison_sociale) values (''1720000000000'', ''ZZDEMOD'', ''Reprise ancienne'')',
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
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end)))::text, true);
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
        '1', v_reste::text, case when v_reste = 1 then 'OK' else 'ÉCHEC' end)))::text, true);
end;
$$;

-- =====================================================================================
-- §6 quater — TOUTE RÉFÉRENCE AU CATALOGUE EST EN « restrict » (CONVENTIONS.md §17.6)
-- -------------------------------------------------------------------------------------
-- Amendement du §8, dont les règles — « délie les évaluations », « conserve les actions »
-- — avaient été écrites pour le produit MONO-FILIALE, où le rayon d'une suppression ne
-- quittait pas le poste de l'utilisateur.
--
-- En contexte de groupe, elles produisaient l'effet INVERSE de leur intention : supprimer
-- un contrôle du socle commun déliait les évaluations et remettait à null les actions de
-- VINGT filiales, ce qui incrémentait leur « version » et inscrivait dans leurs lignes le
-- nom de quelqu'un qui n'y a jamais travaillé. C'est la pathologie du constat bloquant
-- B-1, par un autre chemin.
--
-- CE QUE CES CONTRÔLES DOIVENT ÉTABLIR, ET DANS CET ORDRE :
--   - les QUATRE chemins de référence refusent la suppression (C51 à C54), y compris —
--     surtout — quand la ligne qui s'y oppose est INVISIBLE de celui qui supprime : le
--     refus vient de l'intégrité référentielle, qui ignore la Row Level Security ;
--   - le comportement fonctionnel ne change pas : délier puis supprimer, DANS LA MÊME
--     TRANSACTION, fonctionne toujours (C55 et C56), et l'action déliée reste au plan
--     d'actions comme le §8 le promettait (C57) ;
--   - le socle ne devient pas immuable pour autant : un contrôle que personne n'utilise
--     se supprime (C58).
-- =====================================================================================

\echo
\echo '§6 quater — Le catalogue de mesures : « restrict » sur les quatre références'

do $$
declare
    v_cas constant text[] := array[
        'C51', 'Supprimer un contrôle du socle MIS EN OEUVRE par une autre filiale',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'delete from mesure_catalogue where id = ''MESURE-DEMO-G2''',
               '23503',
        'C52', 'Supprimer un contrôle du socle lié à une ÉVALUATION d''une autre filiale',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'delete from mesure_catalogue where id = ''MESURE-DEMO-G3''',
               '23503',
        'C53', 'Supprimer un contrôle du socle lié à un TRAITEMENT RGPD d''une autre filiale',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'delete from mesure_catalogue where id = ''MESURE-DEMO-G4''',
               '23503',
        'C54', 'Supprimer un contrôle du socle porté par une ACTION d''une autre filiale',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'delete from mesure_catalogue where id = ''MESURE-DEMO-G5''',
               '23503',
        -- Cas 1 du tableau du §17.6 : la mesure LOCALE de Toulouse. Son rayon n'a de toute
        -- façon jamais quitté sa filiale — f_coherence_mesure_catalogue() (004 §2) interdit
        -- à toute autre de la citer, ce que le C14 a déjà établi.
        'C55', 'Supprimer SA mesure locale sans l''avoir déliée',
               'delete from mesure_catalogue where id = ''MESURE-DEMO-A''',
               '23503',
        'C56', 'La délier PUIS la supprimer, dans la MÊME transaction (contrôle symétrique)',
               'delete from mesure_mise_en_oeuvre where mesure_id = ''MESURE-DEMO-A'';'
               || 'update actions set mesure_id = null where mesure_id = ''MESURE-DEMO-A'';'
               || 'delete from mesure_catalogue where id = ''MESURE-DEMO-A''',
               'AUCUN REFUS',
        'C58', 'Supprimer un contrôle du socle que PERSONNE n''utilise (contrôle symétrique)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'delete from mesure_catalogue where id = ''MESURE-DEMO-G6''',
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
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end)))::text, true);
        i := i + 4;
    end loop;
end;
$$;

-- --- l'action déliée est-elle restée au plan d'actions ? -------------------------------
-- La promesse du §8 (« conserve les actions ») est tenue : ce qui a changé, c'est QUI la
-- délie — la couche applicative, dans la filiale concernée, et non plus une cascade
-- déclenchée depuis le Groupe sur vingt filiales à la fois.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C57', 'L''action déliée reste au plan d''actions (promesse du §8, tenue)',
               '1', count(*)::text, case when count(*) = 1 then 'OK' else 'ÉCHEC' end
          from actions where id = 'ACT-DEMO-A' and mesure_id is null
      ) as x (numero, controle, attendu, obtenu, verdict);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- --- le balayage : aucune référence au catalogue n'est en cascade ni en « set null » ----
-- Les sept cas ci-dessus prouvent l'état d'aujourd'hui ; celui-ci protège de demain. Une
-- cinquième table qui référencerait mesure_catalogue en cascade — ou un retour au
-- « set null » du §8 — fera échouer ce contrôle sans que personne n'ait à y penser.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C59',
               format('Références à mesure_catalogue qui ne sont pas en « restrict » (%s balayées)',
                      count(*)),
               '0',
               coalesce(string_agg(con.conname::text, ', ' order by con.conname)
                        filter (where con.confdeltype <> 'r'), '0'),
               case when count(*) filter (where con.confdeltype <> 'r') = 0 then 'OK' else 'ÉCHEC' end
          from pg_constraint con
         where con.contype = 'f' and con.confrelid = 'mesure_catalogue'::regclass
      ) as x (numero, controle, attendu, obtenu, verdict);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
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
        '42501', v_obtenu, case when v_obtenu = '42501' then 'OK' else 'ÉCHEC' end)))::text, true);
end;
$$;

-- =====================================================================================
-- §8 ter — LA FILIALE D'ÉCRITURE APPARTIENT AU PÉRIMÈTRE DE LECTURE
-- -------------------------------------------------------------------------------------
-- Constat BLOQUANT N-1 du SECOND passage de la porte de sécurité S1. « grc.filiale_id »
-- et « grc.filiales » étaient deux réglages INDÉPENDANTS : rien, dans la base, ne
-- vérifiait que la filiale d'écriture appartenait au périmètre de lecture. Une session
-- déclarant un périmètre FIL-DEMO-A et une filiale active FIL-DEMO-B écrivait donc chez
-- B — une filiale qu'elle ne lisait même pas. Le contrôle existait, une seule fois, dans
-- le TypeScript ; or la Row Level Security est le filet SOUS le code, pas sa doublure.
--
-- LE CAS QUI MANQUAIT N'ÉTAIT PAS CELUI QU'ON CROYAIT. Le contrôle C18 éprouve « filiale
-- LUE mais non active » depuis le premier passage. Le cas ouvert était « filiale NI lue
-- NI active », et personne ne l'avait joué. Les deux figurent désormais côte à côte, et
-- ils ne rendent PAS le même code — 42501 pour la politique, GRC04 pour la fonction :
-- c'est la preuve que ce sont deux mécanismes distincts, et que le second n'était pas
-- couvert par le premier.
-- =====================================================================================

\echo
\echo '§8 ter — Écrire dans une filiale que l''on ne lit même pas'

do $$
declare
    v_cas constant text[] := array[
        'C60', 'Écrire un risque dans une filiale NI lue NI active',
               'select set_config(''grc.filiale_id'', ''FIL-DEMO-B'', true);'
               || 'insert into risques (id, filiale_id, nom) values (''RISK-DEMO-HORS'', ''FIL-DEMO-B'', ''hors périmètre'')',
               'GRC04',
        'C61', 'Forger une entrée de JOURNAL dans une filiale NI lue NI active',
               'select set_config(''grc.filiale_id'', ''FIL-DEMO-B'', true);'
               || 'insert into journal_audit (filiale_id, utilisateur_libelle, action, resume)'
               || ' values (''FIL-DEMO-B'', ''bruno'', ''suppression'', ''FAUSSE PREUVE scellée'')',
               'GRC04',
        'C62', 'Écrire chez SOI après avoir déclaré une autre filiale active',
               'select set_config(''grc.filiale_id'', ''FIL-DEMO-B'', true);'
               || 'insert into risques (id, filiale_id, nom) values (''RISK-DEMO-Z'', ''FIL-DEMO-A'', ''chez soi'')',
               'GRC04',
        'C63', 'Périmètre de lecture VIDE et filiale active posée',
               'select set_config(''grc.filiales'', '''', true);'
               || 'insert into risques (id, filiale_id, nom) values (''RISK-DEMO-W'', ''FIL-DEMO-A'', ''essai'')',
               'GRC04',
        'C64', 'Écrire dans la filiale active, celle-ci étant DANS le périmètre (symétrique)',
               'insert into risques (id, filiale_id, nom) values (''RISK-DEMO-OK2'', ''FIL-DEMO-A'', ''légitime'')',
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
        -- Les DEUX réglages sont rétablis : le C63 retire volontairement le périmètre.
        perform set_config('grc.filiales',   'FIL-DEMO-A', true);
        perform set_config('grc.filiale_id', 'FIL-DEMO-A', true);
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
            v_cas[i], v_cas[i + 1], v_cas[i + 3], v_obtenu,
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end)))::text, true);
        i := i + 4;
    end loop;
end;
$$;

-- --- le balayage : toute politique d'écriture passe-t-elle par f_filiale_ecriture ? ----
-- Le correctif tient dans une fonction ; ce qui le rend général, c'est que toutes les
-- politiques d'écriture des tables cloisonnées l'appellent. Une politique future qui
-- filtrerait « à la main » sur filiale_id rouvrirait le chemin pour sa table.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C65',
               format('Politiques d''écriture cloisonnées ne passant pas par f_filiale_ecriture (%s balayées)',
                      count(*)),
               '0',
               coalesce(string_agg(c.relname || '.' || p.polname, ', ')
                        filter (where coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                                               pg_get_expr(p.polqual, p.polrelid), '') !~ 'f_filiale_ecriture'),
                        '0'),
               case when count(*) filter (
                        where coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                                       pg_get_expr(p.polqual, p.polrelid), '') !~ 'f_filiale_ecriture') = 0
                    then 'OK' else 'ÉCHEC' end
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
         where n.nspname = 'public' and p.polpermissive
           and a.attnotnull and a.attnum > 0 and not a.attisdropped
           and p.polcmd in ('a', 'w', 'd', '*')
           -- Dérogation arbitrée : session_filiales PRODUIT le périmètre, elle ne peut
           -- pas s'y adosser (004_rls.sql §6).
           and c.relname <> 'session_filiales'
      ) as x (numero, controle, attendu, obtenu, verdict);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- =====================================================================================
-- §8 quater — LA TABLE « filiales », LE CYCLE DE VIE DU CATALOGUE, L'ACTEUR DU JOURNAL
-- -------------------------------------------------------------------------------------
-- Trois constats du second passage, regroupés parce qu'ils partagent leur mise en place.
--
--   N-2 — « filiales » était réinscriptible sans condition par n'importe quelle filiale :
--         renommer, archiver, créer, supprimer les autres. C'est pourtant la table qui
--         DÉFINIT la frontière du cloisonnement, et elle échappait par construction au
--         balayage de f_verifier_couverture_rls() faute de porter un filiale_id.
--   N-6 — le §17.6 promettait qu'un contrôle déjà évalué « s'archive » sans qu'aucune
--         colonne ne le permette : l'administration Groupe faisait face à un refus sans
--         issue.
--   N-5 — l'acteur inscrit au journal était fourni par le client : la seule table dont
--         l'objet EST de faire preuve était la seule à croire son appelant sur ce point.
-- =====================================================================================

\echo
\echo '§8 quater — filiales, cycle de vie du catalogue, acteur du journal'

do $$
declare
    v_cas constant text[] := array[
        -- N-2
        'C66', 'Créer une filiale sans être en administration Groupe',
               'insert into filiales (id, code, raison_sociale) values (''FIL-DEMO-PIRATE'', ''ZZPIR'', ''Créée par Toulouse'')',
               '42501',
        'C67', 'Créer une filiale EN administration Groupe (contrôle symétrique)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'insert into filiales (id, code, raison_sociale) values (''FIL-DEMO-C'', ''ZZDEMOE'', ''Démonstration Espagne'')',
               'AUCUN REFUS',
        'C68', 'Poser SA pièce jointe comme LOGO d''une autre filiale',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'update filiales set logo_piece_jointe_id = ''PJ-DEMO-A'' where id = ''FIL-DEMO-B''',
               '23503',
        'C69', 'Poser SA pièce jointe comme SON PROPRE logo (contrôle symétrique)',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'update filiales set logo_piece_jointe_id = ''PJ-DEMO-A'' where id = ''FIL-DEMO-A''',
               'AUCUN REFUS',
        -- N-6
        'C70', 'ARCHIVER un contrôle du socle que le « restrict » rend indestructible',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'update mesure_catalogue set statut = ''archivee'', archive_le = now()'
               || ' where id = ''MESURE-DEMO-G2''',
               'AUCUN REFUS',
        'C71', 'Archiver SANS date : l''état et sa date sont indissociables',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'update mesure_catalogue set statut = ''archivee'' where id = ''MESURE-DEMO-G3''',
               '23514',
        -- T-7 : l'action référentielle contourne la politique d'écriture de « filiales ».
        -- Le logo de FIL-DEMO-A vient d'être posé par le contrôle précédent ; supprimer le
        -- fichier incrémentait la version de la fiche, sans le drapeau d'administration.
        'C85', 'Supprimer la pièce jointe qui sert de LOGO à sa propre filiale',
               'delete from pieces_jointes where id = ''PJ-DEMO-A''',
               '23503',
        -- N-10
        'C72', 'Lien de portée GROUPE désignant un document LOCAL d''une autre filiale',
               'select set_config(''grc.administration_groupe'', ''oui'', true);'
               || 'insert into document_referentiels (document_id, ref_id, filiale_id)'
               || ' values (''DOC-DEMO-B'', ''anssi'', null)',
               '23503'
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
        perform set_config('grc.filiale_id', 'FIL-DEMO-A', true);
        perform set_config('grc.administration_groupe', '', true);
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
            v_cas[i], v_cas[i + 1], v_cas[i + 3], v_obtenu,
            case when v_obtenu = v_cas[i + 3] then 'OK' else 'ÉCHEC' end)))::text, true);
        i := i + 4;
    end loop;
end;
$$;

-- --- N-2 : la fiche de l'autre filiale est-elle RESTÉE INTACTE ? ------------------------
-- Le contrôle qui donne son sens aux précédents, et il se mesure autrement : le refus
-- d'un « update » par le « using » d'une politique est SILENCIEUX (zéro ligne), pas
-- bruyant. C'est l'observation O-2 du premier rapport, reportée au lot L2 — l'API devra
-- distinguer « refusé » de « conflit de version ». Ici, ce qui compte est l'état de la
-- ligne : ni sa raison sociale, ni sa version, ni son « modifie_par » ne doivent bouger.
do $$
declare
    v_affectees int;
    v_etat      record;
begin
    update filiales set raison_sociale = 'Détournée par Toulouse' where id = 'FIL-DEMO-B';
    get diagnostics v_affectees = row_count;

    perform set_config('grc.filiales', 'FIL-DEMO-A,FIL-DEMO-B', true);
    select f.raison_sociale, f.version, coalesce(f.modifie_par, '(intact)') as modifie_par
      into v_etat from filiales f where f.id = 'FIL-DEMO-B';
    perform set_config('grc.filiales', 'FIL-DEMO-A', true);

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C73', 'La fiche de la filiale allemande est intacte après la tentative de Toulouse',
        '0 ligne / Démonstration Allemagne / v1 / (intact)',
        format('%s ligne / %s / v%s / %s', v_affectees, v_etat.raison_sociale,
               v_etat.version, v_etat.modifie_par),
        case when v_affectees = 0
              and v_etat.raison_sociale = 'Démonstration Allemagne'
              and v_etat.version = 1
              and v_etat.modifie_par = '(intact)'
             then 'OK' else 'ÉCHEC' end)))::text, true);
end;
$$;

-- --- N-6 : la mesure archivée reste LISIBLE et reste RATTACHÉE ------------------------
-- C'est tout le point de l'archivage : la preuve historique survit. Une évaluation d'il y
-- a deux ans continue de désigner le contrôle qu'elle visait.
do $$
declare v_ligne jsonb;
begin
    -- La mise en oeuvre qui rattache cette mesure appartient à l'ALLEMAGNE : invisible de
    -- Toulouse. Un comptage à zéro depuis Toulouse ne prouverait rien — le périmètre est
    -- donc élargi le temps du constat, puis refermé.
    perform set_config('grc.filiales', 'FIL-DEMO-A,FIL-DEMO-B', true);
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C74',
               'La mesure archivée reste lisible ET reste rattachée à ce qui la référence',
               'archivee / datée / 1 rattachement',
               format('%s / %s / %s rattachement',
                      m.statut,
                      case when m.archive_le is not null then 'datée' else 'SANS DATE' end,
                      (select count(*) from mesure_mise_en_oeuvre o where o.mesure_id = m.id)),
               case when m.statut = 'archivee' and m.archive_le is not null
                     and (select count(*) from mesure_mise_en_oeuvre o where o.mesure_id = m.id) = 1
                    then 'OK' else 'ÉCHEC' end
          from mesure_catalogue m where m.id = 'MESURE-DEMO-G2'
      ) as x (numero, controle, attendu, obtenu, verdict);
    perform set_config('grc.filiales', 'FIL-DEMO-A', true);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- --- N-5 : l'acteur du journal vient de la session, le libellé du client ---------------
do $$
declare v_ligne jsonb;
begin
    perform set_config('grc.administration_groupe', 'oui', true);
    insert into utilisateurs (id, identifiant, nom_affichage)
    values ('demonstration', 'demonstration', 'Compte de démonstration')
    on conflict (id) do nothing;
    perform set_config('grc.administration_groupe', '', true);

    -- L'entrée est posée dans son propre bloc : si le déclencheur ne réécrivait PAS
    -- l'acteur, la valeur forgée « USR-USURPE » violerait la clé étrangère vers
    -- utilisateurs et ferait échouer l'instruction. Le contrôle doit alors rendre un
    -- verdict, pas interrompre la démonstration.
    begin
        insert into journal_audit (filiale_id, utilisateur_id, utilisateur_libelle, action, resume)
        values ('FIL-DEMO-A', 'USR-USURPE', 'bruno', 'creation', 'acteur declare par le client');
    exception when others then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
            'C75', 'Journal : l''acteur vient de la SESSION, le libellé reste celui du client',
            'demonstration / bruno',
            format('l''acteur fourni par le client a été CONSERVÉ (%s)', sqlstate),
            'ÉCHEC')))::text, true);
        return;
    end;

    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C75',
               'Journal : l''acteur vient de la SESSION, le libellé reste celui du client',
               'demonstration / bruno',
               coalesce(j.utilisateur_id, '(nul)') || ' / ' || coalesce(j.utilisateur_libelle, '(nul)'),
               case when j.utilisateur_id = 'demonstration' and j.utilisateur_libelle = 'bruno'
                    then 'OK' else 'ÉCHEC' end
          from journal_audit j where j.resume = 'acteur declare par le client'
      ) as x (numero, controle, attendu, obtenu, verdict);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- --- N-11 : les neuf déclencheurs de cohérence et de portée sont armés en « always » ----
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C76',
               format('Déclencheurs de cohérence et de portée armés en « always » (%s balayés)',
                      count(*)),
               '9 sur 9',
               format('%s sur %s', count(*) filter (where t.tgenabled = 'A'), count(*)),
               case when count(*) = 9 and count(*) filter (where t.tgenabled = 'A') = 9
                    then 'OK' else 'ÉCHEC' end
          from pg_trigger t
         where not t.tgisinternal
           and (t.tgname::text like '%\_coherence\_mesure' or t.tgname::text like '%\_portee\_figee')
      ) as x (numero, controle, attendu, obtenu, verdict);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- =====================================================================================
-- §8 quinquies — LA TRAÇABILITÉ, LES ACTIONS RÉFÉRENTIELLES, ET LES GARDE-FOUS BRANCHÉS
-- -------------------------------------------------------------------------------------
-- Quatre constats du TROISIÈME passage de la porte S1. Aucun ne porte sur le cloisonnement
-- — ce passage est le premier à n'y trouver aucun défaut — mais le premier met en échec le
-- contrôle S4 de la grille.
--
--   T-1 — À l'INSERTION, le client fixait lui-même version, cree_par et cree_le. Les deux
--         audits précédents avaient éprouvé l'« update » de fond en comble et jamais
--         l'« insert », où aucun déclencheur n'intervenait. Et f_maj_tracabilite() GELANT
--         ensuite cree_le / cree_par, la forgerie devenait définitive : le mécanisme qui
--         protège la vérité protégeait le mensonge.
--   T-2 — personnes.utilisateur_id était en « on delete set null » : supprimer un compte
--         réécrivait les fiches d'annuaire de TOUTES les filiales, y compris invisibles.
--   T-3 — l'acteur du journal était résolu sur la clé primaire alors que grc.utilisateur
--         porte un LOGIN : le jour où L3 y met un vrai login, toutes les entrées basculent
--         en silence sur la branche « acteur inconnu ».
--   T-4 — le garde-fou de couverture RLS n'était appelé que par la migration 004, qui n'est
--         pas rejouée sur une base à jour : il ne s'exécutait plus jamais.
-- =====================================================================================

\echo
\echo '§8 quinquies — Traçabilité d''insertion, actions référentielles, garde-fous branchés'

-- --- T-1 : ce que le client envoie à la création est ignoré ---------------------------
do $$
declare
    v_ligne  jsonb;
    v_refus  text := 'AUCUN REFUS';
begin
    -- Ignoré, JAMAIS refusé : un export grc-backup porte ces colonnes, et la reprise ne
    -- doit pas échouer pour autant (CONVENTIONS.md §18.1).
    begin
        insert into risques (id, filiale_id, nom, version, cree_par, cree_le,
                             modifie_par, modifie_le)
        values ('RISK-DEMO-USURPE', 'FIL-DEMO-A', 'Risque accepté par la direction', 42,
                'marc.dupuis (DG)', '2024-01-15', 'marc.dupuis (DG)', '2024-01-15');
    exception when others then
        v_refus := sqlstate;
    end;

    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C77',
               'Création : version, cree_par et cree_le fournis par le client sont IGNORÉS',
               'v1 / demonstration / aujourd''hui / non modifié',
               case when v_refus <> 'AUCUN REFUS' then 'REFUSÉE (' || v_refus || ')'
                    else format('v%s / %s / %s / %s', r.version, r.cree_par,
                                case when r.cree_le::date = current_date then 'aujourd''hui'
                                     else r.cree_le::date::text end,
                                case when r.modifie_par is null then 'non modifié'
                                     else 'modifie_par = ' || r.modifie_par end)
               end,
               case when v_refus = 'AUCUN REFUS' and r.version = 1
                     and r.cree_par = 'demonstration' and r.cree_le::date = current_date
                     and r.modifie_par is null and r.modifie_le is null
                    then 'OK' else 'ÉCHEC' end
          from risques r where r.id = 'RISK-DEMO-USURPE'
      ) as x (numero, controle, attendu, obtenu, verdict);

    if v_ligne is null then
        v_ligne := jsonb_build_array('C77',
            'Création : version, cree_par et cree_le fournis par le client sont IGNORÉS',
            'v1 / demonstration / aujourd''hui / non modifié',
            'la ligne n''a pas été créée (' || v_refus || ')', 'ÉCHEC');
    end if;
    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
end;
$$;

-- --- T-1 : la ligne définitivement immodifiable n'existe plus --------------------------
do $$
declare
    v_nee    integer;
    v_apres  integer;
    v_obtenu text;
begin
    insert into risques (id, filiale_id, nom, version)
    values ('RISK-DEMO-GEL', 'FIL-DEMO-A', 'Risque gelé', 2147483647);
    select version into v_nee from risques where id = 'RISK-DEMO-GEL';

    begin
        update risques set nom = 'modifié' where id = 'RISK-DEMO-GEL';
        select version into v_apres from risques where id = 'RISK-DEMO-GEL';
        v_obtenu := format('naît en v%s, se modifie en v%s', v_nee, v_apres);
    exception when others then
        v_obtenu := format('naît en v%s puis %s — ligne immodifiable', v_nee, sqlstate);
    end;

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(jsonb_build_array(
        'C78', 'Créer une ligne avec version = 2147483647 ne la rend plus immodifiable',
        'naît en v1, se modifie en v2', v_obtenu,
        case when v_obtenu = 'naît en v1, se modifie en v2' then 'OK' else 'ÉCHEC' end)))::text, true);
end;
$$;

-- --- T-1 : le balayage — toute table portant « cree_par » a son déclencheur ------------
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C79',
               format('Tables portant « cree_par » dont la création n''est pas tracée (%s balayées)',
                      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind in ('r', 'p')
                          and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                       and a.attname = 'cree_par' and a.attnum > 0
                                       and not a.attisdropped))),
               '0',
               coalesce(string_agg(v.objet || ' (' || v.anomalie || ')', ', ' order by v.objet), '0'),
               case when count(*) = 0 then 'OK' else 'ÉCHEC' end
          from f_verifier_tracabilite() v
      ) as x (numero, controle, attendu, obtenu, verdict);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- --- T-2 : supprimer un compte ne réécrit aucune fiche d'annuaire ----------------------
do $$
declare
    v_obtenu text;
    v_etat   text;
begin
    perform set_config('grc.filiales', 'FIL-DEMO-A,FIL-DEMO-B', true);
    perform set_config('grc.administration_groupe', 'oui', true);
    insert into utilisateurs (id, identifiant, nom_affichage)
    values ('USR-DEMO-1', 'login-demo', 'Compte de démonstration');
    perform set_config('grc.administration_groupe', '', true);

    -- Une fiche d'annuaire de chaque côté, rattachée au même compte.
    insert into personnes (id, filiale_id, nom, utilisateur_id)
    values ('PERS-DEMO-LA', 'FIL-DEMO-A', 'Responsable TLS', 'USR-DEMO-1');
    perform set_config('grc.filiale_id', 'FIL-DEMO-B', true);
    insert into personnes (id, filiale_id, nom, utilisateur_id)
    values ('PERS-DEMO-LB', 'FIL-DEMO-B', 'Verantwortlicher DEU', 'USR-DEMO-1');

    -- Puis une session de la seule Toulouse, en administration Groupe, qui ne voit pas
    -- la fiche allemande et tente la suppression du compte.
    perform set_config('grc.filiales', 'FIL-DEMO-A', true);
    perform set_config('grc.filiale_id', 'FIL-DEMO-A', true);
    perform set_config('grc.administration_groupe', 'oui', true);
    begin
        delete from utilisateurs where id = 'USR-DEMO-1';
        v_obtenu := 'AUCUN REFUS';
    exception when others then
        v_obtenu := sqlstate || ' / ' || split_part(sqlerrm, '"', 4);
    end;
    perform set_config('grc.administration_groupe', '', true);

    perform set_config('grc.filiales', 'FIL-DEMO-A,FIL-DEMO-B', true);
    select format('%s / v%s / %s', coalesce(p.utilisateur_id, '(délié)'), p.version,
                  coalesce(p.modifie_par, 'intact'))
      into v_etat from personnes p where p.id = 'PERS-DEMO-LB';
    perform set_config('grc.filiales', 'FIL-DEMO-A', true);

    perform set_config('demo.resultats',
        (current_setting('demo.resultats')::jsonb || jsonb_build_array(
            jsonb_build_array(
                'C80', 'Supprimer un compte lié à une fiche d''annuaire d''une autre filiale',
                '23503 / fk_personnes_utilisateur', v_obtenu,
                case when v_obtenu = '23503 / fk_personnes_utilisateur' then 'OK' else 'ÉCHEC' end),
            jsonb_build_array(
                'C81', 'La fiche d''annuaire de l''Allemagne est restée intacte',
                'USR-DEMO-1 / v1 / intact', v_etat,
                case when v_etat = 'USR-DEMO-1 / v1 / intact' then 'OK' else 'ÉCHEC' end)
        ))::text, true);
end;
$$;

-- --- T-2 : le balayage des ACTIONS référentielles --------------------------------------
-- Le §17.1 avait fait balayer les CLÉS étrangères, jamais les ACTIONS. C'est ce balayage
-- qui empêche T-2 de revenir au prochain ajout d'entité.
do $$
declare v_ligne jsonb;
begin
    with niveau as (
        select c.oid, c.relname::text as nom,
               exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'filiale_id' and a.attnum > 0 and not a.attisdropped) as cloisonnee
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p'))
    select jsonb_build_array('C82',
               format('Actions référentielles filiale -> Groupe non bornées (%s clés balayées)',
                      count(*)),
               '0',
               coalesce(string_agg(k.conname::text, ', ' order by k.conname)
                        filter (where k.confdeltype not in ('a', 'r')), '0'),
               case when count(*) filter (where k.confdeltype not in ('a', 'r')) = 0
                    then 'OK' else 'ÉCHEC' end)
      into v_ligne
      from pg_constraint k
      join niveau e on e.oid = k.conrelid
      join niveau p on p.oid = k.confrelid
     where k.contype = 'f' and e.cloisonnee and not p.cloisonnee
       -- Dérogation arbitrée, et la seule : session_filiales n'est pas une table métier.
       -- Ses lignes sont l'état d'une session et doivent mourir avec elle (004 §6).
       and e.nom <> 'session_filiales';

    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- --- T-3 : l'acteur du journal est résolu sur le LOGIN, pas sur la clé primaire --------
-- Le contrôle C75 provisionnait un compte dont l'identifiant ÉTAIT la clé primaire : il
-- validait une coïncidence, pas une propriété. Celui-ci prend le cas de production.
do $$
declare v_ligne jsonb;
begin
    perform set_config('grc.administration_groupe', 'oui', true);
    insert into utilisateurs (id, identifiant, nom_affichage)
    values ('USR-1720000000000-482', 'jdupont', 'Jean Dupont');
    perform set_config('grc.administration_groupe', '', true);
    perform set_config('grc.utilisateur', 'jdupont', true);

    insert into journal_audit (filiale_id, utilisateur_id, utilisateur_libelle, action, resume)
    values ('FIL-DEMO-A', 'USR-USURPE', 'bruno', 'creation', 'acteur resolu sur le login');

    select jsonb_build_array('C83',
               'Journal : le LOGIN de session est résolu vers la clé du compte (id <> identifiant)',
               'USR-1720000000000-482 / bruno',
               coalesce(j.utilisateur_id, '(NUL)') || ' / ' || coalesce(j.utilisateur_libelle, '(nul)'),
               case when j.utilisateur_id = 'USR-1720000000000-482'
                     and j.utilisateur_libelle = 'bruno'
                    then 'OK' else 'ÉCHEC' end)
      into v_ligne
      from journal_audit j where j.resume = 'acteur resolu sur le login';

    perform set_config('grc.utilisateur', 'demonstration', true);
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- --- T-4 : le garde-fou de schéma est branché, et il ne signale rien -------------------
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array('C84',
               'Anomalies du point d''appel unique f_verifier_schema() (chemin, traçabilité, RLS)',
               '0',
               coalesce(string_agg(format('[%s] %s : %s', v.controle, v.objet, v.anomalie), ', '
                                   order by v.controle, v.objet), '0'),
               case when count(*) = 0 then 'OK' else 'ÉCHEC' end)
      into v_ligne
      from f_verifier_schema() v;
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
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

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C23', 'grc_app : ni SUPERUSER ni BYPASSRLS',
               'non / non',
               case when r.rolsuper then 'SUPERUSER ' else 'non ' end
               || case when r.rolbypassrls then '/ BYPASSRLS' else '/ non' end,
               case when not r.rolsuper and not r.rolbypassrls then 'OK' else 'ÉCHEC' end
          from pg_roles r where r.rolname = 'grc_app'
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C24', 'grc_app ne possède aucune table du schéma public', '0', count(*)::text,
               case when count(*) = 0 then 'OK' else 'ÉCHEC' end
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_roles r     on r.oid = c.relowner
         where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and r.rolname = 'grc_app'
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
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
         where exists (select 1 from pg_roles where rolname = 'grc_app')
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
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
         where exists (select 1 from pg_roles where rolname = 'grc_app')
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- =====================================================================================
-- §10 — COUVERTURE
-- =====================================================================================

\echo
\echo '§10 — Couverture : toutes les tables sous « enable » ET « force row level security »'

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        -- « r » ET « p » : une table partitionnée est une table (constat T-11).
        select 'C27', 'Tables du schéma public sans RLS active et forcée', '0', count(*)::text,
               case when count(*) = 0 then 'OK' else 'ÉCHEC' end
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and not (c.relrowsecurity and c.relforcerowsecurity)
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C28', 'Anomalies de f_verifier_couverture_rls()', '0', count(*)::text,
               case when count(*) = 0 then 'OK' else 'ÉCHEC' end
          from f_verifier_couverture_rls()
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- Constat M-1 : une fonction dont le chemin de recherche n'est pas figé est détournable
-- par masquage pg_temp — le rôle applicatif substitue sa propre table à une table du
-- schéma, et la fonction qui la lit travaille sur les données de l'attaquant. Le réglage
-- doit NOMMER pg_temp, et en dernier : non nommé, il est consulté en PREMIER.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array(x.numero, x.controle, x.attendu, x.obtenu, x.verdict)
      into v_ligne
      from (
        select 'C50', 'Fonctions dont le chemin de recherche n''est pas figé (pg_temp compris)',
               '0', count(*)::text, case when count(*) = 0 then 'OK' else 'ÉCHEC' end
          from f_verifier_chemin_recherche()
      ) as x (numero, controle, attendu, obtenu, verdict);
    -- Aucune ligne : le contrôle ne s'applique pas (rôle absent de cette base).
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

select count(*) filter (where relrowsecurity)        as "RLS active",
       count(*) filter (where relforcerowsecurity)   as "RLS forcée",
       count(*)                                      as "tables",
       (select count(*) from pg_policies where schemaname = 'public') as "politiques"
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';

-- --- T-10 : pg_temp nommé EN DERNIER sur chaque fonction, constaté directement ---------
-- Le contrôle C50 s'en remet à f_verifier_chemin_recherche(). Celui-ci constate la
-- PROPRIÉTÉ elle-même, sans passer par le garde-fou : un garde-fou qui se vérifierait par
-- lui-même ne prouverait rien (§17.5). Il ne peut pas, en revanche, éprouver le garde-fou
-- — la démonstration tourne sous un rôle qui ne crée aucun objet ; c'est le banc d'essai
-- qui s'en charge.
do $$
declare v_ligne jsonb;
begin
    select jsonb_build_array('C86',
               format('Fonctions et procédures dont le chemin ne finit pas par pg_temp (%s balayées)',
                      count(*)),
               '0',
               coalesce(string_agg(p.proname::text, ', ' order by p.proname)
                        filter (where coalesce(
                            btrim(split_part(
                                (select c from unnest(coalesce(p.proconfig, array[]::text[])) as c
                                  where c like 'search_path=%' limit 1),
                                ',',
                                array_length(string_to_array(
                                    (select c from unnest(coalesce(p.proconfig, array[]::text[])) as c
                                      where c like 'search_path=%' limit 1), ','), 1))),
                            '(aucun)') <> 'pg_temp'), '0'),
               case when count(*) filter (where coalesce(
                            btrim(split_part(
                                (select c from unnest(coalesce(p.proconfig, array[]::text[])) as c
                                  where c like 'search_path=%' limit 1),
                                ',',
                                array_length(string_to_array(
                                    (select c from unnest(coalesce(p.proconfig, array[]::text[])) as c
                                      where c like 'search_path=%' limit 1), ','), 1))),
                            '(aucun)') <> 'pg_temp') = 0
                    then 'OK' else 'ÉCHEC' end)
      into v_ligne
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p');
    if v_ligne is not null then
        perform set_config('demo.resultats',
            (current_setting('demo.resultats')::jsonb || jsonb_build_array(v_ligne))::text, true);
    end if;
end;
$$;

-- =====================================================================================
-- VERDICT
-- =====================================================================================

\echo
\echo '====================================================================================='
\echo ' VERDICT'
\echo '====================================================================================='

select r ->> 0 as "n°", r ->> 1 as "contrôle", r ->> 2 as "attendu",
       r ->> 3 as "obtenu", r ->> 4 as "verdict"
  from jsonb_array_elements(current_setting('demo.resultats')::jsonb) as r
 order by 1;

select count(*)                                              as "contrôles",
       count(*) filter (where r ->> 4 like 'OK%')            as "réussis",
       count(*) filter (where r ->> 4 = 'ÉCHEC')             as "échoués"
  from jsonb_array_elements(current_setting('demo.resultats')::jsonb) as r;

do $$
declare
    v_echecs text;
    v_nombre int;
begin
    select string_agg(format('  %s — %s (attendu %s, obtenu %s)',
                             r ->> 0, r ->> 1, r ->> 2, r ->> 3), E'\n' order by r ->> 0),
           count(*)
      into v_echecs, v_nombre
      from jsonb_array_elements(current_setting('demo.resultats')::jsonb) as r
     where r ->> 4 = 'ÉCHEC';

    if v_nombre > 0 then
        raise exception E'CLOISONNEMENT EN DÉFAUT — % contrôle(s) en échec :\n%', v_nombre, v_echecs
            using hint = 'Un seul de ces contrôles suffit à rendre le cloisonnement '
                         'non démontrable en audit. Ne pas mettre en service.';
    end if;

    raise notice
        'CLOISONNEMENT DÉMONTRÉ — AVEC LA RÉSERVE DU CONTRÔLE C22, À LIRE AVANT LE RESTE : '
        'la LECTURE du journal d''audit n''est PAS cloisonnée, et c''est une dérogation assumée '
        'que le chaînage par empreinte impose (004_rls.sql §6). Elle est sans effet tant que le '
        'journal est vide ; dès que le lot L5 alimentera valeurs_avant / valeurs_apres, une '
        'session de Toulouse y lira le contenu des données allemandes — et le compte de '
        'supervision grc_lecture aussi, sans passer par l''application. Le resserrement est un '
        'livrable ferme de L5. Sous cette réserve, et elle seule : '
        'la filiale de Toulouse ne voit aucune ligne de la filiale '
        'allemande ; ne peut pas y écrire — ni depuis un périmètre qui la couvre, ni en '
        'déclarant une filiale active qu''elle ne lit même pas, la base recoupant les deux '
        'réglages elle-même ; ne peut créer vers elle NI lien de liaison NI clé étrangère '
        'directe (les sept du constat B-1, plus le balayage du catalogue) ; ne peut pas mettre '
        'en oeuvre ses mesures locales ; ne peut ni s''approprier ni détruire le socle commun '
        'du Groupe — un contrôle qu''une filiale a déjà évalué ne disparaît pas, il s''archive, '
        'et l''archivage existe ; ne peut pas modifier la fiche d''une autre filiale, ni lui '
        'poser son propre logo ; et ne peut pas fabriquer d''entrée dans le journal d''une '
        'autre, ni y déclarer un acteur qui n''est pas elle ; ne peut pas antidater ni signer '
        'du nom d''un autre les lignes qu''elle crée ; et ne peut pas, en supprimant un compte, '
        'réécrire les fiches d''annuaire des filiales qu''elle ne lit pas.';
end;
$$;

-- =====================================================================================
-- NETTOYAGE — tout ce que ce script a écrit disparaît ici.
-- =====================================================================================
rollback;

\echo
\echo 'Transaction annulée : les deux filiales de démonstration et leurs données ont disparu.'
\echo
