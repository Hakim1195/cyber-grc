-- =====================================================================================
-- 009_perimetre_actif.sql — Le vocabulaire du journal apprend le changement de filiale
-- =====================================================================================
-- Lot **L4** (multi-filiales). Ce fichier applique le `backend/db/CONVENTIONS.md` §30.4,
-- qui fait foi, et rien d'autre : il n'ajoute aucune table, aucune colonne et aucune
-- politique. La filiale active a déjà sa place — `sessions.filiale_active_id`, posée par
-- `001_socle.sql` §8 — et c'est le point : **le sélecteur de filiale du lot L4 ne crée pas
-- un lieu de stockage, il apprend à écrire dans celui qui existe.**
--
-- Références : `CONVENTIONS.md` §12 (journal en ajout seul, chaîné), §19.4 (un garde-fou
-- se branche sur le point d'appel unique), §23 (une migration appliquée ne se réécrit
-- pas), §29.2 (le vocabulaire des actions), **§30** (le contrat du changement de filiale
-- active) ; `001_socle.sql` §9 (ck_journal_audit_action) ; `004_rls.sql` §6
-- (f_filiale_ecriture, pol_journal_audit_ajout) ; `PLAN_SERVEUR` §1.7.
--
-- Dépendances : 001 à 008. Contenu :
--   §0  Gardes
--   §1  ck_journal_audit_action gagne « changement_perimetre »
--   §2  Le garde-fou : f_verifier_vocabulaire_journal()
--   §3  Consignation, puis vérification
--   §4  Enregistrement de la migration
--
-- -------------------------------------------------------------------------------------
-- POURQUOI UNE VINGT-ET-UNIÈME ACTION, ET PAS UN RÉEMPLOI
--
-- Aucune des vingt actions de `001_socle.sql` §9 ne décrit un changement de périmètre.
-- Les deux candidats au réemploi ont été écartés, et il faut dire pourquoi :
--
--   · `administration` — le changement de filiale active n'est **pas** un acte
--     d'administration. Il est ouvert à toute session dont le périmètre porte plusieurs
--     filiales, y compris un profil en lecture seule : la Direction, qui lit le Groupe
--     entier, en est le premier usager. Le ranger là rendrait illisible la question
--     qu'un auditeur ISO pose au journal — *qui a exercé un pouvoir d'administration* ;
--   · `modification` — c'est le vocabulaire des écritures métier (§29.2), et
--     `valeurs_avant` / `valeurs_apres` y portent le différentiel d'un enregistrement de
--     gouvernance. Une session n'est pas un enregistrement de gouvernance.
--
-- La voie du §23 est donc suivie : **on ne réécrit pas `001`, on l'altère depuis une
-- migration neuve**. La contrainte est REMPLACÉE en une seule instruction `alter table`,
-- sans fenêtre pendant laquelle le journal serait sans vocabulaire.
--
-- -------------------------------------------------------------------------------------
-- LES DEUX LISTES SE FONT FACE, ET C'EST CE QUI LES TIENT
--
-- `ActionJournal` (`src/auth/journal.ts`) déclare les mêmes valeurs, en TypeScript. Ce
-- n'est pas une duplication qu'on tolère : c'est le dispositif. Une action présente d'un
-- seul côté **fait échouer l'insertion bruyamment** en `23514` — le cas (b) du
-- `CLAUDE.md` §3, où la liste est le bon outil parce que l'omission crie. Ce serait le
-- mauvais outil si elle faisait réussir quelque chose en silence ; ce n'est pas le cas.
--
-- ⚠️ Ce fichier n'écrit AUCUNE entrée d'essai dans `journal_audit` pour « prouver » que
-- la contrainte accepte la nouvelle valeur. Le journal est scellé et retenu trois ans :
-- y déposer un déchet de migration coûterait plus que la preuve ne vaut. La preuve est
-- faite là où elle a un sens — `test/filiales/`, où un vrai changement de filiale écrit
-- une vraie entrée, relue sous périmètre.
--
-- -------------------------------------------------------------------------------------
-- CE QUE CE FICHIER NE FAIT PAS, ET QU'IL FAUT DIRE (§17.5)
--
--   · **Il n'ouvre aucun droit.** La filiale active doit appartenir au périmètre lisible,
--     et c'est `f_filiale_ecriture()` qui le vérifie depuis la porte S1 (§17.9) — la
--     dernière barrière, même si la route du lot L4 se trompe. Ce fichier ne la touche
--     pas, et le sélecteur s'appuie dessus au lieu de la contourner.
--   · **Il ne rend pas `sessions` écrivable.** L'écriture du substrat de session exige
--     toujours `grc.authentification` (migration `007`, condition E1) : le sélecteur
--     passe par `avecTransactionAuthentification`, comme la connexion.
--   · **Il ne dit rien de la couverture du journal.** Qu'une action soit déclarée ne
--     prouve pas qu'elle soit émise — c'est la leçon des « 4 actions sur 20 » mesurées à
--     la porte S3. La couverture se mesure en base (`test/journal/couverture.test.mjs`).
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

