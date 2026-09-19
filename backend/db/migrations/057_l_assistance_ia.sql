-- =====================================================================================
--  057 — L'ASSISTANCE PAR IA : LOCALE PAR DÉFAUT, EXTERNE SOUS SIX BARRIÈRES
-- -------------------------------------------------------------------------------------
--  Lot L27, arbitrage utilisateur **A1** du 08/09/2026.
--
--  ⚠️ **L'IA PROPOSE, UN HUMAIN DÉCIDE.** Aucun des cinq usages n'écrit en base sans
--  validation explicite, et aucun ne porte de décision de conformité. Ce fichier ne pose
--  donc **aucune** écriture automatique : il pose l'ACTIVATION, sa trace, et les garanties
--  qui rendent la sortie externe difficile plutôt que déconseillée.
--
--  ── LE MODE EXTERNE EST ACTIVÉ **PAR FILIALE**, JAMAIS POUR LE GROUPE (27.4) ──────
--
--  Un groupe de vingt filiales dans plusieurs pays n'a pas un régime unique : ce qui est
--  validé en France peut ne pas l'être ailleurs. Une activation Groupe ferait sortir les
--  données de dix-neuf filiales **sur la décision d'une seule**.
--
--  ⚠️ **`ia_activation` porte donc `filiale_id not null`**, et le garde-fou de couverture
--  RLS s'en assure. Une ligne de portée Groupe y serait exactement le défaut qu'on ferme.
--
--  ── CE QUE LA BASE TIENT, ET CE QU'ELLE NE TIENT PAS ─────────────────────────────
--
--  Elle tient : l'activation par filiale, les **quatre champs de « confiance »** du §27.3
--  — exigés **par le schéma**, pas par un écran —, et la trace de chaque appel externe.
--
--  Elle ne tient pas : la fermeture de la sortie réseau. C'est `IPAddressDeny=any` de
--  l'unité systemd qui la tient, et c'est **une barrière physique, pas une promesse**
--  (barrière n° 2). Le dire ici évite qu'on croie la base suffisante.
--
--  ⚠️ **Le mode externe ne s'active PAS depuis l'interface** (barrière n° 1) : la ligne
--  d'activation exige `CYBER_GRC_IA_EXTERNE=oui` dans `/etc/cyber-grc/env`, que seul
--  l'exploitant pose, en root. Le schéma le tient par un déclencheur qui lit un réglage
--  de session que **seule la couche de démarrage** positionne.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================

select set_config('grc.perimetre_groupe', 'oui', true);
select set_config('grc.authentification', 'oui', true);

-- =====================================================================================
-- §1 — UNE ACTION DE JOURNAL DE PLUS : `ia_externe` (barrière n° 5)
-- -------------------------------------------------------------------------------------
-- *Une porte dérobée dont personne ne sait qu'elle a servi n'est pas une porte de
-- secours* — ce que dit déjà `src/auth/secours.ts`, et qui vaut ici mot pour mot.
-- =====================================================================================

do $$
declare v_predicat text;
begin
    select pg_get_constraintdef(oid) into v_predicat
      from pg_constraint
     where conrelid = to_regclass('public.journal_audit')
       and conname = 'ck_journal_audit_action';

    if v_predicat is null then
        raise exception 'ck_journal_audit_action est introuvable.';
    end if;
    if position(quote_literal('ia_externe') in v_predicat) > 0 then
        raise notice 'Le vocabulaire admet deja « ia_externe » : rejeu, rien a faire.';
        return;
    end if;
    if position(quote_literal('attestation') in v_predicat) = 0 then
        raise exception 'La valeur « attestation » est introuvable dans le predicat '
                        'applique : son texte a change, et la substitution a l''aveugle '
                        'est refusee (motif du §4 de la 027).';
    end if;

    execute 'alter table journal_audit drop constraint ck_journal_audit_action';
    execute format(
        'alter table journal_audit add constraint ck_journal_audit_action %s',
        replace(v_predicat,
                quote_literal('attestation'),
                quote_literal('attestation') || ', ' || quote_literal('ia_externe')));
    raise notice 'Le journal admet desormais l''action « ia_externe ».';
