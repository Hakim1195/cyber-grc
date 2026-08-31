-- =====================================================================================
-- 004_rls.sql — Cloisonnement par filiale : privilèges et Row Level Security
-- =====================================================================================
-- Lot L1 (schéma relationnel), partie 4/4 : la pièce qui permet d'affirmer en audit
-- ISO 27001, et de DÉMONTRER, que la filiale de Toulouse ne peut techniquement pas lire
-- les données de la filiale allemande (PLAN_SERVEUR §2.4).
--
-- Référence de cadrage : docs/PLAN_SERVEUR.md §1.9 (durcissement), §2.4 (cloisonnement
-- technique), §3 (modèle de droits). Conventions applicables : backend/db/CONVENTIONS.md
-- §4 (cloisonnement), §11 (RLS), §12 (journal), §14 (rôles), §15 (codes d'erreur),
-- §16 (découpage figé du lot L1).
--
-- Dépendances : 001_socle.sql, 002_metier_noyau.sql, 003_metier_operations.sql —
-- soit les 47 tables du schéma. Ce fichier ne crée aucune table et n'en modifie aucune :
-- il pose des privilèges, des politiques, deux déclencheurs de cohérence et un garde-fou.
--
-- Contenu :
--   §0  Gardes (version, migrations précédentes, attributs du rôle applicatif)
--   §1  Privilèges — retrait de ce qui est en trop
--   §2  Fonctions du cloisonnement (périmètre exigé, administration Groupe, cohérence)
--   §3  Famille 1 — 24 tables de niveau filiale
--   §4  Famille 2 — 5 tables mixtes (filiale_id nullable, null = portée Groupe)
--   §5  Famille 3 — 6 liaisons et tables filles SANS filiale_id
--   §6  Famille 4 — 12 tables de niveau Groupe et socle, dont journal_audit
--   §7  Déclencheurs de cohérence : catalogue de mesures ↔ filiale, portée figée des
--       tables mixtes (ce qu'aucune clé étrangère ni aucune politique ne tient)
--   §8  Garde-fou de couverture
--   §9  Enregistrement de la migration
--
-- -------------------------------------------------------------------------------------
-- LES QUATRE RÈGLES QUI GOUVERNENT TOUT CE FICHIER
--
--   1. « enable row level security » ET « force row level security » sur les 47 tables.
--      Sans le « force », le propriétaire des tables échappe aux politiques — et le
--      cloisonnement ne vaudrait plus que pour le rôle applicatif.
--
--   2. LECTURE et ÉCRITURE ne se filtrent pas sur la même chose (CONVENTIONS §11) :
--        - lecture  : filiale_id = any (f_filiales_lecture())   -- tout le périmètre
--        - écriture : filiale_id = f_filiale_ecriture()         -- la filiale ACTIVE
--      Un RSSI groupe LIT vingt filiales ; il n'ÉCRIT que dans celle qu'il a sélectionnée.
--
--   3. AUCUN RÉGLAGE DE SESSION N'ÉLARGIT JAMAIS LA LECTURE. Le seul réglage
--      d'administration introduit ici, « grc.administration_groupe », n'apparaît que dans
--      des politiques d'ÉCRITURE, et uniquement pour des lignes de portée Groupe
--      (filiale_id nul) — lignes déjà lisibles de tous. Le garde-fou du §8 vérifie
--      mécaniquement qu'aucune politique de lecture ne le mentionne.
--
--   4. « Je ne vois rien » et « le périmètre n'a pas été posé » sont deux états
--      différents, et un seul est un défaut :
--        - grc.filiales posé mais VIDE  -> périmètre vide, cas légitime des traitements
--          système (PERIMETRE_SYSTEME de src/db/pool.ts) : zéro ligne, en silence ;
--        - grc.filiales JAMAIS POSÉ     -> défaut de programmation : GRC04, bruyant ;
--        - écriture sans grc.filiale_id -> défaut de programmation : GRC04, bruyant,
--          car il n'existe aucune écriture légitime de donnée de filiale sans filiale
--          active. Un refus muet (« 0 ligne insérée ») serait très coûteux à diagnostiquer.
--
--      Une limite à connaître, propre au fonctionnement des réglages de PostgreSQL :
--      après un « commit », un réglage posé par set_config(…, true) ne redevient pas
--      ABSENT mais VIDE. Sur une connexion déjà employée — donc sur toute connexion
--      rendue à un pool — un périmètre de lecture oublié se lit alors comme un périmètre
--      vide : zéro ligne, silencieusement. Le garde bruyant de la LECTURE vaut donc sur
--      une connexion neuve (et sur psql, et sur les scripts d'exploitation) ; celui de
--      l'ÉCRITURE, lui, vaut TOUJOURS, y compris dans un pool — et c'est le cas dangereux,
--      puisqu'une écriture sans filiale active n'a, elle, aucune interprétation légitime.
--
-- -------------------------------------------------------------------------------------
-- CE QUE CE FICHIER NE PROTÈGE PAS, ET QUI DOIT ÊTRE DIT
--
--   - Ni « root » sur la VM, ni le propriétaire de la base : l'un comme l'autre peuvent
--     retirer le « force », désactiver un déclencheur ou lire les fichiers de données.
--     C'est la limite déjà assumée au CONVENTIONS §12, et elle vaut ici à l'identique.
--   - La sauvegarde logique. « force row level security » s'applique AUSSI à
--     grc_proprietaire : un « pg_dump » lancé sous ce compte échoue, et lancé avec
--     --enable-row-security il ne sauvegarderait QUE les lignes visibles — une sauvegarde
--     silencieusement partielle. Les sauvegardes se font sous un superutilisateur
--     (compte « postgres »), qui contourne la RLS par construction.
--   - Le contrôle des droits métier (profil, niveau, domaine, droit d'export) : il relève
--     du serveur, à chaque requête (PLAN_SERVEUR §1.9 et §3). La RLS répond à « quelles
--     lignes », jamais à « quelle personne a le droit de faire quoi ».
--
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 004_rls.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — GARDES
-- =====================================================================================

do $$
begin
    if current_setting('server_version_num')::integer < 150000 then
        raise exception
            'PostgreSQL 15 minimum requis, version trouvée : %. Voir backend/db/CONVENTIONS.md §1.',
            current_setting('server_version');
    end if;
end;
$$;

-- Les politiques ci-dessous nomment des colonnes de 47 tables : sans ce garde, l'échec
-- serait un « relation … does not exist » sans indication de la marche à suivre.
do $$
declare
    v_manquantes text;
begin
    select string_agg(t, ', ' order by t)
      into v_manquantes
      from unnest(array['filiales', 'journal_audit', 'exigences', 'mesure_catalogue',
                        'actions', 'history', 'mapping_exigences', 'traitement_mesures']) as t
     where to_regclass('public.' || t) is null;

    if v_manquantes is not null then
        raise exception
            'Migrations 001 à 003 non toutes appliquées : table(s) manquante(s) : %.', v_manquantes
            using hint = 'Ordre imposé : 001_socle.sql, 002_metier_noyau.sql, '
                         '003_metier_operations.sql, puis ce fichier. '
                         'Voir backend/db/CONVENTIONS.md §16.1.';
    end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Attributs du rôle applicatif. C'est le contrôle S1 de la grille de sécurité, et il
-- doit ARRÊTER la migration : poser des politiques au-dessus d'un rôle qui porte
-- BYPASSRLS reviendrait à installer une serrure sur une porte sans mur.
--
-- Si le rôle n'existe pas (poste de développement où db/dev/preparer_base_dev.sh n'a
-- pas été passé), le contrôle est sans objet et le dit : c'est la posture déjà retenue
-- par 001_socle.sql §0, qui reste jouable sans les rôles.
-- -------------------------------------------------------------------------------------
do $$
declare
    r          record;
    v_possede  text;
begin
    select rolsuper, rolbypassrls, rolreplication
      into r
      from pg_roles where rolname = 'grc_app';

    if not found then
        raise notice
            'Rôle grc_app absent : contrôle des attributs SANS OBJET sur cette base. '
            'Le cloisonnement n''est réellement éprouvé qu''avec les trois rôles du §14 '
            '(bash db/dev/preparer_base_dev.sh).';
        return;
    end if;

    if r.rolsuper or r.rolbypassrls then
        raise exception
            'Le rôle applicatif grc_app porte % : la Row Level Security posée par cette '
            'migration serait décorative.',
            case when r.rolsuper then 'SUPERUSER ' else '' end
            || case when r.rolbypassrls then 'BYPASSRLS' else '' end
            using errcode = '42501',
                  hint = 'Corrigez avant de rejouer : alter role grc_app nosuperuser nobypassrls;';
    end if;

    -- Couche 4 de la garantie d'ajout seul du journal (CONVENTIONS §12) : seul le
    -- propriétaire peut désactiver un déclencheur ou retirer le « force ».
    select string_agg(c.relname, ', ' order by c.relname)
      into v_possede
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles r2    on r2.oid = c.relowner
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and r2.rolname = 'grc_app';

    if v_possede is not null then
        raise exception
            'Le rôle applicatif grc_app possède des objets du schéma public (%). Il pourrait '
            'alors désactiver les déclencheurs et retirer « force row level security ».',
            v_possede
            using errcode = '42501',
                  hint = 'Ces objets doivent appartenir à grc_proprietaire : '
                         'alter table <table> owner to grc_proprietaire;';
    end if;

    raise notice 'grc_app : ni SUPERUSER, ni BYPASSRLS, propriétaire d''aucun objet — conforme.';
end;
$$;

-- =====================================================================================
-- §1 — PRIVILÈGES : RETIRER CE QUI EST EN TROP
-- -------------------------------------------------------------------------------------
-- Les « alter default privileges » de 001_socle.sql §0 ont accordé select / insert /
-- update / delete à grc_app sur toutes les tables créées ensuite. C'était le bon choix
-- par défaut — mais il a deux excès à corriger ici. Aucun « grant » n'est répété : ce
-- paragraphe ne fait que RETIRER, et vérifier.
--
--   1. migrations_schema — grc_app peut aujourd'hui « update migrations_schema set
--      empreinte = … ». Or cette empreinte est précisément le garde-fou qui détecte
--      la RÉÉCRITURE d'une migration déjà appliquée (db/migrate.mjs, code de sortie 4).
--      Un service compromis pourrait donc maquiller une migration falsifiée. Le
--      « select » suffit largement : le serveur n'a besoin que de contrôler la version
--      du schéma au démarrage. Le registre s'écrit sous le compte propriétaire, qui
--      seul applique les migrations.
--
--   2. journal_audit — 001 a déjà révoqué update / delete / truncate et accordé
--      select / insert (couche 1 du §12). Rien à refaire : on VÉRIFIE, et on échoue si
--      quelqu'un a rétabli ces privilèges entre-temps.
-- =====================================================================================

revoke insert, update, delete, truncate on migrations_schema from public;

do $$
declare
    v_trop text;
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'revoke insert, update, delete, truncate on migrations_schema from grc_app';

        select string_agg(p, ', ' order by p)
          into v_trop
          from unnest(array['update', 'delete', 'truncate']) as p
         where has_table_privilege('grc_app', 'journal_audit', p);

        if v_trop is not null then
            raise exception
                'grc_app dispose de % sur journal_audit : la couche 1 de l''ajout seul '
                '(CONVENTIONS §12) a été défaite.', v_trop
                using errcode = '42501',
                      hint = 'Rétablissez : revoke update, delete, truncate on journal_audit from grc_app;';
        end if;
    end if;

    -- grc_lecture n'est pas touché : il n'a que « select » (§14), et le registre des
    -- migrations n'a aucune raison de lui être fermé — il ne contient pas de donnée
    -- métier et sert au diagnostic d'exploitation.
end;
$$;

comment on table migrations_schema is
    'Registre des migrations appliquées. Une migration déjà enregistrée ne doit jamais être '
    'rejouée ni réécrite (CONVENTIONS.md §13). Le rôle applicatif n''y a que « select » '
    '(004_rls.sql §1) : pouvoir réécrire « empreinte » reviendrait à pouvoir maquiller la '
    'réécriture d''une migration déjà appliquée.';

-- =====================================================================================
-- §2 — FONCTIONS DU CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Les trois fonctions de contexte du socle (f_utilisateur_courant, f_filiale_courante,
-- f_filiales_autorisees) restent la seule source du périmètre et ne sont PAS redéfinies
-- ici (CONVENTIONS §10). Les fonctions ci-dessous s'y ajoutent, pour ce que le socle ne
-- pouvait pas exprimer avant que les politiques existent.
-- Toutes en « security invoker » (défaut) : aucune n'est un contournement de droits.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Périmètre de LECTURE, exigé.
--
-- Distingue les deux états que f_filiales_autorisees() confond volontairement, l'un
-- légitime et l'autre non :
--   - « grc.filiales » posé à vide  -> périmètre vide, cas légitime des traitements
--     système : la fonction rend un tableau vide, les politiques ne renvoient aucune
--     ligne, et personne n'est dérangé ;
--   - « grc.filiales » jamais posé  -> la transaction n'a pas déclaré son périmètre.
--     Ce n'est pas une situation d'utilisateur, c'est un défaut de programmation : il
--     doit être BRUYANT. Une liste vide rendue silencieusement enverrait chercher la
--     cause partout sauf au bon endroit.
--
-- Portée exacte du garde, à ne pas surestimer : après un « commit », PostgreSQL rend le
-- réglage local à sa valeur de session, qui est la chaîne VIDE et non l'absence. Sur une
-- connexion déjà employée — donc sur toute connexion rendue à un pool — un périmètre
-- oublié se lit comme un périmètre vide, et la lecture ne rend rien, en silence. Ce garde
-- attrape donc à coup sûr le cas d'une connexion neuve, d'un script d'exploitation ou
-- d'une session psql ; le garde qui vaut TOUJOURS est celui de l'écriture ci-dessous.
-- -------------------------------------------------------------------------------------
create or replace function f_filiales_lecture() returns text[]
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_brut text := current_setting('grc.filiales', true);
begin
    if v_brut is null then
        raise exception
            'Périmètre non positionné : la transaction lit une table cloisonnée sans avoir '
            'déclaré grc.filiales.'
            using errcode = 'GRC04',
                  hint = 'Ouvrez la transaction par set_config(''grc.filiales'', …, true), '
                         'depuis la session serveur — jamais depuis une valeur transmise par le '
                         'navigateur. Un périmètre volontairement vide se déclare par la chaîne '
                         'vide. Voir backend/db/CONVENTIONS.md §11 et §15.';
    end if;

    return coalesce(string_to_array(nullif(v_brut, ''), ','), array[]::text[]);
end;
$$;

comment on function f_filiales_lecture() is
    'Périmètre de LECTURE de la transaction, EXIGÉ : identique à f_filiales_autorisees(), mais '
    'lève GRC04 si grc.filiales n''a jamais été posé. Périmètre posé mais vide = zéro ligne, en '
    'silence (traitements système) ; périmètre absent = défaut de programmation, bruyant.';

-- -------------------------------------------------------------------------------------
-- Filiale d'ÉCRITURE, exigée. On n'écrit que dans la filiale ACTIVE (CONVENTIONS §11),
-- et il n'existe aucune écriture légitime de donnée de filiale sans filiale active.
--
-- ── DEUX CONDITIONS, ET LA SECONDE MANQUAIT (CONVENTIONS.md §17.9) ──────────────────
--
-- 1. La filiale active est POSÉE. Sans elle, il n'y a rien à écrire nulle part.
-- 2. La filiale active APPARTIENT AU PÉRIMÈTRE DE LECTURE. C'est la condition ajoutée
--    à la suite du second passage de la porte de sécurité S1 (constat bloquant N-1).
--
-- Sans la seconde, « grc.filiale_id » et « grc.filiales » étaient deux réglages
-- INDÉPENDANTS : une session déclarant un périmètre de lecture FIL-A et une filiale
-- active FIL-B écrivait chez B — une filiale qu'elle ne lisait même pas. Rejoué à la
-- porte S1 : création d'un risque chez B, puis d'une entrée de journal attribuée à un
-- utilisateur de B, NUMÉROTÉE, HORODATÉE PAR LE SERVEUR, CHAÎNÉE ET SCELLÉE — donc
-- indiscernable d'une entrée authentique pour l'auditeur qui vérifiera la chaîne. Le
-- mécanisme d'inaltérabilité garantissait alors l'intégrité d'une fausse preuve.
--
-- POURQUOI DANS LA BASE ALORS QUE LE CODE LE VÉRIFIE DÉJÀ. Le contrôle existait, une
-- seule fois, dans src/db/pool.ts (validerPerimetre). Or le PLAN_SERVEUR §1.9 pose que
-- « un oubli de filtre dans le code ne peut pas provoquer de fuite inter-filiales » : la
-- RLS est le filet SOUS le code, pas sa doublure. Un filet dont la seule maille est dans
-- le code qu'il est censé rattraper n'est pas un filet.
--
-- Règle générale qui en découle (§17.9) : deux réglages de session qui doivent être
-- cohérents entre eux sont recoupés PAR LA BASE, jamais seulement par le code qui les
-- pose.
--
-- CE QUI EN SOUFFRE, ET CE QUI N'EN SOUFFRE PAS. Deux flux passent sans changement : un
-- périmètre système n'a pas de filiale active et échoue déjà sur la première condition ;
-- une administration Groupe qui retire un contrôle du socle (§17.6) bascule entre des
-- filiales DE son périmètre.
--
-- Un troisième en souffre, et il faut le dire ici plutôt que de laisser le lot L4 le
-- découvrir — constat T-5 du troisième passage, qui reprochait au §17.9 son « aucun flux
-- légitime n'en souffre » : une filiale qui vient d'être CRÉÉE ne peut pas figurer dans un
-- périmètre résolu à l'ouverture de session. La créer puis l'amorcer dans le même
-- mouvement échoue donc en GRC04 sur la seconde instruction. Le comportement de la base
-- est CORRECT — c'est exactement la propriété voulue — mais le lot L4 doit savoir qu'il
-- lui faut étendre grc.filiales dans la même transaction, ou re-résoudre le périmètre
-- après la création. La création elle-même, elle, passe : les tables de configuration ne
-- consultent pas f_filiale_ecriture().
-- -------------------------------------------------------------------------------------
create or replace function f_filiale_ecriture() returns text
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_filiale text := f_filiale_courante();
begin
    if v_filiale is null then
        raise exception
            'Périmètre non positionné : écriture dans une table cloisonnée sans filiale active '
            '(grc.filiale_id).'
            using errcode = 'GRC04',
                  hint = 'La filiale active vient de la SESSION SERVEUR : '
                         'set_config(''grc.filiale_id'', …, true) en début de transaction. '
                         'Une transaction de lecture seule n''a pas à écrire. '
                         'Voir backend/db/CONVENTIONS.md §11 et §15.';
    end if;

    -- f_filiales_autorisees() et non f_filiales_lecture() : cette dernière lève sur un
    -- périmètre JAMAIS posé, avec un message qui parle de lecture. Ici, le défaut à
    -- nommer est l'incohérence entre les deux réglages, et le message doit le dire —
    -- y compris quand grc.filiales n'a pas été posé du tout, cas où le tableau est vide
    -- et où la condition échoue donc aussi, ce qui est le bon comportement : sans
    -- périmètre de lecture déclaré, il n'y a de filiale d'écriture légitime nulle part.
    if not (v_filiale = any (f_filiales_autorisees())) then
        raise exception
            'Filiale active % hors du périmètre lisible de la session : on n''écrit pas dans '
            'une filiale que l''on ne lit pas.', v_filiale
            using errcode = 'GRC04',
                  hint = 'grc.filiale_id doit figurer dans grc.filiales. Les deux réglages '
                         'viennent de la SESSION SERVEUR et sont résolus ensemble ; les poser '
                         'séparément est un défaut de programmation. '
                         'Voir backend/db/CONVENTIONS.md §11, §15 et §17.9.';
    end if;

    return v_filiale;
end;
$$;

comment on function f_filiale_ecriture() is
    'Filiale ACTIVE de la transaction, EXIGÉE, et vérifiée APPARTENIR au périmètre de lecture '
    '(CONVENTIONS.md §17.9) : f_filiale_courante() qui lève GRC04 au lieu de rendre null, plus '
    'le recoupement avec f_filiales_autorisees(). Employée dans toutes les politiques d''écriture '
    'des tables cloisonnées, pour qu''un périmètre oublié — ou incohérent — échoue bruyamment au '
    'lieu de refuser en silence. Sans le recoupement, une session lisant FIL-A et déclarant '
    'FIL-B active écrivait chez B, journal d''audit scellé compris.';

-- -------------------------------------------------------------------------------------
-- Le SEUL réglage d'administration du cloisonnement.
--
-- Il autorise l'ÉCRITURE des lignes de PORTÉE GROUPE des tables mixtes (filiale_id nul :
-- socle de mesures, politique groupe, annuaire groupe, paramètre groupe). Il n'élargit
-- JAMAIS la lecture — d'abord parce qu'il n'apparaît dans aucune politique de lecture
-- (le §8 le vérifie mécaniquement), ensuite parce que les lignes qu'il déverrouille sont
-- de portée Groupe, donc déjà lisibles de toutes les filiales.
--
-- Contrat pour la couche applicative (lot L3) : la transaction d'une session dont le
-- profil est « Administration » ET le périmètre « groupe » pose, en plus des trois
-- réglages habituels :
--     select set_config('grc.administration_groupe', 'oui', true);
-- Comparaison stricte à 'oui' : toute autre valeur, y compris 'true' ou '1', vaut non.
-- -------------------------------------------------------------------------------------
create or replace function f_administration_groupe() returns boolean
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select coalesce(current_setting('grc.administration_groupe', true), '') = 'oui';
$$;

comment on function f_administration_groupe() is
    'Vrai si la transaction est une transaction d''administration de niveau Groupe '
    '(grc.administration_groupe = ''oui'', posé par la session serveur). Autorise l''ÉCRITURE '
    'des lignes de portée Groupe des tables mixtes ; n''élargit JAMAIS la lecture — cette '
    'fonction n''apparaît dans aucune politique de lecture, et le garde-fou de couverture '
    'refuse la migration si elle venait à y apparaître.';

-- -------------------------------------------------------------------------------------
-- Cohérence « catalogue de mesures ↔ filiale » — ce qu'aucune clé étrangère ne tient.
--
-- mesure_catalogue est MIXTE (CONVENTIONS §16.2) : filiale_id nul = socle imposé par le
-- Groupe, renseigné = mesure LOCALE à une filiale. Quatre tables référencent ce catalogue
-- en portant elles-mêmes un filiale_id (§16.3) :
--     mesure_mise_en_oeuvre · evaluation_mesures · actions · traitement_mesures
-- Rien, dans le schéma, n'empêche la filiale B d'implémenter — ou de rattacher une action
-- à — une mesure LOCALE de la filiale A : une clé étrangère composite (mesure_id,
-- filiale_id) est impossible, mesure_catalogue.filiale_id étant nullable.
--
-- POURQUOI UN DÉCLENCHEUR ET NON UNE POLITIQUE : ce n'est pas une question de
-- cloisonnement (l'écriture reste dans la filiale active, la politique fait déjà son
-- travail) mais d'INTÉGRITÉ. Rangée dans la politique, la violation se solderait par un
-- « new row violates row-level security policy » muet, impossible à traduire en message
-- utilisateur ; ici elle porte un message qui nomme la cause, et un SQLSTATE 23514
-- (violation de contrainte de validation) que l'API sait déjà présenter.
--
-- Le « exists » ci-dessous est lui-même soumis à la RLS de mesure_catalogue : une mesure
-- locale d'une autre filiale est INVISIBLE, donc traitée comme inconnue. Le message
-- couvre les deux cas sans permettre de les distinguer — ce qui ferme au passage l'oracle
-- qui aurait permis de deviner le catalogue local d'une autre filiale.
-- -------------------------------------------------------------------------------------
create or replace function f_coherence_mesure_catalogue() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if new.mesure_id is null then
        return new;   -- rattachement facultatif : actions.mesure_id est nullable, et c'est
                      -- par ce null que la couche applicative DÉLIE une action avant de
                      -- retirer sa mesure du catalogue (CONVENTIONS.md §17.6).
    end if;

    if not exists (
        select 1
          from mesure_catalogue m
         where m.id = new.mesure_id
           and (m.filiale_id is null or m.filiale_id = new.filiale_id))
    then
        raise exception
            'Mesure % inaccessible à la filiale % : elle est inconnue du catalogue, ou locale à '
            'une autre filiale.', new.mesure_id, coalesce(new.filiale_id, '(aucune)')
            using errcode = '23514',
                  hint = 'Une filiale ne met en oeuvre que les mesures du socle Groupe '
                         '(mesure_catalogue.filiale_id nul) ou ses propres mesures locales. '
                         'Voir backend/db/CONVENTIONS.md §16.2 et §16.3.';
    end if;

    return new;
end;
$$;

comment on function f_coherence_mesure_catalogue() is
    'Déclencheur de cohérence : interdit à une filiale de référencer une mesure LOCALE d''une '
    'autre filiale (mesure_mise_en_oeuvre, evaluation_mesures, actions, traitement_mesures). '
    'Aucune clé étrangère composite ne peut l''exprimer, mesure_catalogue.filiale_id étant '
    'nullable (CONVENTIONS.md §16.2). SQLSTATE 23514.';

-- -------------------------------------------------------------------------------------
-- La PORTÉE d'une ligne mixte ne change pas — corrigé à la porte S1 (constat M-3).
--
-- CE QUE LA POLITIQUE NE PEUT PAS FAIRE. Le prédicat des tables mixtes (§4) vaut
--     case when filiale_id is null then f_administration_groupe()
--          else filiale_id = f_filiale_ecriture() end
-- et il est évalué SÉPARÉMENT sur l'ancienne et sur la nouvelle ligne. Rien, dans cette
-- forme, n'interdit de franchir la frontière entre les deux portées : le « using » est
-- satisfait par la moitié gauche (ligne de portée Groupe plus le drapeau), le
-- « with check » par la moitié droite (ligne de la filiale active). Une politique ne voit
-- jamais les deux moitiés d'un même « update » sous la même condition ; un déclencheur,
-- si. Reproduit à la porte S1 :
--
--     update mesure_catalogue set filiale_id = 'FIL-A' where id = 'MESURE-SOCLE';  UPDATE 1
--
-- CE QUE ÇA COÛTAIT. La ligne du socle commun — visible des vingt filiales — devenait une
-- ligne LOCALE de la filiale A, donc invisible des dix-neuf autres, puis supprimable par
-- elle comme une ligne ordinaire. La cascade emportait alors les mises en oeuvre des
-- autres filiales. Les deux moitiés du chemin sont fermées : ici pour l'appropriation,
-- et par « on delete restrict » sur fk_mesure_mise_en_oeuvre_mesure (002) pour la
-- destruction collatérale.
--
-- POURQUOI REFUSER TOUT CHANGEMENT, ET PAS SEULEMENT L'APPROPRIATION. Les quatre
-- transitions sont également fautives, et aucune n'a d'usage légitime :
--     Groupe  -> filiale : appropriation du socle commun ;
--     filiale -> Groupe  : promotion d'une ligne locale en socle, sans arbitrage Groupe ;
--     filiale -> filiale : le déplacement chez le voisin, que la RLS interdit déjà aux
--                          tables de niveau filiale — la même règle vaut ici ;
--     Groupe  -> Groupe  : sans objet (aucun changement).
-- Une ligne ne change pas de portée : on en crée une nouvelle. Même motif et même
-- SQLSTATE que f_coherence_mesure_catalogue(), pour que l'API les traduise pareillement.
-- -------------------------------------------------------------------------------------
create or replace function f_interdit_changement_portee() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if new.filiale_id is distinct from old.filiale_id then
        raise exception
            'Table % : la portée d''une ligne ne change pas (% -> %).',
            tg_table_name,
            coalesce(old.filiale_id, 'Groupe'), coalesce(new.filiale_id, 'Groupe')
            using errcode = '23514',
                  hint = 'Une ligne de portée Groupe (filiale_id nul) est le socle commun de '
                         'toutes les filiales ; une ligne locale appartient à la sienne. Pour '
                         'changer de portée, créez une nouvelle ligne et retirez l''ancienne. '
                         'Voir backend/db/CONVENTIONS.md §17.6 et le §4 de cette migration.';
    end if;
    return new;
end;
$$;

comment on function f_interdit_changement_portee() is
    'Déclencheur des cinq tables MIXTES : refuse (SQLSTATE 23514) tout « update » qui change '
    'filiale_id, dans un sens comme dans l''autre. Ferme le franchissement de la frontière '
    'Groupe / filiale que les politiques RLS, évaluées séparément sur l''ancienne et la '
    'nouvelle ligne, ne peuvent pas voir. Constat M-3 de la porte de sécurité S1.';

-- -------------------------------------------------------------------------------------
-- Vérification de la couverture RLS. Créée en fonction, et pas seulement jouée en fin de
-- migration, pour trois raisons : le banc d'essai s'en sert, le script
-- db/verifier_cloisonnement.sql le montre à l'auditeur, et une migration future peut
-- l'appeler pour refuser de s'appliquer si elle a créé une table sans politique.
--
-- Un schéma sain ne renvoie AUCUNE ligne — même idiome que f_journal_audit_verifier().
-- -------------------------------------------------------------------------------------
create or replace function f_verifier_couverture_rls()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les six tables de liaison sans filiale_id, nommées explicitement : elles sont
    -- l'angle mort du lot (CONVENTIONS §7, avertissement), et leur politique est leur
    -- SEULE défense contre un lien inter-filiales. Les nommer ici fait échouer la
    -- vérification si l'une d'elles disparaissait ou était renommée sans être retraitée.
    v_liaisons constant text[] := array[
        'risque_exigences', 'actif_risques', 'processus_actifs',
        'actif_dependances', 'incident_actifs', 'mapping_exigences'];

    -- Dérogations documentées à l'exigence « prédicat non trivial » (voir §6). Toute
    -- AUTRE table porteuse d'un filiale_id dont la politique dirait « true » fait échouer
    -- la vérification : c'est ce qui interdit à une migration future d'ouvrir une table
    -- en grand par inadvertance.
    v_derogations constant text[] := array[
        'groupes_ad',       -- aiguillage de l'authentification, lu AVANT tout périmètre
        'journal_audit',    -- chaînage : la numérotation exige de voir la chaîne entière
        'session_filiales', -- c'est la table qui PRODUIT le périmètre ; le filtrer par
                            -- lui-même rendrait toute connexion impossible
        -- mapping_exigences figure dans la liste des six liaisons ci-dessus, et doit
        -- donc EXISTER et être couverte ; mais elle n'est pas cloisonnable, et la
        -- traiter comme les cinq autres serait une erreur de fait : son parent
        -- (mappings) est de niveau GROUPE (CONVENTIONS §16.4) et son autre extrémité
        -- est le couple (ref_id, code) du catalogue statique de référentiels, qui n'est
        -- pas en base. Aucune de ses deux extrémités n'appartient à une filiale : elle
        -- ne peut, par construction, porter aucun lien inter-filiales. Elle est donc
        -- rangée en famille 4 (§6), et dérogée ici EN CONNAISSANCE DE CAUSE.
        'mapping_exigences'
    ];
    r record;
begin
    for r in
        select c.oid,
               c.relname::text                                             as nom,
               c.relrowsecurity                                            as rls,
               c.relforcerowsecurity                                       as forcee,
               exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'filiale_id'
                          and a.attnum > 0 and not a.attisdropped)         as porte_filiale
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         -- « r » ET « p » : le commentaire de cette fonction dit « TOUTE table du schéma
         -- public », et le §0 de ce fichier pense déjà à relkind in ('r','p','v','m') pour
         -- le contrôle de propriété. Une table partitionnée échappait ici au balayage —
         -- constat T-11 du troisième passage. Il n'y en a aucune aujourd'hui ; le filet ne
         -- doit pas attendre la première.
         where n.nspname = 'public' and c.relkind in ('r', 'p')
         order by c.relname
    loop
        objet := r.nom;

        if not r.rls then
            anomalie := 'rls_desactivee';
            detail   := 'la table n''a pas « enable row level security » : ses lignes sont '
                        'visibles de toutes les filiales';
            return next;
        end if;

        if not r.forcee then
            anomalie := 'force_absente';
            detail   := 'la table n''a pas « force row level security » : le propriétaire des '
                        'tables échappe aux politiques';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*'))
        then
            anomalie := 'politique_lecture_absente';
            detail   := 'aucune politique permissive de lecture : la table est illisible, ou le '
                        'sera dès qu''une politique d''écriture existera';
            return next;
        end if;

        if not exists (select 1 from pg_policy p
                        where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*'))
        then
            anomalie := 'politique_ecriture_absente';
            detail   := 'aucune politique permissive d''écriture : toute écriture est refusée '
                        'sans que rien ne le dise';
            return next;
        end if;

        -- Une politique de lecture ne doit JAMAIS dépendre d'un réglage d'administration :
        -- ce serait un moyen, pour un réglage de session, d'élargir la LECTURE.
        if exists (
            select 1 from pg_policy p
             where p.polrelid = r.oid and p.polcmd in ('r', '*')
               and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%f_administration_groupe%')
        then
            anomalie := 'drapeau_administration_en_lecture';
            detail   := 'une politique de lecture mentionne f_administration_groupe() : un '
                        'réglage de session élargirait la LECTURE, ce que le §2 interdit';
            return next;
        end if;

        -- Politiques qui ne CONSULTENT PAS le périmètre, sur une table qui porte, elle,
        -- une filiale. La détection ne compare plus le prédicat au littéral « true » : elle
        -- exige qu'il MENTIONNE la fonction de périmètre correspondante. Voir la portée
        -- exacte, et ses limites, dans le commentaire de la fonction.
        if (r.porte_filiale or r.nom = any (v_liaisons)) and not (r.nom = any (v_derogations)) then
            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*')
                   and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true')
                       !~ '(f_filiales_lecture|f_filiales_autorisees)')
            then
                anomalie := 'lecture_non_cloisonnee';
                detail   := 'une politique de lecture ne consulte pas le périmètre de la session '
                            '(ni f_filiales_lecture, ni f_filiales_autorisees) sur une table '
                            'cloisonnée : toutes les filiales se lisent entre elles';
                return next;
            end if;

            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('a', 'w', 'd', '*')
                   and coalesce(
                           case p.polcmd
                               when 'a' then pg_get_expr(p.polwithcheck, p.polrelid)
                               when 'd' then pg_get_expr(p.polqual, p.polrelid)
                               else coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                                             pg_get_expr(p.polqual, p.polrelid))
                           end, 'true') !~ 'f_filiale_ecriture')
            then
                anomalie := 'ecriture_non_cloisonnee';
                detail   := 'une politique d''écriture ne consulte pas la filiale ACTIVE '
                            '(f_filiale_ecriture) sur une table cloisonnée : une filiale peut '
                            'écrire chez une autre';
                return next;
            end if;
        end if;
    end loop;

    -- Les six liaisons doivent EXISTER : leur disparition silencieuse ferait passer la
    -- vérification pour une bonne nouvelle.
    foreach objet in array v_liaisons loop
        if to_regclass('public.' || objet) is null then
            anomalie := 'liaison_absente';
            detail   := 'table de liaison attendue par CONVENTIONS §16.5 introuvable : '
                        'la vérification du cloisonnement des liens ne porte plus sur rien';
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_couverture_rls() is
    'Vérifie que TOUTE table du schéma public — ordinaire ou partitionnée — porte « enable » et '
    '« force row level security », '
    'au moins une politique de lecture et une d''écriture, qu''aucune politique de lecture ne '
    'dépend d''un réglage d''administration, et que toute table cloisonnée hors dérogation a des '
    'prédicats qui MENTIONNENT les fonctions de périmètre (f_filiales_lecture ou '
    'f_filiales_autorisees en lecture, f_filiale_ecriture en écriture). Un schéma sain ne '
    'renvoie AUCUNE ligne. À appeler par toute migration future qui crée une table : sans '
    'politique, elle doit échouer au déploiement, pas fuir en silence. '
    'PORTÉE EXACTE, À NE PAS SURESTIMER (CONVENTIONS.md §17.5) : ce garde-fou lit le TEXTE des '
    'prédicats, pas leur sens. Il attrape une politique qui ne consulte pas le périmètre — '
    '« true », « filiale_id is not null », un prédicat sur une autre colonne — mais il ne peut '
    'pas attraper une politique qui NOMME la bonne fonction en s''en servant mal, par exemple '
    '« f_filiales_lecture() is not null ». Ce qui mord vraiment là, ce sont les tests de '
    'comportement de test/base/rls.test.mjs et db/verifier_cloisonnement.sql. Un garde-fou '
    'auquel on prête plus de portée qu''il n''en a endort la vigilance au lieu de l''entretenir.';

