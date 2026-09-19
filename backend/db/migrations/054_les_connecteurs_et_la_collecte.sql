-- =====================================================================================
--  054 — LES CONNECTEURS ET LA COLLECTE AUTOMATIQUE DE PREUVE
--
--  §0   Le périmètre de la migration
--  §1   Un quatrième événement : la création d'une action (action 22.6)
--  §2   Les connecteurs — le CADRE, et trois genres locaux (22.4, 22.5)
--  §3   Les collectes — une preuve CONSTATÉE, datée, et qui PÉRIME (23.1)
--  §3 bis  Ce que toute table métier doit à trois garde-fous déjà posés
--  §4   La fraîcheur se DÉRIVE — une preuve périmée redevient absente
--  §5   Le passage au rouge CRÉE une action (23.2)
--  §6   `type_entite`
--  §7   Cloisonnement
--  §8   Le garde-fou
--  §9   Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — lots L22 (22.4 à 22.6) et L23
--
--  Le `docs/PLAN_PRODUIT.md` appelle L23 *« la fracture n° 1 du marché »*, et le dit en
--  une phrase : c'est le lot qui transforme le produit **d'un registre de ce que l'on
--  déclare en un système qui constate**.
--
--  ── ⚠️ LE POINT LE PLUS IMPORTANT DU LOT EST UN REFUS ───────────────────────────
--
--  Critère 23.4, et le plan le nomme lui-même *« le point le plus important »* :
--
--    *« Une source injoignable rend « indéterminé », JAMAIS « conforme ». Un test qui
--      échoue à s'exécuter et qui rend « conforme » est une fausse assurance dans un
--      outil produit en audit. »*
--
--  C'est écrit dans le schéma : `collectes.verdict` a **trois** valeurs, et le défaut
--  d'une collecte qui n'aboutit pas est `indetermine`. Il n'y a aucun chemin par lequel
--  une absence de mesure devienne une conformité.
--
--  ── ⚠️ ET LE SECOND : UNE PREUVE PÉRIMÉE EST PIRE QU'UNE PREUVE ABSENTE ────────
--
--  Critère 23.1. Une sauvegarde constatée réussie il y a onze mois n'est pas une preuve
--  de sauvegarde : c'est une preuve qu'on sauvegardait il y a onze mois. La fraîcheur
--  est donc **portée par la collecte** et **dérivée à la lecture** — jamais rangée dans
--  une colonne « valide » qui vieillirait sans que rien n'écrive.
--
--  ── LE CADRE DE CONNECTEURS (22.4) ─────────────────────────────────────────────
--
--  *« La liste des connecteurs actifs se DÉCOUVRE, elle ne s'écrit pas : un connecteur
--  ajouté sans être déclaré doit échouer BRUYAMMENT, jamais être ignoré en silence. »*
--
--  Le vocabulaire des genres est clos **en base**, et le registre des exécuteurs vit
--  dans `src/connecteurs/`. Les deux sont confrontés par un essai : un genre qu'aucun
--  exécuteur ne sert, ou un exécuteur qu'aucun genre n'admet, fait rougir le banc. Ce
--  n'est pas une liste à tenir d'accord — c'est une divergence qui échoue.
--
--  ── ⚠️ TROIS CONNECTEURS, ET LES TROIS SONT LOCAUX ─────────────────────────────
--
--  L'annuaire, le serveur de sauvegarde, l'antivirus. Aucun ne sort de la machine :
--  `cyber-grc.service` garde `IPAddressDeny=any` intact, et la collecte s'exécute dans
--  le service web sans jamais appeler l'extérieur. Trois suffisent à démontrer le cadre ;
--  le catalogue s'étend ensuite sans nouvelle architecture.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-054', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — UN QUATRIÈME ÉVÉNEMENT : LA CRÉATION D'UNE ACTION (action 22.6)
-- -------------------------------------------------------------------------------------
-- ⚠️ **L'action 22.6 — « renvoi d'action vers Jira / ServiceNow » — est couverte par la
-- COMBINAISON de 22.1 et 22.3, et non par un connecteur propre.** Le dire ainsi est plus
-- honnête que d'écrire un intégrateur Jira :
--
--   · **l'aller** : un abonnement à `action_creee` poste l'événement vers l'outil de
--     l'équipe, qui crée son ticket ;
--   · **le retour** : l'outil rappelle le produit avec un **jeton d'API** borné au
--     domaine « actions », et met l'état à jour par la route générique.
--
-- Ce que cela évite est précisément ce que le critère demande : *« sans dépendance
-- nouvelle si inactif »*. Il n'y a ni client Jira, ni client ServiceNow, ni schéma
-- d'authentification propre à l'un d'eux — donc rien à maintenir le jour où leur API
-- change, et rien à désactiver puisqu'il n'y a rien.
-- =====================================================================================