end;
$$;

-- =====================================================================================
-- §2 — L'ACTIVATION, PAR FILIALE (27.4) ET SES QUATRE CHAMPS DE CONFIANCE (27.3)
-- =====================================================================================

create table if not exists ia_activation (
    id         id_metier not null default f_generer_id('IAACT'),
    filiale_id id_metier not null,

    -- ⚠️ **« local » est le DÉFAUT, et il n'a besoin d'aucune ligne** : une filiale sans
    -- ligne ici est en mode local. Cette table ne sert qu'à dire *« cette filiale-ci a
    -- décidé d'ouvrir »*, et c'est pour cela que son absence est sûre.
    mode text not null default 'externe',

    -- ── Les QUATRE CHAMPS DU §27.3, exigés PAR LE SCHÉMA ──────────────────────
    --
    -- ⚠️ **Ils ne protègent rien techniquement, et c'est assumé.** Ils existent pour
    -- qu'au jour de l'audit, la question *« pourquoi vos données de gouvernance
    -- sont-elles parties chez ce fournisseur ? »* ait une réponse écrite AVANT d'être
    -- posée, et pas improvisée après. Les rendre obligatoires ici plutôt qu'à l'écran
    -- est ce qui fait qu'on ne peut pas les sauter par une autre route.
    fournisseur          text not null,
    reference_contrat    text not null,
    lieu_hebergement     text not null,
    engagement_non_reentrainement text not null,
    valide_par           text not null,
    valide_le            date not null,

    -- ⚠️ **La destination est déclarée ICI et vérifiée** (barrière n° 3) : un seul hôte,
    -- `https` seul, et aucune redirection suivie. Une redirection suivie ferait sortir
    -- la donnée vers un hôte que personne n'a déclaré.
    destination text not null,

    -- Les usages ouverts, parmi les cinq. ⚠️ **Aucun par défaut** : ouvrir le mode
    -- externe n'ouvre pas tous les usages d'un coup.
    usages text[] not null default '{}'::text[],

    actif boolean not null default true,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_ia_activation primary key (id),
    constraint fk_ia_activation_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,

    constraint ck_ia_activation_mode check (mode = 'externe'),
    constraint ck_ia_activation_destination check (destination like 'https://%'),
    constraint ck_ia_activation_champs check (
        fournisseur <> '' and reference_contrat <> '' and lieu_hebergement <> ''
        and engagement_non_reentrainement <> '' and valide_par <> ''),
    constraint ck_ia_activation_longueurs check (
        length(fournisseur) <= 200 and length(reference_contrat) <= 200
        and length(lieu_hebergement) <= 200
        and length(engagement_non_reentrainement) <= 500
        and length(valide_par) <= 200 and length(destination) <= 500),
    -- ⚠️ Le vocabulaire des usages est CLOS, et c'est la liste du `PLAN_PRODUIT.md` §L27 :
    -- cinq, et pas un de plus. Un usage ajouté sans être déclaré ici échoue bruyamment.
    constraint ck_ia_activation_usages check (
        usages <@ array['correspondances', 'brouillon_politique', 'resume_incident',
                        'reponse_questionnaire', 'recherche']::text[])
);

-- ⚠️ **UNE SEULE ACTIVATION PAR FILIALE.** Deux lignes voudraient dire deux
-- destinations, et rien ne dirait laquelle fait foi.
create unique index if not exists uq_ia_activation_filiale
    on ia_activation (filiale_id);

drop trigger if exists trg_ia_activation_maj on ia_activation;
create trigger trg_ia_activation_maj before update on ia_activation
    for each row execute function f_maj_tracabilite();

comment on table ia_activation is
    'Activation du mode IA EXTERNE, PAR FILIALE (lot L27, actions 27.3 et 27.4). '
    '⚠️ Une filiale SANS ligne est en mode LOCAL — le defaut n''a besoin d''aucune '
    'ligne, et c''est ce qui rend son absence sure. ⚠️ Par filiale et jamais pour le '
    'Groupe : ce qui est valide en France peut ne pas l''etre ailleurs, et une '
    'activation Groupe ferait sortir les donnees de dix-neuf filiales sur la decision '
    'd''une seule. ⚠️ Les quatre champs de « confiance » sont exiges PAR LE SCHEMA : ils '
    'ne protegent rien techniquement, et c''est assume — ils existent pour qu''au jour de '
    'l''audit la question ait une reponse ECRITE AVANT d''etre posee.';

