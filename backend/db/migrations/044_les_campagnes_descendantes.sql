-- =====================================================================================
--  044 — LES CAMPAGNES DESCENDANTES : LE GROUPE DEMANDE, LA FILIALE RÉPOND
--
--  §0  Le périmètre de la migration
--  §1  La table « campagnes » — le geste du GROUPE, et POURQUOI elle n'a pas de filiale_id
--  §2  La table « campagne_filiales » — la PART d'une filiale, cloisonnée
--  §3  Les deux états sont DÉRIVÉS, à un seul endroit
--  §4  Le domaine « type_entite » admet les deux tables
--  §5  Cloisonnement, l'ORACLE que « campagnes » n'ouvre pas, et l'interdit RETIRÉ
--  §6  L'installateur des déclencheurs « les pièces suivent leur porteur »
--  §7  Le garde-fou
--  §8  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Lot **L24** du `docs/PLAN_PRODUIT.md`, actions **24.1** et **24.2**. Le motif est
--  écrit dans le plan, et il est sévère : *« le socle Groupe/Filiale est le meilleur
--  atout architectural du produit, et rien ne permet au Groupe de lancer quoi que ce soit
--  vers ses filiales. La consolidation regarde ; elle ne demande pas. »*
--
--  Une campagne, c'est trois phrases : le Groupe demande **ce** référentiel, **à** ces
--  filiales, **pour** cette date. Puis il suit. Et chaque filiale ne voit que sa part.
--
--  ── ⚠️ CE QUE CES DEUX TABLES NE PORTENT PAS : L'AVANCEMENT ─────────────────────────
--
--  C'est la décision centrale, et c'est la même qu'aux dérogations (19.2), à l'horloge
--  (20.1), à l'AIPD (20.3), aux demandes de droits (20.4), à la chaîne DORA (21.1) et au
--  questionnaire fournisseur (21.2) :
--
--    *une colonne d'avancement doit être écrite, donc remise à jour ; un traitement qui
--    la remet peut ne pas tourner ; et le jour où il ne tourne pas, le produit affirme en
--    silence qu'une filiale a répondu quand elle n'a rien fait.*
--
--  L'avancement d'une filiale dans une campagne, c'est **ce qu'elle a évalué du
--  référentiel demandé** : il se compte dans `evaluations`, à l'instant où on regarde.
--  Rien à remettre à jour, rien à oublier.
--
--  ⚠️ **Et le produit ne rend AUCUN POURCENTAGE ici.** Le nombre de questions d'un
--  référentiel vit dans les catalogues du frontend (`js/data/ref_*.js`) : le serveur sait
--  compter ce qui est répondu, jamais ce qui reste. Rendre un taux obligerait à recopier
--  ce compte côté serveur — une seconde source qui se tromperait le jour où le
--  référentiel change. **L'écran, qui a le catalogue, fait la division.** C'est mot pour
--  mot la décision de l'action 21.2, et elle est citée plutôt que reprise à neuf.
--
--  ── ⚠️ ET CE QUE LE PRODUIT N'ENVOIE PAS ────────────────────────────────────────────
--
--  Rien. `ouverte_le` est un **fait consigné**, pas un ordre d'expédition. Les relances
--  de l'action 24.3 passent par le lot **L12, réutilisé et non réécrit** : l'échéance
--  d'une campagne entre dans l'échéancier existant, et la tâche de relance l'y trouve
--  comme elle trouve les huit autres sources. **Aucune route d'envoi neuve**, c'est le
--  critère d'acceptation lui-même.
-- =====================================================================================
-- Invocation :
--   psql -v ON_ERROR_STOP=1 -d cyber_grc -f 044_les_campagnes_descendantes.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
do $$
begin
    perform set_config('grc.utilisateur', 'migration-044', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LA TABLE « campagnes » — LE GESTE DU GROUPE
-- =====================================================================================
-- ⚠️ **AUCUN `filiale_id`, ET C'EST UN ARBITRAGE ÉCRIT** (`CONVENTIONS.md` §24) : une
-- table peut être non cloisonnée si, et seulement si, *elle porte la même chose pour tout
-- le groupe*. Une campagne est exactement cela : son intitulé, son référentiel et son
-- échéance sont les mêmes vus de Toulouse et vus de Hambourg. Ce qui diffère d'une
-- filiale à l'autre — qui répond, où elle en est — vit au §2, et c'est cloisonné.
--
-- ⚠️ **Conséquence à assumer, et le §24 la nomme** : cette table fait rougir **deux
-- contrôles** — l'essai du banc et le contrôle C93 de `verifier_cloisonnement.sql` — qui
-- relèvent la liste des tables non cloisonnées et la comparent à une liste arbitrée.
-- *C'est le dispositif qui fonctionne*, et le geste attendu est d'écrire pourquoi, puis
-- d'ajouter la table aux deux listes. Dans cet ordre.
--
-- ⚠️ **Ce qu'elle ne devient PAS pour autant : lisible en écriture par tout le monde.**
-- La lecture est ouverte (une filiale doit voir la campagne qui la concerne) ; l'écriture
-- exige `f_administration_groupe()`, comme `utilisateurs`. Et la lecture ne mentionne
-- SURTOUT PAS ce drapeau : un garde-fou de la `004` refuse qu'une politique de lecture
-- dépende d'un réglage d'administration, parce que ce serait un moyen d'élargir la
-- lecture par un réglage de session.

create table if not exists campagnes (
    id          id_metier   not null default f_generer_id('CAMP'),

    -- Le référentiel demandé, tel que le catalogue le nomme. ⚠️ Aucune clé étrangère :
    -- même motif qu'à la `043` — le catalogue est statique et vit dans le frontend, et
    -- une contrainte vers une table qui n'existe pas serait une promesse que le schéma ne
    -- peut pas tenir. Le lot **L26** (catalogues ouverts) changera cela.
    ref_id      id_metier   not null,

    intitule    text        not null,

    -- ── LES TROIS DATES, ET CE QUE CHACUNE VEUT DIRE ───────────────────────────────
    --
    -- ⚠️ Aucune n'est un déclencheur d'action : ce sont des **faits consignés**.
    -- `ouverte_le` dit « la campagne est lancée », pas « lance-la ».
    ouverte_le  date,
    echeance    date,
    close_le    date,

    notes       text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_campagnes primary key (id),

    -- ── LES DEUX RÈGLES DE CHRONOLOGIE, POSÉES DANS LE SCHÉMA ──────────────────────
    -- Motif du §8.1 : *une route ne voit que son chemin ; il y en a toujours un de
    -- plus* — l'import généralisé, la reprise d'un export, `psql`.
    --
    -- On ne CLÔT pas ce qu'on n'a pas ouvert.
    constraint ck_campagnes_cloture
        check (close_le is null or (ouverte_le is not null and close_le >= ouverte_le)),
    -- Une échéance ANTÉRIEURE à l'ouverture n'a jamais laissé le temps de répondre.
    constraint ck_campagnes_echeance
        check (echeance is null or ouverte_le is null or echeance >= ouverte_le),

    constraint ck_campagnes_intitule check (intitule <> '' and length(intitule) <= 300),
    constraint ck_campagnes_notes    check (notes is null or length(notes) <= 4000)
);

comment on table campagnes is
    'Campagne d''évaluation descendante (action 24.1) : le GROUPE demande un référentiel '
    'à N filiales, pour une date. ⚠️ Table de niveau Groupe, SANS filiale_id — son '
    'intitulé, son référentiel et son échéance sont les mêmes pour tout le groupe '
    '(CONVENTIONS.md §24, arbitrage écrit). Ce qui diffère par filiale vit dans '
    '« campagne_filiales ». ⚠️ Elle NE PORTE PAS l''avancement : il se compte dans '
    '« evaluations » à l''instant où on regarde, parce qu''une colonne d''avancement '
    'doit être remise à jour — et le jour où le traitement ne tourne pas, le produit '
    'affirmerait qu''une filiale a répondu quand elle n''a rien fait.';

comment on column campagnes.ouverte_le is
    'Date à laquelle la campagne A ÉTÉ lancée — un fait consigné par un humain, jamais '
    'une action du produit. Nul = brouillon : rien n''est demandé à personne.';
comment on column campagnes.echeance is
    'Date de retour attendue. ⚠️ Elle alimente l''échéancier existant '
    '(js/services/echeances.js) et, par lui, les relances du lot L12 — aucune route '
    'd''envoi neuve, c''est le critère de l''action 24.3.';

create index ix_campagnes_echeance on campagnes (echeance);

-- =====================================================================================
-- §2 — LA TABLE « campagne_filiales » — LA PART D'UNE FILIALE
-- =====================================================================================
-- ⚠️ **C'est ici que le cloisonnement se joue.** Une filiale doit voir *sa* part et
-- ignorer jusqu'à l'existence de celle des autres : le nombre de filiales convoquées est
-- une information de Groupe. Le §5 le tient par la politique, et la route par ce qu'elle
-- rend — les deux, parce qu'une seule des deux moitiés suffirait à ouvrir un oracle.

create table if not exists campagne_filiales (
    id          id_metier   not null default f_generer_id('CAMPF'),
    filiale_id  id_metier   not null,
    campagne_id id_metier   not null,

    -- Qui répond, dans cette filiale. Saisie libre, alimentée par l'annuaire côté écran
    -- (même choix qu'ailleurs : le nom reste du texte, §11 du DATA_MODEL).
    repondant   text,

    -- ── DEUX FAITS, CONSIGNÉS PAR LA FILIALE ──────────────────────────────────────
    accuse_le   date,
    termine_le  date,

    notes       text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_campagne_filiales primary key (id),

    -- ⚠️ Clé étrangère SIMPLE vers « campagnes », et c'est légitime : la cible n'est pas
    -- cloisonnée, donc il n'existe aucune ligne INVISIBLE qui pourrait la satisfaire —
    -- le danger que le §17.1 ferme n'existe pas ici.
    --
    -- ⚠️ **`restrict`, ET LA PREMIÈRE RÉDACTION AVAIT ÉCRIT `cascade`.** Le contrôle
    -- **C82** de `verifier_cloisonnement.sql` l'a refusée, et il avait raison : le §18.2
    -- est général — *une clé étrangère d'une table cloisonnée vers une table de niveau
    -- Groupe ne porte ni `cascade` ni `set null`*. Avec la cascade, supprimer UNE ligne
    -- de niveau Groupe détruisait des données DE FILIALES, y compris celles que l'auteur
    -- du geste ne peut pas lire — ici le travail de vingt filiales sur une campagne,
    -- effacé par la suppression de la demande.
    --
    -- Conséquence assumée : **supprimer une campagne exige de déconvoquer d'abord.** Le
    -- délien est un geste explicite, fait dans le périmètre de celui qui le fait — et
    -- c'est très exactement ce qu'on veut d'une demande à laquelle des filiales ont
    -- répondu.
    constraint fk_campagne_filiales_campagne
        foreign key (campagne_id) references campagnes (id) on delete restrict,
    constraint fk_campagne_filiales_filiale
        foreign key (filiale_id) references filiales (id) on delete restrict,

    constraint uq_campagne_filiales_id_filiale unique (id, filiale_id),

    -- ⚠️ UNE part par campagne et par filiale. L'unicité porte `filiale_id` EN TÊTE
    -- (§19.1) : sans lui, une filiale occuperait le couple d'une autre sur une campagne
    -- qu'elle ne voit pas (constat Q-2).
    constraint uq_campagne_filiales_part unique (filiale_id, campagne_id),

    -- On ne TERMINE pas avant d'avoir pris connaissance.
    constraint ck_campagne_filiales_chronologie
        check (termine_le is null or accuse_le is null or termine_le >= accuse_le),

    constraint ck_campagne_filiales_longueurs check (
        (repondant is null or length(repondant) <= 200)
        and (notes is null or length(notes) <= 4000))
);

comment on table campagne_filiales is
    'La part d''une filiale dans une campagne descendante (actions 24.1 et 24.2) : qui '
    'répond, et les deux faits qu''elle consigne — prise de connaissance, achèvement. '
    '⚠️ Cloisonnée : une filiale ne voit que SA part, et le nombre de filiales '
    'convoquées est une information de Groupe. ⚠️ Aucune colonne d''AVANCEMENT : il se '
    'compte dans « evaluations » sur le référentiel demandé, à l''instant où on regarde.';

comment on column campagne_filiales.repondant is
    'Nom de la personne qui répond pour cette filiale. Texte libre alimenté par '
    'l''annuaire côté écran — jamais une clé étrangère, pour la raison du DATA_MODEL '
    '§1.11 : les entités stockent le nom, l''annuaire ne fait que suggérer.';

create index ix_campagne_filiales_campagne on campagne_filiales (filiale_id, campagne_id);

-- ── Le registre de l'article 30 du produit (constats Q-295 / Q-296) ─────────────────
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('campagnes', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('campagnes', 'ref_id', 'non_personnelle', null, null, null, null,
   'Identifiant de référentiel : un catalogue, pas une personne.'),
  ('campagnes', 'intitule', 'non_personnelle', null, null, null, null,
   'Intitulé de la campagne : une phrase de gestion.'),
  ('campagnes', 'ouverte_le', 'non_personnelle', null, null, null, null,
   'Date d''ouverture : une date de gestion.'),
  ('campagnes', 'echeance', 'non_personnelle', null, null, null, null,
   'Date de retour attendue : une date de gestion.'),
  ('campagnes', 'close_le', 'non_personnelle', null, null, null, null,
   'Date de clôture : une date de gestion.'),
  ('campagnes', 'notes', 'personnelle',
   'Consigner le contexte de la campagne — décision de direction, périmètre, réserves.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom y figure souvent '
   '(« demandé par M. Ollier en comité »). Le remplacer détruirait la phrase, et cette '
   'phrase est la trace de la décision. Régime « signaler » : le produit montre '
   'l''emplacement, un humain tranche.'),
  ('campagne_filiales', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('campagne_filiales', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('campagne_filiales', 'campagne_id', 'non_personnelle', null, null, null, null,
   'Identifiant de la campagne à laquelle cette part se rattache.'),
  ('campagne_filiales', 'repondant', 'personnelle',
   'Savoir qui répond pour cette filiale, et à qui adresser une relance.',
   'Intérêt légitime', 1095, 'anonymiser',
   'NOM D''UNE PERSONNE IDENTIFIÉE, seul dans sa colonne : il se remplace par la mention '
   'neutre sans rien détruire de la campagne — c''est exactement le cas que la purge de '
   'la migration 026 sait traiter.'),
  ('campagne_filiales', 'accuse_le', 'non_personnelle', null, null, null, null,
   'Date de prise de connaissance : une date de gestion.'),
  ('campagne_filiales', 'termine_le', 'non_personnelle', null, null, null, null,
   'Date d''achèvement déclarée : une date de gestion.'),
  ('campagne_filiales', 'notes', 'personnelle',
   'Consigner ce que la filiale répond au Groupe sur l''avancement de sa campagne.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre : un nom de responsable local y figure souvent. Le remplacer '
   'détruirait la réponse faite au Groupe.')
on conflict (table_nom, colonne) do nothing;

-- La marque de provenance (migration `032`), à rattraper : ces tables naissent après elle.
alter table campagnes         add column if not exists provenance provenance_ligne not null;
alter table campagne_filiales add column if not exists provenance provenance_ligne not null;

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('campagnes', 'provenance', 'non_personnelle',
        'Vocabulaire clos : d''où vient la ligne (saisie / decouverte / reprise).'),
       ('campagne_filiales', 'provenance', 'non_personnelle',
        'Vocabulaire clos : d''où vient la ligne (saisie / decouverte / reprise).')
on conflict (table_nom, colonne) do nothing;

do $$
declare r record;
begin
    for r in select unnest(array['campagnes', 'campagne_filiales']) as t loop
        execute format('drop trigger if exists %I on %I', 'trg_' || r.t || '_provenance', r.t);
        execute format('create trigger %I before insert on %I for each row '
                       'execute function f_marquer_provenance()',
                       'trg_' || r.t || '_provenance', r.t);
        execute format('alter table %I enable always trigger %I', r.t, 'trg_' || r.t || '_provenance');

        execute format('drop trigger if exists %I on %I', 'trg_' || r.t || '_maj', r.t);
        execute format('create trigger %I before update on %I for each row '
                       'execute function f_maj_tracabilite()', 'trg_' || r.t || '_maj', r.t);
        execute format('alter table %I enable always trigger %I', r.t, 'trg_' || r.t || '_maj');
    end loop;
end;
$$;

-- ⚠️ On APPELLE l'installateur, on ne recopie pas son déclencheur (§40).
select f_poser_tracabilite_insertion();

-- =====================================================================================
-- §3 — LES DEUX ÉTATS SONT DÉRIVÉS, À UN SEUL ENDROIT
-- =====================================================================================
-- `stable` et non `immutable` : elles lisent `current_date`.

create or replace function f_etat_campagne(
    p_ouverte_le date,
    p_echeance   date,
    p_close_le   date
)
returns text
    language sql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        -- Close : l'affaire est terminée, et l'échéance n'y change plus rien. ⚠️ Premier
        -- cas testé À DESSEIN — une campagne close en retard est close, et l'afficher
        -- « en retard » enverrait relancer vingt filiales pour rien. C'est la leçon de
        -- f_etat_questionnaire(), et elle est reprise ici volontairement.
        when p_close_le is not null then 'close'
        -- Jamais ouverte : c'est un brouillon, et non un retard. Un produit qui
        -- compterait les brouillons parmi les retards fabriquerait des alertes que son
        -- utilisateur s'est infligées à lui-même.
        when p_ouverte_le is null then 'brouillon'
        when p_echeance is null then 'en_cours'
        when p_echeance < current_date then 'en_retard'
        else 'en_cours'
    end;
$$;

comment on function f_etat_campagne(date, date, date) is
    'L''état d''une campagne descendante, DÉRIVÉ de ses dates — jamais stocké '
    '(action 24.1). Quatre valeurs : close, brouillon, en_cours, en_retard. ⚠️ « close » '
    'est testé EN PREMIER : une campagne close en retard est close, et l''afficher en '
    'retard enverrait relancer vingt filiales pour rien.';

create or replace function f_etat_part_campagne(
    p_termine_le date,
    p_echeance   date,
    p_close_le   date
)
returns text
    language sql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        -- La filiale a fini : rien ne la concerne plus, même si la campagne traîne.
        when p_termine_le is not null then 'terminee'
        -- La campagne est close et la filiale n'a pas fini : ce n'est plus un retard
        -- qu'on relance, c'est un MANQUE qu'on constate. La nuance a un prix : appeler
        -- « en retard » ce qui ne peut plus être fait entretient une liste que personne
        -- ne peut vider.
        when p_close_le is not null then 'non_faite'
        when p_echeance is null then 'en_cours'
        when p_echeance < current_date then 'en_retard'
        else 'en_cours'
    end;
$$;

comment on function f_etat_part_campagne(date, date, date) is
    'L''état de la PART d''une filiale dans une campagne, DÉRIVÉ (action 24.2). Cinq '
    'valeurs : terminee, non_faite, en_cours, en_retard. ⚠️ « non_faite » existe parce '
    'qu''une campagne close qu''une filiale n''a pas faite n''est plus un retard qu''on '
    'relance : c''est un manque qu''on constate. Appeler « en retard » ce qui ne peut '
    'plus être fait entretient une liste que personne ne peut vider.';

grant execute on function f_etat_campagne(date, date, date) to grc_app;
grant execute on function f_etat_part_campagne(date, date, date) to grc_app;

-- =====================================================================================
-- §4 — LE DOMAINE « type_entite » ADMET LES DEUX TABLES
-- =====================================================================================
-- Le piège du §40.1 : une table absente du domaine est INCRÉABLE, toute création écrivant
-- au journal. On LIT le prédicat appliqué, et l'on refuse d'agir s'il a changé.

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
    if position('''campagnes''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà les campagnes : rejeu, rien à faire.';
        return;
    end if;
    if position('''questionnaire_reponses''' in v_predicat) = 0 then
        raise exception 'La valeur « questionnaire_reponses » est introuvable dans le '
                        'prédicat appliqué de type_entite_check : son texte a changé, et '
                        'la substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, '''questionnaire_reponses''',
                      '''questionnaire_reponses'', ''campagnes'', ''campagne_filiales''');

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais les deux tables de la campagne descendante.';
end;
$$;

-- =====================================================================================
-- §5 — CLOISONNEMENT, ET L'ORACLE QUE « campagnes » N'OUVRE PAS
-- =====================================================================================
-- ⚠️ **Deux régimes, et il faut lire pourquoi.**
--
-- `campagnes` est de niveau Groupe : sa LECTURE est ouverte — une filiale doit voir la
-- campagne qui la convoque, son intitulé, son référentiel et sa date. Son ÉCRITURE exige
-- `f_administration_groupe()`, exactement comme `utilisateurs`.
--
-- ⚠️ **Ce que la lecture ouverte NE dit PAS** : qui d'autre est convoqué. C'est au §2
-- que cette information vit, et elle est cloisonnée. Une filiale qui lit `campagnes` voit
-- donc *une demande*, jamais *la liste des destinataires* — et c'est délibéré : le nombre
-- de filiales convoquées, et leur avancement respectif, sont des informations de Groupe.
-- Un essai le mesure, et il **rougit si la clause tombe** (critère de l'action 24.1).
--
-- ⚠️ **La lecture ne mentionne SURTOUT PAS le drapeau d'administration** : un garde-fou
-- de la `004` le refuse, au motif qu'un réglage de session élargirait alors la LECTURE.

alter table campagnes         enable row level security;
alter table campagnes         force  row level security;
alter table campagne_filiales enable row level security;
alter table campagne_filiales force  row level security;

drop policy if exists pol_campagnes_lecture     on campagnes;
drop policy if exists pol_campagnes_ajout       on campagnes;
drop policy if exists pol_campagnes_maj         on campagnes;
drop policy if exists pol_campagnes_suppression on campagnes;

create policy pol_campagnes_lecture on campagnes for select using (true);
create policy pol_campagnes_ajout on campagnes for insert
    with check (f_administration_groupe());
create policy pol_campagnes_maj on campagnes for update
    using (f_administration_groupe()) with check (f_administration_groupe());
create policy pol_campagnes_suppression on campagnes for delete
    using (f_administration_groupe());

comment on policy pol_campagnes_lecture on campagnes is
    'Lecture OUVERTE : une filiale doit voir la campagne qui la convoque. ⚠️ Ce qu''elle '
    'ne voit pas est ailleurs — la LISTE des filiales convoquées et leur avancement '
    'vivent dans « campagne_filiales », qui est cloisonnée. Le nombre de filiales '
    'convoquées est une information de Groupe.';

drop policy if exists pol_campagne_filiales_lecture     on campagne_filiales;
drop policy if exists pol_campagne_filiales_ajout       on campagne_filiales;
drop policy if exists pol_campagne_filiales_maj         on campagne_filiales;
drop policy if exists pol_campagne_filiales_suppression on campagne_filiales;

create policy pol_campagne_filiales_lecture on campagne_filiales for select
    using (filiale_id = any (f_filiales_lecture()));
-- ⚠️ L'AJOUT est le geste du GROUPE (convoquer une filiale), et la filiale CIBLE n'est
--    pas la filiale active de celui qui convoque : `f_filiale_ecriture()` serait donc
--    faux ici. On exige le drapeau d'administration, et la cible doit être une filiale
--    RÉELLE — la clé étrangère s'en charge.
create policy pol_campagne_filiales_ajout on campagne_filiales for insert
    with check (filiale_id = f_filiale_ecriture() or f_administration_groupe());
-- ⚠️ LA MISE À JOUR EST LE SEUL POINT SUBTIL DE CETTE MIGRATION. Deux écrivains
--    légitimes, et ils n'ont pas le même droit :
--      · la FILIALE consigne sa prise de connaissance, son répondant, son achèvement —
--        dans SA part, et nulle part ailleurs ;
--      · le GROUPE corrige une convocation.
--    D'où la disjonction. Sans la moitié gauche, une filiale ne pourrait pas répondre à
--    ce qu'on lui demande ; sans la moitié droite, le Groupe ne pourrait pas rectifier.
create policy pol_campagne_filiales_maj on campagne_filiales for update
    using (filiale_id = f_filiale_ecriture() or f_administration_groupe())
    with check (filiale_id = f_filiale_ecriture() or f_administration_groupe());
-- ⚠️ LA SUPPRESSION D'UNE PART, ET L'INTERDIT QUI A ÉTÉ ÉCRIT PUIS RETIRÉ.
--
-- Première rédaction : *« la déconvocation est un geste de Groupe ; une filiale ne se
-- retire pas elle-même d'une campagne — elle pourrait sinon effacer la demande plutôt que
-- d'y répondre »*. L'interdit était posé par un déclencheur `before delete` qui refusait
-- hors `f_administration_groupe()`, avec son message et son SQLSTATE.
--
-- ⚠️ **IL RENDAIT LA REPRISE « REMPLACER » IMPOSSIBLE**, et c'est le banc qui l'a dit :
-- `purgerFiliale()` vide **toutes** les tables cloisonnées de la filiale active — c'est
-- ainsi qu'on restaure une sauvegarde —, et elle n'élève aucun drapeau d'administration
-- (arbitrage de la porte S2 : la reprise passe le périmètre de la session tel quel). Le
-- déclencheur refusait donc la purge, et restaurer un export d'une filiale devenait
-- impossible dès qu'elle avait été convoquée une fois.
--
-- **C'est mot pour mot la classe des trois conflits de la migration `041`** — l'ajout seul
-- de la main courante contre un balayage qui supprime — et l'arbitrage est le même :
-- **la capacité de restaurer une sauvegarde gagne.** Perdre le droit de rendre à une
-- filiale l'état de son dernier export serait un défaut d'une autre gravité que la
-- possibilité, pour elle, de se retirer d'une campagne.
--
-- ── CE QUI PROTÈGE LE GROUPE À LA PLACE, ET QU'IL FAUT DIRE ────────────────────────
--
--  1. **le journal** : une suppression de part est une écriture tracée, inaltérable,
--     conservée trois ans — le Groupe voit QUI a retiré QUOI, et quand ;
--  2. **la reconvocation coûte un geste** : `POST /api/campagnes/:id/convoquer` repose la
--     part, et l'unicité (filiale, campagne) fait que la reposer deux fois est sans effet ;
--  3. **l'avancement ne se perd pas** : il se compte dans `evaluations`, que la part ne
--     porte pas. Retirer sa part n'efface donc AUCUNE réponse — cela retire la demande de
--     la liste, pas le travail fait.
--
-- ⚠️ Et ce qui reste vrai, dit sans enjolivure : **une filiale peut se retirer d'une
-- campagne, et le Groupe ne le verra qu'au journal.** C'est une réserve, elle est écrite,
-- et le remède propre — un drapeau que la reprise déclare pour distinguer « je restaure »
-- de « je me retire » — appartient à la couche de reprise, pas à cette migration.
create policy pol_campagne_filiales_suppression on campagne_filiales for delete
    using (filiale_id = f_filiale_ecriture() or f_administration_groupe());

comment on policy pol_campagne_filiales_maj on campagne_filiales is
    'DEUX écrivains légitimes, et c''est la seule subtilité de la 044 : la FILIALE '
    'consigne sa prise de connaissance, son répondant et son achèvement dans SA part ; '
    'le GROUPE corrige une convocation. Sans la moitié gauche, une filiale ne pourrait '
    'pas répondre à ce qu''on lui demande.';

comment on policy pol_campagne_filiales_suppression on campagne_filiales is
    'Supprimer sa part reste OUVERT à la filiale, et ce n''est pas un relâchement : '
    '« purgerFiliale() » vide les tables cloisonnées de la filiale active sans élever de '
    'drapeau d''administration, et c''est ainsi qu''on restaure une sauvegarde. Un '
    'interdit ici rendrait la reprise « remplacer » impossible dès qu''une filiale a été '
    'convoquée une fois — la classe des trois conflits de la migration 041, tranchée de '
    'la même façon : la capacité de restaurer gagne. ⚠️ Ce qui protège le Groupe est le '
    'JOURNAL (une suppression est tracée, inaltérable, trois ans), la reconvocation qui '
    'coûte un geste, et le fait que l''avancement vit dans « evaluations » — retirer sa '
    'part n''efface aucune réponse.';

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant select, insert, update, delete on campagnes to grc_app';
        execute 'grant select, insert, update, delete on campagne_filiales to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on campagnes to grc_lecture';
        execute 'grant select on campagne_filiales to grc_lecture';
    end if;
end;
$$;

select f_armer_declencheurs();

-- =====================================================================================
-- §6 — L'INSTALLATEUR DES DÉCLENCHEURS « LES PIÈCES SUIVENT LEUR PORTEUR »
-- =====================================================================================
-- ⚠️ **L'ORDRE EST UNE CONTRAINTE** (§40.2) : le prédicat de découverte exige que la
-- politique de SUPPRESSION existe. Appelée avant le §5, la fonction ne verrait pas les
-- tables neuves et les laisserait démunies **sans une erreur**.

do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s).', v_poses;
end;
$$;

-- =====================================================================================
-- §7 — LE GARDE-FOU
-- =====================================================================================
-- ⚠️ Il **ÉPROUVE** les deux dérivations (§39.1) au lieu de lire le texte des fonctions :
-- un garde qui vérifierait qu'elles « existent » passerait au vert sur une version qui
-- rend « terminee » pour tout le monde — c'est-à-dire sur celle qui déclare vingt
-- filiales à jour quand aucune n'a répondu.
--
-- ⚠️ Et il nomme les pièces UNE PAR UNE (§39.7) : un garde de CLASSE ne voit pas la
-- disparition d'une PAIRE. La barrière qui compte ici est celle de la SUPPRESSION d'une
-- part — la déconvocation réservée au Groupe —, et elle se garde nommément.

create or replace function f_verifier_campagnes()
returns table (objet text, anomalie text, detail text)
    language plpgsql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_cas jsonb := jsonb_build_array(
        jsonb_build_object('ouverte', null, 'echeance', '2000-01-01', 'close', null,
                           'attendu', 'brouillon',
                           'produit', 'un brouillon compté parmi les retards — une alerte '
                                      'que l''utilisateur s''est infligée à lui-même'),
        jsonb_build_object('ouverte', '2000-01-01', 'echeance', '2000-02-01', 'close', '2000-03-01',
                           'attendu', 'close',
                           'produit', 'vingt filiales relancées pour une campagne terminée'),
        jsonb_build_object('ouverte', '2000-01-01', 'echeance', '2000-02-01', 'close', null,
                           'attendu', 'en_retard',
                           'produit', 'un retard invisible, dans l''écran qui sert à le voir'),
        jsonb_build_object('ouverte', '2000-01-01', 'echeance', null, 'close', null,
                           'attendu', 'en_cours',
                           'produit', 'une campagne sans échéance déclarée en retard'),
        jsonb_build_object('ouverte', '2000-01-01', 'echeance', (current_date + 30)::text, 'close', null,
                           'attendu', 'en_cours',
                           'produit', 'une campagne à venir déclarée en retard')
    );
    v_cas_parts jsonb := jsonb_build_array(
        jsonb_build_object('termine', '2000-01-01', 'echeance', '1999-01-01', 'close', null,
                           'attendu', 'terminee',
                           'produit', 'une filiale qui a répondu, relancée quand même'),
        jsonb_build_object('termine', null, 'echeance', '2000-01-01', 'close', '2000-02-01',
                           'attendu', 'non_faite',
                           'produit', 'un manque constaté présenté comme un retard à relancer, '
                                      'dans une liste que personne ne peut plus vider'),
        jsonb_build_object('termine', null, 'echeance', '2000-01-01', 'close', null,
                           'attendu', 'en_retard',
                           'produit', 'une filiale en retard que le Groupe ne voit pas'),
        jsonb_build_object('termine', null, 'echeance', null, 'close', null,
                           'attendu', 'en_cours',
                           'produit', 'une part sans échéance déclarée en retard')
    );
    v_un    jsonb;
    v_rendu text;
    -- ⚠️ Les six pièces, nommées UNE PAR UNE (§39.7).
    v_pieces jsonb := jsonb_build_array(
        jsonb_build_object('table', 'campagne_filiales', 'contrainte', 'uq_campagne_filiales_part',
                           'quoi', 'l''unicité (filiale, campagne)',
                           'produit', 'une filiale convoquée DEUX FOIS à la même campagne, et '
                                      'deux avancements contradictoires pour une seule demande'),
        jsonb_build_object('table', 'campagne_filiales', 'contrainte', 'fk_campagne_filiales_campagne',
                           'quoi', 'le rattachement à la campagne, en « restrict » (§18.2)',
                           'produit', 'soit des parts orphelines, soit — si elle revient en '
                                      'cascade — la destruction du travail de vingt filiales '
                                      'par la suppression d''UNE ligne de niveau Groupe'),
        jsonb_build_object('table', 'campagne_filiales', 'contrainte', 'ck_campagne_filiales_chronologie',
                           'quoi', 'on ne termine pas avant d''avoir pris connaissance',
                           'produit', 'une chronologie impossible, dans une pièce d''audit'),
        jsonb_build_object('table', 'campagnes', 'contrainte', 'ck_campagnes_cloture',
                           'quoi', 'on ne clôt pas ce qu''on n''a pas ouvert',
                           'produit', 'une campagne close sans avoir jamais été lancée'),
        jsonb_build_object('table', 'campagnes', 'contrainte', 'ck_campagnes_echeance',
                           'quoi', 'une échéance postérieure à l''ouverture',
                           'produit', 'une échéance déjà dépassée à l''instant du lancement')
    );
    v_piece jsonb;
begin
    if to_regprocedure('public.f_etat_campagne(date, date, date)') is null
       or to_regprocedure('public.f_etat_part_campagne(date, date, date)') is null then
        objet    := 'f_etat_campagne';
        anomalie := 'derivation_campagne_absente';
        detail   := 'Une des deux fonctions qui disent où en est une campagne a disparu. '
                    'Sans elles, « en retard » redeviendrait une colonne — c''est-à-dire '
                    'une valeur que quelque chose doit remettre, et qui ment le jour où '
                    'ce quelque chose ne tourne pas.';
        return next;
        return;
    end if;

    for v_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := f_etat_campagne((v_un ->> 'ouverte')::date, (v_un ->> 'echeance')::date,
                                   (v_un ->> 'close')::date);
        if v_rendu is distinct from (v_un ->> 'attendu') then
            objet    := 'f_etat_campagne';
            anomalie := 'derivation_campagne_fausse';
            detail   := format(
                'Ouverte « %s », échéance « %s », close « %s » : la fonction rend « %s » '
                'au lieu de « %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE la '
                'dérivation sur des valeurs témoins — il ne lit pas le texte de la '
                'fonction (§39.1).',
                coalesce(v_un ->> 'ouverte', '(jamais)'),
                coalesce(v_un ->> 'echeance', '(aucune)'),
                coalesce(v_un ->> 'close', '(ouverte)'),
                coalesce(v_rendu, '(nul)'), v_un ->> 'attendu', v_un ->> 'produit');
            return next;
        end if;
    end loop;

    for v_un in select * from jsonb_array_elements(v_cas_parts) loop
        v_rendu := f_etat_part_campagne((v_un ->> 'termine')::date, (v_un ->> 'echeance')::date,
                                        (v_un ->> 'close')::date);
        if v_rendu is distinct from (v_un ->> 'attendu') then
            objet    := 'f_etat_part_campagne';
            anomalie := 'derivation_part_fausse';
            detail   := format(
                'Terminée « %s », échéance « %s », campagne close « %s » : la fonction '
                'rend « %s » au lieu de « %s ». Ce que cela produit : %s.',
                coalesce(v_un ->> 'termine', '(pas encore)'),
                coalesce(v_un ->> 'echeance', '(aucune)'),
                coalesce(v_un ->> 'close', '(ouverte)'),
                coalesce(v_rendu, '(nul)'), v_un ->> 'attendu', v_un ->> 'produit');
            return next;
        end if;
    end loop;

    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.' || (v_piece ->> 'table'))
               and c.conname = (v_piece ->> 'contrainte'))
        then
            objet    := v_piece ->> 'table';
            anomalie := 'campagne_piece_manquante';
            detail   := format('%s a disparu (%s). Ce que cela produit : %s.',
                               v_piece ->> 'quoi', v_piece ->> 'contrainte',
                               v_piece ->> 'produit');
            return next;
        end if;
    end loop;

    -- ⚠️ LA BARRIÈRE NOMMÉE, ET ELLE GARDE L'INVERSE DE CE QU'ON CROIRAIT : que la
    --    SUPPRESSION reste OUVERTE à la filiale.
    --
    --    Une politique refermée sur le seul Groupe paraîtrait plus sûre. Elle rendrait la
    --    reprise « remplacer » IMPOSSIBLE — `purgerFiliale()` vide les tables cloisonnées
    --    de la filiale active sans élever aucun drapeau d'administration —, et le produit
    --    perdrait la capacité de rendre à une filiale l'état de son dernier export. C'est
    --    la classe des trois conflits de la `041`, et le banc l'a trouvée en une passe.
    --
    --    Un garde de CLASSE ne verrait pas ce resserrement : « toute table cloisonnée a
    --    quatre politiques » resterait vrai (§39.7). D'où ce garde nommé.
    if not exists (
        select 1 from pg_policy p
         where p.polrelid = to_regclass('public.campagne_filiales')
           and p.polcmd = 'd'
           and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%f_filiale_ecriture%')
    then
        objet    := 'campagne_filiales';
        anomalie := 'purge_filiale_bloquee';
        detail   := 'La politique de SUPPRESSION de campagne_filiales ne mentionne plus '
                    'f_filiale_ecriture() : une filiale ne peut plus vider ses propres '
                    'parts, donc « purgerFiliale() » échoue, donc la reprise « remplacer » '
                    'est impossible dès qu''une filiale a été convoquée une fois. Restaurer '
                    'une sauvegarde est une capacité qu''on ne troque pas contre un '
                    'interdit de confort (classe des trois conflits de la 041).';
        return next;
    end if;

    -- ⚠️ L'AUTRE MOITIÉ, et elle est nécessaire : la mise à jour doit RESTER ouverte à la
    --    filiale. Une politique refermée sur le seul Groupe empêcherait une filiale de
    --    répondre à ce qu'on lui demande — un défaut que rien ne signalerait, puisque le
    --    produit se contenterait de ne rien enregistrer.
    if not exists (
        select 1 from pg_policy p
         where p.polrelid = to_regclass('public.campagne_filiales')
           and p.polcmd = 'w'
           and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%f_filiale_ecriture%')
    then
        objet    := 'campagne_filiales';
        anomalie := 'reponse_filiale_fermee';
        detail   := 'La politique de MISE À JOUR de campagne_filiales ne mentionne plus '
                    'f_filiale_ecriture() : une filiale ne peut plus consigner sa prise '
                    'de connaissance ni son achèvement dans sa propre part. Le produit ne '
                    'dirait rien — il n''enregistrerait simplement pas.';
        return next;
    end if;
end;
$$;

comment on function f_verifier_campagnes() is
    'Garde-fou des campagnes descendantes (L24, migration 044). Il ÉPROUVE les deux '
    'dérivations sur neuf cas témoins — dont les deux ordres qui comptent : « close » '
    'avant l''échéance, et « non_faite » plutôt que « en retard » quand la campagne est '
    'close —, nomme les cinq pièces du schéma UNE PAR UNE (§39.7), et garde NOMMÉMENT '
    'les deux moitiés de la politique de mise à jour : la déconvocation réservée au '
    'Groupe, et la réponse laissée à la filiale. Découvert par '
    'f_decouvrir_controles_schema().';

grant execute on function f_verifier_campagnes() to grc_app;

-- =====================================================================================
-- §7 bis — LES DEUX LISTES QUI DOIVENT RANGER « campagnes »
-- =====================================================================================
-- ⚠️ **CETTE SECTION EXISTE PARCE QUE DEUX GARDE-FOUS ONT REFUSÉ LA MIGRATION**, et c'est
-- exactement ce que le `CONVENTIONS.md` §24 annonce : *« une migration qui ajoute une table
-- sans filiale_id casse ces deux contrôles, et c'est NORMAL. Le geste attendu est d'écrire
-- pourquoi ici, puis d'ajouter la table aux deux listes — dans cet ordre. »*
--
-- Ce qu'ils ont dit, mot pour mot, au premier essai d'application :
--
--   campagnes : lecture_non_cloisonnee   — « toutes les filiales se lisent entre elles »
--   campagnes : ecriture_non_cloisonnee  — « une filiale peut écrire chez une autre »
--   campagnes : table_sans_filiale_non_rangee — « rien ne dit QUI l'écrit »
--
-- Les trois sont justes **en tant que questions**, et la réponse est écrite ci-dessous.
-- Aucune n'est contournée : la table est DÉCLARÉE, avec son motif, aux deux endroits.
--
-- ⚠️ **Et les deux fonctions sont reprises TELLES QU'ELLES SONT APPLIQUÉES**
-- (`pg_get_functiondef`, pas une recopie de fichier), avec une seule différence chacune.
-- Une migration appliquée ne se réécrit jamais : elle se corrige dans la suivante (§23).
-- C'est ce que la `005` avait fait de la `004`, et la `026` de la `005`, pour ce même
-- tableau.

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
        'campagnes'
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
-- §8 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
-- =====================================================================================

select f_consigner_controles_schema();

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 044 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, campagnes comprises.';
end;
$$;

insert into migrations_schema (version, nom)
values ('044', 'les campagnes descendantes : le GROUPE demande un référentiel à N '
               'filiales, chaque filiale ne voit que SA part, et l''avancement se '
               'COMPTE dans les évaluations au lieu d''être stocké (24.1, 24.2)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_campagnes();
--   delete from controles_schema where fonction = 'f_verifier_campagnes';
--   drop table if exists campagne_filiales;
--   drop table if exists campagnes;
--   drop function if exists f_etat_campagne(date, date, date);
--   drop function if exists f_etat_part_campagne(date, date, date);
--   delete from colonnes_personnelles where table_nom in ('campagnes', 'campagne_filiales');
--   delete from migrations_schema where version = '044';
--   commit;
-- ⚠️ Annuler DÉTRUIT la trace de ce que le Groupe a demandé à ses filiales, et de ce que
--    chacune a répondu. Exporter d'abord.
-- =====================================================================================