do $$
declare
    v_predicat text;
begin
    select pg_get_constraintdef(oid) into v_predicat
      from pg_constraint
     where conrelid = to_regclass('public.abonnements_evenements')
       and conname = 'ck_abonnements_evenements_evenement';

    if v_predicat is null then
        raise exception 'ck_abonnements_evenements_evenement est introuvable : la 053 '
                        'n''a pas ete appliquee.';
    end if;
    if position(quote_literal('action_creee') in v_predicat) > 0 then
        raise notice 'Le vocabulaire admet deja « action_creee » : rejeu, rien a faire.';
        return;
    end if;

    alter table abonnements_evenements
        drop constraint ck_abonnements_evenements_evenement;
    alter table abonnements_evenements
        add constraint ck_abonnements_evenements_evenement check (
            evenement in ('incident_cree', 'echeance_franchie', 'approbation_refusee',
                          'action_creee'));
    raise notice 'Le vocabulaire des evenements admet desormais « action_creee ».';
end;
$$;

drop trigger if exists trg_actions_evenement on actions;
create trigger trg_actions_evenement after insert on actions
    for each row execute function f_enfiler_evenement('action_creee');
alter table actions enable always trigger trg_actions_evenement;

-- =====================================================================================
-- §2 — LES CONNECTEURS (actions 22.4 et 22.5)
-- -------------------------------------------------------------------------------------
-- ⚠️ **Le vocabulaire des genres est CLOS**, et c'est la moitié « base » du cadre. La
-- moitié « serveur » est le registre des exécuteurs de `src/connecteurs/`, et un essai
-- confronte les deux : un genre qu'aucun exécuteur ne sert, ou un exécuteur qu'aucun
-- genre n'admet, fait rougir le banc. *Un connecteur ajouté sans être déclaré échoue
-- bruyamment, il n'est pas ignoré en silence.*
-- =====================================================================================

create table if not exists connecteurs (
    id         id_metier   not null default f_generer_id('CONN'),
    filiale_id id_metier   not null,

    genre text not null,
    nom   text not null,
    actif boolean not null default true,

    -- ⚠️ La configuration est un DOCUMENT FIGÉ : chaque genre y lit ce qu'il sait
    -- lire, et le schéma n'a pas à connaître les clés de chacun. C'est le seul
    -- endroit du lot où le jsonb est le bon outil.
    configuration jsonb not null default '{}'::jsonb,

    -- ⚠️ **LA MESURE QUE LA PREUVE ALIMENTE**, et elle est OBLIGATOIRE : c'est le
    -- critère 22.5 — *« chacun rend une preuve datée RATTACHÉE À UNE MESURE »*. Un
    -- connecteur sans mesure produirait un constat que personne ne regarde.
    mesure_id id_metier not null,

    -- Au-delà de ce nombre de jours, la preuve qu'il produit est PÉRIMÉE (23.1).
    fraicheur_jours integer not null default 7,

    derniere_execution_le timestamptz,
    dernier_verdict       text,
    dernier_detail        text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_connecteurs primary key (id),
    constraint fk_connecteurs_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- Clé SIMPLE vers `mesure_catalogue`, qui est de niveau GROUPE : une mesure est
    -- la DÉFINITION d'un contrôle, la même partout (CONVENTIONS.md §16.2). Et
    -- `restrict` : on n'efface pas un contrôle dont un connecteur rapporte la preuve.
    constraint fk_connecteurs_mesure foreign key (mesure_id)
        references mesure_catalogue (id) on delete restrict,

    constraint ck_connecteurs_genre check (
        genre in ('annuaire', 'sauvegarde', 'antivirus')),
    constraint ck_connecteurs_nom check (nom <> ''),
    constraint ck_connecteurs_fraicheur check (fraicheur_jours between 1 and 3650),
    constraint ck_connecteurs_verdict check (
        dernier_verdict is null
        or dernier_verdict in ('conforme', 'non_conforme', 'indetermine')),
    constraint ck_connecteurs_configuration check (jsonb_typeof(configuration) = 'object'),
    constraint ck_connecteurs_longueurs check (
        length(nom) <= 120 and (dernier_detail is null or length(dernier_detail) <= 2000))
);