-- =====================================================================================
-- §3 — FAMILLE 1 : LES 24 TABLES DE NIVEAU FILIALE
-- -------------------------------------------------------------------------------------
-- Contrat (CONVENTIONS §4 et §11) : filiale_id non nul, lecture sur tout le périmètre,
-- écriture dans la seule filiale active.
--
-- DÉROGATION DE FORME, justifiée ici comme le §1 des conventions l'exige : ces 96
-- politiques sont ENGENDRÉES par une boucle plutôt qu'écrites 96 fois. Le prédicat
-- n'existe alors qu'en un seul exemplaire — c'est lui que l'auditeur lit, et il ne peut
-- pas diverger d'une table à l'autre par une faute de frappe qu'aucun test ne verrait.
-- La liste des tables reste EXPLICITE (et non un balayage du catalogue) pour qu'une table
-- future ne soit jamais couverte par accident : c'est le garde-fou du §8 qui doit la
-- réclamer, bruyamment, au déploiement.
-- =====================================================================================

do $$
declare
    v_tables constant text[] := array[
        -- socle (001)
        'approbations', 'imports', 'pieces_jointes', 'referentiels_actifs',
        -- métier, noyau (002)
        'actifs', 'clients', 'evaluation_mesures', 'evaluations', 'exigences',
        'mesure_mise_en_oeuvre', 'processus', 'risques',
        -- métier, opérations (003)
        'actions', 'audits', 'crise', 'history', 'incidents', 'mco_actions',
        'prestataires', 'revues', 'scenarios_pra', 'tests_pra', 'traitement_mesures',
        'traitements'
    ];
    v_lecture  constant text := 'filiale_id = any (f_filiales_lecture())';
    v_ecriture constant text := 'filiale_id = f_filiale_ecriture()';
    t text;
