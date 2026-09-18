-- =====================================================================================
--  043 — LE QUESTIONNAIRE FOURNISSEUR : ENVOYÉ, RELANCÉ, REVERSÉ SUR LA FICHE
--
--  §0  Le périmètre de la migration
--  §1  La table « questionnaires_tiers » — l'ENVOI, pas les questions
--  §2  La table « questionnaire_reponses » — ce que le fournisseur a répondu
--  §3  L'ÉTAT est DÉRIVÉ, à un seul endroit : f_etat_questionnaire()
--  §4  Le domaine « type_entite » admet les deux tables
--  §5  Cloisonnement, provenance, traçabilité
--  §6  L'installateur des déclencheurs « les pièces suivent leur porteur »
--  §7  Le garde-fou
--  §8  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Action **21.2** du `docs/PLAN_PRODUIT.md` : *« questionnaire fournisseur — construit
--  depuis un référentiel existant, envoyé, relancé, réponses reversées sur la fiche »*.
--  Et le critère nomme la contrainte : *« sans portail dans ce lot-ci : le questionnaire
--  s'exporte, se remplit hors ligne, se réimporte par le moteur d'import généralisé »*.
--
--  ── ⚠️ CE QUE CES DEUX TABLES NE PORTENT PAS : LES QUESTIONS ───────────────────────
--
--  C'est la décision centrale, et elle mérite d'être lue avant d'être rediscutée.
--
--  Le texte des questions vit dans les **catalogues de référentiels**
--  (`cyber-gouvernance_V4/js/data/ref_*.js`) : 234 questions pour AirCyber, 93 pour
--  l'Annexe A d'ISO 27001, 42 pour l'hygiène ANSSI. Les recopier ici en ferait une
--  seconde source, et la seconde vieillirait — BoostAerospace **révise** son
--  questionnaire, et ISO publie des amendements.
--
--  Ce qu'on range est donc l'**envoi** (« j'ai demandé CE référentiel à CE fournisseur,
--  pour telle date ») et la **réponse** (« à la question de code X, il a répondu Y »).
--  Le code fait la jointure, exactement comme `evaluations(ref_id, code)` le fait déjà
--  depuis le premier chantier — et pour le même motif, écrit au constat **Q-192** : *les
--  auto-évaluations sont stockées par (ref_id, code), et les renuméroter les
--  réattribuerait en silence.*
--
--  ── ⚠️ ET CE QUE LE PRODUIT NE FAIT PAS : ENVOYER ──────────────────────────────────
--
--  `envoye_le` et `relance_le` sont des **faits consignés**, pas des actions. Le produit
--  ne poste aucun courriel à un fournisseur : il n'a ni son accord, ni la garantie que
--  l'adresse de l'annuaire d'urgence est celle du bon interlocuteur, ni — en déploiement
--  VPN — le droit de supposer qu'une sortie de messagerie existe.
--
--  C'est la même règle qu'à l'action 20.2 (formulaires ANSSI et CNIL) et qu'au registre
--  DORA de la `042` : **le produit prépare, l'humain envoie.** Ce qu'il apporte en
--  échange n'est pas rien — l'échéance entre dans l'échéancier existant, le retard se
--  dérive, et la relance cesse d'être un post-it.
--
--  ⚠️ Le **portail** qui changerait cela est validé et porte un numéro : c'est le lot
--  **L28**, avec sa propre porte de sécurité. L'export/réimport reste la **voie de repli
--  permanente**, et non un état transitoire : un fournisseur qui refuse un accès en
--  ligne doit pouvoir répondre quand même.
-- =====================================================================================
-- Invocation :
--   psql -v ON_ERROR_STOP=1 -d cyber_grc -f 043_le_questionnaire_fournisseur.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
do $$
begin
    perform set_config('grc.utilisateur', 'migration-043', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LA TABLE « questionnaires_tiers » — L'ENVOI
-- =====================================================================================

create table if not exists questionnaires_tiers (
    id             id_metier   not null default f_generer_id('QUES'),

    -- ⚠️ TOUJOURS locale. Une campagne de questionnaires appartient à la filiale qui
    -- contracte : c'est elle qui décide ce qu'elle exige de SON fournisseur, et deux
    -- filiales peuvent légitimement interroger la même société sur deux référentiels
    -- différents. Une portée Groupe ferait de l'exigence de l'une celle de toutes.
    --
    -- ⚠️ **À ne pas confondre avec la CAMPAGNE DESCENDANTE du lot L24**, qui va dans
    -- l'autre sens : le Groupe demande à ses FILIALES. Ce sont deux mécanismes, et les
    -- réunir en un seul aurait fait porter à l'un les contraintes de l'autre.
    filiale_id     id_metier   not null,
    prestataire_id id_metier   not null,

    -- Le référentiel demandé — un identifiant de catalogue (« aircyber »,
    -- « iso-27002-2022 », « anssi-hygiene »). ⚠️ **Aucune clé étrangère** : le catalogue
    -- est statique et vit dans le frontend, et une contrainte vers une table qui
    -- n'existe pas serait une promesse que le schéma ne peut pas tenir. Le lot **L26**
    -- (catalogues ouverts) changera cela ; d'ici là, la valeur est un texte borné.
    ref_id         id_metier   not null,

    -- Ce qu'on demande, en une phrase. Facultatif : le référentiel le dit déjà.
    intitule       text,

    -- ── LES QUATRE DATES, ET CE QUE CHACUNE VEUT DIRE ──────────────────────────────
    --
    -- ⚠️ Aucune n'est un déclencheur d'action : ce sont des **faits consignés**. Le
    -- produit n'envoie rien (voir l'entête). `envoye_le` dit « je l'ai envoyé », pas
    -- « envoie-le ».
    envoye_le      date,
    echeance       date,
    relance_le     date,
    recu_le        date,

    notes          text,

    version        integer     not null default 1,
    cree_le        timestamptz not null default now(),
    cree_par       text        not null default f_utilisateur_courant(),
    modifie_le     timestamptz,
    modifie_par    text,

    constraint pk_questionnaires_tiers primary key (id),

    -- ⚠️ Clé étrangère COMPOSITE (`CONVENTIONS.md` §17.1) : une clé simple serait
    -- satisfaite par un prestataire INVISIBLE de la filiale voisine, et l'on
    -- adresserait un questionnaire à une société qu'on ne voit pas.
    constraint fk_questionnaires_tiers_prestataire
        foreign key (prestataire_id, filiale_id) references prestataires (id, filiale_id)
        on delete cascade,
    constraint fk_questionnaires_tiers_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    -- Cible des clés étrangères composites du §2 (`CONVENTIONS.md` §19.1).
    constraint uq_questionnaires_tiers_id_filiale unique (id, filiale_id),

    -- ── LES TROIS RÈGLES DE CHRONOLOGIE, POSÉES DANS LE SCHÉMA ─────────────────────
    --
    -- ⚠️ Elles sont ici et non dans une route, pour le motif du §8.1 : *une route ne
    -- voit que son chemin ; il y en a toujours un de plus* — l'import généralisé, la
    -- reprise d'un export, `psql`. Et une chronologie fausse n'est pas un détail : c'est
    -- elle qui fait dire au produit qu'un questionnaire est en retard, ou ne l'est pas.
    --
    -- On ne peut pas RELANCER ce qu'on n'a pas envoyé.
    constraint ck_questionnaires_tiers_relance
        check (relance_le is null or (envoye_le is not null and relance_le >= envoye_le)),
    -- On ne peut pas RECEVOIR ce qu'on n'a pas envoyé.
    constraint ck_questionnaires_tiers_reception
        check (recu_le is null or (envoye_le is not null and recu_le >= envoye_le)),
    -- Une échéance ANTÉRIEURE à l'envoi n'a jamais laissé le temps de répondre.
    constraint ck_questionnaires_tiers_echeance
        check (echeance is null or envoye_le is null or echeance >= envoye_le),

    constraint ck_questionnaires_tiers_longueurs check (
        (intitule is null or length(intitule) <= 300)
        and (notes is null or length(notes) <= 4000))
);

