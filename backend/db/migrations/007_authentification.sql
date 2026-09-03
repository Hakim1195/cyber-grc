-- =====================================================================================
-- 007_authentification.sql — Le substrat de session cesse d'être écrivable sans condition
-- =====================================================================================
-- Lot **L3** (authentification Active Directory et modèle de droits). Ce fichier ferme la
-- **condition d'entrée E1** du `backend/db/CONVENTIONS.md` §22, qui est une dette contractée
-- par la vague 1 **au nom de cette vague-ci** (§17.4), et pose en base ce que le modèle de
-- droits à trois axes exige pour exister.
--
-- Références : `CONVENTIONS.md` §17.4 (le report explicite et ce que le drapeau
-- d'administration est *et n'est pas*), §17.5 (un garde-fou ne se voit pas prêter plus de
-- portée qu'il n'en a), §19.4 et §19.5 (un garde-fou neuf se branche dans le commit qui le
-- fait naître ; une liste écrite à la main est une omission qui attend), §20.2 (un garde-fou
-- se vérifie dans les deux sens), §22 (conditions E1 et E5), §23 (une migration appliquée
-- ne se réécrit pas), §14 (rôles et privilèges) ; `PLAN_SERVEUR` §1.5 et §3.
--
-- Dépendances : 001 à 006. Contenu :
--   §0  Gardes
--   §1  f_authentification() — le réglage de la transaction d'ouverture de session
--   §2  E1 : les trois tables du substrat de session ne sont plus écrivables sans condition
--   §3  Le provisionnement à la première connexion : « utilisateurs » s'ouvre à L3, et à L3 seul
--   §4  E5 : les textes que ce fichier rend faux, corrigés dans le même fichier
--   §5  Le garde-fou neuf : f_verifier_substrat_session()
--   §6  Le socle du modèle de droits : les huit profils métier et leurs domaines
--   §7  Consignation, puis vérification
--   §8  Enregistrement de la migration
--
-- -------------------------------------------------------------------------------------
-- CE QUE CE FICHIER FERME, ET CE QU'IL NE FERME PAS — à lire avant de s'en réjouir
--
-- Ce qu'il ferme : `sessions`, `session_filiales` et `session_domaines` étaient
-- **intégralement réinscriptibles** par le rôle applicatif, sur les trois verbes, sans
-- aucune condition. N'importe quel chemin de code — donc n'importe quelle faute de
-- programmation dans les quarante routes de l'API — pouvait fabriquer une session, lui
-- attribuer les vingt filiales et le drapeau d'administration, puis s'en servir. Depuis ce
-- fichier, l'écriture exige que la transaction ait posé `grc.authentification`, ce que
-- `avecTransaction` ne fait jamais : seule la couche `src/auth/**` le pose, dans le corps
-- de sa propre transaction, et le réglage meurt au `commit` parce qu'il est local.
--
-- Ce qu'il NE ferme PAS, et le §17.5 impose de l'écrire ici plutôt que de laisser croire :
-- `grc.authentification` est de la même nature que `grc.administration_groupe` — une
-- **déclaration que la session fait sur elle-même**, pas un privilège. Le rôle applicatif
-- peut la poser, et rien dans la base ne l'en empêche. Une injection SQL dans le rôle
-- applicatif qui saurait poser ce réglage forgerait encore une session. Ce que la barrière
-- change est réel mais borné : la faute de programmation est arrêtée, l'attaque devient
-- conditionnée à la connaissance du réglage. La parade de fond reste le contrôle S5 —
-- requêtes intégralement paramétrées.
--
-- LA BARRIÈRE RÉELLE EST AILLEURS, et elle arrive avec ce même lot : c'est le modèle de
-- droits à trois axes, résolu **côté serveur** depuis les groupes AD, qui décide du
-- périmètre et du profil AVANT que quoi que ce soit soit posé. Le §17.4 le disait déjà du
-- drapeau d'administration ; c'est vrai à l'identique de celui-ci.
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

do $$
declare
    v_manquants text;
begin
    select string_agg(o, ', ' order by o)
      into v_manquants
      from unnest(array['f_administration_groupe()', 'f_verifier_couverture_rls()',
                        'f_consigner_controles_schema()', 'f_verifier_schema()',
                        'f_generer_id(text)']) as o
     where to_regprocedure('public.' || o) is null;

    if v_manquants is not null then
        raise exception 'Migrations 001 à 006 non toutes appliquées : fonction(s) manquante(s) : %.',
                        v_manquants
            using hint = 'Ordre imposé : 001 à 006, puis ce fichier.';
    end if;

    -- Les trois tables que ce fichier referme. Les nommer ici, et échouer si l'une manque,
    -- évite qu'un « drop policy if exists » silencieux fasse croire à un travail accompli.
    if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and c.relname in ('sessions', 'session_filiales', 'session_domaines')) <> 3 then
        raise exception 'Le substrat de session est incomplet : la migration 001 n''est pas appliquée.';
    end if;
end;
$$;

-- =====================================================================================
-- §1 — f_authentification() : LE RÉGLAGE DE LA TRANSACTION D'OUVERTURE DE SESSION
-- -------------------------------------------------------------------------------------
-- Contrat pour la couche applicative, et il est étroit **à dessein** : la couche
-- `src/auth/**` — et elle seule — pose, en PREMIÈRE instruction du corps de sa
-- transaction :
--
--     select set_config('grc.authentification', 'oui', true);
--
-- `set_config(…, true)` est l'équivalent paramétrable de `set local` : le réglage meurt au
-- `commit` comme au `rollback`. C'est ce qui le rend compatible avec un pool de connexions,
-- et c'est la moitié de la règle que le constat N-4 de la porte S1 a coûté cher à
-- apprendre : un réglage posé en portée SESSION serait hérité par la transaction suivante
-- servie par la même connexion, `appliquerPerimetre` ne l'écrasant pas.
--
-- Comparaison stricte à 'oui' : toute autre valeur, y compris 'true', '1' et la chaîne
-- vide, vaut non. Même convention que `f_administration_groupe()`, pour qu'il n'y ait pas
-- deux façons de dire oui dans ce schéma.
--
-- POURQUOI CE N'EST PAS `f_administration_groupe()` QUI SERT ICI. L'ouverture de session
-- n'est pas un acte d'administration : elle a lieu pour tout le monde, y compris pour le
-- contributeur d'une seule filiale, et surtout **avant** que le profil soit connu — c'est
-- elle qui le résout. Réutiliser le drapeau d'administration aurait signifié que toute
-- connexion s'ouvre en administration Groupe, c'est-à-dire l'inverse de ce qu'on cherche.
-- =====================================================================================