begin
    foreach t in array v_tables loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);

        execute format('create policy %I on %I for select using (%s)',
                       'pol_' || t || '_lecture', t, v_lecture);
        execute format('create policy %I on %I for insert with check (%s)',
                       'pol_' || t || '_ajout', t, v_ecriture);
        execute format('create policy %I on %I for update using (%s) with check (%s)',
                       'pol_' || t || '_maj', t, v_ecriture, v_ecriture);
        execute format('create policy %I on %I for delete using (%s)',
                       'pol_' || t || '_suppression', t, v_ecriture);

        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_lecture', t,
            'Lecture : les lignes de tout le périmètre de la session (une filiale, plusieurs, '
            'ou le Groupe entier). GRC04 si le périmètre n''a jamais été posé.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_ajout', t,
            'Ajout : dans la seule filiale ACTIVE. On lit son périmètre, on n''écrit que là '
            'où l''on est.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_maj', t,
            'Modification : seules les lignes de la filiale active sont modifiables, et une '
            'ligne ne peut pas être déplacée vers une autre filiale (« with check »).');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_suppression', t,
            'Suppression : dans la seule filiale active.');
    end loop;

    raise notice 'Famille 1 (niveau filiale) : % tables, % politiques.',
                 array_length(v_tables, 1), array_length(v_tables, 1) * 4;