comment on table questionnaires_tiers is
    'Envoi d''un questionnaire de sécurité à un tiers (action 21.2). ⚠️ Cette table ne '
    'porte PAS les questions : le texte des référentiels vit dans les catalogues '
    '(js/data/ref_*.js), et les recopier ici en ferait une seconde source qui '
    'vieillirait — BoostAerospace RÉVISE son questionnaire. Le lien se fait par '
    '(ref_id, code), exactement comme « evaluations » depuis le premier chantier. '
    '⚠️ Et le produit N''ENVOIE RIEN : envoye_le et relance_le sont des faits '
    'CONSIGNÉS. Le portail qui changerait cela est le lot L28 ; l''export/réimport '
    'reste la voie de repli PERMANENTE (critère 21.2).';

comment on column questionnaires_tiers.ref_id is
    'Identifiant du référentiel demandé, tel que le catalogue le nomme. ⚠️ Aucune clé '
    'étrangère : le catalogue est statique et vit dans le frontend. Une contrainte vers '
    'une table inexistante serait une promesse que le schéma ne peut pas tenir. Le lot '
    'L26 (catalogues ouverts) changera cela.';
comment on column questionnaires_tiers.envoye_le is
    'Date à laquelle le questionnaire A ÉTÉ envoyé — un fait consigné par un humain, '
    'jamais une action du produit. Nul = pas encore envoyé, c''est-à-dire un brouillon.';