-- =====================================================================================
-- §3 — LA BARRIÈRE N° 1 : ON N'ACTIVE PAS DEPUIS L'INTERFACE
-- -------------------------------------------------------------------------------------
-- ⚠️ La décision d'exporter les données de gouvernance d'un groupe **n'appartient pas à
-- l'utilisateur qui a la fiche sous les yeux**. Le réglage `grc.ia_externe_autorisee`
-- n'est posé que par la couche de démarrage, quand `/etc/cyber-grc/env` porte
-- `CYBER_GRC_IA_EXTERNE=oui` — c'est-à-dire par l'exploitant, en root.
--
-- ⚠️ **En BASE et non dans la route** (`CONVENTIONS.md` §8.1) : une activation naît par
-- la route générique, par l'import du lot L7, par une reprise et par `psql`. Une route
-- ne voit que son chemin ; il y en a toujours un de plus.
-- =====================================================================================

create or replace function f_ia_externe_exige_l_exploitant()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$ia$
begin
    if coalesce(current_setting('grc.ia_externe_autorisee', true), 'non') <> 'oui' then
        raise exception 'Le mode IA externe ne s''active pas depuis l''application : il '
                        'exige CYBER_GRC_IA_EXTERNE=oui dans /etc/cyber-grc/env, pose par '
                        'l''exploitant.'
            using errcode = 'GRC07',
                  hint = 'Barriere n°1 du lot L27 : la decision d''exporter les donnees '
                         'de gouvernance d''un groupe n''appartient pas a l''utilisateur '
                         'qui a la fiche sous les yeux.';
    end if;
    return new;
end;
$ia$;

comment on function f_ia_externe_exige_l_exploitant() is
    'Barriere n°1 du lot L27 : le mode IA externe ne s''active QUE si l''exploitant a '
    'pose CYBER_GRC_IA_EXTERNE=oui dans /etc/cyber-grc/env. ⚠️ Posee EN BASE et non dans '
    'la route : une activation nait par la route generique, par l''import du lot L7, par '
    'une reprise et par psql — une route ne voit que son chemin (CONVENTIONS.md §8.1).';

drop trigger if exists trg_ia_activation_exploitant on ia_activation;
create trigger trg_ia_activation_exploitant before insert or update on ia_activation
    for each row execute function f_ia_externe_exige_l_exploitant();
alter table ia_activation enable always trigger trg_ia_activation_exploitant;

-- =====================================================================================
-- §4 — LE REGISTRE DES APPELS EXTERNES (barrière n° 5)
-- -------------------------------------------------------------------------------------
-- ⚠️ **Le journal d'audit reçoit l'action `ia_externe`** — c'est lui qui fait foi, et il
-- est en ajout seul. Cette table-ci ne le double pas : elle porte ce qu'une entrée de
-- journal ne doit pas porter, c'est-à-dire **le texte exact qui est parti**, pour que la
-- barrière n° 4 (« montré avant de partir ») soit vérifiable après coup.
--
-- ⚠️ **Elle est purgeable**, à la différence du journal : un texte soumis n'est pas une
-- preuve d'audit, c'est une pièce de travail. Le journal, lui, garde qui/quand/combien.
-- =====================================================================================