end;
$$;

-- =====================================================================================
-- §4 — FAMILLE 2 : LES 5 TABLES MIXTES
-- -------------------------------------------------------------------------------------
-- filiale_id NULLABLE, et « null » n'est pas « inconnu » : c'est la PORTÉE GROUPE
-- (CONVENTIONS §4 et §16.4). Une politique de sécurité du groupe, une mesure du socle
-- commun, une personne de la direction, un paramètre global : ces lignes sont le socle
-- partagé, et elles sont lisibles de toutes les filiales — sans quoi la comparabilité
-- entre filiales, qui est la raison d'être de la vision Groupe, s'effondre.
--
-- RESTE À DÉCIDER QUI LES ÉCRIT. Contrainte absolue : aucun réglage de session ne doit
-- jamais permettre de LIRE une filiale hors périmètre. Un réglage d'administration ne
-- peut donc qu'autoriser l'ÉCRITURE des lignes de portée Groupe — jamais élargir la
-- lecture. C'est exactement ce que fait f_administration_groupe() (§2), et rien d'autre :
--   - il ne figure dans aucune politique de lecture (le §8 le vérifie) ;
--   - les lignes qu'il déverrouille (filiale_id nul) sont déjà lisibles de tous, donc
--     l'ouvrir n'a jamais pour effet de révéler quoi que ce soit.
--
-- « case » et non « or » : l'ordre d'évaluation d'un « or » n'est pas garanti, et
-- f_filiale_ecriture() lève GRC04. Une écriture LÉGITIME de ligne Groupe par une
-- transaction d'administration sans filiale active doit passer, pas échouer sur le
-- membre droit d'une disjonction évaluée en premier.
-- =====================================================================================

do $$
declare
    v_tables constant text[] := array[
        'parametres',             -- 001 : configuration Groupe + surcharges par filiale
        'mesure_catalogue',       -- 002 : socle de contrôles Groupe + mesures locales
        'personnes',              -- 002 : annuaire Groupe + annuaires de site
        'document_referentiels',  -- 003 : recopie de la portée du document parent
        'documents'               -- 003 : politique Groupe + procédures locales
    ];
    v_lecture constant text :=
        'case when filiale_id is null then true'
        ' else filiale_id = any (f_filiales_lecture()) end';
    v_ecriture constant text :=
        'case when filiale_id is null then f_administration_groupe()'
        ' else filiale_id = f_filiale_ecriture() end';
    t text;
begin
    foreach t in array v_tables loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);

        execute format('create policy %I on %I for select using (%s)',
                       'pol_' || t || '_lecture', t, v_lecture);
        execute format('create policy %I on %I for insert with check (%s)',
                       'pol_' || t || '_ajout', t, v_ecriture);
        execute format('create policy %I on %I for update using (%s) with check (%s)',
                       'pol_' || t || '_maj', t, v_ecriture, v_ecriture);
        execute format('create policy %I on %I for delete using (%s)',
                       'pol_' || t || '_suppression', t, v_ecriture);

        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_lecture', t,
            'Lecture : les lignes de portée Groupe (filiale_id nul) sont le socle commun, '
            'lisible de toutes les filiales ; les lignes locales suivent le périmètre. '
            'Une ligne Groupe reste lisible même sans périmètre posé — c''est ce qui rend '
            'le socle consultable par la couche d''authentification.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_ajout', t,
            'Ajout : une ligne locale dans la seule filiale active ; une ligne de portée '
            'Groupe seulement en transaction d''administration Groupe '
            '(grc.administration_groupe = ''oui''). Ce réglage n''élargit jamais la lecture.');
        -- Le commentaire dit ce que la POLITIQUE fait, et nomme ce qu'elle NE PEUT PAS
        -- faire. Il affirmait auparavant l'inverse de son comportement réel — corrigé à la
        -- porte de sécurité S1 (constat M-3).
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_maj', t,
            'Modification : mêmes conditions que l''ajout, appliquées SÉPARÉMENT à l''ancienne '
            'ligne (« using ») et à la nouvelle (« with check »). À elle seule, cette politique '
            'n''interdit donc PAS de franchir la frontière entre portée Groupe et portée '
            'filiale : le « using » peut être satisfait par une moitié du « case » et le '
            '« with check » par l''autre. C''est le déclencheur trg_' || t || '_portee_figee '
            '(§7) qui refuse tout changement de filiale_id, dans un sens comme dans l''autre. '
            'Le déplacement d''une ligne LOCALE vers une autre filiale, lui, est bien refusé '
            'par le « with check » de cette politique.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_suppression', t,
            'Suppression : mêmes conditions que l''ajout. Une filiale ne supprime pas le socle '
            'commun.');
    end loop;

    raise notice 'Famille 2 (mixte) : % tables, % politiques.',
                 array_length(v_tables, 1), array_length(v_tables, 1) * 4;
end;
$$;