comment on column questionnaires_tiers.echeance is
    'Date attendue de retour. ⚠️ Elle alimente l''échéancier existant '
    '(js/services/echeances.js) : c''est une obligation datée comme une autre, et lui '
    'faire un écran à part l''aurait rendue invisible à qui consulte ses échéances.';

create index ix_questionnaires_tiers_prestataire
    on questionnaires_tiers (filiale_id, prestataire_id);
create index ix_questionnaires_tiers_echeance
    on questionnaires_tiers (filiale_id, echeance);

-- =====================================================================================
-- §2 — LA TABLE « questionnaire_reponses » — CE QUE LE FOURNISSEUR A RÉPONDU
-- =====================================================================================
-- ⚠️ **Une entité à part, et non un jsonb sur le questionnaire.** Le `CONVENTIONS.md`
-- §6 réserve le jsonb aux documents FIGÉS ; ces réponses, elles, s'interrogent une par
-- une (« quels fournisseurs ont répondu « non » à la question du chiffrement ? »), se
-- comptent, et arrivent par l'import généralisé — qui écrit des LIGNES.

create table if not exists questionnaire_reponses (
    id               id_metier   not null default f_generer_id('QREP'),
    filiale_id       id_metier   not null,
    questionnaire_id id_metier   not null,

    -- Le code de la question DANS le référentiel. ⚠️ C'est la clé de jointure avec le
    -- catalogue, et elle est volontairement TEXTUELLE : les codes d'un référentiel ne
    -- se renumérotent pas (constat Q-192).
    code             text        not null,

    -- ── LE VOCABULAIRE DES RÉPONSES ────────────────────────────────────────────────
    --
    -- Quatre valeurs, et le choix de « partiel » mérite un mot : AirCyber se répond
    -- Oui/Non/N-A sans nuance (`scoring: "conformite"`), mais un questionnaire bâti sur
    -- ISO ou ANSSI en admet une. Offrir la nuance sans l'imposer coûte une valeur de
    -- plus ; ne pas l'offrir pousserait à répondre « oui » pour ce qui est à moitié
    -- fait — c'est-à-dire à fabriquer une fausse assurance dans la pièce même qui sert
    -- à évaluer un fournisseur.
    reponse          text        not null,
    commentaire      text,
    -- Ce sur quoi le fournisseur appuie sa réponse : une référence, pas un fichier. Le
    -- fichier, lui, s'attache au QUESTIONNAIRE par la chaîne des pièces jointes (L6) —
    -- deux endroits pour un fichier en feraient deux vérités.
    preuve           text,

    version          integer     not null default 1,
    cree_le          timestamptz not null default now(),
    cree_par         text        not null default f_utilisateur_courant(),
    modifie_le       timestamptz,
    modifie_par      text,

    constraint pk_questionnaire_reponses primary key (id),

    constraint fk_questionnaire_reponses_questionnaire
        foreign key (questionnaire_id, filiale_id)
        references questionnaires_tiers (id, filiale_id) on delete cascade,
    constraint fk_questionnaire_reponses_filiale
        foreign key (filiale_id) references filiales(id) on delete restrict,

    constraint uq_questionnaire_reponses_id_filiale unique (id, filiale_id),

    -- ⚠️ UNE réponse par question et par questionnaire. L'unicité porte `filiale_id` en
    -- tête (§19.1) : sans elle, une filiale occuperait le couple d'une autre sur un
    -- identifiant de questionnaire qu'elle ne voit pas (constat Q-2).
    --
    -- ⚠️ **Et c'est ce qui rend le réimport IDEMPOTENT par la contrainte** : le moteur
    -- d'import CRÉE, il ne met pas à jour (trois motifs écrits au lot L7). Réimporter
    -- deux fois le même fichier heurte donc cette unicité et échoue bruyamment, au lieu
    -- de doubler silencieusement les réponses — ce qui fausserait tous les comptes.
    constraint uq_questionnaire_reponses_question
        unique (filiale_id, questionnaire_id, code),

    constraint ck_questionnaire_reponses_code check (code <> '' and length(code) <= 64),
    constraint ck_questionnaire_reponses_reponse
        check (reponse in ('oui', 'non', 'partiel', 'na')),
    constraint ck_questionnaire_reponses_longueurs check (
        (commentaire is null or length(commentaire) <= 4000)
        and (preuve is null or length(preuve) <= 500))
);