create table if not exists ia_appels (
    id         id_metier   not null default f_generer_id('IAAPP'),
    filiale_id id_metier   not null,

    usage_ia    text        not null,
    mode        text        not null,
    destination text,
    survenu_le  timestamptz not null default now(),

    -- Ce qui est parti, tel quel. ⚠️ Borné : un envoi n'est pas un dépôt de fichier.
    invite   text not null,
    -- Ce qui est revenu, ou le motif de l'indisponibilité.
    reponse  text,
    verdict  text not null,
    octets   integer not null default 0,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_ia_appels primary key (id),
    constraint fk_ia_appels_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint ck_ia_appels_usage check (
        usage_ia in ('correspondances', 'brouillon_politique', 'resume_incident',
                     'reponse_questionnaire', 'recherche')),
    constraint ck_ia_appels_mode check (mode in ('local', 'externe')),
    -- ⚠️ **TROIS verdicts, et le troisième est celui qui compte** : « indisponible ».
    -- Le critère du lot dit *« jamais une réponse inventée, jamais un silence »* — c'est
    -- le même arbitrage qu'« indetermine » au lot L23, et pour la même raison.
    constraint ck_ia_appels_verdict check (verdict in ('rendu', 'refuse', 'indisponible')),
    constraint ck_ia_appels_octets check (octets >= 0),
    constraint ck_ia_appels_longueurs check (
        length(invite) <= 20000 and (reponse is null or length(reponse) <= 40000)
        and (destination is null or length(destination) <= 500)),
    -- ⚠️ Un appel EXTERNE nomme sa destination ; un appel local n'en a pas. Sans cela,
    -- une trace d'appel externe pourrait ne pas dire où la donnée est partie.
    constraint ck_ia_appels_destination check (
        (mode = 'externe' and destination is not null) or (mode = 'local'))
);

create index if not exists ix_ia_appels_date
    on ia_appels (filiale_id, survenu_le desc);

drop trigger if exists trg_ia_appels_maj on ia_appels;
create trigger trg_ia_appels_maj before update on ia_appels
    for each row execute function f_maj_tracabilite();

comment on table ia_appels is
    'Ce qui a ete SOUMIS a l''assistance, et ce qui en est revenu (lot L27, barriere '
    'n°5). ⚠️ Elle ne double pas le journal d''audit : celui-ci fait foi et garde '
    'qui/quand/combien en AJOUT SEUL, tandis que celle-ci garde le TEXTE EXACT, pour que '
    'la barriere n°4 — « montre avant de partir » — soit verifiable apres coup. ⚠️ Elle '
    'est purgeable : un texte soumis est une piece de travail, pas une preuve d''audit. '
    '⚠️ Le verdict a TROIS valeurs, et la troisieme est celle qui compte : '
    '« indisponible » — jamais une reponse inventee, jamais un silence.';

-- =====================================================================================
-- §5 — `type_entite`
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_modele   constant text := quote_literal('connecteurs');
    v_ajouts   constant text := quote_literal('connecteurs') || ', '
                             || quote_literal('ia_activation') || ', '
                             || quote_literal('ia_appels');
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
    if position(quote_literal('ia_activation') in v_predicat) > 0 then
        raise notice 'type_entite admet deja les entites IA : rejeu, rien a faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « connecteurs » est introuvable dans le predicat '
                        'applique de type_entite_check.';
    end if;

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s',
                   replace(v_predicat, v_modele, v_ajouts));
    raise notice 'type_entite admet desormais « ia_activation » et « ia_appels ».';
end;
$$;

-- =====================================================================================
-- §6 — CLOISONNEMENT
-- =====================================================================================

do $$
declare v_table text;
begin
    foreach v_table in array array['ia_activation', 'ia_appels'] loop
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

alter table ia_activation add column if not exists provenance provenance_ligne not null;
alter table ia_appels     add column if not exists provenance provenance_ligne not null;

do $$
declare v_table text;
begin
    foreach v_table in array array['ia_activation', 'ia_appels'] loop
        execute format('drop trigger if exists trg_%s_provenance on %I', v_table, v_table);
        execute format('create trigger trg_%s_provenance before insert on %I '
                       'for each row execute function f_marquer_provenance()',
                       v_table, v_table);
    end loop;
end;
$$;

select f_armer_declencheurs();

