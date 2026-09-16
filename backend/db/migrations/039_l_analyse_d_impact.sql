-- =====================================================================================
--  039 — L'ANALYSE D'IMPACT (AIPD) : elle POINTE le registre, elle ne le recopie pas
-- -------------------------------------------------------------------------------------
--  §0  Le périmètre de lecture de la migration
--  §1  Le domaine `type_entite` admet « analyses_impact »
--  §2  L'ÉTAT SE DÉRIVE — `f_etat_aipd()`
--  §3  La table `analyses_impact`
--  §4  La barrière de portée : local → Groupe ouvert, l'inverse fermé
--  §5  La table de liaison `analyse_mesures` — les contrôles qui traitent les risques
--  §6  Cloisonnement
--  §7  Le garde-fou
--  §8  Consignation, vérification, enregistrement
--
-- -------------------------------------------------------------------------------------
--  POURQUOI — action 20.3 du `docs/PLAN_PRODUIT.md` (lot L20)
--
--  L'article 35 du RGPD impose une **analyse d'impact relative à la protection des
--  données** dès qu'un traitement est susceptible d'engendrer un risque élevé. Le produit
--  tenait le registre de l'article 30 depuis le lot RGPD ; il ne savait rien dire de
--  l'article 35 — ni qu'une AIPD est due, ni où elle en est, ni quand la revoir.
--
--  ── LE CRITÈRE D'ACCEPTATION, ET IL EST NÉGATIF ─────────────────────────────────────
--
--  *« Le registre art. 30 existant n'est pas dupliqué : l'AIPD POINTE le traitement. »*
--  C'est la contrainte principale de cette action. Une AIPD qui recopierait la finalité,
--  les catégories de données et les destinataires ferait exister **deux réponses à la
--  même question** dans un outil produit en audit — et la seconde vieillirait sans que
--  personne le sache. `traitement_id` est donc `not null` : une AIPD sans son traitement
--  n'est pas une AIPD, c'est le doublon qu'on refuse.
--
--  ── L'ÉTAT NE SE STOCKE PAS ─────────────────────────────────────────────────────────
--
--  Même arbitrage qu'aux dérogations (19.2) et à l'horloge réglementaire (20.1) : une
--  AIPD **validée** dont la date de revue est passée est « à revoir », et elle le devient
--  **toute seule**, sans qu'aucun traitement ait à repasser. Stocker l'état obligerait
--  quelque chose à le remettre à jour ; le jour où ce quelque chose ne passe pas, le
--  produit affirme une conformité qui n'existe plus — en silence, et dans le domaine où
--  le silence coûte le plus cher.
--
--  ⚠️ **Ce que cette migration NE FAIT PAS, et le dire est la moitié du travail.** Elle
--  ne DÉCIDE pas qu'une AIPD est requise. Les trois cas de l'article 35 §3 — profilage
--  systématique, catégories particulières à grande échelle, surveillance systématique
--  d'un lieu public — ne sont pas tous représentables avec ce que le registre porte
--  aujourd'hui. Le produit rend donc une **présomption** sur le seul critère qu'il sait
--  mesurer (`traitements.donnees_sensibles`), et l'écran la présente comme telle. Un
--  logiciel qui trancherait « AIPD non requise » sur une donnée qu'il ne détient pas
--  rendrait un service pire que rien.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LECTURE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- `CONVENTIONS.md` §42 : le périmètre de LECTURE se pose pour le groupe entier. Cette
-- migration ne reprend aucune donnée — elle ne crée que des tables vides —, mais le §1
-- lit une contrainte appliquée et le §8 joue `f_verifier_schema()`.
-- =====================================================================================

select set_config('grc.utilisateur', 'migration-039', true);
select set_config('grc.filiales',
                  (select coalesce(string_agg(id, ','), '') from filiales), true);