comment on table questionnaire_reponses is
    'Ce qu''un tiers a répondu, question par question (action 21.2). ⚠️ Le TEXTE de la '
    'question n''est pas ici : « code » fait la jointure avec le catalogue du '
    'référentiel, comme « evaluations » le fait déjà. ⚠️ L''unicité (filiale, '
    'questionnaire, code) rend le réimport IDEMPOTENT PAR LA CONTRAINTE : le moteur '
    'd''import CRÉE sans mettre à jour, et un second passage du même fichier échoue '
    'bruyamment au lieu de doubler les réponses en silence.';

comment on column questionnaire_reponses.reponse is
    'Vocabulaire clos : oui / non / partiel / na. ⚠️ « partiel » existe alors qu''AirCyber '
    'ne l''emploie pas : sans lui, on répondrait « oui » pour ce qui est à moitié fait, '
    'c''est-à-dire qu''on fabriquerait une fausse assurance dans la pièce même qui sert '
    'à évaluer un fournisseur.';

create index ix_questionnaire_reponses_questionnaire
    on questionnaire_reponses (filiale_id, questionnaire_id);

-- ── Le registre de l'article 30 du produit (constats Q-295 / Q-296) ─────────────────
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('questionnaires_tiers', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('questionnaires_tiers', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('questionnaires_tiers', 'prestataire_id', 'non_personnelle', null, null, null, null,
   'Identifiant du tiers interrogé : une société.'),
  ('questionnaires_tiers', 'ref_id', 'non_personnelle', null, null, null, null,
   'Identifiant de référentiel : un catalogue, pas une personne.'),
  ('questionnaires_tiers', 'intitule', 'non_personnelle', null, null, null, null,
   'Intitulé de la demande : une phrase de gestion.'),
  ('questionnaires_tiers', 'envoye_le', 'non_personnelle', null, null, null, null,
   'Date d''envoi : une date de gestion.'),
  ('questionnaires_tiers', 'echeance', 'non_personnelle', null, null, null, null,
   'Date de retour attendue : une date de gestion.'),
  ('questionnaires_tiers', 'relance_le', 'non_personnelle', null, null, null, null,
   'Date de relance : une date de gestion.'),
  ('questionnaires_tiers', 'recu_le', 'non_personnelle', null, null, null, null,
   'Date de réception : une date de gestion.'),
  ('questionnaires_tiers', 'notes', 'personnelle',
   'Consigner le contexte de la demande — interlocuteur, canal, engagement pris.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre : le sujet n''est pas une personne, mais un nom d''interlocuteur y '
   'figure souvent (« relancé Mme Ollier »). Le remplacer détruirait la phrase, et '
   'cette phrase est la trace de la démarche. Régime « signaler » : le produit montre '
   'l''emplacement, un humain tranche.'),
  ('questionnaire_reponses', 'id', 'non_personnelle', null, null, null, null,
   'Identifiant technique engendré par le produit (domaine id_metier).'),
  ('questionnaire_reponses', 'filiale_id', 'non_personnelle', null, null, null, null,
   'Identifiant de filiale : une organisation, pas une personne.'),
  ('questionnaire_reponses', 'questionnaire_id', 'non_personnelle', null, null, null, null,
   'Identifiant de l''envoi auquel cette réponse se rattache.'),
  ('questionnaire_reponses', 'code', 'non_personnelle', null, null, null, null,
   'Code de la question dans son référentiel : une référence de catalogue.'),
  ('questionnaire_reponses', 'reponse', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : oui / non / partiel / na.'),
  ('questionnaire_reponses', 'commentaire', 'personnelle',
   'Recueillir la précision que le fournisseur apporte à sa réponse.',
   'Intérêt légitime', 1095, 'signaler',
   'Saisie libre RÉDIGÉE PAR UN TIERS : un nom de responsable y figure souvent '
   '(« géré par notre RSSI, M. Renard »). Le remplacer détruirait la réponse, qui est '
   'la pièce d''évaluation elle-même.'),
  ('questionnaire_reponses', 'preuve', 'personnelle',
   'Consigner ce sur quoi le fournisseur appuie sa réponse.',
   'Intérêt légitime', 1095, 'signaler',
   'Référence textuelle, susceptible de nommer un signataire d''attestation.')
on conflict (table_nom, colonne) do nothing;

-- La marque de provenance (migration `032`), à rattraper : ces tables naissent après elle.
alter table questionnaires_tiers   add column if not exists provenance provenance_ligne not null;
alter table questionnaire_reponses add column if not exists provenance provenance_ligne not null;

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
values ('questionnaires_tiers', 'provenance', 'non_personnelle',
        'Vocabulaire clos : d''où vient la ligne (saisie / decouverte / reprise).'),
       ('questionnaire_reponses', 'provenance', 'non_personnelle',
        'Vocabulaire clos : d''où vient la ligne (saisie / decouverte / reprise).')
on conflict (table_nom, colonne) do nothing;

do $$
declare r record;
begin
    for r in select unnest(array['questionnaires_tiers', 'questionnaire_reponses']) as t loop
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
-- §3 — L'ÉTAT EST DÉRIVÉ, À UN SEUL ENDROIT
-- =====================================================================================
-- ⚠️ **Même arbitrage qu'aux dérogations (19.2), à l'horloge réglementaire (20.1), aux
-- demandes de droits (20.4) et à la chaîne DORA (21.1)**, et il vaut d'être répété
-- parce qu'il est la colonne vertébrale de tout ce chantier :
--
--   *une colonne d'état doit être écrite, donc remise à jour ; un traitement qui la
--   remet peut ne pas tourner ; et le jour où il ne tourne pas, le produit affirme en
--   silence quelque chose qui n'est plus vrai.*
--
-- Ici, « en retard » se constate à l'instant où le jour change, sans qu'aucun code ne
-- s'exécute — donc sans qu'aucun code ne puisse l'oublier.
--
-- `stable` et non `immutable` : elle lit `current_date`.

create or replace function f_etat_questionnaire(
    p_envoye_le date,
    p_echeance  date,
    p_recu_le   date
)
returns text
    language sql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        -- Reçu : l'affaire est close, et l'échéance n'y change plus rien. ⚠️ C'est le
        -- premier cas testé À DESSEIN — un questionnaire reçu en retard est reçu, et
        -- l'afficher « en retard » enverrait relancer quelqu'un qui a déjà répondu.
        when p_recu_le is not null then 'recu'
        -- Jamais envoyé : c'est un brouillon, et non un retard. Un produit qui
        -- compterait les brouillons parmi les retards fabriquerait des alertes que son
        -- utilisateur s'est infligées à lui-même.
        when p_envoye_le is null then 'brouillon'
        -- Envoyé sans échéance : on attend, et rien ne dit qu'on attend trop.
        when p_echeance is null then 'en_attente'
        when p_echeance < current_date then 'en_retard'
        else 'en_attente'
    end;
$$;

comment on function f_etat_questionnaire(date, date, date) is
    'L''état d''un questionnaire fournisseur, DÉRIVÉ de ses dates — jamais stocké '
    '(action 21.2). Quatre valeurs : recu, brouillon, en_attente, en_retard. ⚠️ « recu » '
    'est testé EN PREMIER : un questionnaire reçu en retard est reçu, et l''afficher en '
    'retard enverrait relancer quelqu''un qui a déjà répondu. ⚠️ Un BROUILLON n''est pas '
    'un retard : compter les brouillons parmi les retards fabriquerait des alertes que '
    'l''utilisateur s''est infligées à lui-même, et la première chose qu''on fait d''une '
    'alerte sans objet est de cesser de la lire.';

grant execute on function f_etat_questionnaire(date, date, date) to grc_app;

-- =====================================================================================
-- §4 — LE DOMAINE « type_entite » ADMET LES DEUX TABLES
-- =====================================================================================
-- Le piège du §40.1 : une table absente du domaine est INCRÉABLE, toute création
-- écrivant au journal. On LIT le prédicat appliqué, et l'on refuse d'agir s'il a changé.

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
    if position('''questionnaires_tiers''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà les questionnaires : rejeu, rien à faire.';
        return;
    end if;
    if position('''prestataire_sous_traitance''' in v_predicat) = 0 then
        raise exception 'La valeur « prestataire_sous_traitance » est introuvable dans le '
                        'prédicat appliqué de type_entite_check : son texte a changé, et '
                        'la substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, '''prestataire_sous_traitance''',
                      '''prestataire_sous_traitance'', ''questionnaires_tiers'', '
                      '''questionnaire_reponses''');

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais les deux tables du questionnaire fournisseur.';
end;
$$;

-- =====================================================================================
-- §5 — CLOISONNEMENT
-- =====================================================================================

alter table questionnaires_tiers   enable row level security;
alter table questionnaires_tiers   force  row level security;
alter table questionnaire_reponses enable row level security;
alter table questionnaire_reponses force  row level security;

drop policy if exists pol_questionnaires_tiers_lecture     on questionnaires_tiers;
drop policy if exists pol_questionnaires_tiers_ajout       on questionnaires_tiers;
drop policy if exists pol_questionnaires_tiers_maj         on questionnaires_tiers;
drop policy if exists pol_questionnaires_tiers_suppression on questionnaires_tiers;

create policy pol_questionnaires_tiers_lecture on questionnaires_tiers for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_questionnaires_tiers_ajout on questionnaires_tiers for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_questionnaires_tiers_maj on questionnaires_tiers for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_questionnaires_tiers_suppression on questionnaires_tiers for delete
    using (filiale_id = f_filiale_ecriture());

drop policy if exists pol_questionnaire_reponses_lecture     on questionnaire_reponses;
drop policy if exists pol_questionnaire_reponses_ajout       on questionnaire_reponses;
drop policy if exists pol_questionnaire_reponses_maj         on questionnaire_reponses;
drop policy if exists pol_questionnaire_reponses_suppression on questionnaire_reponses;

create policy pol_questionnaire_reponses_lecture on questionnaire_reponses for select
    using (filiale_id = any (f_filiales_lecture()));
create policy pol_questionnaire_reponses_ajout on questionnaire_reponses for insert
    with check (filiale_id = f_filiale_ecriture());
create policy pol_questionnaire_reponses_maj on questionnaire_reponses for update
    using (filiale_id = f_filiale_ecriture()) with check (filiale_id = f_filiale_ecriture());
create policy pol_questionnaire_reponses_suppression on questionnaire_reponses for delete
    using (filiale_id = f_filiale_ecriture());

comment on policy pol_questionnaires_tiers_lecture on questionnaires_tiers is
    'Un questionnaire appartient TOUJOURS à la filiale qui l''a envoyé : c''est elle qui '
    'décide ce qu''elle exige de SON fournisseur. Deux filiales peuvent légitimement '
    'interroger la même société sur deux référentiels différents, et une portée Groupe '
    'ferait de l''exigence de l''une celle de toutes.';

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant select, insert, update, delete on questionnaires_tiers to grc_app';
        execute 'grant select, insert, update, delete on questionnaire_reponses to grc_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant select on questionnaires_tiers to grc_lecture';
        execute 'grant select on questionnaire_reponses to grc_lecture';
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
--
-- ⚠️ Et ce n'est pas théorique ici : le questionnaire rempli **revient sous forme de
-- fichier**, et c'est au questionnaire qu'on l'attache. Sans ce déclencheur, supprimer
-- un envoi laisserait le classeur du fournisseur en base, sur le disque, dans le quota
-- de la filiale, et `GET /api/pieces/…` continuerait de le délivrer (Q-232 / Q-233).

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
-- ⚠️ Il **ÉPROUVE** la dérivation (§39.1) au lieu de lire le texte de la fonction : un
-- garde qui vérifierait que `f_etat_questionnaire` « existe » passerait au vert sur une
-- version qui rend « recu » pour tout le monde — c'est-à-dire sur celle qui déclare
-- tous les fournisseurs évalués.

create or replace function f_verifier_questionnaires_tiers()
returns table (objet text, anomalie text, detail text)
    language plpgsql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_hier   constant date := current_date - 1;
    v_demain constant date := current_date + 1;
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('envoye', v_hier::text, 'echeance', v_hier::text,
            'recu', v_hier::text, 'attendu', 'recu',
            'effet', 'UN QUESTIONNAIRE DÉJÀ REÇU serait affiché « en retard », et l''on '
                     'relancerait un fournisseur qui a répondu — la façon la plus sûre '
                     'de faire cesser de lire les relances'),
        jsonb_build_object('envoye', null, 'echeance', v_hier::text,
            'recu', null, 'attendu', 'brouillon',
            'effet', 'UN BROUILLON serait compté parmi les retards : le produit '
                     'fabriquerait des alertes que son utilisateur s''est infligées à '
                     'lui-même, et la première chose qu''on fait d''une alerte sans objet '
                     'est de cesser de la lire'),
        jsonb_build_object('envoye', v_hier::text, 'echeance', v_hier::text,
            'recu', null, 'attendu', 'en_retard',
            'effet', 'UN RETARD CESSERAIT D''ÊTRE VU. C''est le défaut que toute '
                     'l''action 21.2 existe pour empêcher : un questionnaire envoyé et '
                     'jamais revenu, dans un dossier qui sert à démontrer la maîtrise '
                     'de sa chaîne d''approvisionnement'),
        jsonb_build_object('envoye', v_hier::text, 'echeance', v_demain::text,
            'recu', null, 'attendu', 'en_attente',
            'effet', 'un questionnaire encore dans les temps serait annoncé en retard, '
                     'et l''on relancerait un fournisseur qui n''a rien à se reprocher'),
        jsonb_build_object('envoye', v_hier::text, 'echeance', null,
            'recu', null, 'attendu', 'en_attente',
            'effet', 'un questionnaire sans échéance serait rangé ailleurs qu''en '
                     'attente — or on attend, et rien ne dit qu''on attend trop')
    );
    v_cas_un jsonb;
    v_rendu  text;
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('table','questionnaires_tiers',
            'nom','fk_questionnaires_tiers_prestataire',
            'effet','le rattachement au tiers n''est plus cloisonné : une ligne INVISIBLE '
                   'de la filiale voisine satisfait la clé (CONVENTIONS §17.1), et l''on '
                   'adresse un questionnaire à une société qu''on ne voit pas'),
        jsonb_build_object('table','questionnaires_tiers',
            'nom','ck_questionnaires_tiers_reception',
            'effet','un questionnaire peut être REÇU sans avoir été envoyé : la '
                   'chronologie ment, et c''est elle qui décide de ce qui est en retard'),
        jsonb_build_object('table','questionnaires_tiers',
            'nom','ck_questionnaires_tiers_relance',
            'effet','on peut RELANCER un questionnaire jamais envoyé'),
        jsonb_build_object('table','questionnaire_reponses',
            'nom','fk_questionnaire_reponses_questionnaire',
            'effet','les réponses ne suivent plus leur envoi : elles survivraient à sa '
                   'suppression, orphelines et invisibles'),
        jsonb_build_object('table','questionnaire_reponses',
            'nom','uq_questionnaire_reponses_question',
            'effet','LE RÉIMPORT CESSE D''ÊTRE IDEMPOTENT. Le moteur d''import CRÉE sans '
                   'mettre à jour : sans cette unicité, un second passage du même fichier '
                   'DOUBLE les réponses en silence, et tous les comptes deviennent faux'),
        jsonb_build_object('table','questionnaire_reponses',
            'nom','ck_questionnaire_reponses_reponse',
            'effet','le vocabulaire des réponses n''est plus fermé : « oui, mais » entre, '
                   'et aucun décompte n''est plus possible')
    );
    v_piece jsonb;
begin
    if to_regprocedure('public.f_etat_questionnaire(date, date, date)') is null then
        objet    := 'f_etat_questionnaire';
        anomalie := 'derivation_questionnaire_absente';
        detail   := 'La fonction qui dit où en est un questionnaire fournisseur a '
                    'disparu. Sans elle, « en retard » redeviendrait une colonne — '
                    'c''est-à-dire une valeur que quelque chose doit remettre, et qui '
                    'ment le jour où ce quelque chose ne tourne pas.';
        return next;
        return;
    end if;

    for v_cas_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := f_etat_questionnaire(
            (v_cas_un ->> 'envoye')::date,
            (v_cas_un ->> 'echeance')::date,
            (v_cas_un ->> 'recu')::date);
        if v_rendu is distinct from (v_cas_un ->> 'attendu') then
            objet    := 'f_etat_questionnaire';
            anomalie := 'derivation_questionnaire_fausse';
            detail   := format(
                'Envoyé « %s », échéance « %s », reçu « %s » : la fonction rend « %s » '
                'au lieu de « %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE la '
                'dérivation sur des valeurs témoins — il ne lit pas le texte de la '
                'fonction (§39.1).',
                coalesce(v_cas_un ->> 'envoye', '(jamais)'),
                coalesce(v_cas_un ->> 'echeance', '(aucune)'),
                coalesce(v_cas_un ->> 'recu', '(pas encore)'),
                coalesce(v_rendu, '(null)'), v_cas_un ->> 'attendu',
                v_cas_un ->> 'effet');
            return next;
        end if;
    end loop;

    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (
            select 1 from pg_constraint c
             where c.conrelid = to_regclass('public.' || (v_piece ->> 'table'))
               and c.conname = v_piece ->> 'nom'
               and c.convalidated)
        then
            objet    := (v_piece ->> 'table') || '.' || (v_piece ->> 'nom');
            anomalie := 'questionnaire_piece_manquante';
            detail   := format('Cette pièce de l''action 21.2 a disparu ou n''est pas '
                               'validée. Ce que sa disparition rouvre : %s.',
                               v_piece ->> 'effet');
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_questionnaires_tiers() is
    'Garde-fou de l''action 21.2 : la dérivation de l''état est ÉPROUVÉE sur CINQ cas '
    'témoins (§39.1) — dont « reçu en retard reste reçu » et « un brouillon n''est pas '
    'un retard » —, et les six pièces du schéma sont nommées UNE PAR UNE (§39.7). '
    'Découvert par f_decouvrir_controles_schema().';

grant execute on function f_verifier_questionnaires_tiers() to grc_app;

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
        raise exception 'Le schéma est en défaut après 043 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, questionnaires compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('043', 'le questionnaire fournisseur : l''envoi et les réponses se rangent, les '
               'QUESTIONS restent au catalogue, l''état se DÉRIVE, et le réimport est '
               'idempotent PAR LA CONTRAINTE (21.2)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_questionnaires_tiers();
--   delete from controles_schema where fonction = 'f_verifier_questionnaires_tiers';
--   drop table if exists questionnaire_reponses;
--   drop table if exists questionnaires_tiers;
--   drop function if exists f_etat_questionnaire(date, date, date);
--   delete from colonnes_personnelles
--    where table_nom in ('questionnaires_tiers', 'questionnaire_reponses');
--   delete from migrations_schema where version = '043';
--   commit;
-- ⚠️ Annuler DÉTRUIT les réponses des fournisseurs, qui ne se redemandent pas d'un
--    claquement de doigts. Exporter d'abord.
-- =====================================================================================