-- =====================================================================================
-- §5 — FAMILLE 3 : LES LIAISONS ET TABLES FILLES SANS filiale_id
-- -------------------------------------------------------------------------------------
-- C'EST L'ANGLE MORT DU LOT, et il est signalé comme tel au CONVENTIONS §7 par l'agent
-- qui a écrit 002 : ces tables ne portent pas de filiale, et AUCUNE clé étrangère ne
-- peut les empêcher de relier deux filiales différentes. Pire, les contrôles d'intégrité
-- référentielle de PostgreSQL contournent délibérément la RLS (« referential integrity
-- checks always bypass row security ») : la clé étrangère vers l'exigence allemande
-- SERA satisfaite, même si cette exigence est invisible.
--
-- Leur politique est donc la seule défense, et elle a deux volets, dont le second est
-- celui qui compte :
--   - LECTURE : un lien n'est visible que si SES DEUX EXTRÉMITÉS le sont ;
--   - ÉCRITURE : un lien ne s'écrit que si SES DEUX EXTRÉMITÉS appartiennent à la
--     filiale ACTIVE. Un lien Toulouse → Allemagne est refusé À L'INSERTION, pas
--     seulement invisible à la lecture. Invisible aurait suffi à cacher la fuite, pas à
--     l'empêcher : la ligne aurait existé, et le premier code qui joint sans passer par
--     la RLS — un export d'exploitation, une reprise, une future vue — l'aurait rendue.
--
-- Écrites une par une, sans boucle : chaque table a ses deux extrémités propres, et
-- c'est précisément ce qu'un auditeur doit pouvoir lire ligne à ligne.
--
-- Les sous-requêtes sont elles-mêmes soumises à la RLS de la table interrogée : le
-- filtre explicite sur f_filiales_autorisees() / f_filiale_ecriture() est donc une
-- ceinture par-dessus les bretelles. Il est écrit quand même — un auditeur ne devrait pas
-- avoir à connaître la récursivité des politiques pour se convaincre du résultat.
-- =====================================================================================

-- --- risques ↔ exigences -------------------------------------------------------------
alter table risque_exigences enable row level security;
alter table risque_exigences force row level security;

create policy pol_risque_exigences_lecture on risque_exigences for select
    using (
        exists (select 1 from risques r
                 where r.id = risque_exigences.risque_id
                   and r.filiale_id = any (f_filiales_autorisees()))
        and exists (select 1 from exigences e
                     where e.id = risque_exigences.exigence_id
                       and e.filiale_id = any (f_filiales_autorisees())));

create policy pol_risque_exigences_ajout on risque_exigences for insert
    with check (
        exists (select 1 from risques r
                 where r.id = risque_exigences.risque_id
                   and r.filiale_id = f_filiale_ecriture())
        and exists (select 1 from exigences e
                     where e.id = risque_exigences.exigence_id
                       and e.filiale_id = f_filiale_ecriture()));

create policy pol_risque_exigences_maj on risque_exigences for update
    using (
        exists (select 1 from risques r
                 where r.id = risque_exigences.risque_id
                   and r.filiale_id = f_filiale_ecriture())
        and exists (select 1 from exigences e
                     where e.id = risque_exigences.exigence_id
                       and e.filiale_id = f_filiale_ecriture()))
    with check (
        exists (select 1 from risques r
                 where r.id = risque_exigences.risque_id
                   and r.filiale_id = f_filiale_ecriture())
        and exists (select 1 from exigences e
                     where e.id = risque_exigences.exigence_id
                       and e.filiale_id = f_filiale_ecriture()));

create policy pol_risque_exigences_suppression on risque_exigences for delete
    using (
        exists (select 1 from risques r
                 where r.id = risque_exigences.risque_id
                   and r.filiale_id = f_filiale_ecriture())
        and exists (select 1 from exigences e
                     where e.id = risque_exigences.exigence_id
                       and e.filiale_id = f_filiale_ecriture()));

comment on policy pol_risque_exigences_lecture on risque_exigences is
    'Un lien risque ↔ exigence n''est visible que si le risque ET l''exigence le sont.';
comment on policy pol_risque_exigences_ajout on risque_exigences is
    'Un lien ne se crée qu''entre un risque et une exigence de la filiale ACTIVE : un lien '
    'inter-filiales est refusé à l''insertion, pas seulement invisible.';

-- --- actifs ↔ risques ----------------------------------------------------------------
alter table actif_risques enable row level security;
alter table actif_risques force row level security;

create policy pol_actif_risques_lecture on actif_risques for select
    using (
        exists (select 1 from actifs a
                 where a.id = actif_risques.actif_id
                   and a.filiale_id = any (f_filiales_autorisees()))
        and exists (select 1 from risques r
                     where r.id = actif_risques.risque_id
                       and r.filiale_id = any (f_filiales_autorisees())));

create policy pol_actif_risques_ajout on actif_risques for insert
    with check (
        exists (select 1 from actifs a
                 where a.id = actif_risques.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from risques r
                     where r.id = actif_risques.risque_id
                       and r.filiale_id = f_filiale_ecriture()));

create policy pol_actif_risques_maj on actif_risques for update
    using (
        exists (select 1 from actifs a
                 where a.id = actif_risques.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from risques r
                     where r.id = actif_risques.risque_id
                       and r.filiale_id = f_filiale_ecriture()))
    with check (
        exists (select 1 from actifs a
                 where a.id = actif_risques.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from risques r
                     where r.id = actif_risques.risque_id
                       and r.filiale_id = f_filiale_ecriture()));

create policy pol_actif_risques_suppression on actif_risques for delete
    using (
        exists (select 1 from actifs a
                 where a.id = actif_risques.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from risques r
                     where r.id = actif_risques.risque_id
                       and r.filiale_id = f_filiale_ecriture()));

comment on policy pol_actif_risques_lecture on actif_risques is
    'Un lien actif ↔ risque n''est visible que si l''actif ET le risque le sont.';
comment on policy pol_actif_risques_ajout on actif_risques is
    'Les deux extrémités doivent appartenir à la filiale ACTIVE.';

-- --- processus ↔ actifs --------------------------------------------------------------
alter table processus_actifs enable row level security;
alter table processus_actifs force row level security;

create policy pol_processus_actifs_lecture on processus_actifs for select
    using (
        exists (select 1 from processus p
                 where p.id = processus_actifs.processus_id
                   and p.filiale_id = any (f_filiales_autorisees()))
        and exists (select 1 from actifs a
                     where a.id = processus_actifs.actif_id
                       and a.filiale_id = any (f_filiales_autorisees())));

create policy pol_processus_actifs_ajout on processus_actifs for insert
    with check (
        exists (select 1 from processus p
                 where p.id = processus_actifs.processus_id
                   and p.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = processus_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()));

create policy pol_processus_actifs_maj on processus_actifs for update
    using (
        exists (select 1 from processus p
                 where p.id = processus_actifs.processus_id
                   and p.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = processus_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()))
    with check (
        exists (select 1 from processus p
                 where p.id = processus_actifs.processus_id
                   and p.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = processus_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()));

create policy pol_processus_actifs_suppression on processus_actifs for delete
    using (
        exists (select 1 from processus p
                 where p.id = processus_actifs.processus_id
                   and p.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = processus_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()));

comment on policy pol_processus_actifs_lecture on processus_actifs is
    'Un lien processus ↔ actif n''est visible que si les deux extrémités le sont. C''est par '
    'cette liaison que se calcule l''analyse d''impact : un lien inter-filiales fausserait le '
    'rayon d''impact et les points de défaillance unique.';
comment on policy pol_processus_actifs_ajout on processus_actifs is
    'Les deux extrémités doivent appartenir à la filiale ACTIVE.';

-- --- actifs ↔ actifs (dépendances typées) --------------------------------------------
alter table actif_dependances enable row level security;
alter table actif_dependances force row level security;

create policy pol_actif_dependances_lecture on actif_dependances for select
    using (
        exists (select 1 from actifs a
                 where a.id = actif_dependances.actif_id
                   and a.filiale_id = any (f_filiales_autorisees()))
        and exists (select 1 from actifs c
                     where c.id = actif_dependances.actif_cible_id
                       and c.filiale_id = any (f_filiales_autorisees())));

create policy pol_actif_dependances_ajout on actif_dependances for insert
    with check (
        exists (select 1 from actifs a
                 where a.id = actif_dependances.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs c
                     where c.id = actif_dependances.actif_cible_id
                       and c.filiale_id = f_filiale_ecriture()));

create policy pol_actif_dependances_maj on actif_dependances for update
    using (
        exists (select 1 from actifs a
                 where a.id = actif_dependances.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs c
                     where c.id = actif_dependances.actif_cible_id
                       and c.filiale_id = f_filiale_ecriture()))
    with check (
        exists (select 1 from actifs a
                 where a.id = actif_dependances.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs c
                     where c.id = actif_dependances.actif_cible_id
                       and c.filiale_id = f_filiale_ecriture()));

create policy pol_actif_dependances_suppression on actif_dependances for delete
    using (
        exists (select 1 from actifs a
                 where a.id = actif_dependances.actif_id
                   and a.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs c
                     where c.id = actif_dependances.actif_cible_id
                       and c.filiale_id = f_filiale_ecriture()));

comment on policy pol_actif_dependances_lecture on actif_dependances is
    'Une dépendance n''est visible que si l''actif source ET l''actif cible le sont.';
comment on policy pol_actif_dependances_ajout on actif_dependances is
    'Une dépendance ne se crée qu''entre deux actifs de la filiale ACTIVE : la cartographie '
    'd''une filiale ne peut pas s''appuyer sur un actif d''une autre.';

-- --- incidents ↔ actifs --------------------------------------------------------------
alter table incident_actifs enable row level security;
alter table incident_actifs force row level security;

create policy pol_incident_actifs_lecture on incident_actifs for select
    using (
        exists (select 1 from incidents i
                 where i.id = incident_actifs.incident_id
                   and i.filiale_id = any (f_filiales_autorisees()))
        and exists (select 1 from actifs a
                     where a.id = incident_actifs.actif_id
                       and a.filiale_id = any (f_filiales_autorisees())));

create policy pol_incident_actifs_ajout on incident_actifs for insert
    with check (
        exists (select 1 from incidents i
                 where i.id = incident_actifs.incident_id
                   and i.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = incident_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()));

create policy pol_incident_actifs_maj on incident_actifs for update
    using (
        exists (select 1 from incidents i
                 where i.id = incident_actifs.incident_id
                   and i.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = incident_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()))
    with check (
        exists (select 1 from incidents i
                 where i.id = incident_actifs.incident_id
                   and i.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = incident_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()));

create policy pol_incident_actifs_suppression on incident_actifs for delete
    using (
        exists (select 1 from incidents i
                 where i.id = incident_actifs.incident_id
                   and i.filiale_id = f_filiale_ecriture())
        and exists (select 1 from actifs a
                     where a.id = incident_actifs.actif_id
                       and a.filiale_id = f_filiale_ecriture()));

comment on policy pol_incident_actifs_lecture on incident_actifs is
    'Un actif touché n''est rattaché à un incident visible que si l''actif l''est aussi.';
comment on policy pol_incident_actifs_ajout on incident_actifs is
    'Les deux extrémités doivent appartenir à la filiale ACTIVE.';

-- --- erreurs d'un import (table fille d'une entité cloisonnée) ------------------------
-- Une seule extrémité, mais le même raisonnement : sans filiale_id, seule la politique
-- rattache la ligne à une filiale.
alter table import_erreurs enable row level security;
alter table import_erreurs force row level security;

create policy pol_import_erreurs_lecture on import_erreurs for select
    using (exists (select 1 from imports i
                    where i.id = import_erreurs.import_id
                      and i.filiale_id = any (f_filiales_autorisees())));

