-- =====================================================================================
--  068 — LA DÉLÉGATION TEMPORAIRE DE DROITS
--
--  §0  Le périmètre de la migration
--  §1  La table, et les invariants posés DANS la base
--  §2  L'ÉTAT est DÉRIVÉ, à un seul endroit
--  §3  La résolution : f_delegations_actives()
--  §4  La revue des accès les VOIT
--  §5  Le registre de l'article 30
--  §6  Les deux balayages qui rangent les tables sans filiale
--  §7  Le garde-fou
--  §8  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  **Demandé par l'utilisateur** : *« on peut faire la même chose pour les users (par
--  exemple pour donner des droits spécifiques temporaires à un user) ou c'est pas
--  possible et ça complique les choses ? »*
--
--  C'est possible, et **bien fait, c'est plus sûr que la pratique actuelle**. Aujourd'hui,
--  un besoin temporaire — un auditeur externe trois semaines, un remplacement de congé,
--  quelqu'un qu'on ajoute à la cellule de crise pour 48 heures — se règle en ajoutant la
--  personne à un groupe Active Directory. Deux conséquences :
--
--   · le geste est **permanent par défaut** : rien ne le défait ;
--   · **personne ne s'en souvient**. C'est ce que toute revue d'accès finit par trouver.
--
--  Le danger n'est donc pas l'octroi : c'est l'OUBLI. Une délégation **datée, qui expire
--  d'elle-même**, est strictement meilleure qu'une appartenance de groupe que personne ne
--  retire. Le produit a déjà ce patron — les dérogations du lot L19 (migration `035`),
--  dont *« l'état se DÉRIVE, aucun traitement ne remet quoi que ce soit »*.
--
-- =====================================================================================
--  LES SIX PROPRIÉTÉS QUI LA RENDENT SÛRE — et chacune est POSÉE, pas surveillée
-- =====================================================================================
--
--  | | Propriété | Où elle est tenue |
--  |---|---|---|
--  | 1 | **Additive seulement** : elle AJOUTE un profil sur un périmètre, elle ne retire jamais | `f_delegations_actives()` ne rend que des octrois ; `resoudreDroits()` les réunit aux groupes |
--  | 2 | **Date de fin obligatoire**, et l'état se DÉRIVE des dates | `ck_delegations_periode`, `f_etat_delegation()` |
--  | 3 | **Motif obligatoire**, et substantiel | `ck_delegations_motif` (dix caractères au moins) |
--  | 4 | **Pas d'auto-délégation** | `ck_delegations_pas_soi_meme` — DANS LA BASE |
--  | 5 | **Elle apparaît dans la revue des accès** (A.5.18), marquée comme telle | §4 |
--  | 6 | **Durée bornée** ; prolonger est une nouvelle décision | `ck_delegations_duree` (90 jours) |
--
--  🛑 **LA QUATRIÈME EST L'INVARIANT DE SÉCURITÉ DE CETTE MIGRATION.** Sans elle, qui
--  détient le domaine « administration » s'accorde à lui-même n'importe quel profil sur
--  n'importe quelle filiale : ce dispositif serait un chemin d'élévation de privilège, et
--  le seul qu'il ouvrirait. Elle est donc une CONTRAINTE de la base et non un contrôle de
--  la route — une route s'oublie, une contrainte non (`CONVENTIONS.md` §39).
--
-- =====================================================================================
--  DEUX ARBITRAGES QUI FERMENT LA SURFACE, ET QUI NE SE RE-DÉBATTENT PAS
-- =====================================================================================
--
--  🛑 **1. UNE DÉLÉGATION N'ACCORDE JAMAIS L'ADMINISTRATION DE L'APPLICATION NI LE DROIT
--  D'EXPORT.** Ces deux-là viennent de groupes TRANSVERSAUX de l'annuaire — `GRC-ADMIN`
--  et `GRC-EXPORT` —, et ils y restent. Une délégation porte un **profil sur un
--  périmètre**, rien d'autre : `f_delegations_actives()` ne rend ni `accorde_admin` ni
--  `accorde_export`, et la résolution ne les lit pas d'ailleurs.
--
--  🛑 **2. LE PROFIL D'ADMINISTRATION NE SE DÉLÈGUE PAS** (`ck_delegations_profil`).
--  Administrer l'application est un acte de portée Groupe, attaché à `GRC-ADMIN` : ouvrir
--  un second chemin vers lui contredirait la phrase que tout le dispositif répète — *les
--  droits viennent de l'annuaire*. Un administrateur en congé se remplace dans l'ANNUAIRE,
--  là où cette décision se prend et se revoit.
--
--  ⚠️ **Conséquence à connaître, et elle est voulue** : une délégation peut donner accès
--  à quelqu'un qui n'a **aucun** groupe `GRC-*` — c'est exactement le cas de l'auditeur
--  externe. Elle est donc keyée sur le **login d'annuaire**, pas sur une ligne de
--  `utilisateurs` : un compte applicatif n'existe qu'à la première connexion, et l'on
--  délègue précisément à quelqu'un qui n'est jamais venu. C'est la leçon de la migration
--  `063`, à un autre endroit.
--
--  ⚠️ **L'effet est différé à la prochaine connexion**, comme tout droit : le périmètre
--  est résolu à l'ouverture de session et figé (`CONVENTIONS.md` §22). Une délégation
--  révoquée ne ferme donc pas une session en cours — l'écran le dit.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Le §4 modifie une table CLOISONNÉE par ses politiques (`revue_habilitation_lignes`) :
-- `alter table … add constraint` en valide les lignes existantes, et `force row level
-- security` vaut jusqu'au propriétaire. Sans périmètre, la validation ne verrait aucune
-- ligne et la migration passerait pour un mauvais motif (`CONVENTIONS.md` §42).
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-068', true);
    perform set_config('grc.filiales',
                       coalesce((select string_agg(id, ',') from filiales), ''), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §1 — LA TABLE, ET LES INVARIANTS POSÉS DANS LA BASE
-- =====================================================================================

create table if not exists delegations_droits (
    id                id_metier   not null,
    -- ⚠️ LE LOGIN D'ANNUAIRE, et non une référence à `utilisateurs` : on délègue à
    --    quelqu'un qui n'a peut-être jamais ouvert de session — un auditeur externe,
    --    précisément. Un compte applicatif naît à la première connexion (migration
    --    `063`, même leçon).
    login             text        not null,
    -- Ce que la délégation accorde : un PROFIL sur un PÉRIMÈTRE. Jamais l'export,
    -- jamais l'administration de l'application — voir l'arbitrage 1 de l'en-tête.
    profil_id         id_metier   not null,
    perimetre         text        not null,
    filiale_cible_id  id_metier,
    -- ── LES DATES, ET L'ÉTAT QUI S'EN DÉRIVE ─────────────────────────────────
    debut             date        not null default current_date,
    fin               date        not null,
    -- ── CE QU'UN AUDITEUR LIT ────────────────────────────────────────────────
    motif             text        not null,
    accorde_par       text        not null default f_utilisateur_courant(),
    -- ── LA RÉVOCATION : une délégation ne se supprime pas, elle se révoque ────
    -- ⚠️ Supprimer effacerait la trace d'un droit qui a EXISTÉ. Ce registre doit
    --    pouvoir répondre « qui a eu quoi, quand, et pourquoi » deux ans plus tard.
    revoquee_le       timestamptz,
    revoquee_par      text,
    motif_revocation  text,
    version           integer     not null default 1,
    cree_le           timestamptz not null default now(),
    cree_par          text        not null default f_utilisateur_courant(),
    modifie_le        timestamptz,
    modifie_par       text,
    constraint pk_delegations_droits      primary key (id),
    constraint fk_delegations_profil      foreign key (profil_id)
        references profils(id) on delete restrict,
    constraint fk_delegations_filiale     foreign key (filiale_cible_id)
        references filiales(id) on delete restrict,
    constraint ck_delegations_login       check (login <> '' and login = lower(login)),
    -- PROPRIÉTÉ 2 — la fin est obligatoire par le type, et elle suit le début.
    constraint ck_delegations_periode     check (fin >= debut),
    -- PROPRIÉTÉ 6 — « temporaire » reste temporaire. Prolonger est une NOUVELLE
    -- délégation, donc une nouvelle décision, un nouveau motif, un nouvel auteur.
    constraint ck_delegations_duree       check (fin - debut <= 90),
    -- PROPRIÉTÉ 3 — un motif, pas une habitude. Dix caractères : « ok », « RAS » et
    -- « temporaire » ne passent pas, et c'est le but — cette ligne est celle qu'un
    -- auditeur lit.
    constraint ck_delegations_motif       check (length(btrim(motif)) >= 10),
    -- 🛑 PROPRIÉTÉ 4 — PAS D'AUTO-DÉLÉGATION. C'est l'invariant de sécurité de cette
    --    migration, et il est ICI plutôt que dans la route : une route s'oublie, une
    --    contrainte non.
    constraint ck_delegations_pas_soi_meme check (lower(btrim(login)) <> lower(btrim(accorde_par))),
    -- Le périmètre décide de la filiale, exactement comme pour un groupe d'annuaire.
    constraint ck_delegations_portee      check (
        (perimetre = 'filiale' and filiale_cible_id is not null)
     or (perimetre = 'groupe'  and filiale_cible_id is null)),
    -- La révocation va d'un bloc : « révoquée par personne » et « révoquée sans motif »
    -- sont deux façons de ne pas être une décision.
    constraint ck_delegations_revocation  check (
        (revoquee_le is null and revoquee_par is null and motif_revocation is null)
     or (revoquee_le is not null and revoquee_par is not null
         and motif_revocation is not null and btrim(motif_revocation) <> ''))
);

-- 🛑 ARBITRAGE 2 — LE PROFIL D'ADMINISTRATION NE SE DÉLÈGUE PAS.
--
-- Posé par un déclencheur et non par un `check` : la contrainte devrait citer le
-- CODE du profil, or la table ne porte que son identifiant — et un `check` ne peut
-- pas interroger une autre table. Le déclencheur, lui, lit `profils` et refuse.
create or replace function f_delegation_refuse_administration()
returns trigger
language plpgsql
-- ⚠️ Le chemin de recherche est FIGÉ, comme pour toute fonction du schéma : sans
-- lui, `pg_temp` est consulté en premier, et une table temporaire nommée `profils`
-- détournerait le contrôle. Le garde-fou du `CONVENTIONS.md` §19.4 a refusé le
-- déploiement tant qu'il manquait.
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_code text;
begin
    select p.code into v_code from profils p where p.id = new.profil_id;
    if v_code = 'ADMIN' then
        raise exception using
            errcode = 'check_violation',
            message = 'Le profil d''administration ne se délègue pas.',
            detail  = 'Administrer l''application est un acte de portée Groupe, attaché au '
                   || 'groupe transversal <PRÉFIXE>ADMIN de l''annuaire. Ouvrir un second '
                   || 'chemin vers lui contredirait la règle que tout le dispositif '
                   || 'répète : les droits viennent de l''annuaire.',
            hint    = 'Un administrateur en congé se remplace DANS L''ANNUAIRE, là où cette '
                   || 'décision se prend et se revoit.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_delegations_droits_profil on delegations_droits;
create trigger trg_delegations_droits_profil
    before insert or update of profil_id on delegations_droits
    for each row execute function f_delegation_refuse_administration();
alter table delegations_droits enable always trigger trg_delegations_droits_profil;

create index if not exists ix_delegations_login on delegations_droits (login, fin desc);
create index if not exists ix_delegations_fin   on delegations_droits (fin)
    where revoquee_le is null;

drop trigger if exists trg_delegations_droits_creation on delegations_droits;
create trigger trg_delegations_droits_creation before insert on delegations_droits
    for each row execute function f_init_tracabilite();
alter table delegations_droits enable always trigger trg_delegations_droits_creation;
drop trigger if exists trg_delegations_droits_maj on delegations_droits;
create trigger trg_delegations_droits_maj before update on delegations_droits
    for each row execute function f_maj_tracabilite();
alter table delegations_droits enable always trigger trg_delegations_droits_maj;

alter table delegations_droits enable row level security;
alter table delegations_droits force  row level security;

drop policy if exists pol_delegations_droits_lecture     on delegations_droits;
drop policy if exists pol_delegations_droits_ajout       on delegations_droits;
drop policy if exists pol_delegations_droits_maj         on delegations_droits;
drop policy if exists pol_delegations_droits_suppression on delegations_droits;

-- ⚠️ Lecture OUVERTE au niveau des politiques, et c'est une CONSÉQUENCE : la table ne
-- porte pas de `filiale_id`, et le §2 de `004_rls` interdit qu'une politique de lecture
-- dépende du drapeau d'administration. La barrière est la ROUTE, déclarée
-- « lire / administration », et le contrôle T-3 la mesure.
--
-- 🛑 Et surtout : cette table PRODUIT l'autorisation. Le `CONVENTIONS.md` §46 dit
-- qu'une table qui la produit ne peut pas en dépendre — sans quoi la résolution
-- d'une session chercherait ses droits sous un périmètre qu'elle n'a pas encore.
create policy pol_delegations_droits_lecture on delegations_droits
    for select using (true);
create policy pol_delegations_droits_ajout on delegations_droits
    for insert with check (f_administration_groupe());
create policy pol_delegations_droits_maj on delegations_droits
    for update using (f_administration_groupe()) with check (f_administration_groupe());
-- ⚠️ AUCUNE politique de suppression : une délégation ne se supprime pas, elle se
--    révoque. Sans politique, le rôle applicatif ne peut rien effacer — c'est une
--    barrière, pas une convention.

comment on table delegations_droits is
    'Délégation TEMPORAIRE de droits : un profil, sur un périmètre, pour une durée bornée, '
    'avec un motif et un auteur. Six propriétés la tiennent, toutes POSÉES ici — additive '
    'seulement, date de fin obligatoire, motif substantiel, PAS D''AUTO-DÉLÉGATION, visible '
    'en revue d''accès, durée bornée à 90 jours. ⚠️ Elle n''accorde JAMAIS l''administration '
    'de l''application ni le droit d''export : ceux-là viennent de groupes transversaux de '
    'l''annuaire et y restent (migration 068).';
comment on column delegations_droits.login is
    'Le login D''ANNUAIRE du bénéficiaire, pas une référence à « utilisateurs » : on délègue '
    'à quelqu''un qui n''a peut-être jamais ouvert de session — un auditeur externe, '
    'précisément. Un compte applicatif naît à la première connexion.';
comment on column delegations_droits.motif is
    'Ce qu''un auditeur lit. Dix caractères au moins, à dessein : « ok » et « RAS » ne sont '
    'pas des motifs, ce sont des habitudes qui apprennent à ne plus lire.';
comment on column delegations_droits.revoquee_le is
    'Une délégation ne se SUPPRIME pas — il n''existe aucune politique de suppression. '
    'Effacer effacerait la trace d''un droit qui a EXISTÉ, et ce registre doit pouvoir '
    'répondre « qui a eu quoi, quand, pourquoi » deux ans plus tard.';

-- =====================================================================================
-- §2 — L'ÉTAT EST DÉRIVÉ, À UN SEUL ENDROIT
--
-- ⚠️ Même arbitrage qu'aux dérogations (migration `035`) : l'état ne se STOCKE pas. Une
-- délégation expirée l'est **par le calendrier**, sans qu'aucun traitement ait à passer.
-- Un état stocké serait faux entre minuit et le passage du traitement — c'est-à-dire
-- précisément quand on le consulte après coup.
-- =====================================================================================

create or replace function f_etat_delegation(p_debut date, p_fin date, p_revoquee timestamptz)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select case
        when p_revoquee is not null then 'revoquee'
        when current_date < p_debut then 'a_venir'
        when current_date > p_fin   then 'expiree'
        else 'active'
    end;
$$;

comment on function f_etat_delegation(date, date, timestamptz) is
    'L''état d''une délégation SE DÉRIVE, il ne se stocke pas : révoquée, à venir, active '
    'ou expirée. Aucun traitement ne « remet » quoi que ce soit — une délégation expirée '
    'l''est par le calendrier (même arbitrage que f_etat_derogation, migration 035).';

-- =====================================================================================
-- §3 — LA RÉSOLUTION
--
-- 🛑 `security definer`, ET C'EST LE §46 DU `CONVENTIONS.md` : *une table qui PRODUIT
-- l'autorisation ne peut pas en DÉPENDRE*. Cette fonction est appelée pendant la
-- résolution du périmètre — donc AVANT qu'il existe. Un `select` ordinaire y serait
-- soumis aux politiques, et rendrait zéro ligne : la délégation n'accorderait rien, en
-- silence. C'est le défaut exact qui a coûté un jeton d'API rendant 401 à son premier
-- usage, et il est évité ici parce qu'il est écrit.
--
-- ⚠️ Surface ÉTROITE : trois colonnes, et seulement les délégations ACTIVES. Ni le
-- motif, ni l'auteur, ni les dates — la résolution n'en a pas besoin, et une fonction
-- « security definer » ne rend que ce qu'elle doit.
-- =====================================================================================

create or replace function f_delegations_actives(p_login text)
returns table (perimetre text, filiale_cible_id id_metier, profil_id id_metier)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select d.perimetre, d.filiale_cible_id, d.profil_id
      from delegations_droits d
     where lower(btrim(d.login)) = lower(btrim(p_login))
       and f_etat_delegation(d.debut, d.fin, d.revoquee_le) = 'active';
$$;

revoke all on function f_delegations_actives(text) from public;
grant execute on function f_delegations_actives(text) to grc_app;

comment on function f_delegations_actives(text) is
    'Les délégations ACTIVES d''un login, pour la résolution du périmètre. '
    '« security definer » parce que cette table PRODUIT l''autorisation et ne peut donc '
    'pas en dépendre (CONVENTIONS.md §46) : un select ordinaire rendrait zéro ligne '
    'pendant la résolution, et la délégation n''accorderait rien EN SILENCE. Surface '
    'étroite : trois colonnes, et rien du motif ni de l''auteur.';

-- =====================================================================================
-- §4 — LA REVUE DES ACCÈS LES VOIT
--
-- 🛑 **C'EST LA PROPRIÉTÉ 5, ET SANS ELLE CE DISPOSITIF SERAIT UNE PORTE DÉROBÉE.** La
-- revue périodique des droits (ISO 27001 A.5.18) balaie l'ANNUAIRE. Un droit accordé
-- dans le produit n'y figurerait pas : l'auditeur relirait la revue, la trouverait
-- complète, et manquerait exactement les accès que personne n'a inscrits dans l'AD.
--
-- Les délégations actives entrent donc dans l'instantané FIGÉ, comme les appartenances
-- de groupe, avec leur propre `source`. Elles s'y décident de la même façon.
--
-- ⚠️ **Et il y a une différence, à l'avantage du produit** : décider « à retirer » sur
-- une ligne d'annuaire ne retire rien — c'est à l'administrateur de l'AD d'agir. Sur une
-- délégation, le produit PEUT agir : il la révoque. C'est le seul endroit de cette revue
-- où la décision et le geste vivent au même endroit.
--
-- ⚠️ `delegation_id` n'est PAS une clé étrangère, et c'est délibéré : l'instantané d'une
-- revue ne doit dépendre de rien. Une revue close cite ce qui existait — c'est le même
-- arbitrage que les quatre colonnes figées de la migration `060`.
-- =====================================================================================

alter table revue_habilitation_lignes
    add column if not exists source text not null default 'annuaire';
alter table revue_habilitation_lignes
    add column if not exists delegation_id id_metier;
alter table revue_habilitation_lignes alter column groupe_nom drop not null;

do $$
begin
    if not exists (select 1 from pg_constraint
                    where conname = 'ck_revue_hab_source'
                      and conrelid = 'revue_habilitation_lignes'::regclass) then
        alter table revue_habilitation_lignes
            add constraint ck_revue_hab_source check (
                (source = 'annuaire'   and groupe_nom is not null and delegation_id is null)
             or (source = 'delegation' and groupe_nom is null     and delegation_id is not null));
    end if;
end;
$$;

-- L'unicité d'origine portait (revue, groupe, compte) et supposait `groupe_nom` non nul.
-- Deux index PARTIELS la remplacent, un par source : sans cela, deux délégations du même
-- compte entreraient deux fois dans la même revue — chacune avec un `groupe_nom` nul, et
-- deux NULL sont distincts (`CONVENTIONS.md` §45, pris par le même bout qu'en `049`).
alter table revue_habilitation_lignes drop constraint if exists uq_revue_hab_lignes;
create unique index if not exists uq_revue_hab_lignes_annuaire
    on revue_habilitation_lignes (revue_id, groupe_nom, compte_login)
    where source = 'annuaire';
create unique index if not exists uq_revue_hab_lignes_delegation
    on revue_habilitation_lignes (revue_id, delegation_id)
    where source = 'delegation';

comment on column revue_habilitation_lignes.source is
    'D''où vient l''accès revu : « annuaire » (appartenance à un groupe AD) ou '
    '« delegation » (octroi temporaire fait DANS le produit). ⚠️ Sans cette seconde '
    'source, la revue A.5.18 serait complète en apparence et manquerait tous les droits '
    'que personne n''a inscrits dans l''AD — c''est-à-dire exactement ceux que le produit '
    'accorde lui-même (migration 068).';

-- =====================================================================================
-- §5 — LE REGISTRE DE L'ARTICLE 30
--
-- ⚠️ Le produit tient son PROPRE registre (migration `026`). Quatre colonnes de cette
-- table portent des données personnelles, et deux régimes s'y appliquent :
--
--  · `login`, `accorde_par`, `revoquee_par` — des IDENTIFIANTS de personnes ;
--  · `motif`, `motif_revocation` — du texte libre, qui NOMME souvent quelqu'un
--    (« remplacement de Mme X pendant son congé »). Régime « signaler » : on ne purge
--    pas au hasard dans une phrase, on la porte à la connaissance du DPO.
-- =====================================================================================

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('delegations_droits', 'login', 'personnelle',
   'Identifier le bénéficiaire d''une délégation temporaire de droits.',
   'Obligation légale', 1095, 'anonymiser',
   'Identifiant de connexion : il désigne une personne aussi sûrement que son nom. '
   'Traçabilité des accès (ISO 27001 A.5.18) : une revue doit pouvoir dire QUI a eu quel '
   'droit, quand et pourquoi. ⚠️ « anonymiser » et non « supprimer » : effacer la ligne '
   'détruirait la trace d''un droit qui a EXISTÉ, et ce registre doit y répondre deux ans '
   'plus tard.'),
  ('delegations_droits', 'accorde_par', 'personnelle',
   'Attribuer la décision d''octroi à son auteur.',
   'Obligation légale', 1095, 'anonymiser',
   'Une élévation de droits sans auteur n''est pas une décision : c''est ce qu''un auditeur '
   'cherche, et c''est ce qui rend l''interdiction d''auto-délégation vérifiable après coup.'),
  ('delegations_droits', 'revoquee_par', 'personnelle',
   'Attribuer la décision de révocation à son auteur.',
   'Obligation légale', 1095, 'anonymiser',
   'Symétrique de l''octroi : qui a fermé l''accès, et quand.'),
  ('delegations_droits', 'motif', 'personnelle',
   'Justifier l''élévation temporaire de droits.',
   'Obligation légale', 1095, 'signaler',
   'Texte libre, qui NOMME fréquemment une personne (« remplacement de Mme X pendant son '
   'congé »). ⚠️ « signaler » et non « anonymiser » : on ne purge pas au hasard dans une '
   'phrase — le quatrième régime, né du constat sur « crise.notes », la porte à la '
   'connaissance du DPO plutôt que de la mutiler.'),
  ('delegations_droits', 'motif_revocation', 'personnelle',
   'Justifier la fermeture anticipée d''une délégation.',
   'Obligation légale', 1095, 'signaler',
   'Même nature que le motif d''octroi, et même régime.')
on conflict (table_nom, colonne) do nothing;

-- ⚠️ **LE BALAYAGE DU REGISTRE FRANCHIT LA FRONTIÈRE DU TEXTE** (migration `031`) :
-- TOUTE colonne textuelle est candidate, et doit être décidée — même celle qui ne
-- porte manifestement rien de personnel. C'est ce qui empêche qu'une colonne
-- personnelle passe pour anodine parce que personne ne l'a regardée. Ces deux-ci
-- sont donc décidées « non_personnelle », avec leur motif.
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
  ('delegations_droits', 'perimetre', 'non_personnelle',
   null, null, null, null,
   'Vocabulaire fermé — « filiale » ou « groupe ». Il dit l''étendue d''un droit, jamais '
   'qui le porte.'),
  ('revue_habilitation_lignes', 'source', 'non_personnelle',
   null, null, null, null,
   'Vocabulaire fermé — « annuaire » ou « delegation ». Il dit D''OÙ vient l''accès revu, '
   'jamais de qui il s''agit.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §6 — LES DEUX BALAYAGES QUI RANGENT LES TABLES SANS FILIALE
--
-- ⚠️ Les deux fonctions sont reprises **VERBATIM** des migrations qui les portaient, avec
-- une seule entrée de plus chacune : *une migration appliquée ne se réécrit jamais, elle
-- se corrige dans la suivante* (`CONVENTIONS.md` §23). Les relire ligne à ligne est le
-- prix de cette règle, et il est moins cher qu'une divergence.
--
-- 🛑 **Et ces deux balayages sont ce qui rend l'oubli impossible** : toute table sans
-- `filiale_id` que personne n'a RANGÉE fait rougir le déploiement. Une table de droits
-- qui apparaîtrait sans que quiconque ait dit qui l'écrit serait le pire des oublis.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_couverture_rls()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
        -- ── AJOUTÉE PAR 026_registre_des_donnees_personnelles.sql ────────────────
        -- `colonnes_personnelles` est un REGISTRE TECHNIQUE de même nature que
        -- `controles_schema` : il dit, colonne par colonne, quelles données
        -- personnelles LE PRODUIT détient, pourquoi, et pour combien de temps. Il ne
        -- porte aucune donnée de filiale — un nom de table, un nom de colonne, une
        -- finalité, une base légale — et il doit être lisible AVANT que le périmètre
        -- existe : la purge RGPD le lit pour savoir quoi anonymiser, et le garde-fou
        -- f_verifier_colonnes_personnelles() le lit à chaque migration. Son écriture
        -- est fermée par les PRIVILÈGES, pas par un prédicat : le rôle applicatif n'a
        -- que « select » dessus.
        -- ── AJOUTÉE PAR 068_la_delegation_temporaire.sql ────────────────────────
        -- `delegations_droits` PRODUIT l'autorisation : elle est lue pendant la
        -- résolution du périmètre, donc AVANT qu'il existe (`CONVENTIONS.md` §46).
        -- Elle ne porte pas de `filiale_id` parce qu'une délégation peut viser le
        -- Groupe entier, et parce que le registre lui-même est un objet
        -- d'administration Groupe. ⚠️ Sa LECTURE est ouverte au niveau des
        -- politiques — le §2 de `004_rls` interdit qu'une politique de lecture
        -- dépende du drapeau d'administration —, et la barrière est la ROUTE.
        'delegations_droits',
        'colonnes_personnelles',
        'controles_schema',
        'filiales',           -- définit la frontière elle-même ; lue avant tout périmètre
        'utilisateurs',       -- identités ; lues pour RÉSOUDRE le périmètre
        -- ── AJOUTÉE PAR 044_les_campagnes_descendantes.sql ──────────────────────
        -- `campagnes` porte LA MÊME CHOSE POUR TOUT LE GROUPE — l'intitulé d'une
        -- demande, son référentiel, son échéance —, et c'est le critère du §24.
        -- Ce qui diffère d'une filiale à l'autre (qui répond, où elle en est) vit
        -- dans `campagne_filiales`, qui porte un filiale_id et reste cloisonnée.
        -- ⚠️ Sa LECTURE est ouverte à dessein : une filiale doit voir la campagne
        -- qui la convoque. Elle n'apprend pas pour autant QUI D'AUTRE est convoqué —
        -- cette information est au §2 de la 044, sous politique cloisonnante. Son
        -- ÉCRITURE, elle, exige f_administration_groupe(), comme `utilisateurs`.
        'campagnes',
        -- ── AJOUTÉES PAR 060_la_revue_des_habilitations.sql ─────────────────────
        --
        -- ⚠️ **C'est un ARBITRAGE, pas un oubli** (`CONVENTIONS.md` §24), et il doit
        -- être lu avant d'être reconduit.
        --
        -- Une revue des droits d'accès (ISO 27001 A.5.18) porte sur la correspondance
        -- entre les groupes de l'annuaire et les profils du produit, et sur les comptes
        -- qui appartiennent à ces groupes. Ses trois sources — `groupes_ad`, `profils`,
        -- `utilisateurs` — sont **toutes de niveau Groupe**, et figurent déjà ici. La
        -- revue porte donc, elle aussi, la même chose pour tout le groupe.
        --
        -- ⚠️ **La rendre cloisonnée aurait exigé d'inventer un rattachement que le
        -- modèle n'a pas** : le périmètre d'une personne n'est stocké nulle part, il est
        -- RÉSOLU à chaque connexion depuis ses groupes d'annuaire. Rattacher une ligne
        -- de revue à une filiale aurait supposé ce rattachement, c'est-à-dire l'aurait
        -- inventé — et une revue fondée sur un rattachement inventé atteste de ce qui
        -- n'a pas été vérifié.
        --
        -- 🛑 **CE QUI PROTÈGE CES DEUX TABLES N'EST DONC PAS LA RLS, MAIS LA ROUTE**,
        -- et il faut le dire parce que c'est inhabituel : leur lecture est ouverte au
        -- niveau des politiques — le §2 interdit qu'une politique de LECTURE dépende
        -- d'un réglage d'administration —, et la seule barrière est la déclaration
        -- `{ action: 'lire', domaine: 'administration' }` des routes de
        -- `src/habilitations/`. C'est exactement le régime de `utilisateurs`, de
        -- `profils` et de `groupes_ad` depuis la porte S1, pour la même raison.
        -- Leur ÉCRITURE, elle, exige `f_administration_groupe()`.
        'revues_habilitations',
        'revue_habilitation_lignes',
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

$function$;

CREATE OR REPLACE FUNCTION public.f_verifier_registres_techniques()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- (1) LES REGISTRES : écrits par le déploiement sous le compte propriétaire, jamais
    --     par un rôle de connexion. Un rôle qui pourrait les écrire pourrait effacer
    --     l'alarme avant de la déclencher.
    v_registres constant text[] := array[
        'migrations_schema',      -- empreinte des migrations appliquées (Q-5)
        'controles_schema',       -- dernière observation des garde-fous (Q-5)
        'colonnes_personnelles'   -- registre de l'article 30 DU PRODUIT (Q-291)
    ];
    -- (2) LES TABLES SANS FILIALE QUE L'APPLICATION ÉCRIT LÉGITIMEMENT. Elles sont de
    --     niveau Groupe, ou elles produisent le périmètre lui-même, ou ce sont des
    --     liaisons qui se cloisonnent par leur parent. Leur écriture est tenue par une
    --     politique RLS, pas par les privilèges.
    v_ecrites_par_l_application constant text[] := array[
        'filiales', 'utilisateurs', 'profils', 'profil_domaines',
        'sessions', 'session_domaines',
        'mappings', 'mapping_exigences',
        'actif_dependances', 'actif_risques', 'incident_actifs',
        'processus_actifs', 'risque_exigences', 'import_erreurs',
        -- AJOUTÉE PAR 044 : niveau Groupe, écriture tenue par une politique RLS
        -- (f_administration_groupe), jamais par les privilèges.
        'campagnes',
        -- ── AJOUTÉES PAR 060, ET C'EST UNE DÉCISION ──────────────────────────
        -- Écrites par l'APPLICATION, pas par le déploiement : ouvrir une revue,
        -- décider ligne à ligne et la clore sont des gestes d'administrateur, faits
        -- depuis le produit. Leur écriture est donc tenue par une politique RLS
        -- (f_administration_groupe), jamais par les privilèges — et le rôle
        -- applicatif y a bien les quatre verbes, contrairement à un registre.
        'revues_habilitations',
        'revue_habilitation_lignes',
        -- ── AJOUTÉE PAR 068, ET C'EST UNE DÉCISION ───────────────────────────
        -- Accorder et révoquer une délégation sont des gestes d'ADMINISTRATEUR,
        -- faits depuis le produit : l'écriture est tenue par une politique RLS
        -- (f_administration_groupe), jamais par les privilèges. ⚠️ Et il n'existe
        -- AUCUNE politique de suppression : une délégation se révoque, elle ne
        -- s'efface pas.
        'delegations_droits',
        -- ── AJOUTÉE PAR 062, ET C'EST UNE DÉCISION ───────────────────────────
        -- Écrite par l'APPLICATION : déclarer qui exploite un actif est un geste de
        -- saisie courante, fait depuis la fiche de l'actif. C'est une LIAISON, comme
        -- `actif_risques` ou `processus_actifs` : elle ne porte pas de `filiale_id` à
        -- elle et se cloisonne par ses DEUX parents — ce qui est plus strict qu'un
        -- `filiale_id`, puisque les deux extrémités doivent être dans le périmètre.
        'actif_prestataires'
    ];
    r      record;
    v_nom  text;
begin
    /* ── SENS 1 : une table sans filiale_id que PERSONNE n'a rangée ──────────────── */
    for r in
        select c.relname::text as nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         where c.relkind = 'r'
           and not exists (select 1 from pg_attribute a
                            where a.attrelid = c.oid and a.attname = 'filiale_id'
                              and a.attnum > 0 and not a.attisdropped)
           and not (c.relname::text = any (v_registres))
           and not (c.relname::text = any (v_ecrites_par_l_application))
         order by 1
    loop
        objet    := r.nom;
        anomalie := 'table_sans_filiale_non_rangee';
        detail   := 'Cette table ne porte pas de « filiale_id », et rien ne dit QUI '
                    'l''écrit. Décidez dans f_verifier_registres_techniques() : « registre '
                    'technique » — écrit par le seul déploiement, et les rôles de connexion '
                    'n''y ont que « select » — ou « écrite par l''application », son écriture '
                    'étant alors tenue par une politique RLS. ⚠️ Ne pas répondre, c''est ce '
                    'qu''a fait la migration 026 pour « colonnes_personnelles » : elle a '
                    'AFFIRMÉ dans un commentaire que le rôle applicatif n''y avait que '
                    '« select », et le rôle applicatif pouvait la vider (constat Q-291).';
        return next;
    end loop;

    /* ── SENS 2 : un registre déclaré et introuvable ─────────────────────────────── */
    foreach v_nom in array v_registres loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'registre_declare_introuvable';
            detail   := 'table déclarée « registre technique » et introuvable : le contrôle '
                        'ne porte plus sur rien, et il couvrirait toute table future qui '
                        'reprendrait ce nom.';
            return next;
            continue;
        end if;

        /* ── SENS 3 : un registre RÉINSCRIPTIBLE — la mesure, pas la déclaration ── */
        for r in
            select rr.rolname::text as role_nom,
                   concat_ws(', ',
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'insert')   then 'insert'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'update')   then 'update'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'delete')   then 'delete'   end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'truncate') then 'truncate' end)
                       as verbes
              from pg_roles rr
             where rr.rolcanlogin and not rr.rolsuper
               and rr.oid <> (select d.datdba from pg_database d where d.datname = current_database())
               and (has_table_privilege(rr.oid, v_nom::regclass, 'insert')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'update')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'delete')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'truncate'))
             order by 1
        loop
            objet    := v_nom;
            anomalie := 'registre_reinscriptible';
            detail   := format('le rôle de connexion « %s » détient %s sur un registre '
                               'technique. Corriger : revoke insert, update, delete, truncate '
                               'on %I from %I;   ⚠️ Et vérifier « alter default privileges » : '
                               'c''est par là que colonnes_personnelles avait hérité des quatre '
                               'verbes sans qu''aucune ligne de sa migration ne le dise '
                               '(constat Q-291).',
                               r.role_nom, r.verbes, v_nom, r.role_nom);
            return next;
        end loop;
    end loop;

    /* ── SENS 4 : une table rangée « écrite par l'application » et introuvable ───── */
    foreach v_nom in array v_ecrites_par_l_application loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'table_rangee_introuvable';
            detail   := 'table déclarée « écrite par l''application » et introuvable : la '
                        'déclaration couvrirait toute table future qui reprendrait ce nom, '
                        'et lui accorderait le silence sans que personne ne décide.';
            return next;
        end if;
    end loop;

    return;