create or replace function f_authentification() returns boolean
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select coalesce(current_setting('grc.authentification', true), '') = 'oui';
$$;

comment on function f_authentification() is
    'Vrai si la transaction est la transaction d''OUVERTURE DE SESSION de la couche '
    'd''authentification (grc.authentification = ''oui'', posé localement par src/auth/**). '
    'Autorise l''écriture du substrat de session — sessions, session_filiales, '
    'session_domaines — et le provisionnement d''un compte inconnu dans utilisateurs '
    '(PLAN_SERVEUR §1.5). N''élargit JAMAIS la lecture : elle n''apparaît dans aucune '
    'politique de lecture, et f_verifier_substrat_session() fait échouer le déploiement si '
    'elle venait à y apparaître. '
    'CE QU''ELLE N''EST PAS (CONVENTIONS.md §17.4 et §17.5) : un privilège. C''est une '
    'DÉCLARATION QUE LA SESSION FAIT SUR ELLE-MÊME — le rôle applicatif la pose lui-même et '
    'rien dans la base ne l''en empêche. Elle arrête la FAUTE DE PROGRAMMATION, pas un rôle '
    'applicatif compromis. La barrière réelle est le modèle de droits à trois axes, résolu '
    'côté serveur depuis les groupes AD.';

-- =====================================================================================
-- §2 — E1 : LE SUBSTRAT DE SESSION N'EST PLUS ÉCRIVABLE SANS CONDITION
-- -------------------------------------------------------------------------------------
-- Les trois tables gardent leur LECTURE ouverte, et c'est délibéré, pour la raison même
-- qui vaut pour les tables de configuration (004 §6) : elles sont lues pour RÉSOUDRE les
-- droits, donc AVANT que le périmètre existe. Une lecture conditionnée serait circulaire —
-- et le garde-fou du 004 §8 refuserait de toute façon une politique de lecture qui
-- dépendrait d'un réglage de session.
--
-- Leur ÉCRITURE, elle, se ferme sur les trois verbes. Ce qui change concrètement pour le
-- reste du serveur : `avecTransaction` ne pose PAS `grc.authentification`, et ne le posera
-- pas — une session applicative ordinaire reçoit donc désormais un refus de politique
-- (42501) là où elle réussissait.
--
-- ⚠️ CE QUE LA FERMETURE REND SILENCIEUX, ET IL FAUT LE DIRE. Un `insert` refusé par une
-- politique lève 42501 : il est BRUYANT. Un `update` ou un `delete` dont le `using` ne
-- passe pas ne lève rien — la ligne est simplement invisible, et l'ordre affecte zéro
-- ligne en annonçant un succès. C'est la pathologie que le 004 §6 décrit pour la purge du
-- journal d'audit, et elle vaut ici pour la révocation et la purge des sessions. Du point
-- de vue de la SÉCURITÉ c'est sans danger — rien ne se produit ; du point de vue de
-- l'EXPLOITATION, une purge qui ne purge pas est un défaut. La parade n'est pas dans la
-- base : `src/auth/sessions.ts` compte les lignes affectées par chaque révocation et
-- chaque purge, et lève si le compte est nul là où il attendait quelque chose.
--
-- ⚠️ CE QUE CE CHANGEMENT CASSE, ET QUI EST ATTENDU. `backend/test/base/rls.test.mjs`
-- porte un essai nommé « REPORT ASSUMÉ : les trois tables de session restent écrivables
-- sans condition », qui exige que les neuf prédicats d'écriture valent littéralement
-- « true » et qui annonce lui-même sa mort : « Le lot L3 posera un réglage
-- grc.authentification […] Ce test tombera alors — c'est exactement ce qu'on attend de
-- lui. » Le semoir `backend/test/aide/base.mjs` insère lui aussi dans `sessions` et
-- `session_filiales` sous un périmètre ordinaire. Ces deux fichiers appartiennent à un
-- autre agent (`PLAN_EXECUTION` §2) : ils sont signalés, pas corrigés ici.
-- =====================================================================================

do $$
declare
    -- Les trois tables du substrat, DÉCOUVERTES et non récitées (§19.5) : « sessions », et
    -- toute table qui la référence par une clé étrangère. Une table `session_<x>` ajoutée
    -- demain — et le lot L4 en ajoutera peut-être une pour la filiale sélectionnée — est
    -- refermée du même geste, sans que personne ait à y penser. C'est la différence entre
    -- une liste et un critère : la liste vieillit, le critère non.
    v_tables text[];
    t text;