-- La contrainte que l'on va remplacer doit EXISTER, et sous ce nom-là. Sans ce garde, un
-- « drop constraint if exists » suivi d'un « add » réussirait sur une base où 001 a été
-- modifiée entre-temps, et le remplacement deviendrait une création silencieuse.
do $$
begin
    if not exists (
        select 1
          from pg_constraint k
          join pg_class c on c.oid = k.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'journal_audit'
           and k.conname = 'ck_journal_audit_action'
           and k.contype = 'c')
    then
        raise exception
            'ck_journal_audit_action est introuvable sur journal_audit : cette migration '
            'REMPLACE une contrainte, elle n''en crée pas une.'
            using hint = 'Voir 001_socle.sql §9 et backend/db/CONVENTIONS.md §23.';
    end if;

    -- La colonne « filiale_active_id » de sessions est le LIEU où le sélecteur du lot L4
    -- range son choix (§30.2). Elle vient de 001 ; si elle a disparu, le lot L4 n'a plus
    -- d'endroit où écrire et il vaut mieux l'apprendre ici qu'au premier clic.
    if not exists (
        select 1 from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'sessions'
           and a.attname = 'filiale_active_id' and a.attnum > 0 and not a.attisdropped)
    then
        raise exception
            'sessions.filiale_active_id est introuvable : la filiale active du lot L4 n''a '
            'plus de place côté serveur, et un sélecteur qui la rangerait ailleurs — cookie, '
            'en-tête, URL — romprait le contrat du CONVENTIONS.md §30.2.'
            using hint = 'Voir 001_socle.sql §8.';
    end if;
end;
$$;

-- =====================================================================================
-- §1 — ck_journal_audit_action GAGNE « changement_perimetre »
-- -------------------------------------------------------------------------------------
-- Une SEULE instruction « alter table » : PostgreSQL retire et repose la contrainte dans
-- la même opération, et VALIDE la nouvelle contre les lignes existantes. Il n'existe donc
-- aucun instant, pas même à l'intérieur de cette transaction, où le journal accepterait
-- une action hors vocabulaire.
--
-- Les vingt valeurs de 001 sont recopiées **à l'identique et dans le même ordre**, pour
-- que le différentiel de ce fichier se lise en une ligne : la vingt-et-unième.
-- =====================================================================================

alter table journal_audit
    drop constraint ck_journal_audit_action,
    add  constraint ck_journal_audit_action check (action in (
        'connexion_reussie', 'connexion_echouee', 'deconnexion',
        'session_expiree', 'session_revoquee', 'refus_autorisation',
        'creation', 'modification', 'suppression', 'consultation_sensible',
        'export', 'import', 'administration', 'approbation',
        'analyse_antivirus', 'purge', 'archivage',
        'demarrage', 'arret', 'verification_journal',
        -- ── Lot L4, CONVENTIONS.md §30.4 ────────────────────────────────────────────
        -- Le changement de FILIALE ACTIVE d'une session. L'entrée porte la filiale
        -- quittée dans « valeurs_avant » et la filiale rejointe dans « valeurs_apres » ;
        -- « resume » reste une phrase fixe (§29.5). Elle s'attribue à la filiale QUITTÉE,
        -- parce que c'est celle qui est active dans la transaction où l'acte a lieu et
        -- que pol_journal_audit_ajout n'en admet pas d'autre.
        'changement_perimetre'));