-- ⚠️ **UN SEUL CONNECTEUR PAR GENRE ET PAR FILIALE.** Deux connecteurs d'annuaire
-- rapporteraient deux verdicts sur la même mesure, et rien ne dirait lequel fait foi.
create unique index if not exists uq_connecteurs_genre
    on connecteurs (filiale_id, genre);

-- ⚠️ **LA CIBLE DE LA CLÉ COMPOSITE DES COLLECTES, et elle se pose ICI.** Une clé
-- étrangère composite exige que son unicité existe DÉJÀ : la créer après la table qui la
-- référence rend 42830 — mesuré.
do $$
begin
    if not exists (select 1 from pg_constraint
                    where conrelid = to_regclass('public.connecteurs')
                      and conname = 'uq_connecteurs_id_filiale')
    then
        alter table connecteurs add constraint uq_connecteurs_id_filiale unique (id, filiale_id);
    end if;
end;
$$;

drop trigger if exists trg_connecteurs_maj on connecteurs;
create trigger trg_connecteurs_maj before update on connecteurs
    for each row execute function f_maj_tracabilite();

comment on table connecteurs is
    'Connecteur de collecte (lot L22, actions 22.4 et 22.5). ⚠️ Le vocabulaire des '
    'genres est CLOS en base, et le registre des executeurs vit dans src/connecteurs/ : '
    'un essai confronte les deux, de sorte qu''un connecteur ajoute sans etre declare '
    'echoue BRUYAMMENT. ⚠️ « mesure_id » est OBLIGATOIRE — un connecteur sans mesure '
    'produirait un constat que personne ne regarde (critere 22.5).';

-- =====================================================================================
-- §3 — LES COLLECTES (action 23.1)
-- -------------------------------------------------------------------------------------
-- Chaque passage d'un connecteur écrit UNE ligne. C'est l'historique du contrôle
-- (action 23.3), et c'est ce qui permet de dire « depuis quand ».
--
-- ⚠️ **`verdict` a TROIS valeurs, et la troisième est le cœur du lot** (critère 23.4) :
-- une source injoignable rend `indetermine`, **jamais** `conforme`. Un test qui échoue à
-- s'exécuter et qui rend « conforme » est une fausse assurance dans un outil produit en
-- audit.
-- =====================================================================================

create table if not exists collectes (
    id         id_metier   not null default f_generer_id('COLL'),
    filiale_id id_metier   not null,

    connecteur_id id_metier not null,
    mesure_id     id_metier not null,

    constate_le timestamptz not null default now(),
    verdict     text        not null,
    -- ⚠️ Recopiée du connecteur AU MOMENT du constat, et non lue par jointure : si
    -- l'exploitant resserre la fraîcheur demain, les constats d'hier gardent celle
    -- sous laquelle ils ont été produits. C'est le motif des échelles de cotation
    -- (action 25.3), transposé à une durée.
    fraicheur_jours integer not null,
    -- Ce que la source a répondu, tel quel. Document figé.
    detail jsonb not null default '{}'::jsonb,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_collectes primary key (id),
    constraint fk_collectes_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- COMPOSITE : une cle simple serait satisfaite par un connecteur INVISIBLE de la
    -- filiale voisine (CONVENTIONS.md §17.1) — et le constat d'une filiale se
    -- retrouverait rattache au connecteur d'une autre.
    constraint fk_collectes_connecteur foreign key (connecteur_id, filiale_id)
        references connecteurs (id, filiale_id) on delete cascade,
    constraint fk_collectes_mesure foreign key (mesure_id)
        references mesure_catalogue (id) on delete restrict,

    constraint ck_collectes_verdict check (
        verdict in ('conforme', 'non_conforme', 'indetermine')),
    constraint ck_collectes_fraicheur check (fraicheur_jours between 1 and 3650),
    constraint ck_collectes_detail check (jsonb_typeof(detail) = 'object')
);