create policy pol_import_erreurs_ajout on import_erreurs for insert
    with check (exists (select 1 from imports i
                         where i.id = import_erreurs.import_id
                           and i.filiale_id = f_filiale_ecriture()));

create policy pol_import_erreurs_maj on import_erreurs for update
    using (exists (select 1 from imports i
                    where i.id = import_erreurs.import_id
                      and i.filiale_id = f_filiale_ecriture()))
    with check (exists (select 1 from imports i
                         where i.id = import_erreurs.import_id
                           and i.filiale_id = f_filiale_ecriture()));

create policy pol_import_erreurs_suppression on import_erreurs for delete
    using (exists (select 1 from imports i
                    where i.id = import_erreurs.import_id
                      and i.filiale_id = f_filiale_ecriture()));

comment on policy pol_import_erreurs_lecture on import_erreurs is
    'Les erreurs d''un import suivent la filiale de l''import : une ligne d''erreur cite le '
    'contenu du fichier importé, c''est donc de la donnée de filiale.';

-- =====================================================================================
-- §6 — FAMILLE 4 : LES 12 TABLES DE NIVEAU GROUPE ET DE SOCLE
-- -------------------------------------------------------------------------------------
-- Ces tables ne portent aucune donnée de filiale, ou bien elles sont lues AVANT que le
-- périmètre existe. Elles sont mises sous « enable » et « force row level security » avec
-- une politique EXPLICITEMENT ouverte, pour deux raisons :
--   - qu'aucune table du schéma n'échappe au balayage du §8 ;
--   - qu'un ajout futur de colonne « filiale_id » à l'une d'elles fasse aussitôt échouer
--     la vérification de couverture (« lecture_non_cloisonnee ») au lieu de passer.
--
-- Ce qui les protège n'est PAS le cloisonnement par filiale, et il faut le dire
-- clairement :
--   - le modèle de droits à trois axes, vérifié côté serveur à chaque requête — les
--     domaines « droits », « filiales », « parametres », « journal » sont réservés au
--     profil Administrateur (PLAN_SERVEUR §3.2) ;
--   - les privilèges SQL (§1 et CONVENTIONS §14) ;
--   - et, depuis la porte de sécurité S1, pour les CINQ TABLES DE CONFIGURATION
--     (utilisateurs, profils, profil_domaines, groupes_ad au premier passage — constat
--     M-2 ; filiales au second — constat N-2) : une politique d'ÉCRITURE réservée à
--     l'administration Groupe. L'arbitrage d'origine — « ce n'est pas la RLS qui les
--     protège » — se défend pour « mappings ». Il était CIRCULAIRE pour les tables qui
--     PRODUISENT la décision d'autorisation : le contrôle applicatif décide des droits en
--     les lisant, et elles étaient intégralement réinscriptibles par le rôle qui exécute
--     ce contrôle. Il n'y avait plus de défense en profondeur, seulement une couche.
--     Et il était simplement FAUX pour « filiales », qui définit la frontière même du
--     cloisonnement : n'importe quelle filiale renommait, archivait ou créait les autres.
--
-- CE QUE CETTE RÉSERVE EST, ET CE QU'ELLE N'EST PAS (CONVENTIONS.md §17.4). Le drapeau
-- « grc.administration_groupe » est une DÉCLARATION QUE LA SESSION FAIT SUR ELLE-MÊME,
-- pas un privilège : le rôle applicatif le pose lui-même, et rien dans la base ne l'en
-- empêche. Il protège donc contre la FAUTE DE PROGRAMMATION — une écriture Groupe par un
-- chemin qui ne l'a pas déclarée — et pas du tout contre un rôle applicatif compromis,
-- qui poserait le drapeau avant d'écrire. La barrière réelle est le modèle de droits à
-- trois axes du lot L3, qui décide si la session a le profil Administration et le
-- périmètre Groupe AVANT de poser le drapeau. Dit ici, à l'endroit où la réserve est
-- posée, pour que la porte S3 n'hérite pas d'une protection qu'elle croirait acquise.
--
-- Trois d'entre elles portent pourtant un filiale_id, et leur ouverture est une
-- DÉROGATION assumée, inscrite dans la liste du §2 (f_verifier_couverture_rls) :
--   - groupes_ad       : table d'aiguillage de l'authentification. Elle est lue pour
--                        RÉSOUDRE le périmètre ; la filtrer par le périmètre serait
--                        circulaire, et aucune connexion ne serait possible.
--   - session_filiales : c'est la table qui PRODUIT le périmètre. Même circularité.
--   - journal_audit    : voir le paragraphe qui lui est consacré ci-dessous.
--
-- Le filiale_id NULLABLE de groupes_ad et de journal_audit n'en fait pas pour autant des
-- tables mixtes : « nullable » n'est pas « mixte », CONVENTIONS.md §17.7. Elles ne
-- relèvent donc ni des politiques de la famille 2, ni du déclencheur de portée du §7.
-- =====================================================================================

-- La famille se scinde en DEUX groupes depuis la porte de sécurité S1 (constat M-2), et
-- la ligne de partage est simple : une table qu'on LIT pour décider des droits n'a pas à
-- être ÉCRITE en fonctionnement courant.
--
--   (a) TABLES OUVERTES — écriture au rôle applicatif, sans condition de base.
--   (b) TABLES DE CONFIGURATION — écriture réservée à l'administration Groupe
--       (CONVENTIONS §17.4). Ce sont des données d'administration : elles se posent lors
--       d'un paramétrage, jamais au fil de l'eau. Leur LECTURE reste ouverte : elle est
--       nécessaire AVANT que le périmètre existe, et le §8 refuserait de toute façon une
--       politique de lecture qui mentionnerait f_administration_groupe().
--
-- CE QUI RESTE OUVERT, ET POURQUOI C'EST ÉCRIT ICI ET NON AILLEURS. Les trois tables de
-- session sont écrites, par construction, par la couche qui n'a pas encore de périmètre :
-- ce sont elles qui le PRODUISENT. Leur fermeture est REPORTÉE AU LOT L3, dont c'est la
-- matière — voir le commentaire posé à l'endroit exact, plus bas. Les deux tables de
-- correspondances restent ouvertes aussi, pour de tout autres raisons, arbitrées et
-- écrites au même endroit.
do $$
declare
    -- (a) Écriture ouverte au rôle applicatif.
    v_ouvertes constant text[] := array[
        'migrations_schema',  -- registre technique ; écriture fermée à grc_app par les privilèges
        -- Les trois tables de SESSION. Leur écriture reste ouverte SANS CONDITION, et c'est
        -- un REPORT EXPLICITE AU LOT L3 (CONVENTIONS.md §17.4), pas un oubli :
        --   - ce sont ces tables qui PRODUISENT le périmètre et la décision d'autorisation.
        --     Les conditionner à un réglage issu de ce même périmètre serait circulaire :
        --     elles sont lues, et écrites, AVANT que le périmètre existe ;
        --   - le lot L3 (authentification) posera un réglage « grc.authentification » pour
        --     sa SEULE transaction d'ouverture de session — provisionnement d'un compte
        --     inconnu compris (PLAN_SERVEUR §1.5) — et les politiques d'écriture de ces
        --     trois tables s'y adosseront alors ;
        --   - risque assumé dans l'intervalle, et il doit être dit : une injection SQL dans
        --     le rôle applicatif permettrait de forger une session et son périmètre. La
        --     parade actuelle est le contrôle S5 — requêtes intégralement paramétrées,
        --     vérifié à la porte S1. Cette dette est une CONDITION D'ENTRÉE du lot L3.
        'sessions', 'session_filiales', 'session_domaines',
        -- ── mappings / mapping_exigences : ARBITRÉ, et voici la décision ──────────────
        -- Le second passage de la porte S1 a demandé que ce cas soit tranché par écrit
        -- plutôt que déduit. Ces deux tables RESTENT ouvertes en écriture, pour trois
        -- raisons qui ne valent QUE pour elles :
        --   1. leur contenu n'est pas une donnée de filiale et n'en devient jamais une :
        --      une correspondance « ANSSI 12 ↔ ISO A.8.7 » est vraie partout, ne cite
        --      aucune donnée métier, et sa divulgation n'apprend rien sur personne ;
        --   2. c'est un contenu ÉDITÉ EN FONCTIONNEMENT COURANT. Le module
        --      « Correspondances » du produit (js/modules/mapping.js) permet de créer,
        --      modifier, masquer et réinitialiser cette surcouche ; la réserver à
        --      l'administration Groupe supprimerait une fonctionnalité livrée, sans que
        --      personne l'ait arbitré. La différence avec « filiales », « profils » ou
        --      « utilisateurs » est là : celles-là ne sont pas écrites au fil de l'eau ;
        --   3. aucun chemin d'intégrité ne les relie à une table de niveau filiale —
        --      mapping_exigences ne référence que mappings, et l'autre extrémité est le
        --      couple (ref_id, code) d'un catalogue statique hors base. La pathologie du
        --      constat B-1 (une suppression ici modifiant les lignes d'une filiale) est
        --      donc structurellement impossible, et le balayage du banc d'essai le
        --      vérifie.
        -- CE QUI RESTE VRAI, ET QUI DOIT ÊTRE DIT : une filiale peut modifier, pour les
        -- dix-neuf autres, un catalogue partagé. C'est un enjeu de GOUVERNANCE, pas de
        -- cloisonnement, et sa réponse est le domaine fonctionnel « correspondances » du
        -- modèle de droits à trois axes (PLAN_SERVEUR §3.2), à réserver à un profil de
        -- niveau Groupe au lot L3. Un test épingle cette décision : il tombera le jour où
        -- quelqu'un la changera sans la réécrire ici.
        'mappings', 'mapping_exigences'
    ];
    -- (b) Écriture réservée à l'administration Groupe (CONVENTIONS §17.4).
    v_configuration constant text[] := array[
        'utilisateurs',       -- identités AD ; le provisionnement à la première connexion
                              -- passera par le réglage d'authentification du lot L3
        'profils',            -- définition des profils métier (PLAN_SERVEUR §3.2)
        'profil_domaines',    -- niveau de droit d'un profil sur un domaine fonctionnel
        'groupes_ad',         -- aiguillage d'authentification : lu AVANT tout périmètre,
                              -- d'où la lecture ouverte, mais écrit par l'administration seule
        -- ── filiales : déplacée ici au second passage de la porte S1 (constat N-2) ────
        -- Elle figurait parmi les tables ouvertes, avec un motif — « l'authentification la
        -- lit avant tout périmètre » — qui ne justifiait QUE LA LECTURE. L'écriture, elle,
        -- était ouverte sans condition à n'importe quelle filiale, sur les quatre verbes.
        -- Rejoué à la porte S1, depuis un périmètre strictement FIL-A : renommer FIL-B,
        -- l'archiver, créer une filiale, en supprimer une — et, par
        -- filiales.logo_piece_jointe_id qui pointe une table de NIVEAU FILIALE, poser son
        -- propre fichier comme logo de FIL-B puis le supprimer, ce qui remettait à null le
        -- logo de B en incrémentant sa version et en y inscrivant « modifie_par = alice ».
        -- La pathologie exacte du constat bloquant B-1, par un chemin que son balayage ne
        -- pouvait pas voir : filiales ne porte pas de filiale_id.
        --
        -- C'est pourtant la table la plus sensible du schéma : elle porte l'IDENTITÉ de
        -- chaque filiale (raison sociale, logo — lot L9), son STATUT de cycle de vie
        -- (active / archivee / sortie — lot L13, purges RGPD), et surtout elle DÉFINIT LA
        -- FRONTIÈRE de tout le cloisonnement. Elle est au moins autant une table de
        -- paramétrage que les quatre ci-dessus.
        'filiales'
    ];
    t text;
begin
    foreach t in array v_ouvertes loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);

        execute format('create policy %I on %I for select using (true)',
                       'pol_' || t || '_lecture', t);
        execute format('create policy %I on %I for insert with check (true)',
                       'pol_' || t || '_ajout', t);
        execute format('create policy %I on %I for update using (true) with check (true)',
                       'pol_' || t || '_maj', t);
        execute format('create policy %I on %I for delete using (true)',
                       'pol_' || t || '_suppression', t);

        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_lecture', t,
            'Table de niveau Groupe ou de socle : aucune donnée de filiale, ou lecture '
            'nécessaire avant que le périmètre existe. La RLS est armée et explicite, mais '
            'ouverte : la protection de cette table est le modèle de droits vérifié côté '
            'serveur, pas le cloisonnement par filiale.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_ajout', t,
            'Écriture ouverte au rôle applicatif : c''est le contrôle des droits côté serveur, '
            'et les privilèges SQL, qui décident qui peut écrire ici.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_maj', t,
            'Idem ajout.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_suppression', t,
            'Idem ajout.');
    end loop;

    foreach t in array v_configuration loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);

        -- LECTURE ouverte : ces tables sont lues pour RÉSOUDRE les droits, donc avant que
        -- le périmètre existe. La conditionner serait circulaire.
        execute format('create policy %I on %I for select using (true)',
                       'pol_' || t || '_lecture', t);
        -- ÉCRITURE réservée à l'administration Groupe. f_administration_groupe() n'élargit
        -- jamais la lecture (§2), et le garde-fou du §8 refuse la migration si cette
        -- fonction venait à apparaître dans une politique de LECTURE.
        execute format('create policy %I on %I for insert with check (f_administration_groupe())',
                       'pol_' || t || '_ajout', t);
        execute format('create policy %I on %I for update using (f_administration_groupe()) '
                       'with check (f_administration_groupe())',
                       'pol_' || t || '_maj', t);
        execute format('create policy %I on %I for delete using (f_administration_groupe())',
                       'pol_' || t || '_suppression', t);

        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_lecture', t,
            'Lecture ouverte, et elle doit l''être : cette table est lue pour RÉSOUDRE les '
            'droits de la session, donc AVANT que le périmètre existe. La confidentialité de '
            'son contenu relève du domaine « droits » du modèle à trois axes, vérifié côté '
            'serveur (PLAN_SERVEUR §3.2).');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_ajout', t,
            'Écriture réservée à l''ADMINISTRATION GROUPE (grc.administration_groupe = ''oui''), '
            'corrigé à la porte de sécurité S1 (constat M-2, CONVENTIONS.md §17.4) : cette '
            'table PRODUIT la décision d''autorisation, la laisser réinscriptible par le rôle '
            'qui exécute le contrôle des droits rendait la défense circulaire. C''est une donnée '
            'de paramétrage, elle n''a pas à être écrite en fonctionnement courant.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_maj', t,
            'Idem ajout : administration Groupe seulement.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_suppression', t,
            'Idem ajout : administration Groupe seulement.');
    end loop;

    raise notice 'Famille 4 (Groupe et socle) : % tables ouvertes + % tables de configuration '
                 '(écriture réservée à l''administration Groupe) + journal_audit.',
                 array_length(v_ouvertes, 1), array_length(v_configuration, 1);