begin
    select array_agg(nom order by nom) into v_tables
      from (
            select 'sessions'::text as nom
            union
            select c.relname::text
              from pg_constraint k
              join pg_class c on c.oid = k.conrelid
              join pg_class cible on cible.oid = k.confrelid
              join pg_namespace n on n.oid = c.relnamespace
             where k.contype = 'f' and n.nspname = 'public' and cible.relname = 'sessions'
           ) s;

    if v_tables is null or array_length(v_tables, 1) < 3 then
        raise exception 'Substrat de session : % table(s) découverte(s), 3 attendues au minimum.',
                        coalesce(array_length(v_tables, 1), 0)
            using hint = 'sessions, session_filiales, session_domaines (001_socle.sql §8).';
    end if;

    foreach t in array v_tables loop
        -- La lecture n'est pas touchée : sa politique et son commentaire restent ceux de
        -- 004 §6, qui disent déjà vrai.
        execute format('drop policy if exists %I on %I', 'pol_' || t || '_ajout', t);
        execute format('drop policy if exists %I on %I', 'pol_' || t || '_maj', t);
        execute format('drop policy if exists %I on %I', 'pol_' || t || '_suppression', t);

        execute format('create policy %I on %I for insert with check (f_authentification())',
                       'pol_' || t || '_ajout', t);
        execute format('create policy %I on %I for update using (f_authentification()) '
                       'with check (f_authentification())',
                       'pol_' || t || '_maj', t);
        execute format('create policy %I on %I for delete using (f_authentification())',
                       'pol_' || t || '_suppression', t);

        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_ajout', t,
            'Écriture réservée à la TRANSACTION D''OUVERTURE DE SESSION '
            '(grc.authentification = ''oui''), migration 007 : c''est la fermeture du report '
            'du CONVENTIONS.md §17.4, condition d''entrée E1 du lot L3. Cette table PRODUIT '
            'la décision d''autorisation ; la laisser réinscriptible par le rôle qui exécute '
            'le contrôle des droits rendait la défense circulaire. Le réglage est une '
            'déclaration de la session sur elle-même, pas un privilège (§17.5) : il arrête '
            'la faute de programmation, pas un rôle applicatif compromis.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_maj', t,
            'Idem ajout : transaction d''ouverture de session seulement. Couvre la mise à '
            'jour de derniere_activite et la RÉVOCATION d''une session, qui sont des actes '
            'de la couche d''authentification et de personne d''autre.');
        execute format('comment on policy %I on %I is %L', 'pol_' || t || '_suppression', t,
            'Idem ajout : transaction d''ouverture de session seulement. La purge des '
            'sessions expirées relève de la même couche.');

        raise notice 'Substrat de session : % refermée sur f_authentification().', t;
    end loop;
end;
$$;

-- =====================================================================================
-- §3 — LE PROVISIONNEMENT À LA PREMIÈRE CONNEXION
-- -------------------------------------------------------------------------------------
-- `PLAN_SERVEUR` §1.5 : « un utilisateur inconnu mais membre d'un groupe autorisé est créé
-- à sa première connexion. Aucune administration manuelle des comptes. » La migration 004
-- §6 avait fermé l'écriture d'`utilisateurs` à l'administration Groupe, en écrivant à
-- l'endroit exact que « le provisionnement à la première connexion passera par le réglage
-- d'authentification du lot L3 ». C'est ce fichier, et c'est maintenant.
--
-- L'écriture devient donc : administration Groupe **ou** transaction d'ouverture de
-- session. Le second membre couvre trois gestes, et aucun n'est un acte d'administration :
--   · créer le compte d'un membre d'un groupe autorisé qui se présente pour la première
--     fois (provisionnement) ;
--   · rafraîchir ce que l'annuaire dit de lui (nom affiché, courriel, service) et
--     l'horodatage de sa dernière connexion ;
--   · le DÉPROVISIONNER — `actif = false` — quand l'annuaire dit que son compte est
--     désactivé ou qu'il a perdu ses groupes. C'est la moitié qui compte : sans elle, le
--     déprovisionnement immédiat du §1.5 exigerait qu'un administrateur soit connecté au
--     moment où l'AD change d'avis.
--
-- LA SUPPRESSION, elle, reste réservée à l'administration Groupe : on ne supprime pas un
-- compte, on le désactive — le journal d'audit référence `utilisateurs` en « restrict » et
-- la trace de trois ans doit rester attribuable (001 §9).
-- =====================================================================================

drop policy if exists pol_utilisateurs_ajout on utilisateurs;
drop policy if exists pol_utilisateurs_maj   on utilisateurs;

create policy pol_utilisateurs_ajout on utilisateurs for insert
    with check (f_administration_groupe() or f_authentification());

create policy pol_utilisateurs_maj on utilisateurs for update
    using (f_administration_groupe() or f_authentification())
    with check (f_administration_groupe() or f_authentification());

comment on policy pol_utilisateurs_ajout on utilisateurs is
    'Écriture réservée à l''ADMINISTRATION GROUPE (constat M-2 de la porte S1, §17.4) ou à '
    'la TRANSACTION D''OUVERTURE DE SESSION (migration 007) : le provisionnement automatique '
    'à la première connexion crée le compte d''un membre d''un groupe AD autorisé, sans '
    'administrateur dans la boucle (PLAN_SERVEUR §1.5). Le fonctionnement courant, lui, '
    'n''écrit toujours pas ici.';
comment on policy pol_utilisateurs_maj on utilisateurs is
    'Idem ajout. La transaction d''ouverture de session met à jour ce que l''annuaire dit du '
    'compte, sa dernière connexion, ses compteurs de tentatives — et le DÉSACTIVE dès que '
    'l''AD le désactive ou lui retire ses groupes. Sans ce second membre, le '
    'déprovisionnement immédiat du PLAN_SERVEUR §1.5 supposerait qu''un administrateur soit '
    'connecté au bon moment. La SUPPRESSION, elle, reste à l''administration Groupe seule : '
    'un compte se désactive, il ne s''efface pas — le journal d''audit le référence en '
    '« restrict » sur trois ans.';

