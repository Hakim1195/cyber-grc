-- =====================================================================================
-- 001_socle.sql — Tables du socle de l'application Cyber GRC Groupe
-- =====================================================================================
-- Lot L1 (schéma relationnel), partie 1/3 : le socle.
-- Référence de cadrage : docs/PLAN_SERVEUR.md §2.3 (tables du socle), §1.7 (journal
-- inaltérable), §2.4 (cloisonnement), §3 (modèle de droits).
-- Conventions applicables : backend/db/CONVENTIONS.md — ce fichier en est la mise en
-- oeuvre de référence ; les migrations métier (002, 003, …) s'y conforment.
--
-- Contenu :
--   §0  Gardes et privilèges par défaut
--   §1  Domaines partagés (vocabulaire du schéma)
--   §2  Fonctions partagées du socle
--   §3  Registre des migrations
--   §4  profils / profil_domaines .................. profils métier configurables
--   §5  filiales ................................... l'entité de cloisonnement
--   §6  utilisateurs ............................... identités AD + compte de secours
--   §7  groupes_ad ................................. correspondance AD -> filiale + profil
--   §8  sessions (+ périmètre et droits résolus) ... sessions serveur
--   §9  journal_audit .............................. AJOUT SEUL, chaîné par empreinte
--   §10 pieces_jointes ............................. métadonnées, SHA-256, antivirus
--   §11 approbations ............................... circuit de validation irréversible
--   §12 referentiels_actifs ........................ référentiels activés par filiale
--   §13 imports (+ import_erreurs) ................. traçabilité des imports
--   §14 parametres ................................. configuration (SMTP, seuils, rétention)
--   §15 Privilèges
--   §15 bis Garde-fou : le chemin de recherche de chaque fonction est figé
--   §16 Enregistrement de la migration
--
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 001_socle.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — GARDES ET PRIVILÈGES PAR DÉFAUT
-- =====================================================================================

-- PostgreSQL 15 minimum : « unique nulls not distinct » (§14 parametres) et sha256() natif.
do $$
begin
    if current_setting('server_version_num')::integer < 150000 then
        raise exception
            'PostgreSQL 15 minimum requis, version trouvée : %. Voir backend/db/CONVENTIONS.md §1.',
            current_setting('server_version');
    end if;
end;
$$;

-- Privilèges par défaut posés AVANT la création des tables : les migrations suivantes
-- n'ont ainsi pas à répéter leurs « grant ». Silencieux si les rôles n'existent pas
-- encore (poste de développement) — ils sont créés par le lot L0.
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant usage on schema public to grc_app';
        execute format(
            'alter default privileges for role %I in schema public '
            'grant select, insert, update, delete on tables to grc_app', current_user);
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant usage on schema public to grc_lecture';
        execute format(
            'alter default privileges for role %I in schema public '
            'grant select on tables to grc_lecture', current_user);
    end if;
end;
$$;

-- =====================================================================================
-- §1 — DOMAINES PARTAGÉS
-- Le vocabulaire du schéma est centralisé ici : une valeur admise se lit à un seul
-- endroit, et s'étend par « alter domain » dans la migration qui en a besoin.
-- Pas de type « enum » PostgreSQL : les valeurs métier sont des chaînes françaises
-- accentuées déjà produites par le frontend, et le round-trip grc-backup doit les
-- restituer à l'identique (CONVENTIONS.md §5).
-- =====================================================================================

-- Identifiant métier : on conserve le format de l'application existante
-- « <PRÉFIXE>-<horodatage>-<aléa> » (UI.genId) pour que l'import d'un export
-- grc-backup soit un round-trip exact. Volontairement permissif : les exports anciens
-- contiennent des identifiants sans suffixe aléatoire, voire sans préfixe (processus BIA).
create domain id_metier as text
    check (value <> ''
       and length(value) <= 64
       -- Deux caractères, et deux seulement, sont refusés (CONVENTIONS.md §17.3) :
       --   * la VIRGULE — le périmètre de session transite en chaîne jointe par virgules
       --     (grc.filiales, lu par string_to_array au §2). Un identifiant de filiale valant
       --     « FIL-A,FIL-B » scinderait le périmètre en DEUX entrées et accorderait la
       --     lecture de deux filiales. Aucun chemin ne permet aujourd'hui de choisir un
       --     identifiant de filiale (la création de filiale est le lot L4) : c'est une
       --     mesure de défense en profondeur, fermée maintenant parce que le domaine est
       --     en train d'être figé et qu'un « alter domain » sur une base peuplée coûte
       --     bien davantage ;
       --   * l'ESPACE EN TÊTE OU EN FIN (espace, tabulation, retour chariot, saut de
       --     ligne) — invisible à l'oeil, il fait de « RISK-1 » et « RISK-1 » deux clés
       --     distinctes et casse silencieusement le round-trip grc-backup.
       -- Le domaine reste VOLONTAIREMENT permissif par ailleurs (§2) : la reprise
       -- d'exports anciens en dépend. On ferme deux caractères, on ne durcit pas le format.
       and value !~ ','
       and value = btrim(value, E' \t\r\n'));

comment on domain id_metier is
    'Clé primaire métier au format "<PRÉFIXE>-<horodatage>-<aléa>" (ex. RISK-1720000000000-482). '
    'Ni UUID ni serial : le format de l''application navigateur est conservé pour garantir '
    'un round-trip exact à l''import d''un export grc-backup.';

create domain empreinte_sha256 as text
    check (value ~ '^[0-9a-f]{64}$');

comment on domain empreinte_sha256 is 'Empreinte SHA-256, 64 caractères hexadécimaux minuscules.';

create domain code_langue as text
    check (value in ('fr', 'en', 'es'));

comment on domain code_langue is
    'Langue d''interface. Français et anglais obligatoires, espagnol souhaitable (PLAN_SERVEUR §0.2).';

create domain niveau_droit as text
    check (value in ('aucun', 'lecture', 'contribution', 'validation', 'administration'));

comment on domain niveau_droit is
    'Troisième axe du modèle de droits (PLAN_SERVEUR §3.1). "aucun" ferme explicitement un domaine.';

-- Les 30 domaines fonctionnels de l'application, alignés sur le menu et les modules.
-- « matrice » n'y figure pas : c'est une vue du domaine « risques ».
create domain domaine_fonctionnel as text
    check (value in (
        'tableau_de_bord', 'synthese', 'echeances',
        'donneurs_ordre', 'personnel',
        'actifs', 'cartographie', 'risques',
        'exigences', 'referentiels', 'mesures', 'correspondances',
        'actions', 'incidents', 'documents', 'rgpd',
        'bia', 'crise', 'pra', 'mco', 'tests_pra', 'prestataires',
        'audits', 'revues',
        'pieces_jointes', 'imports',
        'parametres', 'filiales', 'droits', 'journal'
    ));

comment on domain domaine_fonctionnel is
    'Domaine fonctionnel auquel un profil métier donne accès (PLAN_SERVEUR §3.2).';

-- Entités adressables : rattachement d'une pièce jointe, cible d'une entrée de journal,
-- entité visée par un import. Les noms reprennent ceux du DATA_MODEL.
-- « mesure_catalogue » / « mesure_mise_en_oeuvre » sont déjà admis : la scission de
-- l'entité « mesures » entre niveau Groupe et niveau filiale intervient au lot L4
-- (PLAN_SERVEUR §2.2), sans qu'il faille alors toucher au domaine.
create domain type_entite as text
    check (value in (
        'clients', 'personnes', 'exigences', 'actions', 'risques', 'actifs', 'processus',
        'crise', 'scenarios_pra', 'tests_pra', 'prestataires', 'mco_actions',
        'audits', 'revues', 'evaluations',
        'mesures', 'mesure_catalogue', 'mesure_mise_en_oeuvre',
        'incidents', 'documents', 'traitements', 'mappings', 'history',
        'filiales', 'utilisateurs', 'profils', 'groupes_ad', 'sessions',
        'referentiels_actifs', 'pieces_jointes', 'approbations', 'imports', 'parametres'
    ));

comment on domain type_entite is
    'Entité désignée par un rattachement polymorphe (pièce jointe, entrée de journal, import).';

-- =====================================================================================
-- §2 — FONCTIONS PARTAGÉES DU SOCLE
-- Réutilisées par toutes les migrations. Ne pas en écrire de variantes.
-- Toutes en « security invoker » (défaut) : aucune n'est un contournement de droits.
--
-- ── CHEMIN DE RECHERCHE FIGÉ (CONVENTIONS.md §17.2) ─────────────────────────────────
--
-- CHAQUE fonction de ce fichier porte « set search_path = pg_catalog, public, pg_temp ».
-- Ce n'est pas une précaution de style, c'est la fermeture d'une attaque REPRODUITE à la
-- porte de sécurité S1 : PostgreSQL consulte le schéma temporaire de la session AVANT le
-- chemin de recherche, y compris quand celui-ci est explicitement fixé à « public » — ce
-- que fait pourtant le pool (src/db/pool.ts, « -c search_path=public »). Un rôle
-- disposant du privilège « temporary » masque alors n'importe quelle table du schéma par
-- une table temporaire de son cru, et détourne la fonction qui la lit : forge d'une
-- entrée de journal au chaînage rompu, désarmement du déclencheur de cohérence des
-- mesures, garde-fou de couverture RLS rendu aveugle.
--
-- LA POSITION DE « pg_temp » DANS LA LISTE EST LA MESURE ELLE-MÊME, et elle est
-- contre-intuitive : tant que pg_temp n'est PAS nommé, il est consulté EN PREMIER, avant
-- même pg_catalog. Le nommer en DERNIER est ce qui le relègue derrière public. Vérifié en
-- exécution sur PostgreSQL 16.13 :
--
--     search_path = pg_catalog, essai              -> la fonction lit la table TEMPORAIRE
--     search_path = pg_catalog, essai, pg_temp     -> la fonction lit la table réelle
--
-- Écrire « set search_path = pg_catalog, public » — sans pg_temp — ne fermerait donc
-- RIEN. Le §15 bis de ce fichier refuse la migration si une fonction du schéma oublie ce
-- réglage ou omet d'y nommer pg_temp.
--
-- CONSÉQUENCE À CONNAÎTRE, relevée au second passage de la porte S1 (constat N-7) : le
-- « -c search_path=public » que pose le pool à la connexion n'est PLUS une mesure de
-- sécurité, seulement une commodité — il ne protégeait de toute façon rien, pg_temp étant
-- consulté avant lui. Ce qui protège est ici, sur chaque fonction, et une session psql
-- ordinaire (dont le chemin vaut « "$user", public ») est désormais exactement aussi sûre
-- qu'une connexion du service. Ne pas rétablir la confusion en présentant le réglage de
-- connexion comme une défense.
--
-- Corollaire d'exploitation, HORS de ce fichier et qui reste dû : le privilège
-- « temporary » doit être retiré au rôle applicatif sur toute base — développement et
-- recette compris (db/dev/preparer_base_dev.sh). La production le refusait déjà, mais par
-- accident : deploy/install.sh fait « revoke all on database … from public », ce qui
-- retire TEMPORARY au passage.
-- =====================================================================================

-- Contexte de la transaction, positionné par le service applicatif :
--     set local grc.utilisateur = 'jdupont';
--     set local grc.filiale_id  = 'FIL-…';
--     set local grc.filiales    = 'FIL-…,FIL-…';
-- « set local » garantit que le réglage meurt avec la transaction, y compris dans un
-- pool de connexions. Ces valeurs viennent de la SESSION SERVEUR, jamais du navigateur.

create or replace function f_utilisateur_courant() returns text
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select coalesce(nullif(current_setting('grc.utilisateur', true), ''), 'systeme');
$$;

comment on function f_utilisateur_courant() is
    'Identifiant de l''utilisateur de la transaction (grc.utilisateur) ; "systeme" hors session '
    '(migrations, timers systemd). Alimente cree_par / modifie_par.';