comment on constraint ck_journal_audit_action on journal_audit is
    'Vocabulaire fermé des actions du journal d''audit (CONVENTIONS.md §29.2). Vingt valeurs '
    'depuis 001_socle.sql ; « changement_perimetre » ajoutée par 009_perimetre_actif.sql pour '
    'le sélecteur de filiale du lot L4 (§30.4). Elle fait FACE au type ActionJournal de '
    'src/auth/journal.ts : une action présente d''un seul côté fait échouer l''insertion en '
    '23514, ce qui est le comportement voulu — dans les deux sens, l''omission crie.';

-- =====================================================================================
-- §2 — LE GARDE-FOU : f_verifier_vocabulaire_journal()
-- -------------------------------------------------------------------------------------
-- ⚠️ PORTÉE EXACTE, écrite avant le code (§17.5 : un garde-fou ne se voit pas prêter plus
-- de portée qu'il n'en a).
--
-- Ce qu'il tient : la contrainte existe, elle est VALIDÉE (et non « not valid »), et son
-- texte déclare « changement_perimetre ».
--
-- Ce qu'il NE tient pas : il ne lit pas TypeScript, et ne peut donc rien dire de l'accord
-- entre les deux listes. Cet accord-là est tenu par le 23514 de l'insertion, et mesuré
-- par test/filiales/ et test/journal/couverture.test.mjs.
--
-- ── Pourquoi il vaut la peine d'exister, alors que le 23514 crie déjà ────────────────
--
-- Parce que le 23514 crie **en production, au clic d'un utilisateur**. Une migration
-- future qui reposerait la contrainte sans cette valeur — en recopiant 001 de bonne foi,
-- ce qui est exactement le geste que ce fichier vient de faire — passerait toutes ses
-- vérifications : aucune ligne existante ne la porte forcément, donc la validation
-- réussit, et le défaut n'apparaît qu'au premier changement de filiale. Ce garde-fou
-- déplace cet échec vers migrate.mjs et install.sh, c'est-à-dire vers quelqu'un dont
-- c'est le métier de le lire.
--
-- Il est branché sur f_verifier_schema() par la DÉCOUVERTE (§19.4, §20.1) : nom en
-- « f_verifier_ », aucun argument, retour (objet, anomalie, detail), propriétaire de la
-- base, ni « security definer » ni volatile, chemin de recherche figé finissant par
-- pg_temp. Aucune liste n'est modifiée nulle part.
-- =====================================================================================

create or replace function f_verifier_vocabulaire_journal()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    r record;
    v_trouvee boolean := false;
begin
    for r in
        select k.conname::text                as nom,
               k.convalidated                 as validee,
               pg_get_constraintdef(k.oid)    as definition
          from pg_constraint k
          join pg_class c on c.oid = k.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'journal_audit'
           and k.conname = 'ck_journal_audit_action'
           and k.contype = 'c'
    loop
        v_trouvee := true;

        if not r.validee then
            objet    := r.nom;
            anomalie := 'vocabulaire_non_valide';
            detail   := 'ck_journal_audit_action est déclarée « not valid » : elle ne '
                        'contrôle plus les lignes déjà présentes, et une action hors '
                        'vocabulaire a donc pu entrer dans un journal scellé sans que rien '
                        'ne le dise.';
            return next;
        end if;

        if position('changement_perimetre' in r.definition) = 0 then
            objet    := r.nom;
            anomalie := 'changement_perimetre_absent';
            detail   := format(
                'le vocabulaire du journal ne déclare plus « changement_perimetre » : « %s ». '
                'C''est l''action que le sélecteur de filiale du lot L4 émet à chaque '
                'basculement (CONVENTIONS.md §30.4, migration 009). Sans elle, le changement '
                'de filiale échoue en 23514 AU CLIC DE L''UTILISATEUR, et le journal cesse de '
                'porter la trace du seul geste par lequel une session change de périmètre '
                'd''écriture.', r.definition);
            return next;
        end if;
    end loop;

    -- Cas séparé, et non cumulé avec les précédents : la contrainte ABSENTE ne dit pas la
    -- même chose qu'une contrainte incomplète. Sans elle, « action » redevient du texte
    -- libre, et le journal accepte n'importe quel mot — y compris une faute de frappe qui
    -- ferait disparaître un événement de toutes les recherches par action.
    if not v_trouvee then
        objet    := 'ck_journal_audit_action';
        anomalie := 'vocabulaire_absent';
        detail   := 'aucune contrainte ck_journal_audit_action sur journal_audit : la colonne '
                    '« action » n''a plus de vocabulaire fermé (001_socle.sql §9, '
                    'CONVENTIONS.md §29.2).';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_vocabulaire_journal() is
    'Garde-fou de schéma (CONVENTIONS.md §19.4) : le vocabulaire des actions du journal '
    'd''audit reste fermé, validé, et déclare « changement_perimetre » — l''action du '
    'sélecteur de filiale du lot L4 (§30.4). PORTÉE EXACTE (§17.5) : il lit une définition '
    'de contrainte dans le catalogue. Il ne lit pas TypeScript et ne dit donc RIEN de '
    'l''accord avec le type ActionJournal de src/auth/journal.ts — cet accord-là est tenu '
    'par le 23514 de l''insertion, et mesuré par test/filiales/ et '
    'test/journal/couverture.test.mjs. Un schéma sain ne renvoie AUCUNE ligne.';