-- =====================================================================================
-- §4 — E5 : LES TEXTES QUE CE FICHIER REND FAUX
-- -------------------------------------------------------------------------------------
-- Condition d'entrée **E5** (§22) : « chacun des commentaires lus dans le catalogue décrit
-- ce que fait réellement le code ». Le balayage de la migration 006 avait trouvé et corrigé
-- le troisième commentaire faux (constat Q-18, domaine `id_metier`) ; la ligne E5 du §22,
-- écrite avant, l'annonce encore comme vivant. **Vérifié dans le catalogue de la base
-- avant d'écrire ce fichier : il est corrigé.** Ce qui reste à faire au titre d'E5 n'est
-- donc pas de le chercher, c'est de ne pas en fabriquer de nouveaux — et ce fichier en
-- fabrique deux.
--
-- Le premier est dans `f_verifier_couverture_rls()`, réémise ci-dessous. Son corps — donc
-- le catalogue, `pg_proc.prosrc` étant du catalogue au même titre qu'un `comment on` —
-- porte deux lignes qui disent « fermeture reportée au lot L3 » et « report L3 écrit
-- au §6 ». Le report est fermé par le §2 ci-dessus. Les deux lignes deviendraient fausses
-- à la seconde même où cette migration s'applique.
--
-- La fonction est réémise **verbatim**, à ces deux lignes près : son corps a été lu dans le
-- catalogue de la base et réinjecté par un script, pour qu'aucune main ne recopie
-- 198 lignes et n'y glisse autre chose que la correction voulue. Sa signature ne change
-- pas — le registre des garde-fous (005) la reconnaît donc à l'identique, et la
-- consignation du §7 n'aura rien à consigner.
--
-- Le second texte rendu faux est le commentaire des politiques d'écriture des trois tables
-- de session (« Écriture ouverte au rôle applicatif : c'est le contrôle des droits côté
-- serveur, et les privilèges SQL, qui décident qui peut écrire ici »). Il n'est pas corrigé
-- ici : les politiques qu'il commentait n'existent plus, et le §2 a posé de nouveaux
-- commentaires avec les nouvelles politiques. Un commentaire meurt avec son objet.
-- =====================================================================================

create or replace function f_verifier_couverture_rls()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- ── LA LISTE EST INVERSÉE DEPUIS LE CONSTAT Q-5 (CONVENTIONS.md §19.5) ───────────
    --
    -- Elle énumérait « les six tables de liaison sans filiale_id » qui devaient être
    -- cloisonnées par leur seule politique. Il y en avait SEPT : import_erreurs manquait
    -- à l'appel, et échappait donc entièrement au garde-fou. Rejoué à la porte S1 : sa
    -- politique de lecture ramenée à « using (true) » ne remontait AUCUNE anomalie, sur
    -- une table dont la migration 003 dit elle-même qu'« une ligne d'erreur cite le
    -- contenu du fichier importé, c'est donc de la donnée de filiale » — un import de
    -- l'annuaire des personnes ou du registre RGPD y dépose des noms verbatim.
    --
    -- C'était la troisième fois qu'une liste écrite à la main produisait un défaut. Le
    -- sens de lecture est donc renversé : le garde-fou DÉCOUVRE dans le catalogue les
    -- tables qui ne portent pas de filiale_id, et EXIGE de chacune un prédicat
    -- cloisonnant, SAUF si elle figure nommément ci-dessous. Une table future oubliée est
    -- désormais réclamée bruyamment au lieu d'être exemptée en silence : le défaut par
    -- défaut est fermé, plus ouvert.
    --
    -- Les tables sans filiale_id dont l'absence de cloisonnement est LÉGITIME et motivée.
    -- Elles sont de niveau Groupe, ou lues avant que le périmètre existe (§6).
    v_sans_filiale_admises constant text[] := array[
        -- ── AJOUTÉE PAR 005_controles_schema.sql, ET C'EST LA SEULE DIFFÉRENCE ─────
        -- avec la version posée par 004 (le reste de cette fonction est recopié
        -- verbatim : une migration appliquée ne se réécrit pas, elle se corrige dans
        -- la suivante — CONVENTIONS.md §23).
        --
        -- controles_schema est un REGISTRE TECHNIQUE, de même nature que
        -- migrations_schema : il garde la dernière observation des garde-fous du
        -- schéma. Il ne contient aucune donnée de filiale — un nom de fonction et sa
        -- signature — et il est lu par f_verifier_schema() AVANT que le périmètre
        -- existe, à chaque migration et à chaque installation. Son écriture n'est pas
        -- tenue par une politique mais par les PRIVILÈGES : le rôle applicatif n'a que
        -- « select » dessus (§2 de cette migration), et f_verifier_privileges() le
        -- vérifie désormais à chaque déploiement.
        'controles_schema',
        'filiales',           -- définit la frontière elle-même ; lue avant tout périmètre
        'utilisateurs',       -- identités ; lues pour RÉSOUDRE le périmètre
        'profils',            -- définition des profils métier (niveau Groupe)
        'profil_domaines',    -- droits d'un profil par domaine (niveau Groupe)
        'migrations_schema',  -- registre technique ; écriture fermée par les privilèges
        'sessions',           -- produit le périmètre : sa LECTURE reste non cloisonnée,
                              -- son ÉCRITURE est fermée depuis 007 (f_authentification)
        'session_domaines',   -- idem ; l'exemption ne porte plus que sur la lecture
        'mappings',           -- catalogue de correspondances, niveau Groupe (§16.4)
        -- mapping_exigences : n'est PAS cloisonnable, et la traiter comme les six
        -- liaisons serait une erreur de fait. Son parent (mappings) est de niveau GROUPE,
        -- et son autre extrémité est le couple (ref_id, code) du catalogue statique de
        -- référentiels, qui n'est pas en base. Aucune de ses deux extrémités n'appartient
        -- à une filiale : elle ne peut, par construction, porter aucun lien
        -- inter-filiales. Dérogée EN CONNAISSANCE DE CAUSE — la dérogation ne porte que
        -- sur la LECTURE ; son écriture est réservée à l'administration Groupe depuis le
        -- constat M-4 de la porte S2, et c'est arbitré par écrit au §6.
        'mapping_exigences'
    ];

    -- Dérogations documentées à l'exigence « prédicat non trivial » pour des tables qui
    -- PORTENT, elles, un filiale_id (voir §6). Toute AUTRE table porteuse d'un filiale_id
    -- dont la politique dirait « true » fait échouer la vérification : c'est ce qui
    -- interdit à une migration future d'ouvrir une table en grand par inadvertance.
    v_derogations constant text[] := array[
        'groupes_ad',       -- aiguillage de l'authentification, lu AVANT tout périmètre
        'journal_audit',    -- chaînage : la numérotation exige de voir la chaîne entière
        'session_filiales'  -- c'est la table qui PRODUIT le périmètre ; le filtrer par
                            -- lui-même rendrait toute connexion impossible
    ];
    v_nom text;
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
        -- Une table est SOUMISE au cloisonnement si elle porte un filiale_id, ou si elle
        -- n'en porte pas SANS figurer dans la liste des exemptions motivées. Le second
        -- membre est la découverte : ce n'est plus une liste de tables à couvrir, c'est
        -- une liste de tables à NE PAS couvrir, et tout le reste l'est d'office.
        if (r.porte_filiale or not (r.nom = any (v_sans_filiale_admises)))
           and not (r.nom = any (v_derogations)) then
            if exists (
                select 1 from pg_policy p
                 where p.polrelid = r.oid and p.polpermissive and p.polcmd in ('r', '*')
                   and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true')
                       !~ '(f_filiales_lecture|f_filiales_autorisees)')
            then
                anomalie := 'lecture_non_cloisonnee';
                detail   := 'une politique de lecture ne consulte pas le périmètre de la session '
                            '(ni f_filiales_lecture, ni f_filiales_autorisees) sur une table '
                            'cloisonnée : toutes les filiales se lisent entre elles. Si la table '
                            'ne porte pas de filiale_id et relève réellement du niveau Groupe, '
                            'elle doit être DÉCLARÉE dans v_sans_filiale_admises, avec son motif';
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
                            'écrire chez une autre. Si la table ne porte pas de filiale_id et '
                            'relève réellement du niveau Groupe, elle doit être DÉCLARÉE dans '
                            'v_sans_filiale_admises, avec son motif';
                return next;
            end if;
        end if;
    end loop;

    -- Les deux listes écrites à la main ne désignent que des EXEMPTIONS ; le §19.5
    -- n'admet une liste écrite que si le garde-fou vérifie qu'elle reste juste. Une
    -- exemption qui ne désigne plus rien — table supprimée, table renommée — dispenserait
    -- silencieusement de cloisonnement la prochaine table qui reprendrait ce nom.
    foreach v_nom in array v_sans_filiale_admises || v_derogations loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'exemption_obsolete';
            detail   := 'table dispensée de cloisonnement par f_verifier_couverture_rls(), '
                        'mais introuvable dans le schéma : la dérogation ne porte plus sur '
                        'rien et couvrirait toute table future qui reprendrait ce nom';
            return next;
        end if;
    end loop;

    return;