create or replace function f_filiale_courante() returns text
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select nullif(current_setting('grc.filiale_id', true), '');
$$;

comment on function f_filiale_courante() is
    'Filiale active de la session (grc.filiale_id) : périmètre d''ÉCRITURE. Support des '
    'politiques RLS créées par la migration dédiée (CONVENTIONS.md §11).';

create or replace function f_filiales_autorisees() returns text[]
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select coalesce(
        string_to_array(nullif(current_setting('grc.filiales', true), ''), ','),
        array[]::text[]);
$$;

comment on function f_filiales_autorisees() is
    'Périmètre résolu de la session (grc.filiales) : périmètre de LECTURE, une ou plusieurs '
    'filiales, ou toutes pour un accès Groupe. Tableau vide = aucun accès.';

-- Génération d'identifiant côté serveur, strictement identique à UI.genId du frontend :
-- <PRÉFIXE>-<millisecondes>-<aléa 0..999>.
create or replace function f_generer_id(p_prefixe text) returns id_metier
    language sql volatile
    set search_path = pg_catalog, public, pg_temp as
$$
    select (upper(p_prefixe) || '-'
            || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '-'
            || floor(random() * 1000)::integer::text)::id_metier;
$$;

comment on function f_generer_id(text) is
    'Identifiant métier au format de UI.genId (frontend). Pour les insertions faites côté '
    'serveur : imports, provisionnement, tâches planifiées.';

-- Traçabilité + verrouillage optimiste. Le client ne fixe jamais lui-même « version » :
-- il transmet la version qu'il a lue dans le « where », et ce déclencheur incrémente.
create or replace function f_maj_tracabilite() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    new.version     := old.version + 1;
    new.modifie_le  := now();
    new.modifie_par := f_utilisateur_courant();
    new.cree_le     := old.cree_le;    -- non réinscriptible
    new.cree_par    := old.cree_par;   -- non réinscriptible
    return new;
end;
$$;

comment on function f_maj_tracabilite() is
    'Déclencheur "before update" obligatoire sur toute table métier : incrémente version '
    '(verrouillage optimiste), horodate la modification et gèle cree_le / cree_par.';

-- Variante pour les tables filles et de liaison, qui ne portent pas de « version »
-- (la version est celle de l'entité parente).
create or replace function f_maj_horodatage() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    new.modifie_le  := now();
    new.modifie_par := f_utilisateur_courant();
    new.cree_le     := old.cree_le;
    new.cree_par    := old.cree_par;
    return new;
end;
$$;

comment on function f_maj_horodatage() is
    'Variante de f_maj_tracabilite() pour les tables filles / de liaison, sans colonne version.';

-- ── CE QUI MANQUAIT : L'INSERTION (CONVENTIONS.md §18.1) ────────────────────────────
--
-- f_maj_tracabilite() ci-dessus protège l'« update ». L'« insert » n'était protégé par
-- RIEN. Les colonnes « version integer not null default 1 » et « cree_par text not null
-- default f_utilisateur_courant() » ne portent que des VALEURS PAR DÉFAUT, et une valeur
-- par défaut n'est pas une contrainte : elle ne s'applique que si l'appelant se tait.
--
-- Constat T-1 du troisième passage de la porte de sécurité S1, et il met en échec le
-- contrôle S4 de la grille, dont le texte de preuve dit « le client ne peut pas fixer
-- version ». Il le pouvait — à la création :
--
--     insert into risques (id, filiale_id, nom, cree_par, cree_le)
--       values ('R-USURPE','FIL-A','Risque accepté par la direction',
--               'marc.dupuis (DG)','2024-01-15');                      INSERT 0 1
--
-- La ligne se présente alors comme créée quinze mois plus tôt par le directeur général.
-- Et le pire vient ensuite : f_maj_tracabilite() GÈLE cree_le et cree_par à chaque
-- modification, si bien que la forgerie devient DÉFINITIVE ET INALTÉRABLE. Le mécanisme
-- qui protège la vérité protégeait le mensonge. C'est mot pour mot la pathologie que le
-- §17.8 décrit pour le journal d'audit — « un journal inaltérable dont l'acteur est
-- déclaré par le client garantit l'intégrité d'une fausse preuve » — laissée ouverte sur
-- les 42 tables qui portent une traçabilité.
--
-- Second effet, sur la disponibilité de la donnée et non sur sa preuve : une ligne créée
-- avec « version = 2147483647 » devenait DÉFINITIVEMENT IMMODIFIABLE, chaque tentative
-- débordant l'entier signé dans « new.version := old.version + 1 » — et l'erreur avortait
-- la transaction entière. Imposer la version à l'insertion fait disparaître ce cas de
-- lui-même : la valeur ne peut plus venir de l'appelant.
--
-- CE QUE LE CLIENT ENVOIE EST IGNORÉ, JAMAIS REFUSÉ. Un export grc-backup contient ces
-- colonnes, et la reprise ne doit pas échouer pour autant : elle doit simplement ne pas
-- les croire. Conséquence à assumer, et elle est juste : à l'import, l'auteur tracé est
-- CELUI QUI IMPORTE, à la date de l'import — car la création de la ligne *dans ce
-- système*, c'est l'import. L'historique d'origine, s'il faut le conserver, est une donnée
-- métier, pas une colonne de traçabilité (CONVENTIONS.md §18.1).
--
-- TROIS FORMES, PARCE QUE LE SCHÉMA EN A TROIS. Chaque fonction d'initialisation est le
-- miroir exact de la fonction de mise à jour qui lui correspond, et n'écrit que des
-- colonnes que sa famille de tables possède — une fonction PL/pgSQL qui référencerait un
-- champ absent échouerait à l'exécution.
--
--   f_init_tracabilite()  <-> f_maj_tracabilite()  : version + création + modification
--   f_init_horodatage()   <-> f_maj_horodatage()   : création + modification, sans version
--   f_init_creation()     <-> (aucune)             : création seule — tables de liaison et
--                                                    « sessions », qui ne se modifient pas
create or replace function f_init_tracabilite() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    new.version     := 1;
    new.cree_le     := now();
    new.cree_par    := f_utilisateur_courant();
    new.modifie_le  := null;   -- une ligne qui naît n'a jamais été modifiée
    new.modifie_par := null;
    return new;
end;
$$;

comment on function f_init_tracabilite() is
    'Déclencheur "before insert" obligatoire sur toute table portant le bloc du §3 : impose '
    'version = 1, la date et l''auteur de création, et annule les colonnes de modification. '
    'Miroir de f_maj_tracabilite(). Ce que l''appelant envoie dans ces colonnes est IGNORÉ, '
    'jamais refusé — un export grc-backup en contient (CONVENTIONS.md §18.1).';

create or replace function f_init_horodatage() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    new.cree_le     := now();
    new.cree_par    := f_utilisateur_courant();
    new.modifie_le  := null;
    new.modifie_par := null;
    return new;
end;
$$;

comment on function f_init_horodatage() is
    'Variante de f_init_tracabilite() pour les tables sans colonne "version" mais qui gardent '
    'une trace de modification. Miroir de f_maj_horodatage().';

create or replace function f_init_creation() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    new.cree_le  := now();
    new.cree_par := f_utilisateur_courant();
    return new;
end;
$$;

comment on function f_init_creation() is
    'Variante minimale pour les tables qui n''enregistrent QUE leur création : les liaisons n-n '
    '(une liaison se crée et se supprime, elle ne se modifie pas — CONVENTIONS.md §3) et '
    '"sessions". Aucune colonne de modification à annuler.';

-- ── POSE ET VÉRIFICATION, PILOTÉES PAR LE CATALOGUE ─────────────────────────────────
--
-- Deux fonctions plutôt qu'une liste de tables recopiée dans chaque migration. La liste se
-- serait désynchronisée au premier ajout d'entité — c'est exactement l'omission qui a
-- produit le constat bloquant B-1, et le remède est le même : découvrir plutôt qu'énumérer.
--
-- Toute migration qui crée des tables appelle f_poser_tracabilite_insertion() en fin de
-- fichier, puis le garde-fou du §15 ter la vérifie. Une migration future qui oublierait
-- l'appel échouera au déploiement au lieu de livrer des tables dont l'appelant fixe la
-- traçabilité.
create or replace function f_poser_tracabilite_insertion() returns integer
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r       record;
    v_pose  integer := 0;
begin
    for r in
        select c.relname::text as nom,
               exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'version' and a.attnum > 0 and not a.attisdropped) as a_version,
               exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'modifie_le' and a.attnum > 0 and not a.attisdropped) as a_modifie
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           -- « cree_par » est le marqueur d'une table qui trace sa création. journal_audit
           -- ne l'a pas (il porte « horodatage » et son propre déclencheur de chaînage), et
           -- migrations_schema non plus : les deux sont donc naturellement hors champ.
           and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped)
           and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid
                            and not t.tgisinternal and t.tgname = 'trg_' || c.relname || '_creation')
         order by c.relname
    loop
        execute format(
            'create trigger %I before insert on %I for each row execute function %I()',
            'trg_' || r.nom || '_creation', r.nom,
            case when r.a_version then 'f_init_tracabilite'
                 when r.a_modifie then 'f_init_horodatage'
                 else 'f_init_creation' end);
        -- Armé en « always », comme les déclencheurs de cohérence et de portée (004 §7 c) :
        -- ce qui porte une garantie opposable ne se désarme pas par un réglage de session.
        execute format('alter table %I enable always trigger %I',
                       r.nom, 'trg_' || r.nom || '_creation');
        v_pose := v_pose + 1;
    end loop;

    return v_pose;
end;
$$;

comment on function f_poser_tracabilite_insertion() is
    'Pose, sur toute table portant "cree_par" qui n''en a pas déjà un, le déclencheur '
    '"before insert" adapté à sa forme (CONVENTIONS.md §18.1). Idempotente, pilotée par le '
    'catalogue : à appeler en fin de TOUTE migration qui crée des tables. Rend le nombre de '
    'déclencheurs posés.';

create or replace function f_verifier_tracabilite()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare r record;
begin
    for r in
        select c.relname::text as nom,
               exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'version' and a.attnum > 0 and not a.attisdropped) as a_version,
               exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'modifie_le' and a.attnum > 0 and not a.attisdropped) as a_modifie,
               (select p.proname::text from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                 where t.tgrelid = c.oid and not t.tgisinternal
                   and t.tgname = 'trg_' || c.relname || '_creation') as fonction,
               (select t.tgenabled from pg_trigger t
                 where t.tgrelid = c.oid and not t.tgisinternal
                   and t.tgname = 'trg_' || c.relname || '_creation') as armement
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped)
         order by c.relname
    loop
        objet := r.nom;

        if r.fonction is null then
            anomalie := 'creation_non_tracee';
            detail   := 'la table porte « cree_par » mais aucun déclencheur « before insert » : '
                        'l''appelant fixe lui-même version, cree_le et cree_par';
            return next;
        elsif r.fonction <> (case when r.a_version then 'f_init_tracabilite'
                                  when r.a_modifie then 'f_init_horodatage'
                                  else 'f_init_creation' end) then
            anomalie := 'creation_mal_tracee';
            detail   := format('déclencheur « %s » sur une table dont la forme en appelle un autre',
                               r.fonction);
            return next;
        elsif r.armement <> 'A' then
            anomalie := 'creation_desarmable';
            detail   := 'déclencheur armé en « origin » : un réglage de session le désarmerait';
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_tracabilite() is
    'Vérifie que TOUTE table portant "cree_par" a le déclencheur "before insert" adapté à sa '
    'forme, armé en « always » (CONVENTIONS.md §18.1). Un schéma sain ne renvoie AUCUNE ligne. '
    'Sans ce déclencheur, l''appelant fixe lui-même version, cree_le et cree_par — et le gel '
    'opéré ensuite par f_maj_tracabilite() rend la valeur forgée définitive.';