end;
$function$;

-- =====================================================================================
-- §7 — LE GARDE-FOU
--
-- ⚠️ Il **ÉPROUVE**, il ne relit pas du texte (`CONVENTIONS.md` §39.1) : chaque invariant
-- est soumis au PRÉDICAT RÉEL de sa contrainte par `f_contrainte_accepte()`. Un `check`
-- vidé de sa substance qui garderait son nom et ses littéraux serait vu.
--
-- 🛑 Et il porte ses CONTRE-TÉMOINS : une valeur légitime doit PASSER. Un garde qui
-- n'éprouve que des refus est muet sur une contrainte devenue « false », et une
-- contrainte devenue « false » refuse tout — y compris ce qu'on a le droit de faire.
-- =====================================================================================

create or replace function f_verifier_delegations_droits()
returns table (objet text, anomalie text, detail text)
language plpgsql
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_profil_rssi  text;
    v_profil_admin text;
    v_filiale      text;
begin
    /* ── 1. LA TABLE EXISTE, ET ELLE EST CLOISONNÉE PAR SES POLITIQUES ───────── */
    if to_regclass('public.delegations_droits') is null then
        objet := 'delegations_droits'; anomalie := 'table_absente';
        detail := 'La table des délégations temporaires a disparu : plus aucun octroi '
               || 'temporaire n''est tracé, et f_delegations_actives() échouerait à chaque '
               || 'ouverture de session.';
        return next; return;
    end if;

    /* ── 2. AUCUNE POLITIQUE DE SUPPRESSION — une délégation se RÉVOQUE ──────── */
    if exists (select 1 from pg_policy p
                join pg_class c on c.oid = p.polrelid
               where c.relname = 'delegations_droits' and p.polcmd = 'd') then
        objet := 'delegations_droits'; anomalie := 'suppression_ouverte';
        detail := 'Une politique de suppression est apparue. Une délégation ne se supprime '
               || 'pas : effacer effacerait la trace d''un droit qui a EXISTÉ, et ce '
               || 'registre doit pouvoir y répondre trois ans plus tard.';
        return next;
    end if;

    /* ── 3. LA RÉSOLUTION EST « SECURITY DEFINER », ET FERMÉE À PUBLIC ───────── */
    if not exists (select 1 from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
                   where p.proname = 'f_delegations_actives' and p.prosecdef) then
        objet := 'f_delegations_actives'; anomalie := 'resolution_non_definer';
        detail := 'La fonction qui rend les délégations actives n''est plus « security '
               || 'definer ». Cette table PRODUIT l''autorisation : un select ordinaire y '
               || 'rendrait zéro ligne pendant la résolution du périmètre, et la '
               || 'délégation n''accorderait rien EN SILENCE (CONVENTIONS.md §46).';
        return next;
    end if;
    if has_function_privilege('public', 'f_delegations_actives(text)', 'execute') then
        objet := 'f_delegations_actives'; anomalie := 'definer_joignable_par_public';
        detail := 'Une fonction « security definer » exécutable par PUBLIC annule le '
               || 'cloisonnement qu''elle contourne légitimement (constat Q-136).';
        return next;
    end if;

    /* ── 4. LES QUATRE INVARIANTS, ÉPROUVÉS SUR LE PRÉDICAT RÉEL ───────────────
     *
     * 🛑 **AUCUNE CONDITION D'ENTRÉE, ET C'EST UNE CORRECTION.** La première
     * rédaction ne jouait ces quatre contrôles que si elle trouvait un profil et
     * une filiale en base — et sur une base d'essai qui n'en porte pas, elle
     * rendait **zéro anomalie**, c'est-à-dire ce qu'elle rend quand tout va bien.
     * Les quatre mutations du banc sont restées vertes contre un garde muet.
     * *Un garde qui ne regarde pas rend zéro anomalie* — le motif du §39, et il
     * s'est reproduit dans la migration qui le cite.
     *
     * `f_contrainte_accepte()` n'évalue QUE le prédicat de la contrainte : les
     * clés étrangères ne sont pas jouées. Les témoins peuvent donc porter des
     * identifiants quelconques, et le contrôle vaut sur n'importe quelle base. */
    v_profil_rssi  := 'PROF-TEMOIN';
    v_profil_admin := 'PROF-TEMOIN';
    v_filiale      := 'FIL-TEMOIN';

    -- 🛑 L'INVARIANT DE SÉCURITÉ : pas d'auto-délégation.
    if true then
        if f_contrainte_accepte(
            'delegations_droits', 'ck_delegations_pas_soi_meme',
            jsonb_build_object(
                'id', 'DEL-TEMOIN', 'login', 'ada.lovelace', 'profil_id', v_profil_rssi,
                'perimetre', 'filiale', 'filiale_cible_id', v_filiale,
                'debut', current_date, 'fin', current_date + 10,
                'motif', 'Auto-délégation, qui doit être refusée',
                'accorde_par', 'Ada.Lovelace')) then
            objet := 'ck_delegations_pas_soi_meme'; anomalie := 'auto_delegation_acceptee';
            detail := 'Un compte peut s''accorder des droits à LUI-MÊME. C''est le seul '
                   || 'chemin d''élévation de privilège que ce dispositif ouvrirait, et il '
                   || 'est censé être fermé DANS la base. La casse ne protège pas : la '
                   || 'contrainte compare en minuscules.';
            return next;
        end if;
        -- CONTRE-TÉMOIN : une délégation À QUELQU'UN D'AUTRE doit passer.
        if not f_contrainte_accepte(
            'delegations_droits', 'ck_delegations_pas_soi_meme',
            jsonb_build_object(
                'id', 'DEL-TEMOIN', 'login', 'ada.lovelace', 'profil_id', v_profil_rssi,
                'perimetre', 'filiale', 'filiale_cible_id', v_filiale,
                'debut', current_date, 'fin', current_date + 10,
                'motif', 'Remplacement pendant un congé, trois semaines',
                'accorde_par', 'admin.grc')) then
            objet := 'ck_delegations_pas_soi_meme'; anomalie := 'contrainte_devenue_fausse';
            detail := 'La contrainte refuse AUSSI une délégation légitime : elle est '
                   || 'devenue « false », et plus personne ne peut déléguer. Un garde qui '
                   || 'n''éprouverait que le refus serait muet là-dessus.';
            return next;
        end if;

        -- La durée est bornée.
        if f_contrainte_accepte(
            'delegations_droits', 'ck_delegations_duree',
            jsonb_build_object(
                'id', 'DEL-TEMOIN', 'login', 'ada.lovelace', 'profil_id', v_profil_rssi,
                'perimetre', 'filiale', 'filiale_cible_id', v_filiale,
                'debut', current_date, 'fin', current_date + 400,
                'motif', 'Une délégation de plus d''un an', 'accorde_par', 'admin.grc')) then
            objet := 'ck_delegations_duree'; anomalie := 'duree_non_bornee';
            detail := '« Temporaire » n''est plus borné : une délégation de 400 jours passe. '
                   || 'Prolonger doit être une NOUVELLE décision, pas une reconduction tacite.';
            return next;
        end if;

        -- Le motif est substantiel.
        if f_contrainte_accepte(
            'delegations_droits', 'ck_delegations_motif',
            jsonb_build_object(
                'id', 'DEL-TEMOIN', 'login', 'ada.lovelace', 'profil_id', v_profil_rssi,
                'perimetre', 'filiale', 'filiale_cible_id', v_filiale,
                'debut', current_date, 'fin', current_date + 10,
                'motif', 'RAS', 'accorde_par', 'admin.grc')) then
            objet := 'ck_delegations_motif'; anomalie := 'motif_creux_accepte';
            detail := '« RAS » passe comme motif. Cette ligne est celle qu''un auditeur lit : '
                   || 'un motif creux est une habitude qui apprend à ne plus lire.';
            return next;
        end if;
    end if;

    /* ── 5. LE PROFIL D'ADMINISTRATION NE SE DÉLÈGUE PAS ────────────────────── */
    if not exists (select 1 from pg_trigger t
                    join pg_class c on c.oid = t.tgrelid
                   where c.relname = 'delegations_droits'
                     and t.tgname = 'trg_delegations_droits_profil'
                     and t.tgenabled = 'A') then
        objet := 'trg_delegations_droits_profil'; anomalie := 'declencheur_absent_ou_desarme';
        detail := 'Le déclencheur qui refuse la délégation du profil d''administration a '
               || 'disparu ou n''est plus armé « always ». Administrer l''application est '
               || 'attaché au groupe transversal de l''annuaire : un second chemin vers lui '
               || 'contredirait la règle que tout le dispositif répète.';
        return next;
    end if;

    /* ── 6. L'ÉTAT SE DÉRIVE, ET LA DÉRIVATION DIT VRAI ─────────────────────── */
    if f_etat_delegation(current_date - 30, current_date - 1, null) <> 'expiree'
       or f_etat_delegation(current_date, current_date + 5, null) <> 'active'
       or f_etat_delegation(current_date + 1, current_date + 5, null) <> 'a_venir'
       or f_etat_delegation(current_date, current_date + 5, now()) <> 'revoquee' then
        objet := 'f_etat_delegation'; anomalie := 'derivation_fausse';
        detail := 'La dérivation de l''état ne rend plus les quatre cas attendus. Une '
               || 'délégation expirée qui se dirait « active » accorderait des droits que '
               || 'personne n''a décidé de prolonger.';
        return next;
    end if;

    /* ── 7. LA REVUE PEUT LES PORTER ────────────────────────────────────────── */
    if not exists (select 1 from pg_attribute a
                    where a.attrelid = 'revue_habilitation_lignes'::regclass
                      and a.attname = 'source' and a.attnum > 0 and not a.attisdropped) then
        objet := 'revue_habilitation_lignes'; anomalie := 'revue_aveugle_aux_delegations';
        detail := 'La colonne « source » a disparu : la revue des accès (A.5.18) ne '
               || 'distinguerait plus ce qui vient de l''annuaire de ce que le produit '
               || 'accorde lui-même — elle serait complète en apparence et manquerait '
               || 'exactement les droits que personne n''a inscrits dans l''AD.';
        return next;
    end if;

    return;