end;
$$;

-- -------------------------------------------------------------------------------------
-- journal_audit — traité à part, parce que sa lecture est une DÉROGATION ASSUMÉE qu'il
-- faut pouvoir expliquer devant un auditeur.
--
-- LECTURE OUVERTE. Ce n'est pas un oubli, c'est une contrainte technique du chaînage :
--   - f_journal_audit_chainage() (001) attribue « numero » à partir de max(numero) LU
--     DANS LA TABLE. Cette lecture se fait sous le rôle applicatif, donc sous RLS. Si
--     les entrées des autres filiales étaient invisibles, la numérotation repartirait
--     d'un numéro déjà pris : toute écriture au journal échouerait sur uq_journal_audit_numero.
--   - f_journal_audit_verifier() parcourt la chaîne. Cloisonnée, elle signalerait des
--     « numero_manquant » et des « chainage_rompu » imaginaires à chaque trou de
--     périmètre — c'est-à-dire qu'elle deviendrait inutilisable, précisément pour
--     l'usage d'audit qui la justifie.
-- Ces deux fonctions appartiennent au socle (001) et ne sont pas redéfinies ici.
--
-- CE QUI COMPENSE, et ce qui reste :
--   - l'ÉCRITURE, elle, est cloisonnée : une entrée ne peut être attribuée qu'à la
--     FILIALE ACTIVE de la session, ou à aucune (événement transversal, ou antérieur à
--     la résolution du périmètre — échec de connexion). Ce commentaire a dit deux
--     choses fausses avant de dire celle-ci, et les deux comptent :
--       * il parlait du périmètre de LECTURE, alors que le §11 exige la filiale ACTIVE
--         — corrigé au premier passage de la porte S1 (constat m-4) ;
--       * il affirmait ensuite que « personne ne peut fabriquer de preuve dans le
--         registre d'une autre filiale », alors que rien ne vérifiait que la filiale
--         active appartenait au périmètre lisible : une session lisant FIL-A et
--         déclarant FIL-B active écrivait chez B une entrée chaînée et scellée —
--         corrigé au second passage (constat bloquant N-1, §17.9), par la condition
--         d'appartenance de f_filiale_ecriture() (§2).
--     Les deux conditions étant désormais tenues PAR LA BASE, l'affirmation est vraie :
--     nul ne peut fabriquer de preuve dans le registre d'une filiale où il n'opère pas.
--   - l'ACTEUR de l'entrée vient de la session, plus du client : f_journal_audit_chainage()
--     (001) impose utilisateur_id = f_utilisateur_courant(), comme il impose déjà le
--     numéro, l'horodatage et les empreintes (CONVENTIONS §17.8).
--   - la consultation du journal est un DOMAINE fonctionnel à part (« journal »,
--     PLAN_SERVEUR §3.2), réservé au profil Administrateur et vérifié côté serveur.
--   - reste vrai, et doit être dit : un défaut de filtrage applicatif sur cette table
--     exposerait valeurs_avant / valeurs_apres d'autres filiales. C'est la seule table
--     du schéma pour laquelle la RLS n'est pas un filet de sécurité. Correction propre
--     à traiter en L5 : faire des deux fonctions de chaînage des « security definer »
--     appartenant à grc_proprietaire, avec une politique de lecture ciblée sur ce seul
--     rôle, puis resserrer la politique ci-dessous sur le périmètre.
-- -------------------------------------------------------------------------------------
alter table journal_audit enable row level security;
alter table journal_audit force row level security;

create policy pol_journal_audit_lecture on journal_audit for select
    using (true);

-- ÉCRITURE : sur la filiale ACTIVE, comme partout ailleurs dans le schéma.
--
-- Elle suivait le périmètre de LECTURE (« = any (f_filiales_autorisees()) ») — seule
-- politique d'écriture du schéma dans ce cas, et un écart au CONVENTIONS §11 relevé à la
-- porte de sécurité S1 (constat m-4). Un compte de périmètre Groupe pouvait attribuer une
-- entrée de journal à n'importe laquelle des vingt filiales, et non à celle qu'il avait
-- sélectionnée : c'est la valeur probante du registre de chaque filiale qui s'en trouvait
-- affaiblie, précisément ce que ce journal existe pour porter.
--
-- « case » et non « or », pour la raison exposée au §4 : l'ordre d'évaluation d'un « or »
-- n'est pas garanti, et f_filiale_ecriture() LÈVE GRC04 en l'absence de filiale active.
-- Une entrée transversale légitime — démarrage du service, échec de connexion, donc
-- ANTÉRIEURE à la résolution du périmètre — doit passer, pas échouer sur le membre droit
-- d'une disjonction évaluée en premier.
create policy pol_journal_audit_ajout on journal_audit for insert
    with check (case when filiale_id is null then true
                     else filiale_id = f_filiale_ecriture() end);

-- Modification et suppression OUVERTES — et c'est délibéré, contre l'intuition.
--
-- Il serait tentant de ne créer aucune politique : l'ajout seul gagnerait une cinquième
-- couche. Ce serait une erreur, pour la raison même qui a fait préférer des déclencheurs
-- à des « rule … do instead nothing » au CONVENTIONS §12 : une absence de politique ne
-- REFUSE pas l'opération, elle la rend SILENCIEUSE. « update journal_audit set … »
-- réussirait en n'affectant aucune ligne, et l'appelant croirait avoir agi.
--
-- Deux conséquences concrètes :
--   - les trois déclencheurs « enable always » du socle lèvent GRC01 avant tout filtrage
--     de lignes : c'est eux, et les privilèges, qui refusent BRUYAMMENT. Une politique
--     absente n'ajouterait rien tant qu'ils sont en place ;
--   - la procédure de rétention à trois ans (CONVENTIONS §12) désactive explicitement les
--     déclencheurs sous le compte propriétaire pour archiver puis purger un segment. Sans
--     politique, cette purge ne supprimerait RIEN tout en annonçant un succès — un journal
--     réputé purgé qui ne l'est pas, c'est un défaut de conformité, pas une protection.
create policy pol_journal_audit_maj on journal_audit for update
    using (true) with check (true);

create policy pol_journal_audit_suppression on journal_audit for delete
    using (true);

comment on policy pol_journal_audit_maj on journal_audit is
    'Ouverte À DESSEIN : l''ajout seul est garanti par les privilèges (couche 1) et par des '
    'déclencheurs « enable always » qui lèvent GRC01 (couches 2 et 3), c''est-à-dire '
    'BRUYAMMENT. Une politique absente rendrait au contraire l''opération silencieuse — '
    'exactement le défaut pour lequel CONVENTIONS §12 a écarté les « rule … do instead '
    'nothing » — et ferait échouer sans bruit la procédure de rétention à trois ans.';
comment on policy pol_journal_audit_suppression on journal_audit is
    'Ouverte à dessein, même raison que la politique de modification. Le refus vient de '
    'trg_journal_audit_interdit_suppr (GRC01), pas d''un filtrage de lignes muet.';

comment on policy pol_journal_audit_lecture on journal_audit is
    'DÉROGATION ASSUMÉE : lecture non cloisonnée. Le chaînage par empreinte (001) numérote '
    'chaque entrée à partir de max(numero) et la vérification parcourt toute la chaîne : '
    'cloisonner la lecture ferait échouer toute écriture au journal et rendrait la '
    'vérification d''intégrité ininterprétable. La confidentialité du journal relève ici du '
    'domaine « journal » du modèle de droits, vérifié côté serveur. Voir le commentaire '
    'détaillé dans 004_rls.sql §6.';
