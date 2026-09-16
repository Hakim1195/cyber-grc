-- =====================================================================================
--  040 — LA DEMANDE D'EXERCICE DE DROITS : l'horloge d'un mois, et elle ne se stocke pas
-- -------------------------------------------------------------------------------------
--  §0  Le périmètre de lecture de la migration
--  §1  Le domaine `type_entite` admet « demandes_droits »
--  §2  L'ÉCHÉANCE SE DÉRIVE — `f_echeance_droits()` et `f_etat_demande_droits()`
--  §3  La table `demandes_droits`
--  §4  Cloisonnement
--  §5  Le garde-fou
--  §6  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — action 20.4 du `docs/PLAN_PRODUIT.md` (lot L20)
--
--  Les articles 15 à 22 du RGPD donnent à toute personne un droit d'accès, de
--  rectification, d'effacement, de limitation, d'opposition et de portabilité. L'article
--  12 §3 donne au responsable de traitement **un mois** pour répondre, prorogeable de
--  **deux mois** pour une demande complexe — et l'article 12 §4 lui impose, s'il ne donne
--  pas suite, de le dire **dans le même délai** avec les voies de recours.
--
--  Le produit ne savait rien de tout cela. Une demande reçue par courriel vivait dans une
--  boîte aux lettres, et le délai dans la tête de quelqu'un.
--
--  ── CE QUE L'ACTION EXIGE, ET CE QU'ELLE N'EXIGE PAS ────────────────────────────────
--
--  Critère : *« registre, délai d'un mois armé, traçabilité. Le délai emprunte le même
--  mécanisme que 20.1. »* Le mécanisme de 20.1, c'est **la dérivation** : une échéance
--  réglementaire ne se stocke pas, elle se calcule à partir de son origine, à un seul
--  endroit, avec sa référence au texte. Une échéance rangée en colonne resterait calculée
--  sur l'ancienne date le jour où la date de réception est corrigée — sans que personne le
--  sache, dans le domaine où le silence coûte le plus cher.
--
--  ⚠️ **Ce que le produit NE FAIT PAS, et le dire est la moitié du travail.** Il ne répond
--  pas à la personne, il n'extrait pas ses données, il ne juge pas si la demande est
--  fondée. Il **tient le registre** et **arme l'horloge**. Toute autre lecture serait une
--  prise de responsabilité qu'un logiciel ne peut pas porter — c'est l'arbitrage rendu en
--  20.2 pour les notifications aux autorités, et il vaut ici mot pour mot.
--
--  ── ⚠️ ET UNE DIFFICULTÉ PROPRE À CETTE TABLE ───────────────────────────────────────
--
--  **Elle contient les données personnelles d'une personne qui n'est PAS un utilisateur.**
--  Le nom du demandeur, son adresse de contact, l'objet de sa demande : le registre de
--  l'article 30 du produit lui-même (`colonnes_personnelles`) doit donc les ranger, avec
--  leur finalité, leur base légale et leur sort à l'expiration. La base légale est
--  l'**obligation légale** — l'article 12 §3 impose de répondre, donc de savoir à qui.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LECTURE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- `CONVENTIONS.md` §42. Cette migration ne reprend aucune donnée, mais le §1 lit une
-- contrainte appliquée et le §6 joue `f_verifier_schema()`.
-- =====================================================================================

select set_config('grc.utilisateur', 'migration-040', true);
select set_config('grc.filiales',
                  (select coalesce(string_agg(id, ','), '') from filiales), true);