end;

$$;

-- Le commentaire de la fonction est reposé à l'identique : `create or replace` conserve
-- celui du catalogue, mais le reposer rend le fichier autonome à la lecture.
comment on function f_verifier_couverture_rls() is
    'Vérifie que TOUTE table du schéma public porte « enable » ET « force row level '
    'security », au moins une politique de lecture et une politique d''écriture, et que ses '
    'politiques CONSULTENT le périmètre. Réémise par 007 pour deux lignes de commentaire '
    'que la fermeture du substrat de session (condition E1) rendait fausses : le corps est '
    'celui de 005, à ces deux lignes près. PORTÉE EXACTE, à ne pas surestimer '
    '(CONVENTIONS.md §17.5) : elle exige qu''un prédicat MENTIONNE la fonction de périmètre '
    'attendue — un prédicat qui la mentionne sans s''en servir lui échappe. Le filet qui '
    'mord est ailleurs : ce sont les essais de comportement.';

-- =====================================================================================
-- §5 — LE GARDE-FOU NEUF : f_verifier_substrat_session()
-- -------------------------------------------------------------------------------------
-- §19.4 : un garde-fou neuf se branche dans le même commit qu'il naît. Il n'y a rien à
-- brancher — la découverte de 005 le trouvera toute seule (nom `f_verifier_<x>`, sans
-- argument, rendant (objet, anomalie, detail)), `f_verifier_schema()` le jouera, et le §7
-- ci-dessous le consigne. C'est exactement la mécanique que le constat Q-5 a fait naître.
--
-- CE QU'IL VÉRIFIE, et pourquoi il vaut plus que le §2 tout seul : le §2 est un fait
-- accompli une fois, ce garde-fou est une propriété tenue à chaque déploiement. Une
-- migration future qui rouvrirait `sessions` « le temps de déboguer », ou qui ajouterait une
-- table de session sans y penser, fait échouer l'installation au lieu de passer.
--
-- Deux anomalies, et la seconde est la symétrique de celle du 004 §8 :
--   · `ecriture_sans_authentification` — une table du substrat dont une politique d'ajout,
--     de modification ou de suppression ne mentionne pas `f_authentification()` ;
--   · `authentification_en_lecture` — une politique de LECTURE, sur n'importe quelle table
--     du schéma, qui mentionne `f_authentification()`. Un réglage de session ne doit jamais
--     élargir la lecture ; c'est ce que le 004 §8 interdit déjà au drapeau d'administration,
--     et il n'y a pas de raison que le second réglage échappe à la règle du premier.
--
-- CE QU'IL NE VOIT PAS, et il faut le dire (§17.5) : comme son voisin de 004, il regarde si
-- le prédicat MENTIONNE la fonction. Un prédicat « f_authentification() or true » le
-- satisferait. Ce n'est pas une preuve de fermeture, c'est un détecteur de réouverture
-- franche — la forme que prend en pratique une régression de politique. La preuve de
-- fermeture est ailleurs : `backend/test/droits/substrat-session.test.mjs` fait tenter
-- l'écriture à une session applicative ordinaire et exige le refus.
-- =====================================================================================

create or replace function f_verifier_substrat_session()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_substrat text[];
    r record;