create index if not exists ix_collectes_mesure
    on collectes (filiale_id, mesure_id, constate_le desc);

drop trigger if exists trg_collectes_maj on collectes;
create trigger trg_collectes_maj before update on collectes
    for each row execute function f_maj_tracabilite();

comment on table collectes is
    'Preuve CONSTATEE par un connecteur (lot L23, actions 23.1 et 23.3). ⚠️ « verdict » '
    'a TROIS valeurs, et la troisieme est le coeur du lot : une source injoignable rend '
    '« indetermine », JAMAIS « conforme » — un test qui echoue a s''executer et qui rend '
    '« conforme » est une fausse assurance dans un outil produit en audit (critere 23.4). '
    '⚠️ « fraicheur_jours » est RECOPIEE du connecteur au moment du constat : resserrer '
    'la fraicheur demain ne doit pas reinterpreter les constats d''hier.';

-- =====================================================================================
-- §3 bis — CE QUE TOUTE TABLE MÉTIER DOIT À TROIS GARDE-FOUS DÉJÀ POSÉS
-- =====================================================================================

alter table connecteurs add column if not exists provenance provenance_ligne not null;
alter table collectes   add column if not exists provenance provenance_ligne not null;

do $$
declare v_table text;
begin
    foreach v_table in array array['connecteurs', 'collectes'] loop
        execute format('drop trigger if exists trg_%s_provenance on %I', v_table, v_table);
        execute format('create trigger trg_%s_provenance before insert on %I '
                       'for each row execute function f_marquer_provenance()',
                       v_table, v_table);
    end loop;
end;
$$;