-- =====================================================================================
-- §1 — LE DOMAINE `type_entite` ADMET « analyses_impact »
-- -------------------------------------------------------------------------------------
-- ⚠️ `CONVENTIONS.md` §40.1, premier des trois mécanismes. Sans cette déclaration la
-- table est **INCRÉABLE** : toute création écrit au journal, et `journal_audit.entite_type`
-- porte ce domaine. Le refus arrive en « 400 — Une valeur de l'enregistrement n'est pas
-- admise », qui ne désigne rien.
--
-- ⚠️ **Le prédicat est LU, jamais recopié** : on repart de la contrainte APPLIQUÉE et l'on
-- refuse si la valeur qui sert de point d'ancrage a disparu. Une liste réécrite ici
-- perdrait en silence les valeurs ajoutées entre-temps — c'est le dispositif du §3 bis de
-- la `035`, repris à l'identique, **nom de contrainte compris**.
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
        raise exception 'type_entite_check est introuvable : la 001 n''a pas été appliquée, '
                        'et cette migration n''a rien à étendre.';
    end if;
    if position('''analyses_impact''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà « analyses_impact » : rejeu, rien à faire.';
        return;
    end if;
    -- Le modèle : la dernière valeur ajoutée, par la `035`. Son absence signifie que le
    -- texte a changé depuis, et l'insertion à l'aveugle est refusée plutôt qu'appliquée
    -- de travers (motif du §4 de la `027`).
    if position('''derogations''' in v_predicat) = 0 then
        raise exception 'La valeur « derogations » est introuvable dans le prédicat appliqué '
                        'de type_entite_check : son texte a changé, et la substitution à '
                        'l''aveugle est refusée.';
    end if;

    v_neuf := replace(v_predicat, '''derogations''', '''derogations'', ''analyses_impact''');

    -- ⚠️ **LE NOM DE LA CONTRAINTE NE CHANGE PAS**, et ce n'est pas une coquetterie : la
    -- première rédaction la recréait sous « ck_type_entite », et le contrôle de morsure
    -- de `test/base/gardes-eprouves.test.mjs` — qui VIDE le domaine pour vérifier que le
    -- garde le voit — la cherchait sous son nom d'origine. Elle ne le trouvait plus, et
    -- la mutation ne mutait plus rien : *un essai qui ne peut plus casser ce qu'il éprouve
    -- passe au vert sans rien mesurer* (motif Q-210).
    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais « analyses_impact ».';
end;
$$;

-- =====================================================================================
-- §2 — L'ÉTAT SE DÉRIVE
-- -------------------------------------------------------------------------------------
-- Un seul endroit, `immutable`, appelé par la route et par le banc. Cinq états, et le
-- discriminant qui compte est le quatrième : **`a_revoir`**, qu'aucune écriture ne pose.
-- =====================================================================================

create or replace function f_etat_aipd(p_statut text, p_revoir_le date)
returns text
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        when p_statut = 'non_requise' then 'non_requise'
        when p_statut = 'requise'     then 'a_faire'
        when p_statut = 'en_cours'    then 'en_cours'
        -- ⚠️ ICI, ET C'EST TOUTE L'ACTION : une AIPD validée dont la revue est échue
        -- redevient « à revoir » SANS qu'aucun traitement ait à repasser. L'absence de
        -- traitement n'est pas une économie : c'est la garantie.
        when p_statut = 'validee' and p_revoir_le is not null and p_revoir_le < current_date
             then 'a_revoir'
        when p_statut = 'validee' then 'valide'
        else 'a_faire'
    end;
$$;

comment on function f_etat_aipd(text, date) is
    'L''état d''une analyse d''impact, DÉRIVÉ de son statut et de sa date de revue — jamais '
    'stocké (action 20.3). Cinq valeurs : non_requise, a_faire, en_cours, valide, '
    'a_revoir. ⚠️ « a_revoir » n''est posé par AUCUNE écriture : une AIPD validée dont la '
    'revue est échue le devient toute seule. Stocker l''état obligerait un traitement à '
    'repasser, et le jour où il ne passe pas le produit affirme une conformité qui '
    'n''existe plus. Même arbitrage qu''à f_etat_derogation (19.2).';

grant execute on function f_etat_aipd(text, date) to grc_app;

-- La PRÉSOMPTION — et elle ne tranche rien. Voir l'en-tête : le registre ne porte pas de
-- quoi décider des trois cas de l'article 35 §3. Le produit dit ce qu'il sait, et l'écran
-- écrit qu'il s'agit d'une présomption.
create or replace function f_aipd_presumee_requise(p_donnees_sensibles boolean)
returns boolean
    language sql
    immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select coalesce(p_donnees_sensibles, false);
$$;

comment on function f_aipd_presumee_requise(boolean) is
    'Présomption — PAS une décision. Vrai quand le traitement porte des catégories '
    'particulières de données (RGPD art. 9), qui est le seul des trois cas de l''article '
    '35 §3 que le registre de l''article 30 permette de mesurer aujourd''hui. ⚠️ Un '
    'logiciel qui trancherait « AIPD non requise » sur une donnée qu''il ne détient pas '
    'rendrait un service pire que rien : l''écran présente ceci comme une présomption, et '
    'c''est le responsable de traitement qui décide.';

grant execute on function f_aipd_presumee_requise(boolean) to grc_app;

-- =====================================================================================
-- §3 — LA TABLE `analyses_impact`
-- -------------------------------------------------------------------------------------
-- MIXTE, comme `traitements` (`filiale_id` nullable, `null` = portée Groupe). Le motif
-- est celui de la migration `027` : le registre de chaque entité juridique est le cas
-- ordinaire — c'est ce que l'article 30 demande — mais le GROUPE opère aussi des
-- traitements pour toutes ses filiales, et l'AIPD de l'annuaire commun se fait une fois.
-- =====================================================================================

create table if not exists analyses_impact (
    id            id_metier   not null default f_generer_id('AIPD'),
    filiale_id    id_metier,
    portee_groupe boolean generated always as (filiale_id is null) stored,

    -- ⚠️ `not null` — LE CRITÈRE D'ACCEPTATION DE 20.3. Une AIPD sans son traitement
    -- recopierait le registre de l'article 30 au lieu de le désigner, et la copie
    -- vieillirait sans que personne le sache.
    traitement_id id_metier   not null,
    -- Miroir de la portée du TRAITEMENT, posé par le déclencheur du §4 — jamais reçu de
    -- l'appelant : le croire sur parole rouvrirait un oracle d'existence inter-filiales.
    traitement_filiale_id    id_metier,
    traitement_portee_groupe boolean generated always as (traitement_filiale_id is null) stored,

    statut        text        not null default 'requise',
    -- Pourquoi elle est requise — ou pourquoi elle ne l'est pas. L'article 35 §1 exige
    -- l'analyse ; l'EDPB recommande de MOTIVER aussi la décision de ne pas en faire, et
    -- c'est cette trace-là qu'un contrôle CNIL demande en premier.
    necessite_motif   text,
    date_analyse      date,
    risques_identifies text,
    mesures_prevues    text,
    -- Article 35 §2 : le responsable de traitement DEMANDE l'avis du DPO.
    avis_dpo          text,
    avis_dpo_le       date,
    -- Article 36 : consultation préalable de l'autorité quand le risque résiduel reste
    -- élevé. C'est un fait daté, pas une opinion.
    consultation_cnil    boolean not null default false,
    consultation_cnil_le date,
    -- La date de revue. C'est elle qui fait basculer l'état en « à revoir », et c'est la
    -- raison pour laquelle l'état n'est pas une colonne.
    revoir_le     date,

    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,

    constraint pk_analyses_impact primary key (id),
    -- Les deux unicités que les clés composites d'une table MIXTE exigent (§19.1 et
    -- constat N-10) : `analyse_mesures` s'y appuie au §5.
    constraint uq_analyses_impact_id_filiale unique (id, filiale_id),
    constraint uq_analyses_impact_id_portee  unique (id, portee_groupe),

    constraint fk_analyses_impact_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- ── LA PAIRE DE CLÉS VERS LE TRAITEMENT (constat N-10) ──────────────────────────
    -- La clé de COHÉRENCE ne vérifie plus rien dès qu'une colonne est nulle (« match
    -- simple ») ; la clé de PORTÉE ferme ce cas, `portee_groupe` étant engendrée et
    -- jamais nulle. `restrict` : supprimer un traitement dont l'AIPD existe encore
    -- effacerait la preuve qu'on l'avait analysé.
    constraint fk_analyses_impact_traitement_portee
        foreign key (traitement_id, traitement_portee_groupe)
        references traitements (id, portee_groupe) on delete restrict,
    constraint fk_analyses_impact_traitement_coherence
        foreign key (traitement_id, traitement_filiale_id)
        references traitements (id, filiale_id) on delete restrict,

    constraint ck_analyses_impact_statut
        check (statut in ('requise', 'en_cours', 'validee', 'non_requise')),
    -- Une AIPD VALIDÉE porte sa date : « validée » sans date d'analyse est une case
    -- cochée, pas une analyse.
    constraint ck_analyses_impact_validee
        check (statut <> 'validee' or date_analyse is not null),
    -- Une consultation de l'autorité est datée ou n'a pas eu lieu — même règle que le
    -- verdict d'intégrité de la migration `020`.
    constraint ck_analyses_impact_consultation
        check (not consultation_cnil or consultation_cnil_le is not null),
    constraint ck_analyses_impact_motif
        check (necessite_motif is null or length(necessite_motif) <= 4000),
    constraint ck_analyses_impact_risques
        check (risques_identifies is null or length(risques_identifies) <= 8000),
    constraint ck_analyses_impact_mesures
        check (mesures_prevues is null or length(mesures_prevues) <= 8000),
    constraint ck_analyses_impact_avis
        check (avis_dpo is null or length(avis_dpo) <= 4000)
);

comment on table analyses_impact is
    'Analyses d''impact relatives à la protection des données — RGPD article 35 (action '
    '20.3). ⚠️ Elle POINTE le registre de l''article 30, elle ne le recopie pas : '
    'traitement_id est « not null », et ni la finalité, ni les catégories de données, ni '
    'les destinataires ne sont dupliqués ici. Deux réponses à la même question dans un '
    'outil produit en audit, c''est une de trop. ⚠️ Et elle ne porte AUCUN état : '
    '« à revoir » se dérive de la date de revue (f_etat_aipd), sans qu''aucun traitement '
    'ait à repasser.';

comment on column analyses_impact.traitement_filiale_id is
    'Miroir de la portée du TRAITEMENT, posé par trg_analyses_impact_portee. Une valeur '
    'dérivée d''une AUTRE ligne : la recevoir de l''appelant rouvrirait un oracle '
    'd''existence inter-filiales (constat N-10).';
comment on column analyses_impact.revoir_le is
    'Date à laquelle l''analyse doit être réexaminée (RGPD art. 35 §11). C''est elle qui '
    'fait basculer l''état dérivé en « a_revoir » — et c''est pourquoi l''état n''est pas '
    'une colonne.';

create index ix_analyses_impact_filiale on analyses_impact (filiale_id, statut);
create index ix_analyses_impact_traitement on analyses_impact (traitement_id);

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('analyses_impact', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('analyses_impact', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('analyses_impact', 'traitement_id', 'non_personnelle', null, null, null, null,
   'Identifiant du traitement analysé.'),
  ('analyses_impact', 'traitement_filiale_id', 'non_personnelle', null, null, null, null,
   'Miroir de la portée du traitement, posé par un déclencheur.'),
  ('analyses_impact', 'statut', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos ou valeur technique : requise / en_cours / validee / non_requise.'),
  ('analyses_impact', 'necessite_motif', 'personnelle',
   'Motiver la décision de mener — ou de ne pas mener — une analyse d''impact.',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom peut figurer au milieu '
   'd''une phrase — régime « signaler ».'),
  ('analyses_impact', 'date_analyse', 'non_personnelle', null, null, null, null,
   'Date de l''analyse : un fait daté, pas une personne.'),
  ('analyses_impact', 'risques_identifies', 'personnelle',
   'Consigner les risques que le traitement fait peser sur les personnes concernées.',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre : régime « signaler » — un nom peut figurer au milieu d''une phrase.'),
  ('analyses_impact', 'mesures_prevues', 'personnelle',
   'Consigner les mesures prévues pour traiter les risques (RGPD art. 35 §7 d).',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre : régime « signaler ».'),
  ('analyses_impact', 'avis_dpo', 'personnelle',
   'Consigner l''avis du délégué à la protection des données (RGPD art. 35 §2).',
   'Obligation légale', 1095, 'signaler',
   'Saisie libre, et le DPO est une personne nommée : régime « signaler ».'),
  ('analyses_impact', 'avis_dpo_le', 'non_personnelle', null, null, null, null,
   'Date de l''avis : un fait daté.'),
  ('analyses_impact', 'consultation_cnil', 'non_personnelle', null, null, null, null,
   'Booléen : l''autorité a-t-elle été consultée (RGPD art. 36).'),
  ('analyses_impact', 'consultation_cnil_le', 'non_personnelle', null, null, null, null,
   'Date de la consultation préalable : un fait daté.'),
  ('analyses_impact', 'revoir_le', 'non_personnelle', null, null, null, null,
   'Date de réexamen : un fait daté.')
on conflict (table_nom, colonne) do nothing;

alter table analyses_impact
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_analyses_impact_provenance on analyses_impact;
create trigger trg_analyses_impact_provenance before insert on analyses_impact
    for each row execute function f_marquer_provenance();

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('analyses_impact', 'provenance', 'non_personnelle',
        'Vocabulaire clos ou valeur technique : d''où vient la ligne (migration 032).')
on conflict (table_nom, colonne) do nothing;

-- Les installateurs — on les APPELLE, on ne recopie pas leurs déclencheurs (§40.3).
select f_poser_tracabilite_insertion();
select f_poser_portee_figee();

drop trigger if exists trg_analyses_impact_maj on analyses_impact;
create trigger trg_analyses_impact_maj before update on analyses_impact
    for each row execute function f_maj_tracabilite();

-- ── ⚠️ L'EXEMPTION D'UNICITÉ SE DÉCLARE, SINON LE DÉPLOIEMENT ROUGIT ────────────────
--
-- Et il a rougi, à la première application. `f_verifier_unicite_cloisonnee()` (migration
-- `004`) refuse toute unicité sur une table cloisonnée qui ne porte pas `filiale_id`, sauf
-- celles qu'une liste NOMME avec leur motif. `uq_analyses_impact_id_portee` est de
-- celles-là, pour le motif exact de `uq_documents_id_portee`, `uq_personnes_id_portee` et
-- `uq_mesure_catalogue_id_portee` : `id` est DÉJÀ la clé primaire, l'unicité n'interdit
-- donc rien de plus, et elle n'existe que pour être la cible d'une clé composite.
--
-- ⚠️ **On LIT la fonction telle qu'elle est APPLIQUÉE, on ne la recopie pas** : une
-- migration ultérieure l'a peut-être étendue, et une copie effacerait son extension. La
-- `033` a payé pour l'avoir oublié — sa copie avait effacé la dérogation que la `027`
-- venait d'ajouter.

do $$
declare v_source text;
begin
    select pg_get_functiondef(p.oid) into v_source
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'f_verifier_unicite_cloisonnee';

    if v_source is null then
        raise exception 'f_verifier_unicite_cloisonnee() est introuvable : la 004 n''a pas '
                        'été appliquée, et cette migration n''a rien à corriger.';
    end if;
    if position('uq_analyses_impact_id_portee' in v_source) > 0 then
        raise notice 'uq_analyses_impact_id_portee est déjà dérogée : rejeu, rien à faire.';
        return;
    end if;
    if position('''uq_mesure_catalogue_id_portee''' in v_source) = 0 then
        raise exception 'La dérogation uq_mesure_catalogue_id_portee est introuvable dans la '
                        'fonction appliquée : son texte a changé, et le remplacement à '
                        'l''aveugle est refusé plutôt qu''appliqué de travers.';
    end if;

    v_source := replace(
        v_source,
        '''uq_mesure_catalogue_id_portee'',',
        '''uq_mesure_catalogue_id_portee'','
        || E'\n        -- (id, portee_groupe) sur analyses_impact : même dispositif et même'
        || E'\n        -- motif que sur documents, personnes et mesure_catalogue. id est DÉJÀ'
        || E'\n        -- la clé primaire ; cette unicité n''interdit rien de plus, elle rend'
        || E'\n        -- seulement le couple référençable par analyse_mesures (039).'
        || E'\n        ''uq_analyses_impact_id_portee'',');

    execute v_source;
    raise notice 'f_verifier_unicite_cloisonnee() réémise : uq_analyses_impact_id_portee dérogée.';
end;
$$;

-- =====================================================================================
-- §4 — LA BARRIÈRE DE PORTÉE : LOCAL → GROUPE OUVERT, L'INVERSE FERMÉ
-- -------------------------------------------------------------------------------------
-- Dispositif des migrations `030`, `033` et `036` (constat N-10). On ne le réinvente pas.
--
--   · une AIPD LOCALE analyse un traitement de PORTÉE GROUPE  → OUI : le Groupe opère la
--     paie pour vingt filiales, chacune analyse l'impact chez elle ;
--   · une AIPD LOCALE analyse un traitement LOCAL de sa filiale → OUI ;
--   · une AIPD de PORTÉE GROUPE analyse un traitement LOCAL     → NON : l'analyse que
--     vingt filiales lisent ne doit pas dépendre d'une ligne qu'UNE filiale peut effacer ;
--   · une AIPD locale analyse le traitement local d'une AUTRE filiale → NON, fuite.
-- =====================================================================================

create or replace function f_analyses_impact_porte_la_portee()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_filiale_traitement id_metier;
    v_trouve             boolean;
begin
    select t.filiale_id, true into v_filiale_traitement, v_trouve
      from traitements t where t.id = new.traitement_id;

    if not coalesce(v_trouve, false) then
        -- ⚠️ Le refus NE DISTINGUE PAS « il n'existe pas » de « il ne vous est pas
        -- visible » : trancher renseignerait sur ce qui existe ailleurs.
        raise exception 'Le traitement désigné n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et choisissez un traitement de votre filiale '
                         'ou un traitement de portée Groupe.';
    end if;

    new.traitement_filiale_id := v_filiale_traitement;
    return new;
end;
$$;

comment on function f_analyses_impact_porte_la_portee() is
    'Pose analyses_impact.traitement_filiale_id depuis le TRAITEMENT, pour que les deux '
    'clés composites du §3 puissent décider. ⚠️ La valeur est ÉCRASÉE : la recevoir de '
    'l''appelant rouvrirait un oracle d''existence inter-filiales (constat N-10).';

drop trigger if exists trg_analyses_impact_portee on analyses_impact;
-- ⚠️ `before insert or update` SANS liste de colonnes : la `030` a coûté le constat A-9
-- pour avoir écrit « update OF … », ce qui laissait un état incohérent atteignable en
-- changeant l'autre moitié du couple.
create trigger trg_analyses_impact_portee
    before insert or update on analyses_impact
    for each row execute function f_analyses_impact_porte_la_portee();

alter table analyses_impact
    add constraint ck_analyses_impact_portee
    check (filiale_id is not null or traitement_filiale_id is null);

comment on constraint ck_analyses_impact_portee on analyses_impact is
    'Une AIPD de PORTÉE GROUPE ne peut analyser qu''un traitement de portée Groupe : '
    'l''analyse que vingt filiales lisent ne doit pas dépendre d''une ligne qu''UNE filiale '
    'peut effacer. Le sens inverse — une AIPD locale sur un traitement du Groupe — est '
    'ouvert, et c''est le cas le plus fréquent (constat N-10, migration 030).';

-- =====================================================================================
-- §5 — `analyse_mesures` : LES CONTRÔLES QUI TRAITENT LES RISQUES (art. 35 §7 d)
-- -------------------------------------------------------------------------------------
-- Forme de `document_mesures` (migration `036`) : ni version, ni déclencheur de mise à
-- jour — *un lien ne se modifie pas, il se supprime et se recrée*.
--
-- ⚠️ **Pourquoi une liaison propre plutôt que de réutiliser `traitement_mesures`.** Les
-- deux ne répondent pas à la même question. `traitement_mesures` dit ce qui protège le
-- traitement AUJOURD'HUI ; `analyse_mesures` dit ce que l'analyse a PRÉVU pour ramener le
-- risque à un niveau acceptable. Les confondre effacerait l'écart entre le prévu et le
-- fait — c'est-à-dire précisément ce qu'un contrôle CNIL vient mesurer.
-- =====================================================================================

create table if not exists analyse_mesures (
    analyse_id   id_metier   not null,
    mesure_id    id_metier   not null,
    filiale_id   id_metier,
    portee_groupe boolean generated always as (filiale_id is null) stored,
    mesure_filiale_id    id_metier,
    mesure_portee_groupe boolean generated always as (mesure_filiale_id is null) stored,
    cree_le      timestamptz not null default now(),
    cree_par     text        not null default f_utilisateur_courant(),

    constraint pk_analyse_mesures primary key (analyse_id, mesure_id),

    constraint fk_analyse_mesures_analyse_portee
        foreign key (analyse_id, portee_groupe)
        references analyses_impact (id, portee_groupe) on delete cascade,
    constraint fk_analyse_mesures_analyse_coherence
        foreign key (analyse_id, filiale_id)
        references analyses_impact (id, filiale_id) on delete cascade,
    -- ⚠️ `restrict` du côté du CONTRÔLE — §17.6 : *un contrôle s'archive, il ne se
    -- supprime pas*. Une cascade rendrait un contrôle supprimable dès lors qu'il n'est
    -- plus lié qu'à des analyses, et ferait disparaître la preuve avec lui.
    constraint fk_analyse_mesures_mesure_portee
        foreign key (mesure_id, mesure_portee_groupe)
        references mesure_catalogue (id, portee_groupe) on delete restrict,
    constraint fk_analyse_mesures_mesure_coherence
        foreign key (mesure_id, mesure_filiale_id)
        references mesure_catalogue (id, filiale_id) on delete restrict,
    constraint fk_analyse_mesures_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    constraint ck_analyse_mesures_portee
        check (filiale_id is not null or mesure_filiale_id is null)
);

comment on table analyse_mesures is
    'Les contrôles du pivot que l''analyse d''impact a PRÉVUS pour traiter les risques '
    'qu''elle identifie (RGPD art. 35 §7 d, action 20.3). ⚠️ Distincte de '
    'traitement_mesures, et délibérément : celle-ci dit ce qui est PRÉVU par l''analyse, '
    'l''autre ce qui protège le traitement AUJOURD''HUI. Les confondre effacerait l''écart '
    'entre le prévu et le fait — ce qu''un contrôle vient précisément mesurer.';

create index ix_analyse_mesures_filiale on analyse_mesures (filiale_id, mesure_id);
create index ix_analyse_mesures_mesure  on analyse_mesures (mesure_id);

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values
  ('analyse_mesures', 'analyse_id', 'non_personnelle', 'Identifiant de l''analyse d''impact.'),
  ('analyse_mesures', 'mesure_id', 'non_personnelle', 'Identifiant du contrôle prévu.'),
  ('analyse_mesures', 'filiale_id', 'non_personnelle',
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('analyse_mesures', 'mesure_filiale_id', 'non_personnelle',
   'Miroir de la portée de la mesure, posé par un déclencheur.')
on conflict (table_nom, colonne) do nothing;

alter table analyse_mesures
    add column if not exists provenance provenance_ligne not null;

drop trigger if exists trg_analyse_mesures_provenance on analyse_mesures;
create trigger trg_analyse_mesures_provenance before insert on analyse_mesures
    for each row execute function f_marquer_provenance();

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('analyse_mesures', 'provenance', 'non_personnelle',
        'Vocabulaire clos ou valeur technique : d''où vient la ligne (migration 032).')
on conflict (table_nom, colonne) do nothing;

select f_poser_tracabilite_insertion();
select f_poser_portee_figee();

create or replace function f_analyse_mesures_porte_la_portee()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_filiale_analyse id_metier;
    v_analyse_trouvee boolean;
    v_filiale_mesure  id_metier;
    v_mesure_trouvee  boolean;
begin
    select a.filiale_id, true into v_filiale_analyse, v_analyse_trouvee
      from analyses_impact a where a.id = new.analyse_id;
    if not coalesce(v_analyse_trouvee, false) then
        raise exception 'L''analyse d''impact désignée n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et recommencez.';
    end if;

    select m.filiale_id, true into v_filiale_mesure, v_mesure_trouvee
      from mesure_catalogue m where m.id = new.mesure_id;
    if not coalesce(v_mesure_trouvee, false) then
        raise exception 'Le contrôle désigné n''existe pas dans votre périmètre.'
            using errcode = 'GRC07',
                  hint = 'Rechargez la fiche et choisissez un contrôle de votre filiale ou '
                         'un contrôle du socle du Groupe.';
    end if;

    new.filiale_id        := v_filiale_analyse;
    new.mesure_filiale_id := v_filiale_mesure;
    return new;
end;
$$;

comment on function f_analyse_mesures_porte_la_portee() is
    'Pose analyse_mesures.filiale_id depuis l''ANALYSE et mesure_filiale_id depuis le '
    'CONTRÔLE, pour que les quatre clés composites du §5 puissent décider (constat N-10). '
    '⚠️ Les deux valeurs sont ÉCRASÉES : les recevoir rouvrirait un oracle d''existence.';

drop trigger if exists trg_analyse_mesures_portee on analyse_mesures;
create trigger trg_analyse_mesures_portee
    before insert or update on analyse_mesures
    for each row execute function f_analyse_mesures_porte_la_portee();

-- =====================================================================================
-- §6 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Contrat de la famille MIXTE (`004_rls.sql`, repris par `027` pour `traitements`) : une
-- ligne de portée Groupe se lit partout et ne s'écrit qu'en administration Groupe.
-- =====================================================================================

alter table analyses_impact enable row level security;
alter table analyses_impact force  row level security;
alter table analyse_mesures enable row level security;
alter table analyse_mesures force  row level security;

drop policy if exists pol_analyses_impact_lecture     on analyses_impact;
drop policy if exists pol_analyses_impact_ajout       on analyses_impact;
drop policy if exists pol_analyses_impact_maj         on analyses_impact;
drop policy if exists pol_analyses_impact_suppression on analyses_impact;

create policy pol_analyses_impact_lecture on analyses_impact for select using (
    case when filiale_id is null then true
         else filiale_id = any (f_filiales_lecture()) end);
create policy pol_analyses_impact_ajout on analyses_impact for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);
create policy pol_analyses_impact_maj on analyses_impact for update
    using (case when filiale_id is null then f_administration_groupe()
                else filiale_id = f_filiale_ecriture() end)
    with check (case when filiale_id is null then f_administration_groupe()
                     else filiale_id = f_filiale_ecriture() end);
create policy pol_analyses_impact_suppression on analyses_impact for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);

comment on policy pol_analyses_impact_lecture on analyses_impact is
    'Lecture : les analyses du périmètre, plus celles de portée Groupe — le socle commun '
    'se lit partout.';
comment on policy pol_analyses_impact_ajout on analyses_impact is
    'Ajout : dans la filiale ACTIVE ; une analyse de portée Groupe exige l''administration '
    'Groupe.';

drop policy if exists pol_analyse_mesures_lecture     on analyse_mesures;
drop policy if exists pol_analyse_mesures_ajout       on analyse_mesures;
drop policy if exists pol_analyse_mesures_maj         on analyse_mesures;
drop policy if exists pol_analyse_mesures_suppression on analyse_mesures;

create policy pol_analyse_mesures_lecture on analyse_mesures for select using (
    case when filiale_id is null then true
         else filiale_id = any (f_filiales_lecture()) end);
create policy pol_analyse_mesures_ajout on analyse_mesures for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);
create policy pol_analyse_mesures_maj on analyse_mesures for update
    using (case when filiale_id is null then f_administration_groupe()
                else filiale_id = f_filiale_ecriture() end)
    with check (case when filiale_id is null then f_administration_groupe()
                     else filiale_id = f_filiale_ecriture() end);
create policy pol_analyse_mesures_suppression on analyse_mesures for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant select, insert, update, delete on analyses_impact to grc_app';
        execute 'grant select, insert, update, delete on analyse_mesures to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on analyses_impact to grc_lecture';
        execute 'grant select on analyse_mesures to grc_lecture';
    end if;
end;
$$;

-- ⚠️ **L'ORDRE N'EST PAS UN STYLE** (`CONVENTIONS.md` §40.2) : l'installateur découvre les
-- tables porteuses par un prédicat dont une condition est *« la politique de SUPPRESSION
-- est cloisonnée »*. Appelé avant le §6, il ne verrait pas `analyses_impact`, l'équiperait
-- de rien, et laisserait ses pièces jointes survivre à leur porteur.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- L'armement, qui est une TROISIÈME chose (§19.4) : on DÉCOUVRE, on ne recopie pas.
select f_armer_declencheurs();

-- =====================================================================================
-- §7 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ Il ÉPROUVE (`CONVENTIONS.md` §39) : il joue `f_etat_aipd()` sur des valeurs témoins
-- au lieu de lire son texte. Un garde qui vérifierait que la fonction « existe » passerait
-- au vert sur une version qui rend « valide » pour tout le monde — c'est-à-dire sur celle
-- qui transforme le produit en distributeur de quitus.
--
-- ⚠️ Et il ne lit AUCUNE ligne d'une table cloisonnée (`CONVENTIONS.md` §41) :
-- `install.sh` appelle `f_verifier_schema()` sans périmètre.
-- =====================================================================================

create or replace function f_verifier_analyses_impact()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_cas    record;
    v_rendu  text;
    v_def    text;
begin
    /* ── SENS 1 : l'état se DÉRIVE, et il dérive JUSTE ────────────────────────────── */
    for v_cas in
        select * from (values
            ('non_requise', (current_date - 1)::date, 'non_requise'),
            ('requise',     null::date,               'a_faire'),
            ('en_cours',    null::date,               'en_cours'),
            ('validee',     null::date,               'valide'),
            ('validee',     (current_date + 30)::date,'valide'),
            -- LE CAS QUI PORTE L'ACTION : une revue échue rouvre l'analyse.
            ('validee',     (current_date - 1)::date, 'a_revoir')
        ) as c(statut, revoir_le, attendu)
    loop
        v_rendu := f_etat_aipd(v_cas.statut, v_cas.revoir_le);
        if v_rendu is distinct from v_cas.attendu then
            objet    := 'f_etat_aipd';
            anomalie := 'etat_derive_faux';
            detail   := format(
                'f_etat_aipd(%L, %L) rend « %s » au lieu de « %s ». L''état d''une analyse '
                'd''impact est DÉRIVÉ : une erreur ici fait afficher une conformité RGPD que '
                'personne n''a constatée, sur tout le parc à la fois.',
                v_cas.statut, v_cas.revoir_le, v_rendu, v_cas.attendu);
            return next;
        end if;
    end loop;

    /* ── SENS 2 : la barrière de portée est POSÉE ─────────────────────────────────── */
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'analyses_impact'::regclass
       and c.conname  = 'ck_analyses_impact_portee';
    if v_def is null then
        objet    := 'analyses_impact';
        anomalie := 'barriere_portee_absente';
        detail   := 'ck_analyses_impact_portee a disparu : une analyse de PORTÉE GROUPE '
                    'pourrait s''appuyer sur un traitement local, c''est-à-dire dépendre '
                    'd''une ligne qu''UNE filiale peut effacer (constat N-10).';
        return next;
    end if;

    /* ── SENS 3 : l'AIPD POINTE le traitement — elle ne peut pas s'en passer ──────── */
    /* C'est le critère d'acceptation de 20.3, et il vit dans une contrainte : sans le
       « not null », une AIPD orpheline recopierait le registre au lieu de le désigner. */
    if exists (
        select 1 from pg_attribute a
         where a.attrelid = 'analyses_impact'::regclass
           and a.attname = 'traitement_id' and not a.attnotnull)
    then
        objet    := 'analyses_impact.traitement_id';
        anomalie := 'aipd_sans_traitement';
        detail   := 'traitement_id est devenu nullable : une analyse d''impact pourrait '
                    'exister sans le traitement qu''elle analyse, et recopierait alors le '
                    'registre de l''article 30 au lieu de le désigner. C''est le critère '
                    'd''acceptation de l''action 20.3, et il se garde ici.';
        return next;
    end if;

    /* ── SENS 4 : AUCUN déclencheur d'analyses_impact n'écrit dans `traitements` ──── */
    /* L'état se dérive, il ne se pose pas. Un relais qui irait marquer le traitement
       « analysé » recréerait la colonne d'état qu'on refuse, un cran plus loin. */
    if exists (
        select 1
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = 'analyses_impact'::regclass and not t.tgisinternal
           and pg_get_functiondef(p.oid) ~* '(update|insert into|delete from)\s+traitements')
    then
        objet    := 'analyses_impact';
        anomalie := 'declencheur_ecrit_le_traitement';
        detail   := 'Un déclencheur d''analyses_impact écrit dans « traitements ». L''état '
                    'de l''analyse se DÉRIVE (f_etat_aipd) : le recopier sur le traitement '
                    'obligerait quelque chose à repasser, et le jour où il ne passe pas le '
                    'produit affirme une conformité qui n''existe plus.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_analyses_impact() is
    'Vérifie le dispositif de l''action 20.3. (1) ÉPROUVE f_etat_aipd() sur six cas '
    'témoins — dont celui qui porte l''action : une analyse validée dont la revue est '
    'échue redevient « a_revoir » ; (2) la barrière de portée N-10 est posée ; (3) '
    'traitement_id reste « not null » — c''est le critère d''acceptation de 20.3, et sans '
    'lui l''AIPD recopierait le registre de l''article 30 au lieu de le désigner ; (4) '
    'aucun déclencheur d''analyses_impact n''écrit dans « traitements », l''état se '
    'dérivant. Ne lit AUCUNE ligne d''une table cloisonnée (§41). Un schéma sain ne '
    'renvoie AUCUNE ligne.';

grant execute on function f_verifier_analyses_impact() to grc_app;

-- =====================================================================================
-- §8 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
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
        raise exception 'Le schéma est en défaut après 039 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, analyses d''impact comprises.';
end;
$$;

insert into migrations_schema (version, nom)
values ('039', 'l''analyse d''impact (AIPD, RGPD art. 35) : elle POINTE le registre de '
               'l''article 30 au lieu de le recopier, et son état se dérive (20.3)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop table if exists analyse_mesures;
--   drop table if exists analyses_impact;
--   drop function if exists f_analyse_mesures_porte_la_portee();
--   drop function if exists f_analyses_impact_porte_la_portee();
--   drop function if exists f_verifier_analyses_impact();
--   drop function if exists f_etat_aipd(text, date);
--   drop function if exists f_aipd_presumee_requise(boolean);
--   delete from controles_schema where fonction = 'f_verifier_analyses_impact';
--   delete from colonnes_personnelles where table_nom in ('analyses_impact','analyse_mesures');
--   delete from migrations_schema where version = '039';
--   -- ⚠️ « analyses_impact » RESTE admise par type_entite : l'en retirer ferait rougir
--   --    f_verifier_declencheurs_pieces() sur une valeur sans table, et le journal
--   --    d'audit porte déjà des entrées qui la nomment — elles ne s'effacent pas.
--   commit;
-- =====================================================================================