begin
    -- Même découverte qu'au §2, et c'est le point : le garde-fou ne récite pas la liste que
    -- la migration a employée, il la retrouve par le même critère. Deux listes qui doivent
    -- coïncider finissent par diverger (§19.5).
    select array_agg(nom) into v_substrat
      from (
            select 'sessions'::text as nom
            union
            select c.relname::text
              from pg_constraint k
              join pg_class c on c.oid = k.conrelid
              join pg_class cible on cible.oid = k.confrelid
              join pg_namespace n on n.oid = c.relnamespace
             where k.contype = 'f' and n.nspname = 'public' and cible.relname = 'sessions'
           ) s;

    if v_substrat is null then
        objet    := 'sessions';
        anomalie := 'substrat_absent';
        detail   := 'la table sessions n''existe plus : le modèle de droits n''a plus de '
                    'substrat, et ce contrôle ne vérifie plus rien';
        return next;
        return;
    end if;

    for r in
        select c.relname::text as nom,
               p.polname::text as politique,
               p.polcmd        as verbe,
               coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
                 || ' ' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') as predicat
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = any (v_substrat)
           and p.polcmd in ('a', 'w', 'd', '*')
         order by c.relname, p.polname
    loop
        if position('f_authentification' in r.predicat) = 0 then
            objet    := r.nom;
            anomalie := 'ecriture_sans_authentification';
            detail   := format('la politique %s (%s) n''exige pas la transaction d''ouverture '
                               'de session : le substrat d''autorisation redevient écrivable '
                               'par le rôle qui exécute le contrôle des droits '
                               '(CONVENTIONS.md §17.4, condition E1)',
                               r.politique, r.verbe);
            return next;
        end if;
    end loop;

    for r in
        select c.relname::text as nom, p.polname::text as politique
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and p.polcmd in ('r', '*')
           and position('f_authentification' in
                        coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
         order by c.relname, p.polname
    loop
        objet    := r.nom;
        anomalie := 'authentification_en_lecture';
        detail   := format('la politique de lecture %s mentionne f_authentification() : un '
                           'réglage de session élargirait la LECTURE, ce que le 004_rls.sql '
                           '§2 interdit déjà au drapeau d''administration', r.politique);
        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_substrat_session() is
    'Garde-fou du substrat d''autorisation (condition d''entrée E1, CONVENTIONS.md §22). '
    'DÉCOUVRE le substrat — « sessions » et toute table qui la référence — puis exige que '
    'chacune de ses politiques d''ÉCRITURE mentionne f_authentification(), et qu''AUCUNE '
    'politique de LECTURE du schéma ne la mentionne. Joué par f_verifier_schema() à chaque '
    'déploiement. PORTÉE EXACTE (§17.5) : il détecte une RÉOUVERTURE FRANCHE, pas une '
    'politique savamment inopérante — « f_authentification() or true » le satisferait. La '
    'preuve de fermeture est le refus effectif, éprouvé par le banc.';

-- =====================================================================================
-- §6 — LE SOCLE DU MODÈLE DE DROITS : LES HUIT PROFILS ET LEURS DOMAINES
-- -------------------------------------------------------------------------------------
-- `PLAN_SERVEUR` §3.2. La migration 001 §4 dit « aucun profil n'est inséré ici : le
-- peuplement relève des données de socle, pas du schéma » — et c'est encore vrai : ce qui
-- suit n'est pas du schéma, c'est **le socle produit** (`profils.socle = true`), la
-- frontière socle / spécifique du §0.5. Il vit dans une migration parce qu'un déploiement
-- sans profils n'a pas de modèle de droits du tout, et qu'un fichier de données à part
-- serait un fichier qu'on oublie d'exécuter.
--
-- Ce que ce socle N'EST PAS : une décision figée. Les profils sont configurables (c'est le
-- §3.2, et c'est ce qui rend le socle réutilisable) : un déploiement peut ajouter les
-- siens, fermer un domaine, changer un niveau. Ce qui est ici est un **défaut défendable**,
-- pas un dogme.
--
-- Deux lectures qu'il a fallu trancher, et qui appellent une validation du RSSI groupe
-- (`PLAN_SERVEUR` §9) :
--
--  1. « Les domaines droits, filiales, parametres et journal sont réservés au profil
--     Administrateur » (004 §6). *Réservés à* ne veut pas dire *limité à* : l'ADMIN reçoit
--     ici les trente domaines en administration, et lui seul reçoit ces quatre-là. La
--     lecture inverse — un administrateur qui n'a que ces quatre domaines — rendrait
--     l'administration Groupe inutilisable : le drapeau `grc.administration_groupe`
--     déverrouille l'écriture du socle Groupe des tables mixtes (catalogue de mesures,
--     annuaire et politiques de portée Groupe), dont les domaines sont « mesures »,
--     « personnel » et « documents ». Un administrateur qui ne les aurait pas porterait un
--     drapeau qu'aucun domaine ne le laisserait employer.
--  2. Le RSSI reçoit « tous les domaines de sa filiale » : les vingt-six autres, en
--     validation. Il n'a donc ni la gestion des droits, ni le journal d'audit — c'est
--     précisément ce qu'un auditeur ISO 27001 attend, la question « le RSSI peut-il
--     modifier le journal ? » étant celle qui décide de la valeur probante du registre
--     (PLAN_SERVEUR §1.7).
--
-- `niveau_defaut` porte le NIVEAU DU PROFIL au sens du `PLAN_SERVEUR` §3.1 — le troisième
-- axe, un par profil. Il vaut donc le plus haut niveau que le profil exerce sur l'un de
-- ses domaines : « contribution » pour la qualité, qui contribue aux audits même si elle
-- ne fait que lire la conformité. Le niveau PAR DOMAINE de `profil_domaines` est un
-- RAFFINEMENT de cet axe, pas un doublon : c'est lui qui dit que la qualité ne réécrit pas
-- une exigence. Les deux coexistent, et la couche applicative doit consulter le second —
-- ce qu'elle ne fait pas encore, et c'est écrit dans `src/droits/passerelle-api.ts`.
--
-- Le peuplement est IDEMPOTENT : il n'insère que ce qui manque, et ne touche jamais à ce
-- qu'une administration aurait modifié depuis. Une migration qui écraserait un paramétrage
-- client à chaque déploiement serait une perte de données, pas une mise à jour.
--
-- Les groupes AD, eux, ne sont PAS semés ici : leurs noms dépendent du préfixe configuré
-- (`LDAP_PREFIXE_GROUPES`) et des codes de filiales du déploiement. Ils sont ENGENDRÉS
-- depuis la configuration par `src/droits/groupes-ad.ts` (`PLAN_SERVEUR` §3.4, et §19.5 :
-- une liste écrite à la main est une omission qui attend).
-- =====================================================================================