-- =====================================================================================
-- §1 — LE DOMAINE `type_entite` ADMET « demandes_droits »
-- -------------------------------------------------------------------------------------
-- `CONVENTIONS.md` §40.1. ⚠️ Le nom de la contrainte NE CHANGE PAS — la `039` a coûté
-- une mutation muette pour l'avoir renommée : le contrôle de morsure de
-- `gardes-eprouves.test.mjs` cherche `type_entite_check` sous son nom d'origine.
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'type_entite'
       and c.conname = 'type_entite_check';

    if v_predicat is null then
        raise exception 'type_entite_check est introuvable : la 001 n''a pas été appliquée.';
    end if;
    if position('''demandes_droits''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà « demandes_droits » : rejeu, rien à faire.';
        return;
    end if;
    -- Le point d'ancrage : la dernière valeur ajoutée, par la `039`.
    if position('''analyses_impact''' in v_predicat) = 0 then
        raise exception 'La valeur « analyses_impact » est introuvable dans le prédicat '
                        'appliqué de type_entite_check : son texte a changé, et la '
                        'substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, '''analyses_impact''',
                      '''analyses_impact'', ''demandes_droits''');

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais « demandes_droits ».';
end;
$$;

-- =====================================================================================
-- §2 — L'ÉCHÉANCE SE DÉRIVE
-- -------------------------------------------------------------------------------------
-- ⚠️ **Un seul endroit**, et c'est celui-ci — le mécanisme de 20.1, repris et non
-- réinventé. La route, l'échéancier et le banc l'appellent tous les trois ; une seconde
-- rédaction se mettrait à diverger au premier ajustement, et deux comptes de la même
-- échéance est la pire chose qu'un outil produit en audit puisse afficher.
--
-- Les délais sont écrits AVEC leur source. Un chiffre réglementaire sans sa référence est
-- un chiffre que personne ne peut vérifier — et celui qui le vérifiera est une autorité.
-- =====================================================================================

create or replace function f_echeance_droits(p_recue_le date, p_prorogee boolean)
returns date
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    -- RGPD article 12 §3 : « dans les meilleurs délais et en tout état de cause dans un
    -- délai d'UN MOIS à compter de la réception de la demande ». Prorogeable de DEUX mois
    -- « compte tenu de la complexité et du nombre de demandes ».
    select case
        when p_recue_le is null then null
        when coalesce(p_prorogee, false) then p_recue_le + interval '3 months'
        else p_recue_le + interval '1 month'
    end::date;
$$;

comment on function f_echeance_droits(date, boolean) is
    'L''échéance de réponse à une demande d''exercice de droits, DÉRIVÉE de sa date de '
    'réception — jamais stockée (action 20.4). Un mois (RGPD art. 12 §3), trois mois quand '
    'la prorogation de deux mois a été notifiée à la personne. ⚠️ La stocker laisserait, '
    'après correction de la date de réception, une échéance calculée sur l''ancienne — sans '
    'que personne le sache. Rend NULL si la réception est inconnue : une horloge sans '
    'origine ne s''affiche pas, elle s''explique (même arbitrage qu''à 20.1).';

grant execute on function f_echeance_droits(date, boolean) to grc_app;

create or replace function f_etat_demande_droits(
    p_statut text, p_recue_le date, p_prorogee boolean)
returns text
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        when p_statut = 'repondue' then 'repondue'
        when p_statut = 'refusee'  then 'refusee'
        -- ⚠️ ICI, ET C'EST TOUTE L'ACTION : une demande non traitée dont le mois est
        -- écoulé passe « en retard » TOUTE SEULE, au changement de jour. L'absence de
        -- traitement n'est pas une économie : c'est la garantie.
        when f_echeance_droits(p_recue_le, p_prorogee) < current_date then 'en_retard'
        else 'a_traiter'
    end;
$$;

comment on function f_etat_demande_droits(text, date, boolean) is
    'L''état d''une demande d''exercice de droits, DÉRIVÉ de son statut et de son échéance '
    '(action 20.4). Quatre valeurs : repondue, refusee, en_retard, a_traiter. ⚠️ '
    '« en_retard » n''est posé par AUCUNE écriture — une demande dont le mois de '
    'l''article 12 §3 est écoulé le devient au changement de jour. ⚠️ « refusee » n''est '
    'PAS une fin de non-recevoir silencieuse : l''article 12 §4 impose d''informer la '
    'personne DANS LE MÊME DÉLAI, avec les voies de recours — c''est pourquoi la table '
    'exige un motif ET une date de réponse pour ce statut.';

grant execute on function f_etat_demande_droits(text, date, boolean) to grc_app;

-- =====================================================================================
-- §3 — LA TABLE `demandes_droits`
-- -------------------------------------------------------------------------------------
-- **De niveau FILIALE**, `filiale_id not null`, et l'arbitrage mérite d'être écrit : une
-- demande d'exercice de droits s'adresse à un **responsable de traitement**, qui est une
-- personne morale — donc une filiale. Une demande « de portée Groupe » voudrait dire que
-- vingt entités juridiques répondent d'une seule voix, ce qui n'est pas ce que l'article
-- 12 organise. Le cas d'une demande visant un traitement que le Groupe opère pour la
-- filiale se traite par le rattachement facultatif à ce traitement, pas par la portée.
-- =====================================================================================

create table if not exists demandes_droits (
    id            id_metier   not null default f_generer_id('DSAR'),
    filiale_id    id_metier   not null,

    -- Les six droits des articles 15 à 21, plus le retrait du consentement (art. 7 §3),
    -- qui arrive par le même canal et se traite dans le même registre.
    type_demande  text        not null,
    recue_le      date        not null default current_date,
    canal         text        not null default 'courriel',

    -- ⚠️ DONNÉES PERSONNELLES D'UNE PERSONNE QUI N'EST PAS UN UTILISATEUR. Elles sont
    -- rangées au registre de l'article 30 du produit (`colonnes_personnelles`, plus bas),
    -- avec leur finalité, leur base légale et leur sort à l'expiration.
    demandeur     text        not null,
    contact       text,

    -- Article 12 §6 : le responsable peut demander des informations supplémentaires pour
    -- confirmer l'identité. Le fait est DATÉ ou il n'a pas eu lieu — même règle que le
    -- verdict d'intégrité de la `020` et que la consultation CNIL de la `039`.
    identite_verifiee     boolean not null default false,
    identite_verifiee_le  date,

    -- Article 12 §3, second alinéa : la prorogation de deux mois se NOTIFIE à la personne
    -- dans le mois. Une prorogation non notifiée n'en est pas une.
    prorogee      boolean     not null default false,
    prorogee_le   date,
    prorogation_motif text,

    statut        text        not null default 'recue',
    repondue_le   date,
    reponse_resume text,
    -- Article 12 §4 : le refus s'explique, et il ouvre des voies de recours.
    motif_refus   text,

    -- Rattachement FACULTATIF au registre de l'article 30 : quand la demande vise un
    -- traitement identifié, le dire fait gagner l'essentiel du travail d'instruction.
    -- ⚠️ Clé SIMPLE et non composite : `traitements` étant MIXTE, une clé composite
    -- exigerait la paire de portée du constat N-10. Elle est ici — voir plus bas.
    traitement_id id_metier,
    traitement_filiale_id id_metier,
    traitement_portee_groupe boolean generated always as (traitement_filiale_id is null) stored,

    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,

    constraint pk_demandes_droits primary key (id),
    constraint uq_demandes_droits_id_filiale unique (id, filiale_id),

    constraint fk_demandes_droits_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- ── LA PAIRE DE CLÉS VERS LE TRAITEMENT (constat N-10) ──────────────────────────
    -- Une demande est LOCALE ; elle peut viser un traitement local de sa filiale OU un
    -- traitement de portée Groupe — c'est le sens ouvert, et le plus fréquent (la paie du
    -- Groupe). `restrict` : supprimer un traitement dont une demande dépend effacerait le
    -- contexte de la réponse qu'on a faite.
    constraint fk_demandes_droits_traitement_portee
        foreign key (traitement_id, traitement_portee_groupe)
        references traitements (id, portee_groupe) on delete restrict,
    constraint fk_demandes_droits_traitement_coherence
        foreign key (traitement_id, traitement_filiale_id)
        references traitements (id, filiale_id) on delete restrict,
    -- `traitement_filiale_id`, quand il est renseigné, EST la filiale de la demande : une
    -- demande locale ne vise pas le traitement local d'une autre filiale.
    constraint ck_demandes_droits_traitement_filiale
        check (traitement_filiale_id is null or traitement_filiale_id = filiale_id),

    constraint ck_demandes_droits_type check (type_demande in (
        'acces', 'rectification', 'effacement', 'limitation', 'opposition',
        'portabilite', 'retrait_consentement')),
    constraint ck_demandes_droits_canal check (canal in (
        'courriel', 'courrier', 'formulaire', 'telephone', 'guichet', 'autre')),
    constraint ck_demandes_droits_statut check (statut in (
        'recue', 'en_cours', 'repondue', 'refusee')),
    constraint ck_demandes_droits_demandeur check (demandeur <> '' and length(demandeur) <= 200),
    constraint ck_demandes_droits_contact check (contact is null or length(contact) <= 320),

    -- ── LES TROIS RÈGLES QUE LE TEXTE IMPOSE, POSÉES DANS LE SCHÉMA ─────────────────
    --
    -- Une réponse est DATÉE ou elle n'a pas eu lieu (art. 12 §3).
    constraint ck_demandes_droits_repondue
        check (statut <> 'repondue' or repondue_le is not null),
    -- ⚠️ Un REFUS se motive ET se date : l'article 12 §4 impose d'informer la personne
    -- dans le même délai, avec les voies de recours. Un refus sans motif ni date est une
    -- fin de non-recevoir silencieuse — précisément ce que le texte proscrit.
    constraint ck_demandes_droits_refus
        check (statut <> 'refusee'
               or (motif_refus is not null and motif_refus <> '' and repondue_le is not null)),
    -- Une prorogation se NOTIFIE (art. 12 §3, second alinéa) et s'explique.
    constraint ck_demandes_droits_prorogation
        check (not prorogee
               or (prorogee_le is not null
                   and prorogation_motif is not null and prorogation_motif <> '')),
    constraint ck_demandes_droits_identite
        check (not identite_verifiee or identite_verifiee_le is not null),
    constraint ck_demandes_droits_resume
        check (reponse_resume is null or length(reponse_resume) <= 4000),
    constraint ck_demandes_droits_motif
        check (motif_refus is null or length(motif_refus) <= 4000)
);

comment on table demandes_droits is
    'Registre des demandes d''exercice de droits — RGPD articles 15 à 22, et retrait du '
    'consentement (art. 7 §3). Action 20.4. ⚠️ Elle ne porte AUCUNE échéance : le mois de '
    'l''article 12 §3 se dérive de la date de réception (f_echeance_droits), à un seul '
    'endroit — le mécanisme de 20.1, repris et non réinventé. ⚠️ Le produit NE RÉPOND PAS '
    'à la personne et n''extrait pas ses données : il tient le registre et arme l''horloge. '
    '⚠️ Elle contient les données personnelles d''une personne qui n''est PAS un '
    'utilisateur : le registre de l''article 30 du produit les range, avec leur sort à '
    'l''expiration.';

comment on column demandes_droits.prorogee is
    'La prorogation de deux mois de l''article 12 §3, second alinéa. Elle se NOTIFIE à la '
    'personne dans le mois, et elle s''explique : ck_demandes_droits_prorogation exige la '
    'date et le motif. Une prorogation non notifiée n''en est pas une.';
comment on column demandes_droits.traitement_filiale_id is
    'Miroir de la portée du TRAITEMENT visé, posé par trg_demandes_droits_portee. Une '
    'valeur dérivée d''une AUTRE ligne : la recevoir de l''appelant rouvrirait un oracle '
    'd''existence inter-filiales (constat N-10).';

create index ix_demandes_droits_filiale on demandes_droits (filiale_id, recue_le desc);
create index ix_demandes_droits_traitement on demandes_droits (traitement_id);

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('demandes_droits', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('demandes_droits', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('demandes_droits', 'type_demande', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : le droit invoqué (RGPD art. 15 à 22).'),
  ('demandes_droits', 'recue_le', 'non_personnelle', null, null, null, null,
   'Date de réception : un fait daté, et l''origine de l''horloge de l''article 12 §3.'),
  ('demandes_droits', 'canal', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : par où la demande est arrivée.'),
  -- ⚠️ LES DEUX COLONNES QUI PORTENT LA PERSONNE. Elles sont « conserver » à
  -- l'expiration, et ce n'est pas un oubli : la preuve d'avoir répondu dans le délai
  -- perd tout sens si l'on ne sait plus À QUI. C'est l'article 5 §1 e) — la conservation
  -- reste licite tant qu'elle sert la finalité, et la finalité est ici probatoire.
  ('demandes_droits', 'demandeur', 'personnelle',
   'Identifier la personne qui exerce ses droits, pour pouvoir lui répondre et prouver '
   'qu''on lui a répondu dans le délai de l''article 12 §3.',
   'Obligation légale', 1095, 'conserver',
   'Nom ou référence de la personne concernée. ⚠️ « conserver » : anonymiser cette colonne '
   'détruirait la preuve d''avoir répondu à quelqu''un — c''est-à-dire la seule pièce qui '
   'protège le responsable de traitement en cas de réclamation. La durée est celle de la '
   'prescription de trois ans.'),
  ('demandes_droits', 'contact', 'personnelle',
   'Adresser la réponse à la personne qui a exercé ses droits.',
   'Obligation légale', 1095, 'anonymiser',
   'Adresse de courriel ou postale. ⚠️ « anonymiser », contrairement au nom : une fois la '
   'réponse faite et le délai de réclamation écoulé, le canal de contact ne sert plus la '
   'finalité, et le conserver serait une conservation sans objet.'),
  ('demandes_droits', 'identite_verifiee', 'non_personnelle', null, null, null, null,
   'Booléen : l''identité a-t-elle été confirmée (RGPD art. 12 §6).'),
  ('demandes_droits', 'identite_verifiee_le', 'non_personnelle', null, null, null, null,
   'Date de la vérification : un fait daté.'),
  ('demandes_droits', 'prorogee', 'non_personnelle', null, null, null, null,
   'Booléen : la prorogation de deux mois de l''article 12 §3 a-t-elle été notifiée.'),
  ('demandes_droits', 'prorogee_le', 'non_personnelle', null, null, null, null,
   'Date de notification de la prorogation : un fait daté.'),
  ('demandes_droits', 'prorogation_motif', 'personnelle',
   'Motiver la prorogation, comme l''article 12 §3 l''impose.',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom peut figurer au milieu '
   'd''une phrase — régime « signaler ».'),
  ('demandes_droits', 'statut', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : recue / en_cours / repondue / refusee.'),
  ('demandes_droits', 'repondue_le', 'non_personnelle', null, null, null, null,
   'Date de la réponse : un fait daté, et la preuve du respect du délai.'),
  ('demandes_droits', 'reponse_resume', 'personnelle',
   'Consigner ce qui a été répondu, pour prouver la teneur de la réponse.',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre : régime « signaler » — un nom peut figurer au milieu d''une phrase.'),
  ('demandes_droits', 'motif_refus', 'personnelle',
   'Consigner le motif du refus et les voies de recours indiquées (RGPD art. 12 §4).',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre : régime « signaler ».'),
  ('demandes_droits', 'traitement_id', 'non_personnelle', null, null, null, null,
   'Identifiant du traitement visé, quand la demande en désigne un.'),
  ('demandes_droits', 'traitement_filiale_id', 'non_personnelle', null, null, null, null,
   'Miroir de la portée du traitement, posé par un déclencheur.')
on conflict (table_nom, colonne) do nothing;

alter table demandes_droits
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_demandes_droits_provenance on demandes_droits;
create trigger trg_demandes_droits_provenance before insert on demandes_droits
    for each row execute function f_marquer_provenance();

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('demandes_droits', 'provenance', 'non_personnelle',
        'Vocabulaire clos ou valeur technique : d''où vient la ligne (migration 032).')
on conflict (table_nom, colonne) do nothing;

select f_poser_tracabilite_insertion();

drop trigger if exists trg_demandes_droits_maj on demandes_droits;
create trigger trg_demandes_droits_maj before update on demandes_droits
    for each row execute function f_maj_tracabilite();

-- ── La portée du traitement visé, posée depuis le TRAITEMENT (constat N-10) ──────────
create or replace function f_demandes_droits_porte_la_portee()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_filiale_traitement id_metier;
    v_trouve             boolean;
begin
    if new.traitement_id is null then
        new.traitement_filiale_id := null;
        return new;
    end if;

    select t.filiale_id, true into v_filiale_traitement, v_trouve
      from traitements t where t.id = new.traitement_id;

    if not coalesce(v_trouve, false) then
        raise exception 'Le traitement désigné n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et choisissez un traitement de votre filiale '
                         'ou un traitement de portée Groupe — ou laissez le champ vide si '
                         'la demande n''en vise aucun en particulier.';
    end if;

    new.traitement_filiale_id := v_filiale_traitement;
    return new;
end;
$$;

comment on function f_demandes_droits_porte_la_portee() is
    'Pose demandes_droits.traitement_filiale_id depuis le TRAITEMENT visé, pour que les '
    'deux clés composites du §3 puissent décider (constat N-10). ⚠️ La valeur est '
    'ÉCRASÉE : la recevoir de l''appelant rouvrirait un oracle d''existence '
    'inter-filiales. Un traitement non désigné remet la colonne à NULL — sans quoi un '
    'rattachement retiré laisserait sa portée derrière lui.';

drop trigger if exists trg_demandes_droits_portee on demandes_droits;
-- `before insert or update` SANS liste de colonnes : la `030` a coûté le constat A-9 pour
-- avoir écrit « update OF … ».
create trigger trg_demandes_droits_portee
    before insert or update on demandes_droits
    for each row execute function f_demandes_droits_porte_la_portee();

-- =====================================================================================
-- §4 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Contrat de la famille « niveau filiale » (`004_rls.sql` §3). ⚠️ Conséquence assumée :
-- une demande d'exercice de droits ne se lit QUE dans le périmètre de la filiale qui l'a
-- reçue. Une session de portée Groupe les voit toutes — c'est ce qu'un DPO groupe vient
-- chercher —, une session de filiale ne voit que les siennes.
-- =====================================================================================

alter table demandes_droits enable row level security;
alter table demandes_droits force  row level security;

drop policy if exists pol_demandes_droits_lecture     on demandes_droits;
drop policy if exists pol_demandes_droits_ajout       on demandes_droits;
drop policy if exists pol_demandes_droits_maj         on demandes_droits;
drop policy if exists pol_demandes_droits_suppression on demandes_droits;

create policy pol_demandes_droits_lecture on demandes_droits for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_demandes_droits_ajout on demandes_droits for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_demandes_droits_maj on demandes_droits for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_demandes_droits_suppression on demandes_droits for delete
    using (filiale_id = f_filiale_ecriture());

comment on policy pol_demandes_droits_lecture on demandes_droits is
    'Lecture : les demandes du périmètre de la session. Un DPO groupe les voit toutes ; '
    'une filiale ne voit que les siennes.';

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant select, insert, update, delete on demandes_droits to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on demandes_droits to grc_lecture';
    end if;
end;
$$;

-- ⚠️ APRÈS les politiques (`CONVENTIONS.md` §40.2) : l'installateur découvre les tables
-- porteuses par un prédicat dont une condition est « la politique de SUPPRESSION est
-- cloisonnée ». Appelé avant, il ne verrait pas la table neuve et la laisserait démunie
-- — ses pièces jointes survivraient à leur porteur.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

select f_armer_declencheurs();

-- =====================================================================================
-- §5 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ Il ÉPROUVE (`CONVENTIONS.md` §39) : il joue les deux fonctions sur des valeurs
-- témoins au lieu de lire leur texte. Et il ne lit AUCUNE ligne d'une table cloisonnée
-- (§41) : `install.sh` appelle `f_verifier_schema()` sans périmètre.
-- =====================================================================================

create or replace function f_verifier_demandes_droits()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_cas   record;
    v_rendu text;
    v_date  date;
    v_def   text;
begin
    /* ── SENS 1 : le délai de l'article 12 §3, ÉPROUVÉ ────────────────────────────── */
    for v_cas in
        select * from (values
            (date '2026-01-15', false, date '2026-02-15'),
            (date '2026-01-15', true,  date '2026-04-15'),
            -- Le 31 janvier + un mois : PostgreSQL rend le 28 (ou 29) février, et c'est
            -- la lecture retenue du « délai d'un mois ». Le cas est ÉPROUVÉ plutôt que
            -- supposé : une arithmétique en jours (+30) donnerait le 2 mars, c'est-à-dire
            -- deux jours de retard que personne ne verrait.
            (date '2026-01-31', false, date '2026-02-28'),
            (null::date,        false, null::date)
        ) as c(recue, prorogee, attendu)
    loop
        v_date := f_echeance_droits(v_cas.recue, v_cas.prorogee);
        if v_date is distinct from v_cas.attendu then
            objet    := 'f_echeance_droits';
            anomalie := 'echeance_derivee_fausse';
            detail   := format(
                'f_echeance_droits(%L, %L) rend %L au lieu de %L. Le délai de l''article '
                '12 §3 est ce qui sépare une réponse tardive d''une réclamation à la CNIL : '
                'une erreur ici décale toutes les demandes du parc à la fois.',
                v_cas.recue, v_cas.prorogee, v_date, v_cas.attendu);
            return next;
        end if;
    end loop;

    /* ── SENS 2 : l'état, ÉPROUVÉ — y compris le cas qui porte l'action ───────────── */
    for v_cas in
        select * from (values
            ('repondue', (current_date - 400)::date, false, 'repondue'),
            ('refusee',  (current_date - 400)::date, false, 'refusee'),
            ('recue',    (current_date)::date,       false, 'a_traiter'),
            ('en_cours', (current_date - 10)::date,  false, 'a_traiter'),
            -- LE CAS QUI PORTE L'ACTION : le mois est écoulé, personne n'a rien fait.
            ('en_cours', (current_date - 40)::date,  false, 'en_retard'),
            -- Et la prorogation REPOUSSE réellement : sans elle, la même demande serait
            -- déjà en retard. Sans ce cas, une prorogation qui ne prorogerait rien
            -- passerait au vert.
            ('en_cours', (current_date - 40)::date,  true,  'a_traiter')
        ) as c(statut, recue, prorogee, attendu)
    loop
        v_rendu := f_etat_demande_droits(v_cas.statut, v_cas.recue, v_cas.prorogee);
        if v_rendu is distinct from v_cas.attendu then
            objet    := 'f_etat_demande_droits';
            anomalie := 'etat_derive_faux';
            detail   := format(
                'f_etat_demande_droits(%L, %L, %L) rend « %s » au lieu de « %s ». L''état '
                'est DÉRIVÉ : une erreur ici fait disparaître des retards du tableau de '
                'bord du DPO, sur tout le parc à la fois.',
                v_cas.statut, v_cas.recue, v_cas.prorogee, v_rendu, v_cas.attendu);
            return next;
        end if;
    end loop;

    /* ── SENS 3 : les trois règles du texte sont POSÉES dans le schéma ────────────── */
    for v_cas in
        select * from (values
            ('ck_demandes_droits_refus',
             'un refus pourrait être enregistré SANS motif ni date de réponse, alors que '
             'l''article 12 §4 impose d''informer la personne dans le même délai, avec les '
             'voies de recours. Une fin de non-recevoir silencieuse est précisément ce que '
             'le texte proscrit'),
            ('ck_demandes_droits_prorogation',
             'une prorogation pourrait être enregistrée sans avoir été notifiée ni motivée, '
             'alors que l''article 12 §3 exige les deux — et une prorogation non notifiée '
             'ne proroge rien, elle fabrique un retard qu''on croit couvert'),
            ('ck_demandes_droits_repondue',
             'une demande pourrait être « répondue » sans date de réponse : la preuve du '
             'respect du délai disparaîtrait avec elle')
        ) as c(nom, effet)
    loop
        select pg_get_constraintdef(c.oid) into v_def
          from pg_constraint c
         where c.conrelid = 'demandes_droits'::regclass and c.conname = v_cas.nom;
        if v_def is null then
            objet    := 'demandes_droits.' || v_cas.nom;
            anomalie := 'regle_du_texte_absente';
            detail   := 'Sans cette contrainte, ' || v_cas.effet || '.';
            return next;
        end if;
    end loop;

    /* ── SENS 4 : AUCUNE colonne d'échéance ───────────────────────────────────────── */
    /* L'échéance se dérive. Une colonne qui la rangerait resterait calculée sur
       l'ancienne date de réception le jour où celle-ci est corrigée. */
    if exists (
        select 1 from pg_attribute a
         where a.attrelid = 'demandes_droits'::regclass and a.attnum > 0 and not a.attisdropped
           and a.attname in ('echeance', 'echeance_reponse', 'date_limite', 'delai'))
    then
        objet    := 'demandes_droits';
        anomalie := 'echeance_stockee';
        detail   := 'Une colonne d''échéance est apparue. Le délai de l''article 12 §3 se '
                    'DÉRIVE de la date de réception (f_echeance_droits) : le ranger '
                    'laisserait, après correction de cette date, une échéance calculée sur '
                    'l''ancienne — sans que personne le sache. C''est l''arbitrage de '
                    'l''action 20.1, et il vaut ici mot pour mot.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_demandes_droits() is
    'Vérifie le dispositif de l''action 20.4. (1) ÉPROUVE f_echeance_droits() sur quatre '
    'cas témoins, dont le 31 janvier — une arithmétique en jours donnerait deux jours de '
    'retard que personne ne verrait ; (2) ÉPROUVE f_etat_demande_droits() sur six cas, '
    'dont celui qui porte l''action (le mois écoulé) et celui qui vérifie que la '
    'prorogation proroge RÉELLEMENT ; (3) les trois règles que le RGPD impose sont posées '
    'dans le schéma — un refus se motive et se date (art. 12 §4), une prorogation se '
    'notifie (art. 12 §3), une réponse est datée ; (4) aucune colonne ne RANGE l''échéance. '
    'Ne lit AUCUNE ligne d''une table cloisonnée (§41). Un schéma sain ne renvoie AUCUNE '
    'ligne.';

grant execute on function f_verifier_demandes_droits() to grc_app;

-- =====================================================================================
-- §6 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
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
        raise exception 'Le schéma est en défaut après 040 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, demandes d''exercice de droits comprises.';
end;
$$;

insert into migrations_schema (version, nom)
values ('040', 'les demandes d''exercice de droits (RGPD art. 15 à 22) : le registre, et '
               'le délai d''un mois DÉRIVÉ de la date de réception (20.4)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop table if exists demandes_droits;
--   drop function if exists f_demandes_droits_porte_la_portee();
--   drop function if exists f_verifier_demandes_droits();
--   drop function if exists f_etat_demande_droits(text, date, boolean);
--   drop function if exists f_echeance_droits(date, boolean);
--   delete from controles_schema where fonction = 'f_verifier_demandes_droits';
--   delete from colonnes_personnelles where table_nom = 'demandes_droits';
--   delete from migrations_schema where version = '040';
--   -- ⚠️ « demandes_droits » RESTE admise par type_entite : l'en retirer ferait rougir
--   --    f_verifier_declencheurs_pieces() sur une valeur sans table, et le journal
--   --    d'audit porte déjà des entrées qui la nomment — elles ne s'effacent pas.
--   commit;
-- =====================================================================================