do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Tracabilite a l''insertion : % table(s) equipee(s).', v_poses;
end;
$$;

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('connecteurs', 'genre', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : annuaire | sauvegarde | antivirus.'),
  ('connecteurs', 'nom', 'non_personnelle', null, null, null, 'signaler',
   'Intitule donne au connecteur. Prose libre : regime « signaler ».'),
  ('connecteurs', 'dernier_verdict', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : conforme | non_conforme | indetermine.'),
  ('connecteurs', 'dernier_detail', 'non_personnelle', null, null, null, 'signaler',
   'Ce que la source a repondu au dernier passage, tel quel. ⚠️ Le connecteur '
   'd''annuaire peut y faire figurer un nom de compte : regime « signaler ».'),
  -- ⚠️ « conserver » et non « signaler » sur les deux jsonb : le regime « signaler »
  -- construit une comparaison TEXTUELLE que la base refuse sur un jsonb, et la purge —
  -- transactionnelle — s''en avorterait pour toutes les filiales (constat Q-300).
  ('connecteurs', 'configuration', 'non_personnelle', null, null, null, 'conserver',
   'Configuration du connecteur — un chemin de fichier, un seuil. ⚠️ « conserver » et '
   'non « signaler » parce que la colonne est jsonb : le regime « signaler » y '
   'construirait une comparaison textuelle que la base refuse (constat Q-300).'),
  ('collectes', 'verdict', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : conforme | non_conforme | indetermine.'),
  ('collectes', 'detail', 'non_personnelle', null, null, null, 'conserver',
   'Ce que la source a repondu, fige au moment du constat. ⚠️ Le connecteur '
   'd''annuaire peut y faire figurer des comptes. « conserver » pour le motif du '
   'constat Q-300 : la colonne est jsonb, et « signaler » avorterait la purge. La '
   'purge du porteur emporte la collecte par cascade.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §4 — LA FRAÎCHEUR SE DÉRIVE — UNE PREUVE PÉRIMÉE REDEVIENT ABSENTE (23.1)
-- -------------------------------------------------------------------------------------
-- ⚠️ **DÉRIVÉE, jamais rangée.** Une colonne « valide » vieillirait sans que rien
-- n'écrive : une sauvegarde constatée réussie il y a onze mois resterait marquee
-- « valide » jusqu'a ce qu'un traitement repasse — et le jour ou il ne repasse pas, le
-- produit affirme une conformite qu'il n'a pas constatee.
--
-- C'est le mecanisme des derogations (`035`), de l'AIPD (`039`) et de l'anciennete des
-- catalogues (`051`), reconduit pour la meme raison.
--
-- ⚠️ **Et « perimee » n'est PAS « non conforme ».** Les deux sont distincts, et les
-- confondre serait accuser : une preuve perimee ne dit pas que le controle a echoue,
-- elle dit qu'on ne sait plus. C'est exactement le troisieme verdict, vu du temps.
-- =====================================================================================

create or replace function f_collecte_fraicheur(
    p_constate_le timestamptz, p_fraicheur_jours integer)
returns text
    language sql stable parallel safe
    set search_path = pg_catalog, public, pg_temp as
$fr$
    select case
        when p_constate_le is null then 'jamais_constate'
        when p_constate_le + (p_fraicheur_jours || ' days')::interval <= now() then 'perimee'
        else 'fraiche'
    end;
$fr$;

comment on function f_collecte_fraicheur(timestamptz, integer) is
    'Fraicheur d''une preuve constatee (action 23.1), DERIVEE et jamais rangee : '
    '« fraiche », « perimee » au-dela de la duree portee par le constat, '
    '« jamais_constate » quand il n''y en a aucun. ⚠️ « perimee » n''est PAS '
    '« non conforme » : une preuve perimee ne dit pas que le controle a echoue, elle dit '
    'qu''on ne sait plus. Une colonne « valide » vieillirait sans que rien n''ecrive.';

-- =====================================================================================
-- §5 — LE PASSAGE AU ROUGE CRÉE UNE ACTION (action 23.2)
-- -------------------------------------------------------------------------------------
-- Critere 23.2, mot pour mot : *« le passage de vert a rouge CREE UNE ACTION et notifie,
-- il ne se contente pas de changer une couleur »*.
--
-- ⚠️ **Au PASSAGE, et non a chaque constat non conforme.** Un connecteur qui passe
-- toutes les cinq minutes sur un controle rouge creerait deux cent quatre-vingt-huit
-- actions par jour : le plan d'actions deviendrait illisible, et l'on cesserait de le
-- lire — y compris le jour ou il dit quelque chose. On compare donc au constat
-- PRECEDENT du meme connecteur.
--
-- ⚠️ **Et « indetermine » ne cree RIEN.** Une source injoignable n'est pas un
-- controle en echec : creer une action sur une panne de collecte ferait accuser
-- l'equipe securite d'un probleme de reseau. C'est la meme distinction qu'au §4.
--
-- ⚠️ **En BASE et non dans la route**, pour le motif du `CONVENTIONS.md` §8.1 : une
-- collecte nait par l'execution d'un connecteur, par une reprise de sauvegarde, et par
-- `psql`. Une route ne voit que son chemin ; il y en a toujours un de plus.
-- =====================================================================================

create or replace function f_collecte_ouvre_une_action()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$ac$
declare
    v_precedent text;
    v_mesure    text;
begin
    -- ⚠️ « indetermine » ne cree rien : voir l'en-tete.
    if new.verdict <> 'non_conforme' then
        return new;
    end if;

    select c.verdict into v_precedent
      from collectes c
     where c.connecteur_id = new.connecteur_id
       and c.id <> new.id
     order by c.constate_le desc
     limit 1;

    -- ⚠️ **Le PASSAGE, et non l'etat.** Deja rouge au constat precedent : rien a
    -- ouvrir, l'action existe. Le premier constat d'un connecteur, lui, ouvre —
    -- `v_precedent` est alors nul, et un controle qui nait rouge merite qu'on le dise.
    if v_precedent = 'non_conforme' then
        return new;
    end if;

    select m.nom into v_mesure from mesure_catalogue m where m.id = new.mesure_id;

    -- ⚠️ **L'ACTION EST RATTACHEE A LA MESURE**, et non laissee flottante : c'est la
    -- colonne « mesure_id » que L8 a posee sur « actions », et « ck_actions_rattachement »
    -- n'admet qu'UN rattachement — celui-la est le bon. Sans lui, l'action serait a
    -- ouvrir, a lire, puis a rattacher a la main par quelqu'un qui devine.
    -- ⚠️ **`actions.id` N'A PAS DE VALEUR PAR DEFAUT**, a la difference des tables
    -- posees depuis. C'est la couche d'ecriture qui le fabrique partout ailleurs ;
    -- ici il n'y a pas de couche d'ecriture, et l'insertion echouait en 23502 — ce
    -- qui faisait echouer LE CONSTAT LUI-MEME, puisque le declencheur est dans sa
    -- transaction. *Le garde qui ouvre l'action empechait d'ecrire la preuve.*
    insert into actions (id, filiale_id, titre, commentaire, statut, priorite, echeance,
                         mesure_id)
    values (
        f_generer_id('ACT'),
        new.filiale_id,
        -- ⚠️ §29.5 : le titre porte le NOM DE LA MESURE, qui est une donnee du socle
        -- du Groupe, jamais une valeur saisie par l'utilisateur de cette filiale.
        'Controle automatique en echec : ' || coalesce(v_mesure, new.mesure_id),
        'Un connecteur a constate que ce controle n''est plus tenu. Le detail du '
        'constat est sur la fiche de la mesure.',
        -- ⚠️ « a faire » SANS accent aurait ete refuse par « ck_actions_statut », et le
        -- constat tout entier aurait echoue : le declencheur qui ouvre l'action aurait
        -- empeche d'ecrire la preuve. Mesure lue au catalogue, jamais recopiee de memoire.
        'à faire',
        'Haute',
        (current_date + 14),
        new.mesure_id);
    return new;
end;
$ac$;

comment on function f_collecte_ouvre_une_action() is
    'Ouvre une action au PASSAGE d''un controle automatique au rouge (action 23.2). '
    '⚠️ Au PASSAGE et non a chaque constat : un connecteur qui passe toutes les cinq '
    'minutes sur un controle rouge creerait 288 actions par jour, et le plan d''actions '
    'deviendrait illisible. ⚠️ Et « indetermine » ne cree RIEN : une source injoignable '
    'n''est pas un controle en echec — creer une action sur une panne de reseau ferait '
    'accuser l''equipe securite d''un probleme qui n''est pas le sien.';

drop trigger if exists trg_collectes_action on collectes;
create trigger trg_collectes_action after insert on collectes
    for each row execute function f_collecte_ouvre_une_action();
alter table collectes enable always trigger trg_collectes_action;

-- =====================================================================================
-- §6 — `type_entite`
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := quote_literal('evenements_sortants');
    v_ajouts   constant text := quote_literal('evenements_sortants') || ', '
                             || quote_literal('connecteurs') || ', '
                             || quote_literal('collectes');
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable.';
    end if;
    if position(quote_literal('connecteurs') in v_predicat) > 0 then
        raise notice 'type_entite admet deja les connecteurs : rejeu, rien a faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « evenements_sortants » est introuvable dans le '
                        'predicat applique de type_entite_check : son texte a change, et '
                        'la substitution a l''aveugle est refusee (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);
    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet desormais « connecteurs » et « collectes ».';
end;
$$;

-- =====================================================================================
-- §7 — CLOISONNEMENT
-- =====================================================================================

do $$
declare v_table text;
begin
    foreach v_table in array array['connecteurs', 'collectes'] loop
        execute format('alter table %I enable row level security', v_table);
        execute format('alter table %I force  row level security', v_table);

        execute format('drop policy if exists pol_%s_lecture on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_ajout on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_maj on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_suppression on %I', v_table, v_table);

        execute format(
            'create policy pol_%s_lecture on %I for select using '
            '(filiale_id = any (f_filiales_lecture()))', v_table, v_table);
        execute format(
            'create policy pol_%s_ajout on %I for insert with check '
            '(filiale_id = f_filiale_ecriture())', v_table, v_table);
        execute format(
            'create policy pol_%s_maj on %I for update using '
            '(filiale_id = f_filiale_ecriture()) with check '
            '(filiale_id = f_filiale_ecriture())', v_table, v_table);
        execute format(
            'create policy pol_%s_suppression on %I for delete using '
            '(filiale_id = f_filiale_ecriture())', v_table, v_table);

        execute format('grant select, insert, update, delete on %I to grc_app', v_table);
        execute format('grant select on %I to grc_lecture', v_table);
    end loop;
end;
$$;

select f_armer_declencheurs();

do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Declencheurs « les pieces suivent leur porteur » : % table(s) equipee(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §8 — LE GARDE-FOU
-- =====================================================================================

create or replace function f_verifier_collecte()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$fn$
declare
    -- Les cas temoins de la fraicheur. Le premier et le dernier tiennent le critere.
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('c', null, 'j', 7, 'attendu', 'jamais_constate',
            'effet', 'UNE MESURE JAMAIS CONSTATEE PASSERAIT POUR FRAICHE. C''est la '
                     'fausse assurance exacte que le lot existe pour empecher'),
        jsonb_build_object('c', 'now', 'j', 7, 'attendu', 'fraiche',
            'effet', 'un constat de l''instant serait annonce perime, et l''ecran '
                     'reclamerait une collecte qui vient d''avoir lieu'),
        jsonb_build_object('c', '-3 days', 'j', 7, 'attendu', 'fraiche',
            'effet', 'la duree de fraicheur cesserait d''etre respectee'),
        jsonb_build_object('c', '-8 days', 'j', 7, 'attendu', 'perimee',
            'effet', 'UNE PREUVE DE HUIT JOURS PASSERAIT POUR FRAICHE SOUS UNE '
                     'FRAICHEUR DE SEPT. Une sauvegarde constatee reussie il y a onze '
                     'mois n''est pas une preuve de sauvegarde : c''est une preuve '
                     'qu''on sauvegardait il y a onze mois'),
        jsonb_build_object('c', '-400 days', 'j', 365, 'attendu', 'perimee',
            'effet', 'idem sur une fraicheur annuelle')
    );
    v_temoins constant jsonb := jsonb_build_array(
        jsonb_build_object('t','collectes','n','ck_collectes_verdict',
            'ligne', jsonb_build_object('verdict','peut-etre'),
            'e','LE VOCABULAIRE DU VERDICT CESSE D''ETRE CLOS. C''est le coeur du lot : '
                'trois valeurs, dont « indetermine » — une source injoignable ne doit '
                'JAMAIS pouvoir devenir « conforme »'),
        jsonb_build_object('t','collectes','n','ck_collectes_fraicheur',
            'ligne', jsonb_build_object('fraicheur_jours', 0),
            'e','une fraicheur nulle devient ecrivable, et toute preuve nait perimee'),
        jsonb_build_object('t','connecteurs','n','ck_connecteurs_genre',
            'ligne', jsonb_build_object('genre','maison'),
            'e','UN GENRE QU''AUCUN EXECUTEUR NE SERT devient ecrivable : le connecteur '
                'a l''air en place, et chaque passage echoue — ou pire, ne fait rien'),
        jsonb_build_object('t','connecteurs','n','ck_connecteurs_verdict',
            'ligne', jsonb_build_object('dernier_verdict','ok'),
            'e','le vocabulaire du dernier verdict cesse d''etre clos, et l''ecran ne '
                'sait plus quelle couleur donner a un controle')
    );
    v_ligne_valide constant jsonb := jsonb_build_object(
        'verdict', 'indetermine',
        'fraicheur_jours', 7,
        'genre', 'sauvegarde',
        'dernier_verdict', 'conforme',
        'nom', 'Serveur de sauvegarde');
    v_un      jsonb;
    v_rendu   text;
    v_piece   jsonb;
    v_accepte boolean;
    v_tgtype  smallint;
begin
    if to_regclass('public.connecteurs') is null or to_regclass('public.collectes') is null
    then
        objet    := 'collecte';
        anomalie := 'tables_collecte_absentes';
        detail   := 'Une des deux tables du lot L23 a disparu.';
        return next;
        return;
    end if;

    -- ── 1. LA FRAICHEUR EST EPROUVEE, pas lue (§39.1) ─────────────────────────────
    if to_regprocedure('public.f_collecte_fraicheur(timestamptz, integer)') is null then
        objet    := 'f_collecte_fraicheur';
        anomalie := 'derivation_fraicheur_absente';
        detail   := 'La derivation de la fraicheur a disparu : une preuve perimee '
                    'cesserait d''etre signalee, EN SILENCE.';
        return next;
        return;
    end if;
    for v_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := f_collecte_fraicheur(
            case when (v_un ->> 'c') is null then null
                 when (v_un ->> 'c') = 'now' then now()
                 else now() + (v_un ->> 'c')::interval end,
            (v_un ->> 'j')::integer);
        if v_rendu is distinct from (v_un ->> 'attendu') then
            objet    := 'f_collecte_fraicheur';
            anomalie := 'derivation_fraicheur_fausse';
            detail   := format('Constat « %s », fraicheur « %s » jours : la fonction rend '
                               '« %s » au lieu de « %s ». Ce que cela produit : %s.',
                               coalesce(v_un ->> 'c', '(jamais)'), v_un ->> 'j',
                               coalesce(v_rendu, '(null)'), v_un ->> 'attendu',
                               v_un ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 2. LES CONTRAINTES SONT EPROUVEES, dans les DEUX sens ─────────────────────
    for v_piece in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n',
                                          v_piece -> 'ligne');
        if v_accepte is null then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_collecte_non_mesurable';
            detail   := format('Le predicat de « %s » n''a pas pu etre evalue.',
                               v_piece ->> 'n');
            return next;
        elsif v_accepte then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_collecte_videe';
            detail   := format('La contrainte « %s » ACCEPTE la ligne temoin %s, qu''elle '
                               'doit refuser. Ce que cela produit : %s.',
                               v_piece ->> 'n', v_piece -> 'ligne', v_piece ->> 'e');
            return next;
        end if;
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n', v_ligne_valide);
        if v_accepte is distinct from true then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_collecte_refuse_le_normal';
            detail   := format('La contrainte « %s » refuse une ligne parfaitement '
                               'ordinaire : une barriere qui refuse tout satisfait le '
                               'controle precedent et rend le produit inutilisable.',
                               v_piece ->> 'n');
            return next;
        end if;
    end loop;

    -- ── 3. LE DECLENCHEUR QUI OUVRE UNE ACTION — EVENEMENT ET ARMEMENT ───────────
    select t.tgtype into v_tgtype
      from pg_trigger t
     where t.tgrelid = to_regclass('public.collectes')
       and t.tgname = 'trg_collectes_action' and not t.tgisinternal and t.tgenabled = 'A';
    if v_tgtype is null then
        objet    := 'collectes.trg_collectes_action';
        anomalie := 'declencheur_action_absent';
        detail   := 'Le declencheur qui ouvre une action au passage au rouge a disparu, '
                    'ou n''est plus arme « always ». Le critere 23.2 dit que le passage '
                    'de vert a rouge CREE UNE ACTION et notifie, au lieu de se contenter '
                    'de changer une couleur — sans lui, il ne change plus qu''une '
                    'couleur, et personne ne le voit.';
        return next;
    elsif (v_tgtype & 4) = 0 then
        objet    := 'collectes.trg_collectes_action';
        anomalie := 'declencheur_action_deplace';
        detail   := 'Le declencheur existe mais son EVENEMENT a change : il ne se '
                    'declenche plus a l''insertion d''un constat. C''est le constat '
                    'Q-281 — une barriere qui passe pour vivante et ne declenche rien.';
        return next;
    end if;

    return;
end;
$fn$;

comment on function f_verifier_collecte() is
    'Garde-fou de la collecte automatique (lot L23). La derivation de la fraicheur est '
    'EPROUVEE sur cinq cas temoins (§39.1), dont deux tiennent le critere : une mesure '
    'jamais constatee ne passe pas pour fraiche, et une preuve de huit jours ne passe '
    'pas pour fraiche sous une fraicheur de sept. Les quatre pieces sont eprouvees dans '
    'les DEUX sens, et le declencheur qui ouvre une action au passage au rouge est mesure '
    'sur son EVENEMENT et son ARMEMENT — jamais sur sa seule existence (constat Q-281). '
    'Decouvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §9 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('054', 'Les connecteurs et la collecte automatique de preuve (lots L22.4 a 22.6 '
               'et L23) : le cadre de connecteurs dont le vocabulaire est clos en base et '
               'confronte au registre des executeurs, la preuve CONSTATEE qui porte sa '
               'fraicheur et PERIME, le troisieme verdict « indetermine » qu''une source '
               'injoignable rend au lieu de « conforme », et le passage au rouge qui '
               'OUVRE une action au lieu de changer une couleur')
on conflict (version) do nothing;

commit;