-- =====================================================================================
-- §3 — CONSIGNATION, PUIS VÉRIFICATION
-- -------------------------------------------------------------------------------------
-- Les trois instructions qui closent toute migration depuis 005 §10.
-- =====================================================================================

do $$
declare
    v_poses integer;
    v_armes integer;
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
                    where fonction = 'f_verifier_vocabulaire_journal') then
        raise exception 'f_verifier_vocabulaire_journal() n''a pas été consignée : elle ne '
                        'remplit pas les conditions de la découverte (§20.1).'
            using hint = 'Propriétaire de la base, ni « security definer » ni volatile, '
                         'chemin de recherche figé finissant par pg_temp.';
    end if;
end;
$$;

-- Le remplacement d'une contrainte ne touche aucune ligne, mais l'AFFIRMER ne coûte rien
-- et le CONSTATER coûte une requête : c'est exactement la différence entre une réserve
-- écrite et une réserve traitée.
do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('  - n° %s : %s (%s)', numero_entree, anomalie, detail),
                      E'\n' order by numero_entree),
           count(*)
      into v_anomalies, v_nombre
      from f_journal_audit_verifier();

    if v_nombre > 0 then
        raise exception E'Chaîne du journal d''audit en défaut après 009 — % anomalie(s) :\n%',
                        v_nombre, v_anomalies
            using hint = 'Voir backend/db/CONVENTIONS.md §12.';
    end if;

    raise notice 'Chaîne du journal vérifiée : % entrée(s), aucune anomalie ; % action(s) déclarée(s).',
                 (select count(*) from journal_audit),
                 (select count(*)
                    from pg_constraint k
                    join pg_class c on c.oid = k.conrelid
                   cross join lateral regexp_matches(pg_get_constraintdef(k.oid),
                                                     '''[a-z_]+''', 'g') as m
                   where c.relname = 'journal_audit'
                     and k.conname = 'ck_journal_audit_action');
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
-- §4 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('009', 'Vocabulaire du journal : action « changement_perimetre » pour le sélecteur '
               'de filiale du lot L4 (§30.4) ; garde-fou f_verifier_vocabulaire_journal')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- ⚠️ Ce retour arrière ÉCHOUE, et c'est voulu, dès qu'une seule entrée « changement_perimetre »
-- est au journal : la validation de la contrainte rétrécie la refusera. Le journal étant en
-- ajout seul, il n'y a pas de « nettoyage » possible — il faudrait alors retirer d'abord la
-- route du sélecteur, puis attendre la purge de rétention. C'est la contrepartie normale d'un
-- registre scellé, et non un défaut de cette migration.
--
--   begin;
--   alter table journal_audit
--       drop constraint ck_journal_audit_action,
--       add  constraint ck_journal_audit_action check (action in (
--           'connexion_reussie', 'connexion_echouee', 'deconnexion',
--           'session_expiree', 'session_revoquee', 'refus_autorisation',
--           'creation', 'modification', 'suppression', 'consultation_sensible',
--           'export', 'import', 'administration', 'approbation',
--           'analyse_antivirus', 'purge', 'archivage',
--           'demarrage', 'arret', 'verification_journal'));
--   select f_retirer_controle_schema('f_verifier_vocabulaire_journal', 'annulation de 009');
--   drop function if exists f_verifier_vocabulaire_journal();
--   delete from migrations_schema where version = '009';
--   commit;
-- =====================================================================================