end;
$$;

revoke all on function f_verifier_delegations_droits() from public;
grant execute on function f_verifier_delegations_droits() to grc_app;

comment on function f_verifier_delegations_droits() is
    'Garde-fou de la délégation temporaire de droits (migration 068). Il ÉPROUVE les '
    'quatre invariants sur le prédicat réel de leur contrainte — pas d''auto-délégation '
    'd''abord, qui est l''invariant de sécurité —, avec leurs contre-témoins ; il mesure '
    'que la résolution reste « security definer » et fermée à PUBLIC, que le profil '
    'd''administration reste indélégable, que l''état se dérive juste, et que la revue '
    'sait encore distinguer un droit d''annuaire d''une délégation.';

-- =====================================================================================
-- §8 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('068', 'la délégation temporaire de droits : donner un profil à quelqu''un pour une '
               'durée bornée, avec un motif et un auteur — plus sûr qu''une appartenance de '
               'groupe que personne ne retire, parce qu''elle expire d''elle-même et qu''elle '
               'entre dans la revue des accès')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   ⚠️ Retirer D'ABORD la lecture des délégations dans `resoudreDroits()`, sans quoi
--      chaque ouverture de session échouerait sur une fonction absente.
--   begin;
--   drop function if exists f_verifier_delegations_droits();
--   delete from controles_schema where fonction = 'f_verifier_delegations_droits';
--   drop function if exists f_delegations_actives(text);
--   drop function if exists f_etat_delegation(date, date, timestamptz);
--   drop table if exists delegations_droits;
--   drop function if exists f_delegation_refuse_administration();
--   delete from colonnes_personnelles where table_nom = 'delegations_droits';
--   delete from migrations_schema where version = '068';
--   commit;
-- ⚠️ Annuler DÉTRUIT le registre des délégations passées — c'est-à-dire la réponse à
--    « qui a eu quel droit, quand, et pourquoi ». Exportez-le d'abord.
-- =====================================================================================