-- ── UN GARDE-FOU QUE RIEN N'APPELLE EST UN COMMENTAIRE (CONVENTIONS.md §18.4) ───────
--
-- Constat T-4 du troisième passage de la porte S1, et c'est le plus embarrassant des
-- quatre : f_verifier_couverture_rls() était écrite, correcte, testée, montrée à
-- l'auditeur — et appelée par la seule migration 004. Sur une base à jour, les migrations
-- ne sont pas rejouées : le garde-fou ne s'exécutait donc plus jamais. Une migration
-- postérieure créant une table sans politique passait avec un code de sortie zéro, et une
-- base sabotée à la main se déclarait conforme.
--
-- Cette fonction est le point d'appel UNIQUE que toute migration invoque en fin de
-- fichier. Elle agrège les trois vérifications de schéma du dépôt et les rend sous la
-- même forme (objet, anomalie, detail) ; un schéma sain ne renvoie aucune ligne.
--
-- POURQUOI « si elle existe » POUR LA COUVERTURE RLS. Le découpage du lot L1
-- (CONVENTIONS §16.1) veut que les politiques soient créées par 004 et par elle seule :
-- 001, 002 et 003 s'exécutent donc dans un schéma qui n'a légitimement aucune politique,
-- et f_verifier_couverture_rls() n'y existe même pas encore. Le renvoi conditionnel dit
-- cette dépendance au lieu de la taire — et, sur toute base où 004 est déjà appliquée,
-- une migration 005 qui appelle cette fonction est bel et bien couverte.
create or replace function f_verifier_schema()
returns table (controle text, objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    return query
        select 'chemin_recherche'::text, v.objet, v.anomalie, v.detail
          from f_verifier_chemin_recherche() v;

    return query
        select 'tracabilite'::text, v.objet, v.anomalie, v.detail
          from f_verifier_tracabilite() v;

    if to_regprocedure('public.f_verifier_couverture_rls()') is not null then
        return query execute
            'select ''couverture_rls''::text, v.objet, v.anomalie, v.detail
               from f_verifier_couverture_rls() v';
    end if;

    return;
end;
$$;

comment on function f_verifier_schema() is
    'Point d''appel UNIQUE des vérifications automatiques du schéma (CONVENTIONS.md §18.4) : '
    'chemin de recherche figé, traçabilité imposée à l''insertion, et couverture RLS lorsque '
    'la fonction qui la porte existe (elle est créée par 004, cf. §16.1). Un schéma sain ne '
    'renvoie AUCUNE ligne. À appeler en fin de TOUTE migration, et à faire échouer le '
    'déploiement sur la moindre ligne rendue : écrire le contrôle est la moitié du travail, '
    'le brancher est l''autre moitié.';

-- Garde générique d'ajout seul. Utilisée par journal_audit (§9).
-- Un déclencheur plutôt qu'une « rule … do instead nothing » : une règle transforme la
-- suppression en opération silencieuse qui RÉUSSIT — l'appelant croit avoir supprimé et
-- personne n'est alerté. Ici l'opération échoue bruyamment et laisse une trace. Les règles
-- ne couvrent d'ailleurs pas TRUNCATE.
create or replace function f_interdit_modification() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    raise exception
        'Table % en ajout seul : opération % refusée.', tg_table_name, tg_op
        using errcode = 'GRC01',
              hint    = 'Une entrée de journal ne se corrige pas : ajoutez une nouvelle entrée '
                        'décrivant la correction. Voir backend/db/CONVENTIONS.md §12.';
    return null;
end;
$$;

comment on function f_interdit_modification() is
    'Déclencheur de refus (SQLSTATE GRC01) : bloque update / delete / truncate sur une table '
    'en ajout seul, y compris pour le propriétaire applicatif.';

-- -------------------------------------------------------------------------------------
-- Garde-fou du chemin de recherche (CONVENTIONS.md §17.2).
--
-- Une fonction dont le search_path n'est pas figé est détournable par masquage pg_temp
-- (voir l'en-tête du §2). Cette vérification balaie le catalogue plutôt que d'énumérer
-- les fonctions : c'est ce qui la rend valable pour les migrations à venir, qui n'ont
-- qu'à l'appeler pour refuser de s'appliquer si elles ont oublié le réglage.
--
-- Elle exige DEUX choses, et la seconde est celle qu'on oublie :
--   1. un réglage « search_path » dans proconfig — sinon le chemin est celui de la
--      session appelante, que l'appelant choisit ;
--   2. la mention EXPLICITE de « pg_temp » dans ce réglage — sinon le schéma temporaire
--      est consulté EN PREMIER et le réglage ne ferme rien. C'est le point démontré à la
--      porte S1, et c'est pourquoi ce garde-fou ne se contente pas de « proconfig non vide ».
--
-- Un schéma sain ne renvoie AUCUNE ligne — même idiome que f_journal_audit_verifier().
-- Portée exacte, à ne pas surestimer : ce garde-fou lit une DÉCLARATION, pas un
-- comportement. Il ne dit rien de ce que la fonction fait de son chemin une fois figé.
-- -------------------------------------------------------------------------------------
create or replace function f_verifier_chemin_recherche()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r        record;
    v_chemin text;
begin
    for r in
        select p.oid,
               p.proname::text as nom,
               pg_get_function_identity_arguments(p.oid) as arguments,
               p.proconfig
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         -- « f » ET « p » : une PROCÉDURE est tout aussi détournable qu'une fonction, et
         -- le commentaire ci-dessous dit « toute fonction du schéma ». Il n'y en a aucune
         -- aujourd'hui ; le balayage ne doit pas attendre la première (constat T-10).
         where n.nspname = 'public' and p.prokind in ('f', 'p')
         order by p.proname, pg_get_function_identity_arguments(p.oid)
    loop
        objet := r.nom || '(' || r.arguments || ')';

        select c into v_chemin
          from unnest(coalesce(r.proconfig, array[]::text[])) as c
         where c like 'search_path=%'
         limit 1;

        if v_chemin is null then
            anomalie := 'search_path_non_fige';
            detail   := 'la fonction n''a pas « set search_path » : son chemin de recherche est '
                        'celui de la session appelante, et pg_temp y est consulté en premier';
            return next;
        elsif v_chemin not like '%pg_temp%' then
            anomalie := 'pg_temp_non_relegue';
            detail   := format('search_path figé mais sans pg_temp explicite (%s) : le schéma '
                               'temporaire reste consulté EN PREMIER, le réglage ne ferme rien',
                               v_chemin);
            return next;
        -- Le §17.2 exige pg_temp NOMMÉ *et* NOMMÉ EN DERNIER. Ce garde-fou ne vérifiait
        -- que la première moitié : « set search_path = pg_temp, pg_catalog, public » — qui
        -- ne ferme évidemment rien — passait sans un mot. Constat T-10 du troisième
        -- passage, et c'est précisément ce que le §17.5 range parmi les garde-fous qui
        -- endorment la vigilance : affirmer plus qu'on ne vérifie.
        elsif btrim(split_part(v_chemin, ',', array_length(string_to_array(v_chemin, ','), 1)))
              <> 'pg_temp' then
            anomalie := 'pg_temp_mal_place';
            detail   := format('pg_temp est nommé mais pas EN DERNIER (%s) : tout schéma placé '
                               'après lui est consulté après le schéma temporaire, qui reprend '
                               'donc la main sur ce qui le suit',
                               v_chemin);
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_chemin_recherche() is
    'Vérifie que TOUTE fonction ET TOUTE PROCÉDURE du schéma public fige son chemin de '
    'recherche, y nomme explicitement pg_temp, ET l''y nomme EN DERNIER (CONVENTIONS.md §17.2). Un schéma sain ne renvoie AUCUNE ligne. '
    'À appeler par toute migration future qui crée une fonction : un chemin de recherche non '
    'figé est détournable par masquage pg_temp. Ce garde-fou lit une DÉCLARATION, pas un '
    'comportement : il ne dit rien de ce que la fonction fait de son chemin une fois figé.';

-- =====================================================================================
-- §3 — REGISTRE DES MIGRATIONS
-- Créé avec « if not exists » car 001 est la première migration et doit pouvoir
-- s'enregistrer elle-même. AUCUNE autre migration ne recrée cette table.
-- =====================================================================================

create table if not exists migrations_schema (
    version      text primary key,
    nom          text        not null,
    applique_le  timestamptz not null default now(),
    applique_par text        not null default f_utilisateur_courant(),
    empreinte    empreinte_sha256
);

comment on table migrations_schema is
    'Registre des migrations appliquées. Une migration déjà enregistrée ne doit jamais être '
    'rejouée ni réécrite (CONVENTIONS.md §13).';
comment on column migrations_schema.empreinte is
    'Empreinte SHA-256 du fichier de migration appliqué, pour détecter une réécriture a posteriori.';

-- =====================================================================================
-- §4 — PROFILS MÉTIER (niveau Groupe)
-- Les profils sont CONFIGURABLES, pas figés dans le code : c'est ce qui rend le socle
-- réutilisable chez un autre client (PLAN_SERVEUR §0.5 et §3.2). Aucun profil n'est
-- inséré ici : le peuplement relève des données de socle, pas du schéma.
-- =====================================================================================

create table profils (
    id            id_metier   not null,
    code          text        not null,
    nom           text        not null,
    description   text,
    niveau_defaut niveau_droit not null default 'lecture',
    socle         boolean     not null default false,
    actif         boolean     not null default true,
    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,
    constraint pk_profils        primary key (id),
    constraint uq_profils_code   unique (code),
    constraint ck_profils_code   check (code ~ '^[A-Z0-9_]{2,20}$'),
    constraint ck_profils_nom    check (nom <> '')
);

create trigger trg_profils_maj before update on profils
    for each row execute function f_maj_tracabilite();

comment on table profils is
    'Profil métier : deuxième axe du modèle de droits (PLAN_SERVEUR §3.1). Détermine les '
    'domaines accessibles via profil_domaines. Profils prévus : RSSI, CONTRIB, QUALITE, RH, '
    'DPO, DIRECTION, AUDITEUR, ADMIN — configurables, non figés dans le code.';
comment on column profils.code is
    'Code court, en majuscules : c''est le suffixe du groupe AD (GRC-<FILIALE>-<CODE>). '
    'Contraint pour que la convention de nommage AD reste vérifiable.';
comment on column profils.niveau_defaut is
    'Niveau appliqué aux domaines du profil qui ne fixent pas le leur.';
comment on column profils.socle is
    'true = profil livré avec le socle produit (non supprimable) ; false = profil propre à ce '
    'déploiement. Matérialise la frontière socle / spécifique (PLAN_SERVEUR §0.5).';

create table profil_domaines (
    profil_id   id_metier           not null,
    domaine     domaine_fonctionnel not null,
    niveau      niveau_droit        not null default 'lecture',
    cree_le     timestamptz         not null default now(),
    cree_par    text                not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,
    constraint pk_profil_domaines        primary key (profil_id, domaine),
    constraint fk_profil_domaines_profil foreign key (profil_id)
        references profils(id) on delete cascade
);

create trigger trg_profil_domaines_maj before update on profil_domaines
    for each row execute function f_maj_horodatage();

comment on table profil_domaines is
    'Accès d''un profil à un domaine fonctionnel. Table fille : pas de colonne version, la '
    'version est portée par le profil (CONVENTIONS.md §3).';
comment on column profil_domaines.niveau is
    'Niveau accordé sur ce domaine. Un domaine absent de la table équivaut à "aucun" ; la valeur '
    '"aucun" sert à fermer explicitement un domaine, ce qui se relit mieux en revue de droits.';

-- =====================================================================================
-- §5 — FILIALES (niveau Groupe) — l'entité de cloisonnement
-- =====================================================================================

create table filiales (
    id                  id_metier   not null,
    code                text        not null,
    raison_sociale      text        not null,
    nom_court           text,
    -- Identité visuelle par filiale (PLAN_SERVEUR §6) : écrans, impressions, exports.
    -- La contrainte de clé étrangère est ajoutée au §10, pieces_jointes n'existant pas encore.
    logo_piece_jointe_id id_metier,
    adresse             text,
    code_postal         text,
    ville               text,
    pays                text,
    telephone           text,
    email               text,
    site_web            text,
    langue_defaut       code_langue not null default 'fr',
    statut              text        not null default 'active',
    date_entree         date,
    date_sortie         date,
    notes               text,
    version             integer     not null default 1,
    cree_le             timestamptz not null default now(),
    cree_par            text        not null default f_utilisateur_courant(),
    modifie_le          timestamptz,
    modifie_par         text,
    constraint pk_filiales           primary key (id),
    constraint uq_filiales_code      unique (code),
    constraint ck_filiales_code      check (code ~ '^[A-Z0-9]{2,10}$'),
    constraint ck_filiales_raison    check (raison_sociale <> ''),
    constraint ck_filiales_pays      check (pays is null or pays ~ '^[A-Z]{2}$'),
    constraint ck_filiales_statut    check (statut in ('active', 'archivee', 'sortie')),
    constraint ck_filiales_dates     check (date_sortie is null or date_entree is null
                                            or date_sortie >= date_entree),
    constraint ck_filiales_sortie    check (statut <> 'sortie' or date_sortie is not null)
);

create index ix_filiales_statut on filiales (statut) where statut = 'active';

create trigger trg_filiales_maj before update on filiales
    for each row execute function f_maj_tracabilite();

comment on table filiales is
    'Filiale du groupe : unité de cloisonnement de toutes les données métier (PLAN_SERVEUR §2.4). '
    'Une filiale ne se supprime pas — elle SORT du groupe : statut "sortie", export complet remis '
    'à l''acquéreur, rétention, puis purge explicite (§2.7). D''où le "on delete restrict" de '
    'toutes les clés étrangères qui pointent ici.';
comment on column filiales.code is
    'Code court en majuscules (ex. TLS, DEU). C''est le segment <FILIALE> des groupes AD '
    'GRC-<FILIALE>-<PROFIL> (PLAN_SERVEUR §3.4) : la convention de nommage repose dessus.';
comment on column filiales.logo_piece_jointe_id is
    'Logo de la filiale, appliqué aux écrans, impressions et exports. Passe par la chaîne de '
    'contrôle des pièces jointes, PNG ou JPEG uniquement — jamais SVG, qui peut porter du script '
    'et deviendrait un vecteur d''injection dans l''interface (PLAN_SERVEUR §1.6).';
comment on column filiales.pays is 'Code ISO 3166-1 alpha-2 (FR, DE, ES…).';
comment on column filiales.statut is
    'active = en service ; archivee = lecture seule pendant la durée de rétention ; '
    'sortie = filiale cédée, données figées avant purge.';

-- =====================================================================================
-- §6 — UTILISATEURS (niveau Groupe)
-- Identités provisionnées automatiquement depuis l'AD à la première connexion
-- (PLAN_SERVEUR §1.5) : aucune administration manuelle des comptes.
-- =====================================================================================

create table utilisateurs (
    id                    id_metier   not null,
    identifiant           text        not null,
    upn                   text,
    sid_ad                text,
    nom                   text,
    prenom                text,
    nom_affichage         text        not null,
    email                 text,
    langue                code_langue not null default 'fr',
    filiale_defaut_id     id_metier,
    derniere_connexion    timestamptz,
    derniere_synchro_ad   timestamptz,
    actif                 boolean     not null default true,
    -- Compte administrateur de secours, indépendant de l'AD (PLAN_SERVEUR §0.3) : seul cas
    -- où l'application détient un secret d'authentification. Périmètre Groupe, profil
    -- d'administration, résolu par le code sans appartenance AD.
    compte_secours        boolean     not null default false,
    mot_de_passe_hash     text,
    mot_de_passe_modifie_le timestamptz,
    tentatives_echouees   integer     not null default 0,
    verrouille_jusqu_a    timestamptz,
    version               integer     not null default 1,
    cree_le               timestamptz not null default now(),
    cree_par              text        not null default f_utilisateur_courant(),
    modifie_le            timestamptz,
    modifie_par           text,
    constraint pk_utilisateurs          primary key (id),
    constraint fk_utilisateurs_filiale  foreign key (filiale_defaut_id)
        references filiales(id) on delete restrict,
    constraint ck_utilisateurs_ident    check (identifiant <> ''),
    constraint ck_utilisateurs_nom      check (nom_affichage <> ''),
    constraint ck_utilisateurs_tent     check (tentatives_echouees >= 0),
    -- Un compte AD n'a jamais de secret local ; le compte de secours en a toujours un.
    constraint ck_utilisateurs_secours  check (
        (compte_secours and mot_de_passe_hash is not null)
        or (not compte_secours and mot_de_passe_hash is null))
);

create unique index uq_utilisateurs_identifiant on utilisateurs (lower(identifiant));
create unique index uq_utilisateurs_upn         on utilisateurs (lower(upn)) where upn is not null;
create unique index uq_utilisateurs_sid         on utilisateurs (sid_ad)     where sid_ad is not null;
create index        ix_utilisateurs_actif       on utilisateurs (actif) where actif;

create trigger trg_utilisateurs_maj before update on utilisateurs
    for each row execute function f_maj_tracabilite();

comment on table utilisateurs is
    'Utilisateur de l''application. Provisionné automatiquement à la première connexion pour tout '
    'membre d''un groupe AD autorisé ; désactivé (actif = false) dès que le compte AD est désactivé '
    'ou retiré du groupe — les sessions actives sont alors révoquées (PLAN_SERVEUR §1.5).';
comment on column utilisateurs.identifiant is
    'sAMAccountName. Unicité insensible à la casse, l''AD l''étant.';
comment on column utilisateurs.sid_ad is
    'objectSid de l''AD : identifiant STABLE. Un compte renommé garde son SID, donc son historique.';
comment on column utilisateurs.filiale_defaut_id is
    'Filiale proposée à l''ouverture pour un utilisateur multi-filiales. Ne donne aucun droit : '
    'le périmètre réel est résolu à chaque connexion depuis les groupes AD.';
comment on column utilisateurs.compte_secours is
    'Compte administrateur de secours applicatif, hors AD, pour le cas où le compte de service '
    'serait bloqué (expiration de mot de passe, verrouillage). Son usage est journalisé.';
comment on column utilisateurs.mot_de_passe_hash is
    'Empreinte du mot de passe du SEUL compte de secours (algorithme à mémoire, type Argon2id). '
    'Aucun autre compte n''en porte : ck_utilisateurs_secours l''interdit.';
comment on column utilisateurs.verrouille_jusqu_a is
    'Verrouillage temporaire après tentatives répétées (PLAN_SERVEUR §1.9).';

-- =====================================================================================
-- §7 — GROUPES AD (niveau Groupe)
-- Convention imposée (PLAN_SERVEUR §3.4) :
--     GRC-<FILIALE>-<PROFIL>   ex. GRC-TLS-RSSI      -> perimetre 'filiale'
--     GRC-GROUPE-<PROFIL>      ex. GRC-GROUPE-RSSI   -> perimetre 'groupe'
--     GRC-EXPORT, GRC-ADMIN                          -> perimetre 'transversal'
-- Les groupes imbriqués sont résolus récursivement côté applicatif.
-- =====================================================================================

create table groupes_ad (
    id             id_metier   not null,
    nom            text        not null,
    perimetre      text        not null,
    filiale_id     id_metier,
    profil_id      id_metier,
    accorde_export boolean     not null default false,
    accorde_admin  boolean     not null default false,
    description    text,
    actif          boolean     not null default true,
    version        integer     not null default 1,
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    modifie_le     timestamptz,
    modifie_par    text,
    constraint pk_groupes_ad         primary key (id),
    constraint fk_groupes_ad_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint fk_groupes_ad_profil  foreign key (profil_id)
        references profils(id)  on delete restrict,
    constraint ck_groupes_ad_nom       check (nom <> ''),
    constraint ck_groupes_ad_perimetre check (perimetre in ('filiale', 'groupe', 'transversal')),
    -- Cohérence des trois formes de groupe : ce qui est écrit dans la convention de
    -- nommage AD est ici rendu impossible à contredire.
    constraint ck_groupes_ad_coherence check (
        (perimetre = 'filiale'     and filiale_id is not null and profil_id is not null)
     or (perimetre = 'groupe'      and filiale_id is null     and profil_id is not null)
     or (perimetre = 'transversal' and filiale_id is null     and profil_id is null
                                   and (accorde_export or accorde_admin)))
);

create unique index uq_groupes_ad_nom on groupes_ad (lower(nom));
create index ix_groupes_ad_filiale on groupes_ad (filiale_id) where filiale_id is not null;

create trigger trg_groupes_ad_maj before update on groupes_ad
    for each row execute function f_maj_tracabilite();

comment on table groupes_ad is
    'Correspondance groupe Active Directory -> périmètre + profil. Table de niveau Groupe : '
    'filiale_id y est nullable, un groupe pouvant être transversal (GRC-EXPORT) ou Groupe entier.';
comment on column groupes_ad.nom is
    'Nom exact du groupe AD (ex. GRC-TLS-RSSI). Unicité insensible à la casse, l''AD l''étant.';
comment on column groupes_ad.accorde_export is
    'Droit d''export, distinct de la lecture : un accès Groupe en lecture permettrait sinon '
    'd''extraire en un clic la cartographie complète des faiblesses du groupe (PLAN_SERVEUR §3.3). '
    'Tout export est journalisé.';
comment on column groupes_ad.actif is
    'Permet de retirer un groupe du dispositif sans perdre la trace de ce qu''il accordait.';

-- =====================================================================================
-- §8 — SESSIONS SERVEUR
-- Le périmètre et les droits sont RÉSOLUS à la connexion et figés dans la session : le
-- navigateur ne transmet jamais son périmètre (PLAN_SERVEUR §2.4).
-- =====================================================================================

create table sessions (
    id                id_metier   not null,
    jeton_empreinte   empreinte_sha256 not null,
    utilisateur_id    id_metier   not null,
    filiale_active_id id_metier,
    perimetre         text        not null,
    administrateur    boolean     not null default false,
    peut_exporter     boolean     not null default false,
    adresse_ip        inet,
    agent_utilisateur text,
    cree_le           timestamptz not null default now(),
    cree_par          text        not null default f_utilisateur_courant(),
    derniere_activite timestamptz not null default now(),
    expire_le         timestamptz not null,
    revoquee_le       timestamptz,
    motif_revocation  text,
    constraint pk_sessions             primary key (id),
    constraint uq_sessions_jeton       unique (jeton_empreinte),
    constraint fk_sessions_utilisateur foreign key (utilisateur_id)
        references utilisateurs(id) on delete cascade,
    constraint fk_sessions_filiale     foreign key (filiale_active_id)
        references filiales(id) on delete restrict,
    constraint ck_sessions_perimetre   check (perimetre in ('filiale', 'multi', 'groupe')),
    constraint ck_sessions_expiration  check (expire_le > cree_le),
    constraint ck_sessions_revocation  check ((revoquee_le is null) = (motif_revocation is null))
);

create index ix_sessions_utilisateur on sessions (utilisateur_id);
create index ix_sessions_expiration  on sessions (expire_le) where revoquee_le is null;

comment on table sessions is
    'Session serveur. Expire par inactivité (durée paramétrable, 30 min par défaut) et par date '
    'butoir absolue. Une session est révoquée immédiatement si le compte AD est désactivé ou '
    'retiré de ses groupes (PLAN_SERVEUR §0.3 et §1.5). Pas de colonne version : une session ne '
    'fait pas l''objet d''un verrouillage optimiste.';
comment on column sessions.jeton_empreinte is
    'SHA-256 du jeton de session. Le jeton en clair ne vit que dans le cookie : une lecture de la '
    'base ne permet pas d''usurper une session.';
comment on column sessions.filiale_active_id is
    'Filiale sélectionnée : périmètre d''ÉCRITURE de la session (grc.filiale_id). Null tant que '
    'la sélection n''a pas eu lieu pour un utilisateur multi-filiales.';
comment on column sessions.perimetre is
    'Premier axe du modèle de droits : filiale unique, plusieurs filiales, ou Groupe entier.';
comment on column sessions.peut_exporter is
    'Droit d''export résolu (groupe GRC-EXPORT), distinct de la lecture (PLAN_SERVEUR §3.3).';
comment on column sessions.derniere_activite is
    'Dernière requête authentifiée : base du calcul d''expiration par inactivité.';

-- Périmètre résolu : liste des filiales lisibles (grc.filiales). Table de liaison plutôt
-- qu'un tableau de chaînes, conformément à CONVENTIONS.md §7.
create table session_filiales (
    session_id id_metier not null,
    filiale_id id_metier not null,
    constraint pk_session_filiales primary key (session_id, filiale_id),
    constraint fk_session_filiales_session foreign key (session_id)
        references sessions(id) on delete cascade,
    constraint fk_session_filiales_filiale foreign key (filiale_id)
        references filiales(id) on delete cascade
);

create index ix_session_filiales_filiale on session_filiales (filiale_id);

comment on table session_filiales is
    'Périmètre de LECTURE résolu à la connexion : les filiales que cette session peut lire. '
    'Alimente grc.filiales, donc les politiques RLS.';

-- Droits résolus par domaine : le croisement des trois axes est calculé une fois, à la
-- connexion, à partir des groupes AD et des profils correspondants.
create table session_domaines (
    session_id id_metier           not null,
    domaine    domaine_fonctionnel not null,
    niveau     niveau_droit        not null,
    constraint pk_session_domaines primary key (session_id, domaine),
    constraint fk_session_domaines_session foreign key (session_id)
        references sessions(id) on delete cascade
);

comment on table session_domaines is
    'Droits résolus de la session, domaine par domaine. Cumul au plus favorable lorsque '
    'l''utilisateur appartient à plusieurs groupes AD. Vérifiés CÔTÉ SERVEUR à chaque requête — '
    'jamais un simple masquage d''interface (PLAN_SERVEUR §1.9).';

-- =====================================================================================
-- §9 — JOURNAL D'AUDIT — TABLE EN AJOUT SEUL, CHAÎNÉE PAR EMPREINTE
-- -------------------------------------------------------------------------------------
-- L'outil sert à justifier officiellement la gouvernance du groupe. La question d'audit
-- est « le RSSI peut-il modifier le journal ? ». Si la réponse est oui, le journal ne
-- prouve rien (PLAN_SERVEUR §1.7).
--
-- Quatre couches cumulatives garantissent l'ajout seul :
--   1. Privilèges : update / delete / truncate révoqués du rôle applicatif (§15).
--   2. Déclencheurs de refus (SQLSTATE GRC01), en « for each statement » : même un
--      update ne touchant aucune ligne échoue.
--   3. « enable always trigger » : un « set session_replication_role = replica » ne
--      désarme pas les déclencheurs.
--   4. Le rôle applicatif n'est PAS propriétaire de la table : seul le propriétaire peut
--      « alter table … disable trigger », et l'application ne le peut pas.
--
-- Ce qui n'est pas couvert, et doit être dit : root sur la VM et le propriétaire de la
-- base peuvent désactiver un déclencheur. C'est le rôle du chaînage — une altération par
-- accès direct reste DÉTECTABLE.
--
-- Dérogations assumées aux conventions (CONVENTIONS.md §12) :
--   - pas de version / modifie_le / modifie_par : une entrée n'est jamais modifiée ;
--   - valeurs_avant / valeurs_apres en jsonb : le journal enregistre l'état d'une entité
--     QUELCONQUE avant et après ; c'est par nature un document figé, en écriture seule,
--     qui ne participe à aucune intégrité référentielle ;
--   - aucune clé étrangère vers la cible (entite_type / entite_id) ni vers sessions : le
--     journal doit survivre à la suppression de ce qu'il décrit.
-- =====================================================================================

create table journal_audit (
    id                   id_metier   not null default f_generer_id('LOG'),
    numero               bigint      not null,
    horodatage           timestamptz not null default clock_timestamp(),
    filiale_id           id_metier,
    utilisateur_id       id_metier,
    utilisateur_libelle  text,
    session_id           id_metier,
    adresse_ip           inet,
    action               text        not null,
    entite_type          type_entite,
    entite_id            id_metier,
    resume               text,
    valeurs_avant        jsonb,
    valeurs_apres        jsonb,
    version_application  text,
    empreinte_precedente empreinte_sha256,
    empreinte            empreinte_sha256 not null,
    constraint pk_journal_audit        primary key (id),
    constraint uq_journal_audit_numero unique (numero),
    constraint fk_journal_audit_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint fk_journal_audit_utilisateur foreign key (utilisateur_id)
        references utilisateurs(id) on delete restrict,
    constraint ck_journal_audit_numero check (numero > 0),
    constraint ck_journal_audit_action check (action in (
        'connexion_reussie', 'connexion_echouee', 'deconnexion',
        'session_expiree', 'session_revoquee', 'refus_autorisation',
        'creation', 'modification', 'suppression', 'consultation_sensible',
        'export', 'import', 'administration', 'approbation',
        'analyse_antivirus', 'purge', 'archivage',
        'demarrage', 'arret', 'verification_journal'))
);

create index ix_journal_audit_horodatage  on journal_audit (horodatage desc);
create index ix_journal_audit_filiale     on journal_audit (filiale_id, horodatage desc);
create index ix_journal_audit_utilisateur on journal_audit (utilisateur_id, horodatage desc);
create index ix_journal_audit_entite      on journal_audit (entite_type, entite_id);
create index ix_journal_audit_action      on journal_audit (action, horodatage desc);

comment on table journal_audit is
    'Journal d''audit en AJOUT SEUL, chaîné par empreinte. Couverture : connexions réussies ET '
    'échouées, refus d''autorisation, créations / modifications / suppressions avec valeurs avant '
    'et après, actions d''administration, imports ET EXPORTS. Rétention 3 ans. Horodatage sur une '
    'source de temps synchronisée NTP — point systématiquement vérifié en audit (PLAN_SERVEUR §1.7). '
    'Contient des identités sur trois ans : l''outil figure à ce titre au registre article 30 du '
    'groupe, registre qu''il héberge lui-même.';
comment on column journal_audit.numero is
    'Position dans la chaîne, attribuée par le déclencheur (max + 1), PAS par une séquence : une '
    'séquence attribue son numéro avant le déclencheur et peut valider dans le désordre, la chaîne '
    'ne correspondrait alors plus à l''ordre des numéros.';
comment on column journal_audit.horodatage is
    'Positionné par le serveur (clock_timestamp), jamais par le client. clock_timestamp plutôt que '
    'now() : les entrées d''une même transaction restent ordonnées.';
comment on column journal_audit.filiale_id is
    'Nullable : un événement peut précéder la résolution du périmètre (échec de connexion) ou être '
    'transversal (démarrage du service, administration Groupe).';
comment on column journal_audit.utilisateur_id is
    'Acteur de l''événement, RÉSOLU PAR LE SERVEUR : le déclencheur de chaînage l''écrase en '
    'cherchant le LOGIN grc.utilisateur dans utilisateurs.identifiant (CONVENTIONS.md §17.8 et '
    '§18.3 — la résolution se faisait sur la clé primaire, ce qui aurait vidé la colonne le jour '
    'où L3 y met un vrai login), et le met à null si ce login ne désigne aucun compte connu — '
    'traitement système, ou événement antérieur à la résolution de l''identité. '
    'Une valeur fournie par l''appelant est toujours ignorée : la valeur probante d''une trace ne '
    'se déclare pas.';
comment on column journal_audit.utilisateur_libelle is
    'Identité telle que connue au moment des faits. Doublure texte volontaire : la trace reste '
    'lisible même si le compte est supprimé, et couvre l''échec de connexion sur un compte '
    'inconnu. FOURNI par l''appelant, à la différence de utilisateur_id : c''est un confort '
    'd''affichage, pas la source de l''identité.';
comment on column journal_audit.session_id is
    'Sans clé étrangère : les sessions sont purgées, le journal ne l''est pas.';
comment on column journal_audit.valeurs_avant is
    'État de l''entité avant modification. Seule dérogation admise à la liste fermée des colonnes '
    'jsonb (CONVENTIONS.md §6) : document figé, en écriture seule, jamais joint.';
comment on column journal_audit.version_application is
    'Version de l''application au moment des faits : un rapport produit deux ans plus tôt reste '
    'attribuable (PLAN_SERVEUR §0.3).';
comment on column journal_audit.empreinte is
    'SHA-256 de la sérialisation canonique de TOUS les champs de l''entrée, empreinte_precedente '
    'comprise. Toute retouche invalide l''empreinte de la ligne ET de toutes les suivantes.';

-- ---------------------------------------------------------------------------------
-- Sérialisation canonique d'une entrée. Séparateur : U+001F (« unit separator »),
-- caractère de contrôle qui ne peut pas apparaître dans les données, ce qui interdit
-- de forger deux entrées différentes de même sérialisation. coalesce partout : un
-- champ nul et une chaîne vide doivent rester distinguables du champ suivant.
-- « stable » et non « immutable » : le rendu UTC d'un timestamptz dépend de la base
-- des fuseaux horaires.
-- ---------------------------------------------------------------------------------
create or replace function f_journal_audit_charge_utile(
    p_numero               bigint,
    p_id                   text,
    p_horodatage           timestamptz,
    p_filiale_id           text,
    p_utilisateur_id       text,
    p_utilisateur_libelle  text,
    p_session_id           text,
    p_adresse_ip           inet,
    p_action               text,
    p_entite_type          text,
    p_entite_id            text,
    p_resume               text,
    p_valeurs_avant        jsonb,
    p_valeurs_apres        jsonb,
    p_version_application  text,
    p_empreinte_precedente text
) returns text
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select concat_ws(chr(31),
        p_numero::text,
        coalesce(p_id, ''),
        to_char(p_horodatage at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        coalesce(p_filiale_id, ''),
        coalesce(p_utilisateur_id, ''),
        coalesce(p_utilisateur_libelle, ''),
        coalesce(p_session_id, ''),
        coalesce(p_adresse_ip::text, ''),
        coalesce(p_action, ''),
        coalesce(p_entite_type, ''),
        coalesce(p_entite_id, ''),
        coalesce(p_resume, ''),
        coalesce(p_valeurs_avant::text, ''),
        coalesce(p_valeurs_apres::text, ''),
        coalesce(p_version_application, ''),
        coalesce(p_empreinte_precedente, ''));
$$;

comment on function f_journal_audit_charge_utile(bigint, text, timestamptz, text, text, text,
    text, inet, text, text, text, text, jsonb, jsonb, text, text) is
    'Sérialisation canonique d''une entrée de journal, support du calcul d''empreinte. Utilisée '
    'à l''insertion ET à la vérification : toute divergence entre les deux serait un faux positif.';

-- ---------------------------------------------------------------------------------
-- Chaînage. Le verrou consultatif transactionnel sérialise strictement les insertions
-- jusqu'au commit : « max(numero) » ne voit que des lignes validées, la chaîne est donc
-- exempte de trou et de course. Débit largement suffisant — quelques écritures par
-- seconde pour dix utilisateurs par filiale.
-- Le client ne fournit ni numero, ni horodatage, ni empreintes : tout est écrasé ici.
-- Il n'existe donc aucun moyen de forger une entrée cohérente par l'API.
-- ---------------------------------------------------------------------------------
create or replace function f_journal_audit_chainage() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_precedent record;
begin
    perform pg_advisory_xact_lock(4718271936042001);

    select j.numero, j.empreinte
      into v_precedent
      from journal_audit j
     order by j.numero desc
     limit 1;

    new.numero               := coalesce(v_precedent.numero, 0) + 1;
    new.empreinte_precedente := v_precedent.empreinte;   -- null pour l'entrée de genèse
    new.horodatage           := clock_timestamp();

    -- L'ACTEUR VIENT DE LA SESSION, PAS DU CLIENT (CONVENTIONS.md §17.8).
    --
    -- Ajouté au second passage de la porte de sécurité S1 (constat N-5). Le déclencheur
    -- écrasait déjà le numéro, l'horodatage et les empreintes — tout ce qui fait qu'une
    -- entrée ne se forge pas — mais laissait l'identité de l'acteur en saisie libre. La
    -- seule table dont l'objet EST de faire preuve était donc la seule à croire son
    -- appelant sur ce point. Un journal inaltérable dont l'acteur est déclaré par le
    -- client garantit l'intégrité d'une fausse preuve : le mécanisme fonctionne
    -- parfaitement, sur un contenu faux.
    --
    -- La valeur fournie par l'appelant est écrasée SANS CONDITION. Elle est remplacée par
    -- l'identifiant de session lorsqu'il désigne un compte connu, et par null sinon —
    -- « sinon » couvrant les écritures légitimes qui n'ont pas de compte derrière elles :
    -- « systeme » (migrations, timers d'exploitation) et les événements antérieurs à la
    -- résolution de l'identité (échec de connexion sur un compte inconnu). Mettre
    -- l'identifiant tel quel violerait la clé étrangère vers utilisateurs et rendrait ces
    -- écritures impossibles ; le libellé texte, lui, reste renseigné dans tous les cas.
    --
    -- utilisateur_libelle reste FOURNI par l'appelant, et c'est délibéré (§12) : c'est un
    -- confort de lecture qui doit survivre à la disparition du compte. Il n'est plus la
    -- source de l'identité, seulement son affichage.
    -- La résolution se fait sur le LOGIN, pas sur la clé primaire (CONVENTIONS.md §18.3).
    --
    -- Elle joignait « grc.utilisateur » à « utilisateurs.id ». Or ce réglage est documenté
    -- par ce fichier même comme un login (« set local grc.utilisateur = 'jdupont' »), et
    -- c'est lui qui alimente « cree_par » sur les 42 tables — un identifiant technique
    -- « USR-1720000000000-482 » y serait illisible. Tant que les deux coïncident, rien ne
    -- se voit ; le jour où le lot L3 y met un vrai login, TOUTES les entrées basculent en
    -- silence sur la branche « acteur inconnu » : la chaîne reste intacte, les empreintes
    -- restent valides, et la seule identité qui subsiste est celle que le client a fournie
    -- dans utilisateur_libelle. Constat T-3 du troisième passage de la porte S1.
    --
    -- « lower(...) » des deux côtés : c'est la forme de l'unicité posée sur
    -- utilisateurs.identifiant (§6), et un sAMAccountName n'est pas sensible à la casse.
    --
    -- CE QUI RESTE LÉGITIMEMENT NUL, et il faut le savoir en lisant le journal :
    --   - « systeme » : migrations, timers d'exploitation — aucun compte derrière ;
    --   - un échec de connexion sur un login inconnu, qui est précisément l'événement que
    --     le §1.7 du plan veut voir tracé.
    -- Distinguer « pas d'acteur » (légitime) de « acteur non résolu » (défaut de
    -- programmation) exigerait de connaître, ici, la liste des actions antérieures à
    -- l'authentification : c'est une décision du lot L3, pas du schéma. Signalé comme tel.
    new.utilisateur_id := (
        select u.id from utilisateurs u
         where lower(u.identifiant) = lower(f_utilisateur_courant()));

    new.empreinte := encode(sha256(convert_to(
        f_journal_audit_charge_utile(
            new.numero, new.id, new.horodatage, new.filiale_id,
            new.utilisateur_id, new.utilisateur_libelle, new.session_id,
            new.adresse_ip, new.action, new.entite_type, new.entite_id,
            new.resume, new.valeurs_avant, new.valeurs_apres,
            new.version_application, new.empreinte_precedente),
        'UTF8')), 'hex');

    return new;
end;
$$;

comment on function f_journal_audit_chainage() is
    'Attribue numero, horodatage, utilisateur_id, empreinte_precedente et empreinte à chaque '
    'entrée de journal : TOUT ce qui fait la valeur probante d''une trace vient du serveur, jamais '
    'de l''appelant (CONVENTIONS.md §17.8). utilisateur_id est résolu en cherchant le LOGIN '
    'grc.utilisateur dans utilisateurs.identifiant (§18.3), et vaut null si ce login ne désigne '
    'aucun compte connu (traitement système, échec de connexion) ; utilisateur_libelle, lui, reste fourni — c''est un confort de lecture qui doit '
    'survivre à la disparition du compte (§12). '
    'Sérialisé par pg_advisory_xact_lock(4718271936042001).';

create trigger trg_journal_audit_chainage before insert on journal_audit
    for each row execute function f_journal_audit_chainage();

-- Gardes d'ajout seul. « for each statement » : un update sans effet échoue aussi.
create trigger trg_journal_audit_interdit_maj before update on journal_audit
    for each statement execute function f_interdit_modification();

create trigger trg_journal_audit_interdit_suppr before delete on journal_audit
    for each statement execute function f_interdit_modification();

create trigger trg_journal_audit_interdit_vidage before truncate on journal_audit
    for each statement execute function f_interdit_modification();

-- « enable always » : les déclencheurs restent actifs même sous
-- session_replication_role = replica, contournement classique.
alter table journal_audit enable always trigger trg_journal_audit_chainage;
alter table journal_audit enable always trigger trg_journal_audit_interdit_maj;
alter table journal_audit enable always trigger trg_journal_audit_interdit_suppr;
alter table journal_audit enable always trigger trg_journal_audit_interdit_vidage;

-- ---------------------------------------------------------------------------------
-- VÉRIFICATION DU CHAÎNAGE
--   select * from f_journal_audit_verifier();          -- intégrale (audit annuel)
--   select * from f_journal_audit_verifier(150000);     -- partielle, à partir d'un numéro
-- Un journal sain ne renvoie AUCUNE ligne.
-- Anomalies :
--   empreinte_invalide  le contenu ne correspond plus à son empreinte -> ligne modifiée
--   chainage_rompu      empreinte_precedente incorrecte -> entrée insérée ou substituée
--   numero_manquant     trou dans la numérotation -> entrée supprimée
--   genese_incoherente  l'entrée n° 1 porte une empreinte précédente -> chaîne fabriquée
--   chaine_tronquee     informatif : la vérification ne démarre pas au premier maillon
-- ---------------------------------------------------------------------------------
create or replace function f_journal_audit_verifier(p_depuis bigint default null)
returns table (
    numero_entree     bigint,
    id_entree         text,
    horodatage_entree timestamptz,
    anomalie          text,
    detail            text
)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r                     record;
    v_attendue            text;
    v_precedent_numero    bigint  := null;
    v_precedent_empreinte text    := null;
    v_premier             boolean := true;
begin
    for r in
        select j.*
          from journal_audit j
         where p_depuis is null or j.numero >= p_depuis
         order by j.numero
    loop
        v_attendue := encode(sha256(convert_to(
            f_journal_audit_charge_utile(
                r.numero, r.id, r.horodatage, r.filiale_id,
                r.utilisateur_id, r.utilisateur_libelle, r.session_id,
                r.adresse_ip, r.action, r.entite_type, r.entite_id,
                r.resume, r.valeurs_avant, r.valeurs_apres,
                r.version_application, r.empreinte_precedente),
            'UTF8')), 'hex');

        if v_attendue is distinct from r.empreinte then
            numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
            anomalie := 'empreinte_invalide';
            detail   := 'attendue=' || v_attendue || ' / stockée=' || coalesce(r.empreinte, '(nulle)');
            return next;
        end if;

        if v_premier then
            if r.numero = 1 and r.empreinte_precedente is not null then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'genese_incoherente';
                detail   := 'la première entrée de la chaîne ne doit pas porter d''empreinte précédente';
                return next;
            elsif r.numero <> 1 then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'chaine_tronquee';
                detail   := 'vérification démarrée au numéro ' || r.numero
                            || ' : le maillon précédent est hors périmètre examiné (paramètre '
                            || 'depuis, ou segment archivé — comparer à parametres.journal.ancrage_<annee>)';
                return next;
            end if;
            v_premier := false;
        else
            if r.numero <> v_precedent_numero + 1 then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'numero_manquant';
                detail   := 'numéro attendu ' || (v_precedent_numero + 1)::text
                            || ', trouvé ' || r.numero::text;
                return next;
            end if;
            if r.empreinte_precedente is distinct from v_precedent_empreinte then
                numero_entree := r.numero; id_entree := r.id; horodatage_entree := r.horodatage;
                anomalie := 'chainage_rompu';
                detail   := 'empreinte précédente déclarée '
                            || coalesce(r.empreinte_precedente, '(nulle)')
                            || ' / réelle ' || coalesce(v_precedent_empreinte, '(nulle)');
                return next;
            end if;
        end if;

        v_precedent_numero    := r.numero;
        v_precedent_empreinte := r.empreinte;
    end loop;

    return;
end;
$$;

comment on function f_journal_audit_verifier(bigint) is
    'Vérifie l''intégrité du chaînage du journal d''audit. Ne renvoie aucune ligne si le journal '
    'est sain. À jouer lors d''un audit et par un timer systemd périodique, le résultat étant '
    'lui-même journalisé (action verification_journal).';

-- =====================================================================================
-- §10 — PIÈCES JOINTES
-- Métadonnées uniquement : le fichier est stocké HORS arborescence web, sous un nom
-- aléatoire opaque, et n'est jamais servi par Apache (PLAN_SERVEUR §1.6).
-- =====================================================================================

create table pieces_jointes (
    id                 id_metier   not null,
    filiale_id         id_metier   not null,
    entite_type        type_entite not null,
    entite_id          id_metier   not null,
    nom_fichier        text        not null,
    type_mime          text        not null,
    extension          text,
    taille_octets      bigint      not null,
    sha256             empreinte_sha256 not null,
    chemin_stockage    text        not null,
    etat_analyse       text        not null default 'en_attente',
    resultat_analyse   text,
    signature_virale   text,
    date_analyse       timestamptz,
    derniere_reanalyse timestamptz,
    quarantaine        boolean     not null default false,
    description        text,
    version            integer     not null default 1,
    cree_le            timestamptz not null default now(),
    cree_par           text        not null default f_utilisateur_courant(),
    modifie_le         timestamptz,
    modifie_par        text,
    constraint pk_pieces_jointes         primary key (id),
    -- Cible de la clé étrangère COMPOSITE du logo de filiale (§10, plus bas) : c'est ce
    -- couple qui interdit à une filiale de poser son propre fichier comme logo d'une
    -- autre. Même motif que le CONVENTIONS.md §17.1, à ceci près que le parent — filiales
    -- — ne porte pas de colonne « filiale_id » : c'est son « id » QUI EST la filiale.
    constraint uq_pieces_jointes_id_filiale unique (id, filiale_id),
    constraint uq_pieces_jointes_chemin  unique (chemin_stockage),
    constraint fk_pieces_jointes_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_pieces_jointes_nom     check (nom_fichier <> ''),
    constraint ck_pieces_jointes_taille  check (taille_octets > 0),
    constraint ck_pieces_jointes_etat    check (etat_analyse in (
        'en_attente', 'en_cours', 'saine', 'infectee', 'erreur')),
    -- Une pièce déclarée infectée est nécessairement en quarantaine : l'incohérence
    -- inverse serait la faille exacte que la chaîne de contrôle cherche à éviter.
    constraint ck_pieces_jointes_quarantaine check (etat_analyse <> 'infectee' or quarantaine),
    constraint ck_pieces_jointes_analyse     check (
        etat_analyse in ('en_attente', 'en_cours') or date_analyse is not null)
);

create index ix_pieces_jointes_filiale on pieces_jointes (filiale_id);
create index ix_pieces_jointes_entite  on pieces_jointes (filiale_id, entite_type, entite_id);
create index ix_pieces_jointes_sha256  on pieces_jointes (sha256);
create index ix_pieces_jointes_reanalyse on pieces_jointes (derniere_reanalyse)
    where etat_analyse = 'saine';

create trigger trg_pieces_jointes_maj before update on pieces_jointes
    for each row execute function f_maj_tracabilite();

comment on table pieces_jointes is
    'Métadonnées des pièces jointes. Aucun dispositif ne garantit l''absence de malware : la '
    'défense est en profondeur (liste blanche de types, rejet des formats à macros, vérification '
    'par signature binaire, analyse ClamAV, stockage hors webroot, délivrance par l''application '
    'en téléchargement forcé, ré-analyse périodique, quotas). Le risque résiduel est assumé et '
    'documenté (PLAN_SERVEUR §1.6).';
comment on column pieces_jointes.entite_type is
    'Rattachement polymorphe, sans clé étrangère : la cible peut appartenir à n''importe quelle '
    'entité métier. Inclut "filiales" pour le logo de marque.';
comment on column pieces_jointes.sha256 is
    'Empreinte calculée à l''envoi. Ce n''est PAS une mesure antimalware : c''est ce qui transforme '
    'une pièce jointe en preuve vérifiable — un auditeur peut s''assurer qu''un rapport de test PRA '
    'n''a pas été remplacé après coup.';
comment on column pieces_jointes.chemin_stockage is
    'Nom aléatoire opaque, hors arborescence web. Apache ne sert jamais ces fichiers ; '
    'l''application les délivre après contrôle des droits.';
comment on column pieces_jointes.derniere_reanalyse is
    'Ré-analyse périodique du stock : un fichier propre aujourd''hui peut être détecté dans six '
    'mois — décisif sur trois ans de rétention.';
comment on column pieces_jointes.etat_analyse is
    'Seul l''état "saine" autorise la délivrance du fichier. "infectee" implique la quarantaine.';

-- Le logo de filiale est une pièce jointe comme une autre : même chaîne de contrôle.
-- Contrainte posée ici, la table n'existant pas au §5.
--
-- ── CLÉ ÉTRANGÈRE COMPOSITE (esprit du CONVENTIONS.md §17.1) ─────────────────────────
--
-- Le couple porte (logo_piece_jointe_id, id) et vise (id, filiale_id) : le fichier doit
-- appartenir à LA FILIALE ELLE-MÊME. La particularité, qui explique la forme inhabituelle
-- de la clé, est que « filiales » ne porte pas de colonne « filiale_id » — son « id » EST
-- la filiale. Le motif du §17.1 s'applique donc avec « id » en second membre.
--
-- POURQUOI. Constat N-2 du second passage de la porte S1 : la filiale A déposait une
-- pièce jointe CHEZ ELLE, la posait comme logo de la filiale B, puis supprimait son
-- fichier — ce qui remettait à null le logo de B, incrémentait la version de la ligne de
-- B et y inscrivait « modifie_par = alice ». C'est mot pour mot le constat bloquant B-1,
-- sur un chemin que son balayage ne pouvait pas voir : « filiales » ne porte pas de
-- filiale_id et sort donc du champ de f_verifier_couverture_rls().
--
-- L'écriture de « filiales » est par ailleurs réservée à l'administration Groupe depuis
-- ce même constat (004_rls.sql §6). Les deux mesures sont cumulatives et aucune ne rend
-- l'autre inutile : la première est une DÉCLARATION que la session fait sur elle-même
-- (CONVENTIONS §17.4) et ne tient pas contre un rôle applicatif compromis ; celle-ci est
-- une contrainte d'intégrité, que rien dans la session ne peut désarmer.
--
-- « set null (logo_piece_jointe_id) » et non « set null » tout court : la forme sans
-- liste remettrait à null TOUTES les colonnes de la clé, « id » compris — la clé primaire
-- de la filiale. La liste de colonnes existe depuis PostgreSQL 15, minimum exigé au §0.
--
-- « restrict » et non « set null » — constat T-7 du troisième passage. La clé composite
-- ci-dessus borne le DOMMAGE à la ligne de la filiale concernée : c'est acquis. Mais
-- l'action référentielle, elle, contourne la politique d'écriture de « filiales », qui
-- exige l'administration Groupe (004 §6) : une session de filiale sans le drapeau ne peut
-- pas modifier sa propre fiche, et pouvait pourtant en incrémenter la « version » en
-- supprimant SA pièce jointe. Un administrateur Groupe qui éditait la fiche au même moment
-- recevait alors un conflit de version provoqué par quelqu'un qui n'a pas le droit
-- d'écrire là.
--
-- Le §18.2 pose que le délien est un geste explicite : poser un logo est un acte
-- d'administration Groupe, le retirer en est un aussi. On retire donc le logo, PUIS on
-- supprime le fichier.
alter table filiales
    add constraint fk_filiales_logo foreign key (logo_piece_jointe_id, id)
        references pieces_jointes (id, filiale_id) on delete restrict;

-- =====================================================================================
-- §11 — APPROBATIONS
-- Circuit de validation étendu au-delà des seuls documents, le mécanisme étant identique
-- (PLAN_SERVEUR §3.5). L'acceptation des risques résiduels est explicitement exigée par
-- l'ISO 27001 ; son absence est un constat d'audit classique.
-- =====================================================================================

create table approbations (
    id              id_metier   not null,
    filiale_id      id_metier   not null,
    objet_type      text        not null,
    objet_id        id_metier   not null,
    version_objet   text,
    empreinte_objet empreinte_sha256,
    etape           text        not null,
    ordre           integer     not null default 1,
    statut          text        not null default 'en_attente',
    acteur_id       id_metier,
    acteur_libelle  text,
    date_decision   timestamptz,
    commentaire     text,
    version         integer     not null default 1,
    cree_le         timestamptz not null default now(),
    cree_par        text        not null default f_utilisateur_courant(),
    modifie_le      timestamptz,
    modifie_par     text,
    constraint pk_approbations         primary key (id),
    constraint uq_approbations_etape   unique (objet_type, objet_id, etape, ordre),
    constraint fk_approbations_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint fk_approbations_acteur  foreign key (acteur_id)
        references utilisateurs(id) on delete restrict,
    constraint ck_approbations_objet   check (objet_type in ('document', 'risque', 'audit')),
    constraint ck_approbations_etape   check (etape in (
        'redaction', 'revue', 'approbation', 'publication',   -- documents / politiques
        'proposition', 'acceptation',                          -- acceptation d'un risque résiduel
        'validation')),                                        -- rapport d'audit interne
    constraint ck_approbations_statut  check (statut in (
        'en_attente', 'en_cours', 'approuve', 'refuse', 'annule')),
    constraint ck_approbations_ordre   check (ordre > 0),
    -- Une décision est datée et attribuée, ou n'a pas eu lieu.
    constraint ck_approbations_decision check (
        (statut in ('approuve', 'refuse')) = (date_decision is not null)),
    constraint ck_approbations_acteur   check (
        statut not in ('approuve', 'refuse') or acteur_libelle is not null)
);

create index ix_approbations_objet   on approbations (objet_type, objet_id, ordre);
create index ix_approbations_filiale on approbations (filiale_id, statut);

comment on table approbations is
    'Étapes du circuit d''approbation. Objets couverts : documents / politiques (rédaction -> revue '
    '-> approbation -> publication), acceptation des risques résiduels (proposition -> acceptation '
    'par le propriétaire du risque), rapports d''audit interne (rédaction -> validation). Chaque '
    'étape est horodatée, attribuée, journalisée et IRRÉVERSIBLE une fois franchie : une nouvelle '
    'version repart du début (PLAN_SERVEUR §3.5).';
comment on column approbations.objet_id is
    'Sans clé étrangère : rattachement polymorphe à trois entités métier créées par les migrations '
    'suivantes (documents, risques, audits). L''intégrité est assurée par le code applicatif.';
comment on column approbations.empreinte_objet is
    'Empreinte du contenu approuvé. Fige CE QUI a été validé : une modification ultérieure de '
    'l''objet devient démontrable, et impose de repartir du début du circuit.';
comment on column approbations.acteur_libelle is
    'Identité de l''acteur au moment de la décision, conservée en clair : « qui a validé cette '
    'politique ? » doit rester répondable même après le départ de l''intéressé.';

-- Irréversibilité : une étape franchie ne se rejoue pas et ne s'efface pas.
create or replace function f_approbations_verrou_decision() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_statut text := old.statut;
begin
    if v_statut in ('approuve', 'refuse') then
        raise exception
            'Étape d''approbation déjà tranchée (%) : la décision est irréversible.', v_statut
            using errcode = 'GRC02',
                  hint    = 'Créez une nouvelle version de l''objet : le circuit repart du début. '
                            'Voir backend/db/CONVENTIONS.md §15.';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

comment on function f_approbations_verrou_decision() is
    'Refuse (SQLSTATE GRC02) toute modification ou suppression d''une étape d''approbation déjà '
    'approuvée ou refusée. Une étape "annule" reste modifiable : elle n''a rien tranché.';

create trigger trg_approbations_maj before update on approbations
    for each row execute function f_maj_tracabilite();

create trigger trg_approbations_verrou before update or delete on approbations
    for each row execute function f_approbations_verrou_decision();

alter table approbations enable always trigger trg_approbations_verrou;

-- =====================================================================================
-- §12 — RÉFÉRENTIELS ACTIVÉS PAR FILIALE
-- À ne pas confondre avec « non applicable » : l'activation dit QUELS référentiels sont
-- dans le périmètre du site ; « non applicable » écarte un point précis À L'INTÉRIEUR
-- d'un référentiel pratiqué. Se servir du second pour écarter un référentiel entier
-- obligerait à cocher 234 cases pour AirCyber, filiale par filiale, et fausserait les
-- statistiques (PLAN_SERVEUR §2.2).
-- =====================================================================================

create table referentiels_actifs (
    id                  id_metier   not null,
    filiale_id          id_metier   not null,
    ref_id              text        not null,
    origine             text        not null,
    obligatoire         boolean     not null default false,
    actif               boolean     not null default true,
    date_activation     date,
    date_desactivation  date,
    motif               text,
    version             integer     not null default 1,
    cree_le             timestamptz not null default now(),
    cree_par            text        not null default f_utilisateur_courant(),
    modifie_le          timestamptz,
    modifie_par         text,
    constraint pk_referentiels_actifs      primary key (id),
    constraint uq_referentiels_actifs_ref  unique (filiale_id, ref_id),
    constraint fk_referentiels_actifs_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_referentiels_actifs_ref     check (ref_id <> ''),
    constraint ck_referentiels_actifs_origine check (origine in ('socle_groupe', 'ajout_local')),
    -- Un référentiel imposé par le Groupe ne se désactive pas localement.
    constraint ck_referentiels_actifs_socle   check (
        not (origine = 'socle_groupe' and obligatoire and not actif)),
    constraint ck_referentiels_actifs_dates   check (
        date_desactivation is null or date_activation is null
        or date_desactivation >= date_activation)
);

create index ix_referentiels_actifs_filiale on referentiels_actifs (filiale_id) where actif;

create trigger trg_referentiels_actifs_maj before update on referentiels_actifs
    for each row execute function f_maj_tracabilite();

comment on table referentiels_actifs is
    'Référentiels dans le périmètre d''une filiale. Le Groupe impose un socle, la filiale peut '
    'ajouter. Un référentiel non activé n''apparaît pas dans l''interface du site.';
comment on column referentiels_actifs.ref_id is
    'Identifiant du référentiel dans le CATALOGUE STATIQUE (anssi-hygiene, iso27001-smsi, '
    'iso-27002-2022, nis2-art21, dora, aircyber). Sans clé étrangère : les catalogues restent des '
    'fichiers, hors base (PLAN_SERVEUR §2.1) — c''est aussi ce qui interdit d''y stocker le texte '
    'des normes.';
comment on column referentiels_actifs.origine is
    'socle_groupe = imposé par le Groupe (condition de la comparabilité entre filiales) ; '
    'ajout_local = ajouté par la filiale pour son propre contexte.';
comment on column referentiels_actifs.obligatoire is
    'Verrouille la désactivation locale d''un référentiel du socle Groupe.';

-- =====================================================================================
-- §13 — IMPORTS
-- L'import généralisé est qualifié de décisif par le client : intégrer une société
-- rachetée en ressaisissant à la main ses incidents, actifs et prestataires est hors de
-- question (PLAN_SERVEUR §5). L'import est transactionnel, idempotent, cloisonné à la
-- filiale active, et journalisé.
-- =====================================================================================

create table imports (
    id                    id_metier   not null,
    filiale_id            id_metier   not null,
    utilisateur_id        id_metier,
    utilisateur_libelle   text,
    entite                text        not null,
    source                text        not null,
    nom_fichier           text        not null,
    sha256                empreinte_sha256,
    taille_octets         bigint,
    cle_idempotence       empreinte_sha256,
    statut                text        not null default 'en_cours',
    lignes_lues           integer     not null default 0,
    lignes_creees         integer     not null default 0,
    lignes_mises_a_jour   integer     not null default 0,
    lignes_ignorees       integer     not null default 0,
    lignes_en_erreur      integer     not null default 0,
    debut_le              timestamptz not null default now(),
    fin_le                timestamptz,
    message               text,
    version               integer     not null default 1,
    cree_le               timestamptz not null default now(),
    cree_par              text        not null default f_utilisateur_courant(),
    modifie_le            timestamptz,
    modifie_par           text,
    constraint pk_imports         primary key (id),
    constraint fk_imports_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint fk_imports_utilisateur foreign key (utilisateur_id)
        references utilisateurs(id) on delete restrict,
    constraint ck_imports_entite  check (entite <> ''),
    constraint ck_imports_source  check (source in ('excel', 'csv', 'grc-backup')),
    constraint ck_imports_statut  check (statut in (
        'en_cours', 'apercu', 'valide', 'applique', 'echoue', 'annule')),
    constraint ck_imports_volumes check (
        lignes_lues >= 0 and lignes_creees >= 0 and lignes_mises_a_jour >= 0
        and lignes_ignorees >= 0 and lignes_en_erreur >= 0),
    constraint ck_imports_fin     check (fin_le is null or fin_le >= debut_le)
);

-- Idempotence : réimporter le même fichier sur la même entité et la même filiale ne
-- duplique pas — un second import appliqué est refusé par cet index.
create unique index uq_imports_idempotence
    on imports (filiale_id, entite, cle_idempotence)
    where statut = 'applique' and cle_idempotence is not null;

create index ix_imports_filiale on imports (filiale_id, debut_le desc);

create trigger trg_imports_maj before update on imports
    for each row execute function f_maj_tracabilite();

comment on table imports is
    'Traçabilité des imports : auteur, fichier, entité, volumes, erreurs. Un import s''applique à '
    'la filiale active, jamais ailleurs.';
comment on column imports.entite is
    'Entité visée. Nom d''entité métier, ou "grc-backup" pour la reprise complète d''une filiale '
    'déjà équipée de la version navigateur. Sans domaine type_entite : le moteur déclaratif du '
    'lot L7 acceptera aussi des cibles composites.';
comment on column imports.cle_idempotence is
    'Empreinte du couple fichier + configuration d''import. Un même fichier appliqué deux fois est '
    'refusé par uq_imports_idempotence.';
comment on column imports.statut is
    'en_cours -> apercu (analysé, non appliqué) -> valide -> applique. L''application est '
    'transactionnelle : tout ou rien, jamais d''import à moitié appliqué.';

create table import_erreurs (
    import_id  id_metier   not null,
    ligne      integer     not null,
    colonne    text,
    valeur     text,
    message    text        not null,
    cree_le    timestamptz not null default now(),
    constraint pk_import_erreurs primary key (import_id, ligne, message),
    constraint fk_import_erreurs_import foreign key (import_id)
        references imports(id) on delete cascade,
    constraint ck_import_erreurs_ligne   check (ligne >= 0),
    constraint ck_import_erreurs_message check (message <> '')
);

comment on table import_erreurs is
    'Rapport d''erreurs ligne par ligne d''un import. Table fille relationnelle plutôt qu''une '
    'colonne jsonb : le rapport est consulté, trié, filtré et exporté par l''utilisateur qui '
    'corrige son fichier (CONVENTIONS.md §6).';
comment on column import_erreurs.ligne is
    'Numéro de ligne dans le fichier source, tel qu''il s''affiche dans le tableur — 0 pour une '
    'erreur portant sur le fichier entier (en-têtes manquants, format non reconnu).';

-- =====================================================================================
-- §14 — PARAMÈTRES
-- Table MIXTE : filiale_id nullable, null = paramètre de niveau Groupe.
-- =====================================================================================

create table parametres (
    id               id_metier   not null,
    filiale_id       id_metier,
    categorie        text        not null default 'divers',
    cle              text        not null,
    valeur           text,
    valeur_defaut    text,
    type_valeur      text        not null default 'texte',
    secret           boolean     not null default false,
    reference_secret text,
    libelle          text,
    description      text,
    modifiable       boolean     not null default true,
    version          integer     not null default 1,
    cree_le          timestamptz not null default now(),
    cree_par         text        not null default f_utilisateur_courant(),
    modifie_le       timestamptz,
    modifie_par      text,
    constraint pk_parametres       primary key (id),
    -- « nulls not distinct » : deux paramètres Groupe de même clé sont un doublon, alors
    -- qu'un « unique » ordinaire laisserait passer les lignes à filiale_id nul.
    constraint uq_parametres_cle   unique nulls not distinct (filiale_id, cle),
    constraint fk_parametres_filiale foreign key (filiale_id)
        references filiales(id) on delete restrict,
    constraint ck_parametres_cle   check (cle ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
    constraint ck_parametres_categorie check (categorie in (
        'smtp', 'ldap', 'session', 'securite', 'retention', 'affichage',
        'import', 'pieces_jointes', 'notifications', 'journal', 'divers')),
    constraint ck_parametres_type  check (type_valeur in (
        'texte', 'entier', 'decimal', 'booleen', 'date', 'duree')),
    -- Un secret n'est JAMAIS stocké en base : la ligne ne porte que la référence de
    -- l'entrée du fichier de secrets, hors dépôt, lisible du seul compte de service
    -- (PLAN_SERVEUR §1.9).
    constraint ck_parametres_secret check (
        not secret or (valeur is null and reference_secret is not null))
);

create index ix_parametres_filiale   on parametres (filiale_id);
create index ix_parametres_categorie on parametres (categorie);

create trigger trg_parametres_maj before update on parametres
    for each row execute function f_maj_tracabilite();

comment on table parametres is
    'Configuration de l''application. filiale_id nul = paramètre de niveau Groupe ; renseigné = '
    'surcharge propre à une filiale. Couvre notamment le relais SMTP (hôte, port, chiffrement, '
    'mode d''authentification, adresse d''expédition, entièrement configurables avec bouton de '
    'test — PLAN_SERVEUR §1.11), la durée d''expiration des sessions, les seuils d''alerte, les '
    'quotas de pièces jointes et les durées de rétention.';
comment on column parametres.cle is
    'Clé hiérarchique en minuscules, séparée par des points (smtp.hote, session.inactivite_minutes, '
    'retention.journal_mois, journal.ancrage_2027).';
comment on column parametres.secret is
    'true = la valeur est un secret (mot de passe SMTP, secret OAuth2) : elle N''EST PAS stockée '
    'ici. Seule reference_secret désigne l''entrée du fichier de secrets géré hors dépôt.';
comment on column parametres.modifiable is
    'false = paramètre technique, ajustable seulement par migration ou par l''exploitation.';

-- =====================================================================================
-- §15 — PRIVILÈGES
-- Couche 1 de la garantie d'ajout seul : le rôle applicatif n'a pas le verbe SQL.
-- Les privilèges généraux ont été posés en « default privileges » au §0 ; seul le
-- journal fait l'objet d'un traitement explicite.
-- =====================================================================================

revoke all on journal_audit from public;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'revoke update, delete, truncate on journal_audit from grc_app';
        execute 'grant  select, insert on journal_audit to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on journal_audit to grc_lecture';
    end if;
end;
$$;

-- =====================================================================================
-- §15 bis — TRAÇABILITÉ D'INSERTION, PUIS GARDE-FOU DE SCHÉMA
-- -------------------------------------------------------------------------------------
-- Deux instructions, dans cet ordre, et le même couple clôt les quatre migrations
-- (CONVENTIONS.md §18.1 et §18.4) :
--
--   1. poser les déclencheurs « before insert » sur les tables que ce fichier a créées ;
--   2. faire échouer la migration si une vérification de schéma rend la moindre ligne.
--
-- Une migration future qui créerait des tables sans recopier ces deux instructions
-- échouera au déploiement sur la seconde — c'est tout l'objet du §18.4.
-- =====================================================================================

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
                      E'\\n' order by controle, objet, anomalie),
           count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception E'Vérification du schéma en défaut — % anomalie(s) :\\n%',
                        v_nombre, v_anomalies
            using errcode = '42501',
                  hint = 'chemin_recherche : ajoutez « set search_path = pg_catalog, public, '
                         'pg_temp » — pg_temp NOMMÉ et en DERNIER (§17.2). '
                         'tracabilite : appelez f_poser_tracabilite_insertion() en fin de '
                         'migration (§18.1). '
                         'couverture_rls : toute table porte « enable » et « force row level '
                         'security », une politique de lecture et une d''écriture (§11). '
                         'Voir backend/db/CONVENTIONS.md §18.4.';
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
-- §16 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('001', 'Socle : filiales, utilisateurs, sessions, groupes AD, profils, journal d''audit '
               'inaltérable, pièces jointes, approbations, référentiels activés, imports, paramètres')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Rejouer ce bloc DÉTRUIT le journal d'audit : à n'exécuter qu'en développement, jamais
-- en production, où la suppression d'un journal de trois ans est précisément ce que le
-- dispositif du §9 cherche à rendre impossible.
--
-- begin;
--   drop table if exists import_erreurs, imports, parametres, referentiels_actifs,
--                        approbations, session_domaines, session_filiales, sessions,
--                        groupes_ad, profil_domaines, profils cascade;
--   alter table if exists filiales drop constraint if exists fk_filiales_logo;
--   drop table if exists pieces_jointes cascade;
--   alter table journal_audit disable trigger trg_journal_audit_interdit_suppr;
--   alter table journal_audit disable trigger trg_journal_audit_interdit_vidage;
--   drop table if exists journal_audit cascade;
--   drop table if exists utilisateurs, filiales cascade;
--   drop function if exists f_verifier_chemin_recherche();
--   drop function if exists f_journal_audit_verifier(bigint);
--   drop function if exists f_journal_audit_chainage();
--   drop function if exists f_journal_audit_charge_utile(bigint, text, timestamptz, text, text,
--        text, text, inet, text, text, text, text, jsonb, jsonb, text, text);
--   drop function if exists f_approbations_verrou_decision();
--   drop function if exists f_interdit_modification();
--   drop function if exists f_maj_horodatage();
--   drop function if exists f_maj_tracabilite();
--   drop function if exists f_generer_id(text);
--   drop function if exists f_filiales_autorisees();
--   drop function if exists f_filiale_courante();
--   drop function if exists f_utilisateur_courant();
--   drop domain if exists type_entite, domaine_fonctionnel, niveau_droit, code_langue,
--                         empreinte_sha256, id_metier;
--   delete from migrations_schema where version = '001';
-- commit;
-- =====================================================================================