comment on policy pol_journal_audit_ajout on journal_audit is
    'Une entrée ne s''attribue qu''à la filiale ACTIVE de la session (CONVENTIONS.md §11), ou à '
    'aucune (événement transversal, ou antérieur à la résolution du périmètre : échec de '
    'connexion). Corrigé à la porte de sécurité S1 : elle suivait le périmètre de LECTURE, si '
    'bien qu''un compte de périmètre Groupe pouvait attribuer une trace à n''importe laquelle '
    'des filiales qu''il lit. '
    'Depuis le second passage de la porte S1, f_filiale_ecriture() vérifie en outre que cette '
    'filiale active appartient au périmètre LISIBLE (CONVENTIONS.md §17.9) : sans quoi une '
    'session lisant FIL-A et déclarant FIL-B active écrivait une entrée scellée chez B. '
    'Nul ne peut donc fabriquer de preuve dans le registre d''une filiale où il n''opère pas. '
    'L''ajout seul, lui, ne relève pas des politiques mais des privilèges et des '
    'déclencheurs du socle (CONVENTIONS §12) — voir les politiques de modification et de '
    'suppression, ouvertes à dessein.';

-- =====================================================================================
-- §7 — DÉCLENCHEURS DE COHÉRENCE : CE QU'AUCUNE CLÉ ÉTRANGÈRE NI AUCUNE POLITIQUE NE TIENT
-- -------------------------------------------------------------------------------------
-- Deux règles, deux raisons de ne pas être exprimables ailleurs :
--   (a) catalogue de mesures ↔ filiale — une clé étrangère composite est impossible,
--       mesure_catalogue.filiale_id étant nullable. Voir f_coherence_mesure_catalogue (§2) ;
--   (b) portée figée des tables mixtes — une politique RLS évalue son prédicat séparément
--       sur l'ancienne et la nouvelle ligne, et ne peut donc pas voir une TRANSITION.
--       Voir f_interdit_changement_portee (§2).
-- =====================================================================================

-- --- (a) les quatre tables qui référencent mesure_catalogue en portant un filiale_id ---
create trigger trg_mesure_mise_en_oeuvre_coherence_mesure
    before insert or update on mesure_mise_en_oeuvre
    for each row execute function f_coherence_mesure_catalogue();

create trigger trg_evaluation_mesures_coherence_mesure
    before insert or update on evaluation_mesures
    for each row execute function f_coherence_mesure_catalogue();

create trigger trg_actions_coherence_mesure
    before insert or update on actions
    for each row execute function f_coherence_mesure_catalogue();

create trigger trg_traitement_mesures_coherence_mesure
    before insert or update on traitement_mesures
    for each row execute function f_coherence_mesure_catalogue();

-- --- (b) les cinq tables MIXTES : une ligne ne change pas de portée --------------------
-- Mêmes cinq tables que la famille 2 (§4), et dans le même ordre : la liste doit se
-- relire d'un fichier à l'autre sans effort. Corrigé à la porte S1 (constat M-3).
--
-- La liste s'arrête là, et c'est le §17.7 qui dit pourquoi : « nullable » n'est pas
-- « mixte ». journal_audit, groupes_ad et sessions portent un filiale_id nullable pour une
-- raison chronologique ou technique, pas parce que leurs lignes auraient une PORTÉE. Elles
-- n'ont donc pas de déclencheur ici. Le banc d'essai balaie le catalogue avec exactement
-- cette exclusion (test/base/rls.test.mjs).
create trigger trg_parametres_portee_figee
    before update on parametres
    for each row execute function f_interdit_changement_portee();

create trigger trg_mesure_catalogue_portee_figee
    before update on mesure_catalogue
    for each row execute function f_interdit_changement_portee();

create trigger trg_personnes_portee_figee
    before update on personnes
    for each row execute function f_interdit_changement_portee();

create trigger trg_document_referentiels_portee_figee
    before update on document_referentiels
    for each row execute function f_interdit_changement_portee();

create trigger trg_documents_portee_figee
    before update on documents
    for each row execute function f_interdit_changement_portee();

-- --- (c) les neuf déclencheurs du §7 sont armés en « always » ------------------------
-- Constat N-11 du second passage de la porte S1 : ils étaient armés en « origin », alors
-- que les trois du journal d'audit (001 §9) sont en « always ». Sans effet aujourd'hui —
-- « session_replication_role » est refusé au rôle applicatif, vérifié aux deux passages,
-- et le propriétaire de la base est hors modèle de menace (CONVENTIONS §12) — mais ces
-- neuf déclencheurs portent désormais des garanties de CLOISONNEMENT opposables : la
-- cohérence du catalogue de mesures et la portée figée des tables mixtes. Ce qui porte une
-- garantie opposable s'arme comme tel, et l'écart avec le journal n'a pas de raison d'être.
--
-- Portée exacte, à ne pas surestimer : « always » ne change rien pour un attaquant qui ne
-- peut déjà pas poser le réglage. Il ferme le cas du jour où une réplication logique, un
-- outil de migration de données ou une reprise en masse basculerait la session en mode
-- « replica » — et désarmerait alors, silencieusement, tout ce qui n'est pas « always ».
do $$
declare
    v_declencheurs constant text[] := array[
        'mesure_mise_en_oeuvre:trg_mesure_mise_en_oeuvre_coherence_mesure',
        'evaluation_mesures:trg_evaluation_mesures_coherence_mesure',
        'actions:trg_actions_coherence_mesure',
        'traitement_mesures:trg_traitement_mesures_coherence_mesure',
        'parametres:trg_parametres_portee_figee',
        'mesure_catalogue:trg_mesure_catalogue_portee_figee',
        'personnes:trg_personnes_portee_figee',
        'document_referentiels:trg_document_referentiels_portee_figee',
        'documents:trg_documents_portee_figee'
    ];
    d text;
begin
    foreach d in array v_declencheurs loop
        execute format('alter table %I enable always trigger %I',
                       split_part(d, ':', 1), split_part(d, ':', 2));
    end loop;

    raise notice 'Déclencheurs de cohérence et de portée : % armés en « always ».',
                 array_length(v_declencheurs, 1);
end;
$$;

-- =====================================================================================
-- §8 — GARDE-FOU DE COUVERTURE
-- -------------------------------------------------------------------------------------
-- Le point le plus important du fichier après les politiques elles-mêmes : il garantit
-- qu'une migration future qui ajouterait une table sans politique ÉCHOUERA au
-- déploiement au lieu de fuir en silence — à condition qu'elle appelle, comme ici,
-- f_verifier_couverture_rls(). C'est aussi ce que vérifie le banc d'essai
-- (test/base/rls.test.mjs) et ce que montre db/verifier_cloisonnement.sql.
-- =====================================================================================

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('  - %s : %s (%s)', objet, anomalie, detail), E'\n' order by objet, anomalie),
           count(*)
      into v_anomalies, v_nombre
      from f_verifier_couverture_rls();

    if v_nombre > 0 then
        raise exception E'Couverture RLS incomplète — % anomalie(s) :\n%', v_nombre, v_anomalies
            using hint = 'Toute table du schéma public doit porter « enable » et « force row '
                         'level security », au moins une politique de lecture et une '
                         'd''écriture. Voir backend/db/CONVENTIONS.md §11 et le §8 de cette '
                         'migration.';
    end if;

    select count(*) into v_nombre
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public';

    raise notice 'Couverture RLS vérifiée : aucune anomalie, % politiques sur % tables.',
                 v_nombre,
                 (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity);
end;
$$;

-- -------------------------------------------------------------------------------------
-- §8 bis — TRAÇABILITÉ D'INSERTION, PUIS LE GARDE-FOU COMPLET
-- -------------------------------------------------------------------------------------
-- Les deux mêmes instructions qu'en fin des trois autres migrations (CONVENTIONS.md
-- §18.1 et §18.4). Ce fichier ne crée aucune table, mais il crée SIX fonctions de plus,
-- et f_verifier_schema() les couvre comme il couvre le reste : chemin de recherche figé,
-- traçabilité d'insertion, et — ici seulement, puisque c'est ce fichier qui la crée —
-- couverture RLS.
--
-- Le §18.4 est né de ce que la couverture RLS n'était vérifiée QUE par ce bloc : sur une
-- base à jour, les migrations ne sont pas rejouées, donc il ne s'exécutait plus jamais.
-- Une migration postérieure créant une table sans politique passait avec un code de sortie
-- zéro. Le garde-fou est désormais appelé par les quatre migrations, à travers le même
-- point d'appel — et la part « déploiement » (migrate.mjs, install.sh §9) est traitée
-- hors de ce fichier.
-- -------------------------------------------------------------------------------------
do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Traçabilité d''insertion : % déclencheur(s) posé(s).', v_poses;
end;
$$;

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('  - [%s] %s : %s (%s)', controle, objet, anomalie, detail),
                      E'\n' order by controle, objet, anomalie),
           count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception E'Vérification du schéma en défaut — % anomalie(s) :\n%',
                        v_nombre, v_anomalies
            using errcode = '42501',
                  hint = 'Voir backend/db/CONVENTIONS.md §18.4 et le §15 bis de 001_socle.sql.';
    end if;

    raise notice 'Schéma vérifié : % fonction(s) au chemin figé, % table(s) à la création tracée.',
                 (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.prokind in ('f', 'p')),
                 (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relkind in ('r', 'p')
                     and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                  and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped));
end;
$$;

-- =====================================================================================
-- §9 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('004', 'Cloisonnement : privilèges, Row Level Security sur les 47 tables (niveau '
               'filiale, mixte, liaisons sans filiale_id, niveau Groupe), cohérence du '
               'catalogue de mesures et garde-fou de couverture')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Rejouer ce bloc RETIRE LE CLOISONNEMENT : toutes les filiales redeviennent lisibles
-- les unes des autres. À n'exécuter qu'en développement, jamais en production.
--
-- begin;
--   drop trigger if exists trg_documents_portee_figee                 on documents;
--   drop trigger if exists trg_document_referentiels_portee_figee     on document_referentiels;
--   drop trigger if exists trg_personnes_portee_figee                 on personnes;
--   drop trigger if exists trg_mesure_catalogue_portee_figee          on mesure_catalogue;
--   drop trigger if exists trg_parametres_portee_figee                on parametres;
--   drop trigger if exists trg_traitement_mesures_coherence_mesure    on traitement_mesures;
--   drop trigger if exists trg_actions_coherence_mesure               on actions;
--   drop trigger if exists trg_evaluation_mesures_coherence_mesure    on evaluation_mesures;
--   drop trigger if exists trg_mesure_mise_en_oeuvre_coherence_mesure on mesure_mise_en_oeuvre;
--
--   do $$
--   declare t text;
--   begin
--       for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--                 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
--       loop
--           execute format('alter table %I no force row level security', t);
--           execute format('alter table %I disable row level security', t);
--       end loop;
--       for t in select format('drop policy %I on %I', p.polname, c.relname)
--                  from pg_policy p join pg_class c on c.oid = p.polrelid
--                  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
--       loop
--           execute t;
--       end loop;
--   end;
--   $$;
--
--   drop function if exists f_verifier_couverture_rls();
--   drop function if exists f_interdit_changement_portee();
--   drop function if exists f_coherence_mesure_catalogue();
--   drop function if exists f_administration_groupe();
--   drop function if exists f_filiale_ecriture();
--   drop function if exists f_filiales_lecture();
--
--   -- Les privilèges retirés au §1 ne sont PAS rétablis : les rendre serait rouvrir le
--   -- contournement du garde-fou anti-réécriture de migration.
--   delete from migrations_schema where version = '004';
-- commit;
-- =====================================================================================