do $$
declare v_poses integer;
begin
    -- ⚠️ **La tracabilite a l'INSERTION se pose, elle ne va pas de soi** : sans ce
    -- declencheur, l'appelant fixe lui-meme « version », « cree_le » et « cree_par »
    -- (CONVENTIONS.md §18.1). Le garde-fou l'a refuse, et il avait raison.
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Declencheurs de creation : % table(s) equipee(s).', v_poses;
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Declencheurs « les pieces suivent leur porteur » : % table(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §6 bis — LE REGISTRE DE L'ARTICLE 30 DU PRODUIT LUI-MÊME
-- -------------------------------------------------------------------------------------
-- ⚠️ **Le garde-fou a posé la bonne question, et deux des réponses comptent vraiment.**
--
-- `ia_appels.invite` et `ia_appels.reponse` portent **du texte libre soumis à une
-- assistance** : un résumé d'incident nomme des gens, un brouillon de politique aussi.
-- Ce sont donc des données personnelles, et elles ont une **fin de vie** — à la
-- différence du journal d'audit, qui fait foi et reste trois ans.
--
-- ⚠️ **C'est exactement ce que le registre existe pour forcer** : « non personnelle » est
-- une réponse recevable, ne pas répondre ne l'est pas. Sans lui, ces deux colonnes
-- seraient entrées dans le produit sans que personne n'ait tranché.
-- =====================================================================================

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
    -- ── L'ACTIVATION ───────────────────────────────────────────────────────────
    ('ia_activation', 'fournisseur', 'non_personnelle', null, null, null, 'conserver',
     'Raison sociale d''une entreprise, pas d''une personne.'),
    ('ia_activation', 'reference_contrat', 'non_personnelle', null, null, null,
     'conserver', 'Reference documentaire.'),
    ('ia_activation', 'lieu_hebergement', 'non_personnelle', null, null, null,
     'conserver', 'Pays ou region d''hebergement du traitement.'),
    ('ia_activation', 'engagement_non_reentrainement', 'non_personnelle', null, null,
     null, 'conserver', 'Reference d''une clause contractuelle.'),
    ('ia_activation', 'destination', 'non_personnelle', null, null, null, 'conserver',
     'URL d''un service, declaree par l''exploitant.'),
    ('ia_activation', 'mode', 'non_personnelle', null, null, null, 'conserver',
     'Vocabulaire clos a une valeur.'),
    ('ia_activation', 'usages', 'non_personnelle', null, null, null, 'conserver',
     'Vocabulaire clos des cinq usages.'),
    -- ⚠️ **Un NOM**, conserve tant que l'activation vit : c'est la reponse a « qui,
    -- chez le client, a valide ? », et l'effacer viderait le §27.3 de son objet.
    ('ia_activation', 'valide_par', 'personnelle',
     'Savoir qui a valide l''ouverture vers un fournisseur externe',
     'Intérêt légitime', 1095, 'anonymiser',
     'Nom de la personne qui a valide. C''est la reponse ECRITE que le §27.3 exige '
     'd''avoir AVANT l''audit. Anonymisee au depart de la personne, comme partout '
     'ailleurs : la decision reste, le nom part.'),
    -- ── LES APPELS ─────────────────────────────────────────────────────────────
    ('ia_appels', 'usage_ia', 'non_personnelle', null, null, null, 'conserver',
     'Vocabulaire clos des cinq usages.'),
    ('ia_appels', 'mode', 'non_personnelle', null, null, null, 'conserver',
     'Vocabulaire clos.'),
    ('ia_appels', 'verdict', 'non_personnelle', null, null, null, 'conserver',
     'Vocabulaire clos a trois valeurs.'),
    ('ia_appels', 'destination', 'non_personnelle', null, null, null, 'conserver',
     'URL d''un service, declaree par l''exploitant.'),
    -- ⚠️ **LES DEUX QUI COMPTENT.** Texte libre soumis a une assistance : un resume
    -- d'incident nomme des gens, un brouillon de politique aussi. SUPPRIMABLES, a la
    -- difference du journal d'audit qui fait foi — un texte soumis est une piece de
    -- travail, pas une preuve.
    ('ia_appels', 'invite', 'personnelle',
     'Garder ce qui a ete SOUMIS, pour que « montre avant de partir » soit verifiable',
     'Intérêt légitime', 365, 'supprimer',
     'Texte libre soumis a l''assistance : il peut nommer des personnes. Purgeable — '
     'c''est une piece de travail, pas une preuve d''audit. Le journal, lui, garde '
     'qui/quand/combien en ajout seul, et il fait foi.'),
    ('ia_appels', 'reponse', 'personnelle',
     'Garder ce qui a ete RENDU, pour pouvoir le relire apres coup',
     'Intérêt légitime', 365, 'supprimer',
     'Texte rendu par l''assistance a partir du precedent : meme regime, meme raison.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §7 — LE GARDE-FOU
-- =====================================================================================

create or replace function f_verifier_assistance_ia()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$fn$
declare
    v_temoins constant jsonb := jsonb_build_array(
        jsonb_build_object('t','ia_activation','n','ck_ia_activation_destination',
            'ligne', jsonb_build_object('destination','http://ia.exemple.net/v1'),
            'e','LA DESTINATION EN CLAIR devient ecrivable : la charge porte des donnees '
                'de gouvernance, et en clair sur le reseau ce serait une fuite que '
                'personne ne verrait, puisque l''envoi « reussit »'),
        jsonb_build_object('t','ia_activation','n','ck_ia_activation_champs',
            'ligne', jsonb_build_object('fournisseur',''),
            'e','LES QUATRE CHAMPS DU §27.3 cessent d''etre exiges : au jour de l''audit, '
                'la question « pourquoi vos donnees sont-elles parties la-bas ? » '
                's''improvise au lieu d''avoir une reponse ecrite'),
        jsonb_build_object('t','ia_activation','n','ck_ia_activation_usages',
            'ligne', jsonb_build_object('usages', jsonb_build_array('tout')),
            'e','le vocabulaire des usages cesse d''etre clos : un sixieme usage entre '
                'sans avoir ete arbitre, et l''IA sort du perimetre des cinq'),
        jsonb_build_object('t','ia_appels','n','ck_ia_appels_verdict',
            'ligne', jsonb_build_object('verdict','ok'),
            'e','LE TROISIEME VERDICT disparait : « indisponible » est le coeur du lot — '
                'le critere dit « jamais une reponse inventee, jamais un silence »'),
        jsonb_build_object('t','ia_appels','n','ck_ia_appels_destination',
            'ligne', jsonb_build_object('mode','externe','destination', null),
            'e','un appel EXTERNE peut ne pas dire OU la donnee est partie')
    );
    v_valide_activation constant jsonb := jsonb_build_object(
        'destination', 'https://ia.exemple.net/v1',
        'fournisseur', 'Fournisseur eprouve',
        'reference_contrat', 'CTR-2026-01',
        'lieu_hebergement', 'Union europeenne',
        'engagement_non_reentrainement', 'Annexe 3 du contrat',
        'valide_par', 'RSSI Groupe',
        'mode', 'externe',
        'usages', jsonb_build_array('correspondances'));
    v_valide_appel constant jsonb := jsonb_build_object(
        'verdict', 'indisponible', 'mode', 'externe',
        'destination', 'https://ia.exemple.net/v1',
        'usage_ia', 'correspondances', 'octets', 0, 'invite', 'Texte soumis');
    v_piece   jsonb;
    v_accepte boolean;
    v_valide  jsonb;
    v_tgtype  smallint;
begin
    if to_regclass('public.ia_activation') is null or to_regclass('public.ia_appels') is null
    then
        objet    := 'assistance_ia';
        anomalie := 'tables_ia_absentes';
        detail   := 'Une des deux tables du lot L27 a disparu.';
        return next;
        return;
    end if;

    -- ── 1. LES CONTRAINTES SONT EPROUVEES, dans les DEUX sens (§39.1) ───────────
    for v_piece in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n',
                                          v_piece -> 'ligne');
        if v_accepte is null then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_ia_non_mesurable';
            detail   := format('Le predicat de « %s » n''a pas pu etre evalue.',
                               v_piece ->> 'n');
            return next;
        elsif v_accepte then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_ia_videe';
            detail   := format('La contrainte « %s » ACCEPTE la ligne temoin %s, qu''elle '
                               'doit refuser. Ce que cela produit : %s.',
                               v_piece ->> 'n', v_piece -> 'ligne', v_piece ->> 'e');
            return next;
        end if;
        v_valide := case when (v_piece ->> 't') = 'ia_appels'
                         then v_valide_appel else v_valide_activation end;
        v_accepte := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n', v_valide);
        if v_accepte is distinct from true then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_ia_refuse_le_normal';
            detail   := format('La contrainte « %s » refuse une ligne ordinaire : une '
                               'barriere qui refuse tout satisfait le controle precedent '
                               'et rend le produit inutilisable.', v_piece ->> 'n');
            return next;
        end if;
    end loop;

    -- ── 2. LA BARRIERE N°1 EST ARMEE, sur l'insertion ET la mise a jour ─────────
    select t.tgtype into v_tgtype
      from pg_trigger t
     where t.tgrelid = to_regclass('public.ia_activation')
       and t.tgname = 'trg_ia_activation_exploitant'
       and not t.tgisinternal and t.tgenabled = 'A';
    if v_tgtype is null then
        objet    := 'ia_activation.trg_ia_activation_exploitant';
        anomalie := 'barriere_exploitant_absente';
        detail   := 'La barriere n°1 a disparu, ou n''est plus armee « always » : le mode '
                    'IA EXTERNE redevient activable depuis l''application. La decision '
                    'd''exporter les donnees de gouvernance d''un groupe n''appartient pas '
                    'a l''utilisateur qui a la fiche sous les yeux.';
        return next;
    elsif (v_tgtype & 4) = 0 or (v_tgtype & 16) = 0 then
        objet    := 'ia_activation.trg_ia_activation_exploitant';
        anomalie := 'barriere_exploitant_deplacee';
        detail   := format('La barriere n°1 existe mais son EVENEMENT a change '
                           '(tgtype = %s) : elle ne couvre plus l''insertion ET la mise a '
                           'jour. Une activation entrerait par le chemin qu''elle a cesse '
                           'de garder — c''est le constat Q-281.', v_tgtype);
        return next;
    end if;

    -- ── 3. UNE SEULE ACTIVATION PAR FILIALE ────────────────────────────────────
    if not exists (
        select 1 from pg_index i
          join pg_class c on c.oid = i.indexrelid
         where i.indrelid = to_regclass('public.ia_activation')
           and i.indisunique and c.relname = 'uq_ia_activation_filiale')
    then
        objet    := 'ia_activation.uq_ia_activation_filiale';
        anomalie := 'activation_ia_multiple';
        detail   := 'L''unicite par filiale a disparu : deux activations voudraient dire '
                    'deux destinations, et rien ne dirait laquelle fait foi.';
        return next;
    end if;

    -- ── 4. L'ACTION DE JOURNAL EXISTE ──────────────────────────────────────────
    v_accepte := f_contrainte_accepte('journal_audit', 'ck_journal_audit_action',
                                      jsonb_build_object('action', 'ia_externe'));
    if v_accepte is distinct from true then
        objet    := 'journal_audit.ia_externe';
        anomalie := 'action_ia_non_journalisable';
        detail   := 'Le journal refuse l''action « ia_externe » : un appel externe ne '
                    'pourrait plus etre trace. Une porte derobee dont personne ne sait '
                    'qu''elle a servi n''est pas une porte de secours.';
        return next;
    end if;

    return;
end;
$fn$;

comment on function f_verifier_assistance_ia() is
    'Garde-fou de l''assistance par IA (lot L27). Il EPROUVE cinq contraintes dans les '
    'deux sens (§39.1) — destination en https, quatre champs de confiance exiges, '
    'vocabulaire clos des usages, TROISIEME verdict « indisponible », et destination '
    'nommee pour un appel externe —, mesure que la BARRIERE N°1 couvre l''insertion ET la '
    'mise a jour sur son tgtype (constat Q-281), et verifie qu''un appel externe reste '
    'journalisable. Decouvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §8 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('057', 'L''assistance par IA : LOCALE par defaut — une filiale sans ligne est en '
               'local, et c''est ce qui rend son absence sure —, EXTERNE sous six '
               'barrieres, dont la premiere est qu''on ne l''active pas depuis '
               'l''interface et la cinquieme que chaque appel est journalise. Le verdict '
               'a trois valeurs, et la troisieme est « indisponible » : jamais une '
               'reponse inventee, jamais un silence')
on conflict (version) do nothing;

commit;