do $$
declare
    v_profils integer;
    v_droits  integer;
    v_larges  integer;
begin
    -- L'écriture de `profils` et `profil_domaines` est réservée à l'administration Groupe
    -- (004 §6) et « force row level security » vaut aussi pour le propriétaire : la
    -- migration doit donc se déclarer, comme n'importe quel autre chemin d'écriture. Le
    -- réglage est local à la transaction et meurt au commit.
    perform set_config('grc.administration_groupe', 'oui', true);

    with souhaite (code, nom, niveau_defaut, description) as (values
        ('RSSI',      'RSSI de filiale',
         'validation',
         'Tous les domaines métier de sa filiale, en validation. N''a ni la gestion des '
         'droits, ni le journal d''audit : c''est ce que demande la valeur probante du '
         'registre (PLAN_SERVEUR §1.7).'),
        ('CONTRIB',   'Contributeur',
         'contribution',
         'Saisie courante, bornée à quatre domaines : actions, incidents, actifs, MCO '
         '(PLAN_SERVEUR §3.2).'),
        ('QUALITE',   'Service qualité',
         'contribution',
         'Audits, gestion documentaire et revues de direction en contribution ; la '
         'conformité en lecture. Ne voit pas la cartographie des actifs.'),
        ('RH',        'Ressources humaines',
         'contribution',
         'Annuaire du personnel en contribution ; registre RGPD et incidents en lecture '
         '(PLAN_SERVEUR §3.2).'),
        ('DPO',       'Délégué à la protection des données',
         'validation',
         'Registre RGPD en validation, incidents en contribution, documents en lecture.'),
        ('DIRECTION', 'Direction',
         'lecture',
         'Tableau de bord, synthèse et conformité, en lecture seule. Destiné à un '
         'périmètre Groupe (PLAN_SERVEUR §3.1).'),
        ('AUDITEUR',  'Auditeur externe',
         'lecture',
         'Lecture large, AUCUNE écriture nulle part. Destiné aux audits externes.'),
        ('ADMIN',     'Administrateur de l''application',
         'administration',
         'Filiales, droits, paramètres et journal — dont il est le seul détenteur — et les '
         'autres domaines en administration, sans quoi le drapeau d''administration Groupe '
         'ne serait employable nulle part.')
    )
    insert into profils (id, code, nom, niveau_defaut, description, socle, actif)
    select f_generer_id('PROF'), s.code, s.nom, s.niveau_defaut, s.description, true, true
      from souhaite s
     where not exists (select 1 from profils p where p.code = s.code);

    get diagnostics v_profils = row_count;

    -- Les profils à liste courte : un couple (domaine, niveau) par ligne.
    with souhaite (code, domaine, niveau) as (values
        -- Contributeur — les quatre domaines de la saisie courante, et rien d'autre.
        ('CONTRIB',   'actions',         'contribution'),
        ('CONTRIB',   'incidents',       'contribution'),
        ('CONTRIB',   'actifs',          'contribution'),
        ('CONTRIB',   'mco',             'contribution'),
        -- Qualité — « audits, documents, revues de direction, conformité ». La conformité
        -- se lit sur trois domaines : exigences, référentiels, mesures.
        ('QUALITE',   'audits',          'contribution'),
        ('QUALITE',   'documents',       'contribution'),
        ('QUALITE',   'revues',          'contribution'),
        ('QUALITE',   'exigences',       'lecture'),
        ('QUALITE',   'referentiels',    'lecture'),
        ('QUALITE',   'mesures',         'lecture'),
        ('QUALITE',   'tableau_de_bord', 'lecture'),
        -- Le domaine qu'un profil ne doit PAS voir se ferme EXPLICITEMENT plutôt que par
        -- omission : « aucun » se relit en revue de droits, l'absence ne se relit pas
        -- (001 §4, commentaire de profil_domaines.niveau).
        ('QUALITE',   'cartographie',    'aucun'),
        -- RH — personnel, RGPD en lecture, incidents impliquant du personnel.
        ('RH',        'personnel',       'contribution'),
        ('RH',        'rgpd',            'lecture'),
        ('RH',        'incidents',       'lecture'),
        ('RH',        'tableau_de_bord', 'lecture'),
        -- DPO — registre RGPD, incidents, documents.
        ('DPO',       'rgpd',            'validation'),
        ('DPO',       'incidents',       'contribution'),
        ('DPO',       'documents',       'lecture'),
        ('DPO',       'personnel',       'lecture'),
        ('DPO',       'tableau_de_bord', 'lecture'),
        -- Direction — tableau de bord, synthèse, conformité, en lecture.
        ('DIRECTION', 'tableau_de_bord', 'lecture'),
        ('DIRECTION', 'synthese',        'lecture'),
        ('DIRECTION', 'echeances',       'lecture'),
        ('DIRECTION', 'exigences',       'lecture'),
        ('DIRECTION', 'referentiels',    'lecture'),
        ('DIRECTION', 'mesures',         'lecture')
    )
    insert into profil_domaines (profil_id, domaine, niveau)
    select p.id, s.domaine, s.niveau
      from souhaite s
      join profils p on p.code = s.code
     where not exists (select 1 from profil_domaines d
                        where d.profil_id = p.id and d.domaine = s.domaine);

    get diagnostics v_droits = row_count;

    -- Les trois profils à liste large. Les domaines sont DÉCOUVERTS dans la contrainte du
    -- domaine `domaine_fonctionnel` plutôt que recopiés : le jour où un domaine s'ajoute au
    -- schéma, le RSSI et l'auditeur l'obtiennent sans qu'une main y pense (§19.5).
    with tous as (
        select m[1] as domaine
          from pg_constraint c
          join pg_type t on t.oid = c.contypid
         cross join lateral regexp_matches(pg_get_constraintdef(c.oid),
                                           '''([a-z_]+)''::text', 'g') as m
         where t.typname = 'domaine_fonctionnel'
    ),
    large (code, niveau, avec_administration) as (values
        ('RSSI',     'validation',     false),
        ('AUDITEUR', 'lecture',        false),
        ('ADMIN',    'administration', true)
    )
    insert into profil_domaines (profil_id, domaine, niveau)
    select p.id, t.domaine, l.niveau
      from large l
      join profils p on p.code = l.code
     cross join tous t
     where (l.avec_administration
            or t.domaine not in ('droits', 'filiales', 'parametres', 'journal'))
       and not exists (select 1 from profil_domaines d
                        where d.profil_id = p.id and d.domaine = t.domaine);

    get diagnostics v_larges = row_count;

    raise notice 'Socle du modèle de droits : % profil(s) créé(s) ; % + % domaine(s) de '
                 'profil posé(s). Profils en base : %, couples profil/domaine : %.',
                 v_profils, v_droits, v_larges,
                 (select count(*) from profils),
                 (select count(*) from profil_domaines);

    -- Le socle doit être complet, sans quoi la couche d'authentification résoudra des
    -- droits vides sans que rien ne le dise. On le vérifie plutôt que de l'espérer.
    if (select count(*) from profils where socle) < 8 then
        raise exception 'Socle du modèle de droits incomplet : % profil(s) de socle sur 8.',
                        (select count(*) from profils where socle);
    end if;
    if (select count(*) from profil_domaines d join profils p on p.id = d.profil_id
         where p.code = 'ADMIN') <> 30 then
        raise exception 'Le profil ADMIN devrait porter les 30 domaines fonctionnels, il en '
                        'porte % : la découverte des domaines a échoué.',
                        (select count(*) from profil_domaines d join profils p on p.id = d.profil_id
                          where p.code = 'ADMIN');
    end if;
end;
$$;

-- =====================================================================================
-- §7 — CONSIGNATION, PUIS VÉRIFICATION
-- -------------------------------------------------------------------------------------
-- Les trois instructions qui closent toute migration depuis 005 §10. La consignation a,
-- cette fois, quelque chose à consigner : f_verifier_substrat_session() est un garde-fou
-- neuf, il s'inscrit au registre tout seul (§19.4).
-- =====================================================================================

do $$
declare
    v_poses  integer;
    v_armes  integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    v_armes := f_armer_declencheurs();
    raise notice 'Traçabilité d''insertion : % déclencheur(s) posé(s) ; % (ré)armé(s) en « always ».',
                 v_poses, v_armes;
end;
$$;

do $$
declare
    v_mouvements text;
    v_nombre     integer;
begin
    select string_agg(format('%s (%s)', garde_fou, mouvement), ', ' order by garde_fou),
           count(*)
      into v_mouvements, v_nombre
      from f_consigner_controles_schema();

    raise notice 'Registre des garde-fous : % mouvement(s)%. Total consigné : %.',
                 v_nombre,
                 coalesce(' — ' || v_mouvements, ''),
                 (select count(*) from controles_schema);

    if not exists (select 1 from controles_schema
                    where fonction = 'f_verifier_substrat_session') then
        raise exception 'f_verifier_substrat_session() n''a pas été consignée : elle ne '
                        'remplit pas les conditions de la découverte (§20.1).'
            using hint = 'Propriétaire de la base, ni « security definer » ni volatile, '
                         'chemin de recherche figé finissant par pg_temp.';
    end if;
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
                  hint = 'Voir backend/db/CONVENTIONS.md §18.4 et §19.4.';
    end if;

    raise notice 'Schéma vérifié : % garde-fou(x) consigné(s), % joué(s).',
                 (select count(*) from controles_schema),
                 (select count(*) from f_decouvrir_controles_schema() where conforme);
end;
$$;

-- =====================================================================================
-- §8 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('007', 'Substrat de session refermé sur grc.authentification (condition E1) ; '
               'provisionnement des comptes ouvert à la transaction de connexion ; '
               'garde-fou f_verifier_substrat_session ; socle des huit profils métier')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Rejouer ce bloc rouvrirait le substrat d'autorisation en grand : c'est la dette du
-- §17.4, réinstallée. Il n'est écrit que parce qu'une migration sans porte de sortie est
-- une migration qu'on n'ose pas appliquer.
--
--   begin;
--   do $$ declare t text; begin
--     foreach t in array array['sessions','session_filiales','session_domaines'] loop
--       execute format('drop policy if exists %I on %I', 'pol_'||t||'_ajout', t);
--       execute format('drop policy if exists %I on %I', 'pol_'||t||'_maj', t);
--       execute format('drop policy if exists %I on %I', 'pol_'||t||'_suppression', t);
--       execute format('create policy %I on %I for insert with check (true)', 'pol_'||t||'_ajout', t);
--       execute format('create policy %I on %I for update using (true) with check (true)', 'pol_'||t||'_maj', t);
--       execute format('create policy %I on %I for delete using (true)', 'pol_'||t||'_suppression', t);
--     end loop; end; $$;
--   drop policy if exists pol_utilisateurs_ajout on utilisateurs;
--   drop policy if exists pol_utilisateurs_maj   on utilisateurs;
--   create policy pol_utilisateurs_ajout on utilisateurs for insert with check (f_administration_groupe());
--   create policy pol_utilisateurs_maj   on utilisateurs for update using (f_administration_groupe())
--          with check (f_administration_groupe());
--   select f_retirer_controle_schema('f_verifier_substrat_session', 'annulation de la migration 007');
--   drop function if exists f_verifier_substrat_session();
--   drop function if exists f_authentification();
--   delete from migrations_schema where version = '007';
--   commit;
--
-- Les profils de socle, eux, ne se retirent pas : ils sont référencés par groupes_ad et par
-- profil_domaines, et les supprimer emporterait le paramétrage de droits d'un déploiement.
-- =====================================================================================
