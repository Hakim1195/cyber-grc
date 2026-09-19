-- =====================================================================================
--  051 — LES CATALOGUES DE RÉFÉRENTIELS ENTRENT EN BASE
--
--  §0   Le périmètre de la migration
--  §1   Le référentiel — MIXTE, versionné, daté
--  §2   Les domaines
--  §3   Les exigences — ⚠️ LES CODES SONT LA CLÉ DE VOÛTE
--  §4   Les traductions — un document figé par langue
--  §4 bis  Ce que toute table métier doit à trois garde-fous déjà posés
--  §5   `referentiels_actifs.ref_id` devient un VRAI lien — et `evaluations`, non
--  §6   La veille : l'ancienneté se DÉRIVE (action 26.5)
--  §7   `type_entite`
--  §8   Cloisonnement
--  §9   LE SEMIS — les six catalogues livrés, engendrés depuis les fichiers source
--  §10  Le garde-fou
--  §11  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — lot L26 du `docs/PLAN_PRODUIT.md`
--
--  Les référentiels sont aujourd'hui des **fichiers JavaScript versionnés**. Trois
--  conséquences, et aucune n'est théorique :
--
--    • une évolution de norme est une **livraison de code** — ISO 27002 passera un jour
--      à sa révision suivante, et il faudra un déploiement pour en tenir compte ;
--    • un client **ne peut pas apporter sa propre grille**, alors que chaque donneur
--      d'ordre de la filière aéronautique a la sienne ;
--    • rien ne **date** les catalogues : personne ne sait, en ouvrant le produit, que le
--      guide d'hygiène de l'ANSSI qu'il évalue a été publié en 2017.
--
--  ── ⚠️ LE CRITÈRE QUI GOUVERNE TOUTE LA MIGRATION, ET IL EST ÉTROIT ───────────────
--
--    *« Les auto-évaluations sont stockées par `(ref_id, code)` : la migration conserve
--      les codes À L'OCTET PRÈS, et un essai compare le catalogue migré au catalogue
--      source, exigence par exigence. Une divergence silencieuse réattribuerait des
--      réponses d'audit. »*
--
--  C'est le motif du constat **Q-192**, celui qui a fait refuser la renumérotation du
--  catalogue ANSSI : **renuméroter réattribue en silence**, dans l'outil qui sert de
--  preuve en audit ISO 27001. Le §9 de cette migration n'a donc pas été tapé à la main :
--  il a été **engendré** depuis `backend/db/catalogues/*.js`, et le garde-fou du §10
--  rapproche la base de ces mêmes fichiers, exigence par exigence, à chaque déploiement.
--
--  ── CE QUE CETTE MIGRATION NE FAIT PAS ───────────────────────────────────────────
--
--  **Elle ne touche pas à `evaluations`.** Aucune colonne, aucune clé étrangère, aucune
--  réécriture : une auto-évaluation produite hier continue de désigner le même couple
--  `(ref_id, code)`, et ce couple continue de désigner la même exigence. C'est vérifié
--  par le §10, qui compare les codes au fichier source — pas par une phrase.
--
--  ⚠️ **Et l'absence de clé étrangère sur `evaluations.ref_id` est DÉLIBÉRÉE**, voir le
--  §5 : une évaluation doit survivre à l'archivage du catalogue qui l'a produite, sans
--  quoi le produit perdrait l'historique au moment précis où une norme évolue.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Le §9 écrit des lignes de portée Groupe, que la politique d'ajout réserve à
-- l'administration Groupe ; le §5 ajoute une clé étrangère, qui VALIDE les lignes
-- existantes de `referentiels_actifs` — table cloisonnée, et `force row level security`
-- vaut pour le propriétaire. Règle du `CONVENTIONS.md` §42 : le groupe ENTIER.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-051', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    perform set_config('grc.administration_groupe', 'oui', true);
    -- ⚠️ **La provenance se DÉCLARE ici, elle ne s'écrit pas dans les `insert`.** Le
    -- déclencheur `f_marquer_provenance()` ÉCRASE ce que l'appelant met dans la colonne —
    -- une marque forgeable ne prouve rien (migration `032`). Les 470 lignes du §9 sont
    -- donc marquées `socle` par ce réglage, et par lui seul.
    perform set_config('grc.provenance', 'socle', true);
end;
$$;

-- =====================================================================================
-- §1 — LE RÉFÉRENTIEL — MIXTE, VERSIONNÉ, DATÉ
-- -------------------------------------------------------------------------------------
-- MIXTE, comme `risque_catalogue`, `ebios_connaissances` et `echelles` : `filiale_id`
-- nul = catalogue du socle, lisible de toutes les filiales ; renseigné = grille apportée
-- par une filiale (action 26.2).
--
-- ── ⚠️ POURQUOI L'IDENTIFIANT EST CELUI DU FICHIER, ET PAS UN `REFT-…` ────────────
--
-- `evaluations.ref_id` porte déjà `'anssi-hygiene'`, `'iso-27002-2022'`, `'dora'`. Ces
-- chaînes sont dans les bases de production ; elles sont la moitié gauche du couple
-- `(ref_id, code)` par lequel toute auto-évaluation est stockée. Leur donner un
-- identifiant neuf et une table de correspondance serait exactement la renumérotation
-- que le constat **Q-192** a fait refuser : le lien se ferait par une jointure de plus,
-- et un oubli réattribuerait en silence.
--
-- ⚠️ **Conséquence à connaître** : ces identifiants ne suivent pas la forme
-- `<PRÉFIXE>-<horodatage>-<aléa>` du `CONVENTIONS.md` §2. C'est licite — le §2 borne ce
-- que le produit **fabrique**, et ceux-ci sont **repris de l'existant**. Un référentiel
-- créé par le produit, lui, reçoit bien un `REFT-…` engendré (`default`).
--
-- ── LE VERSIONNAGE (action 26.3), ET POURQUOI IL NE SE FAIT PAS EN PLACE ──────────
--
-- Une révision de norme n'est **pas** une modification de la précédente : c'est un autre
-- référentiel, avec ses codes à lui. ISO 27002:2022 a renuméroté l'intégralité de la
-- version 2013 — 114 mesures devenues 93. Réécrire en place aurait réattribué toutes les
-- évaluations existantes, en silence.
--
-- Le mécanisme est donc : **un nouveau référentiel, qui `remplace_id` l'ancien**, et
-- l'ancien s'ARCHIVE sans disparaître. Les évaluations d'hier continuent de désigner le
-- catalogue d'hier — ce qui est la vérité — et la reprise des réponses vers la nouvelle
-- version est un geste **explicite**, code par code, que l'action 26.3 rend possible et
-- que personne ne fait à la place de l'utilisateur.
-- =====================================================================================

create table if not exists referentiels (
    id         id_metier   not null default f_generer_id('REFT'),
    -- Nul = catalogue du socle du Groupe. Renseigné = grille propre à une filiale.
    filiale_id id_metier,

    nom         text not null,
    editeur     text,
    -- ⚠️ La version du TEXTE de la norme — « 42 mesures », « Annexe A · 93 mesures ».
    -- Elle ne peut PAS s'appeler « version » : cette colonne existe sur toute table
    -- métier et porte le verrouillage optimiste (risque P1 du `PLAN_SERVEUR`). C'est
    -- exactement le précédent de `documents.version_document`, et l'alias du registre
    -- des entités rend le champ au navigateur sous son nom de toujours, « version ».
    version_referentiel text,
    description text,
    aide        text,

    -- Comment le référentiel se COMPTE. `conformite` = Oui / Non / N-A sans maturité
    -- CMMI (AirCyber) ; `maturite` = cotation CMMI de 0 à 5. ⚠️ Vocabulaire FERMÉ : un
    -- troisième mode ferait diverger le score affiché de celui du tableau de bord.
    scoring     text not null default 'maturite',

    -- Prose libre expliquant un écart de numérotation avec le texte officiel — le cas
    -- du catalogue ANSSI (constat Q-192). Nul quand il n'y a rien à dire.
    note_numerotation text,
    -- Correspondance « code du catalogue » → « numéro officiel », quand elle diffère.
    -- ⚠️ `jsonb` et non une table : c'est un DOCUMENT FIGÉ qui accompagne le catalogue
    -- (`PLAN_SERVEUR`, pièges à ne pas rouvrir), au même titre que la grille d'un audit.
    codes_officiels jsonb,
    -- Étiquettes des domaines de classification CL0-CL6 (AirCyber). Même régime.
    cl_labels       jsonb,

    -- ── LE VERSIONNAGE (action 26.3) ─────────────────────────────────────────────
    revision      integer not null default 1,
    statut        text    not null default 'en_vigueur',
    remplace_id   id_metier,
    en_vigueur_le date,
    archive_le    date,

    -- ── LA VEILLE (action 26.5) ──────────────────────────────────────────────────
    -- Date de parution du TEXTE, pas de son import. ⚠️ Nulle quand elle est inconnue —
    -- et « inconnue » se dit à l'écran. Inventer une date rendrait le signal
    -- d'ancienneté faux DANS LE SENS RASSURANT.
    publie_le            date,
    -- Au-delà de ce nombre de mois depuis `publie_le`, le produit SIGNALE. Nul = pas de
    -- signal pour ce catalogue.
    duree_alerte_mois    integer,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_referentiels primary key (id),
    constraint fk_referentiels_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- Clé SIMPLE vers une table MIXTE : même arbitrage qu'à `echelles.remplace_id` —
    -- une clé composite rendrait le socle du Groupe inatteignable depuis une filiale.
    constraint fk_referentiels_remplace foreign key (remplace_id)
        references referentiels (id) on delete restrict,

    constraint ck_referentiels_nom     check (nom <> ''),
    constraint ck_referentiels_scoring check (scoring in ('maturite', 'conformite')),
    constraint ck_referentiels_statut  check (statut in ('en_vigueur', 'archive')),
    constraint ck_referentiels_revision check (revision >= 1),
    -- L'archivage se DATE, dans les deux sens : un archivé sans date et une date sans
    -- archivage sont deux incohérences, et l'égalité stricte les interdit d'un coup.
    constraint ck_referentiels_archive check ((statut = 'archive') = (archive_le is not null)),
    constraint ck_referentiels_dates   check (archive_le is null or en_vigueur_le is null
                                              or archive_le >= en_vigueur_le),
    constraint ck_referentiels_remplace_soi check (remplace_id is null or remplace_id <> id),
    constraint ck_referentiels_alerte  check (duree_alerte_mois is null
                                              or duree_alerte_mois between 1 and 600),
    -- Bornes de saisie — contrôle S13.
    constraint ck_referentiels_longueurs check (
        length(nom) <= 200
        and (editeur is null or length(editeur) <= 120)
        and (version_referentiel is null or length(version_referentiel) <= 120)
        and (description is null or length(description) <= 4000)
        and (aide is null or length(aide) <= 4000)
        and (note_numerotation is null or length(note_numerotation) <= 2000))
);

comment on table referentiels is
    'Catalogue de référentiel (lot L26, action 26.1). MIXTE : filiale_id nul = catalogue '
    'du socle, renseigné = grille apportée par une filiale (26.2). ⚠️ L''identifiant est '
    'celui que « evaluations.ref_id » porte DÉJÀ — « anssi-hygiene », « dora » : lui en '
    'donner un neuf aurait été la renumérotation que le constat Q-192 a fait refuser. '
    '⚠️ Une révision de norme est un AUTRE référentiel qui « remplace_id » le précédent, '
    'jamais une réécriture en place : ISO 27002:2022 a renuméroté les 114 mesures de 2013 '
    'en 93, et réécrire aurait réattribué toutes les évaluations EN SILENCE.';
comment on column referentiels.publie_le is
    'Date de parution du TEXTE, pas de son import (action 26.5). ⚠️ NULLE quand elle est '
    'inconnue, et « inconnue » s''affiche : inventer une date rendrait le signal '
    'd''ancienneté faux dans le sens rassurant.';
comment on column referentiels.codes_officiels is
    'Correspondance code du catalogue → numéro officiel, quand ils diffèrent (constat '
    'Q-192, catalogue ANSSI). Document FIGÉ qui accompagne le catalogue, d''où le jsonb.';
comment on column referentiels.version_referentiel is
    '⚠️ Version du TEXTE de la norme (« 42 mesures », « Annexe A · 93 mesures »), et non '
    'le verrouillage optimiste — celui-ci s''appelle « version » sur toute table métier. '
    'C''est le précédent exact de documents.version_document : deux sens sous un nom est '
    'le motif du bloquant du 6ᵉ passage de la porte S2, et le registre des entités rend '
    'ce champ au navigateur sous son nom de toujours grâce à un alias.';

-- =====================================================================================
-- §2 — LES DOMAINES
-- -------------------------------------------------------------------------------------
-- Ce que le produit appelle « domaine » et la norme « thème », « chapitre » ou
-- « famille ». Ils portent le radar, les moyennes par thème et le regroupement des
-- écrans.
--
-- ⚠️ **`code` et non `id` pour la clé métier** : les traductions indexent les exigences
-- par `<code du domaine>/<code de l'exigence>`, et rien n'interdit à deux domaines de
-- porter le même code d'exigence. C'est écrit dans les fichiers source, et c'est le
-- défaut que cette indexation évite : *une traduction mal alignée mettrait le texte
-- d'une exigence sous une autre — un défaut qui se lit parfaitement et qui est
-- entièrement faux*.
-- =====================================================================================

create table if not exists referentiel_domaines (
    id             id_metier not null default f_generer_id('REFD'),
    filiale_id     id_metier,
    referentiel_id id_metier not null,

    code  text    not null,
    nom   text    not null,
    court text,
    aide  text,
    rang  integer not null default 1,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_referentiel_domaines primary key (id),
    constraint fk_referentiel_domaines_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- Clé SIMPLE vers une table MIXTE (même arbitrage qu'au §1) ; `cascade` parce qu'un
    -- domaine sans son référentiel n'est rien.
    constraint fk_referentiel_domaines_referentiel foreign key (referentiel_id)
        references referentiels (id) on delete cascade,

    constraint ck_referentiel_domaines_code check (code <> ''),
    constraint ck_referentiel_domaines_nom  check (nom <> ''),
    constraint ck_referentiel_domaines_rang check (rang >= 1),
    constraint ck_referentiel_domaines_longueurs check (
        length(code) <= 64 and length(nom) <= 300
        and (court is null or length(court) <= 120)
        and (aide is null or length(aide) <= 4000))
);

-- ⚠️ `nulls not distinct` : le socle du Groupe a `filiale_id` nul PAR CONSTRUCTION, et
-- une unicité ordinaire y laisserait deux domaines de même code sous le même
-- référentiel, sans un mot (`CONVENTIONS.md` §45, découvert à la migration `049`).
create unique index if not exists uq_referentiel_domaines_code
    on referentiel_domaines (filiale_id, referentiel_id, code) nulls not distinct;

-- ⚠️ **La cible de la clé COMPOSITE du §3.** Sans elle, une exigence pourrait déclarer
-- un `referentiel_id` qui n'est pas celui de son domaine — et le code, qui est la moitié
-- droite de `evaluations(ref_id, code)`, se retrouverait compté sous le mauvais
-- référentiel. L'invariant est ainsi POSÉ par le schéma, pas surveillé par un garde.
-- ⚠️ Posée sous condition, et non par « drop … if exists » suivi d'un « add » : la clé
-- COMPOSITE du §3 en DÉPEND, et le `drop` échouerait au rejeu de la migration sur une
-- base déjà migrée. Une migration doit pouvoir être rejouée (`CONVENTIONS.md` §13).
do $$
begin
    if not exists (select 1 from pg_constraint
                    where conrelid = to_regclass('public.referentiel_domaines')
                      and conname = 'uq_referentiel_domaines_id_referentiel')
    then
        alter table referentiel_domaines
            add constraint uq_referentiel_domaines_id_referentiel unique (id, referentiel_id);
    end if;
end;
$$;

comment on table referentiel_domaines is
    'Thème, chapitre ou famille d''un référentiel (action 26.1). Porte le radar et les '
    'moyennes par thème. ⚠️ Les traductions indexent les exigences par « code du '
    'domaine / code de l''exigence » : deux domaines peuvent porter le même code '
    'd''exigence, et une indexation par le seul code mettrait le texte de l''une sous '
    'l''autre — un défaut qui se lit parfaitement et qui est entièrement faux.';

-- =====================================================================================
-- §3 — LES EXIGENCES — ⚠️ LES CODES SONT LA CLÉ DE VOÛTE
-- -------------------------------------------------------------------------------------
-- ⚠️ **`code` EST la moitié droite de la clé par laquelle toute auto-évaluation est
-- stockée** (`evaluations(ref_id, code)`). Il n'est pas un libellé : c'est un
-- identifiant de fait, présent dans les bases de production, cité dans les rapports
-- d'audit déjà rendus, et lu par des humains qui rapprochent l'écran du texte officiel.
--
-- Le semis du §9 le conserve à l'octet près — il est ENGENDRÉ depuis les fichiers
-- source — et le garde-fou du §10 le rapproche de ces mêmes fichiers à chaque
-- déploiement. *Une divergence silencieuse réattribuerait des réponses d'audit.*
-- =====================================================================================

create table if not exists referentiel_exigences (
    id         id_metier not null default f_generer_id('REFE'),
    filiale_id id_metier,
    domaine_id id_metier not null,
    -- ⚠️ **PORTÉ, et non déduit par jointure.** C'est la moitié gauche de la clé
    -- `evaluations(ref_id, code)`, et l'unicité dont dépend tout le lot — *un code est
    -- unique DANS UN RÉFÉRENTIEL* — ne peut pas s'exprimer sans lui. Il ne peut pas
    -- diverger du domaine : la clé étrangère ci-dessous est COMPOSITE et va le chercher
    -- dans `referentiel_domaines (id, referentiel_id)`.
    referentiel_id id_metier not null,

    code   text    not null,
    titre  text    not null,
    aide   text,
    rang   integer not null default 1,

    -- Métadonnées d'AirCyber : niveau de label, priorité, domaine de classification.
    -- Nulles ailleurs, et nulles aussi pour les 78 questions d'AirCyber qui n'en ont
    -- pas — ce que le radar par CL traite explicitement, au lieu de les ranger d'office.
    niveau   text,
    priorite text,
    cl       text,
    -- Numéro de la mesure DANS LE TEXTE OFFICIEL, quand il diffère du code (Q-192).
    code_officiel text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_referentiel_exigences primary key (id),
    constraint fk_referentiel_exigences_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- ⚠️ COMPOSITE — et ce n'est pas la composition habituelle avec `filiale_id` : c'est
    -- celle qui interdit à une exigence de déclarer un référentiel autre que celui de
    -- son domaine. Une clé simple sur `domaine_id` aurait laissé les deux diverger, et
    -- le code se serait retrouvé compté sous le mauvais référentiel — c'est-à-dire
    -- rattaché aux auto-évaluations d'un autre.
    constraint fk_referentiel_exigences_domaine foreign key (domaine_id, referentiel_id)
        references referentiel_domaines (id, referentiel_id) on delete cascade,

    constraint ck_referentiel_exigences_code  check (code <> ''),
    constraint ck_referentiel_exigences_titre check (titre <> ''),
    constraint ck_referentiel_exigences_rang  check (rang >= 1),
    -- ⚠️ Vocabulaires FERMÉS sur les deux métadonnées qui pilotent un filtre d'écran :
    -- une valeur hors vocabulaire ne serait proposée par aucun bouton, et l'exigence
    -- deviendrait invisible du panneau « préparation au label » sans un message.
    constraint ck_referentiel_exigences_niveau check (
        niveau is null or niveau in ('bronze', 'silver', 'gold')),
    constraint ck_referentiel_exigences_priorite check (
        priorite is null or priorite in ('low', 'medium', 'high')),
    constraint ck_referentiel_exigences_longueurs check (
        length(code) <= 64 and length(titre) <= 2000
        and (aide is null or length(aide) <= 4000)
        and (cl is null or length(cl) <= 32)
        and (code_officiel is null or length(code_officiel) <= 64))
);

-- ⚠️ **L'UNICITÉ DONT DÉPEND TOUT LE LOT, et elle porte le RÉFÉRENTIEL, pas le
-- domaine.** `evaluations` stocke par `(ref_id, code)` : deux exigences de même code
-- dans deux domaines d'un même référentiel rendraient ce couple AMBIGU, et une réponse
-- d'audit désignerait deux questions à la fois. Mesuré sur les six catalogues livrés :
-- 424 codes, 424 distincts par référentiel — ce n'est pas un hasard, c'est la condition
-- que le modèle de stockage impose depuis la v3 du schéma.
create unique index if not exists uq_referentiel_exigences_code
    on referentiel_exigences (filiale_id, referentiel_id, code) nulls not distinct;

create index if not exists ix_referentiel_exigences_domaine
    on referentiel_exigences (domaine_id, rang);

comment on table referentiel_exigences is
    'Exigence, mesure ou question d''un référentiel (action 26.1). ⚠️ « code » EST la '
    'moitié droite de la clé par laquelle toute auto-évaluation est stockée '
    '(evaluations(ref_id, code)) : il est un identifiant de fait, présent dans les bases '
    'de production et cité dans les rapports d''audit déjà rendus. Le semis le conserve à '
    'l''octet près — il est ENGENDRÉ depuis les fichiers source — et f_verifier_catalogues() '
    'le rapproche de ces fichiers à chaque déploiement.';
comment on column referentiel_exigences.code_officiel is
    'Numéro de la mesure dans le TEXTE officiel, quand il diffère du code du catalogue '
    '(constat Q-192 : treize codes ANSSI sur quarante-deux). L''écart est AFFICHÉ, pas '
    'corrigé — renuméroter réattribuerait les évaluations en silence.';

-- =====================================================================================
-- §4 — LES TRADUCTIONS — UN DOCUMENT FIGÉ PAR LANGUE
-- -------------------------------------------------------------------------------------
-- ⚠️ **`jsonb`, et c'est un des rares endroits où il est justifié.** Le `PLAN_SERVEUR`
-- réserve le JSONB aux **documents figés** ; un dictionnaire de traduction en est un :
-- il accompagne le catalogue, il s'écrit d'un bloc, il se relit d'un bloc, et aucune de
-- ses entrées n'est interrogée séparément par une requête.
--
-- Le relationnel aurait coûté **970 lignes par langue** sans rien apporter : ni
-- contrainte utile (la clé d'une entrée est un chemin, pas une référence), ni requête
-- (le produit charge le dictionnaire entier pour rendre un écran).
--
-- ⚠️ **Le repli est le FRANÇAIS, chaîne par chaîne, et il l'était déjà.** Une exigence
-- non traduite reste parfaitement utilisable — dégradée, pas perdue. C'est l'inverse de
-- la règle de l'interface (§37.2), où une clé manquante rend la clé : un écran anglais à
-- moitié français aurait l'air fini. Une exigence dont le titre s'afficherait
-- « iso-27002-2022/5.1.titre » ne serait plus une exigence.
-- =====================================================================================

create table if not exists referentiel_traductions (
    id             id_metier not null default f_generer_id('REFX'),
    filiale_id     id_metier,
    referentiel_id id_metier not null,

    langue       text  not null,
    dictionnaire jsonb not null,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_referentiel_traductions primary key (id),
    constraint fk_referentiel_traductions_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_referentiel_traductions_referentiel foreign key (referentiel_id)
        references referentiels (id) on delete cascade,

    -- Vocabulaire fermé : les langues du produit (`CONVENTIONS.md` §37). Le français est
    -- la SOURCE et n'a pas de dictionnaire — l'y admettre créerait une seconde source du
    -- texte français, qui divergerait du catalogue (constat Q-219).
    constraint ck_referentiel_traductions_langue check (langue in ('en', 'es')),
    constraint ck_referentiel_traductions_objet check (
        jsonb_typeof(dictionnaire) = 'object')
);

create unique index if not exists uq_referentiel_traductions_langue
    on referentiel_traductions (filiale_id, referentiel_id, langue) nulls not distinct;

comment on table referentiel_traductions is
    'Dictionnaire de traduction d''un catalogue, un par langue (lot L11, porté en base '
    'par l''action 26.1). ⚠️ jsonb : c''est un DOCUMENT FIGÉ qui accompagne le catalogue, '
    'écrit et relu d''un bloc — le relationnel aurait coûté 970 lignes par langue sans '
    'apporter ni contrainte ni requête. ⚠️ Le FRANÇAIS n''y figure pas : il est la '
    'source, et l''y admettre en ferait une seconde source qui divergerait (Q-219).';

-- =====================================================================================
-- §4 bis — CE QUE TOUTE TABLE MÉTIER DOIT À TROIS GARDE-FOUS DÉJÀ POSÉS
-- -------------------------------------------------------------------------------------
-- La marque de provenance (`032`), la traçabilité à l'insertion (`CONVENTIONS.md` §18.1)
-- et le registre de l'article 30 (`026`). Les trois mêmes qu'aux migrations `046` et
-- `049`, et pour les mêmes motifs : sans la première, la purge du jeu de découverte ne
-- distingue pas un catalogue semé d'un catalogue importé ; sans la deuxième, « version »
-- cesse d'être un compteur et le verrouillage optimiste tombe ; sans la troisième, une
-- colonne textuelle n'a pas de décision.
--
-- ⚠️ **La provenance `socle`, née à la migration `049`, sert ICI pour la première fois à
-- ce pour quoi elle a été créée.** Les 470 lignes du §9 ne sont ni saisies, ni de
-- découverte, ni reprises : elles sont livrées par une migration. Sans cette quatrième
-- valeur, le jeu de découverte refuserait de se charger sur une base neuve — *« la base
-- porte déjà 470 ligne(s) qui ne viennent pas du jeu de découverte »* — et le contrôle
-- « la base porte-t-elle des données réelles ? » serait faux pour tout le parc.
-- =====================================================================================

alter table referentiels             add column if not exists provenance provenance_ligne not null;
alter table referentiel_domaines     add column if not exists provenance provenance_ligne not null;
alter table referentiel_exigences    add column if not exists provenance provenance_ligne not null;
alter table referentiel_traductions  add column if not exists provenance provenance_ligne not null;

do $$
declare v_table text;
begin
    foreach v_table in array array['referentiels', 'referentiel_domaines',
                                   'referentiel_exigences', 'referentiel_traductions'] loop
        execute format('drop trigger if exists trg_%s_provenance on %I', v_table, v_table);
        execute format('create trigger trg_%s_provenance before insert on %I '
                       'for each row execute function f_marquer_provenance()',
                       v_table, v_table);
        execute format('drop trigger if exists trg_%s_maj on %I', v_table, v_table);
        execute format('create trigger trg_%s_maj before update on %I '
                       'for each row execute function f_maj_tracabilite()', v_table, v_table);
    end loop;
end;
$$;

do $$
declare v_poses integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    raise notice 'Traçabilité à l''insertion : % table(s) équipée(s).', v_poses;
end;
$$;

-- ── Le registre de l'article 30 ───────────────────────────────────────────────────────
--
-- ⚠️ **Toutes « non personnelles », et pour une fois la réponse est franche.** Un
-- catalogue de référentiel est un TEXTE DE NORME, ou sa reformulation : il décrit des
-- pratiques de sécurité, jamais des gens. Aucun de ces champs n'est une saisie libre
-- dont le sujet pourrait être quelqu'un — à la différence de `derogations.motif` ou de
-- `risque_quantification.hypotheses`, qui relèvent du régime « signaler » précisément
-- parce que leur sujet peut en appeler un.
--
-- ⚠️ **Sauf que la grille IMPORTÉE par un client, elle, n'est pas écrite par nous** (action
-- 26.2). Le régime retenu pour les deux champs de prose les plus longs — `description` et
-- `aide` — est donc « signaler » : un donneur d'ordre peut parfaitement écrire « contact :
-- Untel » dans l'aide d'une question. On ne purge pas à l'aveugle un texte de norme ; on
-- signale, et un humain tranche.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('referentiels', 'nom', 'non_personnelle', null, null, null, null,
   'Intitulé d''un référentiel — « Hygiène informatique (ANSSI) ». Un titre de norme.'),
  ('referentiels', 'editeur', 'non_personnelle', null, null, null, null,
   'Organisme qui publie la norme — ANSSI, ISO/IEC, Union européenne. Une personne '
   'MORALE, et une institution publique dans les trois cas livrés.'),
  ('referentiels', 'version_referentiel', 'non_personnelle', null, null, null, null,
   'Version du texte — « 42 mesures », « Annexe A · 93 mesures ».'),
  ('referentiels', 'description', 'non_personnelle', null, null, null, 'signaler',
   'Présentation du référentiel. Non personnelle pour les six catalogues livrés, qui '
   'décrivent des pratiques de sécurité. ⚠️ Régime « signaler » à l''expiration parce '
   'qu''une grille IMPORTÉE par un client (action 26.2) n''est pas écrite par nous : un '
   'donneur d''ordre peut y nommer quelqu''un. On ne purge pas un texte de norme à '
   'l''aveugle — on signale, et un humain tranche.'),
  ('referentiels', 'aide', 'non_personnelle', null, null, null, 'signaler',
   'Aide pédagogique du référentiel. Même motif que description.'),
  ('referentiels', 'scoring', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : maturite | conformite. Dit comment le référentiel se COMPTE.'),
  ('referentiels', 'note_numerotation', 'non_personnelle', null, null, null, null,
   'Explication d''un écart de numérotation avec le texte officiel (constat Q-192). '
   'Porte sur des NUMÉROS DE MESURE, jamais sur une personne.'),
  ('referentiels', 'statut', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : en_vigueur | archive.'),
  ('referentiel_domaines', 'code', 'non_personnelle', null, null, null, null,
   'Identifiant d''un thème dans son référentiel — « sensibiliser », « CL5 ».'),
  ('referentiel_domaines', 'nom', 'non_personnelle', null, null, null, null,
   'Intitulé d''un thème — « Sensibiliser et former ».'),
  ('referentiel_domaines', 'court', 'non_personnelle', null, null, null, null,
   'Forme abrégée du thème, pour les axes du radar.'),
  ('referentiel_domaines', 'aide', 'non_personnelle', null, null, null, 'signaler',
   'Aide pédagogique d''un thème. Même motif que referentiels.description.'),
  ('referentiel_exigences', 'code', 'non_personnelle', null, null, null, null,
   '⚠️ Moitié droite de la clé par laquelle toute auto-évaluation est stockée. Un '
   'identifiant de mesure, jamais une donnée sur quelqu''un.'),
  ('referentiel_exigences', 'titre', 'non_personnelle', null, null, null, 'signaler',
   'Intitulé d''une exigence. Même motif que referentiels.description : les six '
   'catalogues livrés décrivent des pratiques, une grille importée est écrite ailleurs.'),
  ('referentiel_exigences', 'aide', 'non_personnelle', null, null, null, 'signaler',
   'Aide pédagogique d''une exigence. Même motif.'),
  ('referentiel_exigences', 'niveau', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : bronze | silver | gold (niveau de label AirCyber).'),
  ('referentiel_exigences', 'priorite', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : low | medium | high.'),
  ('referentiel_exigences', 'cl', 'non_personnelle', null, null, null, null,
   'Domaine de classification AirCyber — CL0 à CL6.'),
  ('referentiel_exigences', 'code_officiel', 'non_personnelle', null, null, null, null,
   'Numéro de la mesure dans le texte officiel, quand il diffère du code (Q-192).'),
  ('referentiel_traductions', 'langue', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : en | es.'),
  -- ⚠️ **LES TROIS COLONNES `jsonb`, ET C'EST LE GARDE-FOU QUI LES A RÉCLAMÉES.** Le
  -- registre balaie depuis la migration `031` au-delà du texte : je ne les avais pas
  -- décidées, et `f_verifier_schema()` a refusé le déploiement en les nommant une par
  -- une. Quatrième fois de ce chantier qu'un installateur rattrape un lot qu'il n'a pas
  -- vu naître.
  ('referentiels', 'codes_officiels', 'non_personnelle', null, null, null, null,
   'Correspondance code du catalogue → numéro officiel (constat Q-192). Un document de '
   'NUMÉROS DE MESURE ; il ne porte que des chaînes comme « 41 et 42 ».'),
  ('referentiels', 'cl_labels', 'non_personnelle', null, null, null, null,
   'Intitulés des domaines de classification CL0-CL6 d''AirCyber — « Governance », '
   '« Malwares ». Des noms de THÈMES de sécurité.'),
  -- ⚠️ **« conserver » ET NON « signaler », ET C'EST LE GARDE-FOU QUI A TRANCHÉ.** Le
  -- régime « signaler » fait chercher un NOM dans la colonne : la purge y construit une
  -- comparaison TEXTUELLE, que la base refuse sur un `jsonb`. Et la purge est
  -- TRANSACTIONNELLE — une seule déclaration de ce genre l'avorte ENTIÈREMENT, pour
  -- toutes les filiales (constat **Q-300**). Le champ jumeau
  -- `referentiel_exigences.titre`, lui, est bien « signaler » : il est textuel.
  --
  -- Ce que cela coûte, dit franchement : si une grille importée nommait quelqu'un dans
  -- sa TRADUCTION, la purge ne le signalerait pas. Le texte français, lui, est signalé —
  -- et une traduction sans original n'existe pas.
  ('referentiel_traductions', 'dictionnaire', 'non_personnelle', null, null, null, 'conserver',
   'Dictionnaire de traduction d''un catalogue : les mêmes chaînes que le catalogue '
   'français, dans une autre langue. ⚠️ « conserver » et non « signaler » parce que la '
   'colonne est jsonb : le régime « signaler » construit une comparaison textuelle que '
   'la base refuse, et la purge — transactionnelle — s''avorterait ENTIÈREMENT pour '
   'toutes les filiales (constat Q-300). Le texte FRANÇAIS, lui, est signalé : il est '
   'dans referentiel_exigences.titre, qui est textuel.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §5 — `referentiels_actifs.ref_id` DEVIENT UN VRAI LIEN — ET `evaluations`, NON
-- -------------------------------------------------------------------------------------
-- ⚠️ **DEUX COLONNES PORTENT LE MÊME `ref_id`, ET ELLES NE REÇOIVENT PAS LE MÊME
-- TRAITEMENT.** La différence n'est pas de goût : c'est ce qui survit à l'évolution
-- d'une norme.
--
-- ── `referentiels_actifs.ref_id` : clé étrangère, OUI ────────────────────────────
--
-- Cette table dit *« cette filiale évalue ce référentiel »*. Activer un référentiel qui
-- n'existe pas n'a aucun sens : l'écran ne le propose pas, la couverture le compte pour
-- rien, et la ligne reste là sans que personne ne la voie. C'est le défaut que le constat
-- **Q-150** avait laissé ouvert — *« referentiels_actifs n'est écrit ni lu par personne »*
-- — sous une autre forme.
--
-- ⚠️ **Et la colonne était en `text` NU**, alors que tout identifiant du schéma porte le
-- domaine `id_metier` : c'est **mot pour mot le constat Q-310**, qui était **Q-194**
-- rejoué. La chaîne vide y entrait.
--
-- ── `evaluations.ref_id` : clé étrangère, NON — et c'est délibéré ────────────────
--
-- Une auto-évaluation est une RÉPONSE DATÉE, produite en audit. Elle doit survivre à
-- l'archivage du catalogue qui l'a produite — c'est précisément ce que l'action 26.3
-- organise : ISO 27002:2026 remplacera ISO 27002:2022, et les réponses de 2022 restent
-- attachées au catalogue de 2022, qui est la vérité.
--
-- Une clé étrangère les rendrait indestructibles ou les détruirait, selon son action, et
-- **elle ferait échouer la reprise d'une sauvegarde** portant des évaluations d'un
-- catalogue retiré depuis. C'est la classe des trois conflits de la migration `041` et
-- des constats Q-194 / Q-284, tranchée pareil : **restaurer une sauvegarde gagne.**
--
-- Ce qui garde l'intégrité ici n'est donc pas une clé : c'est le fait que les **codes ne
-- bougent pas**, mesuré exigence par exigence contre les fichiers source.
-- =====================================================================================

do $$
begin
    -- ⚠️ Le domaine d'abord : une ligne à chaîne vide ferait échouer la clé étrangère
    -- avec un message qui ne désigne pas la vraie cause.
    if exists (select 1 from pg_attribute a
                join pg_type t on t.oid = a.atttypid
               where a.attrelid = to_regclass('public.referentiels_actifs')
                 and a.attname = 'ref_id' and t.typname = 'text')
    then
        alter table referentiels_actifs alter column ref_id type id_metier;
        raise notice 'referentiels_actifs.ref_id porte désormais le domaine id_metier.';
    end if;
end;
$$;

do $$
declare v_orphelines integer;
begin
    -- ⚠️ On MESURE avant de poser la clé : une base de recette peut porter l'activation
    -- d'un référentiel qui n'a jamais existé, et le refus brut ne dirait pas lequel.
    select count(*) into v_orphelines
      from referentiels_actifs a
     where not exists (select 1 from referentiels r where r.id = a.ref_id);
    if v_orphelines > 0 then
        raise exception 'La table referentiels_actifs porte % activation(s) dont le '
                        'référentiel n''existe pas dans le catalogue. La clé étrangère du '
                        '§5 ne peut pas être posée sans les traiter. Requête : select * '
                        'from referentiels_actifs a where not exists (select 1 from '
                        'referentiels r where r.id = a.ref_id);', v_orphelines;
    end if;
end;
$$;

alter table referentiels_actifs drop constraint if exists fk_referentiels_actifs_referentiel;
alter table referentiels_actifs
    add constraint fk_referentiels_actifs_referentiel foreign key (ref_id)
        references referentiels (id) on delete restrict;

comment on constraint fk_referentiels_actifs_referentiel on referentiels_actifs is
    'Activer un référentiel qui n''existe pas est sans objet : l''écran ne le propose '
    'pas, la couverture le compte pour rien, et la ligne reste invisible. ⚠️ Clé SIMPLE '
    'vers une table MIXTE — même arbitrage qu''à ebios_sources_risque.connaissance_id : '
    'une clé composite rendrait le socle du Groupe inatteignable depuis une filiale. '
    '⚠️ Et « evaluations.ref_id » n''en reçoit PAS : une réponse d''audit doit survivre '
    'à l''archivage du catalogue qui l''a produite, et une clé ferait échouer la reprise '
    'd''une sauvegarde — restaurer une sauvegarde gagne.';

-- =====================================================================================
-- §6 — LA VEILLE : L'ANCIENNETÉ SE DÉRIVE (action 26.5)
-- -------------------------------------------------------------------------------------
-- **Le produit ne va PAS chercher la norme sur Internet** — c'est le risque P3 du
-- `docs/PLAN_PRODUIT.md`, et le `IPAddressDeny=any` de l'unité systemd le rend de toute
-- façon impossible sans un geste de l'exploitant. Ce qu'il sait faire, et qui suffit :
-- **dater ses catalogues, et signaler l'ancienneté**.
--
-- ⚠️ **Dérivée, jamais stockée.** Un état rangé en colonne vieillit sans que rien
-- n'écrive : un catalogue marqué « à jour » le resterait jusqu'à ce qu'un traitement
-- repasse dessus. C'est le mécanisme des dérogations (`035`) et de l'AIPD (`039`),
-- reconduit pour la même raison — *une dérogation échue redevient une non-conformité
-- sans qu'aucun traitement n'ait à repasser*.
--
-- ⚠️ **Et « inconnue » est une réponse, pas un trou.** Un catalogue sans date de
-- publication rend `date_inconnue` — jamais `a_jour`. Le questionnaire AirCyber est dans
-- ce cas : BoostAerospace ne publie pas de date vérifiable, et en inventer une rendrait
-- le signal faux DANS LE SENS RASSURANT.
-- =====================================================================================

create or replace function f_referentiel_age(
    p_publie_le date, p_duree_alerte_mois integer)
returns text
    language sql stable parallel safe
    set search_path = pg_catalog, public, pg_temp as
$$
    select case
        when p_publie_le is null then 'date_inconnue'
        when p_duree_alerte_mois is null then 'non_surveille'
        when p_publie_le + (p_duree_alerte_mois || ' months')::interval <= current_date
            then 'a_verifier'
        else 'a_jour'
    end;
$$;

comment on function f_referentiel_age(date, integer) is
    'Ancienneté d''un catalogue (action 26.5), DÉRIVÉE et jamais stockée : « a_jour », '
    '« a_verifier » au-delà de la durée d''alerte, « non_surveille » quand aucune durée '
    'n''est fixée, « date_inconnue » quand la parution n''est pas renseignée. ⚠️ Un état '
    'rangé en colonne vieillirait sans que rien n''écrive — mécanisme des dérogations '
    '(035) et de l''AIPD (039). ⚠️ Et « inconnue » n''est JAMAIS « à jour » : inventer '
    'une date rendrait le signal faux dans le sens rassurant.';

-- =====================================================================================
-- §7 — `type_entite`
-- -------------------------------------------------------------------------------------
-- Une table absente de ce domaine est INCRÉABLE par les routes génériques, et le refus
-- qui remonte à l'utilisateur ne désigne rien (`CONVENTIONS.md` §40.1).
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := '''risque_quantification''';
    v_ajouts   constant text := '''risque_quantification'', ''referentiels'', '
                                '''referentiel_domaines'', ''referentiel_exigences'', '
                                '''referentiel_traductions''';
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
    if position('''referentiel_exigences''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà les catalogues : rejeu, rien à faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « risque_quantification » est introuvable dans le '
                        'prédicat appliqué de type_entite_check : son texte a changé, et '
                        'la substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);
    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais les quatre tables de catalogue.';
end;
$$;

-- =====================================================================================
-- §8 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Les quatre tables sont MIXTES et suivent le patron de `risque_catalogue` : le socle du
-- Groupe est lisible de TOUTES les filiales — c'est ce qui fait qu'une filiale évalue
-- ISO 27001 sans rien décider — et écrit par la seule administration Groupe ; une grille
-- importée par une filiale est lue et écrite par elle seule.
--
-- ⚠️ **Cette politique de LECTURE est ce qui rend inoffensives les clés simples des §1 et
-- §2.** Une filiale ne peut pas voir la grille d'une autre : aucun écran ne la lui
-- propose, et 52 bits d'aléa cryptographique la mettent hors de portée d'une devinette.
-- =====================================================================================

do $$
declare v_table text;
begin
    foreach v_table in array array['referentiels', 'referentiel_domaines',
                                   'referentiel_exigences', 'referentiel_traductions'] loop
        execute format('alter table %I enable row level security', v_table);
        execute format('alter table %I force  row level security', v_table);

        execute format('drop policy if exists pol_%s_lecture on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_ajout on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_maj on %I', v_table, v_table);
        execute format('drop policy if exists pol_%s_suppression on %I', v_table, v_table);

        execute format(
            'create policy pol_%s_lecture on %I for select using '
            '(case when filiale_id is null then true '
            '      else filiale_id = any (f_filiales_lecture()) end)', v_table, v_table);
        execute format(
            'create policy pol_%s_ajout on %I for insert with check '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end)', v_table, v_table);
        execute format(
            'create policy pol_%s_maj on %I for update using '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end) with check '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end)', v_table, v_table);
        execute format(
            'create policy pol_%s_suppression on %I for delete using '
            '(case when filiale_id is null then f_administration_groupe() '
            '      else filiale_id = f_filiale_ecriture() end)', v_table, v_table);

        execute format('grant select, insert, update, delete on %I to grc_app', v_table);
        execute format('grant select on %I to grc_lecture', v_table);
    end loop;
end;
$$;

comment on policy pol_referentiels_lecture on referentiels is
    'Le socle du Groupe (filiale_id nul) est lisible de TOUTES les filiales : c''est ce '
    'qui permet à une filiale d''évaluer ISO 27001 sans rien décider. Une grille '
    'IMPORTÉE par une filiale (action 26.2) ne l''est que d''elle — et c''est la '
    'barrière qui rend inoffensives les clés simples des §1 et §2.';

select f_poser_portee_figee();
select f_armer_declencheurs();

-- ⚠️ APRÈS le §8, et l'ordre n'est pas indifférent : `f_poser_declencheurs_pieces()`
-- découvre ses tables porteuses par un prédicat dont l'une des conditions est que la
-- politique de SUPPRESSION soit cloisonnée. Appelée plus haut, elle ne verrait pas les
-- quatre tables neuves, rendrait un compte plausible et les laisserait démunies sans une
-- erreur (`CONVENTIONS.md` §40.2). ⚠️ **C'est le garde-fou qui me l'a dit** : quatre
-- anomalies « porteur_sans_declencheur », nommées une par une.
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §8 bis — LA DISPENSE D'UNICITÉ DE `uq_referentiel_domaines_id_referentiel`
-- -------------------------------------------------------------------------------------
-- `f_verifier_unicite_cloisonnee()` (migration `004`) refuse toute unicité qui ne porte
-- pas `filiale_id` sur une table cloisonnée — une filiale y occuperait une valeur dans
-- l'espace d'une autre. Elle tient une liste de dispenses, **écrite à la main et
-- délibérément** : l'omission y échoue BRUYAMMENT, et un humain doit trancher. C'est le
-- second cas du tableau du `CLAUDE.md` §3, et le bon outil.
--
-- L'unicité posée au §2 en est la sixième, et le motif est **exactement celui de
-- `uq_documents_id_portee`** : `id` est déjà la clé primaire, cette unicité n'interdit
-- rien de plus, et elle n'existe que pour être la cible d'une clé étrangère composite.
--
-- ⚠️ **Lui ajouter `filiale_id` serait PIRE que l'omettre.** La table est MIXTE :
-- `filiale_id` y est nul pour tout le socle, et `MATCH SIMPLE` dispense alors la clé
-- étrangère de TOUT contrôle (`CONVENTIONS.md` §45, découvert à la migration `049`). La
-- barrière aurait l'air plus stricte et ne contrôlerait plus rien.
--
-- ⚠️ La fonction est reposée EN ENTIER, à l'identique sauf sa liste : son texte a été
-- extrait du catalogue et une seule substitution y a été appliquée, refusée si le bloc
-- visé n'était pas retrouvé mot pour mot. *On ne remplace pas une fonction dont on n'a
-- lu qu'une partie.*
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.f_verifier_unicite_cloisonnee()
 RETURNS TABLE(objet text, anomalie text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
    -- Les unicités DÉLIBÉRÉMENT globales sur une table cloisonnée. Cinq, chacune motivée
    -- par une raison qui ne vaut que pour elle. Toute autre est une anomalie : la liste
    -- ne dispense pas du balayage, elle en est la seule sortie de secours, et le bloc
    -- final vérifie qu'aucune de ces cinq n'a disparu — une exemption périmée élargirait
    -- la dérogation en silence (§19.5).
    v_globales constant text[] := array[
        -- Numérotation de la chaîne d'audit : elle est GROUPE par construction. Le
        -- chaînage par empreinte relie toutes les entrées entre elles, filiales
        -- comprises ; une numérotation par filiale ne serait plus une chaîne (§12).
        'uq_journal_audit_numero',
        -- Chemin de stockage d'une pièce jointe : c'est un chemin de SYSTÈME DE FICHIERS,
        -- unique sur le disque par nature. Le nom est engendré par le serveur et opaque
        -- (§17.1 de la migration 001) : une filiale ne peut pas le deviner pour occuper
        -- celui d'une autre, et le collisionner par hasard n'arrive pas.
        'uq_pieces_jointes_chemin',
        -- (id, portee_groupe) sur documents : id est DÉJÀ la clé primaire, cette unicité
        -- n'interdit donc rien de plus qu'elle. Elle n'existe que pour être la cible de
        -- la clé étrangère composite de document_referentiels (constat N-10, §17.10).
        'uq_documents_id_portee',
        -- (id, portee_groupe) sur personnes : même dispositif et même motif
        -- que sur documents. id est DÉJÀ la clé primaire ; cette unicité
        -- n'interdit donc rien de plus, elle rend seulement le couple
        -- référençable par attestations_lecture — ce qui est ce qui permet à
        -- une personne de PORTÉE GROUPE d'attester dans une filiale (033).
        'uq_personnes_id_portee',
        -- (id, portee_groupe) sur mesure_catalogue : même dispositif et même
        -- motif que sur documents et personnes. id est DÉJÀ la clé primaire ;
        -- cette unicité n'interdit rien de plus, elle rend seulement le couple
        -- référençable par document_mesures — ce qui permet à une politique de
        -- filiale de prouver un contrôle du SOCLE DU GROUPE (036).
        'uq_mesure_catalogue_id_portee',
        -- (id, portee_groupe) sur analyses_impact : même dispositif et même
        -- motif que sur documents, personnes et mesure_catalogue. id est DÉJÀ
        -- la clé primaire ; cette unicité n'interdit rien de plus, elle rend
        -- seulement le couple référençable par analyse_mesures (039).
        'uq_analyses_impact_id_portee',
        -- (id, portee_groupe) sur traitements : même dispositif et même motif que
        -- sur documents (migration 027). id est DÉJÀ la clé primaire ; cette
        -- unicité n'interdit donc rien de plus, elle rend seulement le couple
        -- référençable par documents.traitement_id et par traitement_mesures.
        'uq_traitements_id_portee',
        -- Référence d'une mesure de catalogue de portée GROUPE : index PARTIEL, borné à
        -- « filiale_id is null ». Il ne porte donc que sur des lignes du socle commun,
        -- que seule l'administration Groupe écrit. Le pendant local
        -- (uq_mesure_catalogue_reference_locale) porte bien filiale_id, lui.
        'uq_mesure_catalogue_reference_groupe',
        -- Nom d'un groupe AD : l'unicité n'est pas la nôtre, c'est celle de l'annuaire.
        -- Deux filiales ne peuvent pas revendiquer le même groupe AD, et c'est le but.
        'uq_groupes_ad_nom',
        -- (id, referentiel_id) sur referentiel_domaines : **exactement le cas de
        -- `uq_documents_id_portee` ci-dessus**, et pour la même raison. `id` est DÉJÀ la
        -- clé primaire : cette unicité n'interdit rien de plus qu'elle, et n'existe que
        -- pour être la CIBLE de la clé étrangère composite de `referentiel_exigences`
        -- (migration `051` §3). Cette clé-là est ce qui empêche une exigence de déclarer
        -- un référentiel autre que celui de son domaine — donc ce qui empêche son code,
        -- moitié droite de `evaluations(ref_id, code)`, d'être compté sous le mauvais
        -- référentiel. ⚠️ Lui ajouter `filiale_id` serait PIRE que l'omettre : la table
        -- est MIXTE, `filiale_id` y est nul pour tout le socle, et `MATCH SIMPLE`
        -- dispense alors la clé étrangère de tout contrôle (`CONVENTIONS.md` §45).
        'uq_referentiel_domaines_id_referentiel'
    ];
    r record;
    v_nom text;
begin
    for r in
        select c.relname::text                             as tbl,
               coalesce(con.conname::text, i.relname::text) as nom,
               case con.contype
                   when 'x' then 'contrainte d''exclusion'
                   when 'u' then 'contrainte d''unicité'
                   else 'index unique sans contrainte'
               end                                          as genre,
               pg_get_indexdef(ix.indexrelid)               as definition,
               exists (
                   select 1
                     from unnest(ix.indkey) with ordinality k(att, pos)
                     join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
                    where a.attname = 'filiale_id'
                      and k.pos <= ix.indnkeyatts)          as porte_filiale
          from pg_index ix
          join pg_class     i   on i.oid = ix.indexrelid
          join pg_class     c   on c.oid = ix.indrelid
          join pg_namespace n   on n.oid = c.relnamespace
          left join pg_constraint con
                 on con.conindid = ix.indexrelid and con.contype in ('u', 'p', 'x')
         where n.nspname = 'public'
           and c.relkind in ('r', 'p')
           -- unicité (index seul ou contrainte) ET exclusion : l'index d'une contrainte
           -- d'exclusion n'est pas « unique », il faut donc l'attraper par la contrainte.
           and (ix.indisunique or con.contype = 'x')
           and not ix.indisprimary
           -- « cloisonnée » a un sens précis et un seul dans ce dépôt : la table porte
           -- une colonne filiale_id (CONVENTIONS §4).
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'filiale_id'
                          and a.attnum > 0 and not a.attisdropped)
         order by c.relname, 2
    loop
        if r.porte_filiale or r.nom = any (v_globales) then
            continue;
        end if;

        objet    := r.tbl || '.' || r.nom;
        anomalie := 'unicite_transfrontaliere';
        detail   := format(
            '%s sur une table cloisonnée, sans filiale_id parmi ses colonnes de clé : une '
            'filiale occupe une valeur dans l''espace d''une autre, qui ne peut plus '
            'l''employer et reçoit un doublon sans détail sur une ligne invisible '
            '(CONVENTIONS.md §19.1). Définition : %s', r.genre, r.definition);
        return next;
    end loop;

    -- Une exemption qui ne désigne plus rien élargit la dérogation à la prochaine
    -- contrainte qui reprendrait ce nom, et ne se voit pas. On la réclame.
    foreach v_nom in array v_globales loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'exemption_obsolete';
            detail   := 'unicité déclarée délibérément globale dans '
                        'f_verifier_unicite_cloisonnee(), mais introuvable : la dérogation '
                        'ne porte plus sur rien et couvrirait toute contrainte future qui '
                        'reprendrait ce nom';
            return next;
        end if;
    end loop;

    return;
end;
$function$;

-- =====================================================================================
-- §9 — LE SEMIS — LES SIX CATALOGUES LIVRÉS
-- -------------------------------------------------------------------------------------
-- ⚠️ **CES 470 LIGNES N'ONT PAS ÉTÉ TAPÉES, ET C'EST LE POINT LE PLUS IMPORTANT DE LA
-- MIGRATION.** Elles ont été **engendrées** depuis `backend/db/catalogues/*.js` — les
-- fichiers qui servaient jusqu'ici de catalogue au navigateur — par un programme qui les
-- charge et les recopie sans les relire.
--
-- Le motif est le critère du lot : *« les auto-évaluations sont stockées par
-- `(ref_id, code)` : la migration conserve les codes À L'OCTET PRÈS »*. Un semis
-- recopié à la main aurait introduit, sur 424 exigences, au moins une différence — un
-- accent, une espace insécable, un « 5.1 » devenu « 5.10 » — et cette différence
-- aurait **réattribué une réponse d'audit en silence**.
--
-- ⚠️ **Et l'engendrement ne suffit pas** : le garde du banc
-- (`test/catalogues/fidelite.test.mjs`) recharge les mêmes fichiers et compare la base,
-- exigence par exigence, champ par champ. *Un semis engendré une fois est juste une
-- fois ; c'est la comparaison qui le garde juste.*
--
-- ⚠️ **Ordre imposé** : référentiels, puis domaines, puis exigences — la clé du §3 est
-- COMPOSITE et va chercher `(id, referentiel_id)` dans les domaines.
--
-- ⚠️ La provenance n'est PAS dans les colonnes : elle vient du réglage `grc.provenance`
-- posé au §0 (voir le commentaire qui l'accompagne).
-- =====================================================================================

insert into referentiels
    (id, filiale_id, nom, editeur, version_referentiel, description, aide, scoring,
     note_numerotation, codes_officiels, cl_labels, revision, statut,
     en_vigueur_le, publie_le)
values
  ('anssi-hygiene', null, 'Hygiène informatique (ANSSI)', 'ANSSI', '42 mesures',
   'Socle de bonnes pratiques pour renforcer la sécurité d''un système d''information. Un excellent point de départ, accessible et concret, avant les référentiels plus exigeants (ISO 27001, NIS2, DORA).',
   'Publié par l''Agence nationale de la sécurité des systèmes d''information (ANSSI), ce guide rassemble des mesures élémentaires qui, appliquées, évitent la grande majorité des incidents courants.',
   'maturite', 'La numérotation de ce catalogue diffère de celle du guide de l''ANSSI à partir de la mesure 30. Le numéro officiel est rappelé sur chaque mesure concernée. Les codes ne sont pas réalignés : vos auto-évaluations sont enregistrées par code, et les renuméroter les réattribuerait à d''autres mesures.',
   '{"1":"1","2":"2","3":"3","4":"4","5":"5","6":"6","7":"7","8":"8","9":"9","10":"10","11":"11","12":"12","13":"13","14":"14","15":"15","16":"16","17":"17","18":"18","19":"19","20":"20","21":"21","22":"22","23":"23","24":"24","25":"25","26":"26","27":"27","28":"28","29":"29","30":null,"31":"30","32":"31","33":"32","34":"33","35":"34","36":"35","37":"36","38":"37","39":"38","40":"39","41":"40","42":"41 et 42"}'::jsonb, null,
   1, 'en_vigueur', date '2026-09-19', '2017-01-01'),
  ('iso27001-smsi', null, 'ISO/IEC 27001:2022 — Système de management', 'ISO/IEC', 'Chap. 4-10 · SMSI',
   'Exigences du système de management de la sécurité de l''information (SMSI) d''ISO/IEC 27001:2022 — chapitres 4 à 10 : contexte, leadership, planification, support, fonctionnement, évaluation des performances et amélioration. Ce sont ces exigences que vérifie un audit clause 9.2 (en complément des mesures de l''Annexe A).',
   'Là où l''Annexe A liste des mesures de sécurité (parmi lesquelles on choisit via la SoA), les chapitres 4 à 10 sont les exigences OBLIGATOIRES du système de management : elles décrivent comment piloter la sécurité dans la durée (PDCA). Intitulés reformulés — se référer à la norme officielle pour le texte exact.',
   'maturite', null,
   null, null,
   1, 'en_vigueur', date '2026-09-19', '2022-10-25'),
  ('iso-27002-2022', null, 'ISO/IEC 27001:2022', 'ISO/IEC', 'Annexe A · 93 mesures',
   'Mesures de sécurité de l''Annexe A d''ISO/IEC 27001:2022, la norme certifiable du système de management de la sécurité de l''information (SMSI). Structurées en 4 thèmes (organisationnel, humain, physique, technologique).',
   'ISO/IEC 27001 est la norme certifiable du SMSI. Son Annexe A liste 93 mesures parmi lesquelles on sélectionne, via la déclaration d''applicabilité (SoA), celles qui s''appliquent pour traiter les risques identifiés. Intitulés reformulés — se référer à la norme officielle pour le texte exact.',
   'maturite', null,
   null, null,
   1, 'en_vigueur', date '2026-09-19', '2022-02-15'),
  ('nis2-art21', null, 'NIS2 — mesures art. 21', 'Directive (UE) 2022/2555', '10 mesures',
   'Mesures minimales de gestion des risques imposées aux entités essentielles et importantes par la directive européenne NIS2 (article 21). Transposée en droit national, elle élargit fortement le périmètre des organisations concernées.',
   'NIS2 impose une approche par les risques « tous risques » et rend l''organe de direction responsable. Les 10 mesures ci-dessous sont regroupées par thème pour la lisibilité ; la référence reste le texte de la directive.',
   'maturite', null,
   null, null,
   1, 'en_vigueur', date '2026-09-19', '2022-12-27'),
  ('dora', null, 'DORA — résilience opérationnelle', 'Règlement (UE) 2022/2554', '5 piliers',
   'Cadre européen de résilience opérationnelle numérique pour le secteur financier : gestion du risque TIC, incidents, tests, risque lié aux tiers et partage d''information.',
   'DORA vise à garantir que les acteurs financiers résistent aux perturbations informatiques. Synthèse des 5 piliers en mesures indicatives ; la référence reste le règlement et ses normes techniques (RTS/ITS).',
   'maturite', null,
   null, null,
   1, 'en_vigueur', date '2026-09-19', '2022-12-27'),
  ('aircyber', null, 'AirCyber (BoostAerospace)', 'BoostAerospace', '234 questions',
   'Questionnaire de maturité cybersécurité de la filière aéronautique (programme AirCyber / BoostAerospace). Auto-évaluation des pratiques, avec niveau de labellisation (Bronze / Argent / Or), priorité et domaine de classification (CL0-CL6).',
   'Questionnaire utilisé dans la supply chain aéronautique. Chaque question porte, quand elle est connue, son niveau de label (Bronze/Argent/Or), sa priorité et son domaine CL0-CL6. Les questions d''inventaire d''outils ne sont pas reprises. Le mapping niveau/priorité/CL couvre 156 des 234 questions.',
   'conformite', null,
   null, '{"CL0":"Governance","CL1":"Security event management","CL2":"Malwares","CL3":"Protect end user devices","CL4":"Secure network architecture","CL5":"Identity & access management","CL6":"Data protection and classification"}'::jsonb,
   1, 'en_vigueur', date '2026-09-19', null)
on conflict (id) do nothing;

insert into referentiel_domaines
    (id, filiale_id, referentiel_id, code, nom, court, aide, rang)
values
  ('REFD-0001', null, 'anssi-hygiene', 'sensibiliser', 'Sensibiliser et former', 'Sensibiliser',
   'L''humain est le premier rempart : des équipes formées et des utilisateurs sensibilisés font chuter le nombre d''incidents.', 1),
  ('REFD-0002', null, 'anssi-hygiene', 'connaitre', 'Connaître le système d''information', 'Connaître',
   'On ne protège bien que ce que l''on connaît : cartographie, inventaires et gestion des accès.', 2),
  ('REFD-0003', null, 'anssi-hygiene', 'acces', 'Authentifier et contrôler les accès', 'Accès',
   'Chaque personne est identifiée et n''accède qu''à ce dont elle a besoin, avec une authentification solide.', 3),
  ('REFD-0004', null, 'anssi-hygiene', 'postes', 'Sécuriser les postes de travail', 'Postes',
   'Postes et serveurs durcis de façon homogène, protégés des supports amovibles et du chiffrement des données.', 4),
  ('REFD-0005', null, 'anssi-hygiene', 'reseau', 'Sécuriser le réseau', 'Réseau',
   'Cloisonnement, protocoles chiffrés, passerelle Internet maîtrisée et protection de la messagerie.', 5),
  ('REFD-0006', null, 'anssi-hygiene', 'administration', 'Sécuriser l''administration', 'Administration',
   'L''administration du SI est la cible la plus convoitée : elle mérite un environnement dédié et cloisonné.', 6),
  ('REFD-0007', null, 'anssi-hygiene', 'nomadisme', 'Gérer le nomadisme', 'Nomadisme',
   'Les équipements qui sortent des locaux (portables, mobiles) exigent des protections spécifiques.', 7),
  ('REFD-0008', null, 'anssi-hygiene', 'maj', 'Maintenir le SI à jour', 'Mises à jour',
   'Les correctifs ferment les failles connues : les appliquer vite et remplacer ce qui n''est plus maintenu.', 8),
  ('REFD-0009', null, 'anssi-hygiene', 'superviser', 'Superviser, auditer, réagir', 'Superviser',
   'Détecter, sauvegarder, contrôler et savoir réagir : la sécurité se pilote dans la durée.', 9),
  ('REFD-0010', null, 'anssi-hygiene', 'avance', 'Pour aller plus loin', 'Aller + loin',
   'Une fois le socle acquis, formaliser la gestion de crise et l''analyse de risque.', 10),
  ('REFD-0011', null, 'iso27001-smsi', 'c4', '4. Contexte de l''organisation', 'Contexte',
   'Poser les fondations : comprendre l''organisation, ses parties intéressées et fixer le périmètre du SMSI.', 1),
  ('REFD-0012', null, 'iso27001-smsi', 'c5', '5. Leadership', 'Leadership',
   'L''engagement de la direction : politique, ressources et responsabilités.', 2),
  ('REFD-0013', null, 'iso27001-smsi', 'c6', '6. Planification', 'Planification',
   'Traiter les risques, fixer des objectifs et planifier les changements.', 3),
  ('REFD-0014', null, 'iso27001-smsi', 'c7', '7. Support', 'Support',
   'Les moyens : ressources, compétences, sensibilisation, communication et documentation.', 4),
  ('REFD-0015', null, 'iso27001-smsi', 'c8', '8. Fonctionnement', 'Fonctionnement',
   'Exécuter : maîtriser les opérations et mettre en œuvre l''appréciation et le traitement des risques.', 5),
  ('REFD-0016', null, 'iso27001-smsi', 'c9', '9. Évaluation des performances', 'Évaluation',
   'Vérifier : mesurer la performance, auditer et faire la revue de direction.', 6),
  ('REFD-0017', null, 'iso27001-smsi', 'c10', '10. Amélioration', 'Amélioration',
   'Progresser : améliorer en continu et traiter les non-conformités.', 7),
  ('REFD-0018', null, 'iso-27002-2022', 'org', 'Mesures organisationnelles', 'Organisationnel',
   'Politiques, rôles, relations fournisseurs, gestion des incidents et conformité : le pilotage de la sécurité.', 1),
  ('REFD-0019', null, 'iso-27002-2022', 'peo', 'Mesures liées aux personnes', 'Humain',
   'Le facteur humain : recrutement, sensibilisation, télétravail et signalement.', 2),
  ('REFD-0020', null, 'iso-27002-2022', 'phy', 'Mesures physiques', 'Physique',
   'Protéger les lieux, les équipements et les supports physiques.', 3),
  ('REFD-0021', null, 'iso-27002-2022', 'tec', 'Mesures technologiques', 'Technologique',
   'Les protections techniques : accès, malware, vulnérabilités, journalisation, réseau, cryptographie, développement sécurisé.', 4),
  ('REFD-0022', null, 'nis2-art21', 'gouvernance', 'Gouvernance des risques', 'Gouvernance',
   'Analyser les risques, se doter de politiques et vérifier leur efficacité.', 1),
  ('REFD-0023', null, 'nis2-art21', 'incidents', 'Incidents & continuité', 'Incidents',
   'Traiter les incidents et garantir la continuité en cas de crise.', 2),
  ('REFD-0024', null, 'nis2-art21', 'chaine', 'Chaîne d''approvisionnement & développement', 'Chaîne & Dév.',
   'Sécuriser les fournisseurs et le cycle de vie des systèmes.', 3),
  ('REFD-0025', null, 'nis2-art21', 'hygiene', 'Hygiène, accès & cryptographie', 'Hygiène & Accès',
   'Les fondamentaux : formation, cryptographie, gestion des accès et authentification forte.', 4),
  ('REFD-0026', null, 'dora', 'p1', 'Gestion du risque TIC', 'Risque TIC',
   'Un cadre de gouvernance et de maîtrise du risque informatique piloté par la direction.', 1),
  ('REFD-0027', null, 'dora', 'p2', 'Gestion des incidents TIC', 'Incidents',
   'Traiter, classer et déclarer les incidents liés aux TIC.', 2),
  ('REFD-0028', null, 'dora', 'p3', 'Tests de résilience', 'Tests',
   'Éprouver régulièrement la résilience, jusqu''aux tests avancés fondés sur la menace.', 3),
  ('REFD-0029', null, 'dora', 'p4', 'Risque lié aux tiers TIC', 'Tiers TIC',
   'Maîtriser la dépendance aux prestataires informatiques, dont le cloud.', 4),
  ('REFD-0030', null, 'dora', 'p5', 'Partage d''information', 'Partage',
   'Échanger sur les cybermenaces pour renforcer la résilience collective.', 5),
  ('REFD-0031', null, 'aircyber', 'phys', 'Sécurité physique des locaux', 'Physique',
   'Accès aux bâtiments, salles serveurs, protection contre les coupures et l''environnement.', 1),
  ('REFD-0032', null, 'aircyber', 'parc', 'Inventaire & cartographie du parc', 'Inventaire',
   'Connaître son parc informatique et son réseau : la base de toute maîtrise.', 2),
  ('REFD-0033', null, 'aircyber', 'ident', 'Identités & habilitations', 'Identités',
   'Comptes nominatifs, vérifications à l''embauche et habilitations.', 3),
  ('REFD-0034', null, 'aircyber', 'acces', 'Gestion des accès & vulnérabilités', 'Accès',
   'Cycle de vie des accès, droits, veille sur les failles et correctifs.', 4),
  ('REFD-0035', null, 'aircyber', 'serveurs', 'Sécurisation des serveurs & supervision', 'Serveurs',
   'Durcissement des serveurs sensibles, protection et surveillance du SI.', 5),
  ('REFD-0036', null, 'aircyber', 'donnees', 'Sauvegardes & protection des données', 'Données',
   'Sauvegardes régulières et testées, responsabilité et protection des données.', 6),
  ('REFD-0037', null, 'aircyber', 'ot', 'Systèmes industriels (OT)', 'Industriel',
   'Cloisonnement, cartographie et protection des environnements de production industriels.', 7),
  ('REFD-0038', null, 'aircyber', 'clients', 'Exigences clients (SSI)', 'Clients',
   'Exigences de sécurité des donneurs d''ordre et niveau de conformité.', 8),
  ('REFD-0039', null, 'aircyber', 'gouv', 'Gouvernance & risques cyber', 'Gouvernance',
   'Connaissance des risques, budget, assurance et pilotage de la cybersécurité.', 9),
  ('REFD-0040', null, 'aircyber', 'ext', 'Questions étendues (Ext)', 'Étendu',
   'Questions complémentaires du questionnaire, pour approfondir la maturité.', 10)
on conflict (id) do nothing;

insert into referentiel_exigences
    (id, filiale_id, domaine_id, referentiel_id, code, titre, aide, niveau,
     priorite, cl, code_officiel, rang)
values
  ('REFE-0001', null, 'REFD-0001', 'anssi-hygiene', '1',
   'Former les équipes informatiques à la sécurité',
   'Administrateurs et techniciens configurent et exploitent le SI au quotidien : ils doivent être formés aux bonnes pratiques et aux menaces actuelles.',
   null, null, null, '1', 1),
  ('REFE-0002', null, 'REFD-0001', 'anssi-hygiene', '2',
   'Sensibiliser tous les utilisateurs aux réflexes de base',
   'Mots de passe, hameçonnage, pièces jointes : chaque collaborateur est un maillon de la sécurité. Une sensibilisation régulière est très rentable.',
   null, null, null, '2', 2),
  ('REFE-0003', null, 'REFD-0001', 'anssi-hygiene', '3',
   'Maîtriser les risques liés à l''infogérance',
   'Quand un prestataire gère tout ou partie du SI, le contrat doit fixer des exigences de sécurité claires et un droit de regard (audit, réversibilité).',
   null, null, null, '3', 3),
  ('REFE-0004', null, 'REFD-0002', 'anssi-hygiene', '4',
   'Cartographier le SI et repérer les données sensibles',
   'Inventaire des serveurs, applications et flux, et localisation des informations les plus critiques : la base de toute protection.',
   null, null, null, '4', 1),
  ('REFE-0005', null, 'REFD-0002', 'anssi-hygiene', '5',
   'Tenir un inventaire à jour des comptes à privilèges',
   'Les comptes administrateurs sont des cibles de choix. Il faut savoir en permanence qui les détient et pour quel usage.',
   null, null, null, '5', 2),
  ('REFE-0006', null, 'REFD-0002', 'anssi-hygiene', '6',
   'Gérer les arrivées, départs et changements de poste',
   'Créer, modifier et surtout retirer les accès au bon moment évite les comptes orphelins exploitables après un départ.',
   null, null, null, '6', 3),
  ('REFE-0007', null, 'REFD-0002', 'anssi-hygiene', '7',
   'N''autoriser sur le réseau que les équipements maîtrisés',
   'Un poste inconnu branché au réseau est une porte d''entrée : n''accepter que le matériel identifié et conforme à la politique.',
   null, null, null, '7', 4),
  ('REFE-0008', null, 'REFD-0003', 'anssi-hygiene', '8',
   'Identifier nommément chaque utilisateur',
   'Des comptes nominatifs (pas de comptes partagés) et la séparation des rôles utilisateur / administrateur rendent les actions traçables.',
   null, null, null, '8', 1),
  ('REFE-0009', null, 'REFD-0003', 'anssi-hygiene', '9',
   'Attribuer les droits au juste besoin (moindre privilège)',
   'Chacun n''accède qu''aux ressources nécessaires à sa fonction : on limite ainsi l''impact d''un compte compromis.',
   null, null, null, '9', 2),
  ('REFE-0010', null, 'REFD-0003', 'anssi-hygiene', '10',
   'Imposer des règles de mots de passe robustes',
   'Longueur et complexité suffisantes : un mot de passe faible se casse en quelques secondes.',
   null, null, null, '10', 3),
  ('REFE-0011', null, 'REFD-0003', 'anssi-hygiene', '11',
   'Protéger les mots de passe stockés',
   'Ils ne doivent jamais être conservés en clair, mais sous forme d''empreintes (hachage salé).',
   null, null, null, '11', 4),
  ('REFE-0012', null, 'REFD-0003', 'anssi-hygiene', '12',
   'Changer les identifiants et secrets par défaut',
   'Les comptes « admin/admin » d''usine sont publiquement connus : à modifier dès l''installation.',
   null, null, null, '12', 5),
  ('REFE-0013', null, 'REFD-0003', 'anssi-hygiene', '13',
   'Privilégier l''authentification multifacteur (MFA)',
   'Un second facteur (code, application, clé physique) rend un mot de passe volé insuffisant pour se connecter.',
   null, null, null, '13', 6),
  ('REFE-0014', null, 'REFD-0004', 'anssi-hygiene', '14',
   'Définir un socle de sécurité minimal sur tout le parc',
   'Configuration durcie et homogène (antivirus, comptes limités, services inutiles désactivés) sur chaque poste et serveur.',
   null, null, null, '14', 1),
  ('REFE-0015', null, 'REFD-0004', 'anssi-hygiene', '15',
   'Encadrer l''usage des supports amovibles',
   'Les clés USB propagent facilement des logiciels malveillants : restreindre, analyser et si besoin chiffrer leur contenu.',
   null, null, null, '15', 2),
  ('REFE-0016', null, 'REFD-0004', 'anssi-hygiene', '16',
   'Gérer les configurations de façon centralisée',
   'Un outil central (GPO, MDM) applique et vérifie partout les mêmes règles, sans oublier de postes.',
   null, null, null, '16', 3),
  ('REFE-0017', null, 'REFD-0004', 'anssi-hygiene', '17',
   'Activer le pare-feu local des postes',
   'Le pare-feu de chaque machine bloque les connexions non sollicitées, y compris entre postes d''un même réseau.',
   null, null, null, '17', 4),
  ('REFE-0018', null, 'REFD-0004', 'anssi-hygiene', '18',
   'Chiffrer les données sensibles stockées et échangées',
   'Le chiffrement rend les données illisibles en cas de vol de matériel ou d''interception.',
   null, null, null, '18', 5),
  ('REFE-0019', null, 'REFD-0005', 'anssi-hygiene', '19',
   'Cloisonner le réseau en zones de sensibilité',
   'Séparer les zones (bureautique, serveurs, industriel) limite la propagation d''une attaque d''une zone à l''autre.',
   null, null, null, '19', 1),
  ('REFE-0020', null, 'REFD-0005', 'anssi-hygiene', '20',
   'Sécuriser le Wi-Fi et séparer les usages',
   'Chiffrement fort du Wi-Fi et réseau invité isolé du réseau interne.',
   null, null, null, '20', 2),
  ('REFE-0021', null, 'REFD-0005', 'anssi-hygiene', '21',
   'Utiliser des protocoles réseau sécurisés',
   'Préférer les versions chiffrées (HTTPS, SSH, SFTP…) aux protocoles historiques qui transmettent en clair.',
   null, null, null, '21', 3),
  ('REFE-0022', null, 'REFD-0005', 'anssi-hygiene', '22',
   'Mettre en place une passerelle Internet sécurisée',
   'Filtrage, proxy et journalisation encadrent les accès sortants et bloquent les sites ou flux dangereux.',
   null, null, null, '22', 4),
  ('REFE-0023', null, 'REFD-0005', 'anssi-hygiene', '23',
   'Isoler les services exposés sur Internet (DMZ)',
   'Les serveurs accessibles depuis Internet sont placés dans une zone tampon, coupée du cœur du SI.',
   null, null, null, '23', 5),
  ('REFE-0024', null, 'REFD-0005', 'anssi-hygiene', '24',
   'Protéger la messagerie professionnelle',
   'Anti-spam, anti-hameçonnage, filtrage des pièces jointes et authentification des expéditeurs (SPF, DKIM, DMARC).',
   null, null, null, '24', 6),
  ('REFE-0025', null, 'REFD-0005', 'anssi-hygiene', '25',
   'Sécuriser les interconnexions avec les partenaires',
   'Les liaisons dédiées avec des tiers doivent être chiffrées, filtrées et limitées au strict nécessaire.',
   null, null, null, '25', 7),
  ('REFE-0026', null, 'REFD-0005', 'anssi-hygiene', '26',
   'Contrôler l''accès physique aux locaux techniques',
   'Salles serveurs et baies de brassage protégées : un accès physique contourne beaucoup de protections logiques.',
   null, null, null, '26', 8),
  ('REFE-0027', null, 'REFD-0006', 'anssi-hygiene', '27',
   'Couper l''accès Internet des outils d''administration',
   'Les postes et serveurs servant à administrer le SI ne doivent pas naviguer sur Internet (risque de compromission).',
   null, null, null, '27', 1),
  ('REFE-0028', null, 'REFD-0006', 'anssi-hygiene', '28',
   'Dédier et cloisonner le réseau d''administration',
   'Administrer via un réseau séparé empêche un attaquant du réseau bureautique d''atteindre les consoles d''admin.',
   null, null, null, '28', 2),
  ('REFE-0029', null, 'REFD-0006', 'anssi-hygiene', '29',
   'Limiter les droits d''administration au strict besoin',
   'Moins de comptes disposent de droits élevés, plus la surface d''attaque privilégiée est réduite.',
   null, null, null, '29', 3),
  ('REFE-0030', null, 'REFD-0006', 'anssi-hygiene', '30',
   'Réserver les comptes d''admin aux seules tâches d''admin',
   'Un administrateur utilise un compte standard pour la bureautique et son compte à privilèges uniquement pour administrer.',
   null, null, null, null, 4),
  ('REFE-0031', null, 'REFD-0007', 'anssi-hygiene', '31',
   'Protéger physiquement les terminaux nomades',
   'Verrouillage, filtre de confidentialité et vigilance contre le vol ou la perte des portables et smartphones.',
   null, null, null, '30', 1),
  ('REFE-0032', null, 'REFD-0007', 'anssi-hygiene', '32',
   'Chiffrer les postes et supports emportés',
   'Un ordinateur perdu ne doit pas livrer ses données : le chiffrement du disque est indispensable en mobilité.',
   null, null, null, '31', 2),
  ('REFE-0033', null, 'REFD-0007', 'anssi-hygiene', '33',
   'Sécuriser la connexion à distance (VPN)',
   'Les accès depuis l''extérieur passent par un tunnel chiffré et authentifié vers le SI.',
   null, null, null, '32', 3),
  ('REFE-0034', null, 'REFD-0007', 'anssi-hygiene', '34',
   'Encadrer l''usage des terminaux mobiles',
   'Une politique dédiée aux smartphones et tablettes (MDM, applications autorisées, cloisonnement pro / perso).',
   null, null, null, '33', 4),
  ('REFE-0035', null, 'REFD-0008', 'anssi-hygiene', '35',
   'Appliquer une politique de mises à jour',
   'Installer rapidement les correctifs de sécurité ferme les failles connues avant qu''elles ne soient exploitées.',
   null, null, null, '34', 1),
  ('REFE-0036', null, 'REFD-0008', 'anssi-hygiene', '36',
   'Anticiper l''obsolescence (fin de support)',
   'Un logiciel ou système qui ne reçoit plus de correctifs devient une vulnérabilité permanente : planifier son remplacement.',
   null, null, null, '35', 2),
  ('REFE-0037', null, 'REFD-0009', 'anssi-hygiene', '37',
   'Journaliser l''activité des composants essentiels',
   'Sans journaux (logs), on ne détecte ni ne comprend une attaque. Les activer et les conserver est la base de la détection.',
   null, null, null, '36', 1),
  ('REFE-0038', null, 'REFD-0009', 'anssi-hygiene', '38',
   'Sauvegarder régulièrement et tester les restaurations',
   'Des sauvegardes déconnectées et testées sont la meilleure parade contre un rançongiciel. Une sauvegarde non testée n''en est pas une.',
   null, null, null, '37', 2),
  ('REFE-0039', null, 'REFD-0009', 'anssi-hygiene', '39',
   'Réaliser des audits de sécurité périodiques',
   'Contrôles et tests réguliers révèlent les écarts, à corriger via le plan d''actions.',
   null, null, null, '38', 3),
  ('REFE-0040', null, 'REFD-0009', 'anssi-hygiene', '40',
   'Désigner un référent sécurité',
   'Une personne identifiée pilote la sécurité et centralise les alertes et les décisions.',
   null, null, null, '39', 4),
  ('REFE-0041', null, 'REFD-0010', 'anssi-hygiene', '41',
   'Définir une procédure de gestion des incidents',
   'Savoir à l''avance qui fait quoi (détection, confinement, communication) fait gagner un temps décisif le jour J.',
   null, null, null, '40', 1),
  ('REFE-0042', null, 'REFD-0010', 'anssi-hygiene', '42',
   'Mener une analyse de risque et privilégier les produits qualifiés',
   'Une analyse de risque formelle oriente les priorités ; les produits et services qualifiés par l''ANSSI offrent des garanties supplémentaires.',
   null, null, null, '41 et 42', 2),
  ('REFE-0043', null, 'REFD-0011', 'iso27001-smsi', '4.1',
   'Comprendre l''organisation et son contexte',
   'Identifier les enjeux internes et externes pertinents pour le SMSI (finalité, métier, réglementation, environnement).',
   null, null, null, null, 1),
  ('REFE-0044', null, 'REFD-0011', 'iso27001-smsi', '4.2',
   'Identifier les parties intéressées et leurs exigences',
   'Déterminer les parties intéressées pertinentes (clients, autorités, salariés…) et leurs exigences, y compris légales et contractuelles.',
   null, null, null, null, 2),
  ('REFE-0045', null, 'REFD-0011', 'iso27001-smsi', '4.3',
   'Définir le périmètre du SMSI',
   'Fixer les limites et l''applicabilité du système : activités, sites, actifs, interfaces et dépendances.',
   null, null, null, null, 3),
  ('REFE-0046', null, 'REFD-0011', 'iso27001-smsi', '4.4',
   'Établir et améliorer le SMSI',
   'Mettre en place, tenir à jour et améliorer en continu le SMSI et ses processus conformément à la norme.',
   null, null, null, null, 4),
  ('REFE-0047', null, 'REFD-0012', 'iso27001-smsi', '5.1',
   'Démontrer le leadership et l''engagement de la direction',
   'La direction impulse la politique, l''intègre aux processus métier, fournit les ressources et soutient les acteurs.',
   null, null, null, null, 1),
  ('REFE-0048', null, 'REFD-0012', 'iso27001-smsi', '5.2',
   'Établir une politique de sécurité de l''information',
   'Une politique adaptée à l''organisation, cadrant les objectifs, communiquée et disponible comme information documentée.',
   null, null, null, null, 2),
  ('REFE-0049', null, 'REFD-0012', 'iso27001-smsi', '5.3',
   'Attribuer rôles, responsabilités et autorités',
   'Désigner et communiquer les responsabilités pour la conformité du SMSI et le reporting de sa performance.',
   null, null, null, null, 3),
  ('REFE-0050', null, 'REFD-0013', 'iso27001-smsi', '6.1.1',
   'Planifier les actions face aux risques et opportunités',
   'À partir du contexte (4.1) et des exigences (4.2), déterminer les risques et opportunités à traiter et planifier les actions.',
   null, null, null, null, 1),
  ('REFE-0051', null, 'REFD-0013', 'iso27001-smsi', '6.1.2',
   'Définir un processus d''appréciation des risques',
   'Méthode reproductible d''identification, d''analyse et d''évaluation des risques, avec critères d''appréciation et d''acceptation.',
   null, null, null, null, 2),
  ('REFE-0052', null, 'REFD-0013', 'iso27001-smsi', '6.1.3',
   'Définir un processus de traitement des risques',
   'Choisir les options, déterminer les mesures (comparaison à l''Annexe A), produire la SoA et le plan de traitement, obtenir l''accord des propriétaires du risque.',
   null, null, null, null, 3),
  ('REFE-0053', null, 'REFD-0013', 'iso27001-smsi', '6.2',
   'Fixer des objectifs de sécurité et planifier leur atteinte',
   'Objectifs cohérents avec la politique, mesurables, suivis, avec ressources, responsables et échéances.',
   null, null, null, null, 4),
  ('REFE-0054', null, 'REFD-0013', 'iso27001-smsi', '6.3',
   'Planifier les modifications du SMSI',
   'Conduire de façon planifiée les changements nécessaires au SMSI (nouveauté de la version 2022).',
   null, null, null, null, 5),
  ('REFE-0055', null, 'REFD-0014', 'iso27001-smsi', '7.1',
   'Fournir les ressources nécessaires au SMSI',
   'Déterminer et allouer les ressources pour établir, mettre en œuvre, tenir à jour et améliorer le SMSI.',
   null, null, null, null, 1),
  ('REFE-0056', null, 'REFD-0014', 'iso27001-smsi', '7.2',
   'Assurer les compétences des personnes',
   'Déterminer les compétences requises, les acquérir (formation, recrutement) et en conserver la preuve.',
   null, null, null, null, 2),
  ('REFE-0057', null, 'REFD-0014', 'iso27001-smsi', '7.3',
   'Sensibiliser le personnel',
   'Chacun connaît la politique, sa contribution à l''efficacité du SMSI et les conséquences d''un non-respect.',
   null, null, null, null, 3),
  ('REFE-0058', null, 'REFD-0014', 'iso27001-smsi', '7.4',
   'Organiser la communication interne et externe',
   'Déterminer quoi, quand, avec qui et comment communiquer au sujet du SMSI.',
   null, null, null, null, 4),
  ('REFE-0059', null, 'REFD-0014', 'iso27001-smsi', '7.5.1',
   'Tenir les informations documentées exigées',
   'Le SMSI inclut la documentation exigée par la norme et celle jugée nécessaire à son efficacité.',
   null, null, null, null, 5),
  ('REFE-0060', null, 'REFD-0014', 'iso27001-smsi', '7.5.2',
   'Maîtriser la création et la mise à jour des documents',
   'Identification, format et support appropriés ; revue et approbation.',
   null, null, null, null, 6),
  ('REFE-0061', null, 'REFD-0014', 'iso27001-smsi', '7.5.3',
   'Maîtriser la diffusion et la protection des documents',
   'Disponibilité, protection, distribution, versions, conservation et élimination ; maîtrise des documents d''origine externe.',
   null, null, null, null, 7),
  ('REFE-0062', null, 'REFD-0015', 'iso27001-smsi', '8.1',
   'Planifier et maîtriser les opérations',
   'Mettre en œuvre les processus nécessaires au traitement des risques, maîtriser les changements et les processus externalisés.',
   null, null, null, null, 1),
  ('REFE-0063', null, 'REFD-0015', 'iso27001-smsi', '8.2',
   'Réaliser les appréciations des risques planifiées',
   'Apprécier les risques à intervalles planifiés ou lors de changements notables, et en conserver la preuve.',
   null, null, null, null, 2),
  ('REFE-0064', null, 'REFD-0015', 'iso27001-smsi', '8.3',
   'Mettre en œuvre le plan de traitement des risques',
   'Exécuter le plan de traitement des risques et en conserver la preuve.',
   null, null, null, null, 3),
  ('REFE-0065', null, 'REFD-0016', 'iso27001-smsi', '9.1',
   'Surveiller, mesurer, analyser et évaluer',
   'Déterminer quoi mesurer, avec quelles méthodes, quand et par qui, pour évaluer la performance et l''efficacité du SMSI.',
   null, null, null, null, 1),
  ('REFE-0066', null, 'REFD-0016', 'iso27001-smsi', '9.2.1',
   'Réaliser des audits internes',
   'Vérifier à intervalles planifiés que le SMSI est conforme aux exigences propres et à la norme, et effectivement mis en œuvre.',
   null, null, null, null, 2),
  ('REFE-0067', null, 'REFD-0016', 'iso27001-smsi', '9.2.2',
   'Établir un programme d''audit interne',
   'Planifier fréquence, méthodes et responsabilités ; auditeurs objectifs et impartiaux ; résultats rapportés et conservés.',
   null, null, null, null, 3),
  ('REFE-0068', null, 'REFD-0016', 'iso27001-smsi', '9.3.1',
   'Réaliser des revues de direction',
   'La direction revoit le SMSI à intervalles planifiés pour s''assurer de sa pertinence, adéquation et efficacité.',
   null, null, null, null, 4),
  ('REFE-0069', null, 'REFD-0016', 'iso27001-smsi', '9.3.2',
   'Examiner les éléments d''entrée requis',
   'Suivi des actions, évolutions du contexte, performance, non-conformités, résultats d''audit et d''appréciation des risques, retours des parties intéressées.',
   null, null, null, null, 5),
  ('REFE-0070', null, 'REFD-0016', 'iso27001-smsi', '9.3.3',
   'Acter les décisions de la revue',
   'Produire des décisions d''amélioration continue et de changement du SMSI, et en conserver la preuve.',
   null, null, null, null, 6),
  ('REFE-0071', null, 'REFD-0017', 'iso27001-smsi', '10.1',
   'Améliorer en continu le SMSI',
   'Améliorer en permanence la pertinence, l''adéquation et l''efficacité du système.',
   null, null, null, null, 1),
  ('REFE-0072', null, 'REFD-0017', 'iso27001-smsi', '10.2',
   'Traiter les non-conformités et mener les actions correctives',
   'Réagir, corriger, analyser les causes, agir pour éviter la récurrence, vérifier l''efficacité et conserver la preuve.',
   null, null, null, null, 2),
  ('REFE-0073', null, 'REFD-0018', 'iso-27002-2022', '5.1',
   'Politiques de sécurité de l''information',
   'Un corpus de politiques validé par la direction, publié et revu régulièrement, qui fixe le cadre.',
   null, null, null, null, 1),
  ('REFE-0074', null, 'REFD-0018', 'iso-27002-2022', '5.2',
   'Rôles et responsabilités sécurité',
   'Qui est responsable de quoi en matière de sécurité : rôles définis et attribués.',
   null, null, null, null, 2),
  ('REFE-0075', null, 'REFD-0018', 'iso-27002-2022', '5.3',
   'Séparation des tâches',
   'Répartir les tâches sensibles entre plusieurs personnes pour limiter fraude et erreurs.',
   null, null, null, null, 3),
  ('REFE-0076', null, 'REFD-0018', 'iso-27002-2022', '5.4',
   'Responsabilités de la direction',
   'La direction exige et soutient l''application des règles de sécurité par tous.',
   null, null, null, null, 4),
  ('REFE-0077', null, 'REFD-0018', 'iso-27002-2022', '5.5',
   'Relations avec les autorités',
   'Savoir qui contacter (ANSSI, CNIL, police) et maintenir ces contacts à jour.',
   null, null, null, null, 5),
  ('REFE-0078', null, 'REFD-0018', 'iso-27002-2022', '5.6',
   'Relations avec des groupes spécialisés',
   'Participer à des communautés/CERT pour se tenir informé des menaces et bonnes pratiques.',
   null, null, null, null, 6),
  ('REFE-0079', null, 'REFD-0018', 'iso-27002-2022', '5.7',
   'Renseignement sur les menaces',
   'Collecter et exploiter l''information sur les menaces (threat intelligence) pour anticiper.',
   null, null, null, null, 7),
  ('REFE-0080', null, 'REFD-0018', 'iso-27002-2022', '5.8',
   'Sécurité dans la gestion de projet',
   'Intégrer la sécurité dès la conception de tout projet, quelle que soit sa nature.',
   null, null, null, null, 8),
  ('REFE-0081', null, 'REFD-0018', 'iso-27002-2022', '5.9',
   'Inventaire des actifs',
   'Recenser informations et actifs associés, avec un propriétaire pour chacun.',
   null, null, null, null, 9),
  ('REFE-0082', null, 'REFD-0018', 'iso-27002-2022', '5.10',
   'Usage acceptable des actifs',
   'Règles d''utilisation des ressources et des informations, connues des utilisateurs.',
   null, null, null, null, 10),
  ('REFE-0083', null, 'REFD-0018', 'iso-27002-2022', '5.11',
   'Restitution des actifs',
   'Récupérer le matériel et les accès au départ d''une personne ou en fin de contrat.',
   null, null, null, null, 11),
  ('REFE-0084', null, 'REFD-0018', 'iso-27002-2022', '5.12',
   'Classification de l''information',
   'Classer l''information selon sa sensibilité pour la protéger à la juste mesure.',
   null, null, null, null, 12),
  ('REFE-0085', null, 'REFD-0018', 'iso-27002-2022', '5.13',
   'Marquage de l''information',
   'Étiqueter les documents selon leur classification (confidentiel, interne…).',
   null, null, null, null, 13),
  ('REFE-0086', null, 'REFD-0018', 'iso-27002-2022', '5.14',
   'Transfert de l''information',
   'Encadrer les échanges d''information (règles, chiffrement, accords) en interne et externe.',
   null, null, null, null, 14),
  ('REFE-0087', null, 'REFD-0018', 'iso-27002-2022', '5.15',
   'Contrôle d''accès',
   'Politique d''accès fondée sur le besoin d''en connaître et le moindre privilège.',
   null, null, null, null, 15),
  ('REFE-0088', null, 'REFD-0018', 'iso-27002-2022', '5.16',
   'Gestion des identités',
   'Un cycle de vie maîtrisé des identités (création, modification, suppression).',
   null, null, null, null, 16),
  ('REFE-0089', null, 'REFD-0018', 'iso-27002-2022', '5.17',
   'Informations d''authentification',
   'Gérer et protéger mots de passe, secrets et facteurs d''authentification.',
   null, null, null, null, 17),
  ('REFE-0090', null, 'REFD-0018', 'iso-27002-2022', '5.18',
   'Droits d''accès',
   'Attribuer, revoir et retirer les droits d''accès selon les besoins réels.',
   null, null, null, null, 18),
  ('REFE-0091', null, 'REFD-0018', 'iso-27002-2022', '5.19',
   'Sécurité des relations fournisseurs',
   'Encadrer la sécurité dès le choix et tout au long de la relation avec un fournisseur.',
   null, null, null, null, 19),
  ('REFE-0092', null, 'REFD-0018', 'iso-27002-2022', '5.20',
   'Sécurité dans les accords fournisseurs',
   'Formaliser les exigences de sécurité dans les contrats.',
   null, null, null, null, 20),
  ('REFE-0093', null, 'REFD-0018', 'iso-27002-2022', '5.21',
   'Sécurité de la chaîne d''approvisionnement TIC',
   'Maîtriser les risques portés par la chaîne d''approvisionnement informatique.',
   null, null, null, null, 21),
  ('REFE-0094', null, 'REFD-0018', 'iso-27002-2022', '5.22',
   'Suivi des services fournisseurs',
   'Surveiller, revoir et gérer les changements des services sous-traités.',
   null, null, null, null, 22),
  ('REFE-0095', null, 'REFD-0018', 'iso-27002-2022', '5.23',
   'Sécurité de l''usage du cloud',
   'Encadrer l''acquisition et l''usage des services cloud (responsabilités partagées).',
   null, null, null, null, 23),
  ('REFE-0096', null, 'REFD-0018', 'iso-27002-2022', '5.24',
   'Préparation à la gestion des incidents',
   'Planifier et préparer la réponse aux incidents (rôles, procédures).',
   null, null, null, null, 24),
  ('REFE-0097', null, 'REFD-0018', 'iso-27002-2022', '5.25',
   'Évaluation des événements de sécurité',
   'Trier les événements pour décider lesquels sont des incidents.',
   null, null, null, null, 25),
  ('REFE-0098', null, 'REFD-0018', 'iso-27002-2022', '5.26',
   'Réponse aux incidents',
   'Réagir aux incidents selon des procédures établies.',
   null, null, null, null, 26),
  ('REFE-0099', null, 'REFD-0018', 'iso-27002-2022', '5.27',
   'Tirer les leçons des incidents',
   'Capitaliser sur les incidents pour renforcer les défenses (retour d''expérience).',
   null, null, null, null, 27),
  ('REFE-0100', null, 'REFD-0018', 'iso-27002-2022', '5.28',
   'Collecte de preuves',
   'Recueillir et conserver les preuves de façon exploitable (forensique).',
   null, null, null, null, 28),
  ('REFE-0101', null, 'REFD-0018', 'iso-27002-2022', '5.29',
   'Sécurité pendant une perturbation',
   'Maintenir un niveau de sécurité adéquat en cas de crise ou de sinistre.',
   null, null, null, null, 29),
  ('REFE-0102', null, 'REFD-0018', 'iso-27002-2022', '5.30',
   'Continuité TIC',
   'Préparer les moyens informatiques à soutenir la continuité d''activité.',
   null, null, null, null, 30),
  ('REFE-0103', null, 'REFD-0018', 'iso-27002-2022', '5.31',
   'Exigences légales et contractuelles',
   'Identifier et respecter les obligations légales, réglementaires et contractuelles.',
   null, null, null, null, 31),
  ('REFE-0104', null, 'REFD-0018', 'iso-27002-2022', '5.32',
   'Propriété intellectuelle',
   'Respecter les droits de propriété intellectuelle (licences logicielles…).',
   null, null, null, null, 32),
  ('REFE-0105', null, 'REFD-0018', 'iso-27002-2022', '5.33',
   'Protection des enregistrements',
   'Protéger les enregistrements contre perte, altération et accès non autorisé.',
   null, null, null, null, 33),
  ('REFE-0106', null, 'REFD-0018', 'iso-27002-2022', '5.34',
   'Protection des données personnelles',
   'Protéger la vie privée et les données à caractère personnel (lien RGPD).',
   null, null, null, null, 34),
  ('REFE-0107', null, 'REFD-0018', 'iso-27002-2022', '5.35',
   'Revue indépendante de la sécurité',
   'Faire auditer la sécurité par une partie indépendante, à intervalles planifiés.',
   null, null, null, null, 35),
  ('REFE-0108', null, 'REFD-0018', 'iso-27002-2022', '5.36',
   'Conformité aux politiques et normes',
   'Vérifier régulièrement le respect des politiques et normes de sécurité.',
   null, null, null, null, 36),
  ('REFE-0109', null, 'REFD-0018', 'iso-27002-2022', '5.37',
   'Procédures d''exploitation documentées',
   'Documenter les procédures d''exploitation et les rendre disponibles.',
   null, null, null, null, 37),
  ('REFE-0110', null, 'REFD-0019', 'iso-27002-2022', '6.1',
   'Vérification préalable (recrutement)',
   'Vérifier les antécédents des candidats, proportionnellement au poste.',
   null, null, null, null, 1),
  ('REFE-0111', null, 'REFD-0019', 'iso-27002-2022', '6.2',
   'Conditions d''embauche',
   'Inscrire les responsabilités de sécurité dans les contrats de travail.',
   null, null, null, null, 2),
  ('REFE-0112', null, 'REFD-0019', 'iso-27002-2022', '6.3',
   'Sensibilisation et formation',
   'Former et sensibiliser régulièrement l''ensemble du personnel.',
   null, null, null, null, 3),
  ('REFE-0113', null, 'REFD-0019', 'iso-27002-2022', '6.4',
   'Processus disciplinaire',
   'Prévoir des sanctions en cas de manquement aux règles de sécurité.',
   null, null, null, null, 4),
  ('REFE-0114', null, 'REFD-0019', 'iso-27002-2022', '6.5',
   'Responsabilités après le départ',
   'Rappeler les obligations qui subsistent après la fin de contrat (confidentialité).',
   null, null, null, null, 5),
  ('REFE-0115', null, 'REFD-0019', 'iso-27002-2022', '6.6',
   'Accords de confidentialité',
   'Faire signer des engagements de confidentialité (NDA) adaptés.',
   null, null, null, null, 6),
  ('REFE-0116', null, 'REFD-0019', 'iso-27002-2022', '6.7',
   'Télétravail',
   'Sécuriser le travail à distance (matériel, connexion, environnement).',
   null, null, null, null, 7),
  ('REFE-0117', null, 'REFD-0019', 'iso-27002-2022', '6.8',
   'Signalement des événements de sécurité',
   'Permettre à chacun de signaler rapidement un événement suspect.',
   null, null, null, null, 8),
  ('REFE-0118', null, 'REFD-0020', 'iso-27002-2022', '7.1',
   'Périmètres de sécurité physique',
   'Délimiter des zones protégées autour des actifs sensibles.',
   null, null, null, null, 1),
  ('REFE-0119', null, 'REFD-0020', 'iso-27002-2022', '7.2',
   'Contrôle des accès physiques',
   'N''autoriser l''entrée des zones sécurisées qu''aux personnes habilitées.',
   null, null, null, null, 2),
  ('REFE-0120', null, 'REFD-0020', 'iso-27002-2022', '7.3',
   'Sécurisation des bureaux et locaux',
   'Protéger bureaux, salles et installations selon leur sensibilité.',
   null, null, null, null, 3),
  ('REFE-0121', null, 'REFD-0020', 'iso-27002-2022', '7.4',
   'Surveillance physique',
   'Détecter les accès physiques non autorisés (vidéo, alarmes).',
   null, null, null, null, 4),
  ('REFE-0122', null, 'REFD-0020', 'iso-27002-2022', '7.5',
   'Protection contre les menaces environnementales',
   'Se prémunir contre incendie, dégât des eaux, catastrophes naturelles.',
   null, null, null, null, 5),
  ('REFE-0123', null, 'REFD-0020', 'iso-27002-2022', '7.6',
   'Travail en zones sécurisées',
   'Règles de conduite spécifiques dans les zones sensibles.',
   null, null, null, null, 6),
  ('REFE-0124', null, 'REFD-0020', 'iso-27002-2022', '7.7',
   'Bureau propre et écran verrouillé',
   'Ne pas laisser d''informations sensibles visibles ou une session ouverte.',
   null, null, null, null, 7),
  ('REFE-0125', null, 'REFD-0020', 'iso-27002-2022', '7.8',
   'Emplacement et protection du matériel',
   'Positionner et protéger les équipements contre les risques et regards indiscrets.',
   null, null, null, null, 8),
  ('REFE-0126', null, 'REFD-0020', 'iso-27002-2022', '7.9',
   'Sécurité des actifs hors des locaux',
   'Protéger le matériel utilisé à l''extérieur (nomadisme).',
   null, null, null, null, 9),
  ('REFE-0127', null, 'REFD-0020', 'iso-27002-2022', '7.10',
   'Supports de stockage',
   'Gérer le cycle de vie des supports (usage, transport, mise au rebut).',
   null, null, null, null, 10),
  ('REFE-0128', null, 'REFD-0020', 'iso-27002-2022', '7.11',
   'Services supports (utilities)',
   'Fiabiliser électricité, climatisation, réseau soutenant le SI.',
   null, null, null, null, 11),
  ('REFE-0129', null, 'REFD-0020', 'iso-27002-2022', '7.12',
   'Sécurité du câblage',
   'Protéger les câbles réseau et d''alimentation contre interception et dommages.',
   null, null, null, null, 12),
  ('REFE-0130', null, 'REFD-0020', 'iso-27002-2022', '7.13',
   'Maintenance du matériel',
   'Entretenir les équipements pour préserver leur disponibilité et intégrité.',
   null, null, null, null, 13),
  ('REFE-0131', null, 'REFD-0020', 'iso-27002-2022', '7.14',
   'Mise au rebut / réemploi sécurisé',
   'Effacer les données avant de jeter ou réutiliser un équipement.',
   null, null, null, null, 14),
  ('REFE-0132', null, 'REFD-0021', 'iso-27002-2022', '8.1',
   'Terminaux des utilisateurs',
   'Sécuriser postes, portables et mobiles (durcissement, protection).',
   null, null, null, null, 1),
  ('REFE-0133', null, 'REFD-0021', 'iso-27002-2022', '8.2',
   'Droits d''accès à privilèges',
   'Restreindre et surveiller étroitement les comptes à privilèges.',
   null, null, null, null, 2),
  ('REFE-0134', null, 'REFD-0021', 'iso-27002-2022', '8.3',
   'Restriction d''accès à l''information',
   'Limiter l''accès aux informations selon la politique de contrôle d''accès.',
   null, null, null, null, 3),
  ('REFE-0135', null, 'REFD-0021', 'iso-27002-2022', '8.4',
   'Accès au code source',
   'Contrôler l''accès en lecture/écriture au code source et aux outils associés.',
   null, null, null, null, 4),
  ('REFE-0136', null, 'REFD-0021', 'iso-27002-2022', '8.5',
   'Authentification sécurisée',
   'Mettre en œuvre des mécanismes d''authentification robustes (MFA).',
   null, null, null, null, 5),
  ('REFE-0137', null, 'REFD-0021', 'iso-27002-2022', '8.6',
   'Gestion des capacités',
   'Dimensionner et surveiller les ressources pour éviter les saturations.',
   null, null, null, null, 6),
  ('REFE-0138', null, 'REFD-0021', 'iso-27002-2022', '8.7',
   'Protection contre les logiciels malveillants',
   'Antivirus, filtrage et sensibilisation contre les malwares.',
   null, null, null, null, 7),
  ('REFE-0139', null, 'REFD-0021', 'iso-27002-2022', '8.8',
   'Gestion des vulnérabilités techniques',
   'Identifier, évaluer et corriger les vulnérabilités (veille + correctifs).',
   null, null, null, null, 8),
  ('REFE-0140', null, 'REFD-0021', 'iso-27002-2022', '8.9',
   'Gestion des configurations',
   'Définir, appliquer et surveiller des configurations sécurisées.',
   null, null, null, null, 9),
  ('REFE-0141', null, 'REFD-0021', 'iso-27002-2022', '8.10',
   'Suppression de l''information',
   'Effacer les informations qui ne sont plus nécessaires (durées de conservation).',
   null, null, null, null, 10),
  ('REFE-0142', null, 'REFD-0021', 'iso-27002-2022', '8.11',
   'Masquage des données',
   'Masquer/anonymiser les données sensibles quand l''usage le permet.',
   null, null, null, null, 11),
  ('REFE-0143', null, 'REFD-0021', 'iso-27002-2022', '8.12',
   'Prévention des fuites de données',
   'Détecter et empêcher l''exfiltration d''informations sensibles (DLP).',
   null, null, null, null, 12),
  ('REFE-0144', null, 'REFD-0021', 'iso-27002-2022', '8.13',
   'Sauvegarde de l''information',
   'Sauvegarder régulièrement et tester les restaurations.',
   null, null, null, null, 13),
  ('REFE-0145', null, 'REFD-0021', 'iso-27002-2022', '8.14',
   'Redondance des moyens de traitement',
   'Prévoir de la redondance pour la disponibilité des services.',
   null, null, null, null, 14),
  ('REFE-0146', null, 'REFD-0021', 'iso-27002-2022', '8.15',
   'Journalisation',
   'Journaliser les événements pertinents et protéger les journaux.',
   null, null, null, null, 15),
  ('REFE-0147', null, 'REFD-0021', 'iso-27002-2022', '8.16',
   'Surveillance des activités',
   'Surveiller le SI pour détecter les comportements anormaux.',
   null, null, null, null, 16),
  ('REFE-0148', null, 'REFD-0021', 'iso-27002-2022', '8.17',
   'Synchronisation des horloges',
   'Synchroniser les horloges pour fiabiliser la corrélation des journaux.',
   null, null, null, null, 17),
  ('REFE-0149', null, 'REFD-0021', 'iso-27002-2022', '8.18',
   'Utilitaires à privilèges',
   'Encadrer l''usage des outils capables de contourner les contrôles.',
   null, null, null, null, 18),
  ('REFE-0150', null, 'REFD-0021', 'iso-27002-2022', '8.19',
   'Installation de logiciels sur les systèmes',
   'Maîtriser l''installation de logiciels sur les systèmes en production.',
   null, null, null, null, 19),
  ('REFE-0151', null, 'REFD-0021', 'iso-27002-2022', '8.20',
   'Sécurité des réseaux',
   'Protéger les réseaux et les données qui y transitent.',
   null, null, null, null, 20),
  ('REFE-0152', null, 'REFD-0021', 'iso-27002-2022', '8.21',
   'Sécurité des services réseau',
   'Définir et contrôler les mécanismes de sécurité des services réseau.',
   null, null, null, null, 21),
  ('REFE-0153', null, 'REFD-0021', 'iso-27002-2022', '8.22',
   'Cloisonnement des réseaux',
   'Segmenter les réseaux selon la sensibilité et la confiance.',
   null, null, null, null, 22),
  ('REFE-0154', null, 'REFD-0021', 'iso-27002-2022', '8.23',
   'Filtrage web',
   'Filtrer l''accès aux sites web pour réduire l''exposition aux menaces.',
   null, null, null, null, 23),
  ('REFE-0155', null, 'REFD-0021', 'iso-27002-2022', '8.24',
   'Usage de la cryptographie',
   'Définir des règles d''emploi du chiffrement et gérer les clés.',
   null, null, null, null, 24),
  ('REFE-0156', null, 'REFD-0021', 'iso-27002-2022', '8.25',
   'Cycle de développement sécurisé',
   'Intégrer la sécurité tout au long du développement logiciel.',
   null, null, null, null, 25),
  ('REFE-0157', null, 'REFD-0021', 'iso-27002-2022', '8.26',
   'Exigences de sécurité applicative',
   'Spécifier les exigences de sécurité des applications dès l''expression du besoin.',
   null, null, null, null, 26),
  ('REFE-0158', null, 'REFD-0021', 'iso-27002-2022', '8.27',
   'Principes d''architecture sécurisée',
   'Concevoir des systèmes selon des principes d''ingénierie sécurisée.',
   null, null, null, null, 27),
  ('REFE-0159', null, 'REFD-0021', 'iso-27002-2022', '8.28',
   'Codage sécurisé',
   'Appliquer des pratiques de codage évitant les vulnérabilités courantes.',
   null, null, null, null, 28),
  ('REFE-0160', null, 'REFD-0021', 'iso-27002-2022', '8.29',
   'Tests de sécurité',
   'Tester la sécurité pendant le développement et la recette.',
   null, null, null, null, 29),
  ('REFE-0161', null, 'REFD-0021', 'iso-27002-2022', '8.30',
   'Développement externalisé',
   'Encadrer et contrôler la sécurité du développement sous-traité.',
   null, null, null, null, 30),
  ('REFE-0162', null, 'REFD-0021', 'iso-27002-2022', '8.31',
   'Séparation dev / test / production',
   'Cloisonner les environnements pour protéger la production.',
   null, null, null, null, 31),
  ('REFE-0163', null, 'REFD-0021', 'iso-27002-2022', '8.32',
   'Gestion des changements',
   'Maîtriser les changements du SI par un processus formalisé.',
   null, null, null, null, 32),
  ('REFE-0164', null, 'REFD-0021', 'iso-27002-2022', '8.33',
   'Données de test',
   'Sélectionner et protéger les données utilisées pour les tests.',
   null, null, null, null, 33),
  ('REFE-0165', null, 'REFD-0021', 'iso-27002-2022', '8.34',
   'Protection des systèmes pendant les audits',
   'Encadrer les tests d''audit pour ne pas perturber les systèmes en production.',
   null, null, null, null, 34),
  ('REFE-0166', null, 'REFD-0022', 'nis2-art21', 'a',
   'Politiques d''analyse des risques et de sécurité des SI',
   'Disposer de politiques d''analyse de risque et de sécurité des systèmes d''information.',
   null, null, null, null, 1),
  ('REFE-0167', null, 'REFD-0022', 'nis2-art21', 'f',
   'Évaluation de l''efficacité des mesures',
   'Mettre en place des procédures pour mesurer si les dispositifs de sécurité sont efficaces.',
   null, null, null, null, 2),
  ('REFE-0168', null, 'REFD-0023', 'nis2-art21', 'b',
   'Gestion des incidents',
   'Détecter, traiter et notifier les incidents de sécurité.',
   null, null, null, null, 1),
  ('REFE-0169', null, 'REFD-0023', 'nis2-art21', 'c',
   'Continuité d''activité et gestion de crise',
   'Sauvegardes, reprise après sinistre et gestion de crise.',
   null, null, null, null, 2),
  ('REFE-0170', null, 'REFD-0024', 'nis2-art21', 'd',
   'Sécurité de la chaîne d''approvisionnement',
   'Maîtriser les risques liés aux fournisseurs et prestataires directs.',
   null, null, null, null, 1),
  ('REFE-0171', null, 'REFD-0024', 'nis2-art21', 'e',
   'Sécurité de l''acquisition, du développement et de la maintenance',
   'Inclut la gestion et la divulgation des vulnérabilités.',
   null, null, null, null, 2),
  ('REFE-0172', null, 'REFD-0025', 'nis2-art21', 'g',
   'Cyberhygiène et formation',
   'Pratiques d''hygiène de base et formation à la cybersécurité.',
   null, null, null, null, 1),
  ('REFE-0173', null, 'REFD-0025', 'nis2-art21', 'h',
   'Cryptographie et chiffrement',
   'Politiques et procédures d''usage de la cryptographie.',
   null, null, null, null, 2),
  ('REFE-0174', null, 'REFD-0025', 'nis2-art21', 'i',
   'Sécurité RH, contrôle d''accès et gestion des actifs',
   'Sécurité des ressources humaines, politiques d''accès et inventaire des actifs.',
   null, null, null, null, 3),
  ('REFE-0175', null, 'REFD-0025', 'nis2-art21', 'j',
   'Authentification forte et communications sécurisées',
   'Authentification multifacteur et communications (voix, vidéo, texte, urgence) sécurisées.',
   null, null, null, null, 4),
  ('REFE-0176', null, 'REFD-0026', 'dora', '1.1',
   'Cadre de gestion du risque TIC',
   'Gouvernance, responsabilité de l''organe de direction et cadre documenté.',
   null, null, null, null, 1),
  ('REFE-0177', null, 'REFD-0026', 'dora', '1.2',
   'Cartographie des actifs et dépendances',
   'Identifier les fonctions, actifs et dépendances TIC critiques.',
   null, null, null, null, 2),
  ('REFE-0178', null, 'REFD-0026', 'dora', '1.3',
   'Protection et prévention',
   'Mesures de sécurité et de continuité pour prévenir les incidents.',
   null, null, null, null, 3),
  ('REFE-0179', null, 'REFD-0026', 'dora', '1.4',
   'Détection des anomalies',
   'Détecter rapidement les activités anormales et les incidents TIC.',
   null, null, null, null, 4),
  ('REFE-0180', null, 'REFD-0026', 'dora', '1.5',
   'Politique de continuité et de reprise',
   'Sauvegardes, plans de reprise, objectifs de temps et de point de reprise.',
   null, null, null, null, 5),
  ('REFE-0181', null, 'REFD-0027', 'dora', '2.1',
   'Processus de gestion des incidents TIC',
   'Détecter, enregistrer et traiter les incidents de manière cohérente.',
   null, null, null, null, 1),
  ('REFE-0182', null, 'REFD-0027', 'dora', '2.2',
   'Classification des incidents',
   'Évaluer l''importance des incidents selon des critères définis.',
   null, null, null, null, 2),
  ('REFE-0183', null, 'REFD-0027', 'dora', '2.3',
   'Notification des incidents majeurs',
   'Déclarer les incidents majeurs aux autorités compétentes dans les délais.',
   null, null, null, null, 3),
  ('REFE-0184', null, 'REFD-0028', 'dora', '3.1',
   'Programme de tests de résilience',
   'Tester régulièrement outils et systèmes TIC (vulnérabilités, scénarios).',
   null, null, null, null, 1),
  ('REFE-0185', null, 'REFD-0028', 'dora', '3.2',
   'Tests avancés (TLPT)',
   'Tests d''intrusion fondés sur la menace pour les entités concernées.',
   null, null, null, null, 2),
  ('REFE-0186', null, 'REFD-0029', 'dora', '4.1',
   'Registre des prestataires TIC',
   'Tenir un registre des accords avec les fournisseurs de services TIC.',
   null, null, null, null, 1),
  ('REFE-0187', null, 'REFD-0029', 'dora', '4.2',
   'Exigences contractuelles clés',
   'Clauses obligatoires (accès, audit, sécurité, sous-traitance).',
   null, null, null, null, 2),
  ('REFE-0188', null, 'REFD-0029', 'dora', '4.3',
   'Surveillance des prestataires critiques',
   'Suivre les prestataires TIC critiques et concentrer les risques.',
   null, null, null, null, 3),
  ('REFE-0189', null, 'REFD-0029', 'dora', '4.4',
   'Stratégie de sortie',
   'Prévoir la réversibilité et la sortie des services critiques.',
   null, null, null, null, 4),
  ('REFE-0190', null, 'REFD-0030', 'dora', '5.1',
   'Partage de renseignements sur les menaces',
   'Participer à des dispositifs d''échange d''information sur les cybermenaces.',
   null, null, null, null, 1),
  ('REFE-0191', null, 'REFD-0031', 'aircyber', '1.1',
   'Les accès à vos bâtiments, bureaux et installations informatiques sont-ils contrôlés et limités (par exemple par l''utilisation de portes verrouillées, de lecteurs de cartes magnétiques, de dispositifs de prévention, de détection et d''intervention en cas de vol, etc.) ?',
   null,
   null, null, null, null, 1),
  ('REFE-0192', null, 'REFD-0031', 'aircyber', '1.2',
   'L''enceinte de vos salles serveurs et locaux techniques est-elle sécurisée par une clôture, une barrière à l''entrée, une vidéosurveillance , et une alarme ?',
   null,
   'bronze', 'high', 'CL5', null, 2),
  ('REFE-0193', null, 'REFD-0031', 'aircyber', '1.3',
   'L''enceinte de vos locaux est-elle sécurisée par des gardiens avec une surveillance de nuit, une barrière à l''entrée, une vidéosurveillance et une alarme ?',
   null,
   'silver', 'medium', 'CL5', null, 3),
  ('REFE-0194', null, 'REFD-0031', 'aircyber', '1.4',
   'Les visiteurs sont-ils accompagnés en permanence dans vos locaux ?',
   null,
   null, null, null, null, 4),
  ('REFE-0195', null, 'REFD-0031', 'aircyber', '1.5',
   'Utilisez-vous des onduleurs ou des batteries de secours (pour assurer l''alimentation en cas de coupure de courant) ?',
   null,
   null, null, null, null, 5),
  ('REFE-0196', null, 'REFD-0031', 'aircyber', '1.6',
   'Avez-vous une politique de bureau (physique et verrouillage écran) propre pour les papiers et les supports de stockage amovibles sensibles ?',
   null,
   'silver', 'low', 'CL5', null, 6),
  ('REFE-0197', null, 'REFD-0031', 'aircyber', '1.7',
   'Si vous avez plusieurs sites géographiques informatiques effectuez-vous des visites pour vérifier la sécurité physique et informatique régulièrement (min. 1 fois tous les 2 ans)',
   null,
   null, null, null, null, 7),
  ('REFE-0198', null, 'REFD-0032', 'aircyber', '2.1',
   'Avez-vous un inventaire complet et à jour de votre parc informatique ? (serveurs, PC de bureau, PC portable, imprimante , équipements réseaux, smartphones, etc..)Disposez-vous d''un inventaire précis et à jour des actifs (poste de travail, serveur...) entrant dans la production de vos clients ?',
   null,
   null, null, null, null, 1),
  ('REFE-0199', null, 'REFD-0032', 'aircyber', '2.1.1',
   'Avez-vous un schéma réseaux complet de votre société ?',
   null,
   null, null, null, null, 2),
  ('REFE-0200', null, 'REFD-0032', 'aircyber', '2.1.2',
   'Votre cartographie réseaux et protocoles autorisés est-elle disponible et automatiquement mise à jour ?',
   null,
   'gold', 'medium', 'CL4', null, 3),
  ('REFE-0201', null, 'REFD-0032', 'aircyber', '2.1.3',
   'Avez-vous mis en place une solution de détection et de surveillance (type NAC, surveillance DHCP) de la connexion de nouveaux équipements (type PC, serveur, imprimante, box) sur votre réseau interne ?',
   null,
   'gold', 'high', 'CL4', null, 4),
  ('REFE-0202', null, 'REFD-0032', 'aircyber', '2.10',
   'Définissez-vous et appliquez-vous une politique de sauvegarde automatique des composants critiques avec une procédure de restauration testée?',
   null,
   null, null, null, null, 5),
  ('REFE-0203', null, 'REFD-0032', 'aircyber', '2.11',
   'Avez-vous définit des règles concernant le comportement des utilisateurs vis-à-vis des périphériques qu''ils pourraient brancher sur leurs ordinateurs (interdire de brancher une clé usb trouvée par hasard, faire un scan antivirus des clés des partenaires, ne pas brancher n''importe quel accessoire sur son pc…)?',
   null,
   'bronze', 'medium', 'CL3', null, 6),
  ('REFE-0204', null, 'REFD-0032', 'aircyber', '2.2',
   'La liste de votre parc informatique est-il mis à jour régulièrement ? (serveurs, PC de bureau, PC portable, imprimantes, équipements réseaux, smartphones, etc.)',
   null,
   null, null, null, null, 7),
  ('REFE-0205', null, 'REFD-0032', 'aircyber', '2.3',
   'Existe-t-il une personne ou un département affecté à la gestion du système informatique ?',
   null,
   null, null, null, null, 8),
  ('REFE-0206', null, 'REFD-0032', 'aircyber', '2.4',
   'Avez-vous un référent en sécurité des systèmes d’information (RSSI ou équivalent) ?',
   null,
   null, null, null, null, 9),
  ('REFE-0207', null, 'REFD-0032', 'aircyber', '2.4.1',
   'Votre organisation a-t-elle mis en place une politique de sécurité de l''information et des directives associées ? Les communiquez-vous à l''ensemble des utilisateurs et des responsables projet ?',
   null,
   'bronze', 'high', 'CL0', null, 10),
  ('REFE-0208', null, 'REFD-0032', 'aircyber', '2.5',
   'Utilisez-vous un outil pour vous assurer que l''ensemble de vos postes de travail (serveurs, PC portable, PC de bureau) sont sécurisés d''une manière homogène (politiques de sécurité identiques entre les postes, gestion des écarts, etc.)',
   null,
   null, null, null, null, 11),
  ('REFE-0209', null, 'REFD-0032', 'aircyber', '2.5.1',
   'Utilisez-vous un outil pour vous assurer que l''ensemble de vos smartphones sont sécurisés d''une manière homogène (politiques de sécurité identiques entre les postes, gestion des écarts, etc.)',
   null,
   'silver', 'medium', 'CL3', null, 12),
  ('REFE-0210', null, 'REFD-0032', 'aircyber', '2.6',
   'Avez-vous implémenté un outil de détection des programmes malveillants (antivirus) sur l’ensemble du parc informatique bureautique et sur les serveurs ?',
   null,
   null, null, null, null, 13),
  ('REFE-0211', null, 'REFD-0032', 'aircyber', '2.7',
   'Avez-vous implémenté un outil de suppression ou de mise en quarantaine des programmes malveillants basé sur la détection de comportement (EDR) sur l’ensemble du parc informatique ?',
   null,
   'silver', 'medium', 'CL2', null, 14),
  ('REFE-0212', null, 'REFD-0032', 'aircyber', '2.8',
   'Les smartphones d''entreprise sont-ils gérés par votre équipe informatique ? (par exemple : configuration des mots de passe et de la politique des anti-virus)',
   null,
   null, null, null, null, 15),
  ('REFE-0213', null, 'REFD-0032', 'aircyber', '2.8.1',
   'Les smartphones d''entreprise ont-ils une politique de sécurité dédiée ?',
   null,
   'bronze', 'high', 'CL3', null, 16),
  ('REFE-0214', null, 'REFD-0032', 'aircyber', '2.8.2',
   'Les smartphones d''entreprise sont-ils gérés de manière centrale avec un outil permettant de contrôler leur configuration, état de sécurité ?',
   null,
   null, null, null, null, 17),
  ('REFE-0215', null, 'REFD-0032', 'aircyber', '2.9',
   'Disposez-vous d''une solution centralisée pour activer, conserver (au moins un an) et configurer les journaux des composants les plus importants comme les firewalls ou les accès internet ?',
   null,
   'silver', 'low', 'CL1', null, 18),
  ('REFE-0216', null, 'REFD-0032', 'aircyber', '2.9.1',
   'Analysez-vous les journaux des composants (serveurs, PC de bureau, PC portable, imprimante , équipements réseaux, smartphones, ...) les plus importants (exemple : supervision/investigation temps réel, SOC, etc.) ?',
   null,
   'gold', 'medium', 'CL1', null, 19),
  ('REFE-0217', null, 'REFD-0032', 'aircyber', '2.9.2',
   'Activez-vous, gardez-vous au moins pendant un an et configurez-vous les journaux des authentifications des administrateurs sur les équipements réseaux, serveurs et ordinateurs?',
   null,
   'silver', 'low', 'CL1', null, 20),
  ('REFE-0218', null, 'REFD-0032', 'aircyber', '2.9.3',
   'Utilisez-vous une procédure pour implémenter l''enregistrement des journaux des composants les plus importants comme les firewall, les accès internet ?',
   null,
   'bronze', 'medium', 'CL1', null, 21),
  ('REFE-0219', null, 'REFD-0032', 'aircyber', '2.9.4',
   'Sécurisez-vous la configuration par défaut de votre serveur Active Directory (AD) et gardez-vous au moins pendant un an les logs avec les informations d’authentification sur l’AD? (Durcissement du système d’exploitation (restreindre les protocoles et services exécutés, interdire l’accès internet direct depuis le serveur, désactiver les comptes par défaut) et du paramétrage du service Active Directory (AD en lecture seule, validation des politiques, des règles de sécurité des postes de travail gérés via l’AD, restriction et sécurisation des mots de passe des comptes à privilèges…).',
   null,
   'bronze', 'medium', 'CL4', null, 22),
  ('REFE-0220', null, 'REFD-0032', 'aircyber', '2.9.5',
   'Avez-vous terminé la sécurisation de votre serveur active directory (en appliquant l’ensemble des bonnes pratiques ou accepté les risques résiduels des mesures non déployées) et en permettant la génération d’alertes détaillées en cas d’incident sécurité (configuration des journaux détaillés, surveillance des journaux) ?',
   null,
   'silver', 'medium', 'CL4', null, 23),
  ('REFE-0221', null, 'REFD-0033', 'aircyber', '3.1',
   'Chaque employé dispose-t-il d''un identifiant informatique nominatif sur les environnements IT ou de production ?',
   null,
   'silver', 'high', 'CL5', null, 1),
  ('REFE-0222', null, 'REFD-0033', 'aircyber', '3.1.1',
   'Effectuez-vous une vérification de la nationalité, des antécédents des employés avant leur embauche quand nécessaire (par exemple : demande casier judiciaire, prise de références), en fonction de leur rôle prévu au sein de l''entreprise (par exemple personnel sénior, personnel informatique, personnel d''entretien) ?',
   null,
   'bronze', 'medium', 'CL0', null, 2),
  ('REFE-0223', null, 'REFD-0033', 'aircyber', '3.1.2',
   'Lorsque des contraintes de sécurité ont été identifiées, habilitation requise par exemple, vérifiez-vous les antécédents et l''adéquation du profil des nouveaux embauchés (casier judiciaire/nationalité) ?',
   null,
   null, null, null, null, 3),
  ('REFE-0224', null, 'REFD-0033', 'aircyber', '3.2',
   'Confirmez-vous que les comptes affectés aux utilisateurs pour accéder et utiliser le système d''information (ordinateur, serveur, cloud) ne disposent pas de droits administrateur (les administrateurs peuvent modifier les paramètres de sécurité, installer des logiciels et des périphériques et accéder à tous les fichiers de l''ordinateur) ?',
   null,
   null, null, null, null, 4),
  ('REFE-0225', null, 'REFD-0033', 'aircyber', '3.3',
   'Disposez-vous d''un inventaire exhaustif des comptes à privilèges (d''administration) et le maintenez-vous à jour ?',
   null,
   'bronze', 'high', 'CL3', null, 5),
  ('REFE-0226', null, 'REFD-0033', 'aircyber', '3.3.1',
   'Si vous utilisez des comptes d''administrateurs sur les machines, avez-vous une solution en place pour contrôler leur sécurité (sécurité du mot de passe, blocage du compte, changement à distance, etc.)?',
   null,
   'silver', 'high', 'CL5', null, 6),
  ('REFE-0227', null, 'REFD-0033', 'aircyber', '3.4',
   'Formez-vous les équipes opérationnelles, (administrateurs réseau, sécurité et système, chefs de projet, développeurs, RSSI) à la sécurité des systèmes d''information ?',
   null,
   'silver', 'high', 'CL0', null, 7),
  ('REFE-0228', null, 'REFD-0033', 'aircyber', '3.5',
   'Sensibilisez-vous les utilisateurs aux règles, bons comportements à adopter et consignes de sécurité de l’information régissant l’activité quotidienne ?Ceci est-il confirmé par la signature d’une charte des systèmes d’information précisant les règles, et consignes cybersécurité qu’ils doivent respecter, ou un équivalent juridiquement opposable (comme annexe règlement intérieur, contrat de travail)?',
   null,
   'bronze', 'high', 'CL0', null, 8),
  ('REFE-0229', null, 'REFD-0033', 'aircyber', '3.5.1',
   'Mettez-vous en place des formations systématique en cybersécurité pour l''ensemble des employés, et contractants, adaptées ou customisées en fonction de leur rôle dans l''entreprise et effectuez-vous le suivi de participation à ces formations?',
   null,
   'gold', 'medium', 'CL0', null, 9),
  ('REFE-0230', null, 'REFD-0033', 'aircyber', '3.6',
   'Les utilisateurs ont-ils à leur disposition des moyens de sécurité informatique liés aux déplacements sur leur PC portable? (Filtre écran, câble de sécurité, VPN, chiffrement, surveillance,…)',
   null,
   'bronze', 'high', 'CL6', null, 10),
  ('REFE-0231', null, 'REFD-0034', 'aircyber', '4.1',
   'Existe-t-il une procédure d''entrée et de départ concernant les utilisateurs et administrateurs ?',
   null,
   null, null, null, null, 1),
  ('REFE-0232', null, 'REFD-0034', 'aircyber', '4.10',
   'Avez-vous souscrit à un flux d''actualité vous informant des nouvelles failles cybersécurité et d''alertes cybersécurité comme ceux proposés par les CERT gouvernementaux (ANSSI FR, NIST US), les sites de veille sécurité internationaux ?',
   null,
   'bronze', 'low', 'CL1', null, 2),
  ('REFE-0233', null, 'REFD-0034', 'aircyber', '4.11',
   'Avez-vous mis en place ou contracté des services d''alertes sécurité professionnels et customisés pour votre entreprise, son secteur d''activité, les équipements informatiques que vous avez déployés etc. ? (CERT" professionnels ou sectoriels, services de Threat Intelligence) ?"',
   null,
   'gold', 'high', 'CL0', null, 3),
  ('REFE-0234', null, 'REFD-0034', 'aircyber', '4.2',
   'Faut-il des droits d''administration nécessitant une authentification différente avec un compte admin ou un support informatique aux utilisateurs pour installer des logiciels sur leurs ordinateurs ?',
   null,
   null, null, null, null, 4),
  ('REFE-0235', null, 'REFD-0034', 'aircyber', '4.2.1',
   'Avez-vous une gestion centralisée et sécurisée des comptes des utilisateurs capable de détecter des comportements anormaux (vol d''identifiants, utilisation sur des serveurs non standard, tentative de découverte du mot de passe…)?',
   null,
   'silver', 'high', 'CL5', null, 5),
  ('REFE-0236', null, 'REFD-0034', 'aircyber', '4.3',
   'Protégez-vous les mots de passe stockés sur les systèmes (chiffrement) ?',
   null,
   'bronze', 'high', 'CL5', null, 6),
  ('REFE-0237', null, 'REFD-0034', 'aircyber', '4.4',
   'Existe-t-il une politique de gestion des mots de passe (fréquence de mise à jour, contraintes minimum de sécurité, caractères spéciaux, nombre de caractères, politique spécifique pour les profils administrateurs…) ?',
   null,
   null, null, null, null, 7),
  ('REFE-0238', null, 'REFD-0034', 'aircyber', '4.4.1',
   'Changez-vous les mots de passe et identifiants par défaut du parc informatique ?',
   null,
   'bronze', 'high', 'CL4', null, 8),
  ('REFE-0239', null, 'REFD-0034', 'aircyber', '4.5',
   'Faites-vous régulièrement des mises à jour des composants (serveurs, PC de bureau, PC portable, imprimantes , équipements réseaux, smartphones, etc..) sur votre parc informatique ?',
   null,
   null, null, null, null, 9),
  ('REFE-0240', null, 'REFD-0034', 'aircyber', '4.6',
   'Anticipez-vous la fin de la maintenance des logiciels et systèmes ?',
   null,
   null, null, null, null, 10),
  ('REFE-0241', null, 'REFD-0034', 'aircyber', '4.6.1',
   'Afin d’éviter les failles potentielles (logiciel inconnu, non mis à jour…) vérifiez-vous les versions des logiciels installés sur votre parc informatique ?',
   null,
   'bronze', 'medium', 'CL3', null, 11),
  ('REFE-0242', null, 'REFD-0034', 'aircyber', '4.6.2',
   'Avez-vous la liste des logiciels autorisés et interdits ?',
   null,
   'silver', 'low', 'CL3', null, 12),
  ('REFE-0243', null, 'REFD-0034', 'aircyber', '4.7',
   'Suivez-vous au moins de manière hebdomadaire une procédure de gestion des alertes et avis de sécurité de CERT (Computer Emergency Response Team) et des éditeurs de logiciels ?',
   null,
   'silver', 'low', 'CL0', null, 13),
  ('REFE-0244', null, 'REFD-0034', 'aircyber', '4.8',
   'Existe-t-il un centre d’opération de sécurité SOC (Security OperationCenter) permettant la détection et la supervision de la sécurité du système d''information ?',
   null,
   'gold', 'low', 'CL1', null, 14),
  ('REFE-0245', null, 'REFD-0034', 'aircyber', '4.8.1',
   'Centralisez-vous au travers d’outils de collecte SIEM (Security Information Event Management) les incidents et évènements de sécurité ?',
   null,
   'silver', 'low', 'CL1', null, 15),
  ('REFE-0246', null, 'REFD-0034', 'aircyber', '4.8.2',
   'Supervisez-vous les périphériques des utilisateurs comme par exemple : PC fixe, PC portable, smartphone, clé USB, etc... ?',
   null,
   'gold', 'low', 'CL3', null, 16),
  ('REFE-0247', null, 'REFD-0034', 'aircyber', '4.8.3',
   'Existe-t-il un outil d’alerte permettant d’exécuter un arrêt automatique ou une isolation de certain éléments du parc en cas d’incident majeur ?',
   null,
   'gold', 'medium', 'CL1', null, 17),
  ('REFE-0248', null, 'REFD-0034', 'aircyber', '4.8.4',
   'Existe-t-il un centre de supervision de votre réseau permettant la détection des incidents de sécurité (NOC (Network Operations Center))?',
   null,
   'gold', 'low', 'CL2', null, 18),
  ('REFE-0249', null, 'REFD-0034', 'aircyber', '4.8.5',
   'Bloquez-vous les connexions non autorisées à votre réseau ?',
   null,
   null, null, null, null, 19),
  ('REFE-0250', null, 'REFD-0034', 'aircyber', '4.8.6',
   'Avez-vous déployé et supervisez-vous des sondes réseau pour détecter des activités malicieuses ou anormales?',
   null,
   'gold', 'low', 'CL2', null, 20),
  ('REFE-0251', null, 'REFD-0034', 'aircyber', '4.9',
   'Existe-t-il des processus d''escalade et d''alerte des incidents de sécurité ?',
   null,
   'bronze', 'high', 'CL1', null, 21),
  ('REFE-0252', null, 'REFD-0034', 'aircyber', '4.9.1',
   'Avez-vous mis en place des solutions sur les PC et les Serveurs permettant de détecter des comportements anormaux, les bloquer ou alerter (IDS/IPS) ?',
   null,
   'silver', 'medium', 'CL3', null, 22),
  ('REFE-0253', null, 'REFD-0035', 'aircyber', '5.1',
   'Connaissez-vous les serveurs les plus sensibles de votre parc ?',
   null,
   null, null, null, null, 1),
  ('REFE-0254', null, 'REFD-0035', 'aircyber', '5.10',
   'Existe-t-il une surveillance du trafic Internet avec des alertes mais aussi des indicateurs (KPI) sur l''utilisation des données de l''entreprise sur Internet ?',
   null,
   'silver', 'low', 'CL2', null, 2),
  ('REFE-0255', null, 'REFD-0035', 'aircyber', '5.10.1',
   'Chiffrez-vous vos connexions entre vos différents sites de votre société et vos partenaires ?',
   null,
   null, null, null, null, 3),
  ('REFE-0256', null, 'REFD-0035', 'aircyber', '5.10.2',
   'Si vous avez autorisé la navigation vers des sites internet non-professionnel, avez-vous déployé une solution de navigation sécurisée pour ces sites l''isolant du réseau informatique standard?',
   null,
   'gold', 'high', 'CL2', null, 4),
  ('REFE-0257', null, 'REFD-0035', 'aircyber', '5.11',
   'Avez-vous un accès Wifi visiteur" isolé du reste du réseau de l’Entreprise ? (Connexion spécifique, Wifi dédié ?)"',
   null,
   null, null, null, null, 5),
  ('REFE-0258', null, 'REFD-0035', 'aircyber', '5.12',
   'Avez-vous un accès Wifi sécurisé avec une séparation des usages ? ( personnel , industriel, professionnelle , visiteur, etc.)',
   null,
   null, null, null, null, 6),
  ('REFE-0259', null, 'REFD-0035', 'aircyber', '5.13',
   'Existe-t-il un système de filtrage des E-mails ? (Anti-spam, suppression des fichiers joints suspects, etc…)',
   null,
   null, null, null, null, 7),
  ('REFE-0260', null, 'REFD-0035', 'aircyber', '5.13.1',
   'Offrez-vous aux utilisateurs la possibilité de chiffrer facilement le contenu des E-mails ?',
   null,
   'silver', 'high', 'CL6', null, 8),
  ('REFE-0261', null, 'REFD-0035', 'aircyber', '5.14',
   'Sécurisez-vous les interconnexions réseau avec vos sous-traitants et fournisseurs ?',
   null,
   'silver', 'medium', 'CL4', null, 9),
  ('REFE-0262', null, 'REFD-0035', 'aircyber', '5.14.1',
   'Offrez-vous une plateforme d’échange sécurisé pour vos sous-traitants et fournisseurs ?',
   null,
   'silver', 'medium', 'CL6', null, 10),
  ('REFE-0263', null, 'REFD-0035', 'aircyber', '5.14.2',
   'Si votre site Web est hébergé à l''intérieur de l''entreprise, séparez-vous votre site Web et les services accessibles par Internet du reste du réseau de l''entreprise (via une zone réseaux ségréguée, type DMZ") ? "',
   null,
   null, null, null, null, 11),
  ('REFE-0264', null, 'REFD-0035', 'aircyber', '5.15',
   'N’autorisez-vous la connexion au réseau qu''aux appareils identifiés et gérés par le système d''information ?',
   null,
   'silver', 'low', 'CL4', null, 12),
  ('REFE-0265', null, 'REFD-0035', 'aircyber', '5.17',
   'Pour l''accès à distance à votre système d''information (utilisateurs nomades ou d''astreinte, sites distants, actions de maintenance préventives ou correctives) avez-vous systématiquement mis en place une solution de sécurité garantissant une identification et une authentification forte de l''utilisateur (VPN associé à de la MFA, identifiant/mot de passe personnels, uniques et incessibles, certificats, ...) ?',
   null,
   'bronze', 'high', 'CL5', null, 13),
  ('REFE-0266', null, 'REFD-0035', 'aircyber', '5.2',
   'Utilisez-vous des équipements de sécurité pour protéger et cloisonner votre réseau interne. (Firewall, proxy, etc.) ?',
   null,
   null, null, null, null, 14),
  ('REFE-0267', null, 'REFD-0035', 'aircyber', '5.2.1',
   'Utilisez-vous un firewall sur les postes clients ? (PC portable, PC de bureau) ?',
   null,
   'bronze', 'medium', 'CL3', null, 15),
  ('REFE-0268', null, 'REFD-0035', 'aircyber', '5.2.2',
   'Contrôlez-vous la configuration des firewall au moins une fois par an ?',
   null,
   null, null, null, null, 16),
  ('REFE-0269', null, 'REFD-0035', 'aircyber', '5.3',
   'Avez-vous une architecture réseau privilégiant les communications sécurisées et n''autorisant que de manière exceptionnelle les communications non-sécurisées en les isolant du reste du réseau. Par exemple, encourager les communications chiffrées et interdire les protocoles non sécurisés (ex : configurer les pare-feu réseau et sur les postes de travail/serveurs pour interdire le protocole telnet-23 dans le réseau local, l''utilisation de partages Windows via Samba v1, l''authentification NTLMv1, etc.) ?',
   null,
   'bronze', 'high', 'CL4', null, 17),
  ('REFE-0270', null, 'REFD-0035', 'aircyber', '5.4',
   'Utilisez-vous une authentification forte pour la connexion à vos mails entreprise depuis Internet (double authentification avec téléphone et / ou blocage des comptes contre les essais de mots de passe, changement de mot de passe régulier, mot de passe complexe) ?',
   null,
   'silver', 'high', 'CL5', null, 18),
  ('REFE-0271', null, 'REFD-0035', 'aircyber', '5.5',
   'Utilisez-vous une authentification forte et surveillez-vous (alertes en cas d''échec) la connexion aux équipements sensibles comme par exemple : l’administration des équipements IT, l''administration des services cloud et sites internet ?',
   null,
   'gold', 'medium', 'CL5', null, 19),
  ('REFE-0272', null, 'REFD-0035', 'aircyber', '5.5.1',
   'Utilisez-vous des fonctionnalités SSO (single sign on) pour les applications http ou E-SSO avec un gestionnaire de mots de passe automatisé ?',
   null,
   'silver', 'high', 'CL5', null, 20),
  ('REFE-0273', null, 'REFD-0035', 'aircyber', '5.6',
   'Utilisez-vous un réseau dédié, cloisonné (internet, poste utilisateur) et sécurisé par des mécanismes de ruptures protocolaires (machines de rebond, bastion d''administration, proxyfication, etc.) pour l’administration du système d’information ?',
   null,
   'silver', 'high', 'CL5', null, 21),
  ('REFE-0274', null, 'REFD-0035', 'aircyber', '5.6.1',
   'Avez-vous une protection sur les postes de travail pour éviter que les utilisateurs puissent ouvrir des réseaux internet sans sécurité en branchant par exemple un modem / clé usb 3G, smartphone et en même temps avoir ces même ordinateurs connectés au réseau de l''entreprise ?',
   null,
   'silver', 'medium', 'CL5', null, 22),
  ('REFE-0275', null, 'REFD-0035', 'aircyber', '5.7',
   'Vous protégez-vous des menaces relatives à l''utilisation de supports amovibles ?',
   null,
   'silver', 'medium', 'CL3', null, 23),
  ('REFE-0276', null, 'REFD-0035', 'aircyber', '5.7.1',
   'Chiffrez-vous les données sensibles sur des supports amovibles sans aucune action requise de la part des utilisateurs (chiffrement automatique transparent) ?',
   null,
   'silver', 'medium', 'CL6', null, 24),
  ('REFE-0277', null, 'REFD-0035', 'aircyber', '5.8',
   'Tous les équipements (ordinateur, tablette, smartphone), connectés au système d’information de l’entreprise ont-ils fait l’objet d’une procédure formelle et préalable d’approbation ?',
   null,
   'bronze', 'medium', 'CL4', null, 25),
  ('REFE-0278', null, 'REFD-0035', 'aircyber', '5.8.1',
   'Avez-vous un contrôle total sur l’environnement professionnel des applications d''entreprise / données sur les appareils mobiles? (Etanchéité des environnements personnel et professionnel)',
   null,
   'silver', 'medium', 'CL3', null, 26),
  ('REFE-0279', null, 'REFD-0035', 'aircyber', '5.9',
   'Les accès à internet sont-ils filtrés par un serveur mandataire (proxy) ?',
   null,
   'silver', 'high', 'CL2', null, 27),
  ('REFE-0280', null, 'REFD-0035', 'aircyber', '5.9.1',
   'Protégez-vous vos serveurs web accessibles de l’extérieur du réseau de la société par des équipement de filtrage type WAF (web access filtering) ?',
   null,
   'silver', 'low', 'CL4', null, 28),
  ('REFE-0281', null, 'REFD-0036', 'aircyber', '6.1',
   'Les données importantes sont-elles sauvegardées régulièrement ?',
   null,
   null, null, null, null, 1),
  ('REFE-0282', null, 'REFD-0036', 'aircyber', '6.10',
   'Avez-vous défini que les données de votre entreprise devaient être associées à des responsables identifiés et leurs responsabilités (données des RH, données du bureau d''étude, etc.)',
   null,
   'bronze', 'low', 'CL6', null, 2),
  ('REFE-0283', null, 'REFD-0036', 'aircyber', '6.2',
   'Vos sauvegardes sont-elles protégées dans un local sécurisé ?',
   null,
   null, null, null, null, 3),
  ('REFE-0284', null, 'REFD-0036', 'aircyber', '6.3',
   'Utilisez-vous un système de stockage et de sauvegarde des données piloté en central, comme un Cloud (AWS, O365 Sharepoint, OneDrive, google drive,…) ?',
   null,
   'gold', 'medium', 'CL6', null, 4),
  ('REFE-0285', null, 'REFD-0036', 'aircyber', '6.4',
   'Chiffrez-vous les disques durs des ordinateurs, smartphones sans aucune interaction des utilisateurs (chiffrage automatique transparent) ?',
   null,
   'bronze', 'high', 'CL6', null, 5),
  ('REFE-0286', null, 'REFD-0036', 'aircyber', '6.5',
   'Mettez-vous en place des solutions de gestion de protection des données de l’entreprise (détection de fuite des données confidentielles, rôles et responsabilités …) ?',
   null,
   'gold', 'high', 'CL6', null, 6),
  ('REFE-0287', null, 'REFD-0036', 'aircyber', '6.6',
   'Procédez-vous à des audits de sécurité réguliers (applicatif, réseau, processus), puis appliquez-vous les actions correctives associées ?',
   null,
   'bronze', 'low', 'CL0', null, 7),
  ('REFE-0288', null, 'REFD-0036', 'aircyber', '6.6.1',
   'Vérifiez-vous la conformité des filiales de votre entreprise ?',
   null,
   'silver', 'medium', 'CL0', null, 8),
  ('REFE-0289', null, 'REFD-0036', 'aircyber', '6.6.2',
   'Effectuez-vous régulièrement des vérifications des règles de vos Firewalls ?',
   null,
   null, null, null, null, 9),
  ('REFE-0290', null, 'REFD-0036', 'aircyber', '6.7',
   'Procédez-vous à des tests d''intrusion (pentest) réguliers sur votre SI et de vos filiales, puis appliquez-vous les actions correctives associées ?',
   null,
   'gold', 'high', 'CL0', null, 10),
  ('REFE-0291', null, 'REFD-0036', 'aircyber', '6.7.1',
   'Procédez-vous à des tests d''intrusion (pentest) des sites web de votre société, puis appliquez-vous les actions correctives associées ?',
   null,
   'silver', 'medium', 'CL3', null, 11),
  ('REFE-0292', null, 'REFD-0036', 'aircyber', '6.7.2',
   'Vérifiez-vous et mettez-vous à jour régulièrement vos dispositifs de détection d''attaque cyber ? (Via par exemple la mise à jour des règles de supervision sécurité suite aux pentests effectués sur vos systèmes, ou une gestion de projet sécurité)',
   null,
   'gold', 'high', 'CL1', null, 12),
  ('REFE-0293', null, 'REFD-0036', 'aircyber', '6.8',
   'Avez-vous à disposition les moyens et outils nécessaires pour chiffrer les données sensibles envoyées à l''extérieur de l''entreprise ?',
   null,
   'bronze', 'high', 'CL6', null, 13),
  ('REFE-0294', null, 'REFD-0036', 'aircyber', '6.9',
   'Définissez-vous une politique de classification des données en fonction de leur usage (public, confidentiel entreprise, confidentiel…) et des règles de protection à appliquer à ces données ?',
   null,
   'bronze', 'high', 'CL6', null, 14),
  ('REFE-0295', null, 'REFD-0036', 'aircyber', '6.9.1',
   'Avez-vous mis en place une solution de classification automatique des données de votre entreprise, ou d''aide à la prise de décision de protection d''une données qui serait classifiée sensible?',
   null,
   'gold', 'high', 'CL6', null, 15),
  ('REFE-0296', null, 'REFD-0036', 'aircyber', '6.9.2',
   'Avez-vous une solution permettant d''interdire l''envoi de données confidentielles non protégées ou de procéder à leur chiffrement systématique avant qu''elles soient enregistrées ou envoyées en dehors de votre système d''information ?',
   null,
   'gold', 'high', 'CL6', null, 16),
  ('REFE-0297', null, 'REFD-0037', 'aircyber', '7.0',
   'Mettez-vous en place un cloisonnement entre l''environnement de production industriel et les autres environnements (qualification, pré-production, systèmes d''information entreprise, etc.) ?',
   null,
   null, null, null, null, 1),
  ('REFE-0298', null, 'REFD-0037', 'aircyber', '7.1.1',
   'Avez-vous effectué une cartographie de votre système d''information industriel en identifiant les éléments le plus sensibles?',
   null,
   'bronze', 'medium', 'CL6', null, 2),
  ('REFE-0299', null, 'REFD-0037', 'aircyber', '7.1.2',
   'Effectuez-vous des sauvegardes des éléments les plus sensibles de vos systèmes d''information industriel (configuration, code source et données)?',
   null,
   null, null, null, null, 3),
  ('REFE-0300', null, 'REFD-0037', 'aircyber', '7.1.3',
   'Est-ce que les sauvegardes de vos systèmes d''information sont régulièrement testées?',
   null,
   null, null, null, null, 4),
  ('REFE-0301', null, 'REFD-0037', 'aircyber', '7.10',
   'Existe-t-il une architecture et des règles de gestion spécifiquement définies ?',
   null,
   'silver', 'high', 'CL3', null, 5),
  ('REFE-0302', null, 'REFD-0037', 'aircyber', '7.11',
   'Les processus de changement, les solutions dédiées de l’IACS font-ils l''objet d''un audit de conformité technique sécurité annuel ?',
   null,
   'silver', 'high', 'CL0', null, 6),
  ('REFE-0303', null, 'REFD-0037', 'aircyber', '7.12',
   'Les composants de l’ICS font ils l’objet d''un processus de surveillance des menaces et des vulnérabilités ?',
   null,
   'gold', 'high', 'CL6', null, 7),
  ('REFE-0304', null, 'REFD-0037', 'aircyber', '7.13',
   'Existe-t-il un centre de supervision sécurité (SOC, NOC (Network Operations Center), backup status...) de votre réseau permettant la détection des incidents de sécurité, problème de backup, et/ou surveillance active de l''Informatique industrielle (IACS) ?',
   null,
   'gold', 'high', 'CL4', null, 8),
  ('REFE-0305', null, 'REFD-0037', 'aircyber', '7.14',
   'Lorsqu''un incident survient dans la production, investiguez-vous pour identifier si cet incident pourrait être causé par un élément malveillant ?',
   null,
   null, null, null, null, 9),
  ('REFE-0306', null, 'REFD-0037', 'aircyber', '7.2',
   'documentation, la nomenclature et les schémas des équipements ICS sont-ils tenus à jour ?',
   null,
   'gold', 'high', 'CL4', null, 10),
  ('REFE-0307', null, 'REFD-0037', 'aircyber', '7.3',
   'Existe-t-il un processus documenté de gestion des crises ? (comme par exemple, la reprise d’activité après un crash système)',
   null,
   'silver', 'high', 'CL6', null, 11),
  ('REFE-0308', null, 'REFD-0037', 'aircyber', '7.4',
   'La documentation relative à la conception, aux composants et à l''exploitation des ICS est-elle stockée avec un niveau de sécurité approprié ?',
   null,
   'silver', 'high', 'CL6', null, 12),
  ('REFE-0309', null, 'REFD-0037', 'aircyber', '7.5',
   'Existe-t-il une personne qualifiée ou un département dédié à la conception, l’exploitation, et la surveillance des équipements de l’ICS ?',
   null,
   'gold', 'high', 'CL3', null, 13),
  ('REFE-0310', null, 'REFD-0037', 'aircyber', '7.6',
   'Existe-t-il un programme de sensibilisation ou de formation en matière de sécurité des ICS pour les employés et sous-traitants ?',
   null,
   'bronze', 'high', 'CL0', null, 14),
  ('REFE-0311', null, 'REFD-0037', 'aircyber', '7.7',
   'Les utilisateurs, automaticiens et administrateurs des systèmes contrôle d''automatisation industrielle (IACS) ont-ils signés une charte d''utilisation et de bonnes pratiques cybersécurité ?',
   null,
   'bronze', 'high', 'CL0', null, 15),
  ('REFE-0312', null, 'REFD-0037', 'aircyber', '7.8',
   'Des procédures sont-elles en place pour gérer le cycle de vie des ICS ?',
   null,
   'silver', 'high', 'CL3', null, 16),
  ('REFE-0313', null, 'REFD-0037', 'aircyber', '7.9',
   'Utilisez-vous un réseau dédié et cloisonné pour l’administration des ICS ?',
   null,
   'gold', 'high', 'CL4', null, 17),
  ('REFE-0314', null, 'REFD-0038', 'aircyber', '8.1',
   'Avez-vous des exigences précises de vos clients en matière de gestion de la sécurité des SI ? (par exemple : appels d''offres, clauses dans les contrats)',
   null,
   null, null, null, null, 1),
  ('REFE-0315', null, 'REFD-0038', 'aircyber', '8.2',
   'Si oui, quel est votre degré de conformité vis-à-vis de ces exigences ?',
   null,
   null, null, null, null, 2),
  ('REFE-0316', null, 'REFD-0038', 'aircyber', '8.3',
   'Si oui, ces exigences sont-elles différentes d''un client à l''autre ?',
   null,
   null, null, null, null, 3),
  ('REFE-0317', null, 'REFD-0038', 'aircyber', '8.4',
   'Avez-vous pour votre part mis en place des exigences particulières en termes de cyber sécurité vis-à-vis de vos propres fournisseurs ?',
   null,
   null, null, null, null, 4),
  ('REFE-0318', null, 'REFD-0039', 'aircyber', '9.1',
   'Connaissez-vous bien l''ensemble des risques liés à la Cyber sécurité ? (Infogérances, Perte de données, image de l''entreprise, cyber-espionnage, risque légal…)',
   null,
   null, null, null, null, 1),
  ('REFE-0319', null, 'REFD-0039', 'aircyber', '9.10',
   'Vos différents contrats d’assurance vous couvrent-ils en cas de perte d''activité liée à un problème de sécurité informatique ?',
   null,
   null, null, null, null, 2),
  ('REFE-0320', null, 'REFD-0039', 'aircyber', '9.2',
   'Existe-t-il un budget spécifique lié à la gestion informatique dans l''entreprise ? (Matériel / suivi / maintenance / sécurité ?)',
   null,
   null, null, null, null, 3),
  ('REFE-0321', null, 'REFD-0039', 'aircyber', '9.3',
   'Si oui, à combien s''élève ce budget par an (%) ?',
   null,
   null, null, null, null, 4),
  ('REFE-0322', null, 'REFD-0039', 'aircyber', '9.4',
   'Quelle part de ce budget ‘informatique’ est actuellement allouée à la cyber sécurité (%)?',
   null,
   null, null, null, null, 5),
  ('REFE-0323', null, 'REFD-0039', 'aircyber', '9.5',
   'A partir de quelle durée d’interruption de vos Systèmes d’Information vos activités subiront-elles un impact quantifiable ?',
   null,
   null, null, null, null, 6),
  ('REFE-0324', null, 'REFD-0039', 'aircyber', '9.6',
   'Aujourd''hui, pensez-vous être suffisamment protégé contre les risques liés à l''informatique et à l''internet ?',
   null,
   null, null, null, null, 7),
  ('REFE-0325', null, 'REFD-0039', 'aircyber', '9.7',
   'Avez-vous, à votre connaissance, déjà été victime d''une cyber attaque ?',
   null,
   null, null, null, null, 8),
  ('REFE-0326', null, 'REFD-0039', 'aircyber', '9.7.1',
   'Avez-vous mis en place, documenté et testé au moins annuellement un procédure de gestion de problèmes sécurité vous permettant d''être assuré de pouvoir réagir rapidement et d''impliquer les bonnes personnes internes ou externes?',
   null,
   'gold', 'high', 'CL1', null, 9),
  ('REFE-0327', null, 'REFD-0039', 'aircyber', '9.8',
   'Avez-vous déjà effectué une analyse de risque cyber sur votre entreprise ?',
   null,
   null, null, null, null, 10),
  ('REFE-0328', null, 'REFD-0039', 'aircyber', '9.8.1',
   'Révisez-vous annuellement le niveau de risque cyber de votre entreprise en révisant les analyses de risques de votre entreprise ?',
   null,
   'silver', 'high', 'CL0', null, 11),
  ('REFE-0329', null, 'REFD-0039', 'aircyber', '9.8.2',
   'Avez-vous une solution informatisée pour la gestion du risque vous permettant de manière plus ou moins automatisée de remonter le niveau de risque cyber et de le traiter ?',
   null,
   'gold', 'high', 'CL0', null, 12),
  ('REFE-0330', null, 'REFD-0039', 'aircyber', '9.9',
   'Disposez-vous d''un contrat d''assurance lié au risque informatique ? (Matériel et cyberattaque ?)',
   null,
   null, null, null, null, 13),
  ('REFE-0331', null, 'REFD-0040', 'aircyber', 'Ext1',
   'Externalisez-vous des logs de cybersécurité (hors de l''environnement où ils sont générés) pour garantir leur intégrité ?',
   null,
   'silver', 'medium', 'CL1', null, 1),
  ('REFE-0332', null, 'REFD-0040', 'aircyber', 'Ext10',
   'Cartographie :Les appareils physiques, les plates-formes logicielles, les systèmes au sein de l''organisation sont-ils inventoriés et catégorisés ?Disposez-vous d''une cartographie de l''ensemble des interfaces du produit avec d''autres systèmes ? Cette cartographie inclut-elle l''ensemble des protocoles utilisés et la matrice de flux ?',
   null,
   'bronze', 'medium', 'CL4', null, 2),
  ('REFE-0333', null, 'REFD-0040', 'aircyber', 'Ext11',
   'Lorsque vous avez demandé une connexion à distance au système d''information de vos clients pour vos employés, est-ce que vous informez systématiquement vos clients lorsque ces accès doivent être révoqués (par exemple suite au départ d''un employé) ?',
   null,
   'bronze', 'medium', 'CL5', null, 3),
  ('REFE-0334', null, 'REFD-0040', 'aircyber', 'Ext12',
   'Mettez-vous en place une politique de durcissement sécurité de la configuration sur vos postes de travail et serveurs ?',
   null,
   'silver', 'high', 'CL3', null, 4),
  ('REFE-0335', null, 'REFD-0040', 'aircyber', 'Ext13',
   'L''antivirus scanne-t-il automatiquement les serveurs, postes de travail et les clés USB connectées aux bancs de production ?',
   null,
   'bronze', 'medium', 'CL3', null, 5),
  ('REFE-0336', null, 'REFD-0040', 'aircyber', 'Ext14',
   'Désactivez-vous les exécutions automatiques des nouveaux périphériques branchés sur les PCs, laptops et serveurs (autorun) ?',
   null,
   'bronze', 'high', 'CL3', null, 6),
  ('REFE-0337', null, 'REFD-0040', 'aircyber', 'Ext15',
   'Avez-vous une politique de mise à jour des bases de signature et moteurs de l''antivirus au moins quotidienne sur l''ensemble du parc standard avec une gestion des exceptions pour les équipements spécifiques ?',
   null,
   'bronze', 'high', 'CL2', null, 7),
  ('REFE-0338', null, 'REFD-0040', 'aircyber', 'Ext16',
   'Possédez-vous un système de gestion centralisée (console) des mécanismes de mise à jour de la protection contre l''exécution de code malveillant sur le parc ?',
   null,
   'silver', 'high', 'CL2', null, 8),
  ('REFE-0339', null, 'REFD-0040', 'aircyber', 'Ext17',
   'Testez-vous l''efficacité des programmes de protection contre les malwares ?',
   null,
   'gold', 'medium', 'CL2', null, 9),
  ('REFE-0340', null, 'REFD-0040', 'aircyber', 'Ext18',
   'Mettez-vous en place des mesures de sécurité adaptées au niveaux de classification des données manipulées sur les supports (Laptop, USB, email, …) ?',
   null,
   'bronze', 'medium', 'CL6', null, 10),
  ('REFE-0341', null, 'REFD-0040', 'aircyber', 'Ext19',
   'Existe-t-il une procédure permettant de créer, de mettre à jour et de supprimer les accès des utilisateurs et administrateurs impliqués sur les environnements de production ?',
   null,
   null, null, null, null, 11),
  ('REFE-0342', null, 'REFD-0040', 'aircyber', 'Ext2',
   'Activez vous les fonctions de génération et d''enregistrement des logs sur vos equipements informatique ?',
   null,
   'bronze', 'high', 'CL1', null, 12),
  ('REFE-0343', null, 'REFD-0040', 'aircyber', 'Ext20',
   'Définissez-vous systématiquement une date de fin lors de la création des comptes stagiaires, ou externes (prestataires) dans les environnements de production ?',
   null,
   'bronze', 'low', 'CL5', null, 13),
  ('REFE-0344', null, 'REFD-0040', 'aircyber', 'Ext21',
   'Créez-vous des comptes nominatifs pour chaque employé d''une société de prestataires ?',
   null,
   'bronze', 'medium', 'CL5', null, 14),
  ('REFE-0345', null, 'REFD-0040', 'aircyber', 'Ext22',
   'Mettez-vous à jour vos systèmes suivant les recommandations des éditeurs (mise à jour, configuration, …) ?',
   null,
   null, null, null, null, 15),
  ('REFE-0346', null, 'REFD-0040', 'aircyber', 'Ext23',
   'Avez-vous mis en place un processus de gestion des vulnérabilités de vos services (identification, classification, priorisation, remédiation et atténuation des vulnérabilités) ?',
   null,
   'silver', 'low', 'CL0', null, 16),
  ('REFE-0347', null, 'REFD-0040', 'aircyber', 'Ext24',
   'Mettez-vous en place des process de décommissionnement (pv de destruction, suppression totale des fichiers) avant la mise au rebut des actifs (poste de travail, serveurs) ?',
   null,
   null, null, null, null, 17),
  ('REFE-0348', null, 'REFD-0040', 'aircyber', 'Ext25',
   'Les supports en attente de destruction sont-ils stockés dans un environnement avec un accès restreint et contrôlé ?',
   null,
   'silver', 'medium', 'CL3', null, 18),
  ('REFE-0349', null, 'REFD-0040', 'aircyber', 'Ext26',
   'Les dispositifs de sauvegarde font-ils l''objet de contrôles réguliers pour s''assurer de leur bon fonctionnement ?',
   null,
   'silver', 'medium', 'CL6', null, 19),
  ('REFE-0350', null, 'REFD-0040', 'aircyber', 'Ext27',
   'Mettez-vous en place des sessions de formation/de simulation de gestion de crise ?',
   null,
   'gold', 'medium', 'CL0', null, 20),
  ('REFE-0351', null, 'REFD-0040', 'aircyber', 'Ext28',
   'Disposez-vous d''un contrat d''assurance pour vous protéger des conséquences d''un incident tel que : - dommages physiques- dommages informatiques- dommages cyber- perte d''activité',
   null,
   'bronze', 'low', 'CL0', null, 21),
  ('REFE-0352', null, 'REFD-0040', 'aircyber', 'Ext29',
   'Est-ce que votre organisation est certifiée en cybersécurité ?Merci de fournir le certificat et les informations concernant le champ et périmètre de certification.',
   null,
   'gold', 'low', 'CL0', null, 22),
  ('REFE-0353', null, 'REFD-0040', 'aircyber', 'Ext3',
   'Utilisez-vous une plateforme d''échanges sécurisée avec vos clients pour l''échange d''informations sensibles ?',
   null,
   'bronze', 'medium', 'CL6', null, 23),
  ('REFE-0354', null, 'REFD-0040', 'aircyber', 'Ext30',
   'Disposez-vous d''un schéma fonctionnel type présentant le cycle des différents échanges (matériel et immatériel), flux de production entre vos clients et vous, pour la confection d''un produit, incluant les échanges internes ou livraisons clients sur support amovible ?',
   null,
   'gold', 'medium', 'CL4', null, 24),
  ('REFE-0355', null, 'REFD-0040', 'aircyber', 'Ext31',
   'Prenez-vous en compte, dans l''environnement industriel, la sensibilité des informations échangées avec vos clients ?',
   null,
   null, null, null, null, 25),
  ('REFE-0356', null, 'REFD-0040', 'aircyber', 'Ext32',
   'Un plan de gestion de la sécurité projet est-il élaboré, mis en œuvre, remis et communiqué à vos clients pour garantir que toutes les parties prenantes comprennent les attentes du projet et leurs rôles et responsabilités ?(Ce plan inclut-il le point de contact responsable des activités de cybersécurité pendant le projet ?)',
   null,
   'bronze', 'low', 'CL0', null, 26),
  ('REFE-0357', null, 'REFD-0040', 'aircyber', 'Ext33',
   'Disposez-vous d''un processus de gestion des incidents (incluant les incidents relatifs aux violations de données) qui prévoit de notifier les clients lorsqu''un incident concerne le produit/les services qui lui sont fournis ?',
   null,
   null, null, null, null, 27),
  ('REFE-0358', null, 'REFD-0040', 'aircyber', 'Ext34',
   'Identifiez-vous la localisation des données / biens qui sont traités / opérés dans le cadre de la prestation (en incluant si besoin les données personnelles de vos clients surtout lorsque celles-ci sont stockées dans des espaces partagés de type cloud (localisations de sauvegarde et de reprise d''activité incluses) ?Si la réponse est oui, expliquez comment vous procédez SVP (et détaillez les pays où sont localisées les données).',
   null,
   'bronze', 'medium', 'CL0', null, 28),
  ('REFE-0359', null, 'REFD-0040', 'aircyber', 'Ext35',
   'Traitez-vous l''information ou les données transmises par vos clients ou produites dans le cadre de la prestation selon la dernière version de la directive de vos clients relative à la Protection de l''Information ?',
   null,
   'bronze', 'low', 'CL0', null, 29),
  ('REFE-0360', null, 'REFD-0040', 'aircyber', 'Ext36',
   'Utilisez-vous des environnements Cloud pour la production ou le traitement des données de vos clients ?Si oui, séparez-vous les données par client à minima de manière logicielle dans tous les environnements (production, sauvegarde, ...) ?',
   null,
   'bronze', 'medium', 'CL4', null, 30),
  ('REFE-0361', null, 'REFD-0040', 'aircyber', 'Ext37',
   'Avez-vous identifié la durée maximale d''interruption admissible de votre chaîne de production par rapport à vos contrats clients ?',
   null,
   null, null, null, null, 31),
  ('REFE-0362', null, 'REFD-0040', 'aircyber', 'Ext38',
   'Les accès aux différents environnements de développement sont-ils accordés selon le principe du moindre privilège (ne pas donner les accès à tous les environnements à tous les utilisateurs mais utiliser une configuration avec des groupes d''utilisateurs associés à certains équipements) ?',
   null,
   null, null, null, null, 32),
  ('REFE-0363', null, 'REFD-0040', 'aircyber', 'Ext39',
   'Avez-vous une politique de génération de logs par défaut des produits livrés aux clients qui enregistre les actions principales du produit?',
   null,
   null, null, null, null, 33),
  ('REFE-0364', null, 'REFD-0040', 'aircyber', 'Ext4',
   'Utilisez-vous uniquement les accès internet définis au sein de l''entreprise ?',
   null,
   'bronze', 'high', 'CL4', null, 34),
  ('REFE-0365', null, 'REFD-0040', 'aircyber', 'Ext40',
   'Savez-vous lister les sites physiques de production rentrant dans les services fournis à vos clients ?Disposez-vous d''un schéma à jour présentant les interconnexions réseau entre vos clients et vous (cartographie IP, serveurs, et adressage) ?',
   null,
   null, null, null, null, 35),
  ('REFE-0366', null, 'REFD-0040', 'aircyber', 'Ext41',
   'Les fournisseurs et les partenaires tiers des systèmes, composants et services d''information sont-ils identifiés, classés par ordre de priorité et évalués à l''aide d''un processus d''évaluation des risques lié à la chaîne d''approvisionnement ?',
   null,
   'gold', 'medium', 'CL0', null, 36),
  ('REFE-0367', null, 'REFD-0040', 'aircyber', 'Ext42',
   'Un référent cybersécurité (point focal) est-il identifié pour les moyens de production ?',
   null,
   'bronze', 'high', 'CL0', null, 37),
  ('REFE-0368', null, 'REFD-0040', 'aircyber', 'Ext43',
   'Avez-vous formalisé des règles de sécurité à appliquer sur les environnements de production et formé les collaborateurs concernés ?',
   null,
   'silver', 'high', 'CL0', null, 38),
  ('REFE-0369', null, 'REFD-0040', 'aircyber', 'Ext44',
   'Les postes de travail de l''environnement de production sont-ils régulièrement mis à jour ?',
   null,
   null, null, null, null, 39),
  ('REFE-0370', null, 'REFD-0040', 'aircyber', 'Ext45',
   'Assurez-vous une mise à jour des postes de travail en stock (spare) avant de les remettre en service ?',
   null,
   null, null, null, null, 40),
  ('REFE-0371', null, 'REFD-0040', 'aircyber', 'Ext46',
   'Disposez-vous de moyens techniques ou de processus afin de retrouver l''auteur d''une action sur les environnements de production (journaux d''authentification, corrélation entre planning de shift et les comptes utilisés) ?',
   null,
   'silver', 'medium', 'CL5', null, 41),
  ('REFE-0372', null, 'REFD-0040', 'aircyber', 'Ext47',
   'Les logs systèmes et antivirus sont-ils activés sur les environnements de production ?',
   null,
   null, null, null, null, 42),
  ('REFE-0373', null, 'REFD-0040', 'aircyber', 'Ext48',
   'Avez-vous défini des mesures encadrant l''utilisation des comptes à privilèges (création, mise à jour, suppression, règles particulières en cas de comptes génériques) ?Si la réponse est oui, détaillez SVP.',
   null,
   'bronze', 'medium', 'CL5', null, 43),
  ('REFE-0374', null, 'REFD-0040', 'aircyber', 'Ext49',
   'En cas d''utilisation de comptes mutualisés sur les environnements de production, disposez-vous d''autres mesures de sécurité que le mot de passe pour vous connecter aux environnements de production (contrôle d''accès physique à la salle hébergeant les postes de travail de production et/ou solutions logicielles de type transparent screen lock)?',
   null,
   'silver', 'low', 'CL5', null, 44),
  ('REFE-0375', null, 'REFD-0040', 'aircyber', 'Ext5',
   'Possédez-vous un plan de continuité d''activité décrivant les processus et technologies en place pour la restauration des serveurs critiques, équipements réseau, ordinateurs portables et fixes après un incident ?',
   null,
   'silver', 'medium', 'CL0', null, 45),
  ('REFE-0376', null, 'REFD-0040', 'aircyber', 'Ext50',
   'Effectuez-vous à minima deux mises à jour sur les équipements de production par an ?',
   null,
   null, null, null, null, 46),
  ('REFE-0377', null, 'REFD-0040', 'aircyber', 'Ext51',
   'Changez-vous les mots de passe et identifiants par défaut sur les environnements de production de vos clients ?',
   null,
   null, null, null, null, 47),
  ('REFE-0378', null, 'REFD-0040', 'aircyber', 'Ext52',
   'Possédez-vous un moyen permettant de détecter les connexions étrangères ou non autorisées aux serveurs utilisés par vos systèmes industriels afin de les qualifier et de les bloquer au besoin ?',
   null,
   'silver', 'medium', 'CL4', null, 48),
  ('REFE-0379', null, 'REFD-0040', 'aircyber', 'Ext53',
   'Le réseau wifi de production est-il dédié et isolé des autres réseaux wifi ?',
   null,
   null, null, null, null, 49),
  ('REFE-0380', null, 'REFD-0040', 'aircyber', 'Ext54',
   'Désactivez-vous par défaut les connexions wifi/sans fil sur vos équipements (bancs de production industriels) ?',
   null,
   'bronze', 'high', 'CL4', null, 50),
  ('REFE-0381', null, 'REFD-0040', 'aircyber', 'Ext55',
   'Disposez-vous de stations blanches accessibles à tous les utilisateurs afin de vous assurer de l''innocuité des médias amovibles utilisés pour la production de vos clients ?',
   null,
   'bronze', 'medium', 'CL2', null, 51),
  ('REFE-0382', null, 'REFD-0040', 'aircyber', 'Ext56',
   'Mettez-vous en place des restrictions particulières ou des mesures spécifiques encadrant l''utilisation des périphériques amovibles dans les environnements de production ?',
   null,
   'bronze', 'medium', 'CL3', null, 52),
  ('REFE-0383', null, 'REFD-0040', 'aircyber', 'Ext57',
   'Un des antivirus utilisé sur les stations blanches est-il différent de celui utilisé sur les postes de travail ?',
   null,
   'bronze', 'low', 'CL2', null, 53),
  ('REFE-0384', null, 'REFD-0040', 'aircyber', 'Ext58',
   'Disposez-vous de mesures de sécurité pour encadrer et sécuriser les usages du BYOD dans les environnements de production de vos clients (notamment connexion au réseau, protection anti-malware, ...) ?',
   null,
   'bronze', 'low', 'CL0', null, 54),
  ('REFE-0385', null, 'REFD-0040', 'aircyber', 'Ext59',
   'Avez-vous un processus de gestion de crise/d''incidents pour les incidents de production de vos clients partagé avec vos clients (alerte du Responsable Sécurité de votre client) ?',
   null,
   null, null, null, null, 55),
  ('REFE-0386', null, 'REFD-0040', 'aircyber', 'Ext6',
   'Vos plans de gestion de crise, de continuité et de reprise d''activités sont-ils conçus en incluant vos prestataires/fournisseurs ?',
   null,
   'silver', 'low', 'CL0', null, 56),
  ('REFE-0387', null, 'REFD-0040', 'aircyber', 'Ext60',
   'Vos intervenants externes et fournisseurs signent-ils la charte d''utilisation et de bonnes pratiques cybersécurité relative aux systèmes de contrôle d''automatisation industrielle (IACS) ?Archivez-vous ces documents signés ?',
   null,
   'silver', 'medium', 'CL0', null, 57),
  ('REFE-0388', null, 'REFD-0040', 'aircyber', 'Ext61',
   'Avez-vous déjà effectué une analyse de risque cyber sur vos systèmes d''information de production ?',
   null,
   'bronze', 'medium', 'CL0', null, 58),
  ('REFE-0389', null, 'REFD-0040', 'aircyber', 'Ext62',
   'Mettez-vous à jour à minima annuellement les risques concernant vos systèmes d''information de production ?',
   null,
   'silver', 'low', 'CL0', null, 59),
  ('REFE-0390', null, 'REFD-0040', 'aircyber', 'Ext63',
   'Les éléments identifiés lors de l''analyse des risques sont-ils pris en compte dans le PCA de l''entreprise ?',
   null,
   null, null, null, null, 60),
  ('REFE-0391', null, 'REFD-0040', 'aircyber', 'Ext64',
   'Les accès physiques à la salle de stockage (lorsque c''est le cas) des sauvegardes sont-ils réglementés ?',
   null,
   null, null, null, null, 61),
  ('REFE-0392', null, 'REFD-0040', 'aircyber', 'Ext65',
   'Possédez-vous un plan de secours informatique sur les environnements de production y compris les machines et bancs de production ?',
   null,
   null, null, null, null, 62),
  ('REFE-0393', null, 'REFD-0040', 'aircyber', 'Ext66',
   'Les accès aux archives sont-ils restreints ou protégés physiquement (clés ou badge...) ?',
   null,
   null, null, null, null, 63),
  ('REFE-0394', null, 'REFD-0040', 'aircyber', 'Ext67',
   'Votre politique de sauvegarde prend t-elle en compte les données et produits fournis à vos clients ?',
   null,
   null, null, null, null, 64),
  ('REFE-0395', null, 'REFD-0040', 'aircyber', 'Ext68',
   'Savez-vous identifier les salles serveurs utilisées dans le cadre de la prestation pour chacun de vos clients ?',
   null,
   null, null, null, null, 65),
  ('REFE-0396', null, 'REFD-0040', 'aircyber', 'Ext69',
   'Disposez-vous des coordonnées de vos points de contact de vos clients à alerter en cas d''incident de sécurité et réciproquement des points de contact sont-ils transmis à vos clients afin de répondre en cas d''alerte ?',
   null,
   null, null, null, null, 66),
  ('REFE-0397', null, 'REFD-0040', 'aircyber', 'Ext7',
   'Votre organisation a-t-elle mis en place un ensemble de directives, processus, procédure et instructions associés et basés sur un référentiel de bonnes pratiques cybersécurité ou cadre normatif (ISO 27001/27002, NIST, ISO 62443, CMMC….) ?Si c''est le cas, quel cadre utilisez-vous ?',
   null,
   'silver', 'low', 'CL0', null, 67),
  ('REFE-0398', null, 'REFD-0040', 'aircyber', 'Ext70',
   'Réalisez-vous des audits réguliers de votre chaîne d''approvisionnement, lorsqu''elle est connectée à votre système d''information ou lorsque des équipements/appareils sont régulièrement échangés (audit de conformité ou audit technique) ?Si c''est le cas, précisez la fréquence SVP.',
   null,
   'silver', 'medium', 'CL0', null, 68),
  ('REFE-0399', null, 'REFD-0040', 'aircyber', 'Ext71',
   'Répercutez-vous contractuellement auprès de vos fournisseurs et partenaires tiers les exigences de sécurité de vos clients afin qu''ils mettent en œuvre les mesures appropriées pour atteindre les objectifs projet ?',
   null,
   'bronze', 'low', 'CL0', null, 69),
  ('REFE-0400', null, 'REFD-0040', 'aircyber', 'Ext72',
   'Réalisez-vous une sauvegarde régulière des configurations afin de restaurer les environnements en cas d''incident de sécurité ?',
   null,
   null, null, null, null, 70),
  ('REFE-0401', null, 'REFD-0040', 'aircyber', 'Ext73',
   'Disposez-vous d''un référentiel de bonnes pratiques cyber de développement sur chaque langage utilisé par vos développeurs ?',
   null,
   'bronze', 'low', 'CL0', null, 71),
  ('REFE-0402', null, 'REFD-0040', 'aircyber', 'Ext74',
   'Les développeurs sont-ils systématiquement formés aux bonnes pratiques de développement sécurisé sur la base d''un référentiel connu ?',
   null,
   'silver', 'medium', 'CL0', null, 72),
  ('REFE-0403', null, 'REFD-0040', 'aircyber', 'Ext75',
   'Au démarrage de chaque projet, disposez-vous d''un processus d''identification et de validation des versions logicielles et autres librairies à utiliser afin de vous assurer de l''absence de vulnérabilités connues dans ces logiciels et librairies, de manière à garantir la sécurité du produit et l''environnement de développement ?',
   null,
   'bronze', 'low', 'CL0', null, 73),
  ('REFE-0404', null, 'REFD-0040', 'aircyber', 'Ext76',
   'Pendant la phase de développement, assurez-vous la maîtrise des environnements de développement en réalisant une veille active des vulnérabilités qui tient compte des versions logicielles installées (systèmes d''exploitation, librairies, …) ?',
   null,
   'bronze', 'medium', 'CL0', null, 74),
  ('REFE-0405', null, 'REFD-0040', 'aircyber', 'Ext77',
   'Au démarrage de chaque projet, disposez-vous d''un processus d''identification et de validation des versions de micrologiciels et des COTS matériels à utiliser afin de vous assurer de l''absence de vulnérabilités connues, de manière à garantir la sécurité du produit et l''environnement de développement ?',
   null,
   'bronze', 'medium', 'CL0', null, 75),
  ('REFE-0406', null, 'REFD-0040', 'aircyber', 'Ext78',
   'Disposez-vous de principes de durcissement de manière à réduire la surface d''attaque ?',
   null,
   'bronze', 'high', 'CL3', null, 76),
  ('REFE-0407', null, 'REFD-0040', 'aircyber', 'Ext79',
   'Avant la mise en place de chaque projet, disposez-vous d''un processus de durcissement des environnements de développement, incluant par exemple la désactivation des fonctions, ports, protocoles ou composants non utilisés ?',
   null,
   'bronze', 'medium', 'CL3', null, 77),
  ('REFE-0408', null, 'REFD-0040', 'aircyber', 'Ext8',
   'Le plan de continuité d''activité est-il revu et testé régulièrement ?',
   null,
   'silver', 'medium', 'CL0', null, 78),
  ('REFE-0409', null, 'REFD-0040', 'aircyber', 'Ext80',
   'Si vous stockez vos codes de développements dans des espaces de partage collaboratifs publics (GITHUB, services cloud, …), avez-vous une politique de stockage des développements, permettant d''identifier par exemple dans quels cas cette pratique n''est pas autorisée ?',
   null,
   'bronze', 'high', 'CL0', null, 79),
  ('REFE-0410', null, 'REFD-0040', 'aircyber', 'Ext81',
   'Afin de s''assurer de l''implémentation de code sécurisé et de règles de conception, un audit de code est-il systématiquement réalisé, a minima à la fin du développement d''un produit, et les mesures correctives sont-elles mises en œuvre avant la livraison du produit ?',
   null,
   'bronze', 'high', 'CL0', null, 80),
  ('REFE-0411', null, 'REFD-0040', 'aircyber', 'Ext82',
   'Afin de s''assurer de l''implémentation de code sécurisé et de règles de conception, des tests de sécurité sont-ils réalisés à minima avant la livraison et/ou tout au long du cycle de développement du produit ?',
   null,
   'bronze', 'high', 'CL0', null, 81),
  ('REFE-0412', null, 'REFD-0040', 'aircyber', 'Ext83',
   'Disposez-vous d''outils de vérification de sécurité du code (par exemple des outils d''analyse statique, dynamique ou des composants tiers) ?',
   null,
   'silver', 'medium', 'CL0', null, 82),
  ('REFE-0413', null, 'REFD-0040', 'aircyber', 'Ext84',
   'Réalisez-vous un test d''intrusion sur les produits développés avant leur livraison à vos clients ?',
   null,
   'silver', 'medium', 'CL0', null, 83),
  ('REFE-0414', null, 'REFD-0040', 'aircyber', 'Ext85',
   'Avez-vous une politique Security By design impliquant une revue d''applicabilité systématique d''une analyse de risque réalisée sur les produits/services avant leur livraison aux clients dans le but d''identifier les risques et les mesures pour les maitriser et informez-vous vos clients de cette réalisation avant livraison ?',
   null,
   'bronze', 'low', 'CL0', null, 84),
  ('REFE-0415', null, 'REFD-0040', 'aircyber', 'Ext86',
   'Contrôlez-vous que les livraisons (initiale ou mise à jour) sont exempts de malware et de vulnérabilités ?',
   null,
   'bronze', 'high', 'CL0', null, 85),
  ('REFE-0416', null, 'REFD-0040', 'aircyber', 'Ext87',
   'En cas de suspicion d''altération d''un produit, disposez-vous de moyens pour réaliser une investigation afin de l''identifier ?',
   null,
   'gold', 'low', 'CL0', null, 86),
  ('REFE-0417', null, 'REFD-0040', 'aircyber', 'Ext88',
   'Réalisez-vous des scans antivirus ou anti-malware sur les environnements où sont stockés le code logiciel afin de vous assurer de l''absence de code malveillant ?',
   null,
   null, null, null, null, 87),
  ('REFE-0418', null, 'REFD-0040', 'aircyber', 'Ext89',
   'Durant la phase de livraison, disposez-vous de moyens (tels qu''une fonction de hachage ou de signature) pour garantir l''intégrité ou l''authenticité des logiciels constituant la solution développée ?',
   null,
   'bronze', 'medium', 'CL0', null, 88),
  ('REFE-0419', null, 'REFD-0040', 'aircyber', 'Ext9',
   'Identifiez-vous les types de données que vous manipulez de manière à les traiter en conséquence : - données personnelles- données régulées par pays- données soumises au contrôle des exportations- données sensibles- autres types de données (merci de préciser)',
   null,
   'bronze', 'medium', 'CL6', null, 89),
  ('REFE-0420', null, 'REFD-0040', 'aircyber', 'Ext90',
   'Avant la livraison, réalisez-vous l''inspection et la désinfection des supports de stockage et des équipements avant leur usage, afin de vous assurer que ceux-ci ne contiennent aucun code malveillant ? Une fois que l''inspection est effectuée, est-ce que vous stockez les médias / équipements dans un lieu de stockage sécurisé?',
   null,
   'bronze', 'medium', 'CL6', null, 90),
  ('REFE-0421', null, 'REFD-0040', 'aircyber', 'Ext91',
   'Après la mise en service, les changements au sein du produit sont-ils approuvés selon le plan de sécurité projet défini avant leur mise en œuvre ?',
   null,
   null, null, null, null, 91),
  ('REFE-0422', null, 'REFD-0040', 'aircyber', 'Ext92',
   'Disposez-vous d''éléments de sécurité afin de garantir la sécurité des environnements de développement de vos clients par exemple :- équipements de défense en profondeur (IDS, IPS)- solutions de gestion centralisée des droits d''accès (PAM - Priviledge Access Management)- moyens de supervision (NOC, SOC) ?',
   null,
   'gold', 'medium', 'CL4', null, 92),
  ('REFE-0423', null, 'REFD-0040', 'aircyber', 'Ext93',
   'Est-ce que votre processus de développement inclut des activités de cybersécurité permettant d''obtenir une certification de sécurité des produits/services lorsque c''est nécessaire? Merci de détailler les certifications qui peuvent être obtenues avec ce processus de développement.',
   null,
   'gold', 'low', 'CL0', null, 93),
  ('REFE-0424', null, 'REFD-0040', 'aircyber', 'Ext94',
   'Dans le cas où le produit ou service traite des données personnelles de vos clients est-ce que vous vous assurez de respecter la réglementation RGPD (localisation des données, conservation des données, mécanismes permettant l''accès/la modification/l''effacement des données) ?',
   null,
   null, null, null, null, 94)
on conflict (id) do nothing;

insert into referentiel_traductions
    (id, filiale_id, referentiel_id, langue, dictionnaire)
values
  ('REFX-0001', null, 'anssi-hygiene', 'en',
   '{"version":"42 measures","nom":"Cyber hygiene (ANSSI)","description":"A baseline of good practice for strengthening the security of an information system. An excellent starting point — approachable and concrete — before the more demanding frameworks (ISO 27001, NIS2, DORA).","aide":"Published by ANSSI, the French national cybersecurity agency, this guide gathers elementary measures which, once applied, head off the great majority of common incidents.","noteNumerotation":"This catalogue is numbered differently from the ANSSI guide from measure 30 onwards. The official number is shown on each affected measure. The codes are deliberately not realigned: your self-assessments are stored by code, and renumbering them would silently reassign them to other measures.","domaines":{"sensibiliser":{"nom":"Raise awareness and train","court":"Awareness","aide":"People are the first line of defence: trained teams and users who know the basics drive the number of incidents down."},"connaitre":{"nom":"Know the information system","court":"Knowledge","aide":"You only protect well what you know: mapping, inventories and access management."},"acces":{"nom":"Authenticate and control accesses","court":"Access","aide":"Every person is identified and reaches only what they need, with solid authentication."},"postes":{"nom":"Secure the devices","court":"Devices","aide":"Workstations and servers hardened consistently, protected against removable media, with their data encrypted."},"reseau":{"nom":"Secure the network","court":"Network","aide":"Segmentation, encrypted protocols, a controlled Internet gateway and email protection."},"administration":{"nom":"Secure administration","court":"Administration","aide":"Administering the information system is the most coveted target: it deserves a dedicated, separated environment."},"nomadisme":{"nom":"Manage mobile working","court":"Mobile working","aide":"Equipment that leaves the premises (laptops, handsets) calls for protections of its own."},"maj":{"nom":"Keep the information system up to date","court":"Updates","aide":"Patches close known holes: apply them fast, and replace whatever is no longer maintained."},"superviser":{"nom":"Supervise, audit, react","court":"Supervise","aide":"Detect, back up, check and know how to react: security is steered over time."},"avance":{"nom":"To go even further","court":"Going further","aide":"Once the baseline is in place, formalise crisis management and risk analysis."}},"exigences":{"sensibiliser/1":{"titre":"Train the IT teams in security","aide":"Administrators and technicians configure and run the information system day to day: they must be trained in good practice and in current threats."},"sensibiliser/2":{"titre":"Raise all users'' awareness of the basics","aide":"Passwords, phishing, attachments: every employee is a link in the security chain. Regular awareness work pays for itself many times over."},"sensibiliser/3":{"titre":"Control the risks of outsourced IT services","aide":"Where a provider runs all or part of the information system, the contract must set clear security requirements and a right of scrutiny (audit, reversibility)."},"connaitre/4":{"titre":"Map the information system and locate sensitive data","aide":"An inventory of servers, applications and flows, and the location of the most critical information: the basis of any protection."},"connaitre/5":{"titre":"Keep an up-to-date inventory of privileged accounts","aide":"Administrator accounts are prime targets. You must know at all times who holds them, and what for."},"connaitre/6":{"titre":"Manage joiners, movers and leavers","aide":"Creating, changing and above all withdrawing access at the right moment prevents orphan accounts that stay usable after someone has left."},"connaitre/7":{"titre":"Allow only controlled devices onto the network","aide":"An unknown machine plugged into the network is a way in: accept only equipment that is identified and compliant with the policy."},"acces/8":{"titre":"Identify each user by name","aide":"Named accounts (no shared accounts) and separation of the user and administrator roles are what make actions traceable."},"acces/9":{"titre":"Grant rights on a need-to-know basis (least privilege)","aide":"Everyone reaches only the resources their job requires: that is what limits the impact of a compromised account."},"acces/10":{"titre":"Enforce robust password rules","aide":"Sufficient length and complexity: a weak password is broken in seconds."},"acces/11":{"titre":"Protect stored passwords","aide":"They must never be kept in the clear, only as fingerprints (salted hashing)."},"acces/12":{"titre":"Change default credentials and secrets","aide":"Factory ''admin/admin'' accounts are public knowledge: change them at installation time."},"acces/13":{"titre":"Prefer multi-factor authentication (MFA)","aide":"A second factor (code, app, hardware key) makes a stolen password no longer enough to log in."},"postes/14":{"titre":"Set a minimum security baseline across the estate","aide":"A hardened, consistent configuration (anti-virus, limited accounts, needless services switched off) on every workstation and server."},"postes/15":{"titre":"Govern the use of removable media","aide":"USB sticks spread malware readily: restrict them, scan them, and encrypt their contents where needed."},"postes/16":{"titre":"Manage configurations centrally","aide":"A central tool (GPO, MDM) applies and checks the same rules everywhere, with no machine left out."},"postes/17":{"titre":"Activate the firewall on workstations","aide":"Each machine''s own firewall blocks unsolicited connections, including between machines on the same network."},"postes/18":{"titre":"Encrypt sensitive data at rest and in transit","aide":"Encryption makes the data unreadable if equipment is stolen or traffic intercepted."},"reseau/19":{"titre":"Segment the network into sensitivity zones","aide":"Separating the zones (office, servers, industrial) limits how far an attack spreads from one to the next."},"reseau/20":{"titre":"Secure the Wi-Fi and separate its uses","aide":"Strong Wi-Fi encryption, and a guest network kept isolated from the internal one."},"reseau/21":{"titre":"Use secure network protocols","aide":"Prefer the encrypted versions (HTTPS, SSH, SFTP…) over legacy protocols that transmit in the clear."},"reseau/22":{"titre":"Implement a secure Internet access gateway","aide":"Filtering, proxying and logging frame outbound access and block dangerous sites or flows."},"reseau/23":{"titre":"Segregate Internet-facing services (DMZ)","aide":"Servers reachable from the Internet sit in a buffer zone, cut off from the heart of the information system."},"reseau/24":{"titre":"Protect corporate email","aide":"Anti-spam, anti-phishing, attachment filtering and sender authentication (SPF, DKIM, DMARC)."},"reseau/25":{"titre":"Secure the interconnections with partners","aide":"Dedicated links to third parties must be encrypted, filtered and held to the strict minimum."},"reseau/26":{"titre":"Control physical access to technical areas","aide":"Server rooms and patch cabinets protected: physical access bypasses a great many logical protections."},"administration/27":{"titre":"Cut Internet access from administration tools","aide":"The workstations and servers used to administer the information system must not browse the Internet (risk of compromise)."},"administration/28":{"titre":"Dedicate and separate the administration network","aide":"Administering over a separate network stops an attacker on the office network from reaching the admin consoles."},"administration/29":{"titre":"Reduce administration rights to strict need","aide":"The fewer accounts that hold elevated rights, the smaller the privileged attack surface."},"administration/30":{"titre":"Use administrator accounts for administration tasks only","aide":"An administrator uses a standard account for office work, and their privileged account only to administer."},"nomadisme/31":{"titre":"Physically secure mobile devices","aide":"Locking, privacy screens and vigilance against the theft or loss of laptops and smartphones."},"nomadisme/32":{"titre":"Encrypt devices and media taken off site","aide":"A lost computer must not give up its data: full-disk encryption is essential away from the office."},"nomadisme/33":{"titre":"Secure the remote connection (VPN)","aide":"Access from outside goes through an encrypted, authenticated tunnel into the information system."},"nomadisme/34":{"titre":"Govern the use of mobile devices","aide":"A dedicated policy for smartphones and tablets (MDM, permitted applications, work/personal separation)."},"maj/35":{"titre":"Apply an update policy","aide":"Installing security patches promptly closes known holes before they are exploited."},"maj/36":{"titre":"Anticipate obsolescence (end of support)","aide":"Software or a system that no longer receives patches becomes a permanent vulnerability: plan its replacement."},"superviser/37":{"titre":"Log the activity of the key components","aide":"Without logs you neither detect nor understand an attack. Enabling and retaining them is the basis of detection."},"superviser/38":{"titre":"Back up regularly and test the restores","aide":"Offline, tested backups are the best answer to ransomware. An untested backup is not a backup."},"superviser/39":{"titre":"Undertake regular security audits","aide":"Regular checks and tests reveal the gaps, to be closed through the action plan."},"superviser/40":{"titre":"Designate a security point of contact","aide":"One identified person steers security and is the focal point for alerts and decisions."},"avance/41":{"titre":"Define a security incident management procedure","aide":"Knowing in advance who does what (detection, containment, communication) buys decisive time on the day."},"avance/42":{"titre":"Carry out a risk assessment and favour qualified products","aide":"A formal risk assessment sets the priorities; products and services qualified by ANSSI carry extra assurance."}}}'::jsonb),
  ('REFX-0002', null, 'iso27001-smsi', 'en',
   '{"version":"Clauses 4-10 · ISMS","nom":"ISO/IEC 27001:2022 — Management system","description":"The requirements for the information security management system (ISMS) of ISO/IEC 27001:2022 — clauses 4 to 10: context, leadership, planning, support, operation, performance evaluation and improvement. These are the requirements a clause 9.2 audit checks, alongside the Annex A controls.","aide":"Where Annex A lists security controls (from which the Statement of Applicability selects), clauses 4 to 10 are the MANDATORY management system requirements: they describe how security is steered over time (PDCA). Clause titles follow the standard''s own terminology; the normative text of the requirements is not reproduced — refer to ISO/IEC 27001:2022 for it.","domaines":{"c4":{"nom":"4. Context of the organization","court":"Context","aide":"Lay the foundations: understand the context, identify the interested parties, and set the scope of the ISMS."},"c5":{"nom":"5. Leadership","court":"Leadership","aide":"Commitment from top management: policy, resources and responsibilities."},"c6":{"nom":"6. Planning","court":"Planning","aide":"Treat the risks, set objectives and plan the changes."},"c7":{"nom":"7. Support","court":"Support","aide":"The means: resources, competence, awareness, communication and documentation."},"c8":{"nom":"8. Operation","court":"Operation","aide":"Execute: control the operations, and carry out risk assessment and risk treatment."},"c9":{"nom":"9. Performance evaluation","court":"Evaluation","aide":"Check: measure performance, audit, and hold the management review."},"c10":{"nom":"10. Improvement","court":"Improvement","aide":"Move forward: improve continually and deal with nonconformities."}},"exigences":{"c4/4.1":{"titre":"Understanding the organization and its context","aide":"Identify the internal and external issues relevant to the ISMS (purpose, business, regulation, environment)."},"c4/4.2":{"titre":"Interested parties and their requirements","aide":"Determine the relevant interested parties (customers, authorities, employees…) and their requirements, legal and contractual ones included."},"c4/4.3":{"titre":"Determining the scope of the ISMS","aide":"Set the boundaries and applicability of the system: activities, sites, assets, interfaces and dependencies."},"c4/4.4":{"titre":"Establishing and improving the ISMS","aide":"Establish, maintain and continually improve the ISMS and its processes, in line with the standard."},"c5/5.1":{"titre":"Demonstrate leadership and commitment","aide":"Top management drives the policy, builds it into the business processes, provides the resources and backs the people involved."},"c5/5.2":{"titre":"Establish the information security policy","aide":"A policy that fits the business, frames the objectives, and is communicated and available as documented information."},"c5/5.3":{"titre":"Roles, responsibilities and authorities","aide":"Assign and communicate who is responsible for ISMS conformity and for reporting on its performance."},"c6/6.1.1":{"titre":"Actions to address risks and opportunities","aide":"From the context (4.1) and the requirements (4.2), determine the risks and opportunities to address, and plan the actions."},"c6/6.1.2":{"titre":"Information security risk assessment process","aide":"A repeatable method to identify, analyse and evaluate risks, with assessment and acceptance criteria."},"c6/6.1.3":{"titre":"Information security risk treatment process","aide":"Choose the options, determine the controls (compared against Annex A), produce the Statement of Applicability and the treatment plan, and obtain the risk owners'' approval."},"c6/6.2":{"titre":"Information security objectives and planning","aide":"Objectives consistent with the policy, measurable, monitored, with resources, owners and deadlines."},"c6/6.3":{"titre":"Planning of changes to the ISMS","aide":"Carry out any change needed to the ISMS in a planned manner (new in the 2022 edition)."},"c7/7.1":{"titre":"Provide the resources needed for the ISMS","aide":"Determine and allocate the resources needed to establish, implement, maintain and improve the ISMS."},"c7/7.2":{"titre":"Ensure the competence of the people involved","aide":"Determine the competence required, acquire it (training, recruitment) and retain evidence of it."},"c7/7.3":{"titre":"Make people aware of the ISMS and their part in it","aide":"Everyone knows the policy, their own contribution to the effectiveness of the ISMS, and what failing to comply means."},"c7/7.4":{"titre":"Organise internal and external communication","aide":"Determine what to communicate about the ISMS, when, with whom and how."},"c7/7.5.1":{"titre":"Maintain the required documented information","aide":"The ISMS holds the documentation the standard requires, plus whatever is judged necessary for it to be effective."},"c7/7.5.2":{"titre":"Creating and updating documented information","aide":"Appropriate identification, format and media; review and approval."},"c7/7.5.3":{"titre":"Control of documented information","aide":"Availability, protection, distribution, versioning, retention and disposal; control of documents of external origin."},"c8/8.1":{"titre":"Operational planning and control","aide":"Implement the processes needed to treat the risks, and keep control of changes and of outsourced processes."},"c8/8.2":{"titre":"Performing the risk assessments","aide":"Assess the risks at planned intervals, or when a significant change occurs, and retain evidence."},"c8/8.3":{"titre":"Implementing the risk treatment plan","aide":"Carry out the risk treatment plan and retain evidence of it."},"c9/9.1":{"titre":"Monitoring, measurement, analysis and evaluation","aide":"Determine what to measure, by which methods, when and by whom, so as to evaluate the performance and effectiveness of the ISMS."},"c9/9.2.1":{"titre":"Carry out internal audits","aide":"Check at planned intervals that the ISMS conforms to its own requirements and to the standard, and is effectively implemented."},"c9/9.2.2":{"titre":"Establish an internal audit programme","aide":"Plan the frequency, methods and responsibilities; objective and impartial auditors; results reported and retained."},"c9/9.3.1":{"titre":"Carry out management reviews","aide":"Top management reviews the ISMS at planned intervals to confirm its continuing suitability, adequacy and effectiveness."},"c9/9.3.2":{"titre":"Examine the required management review inputs","aide":"Status of earlier actions, changes in context, performance, nonconformities, audit and risk assessment results, feedback from interested parties."},"c9/9.3.3":{"titre":"Record the results of the management review","aide":"Produce decisions on continual improvement and on changes to the ISMS, and retain evidence of them."},"c10/10.1":{"titre":"Improve the ISMS continually","aide":"Continually improve the suitability, adequacy and effectiveness of the system."},"c10/10.2":{"titre":"Nonconformity and corrective action","aide":"React, correct, analyse the causes, act to prevent recurrence, check that it worked and retain evidence."}}}'::jsonb),
  ('REFX-0003', null, 'iso-27002-2022', 'en',
   '{"version":"Annex A · 93 controls","description":"Annex A controls of ISO/IEC 27001:2022, the certifiable standard for an information security management system (ISMS). Arranged in 4 themes (organizational, people, physical, technological).","aide":"ISO/IEC 27001 is the certifiable ISMS standard. Its Annex A lists 93 controls, from which the Statement of Applicability (SoA) selects those that apply to treat the identified risks. Control titles follow the standard''s own terminology, so that an auditor reads the words they expect; the normative text of the controls is not reproduced — refer to ISO/IEC 27001:2022 for it.","domaines":{"org":{"nom":"Organizational controls","court":"Organizational","aide":"Policies, roles, supplier relationships, incident management and compliance: how security is steered."},"peo":{"nom":"People controls","court":"People","aide":"The human factor: screening, awareness, remote working and reporting."},"phy":{"nom":"Physical controls","court":"Physical","aide":"Protecting premises, equipment and physical media."},"tec":{"nom":"Technological controls","court":"Technological","aide":"Technical protection: access, malware, vulnerabilities, logging, networks, cryptography, secure development."}},"exigences":{"org/5.1":{"titre":"Policies for information security","aide":"A body of policies approved by management, published and reviewed at planned intervals, that sets the frame."},"org/5.2":{"titre":"Information security roles and responsibilities","aide":"Who is accountable for what in security: roles defined and allocated."},"org/5.3":{"titre":"Segregation of duties","aide":"Split conflicting duties between several people to limit fraud and error."},"org/5.4":{"titre":"Management responsibilities","aide":"Management requires and supports everyone in applying the security rules."},"org/5.5":{"titre":"Contact with authorities","aide":"Know who to contact (national cyber authority, data protection authority, police) and keep those contacts current."},"org/5.6":{"titre":"Contact with special interest groups","aide":"Take part in specialist forums and CERTs to keep up with threats and good practice."},"org/5.7":{"titre":"Threat intelligence","aide":"Collect and use information on threats in order to anticipate them."},"org/5.8":{"titre":"Information security in project management","aide":"Build security into every project from the design stage, whatever its nature."},"org/5.9":{"titre":"Inventory of information and assets","aide":"List information and associated assets, each with a named asset owner."},"org/5.10":{"titre":"Acceptable use of information and assets","aide":"Rules for using resources and information, made known to users."},"org/5.11":{"titre":"Return of assets","aide":"Recover equipment and access rights when someone leaves or a contract ends."},"org/5.12":{"titre":"Classification of information","aide":"Classify information by sensitivity so it is protected in proportion."},"org/5.13":{"titre":"Labelling of information","aide":"Label documents according to their classification (confidential, internal…)."},"org/5.14":{"titre":"Information transfer","aide":"Govern information exchange (rules, encryption, agreements), inside and outside."},"org/5.15":{"titre":"Access control","aide":"An access policy built on need-to-know and least privilege."},"org/5.16":{"titre":"Identity management","aide":"A controlled identity life cycle (creation, change, removal)."},"org/5.17":{"titre":"Authentication information","aide":"Manage and protect passwords, secrets and authentication factors."},"org/5.18":{"titre":"Access rights","aide":"Grant, review and withdraw access rights against real business need."},"org/5.19":{"titre":"Information security in supplier relationships","aide":"Address security from supplier selection and throughout the relationship."},"org/5.20":{"titre":"Information security in supplier agreements","aide":"Set the security requirements down in the contract."},"org/5.21":{"titre":"Information security in the ICT supply chain","aide":"Control the risks carried by the ICT supply chain."},"org/5.22":{"titre":"Monitoring and review of supplier services","aide":"Monitor, review and manage change in outsourced services."},"org/5.23":{"titre":"Information security for use of cloud services","aide":"Govern the acquisition and use of cloud services (shared responsibility)."},"org/5.24":{"titre":"Incident management planning and preparation","aide":"Plan and prepare the response to incidents (roles, procedures)."},"org/5.25":{"titre":"Assessment and decision on security events","aide":"Triage events to decide which of them are incidents."},"org/5.26":{"titre":"Response to information security incidents","aide":"Respond to incidents following documented procedures."},"org/5.27":{"titre":"Learning from information security incidents","aide":"Turn incidents into stronger defences (lessons learned)."},"org/5.28":{"titre":"Collection of evidence","aide":"Collect and preserve evidence so that it stays usable (forensics)."},"org/5.29":{"titre":"Information security during disruption","aide":"Keep security at an adequate level during a crisis or a disaster."},"org/5.30":{"titre":"ICT readiness for business continuity","aide":"Make IT capable of supporting business continuity."},"org/5.31":{"titre":"Legal, regulatory and contractual requirements","aide":"Identify and meet legal, statutory, regulatory and contractual obligations."},"org/5.32":{"titre":"Intellectual property rights","aide":"Respect intellectual property rights (software licences and the like)."},"org/5.33":{"titre":"Protection of records","aide":"Protect records against loss, alteration and unauthorised access."},"org/5.34":{"titre":"Privacy and protection of PII","aide":"Protect privacy and personally identifiable information (GDPR)."},"org/5.35":{"titre":"Independent review of information security","aide":"Have security reviewed by an independent party at planned intervals."},"org/5.36":{"titre":"Compliance with policies, rules and standards","aide":"Check regularly that security policies and standards are being followed."},"org/5.37":{"titre":"Documented operating procedures","aide":"Document operating procedures and make them available."},"peo/6.1":{"titre":"Screening (pre-employment)","aide":"Check candidates'' background, in proportion to the post."},"peo/6.2":{"titre":"Terms and conditions of employment","aide":"Write security responsibilities into employment contracts."},"peo/6.3":{"titre":"Awareness, education and training","aide":"Train all staff and raise their awareness, regularly."},"peo/6.4":{"titre":"Disciplinary process","aide":"Provide for sanctions where security rules are breached."},"peo/6.5":{"titre":"Responsibilities after employment ends","aide":"Restate the duties that outlive the contract (confidentiality)."},"peo/6.6":{"titre":"Confidentiality or non-disclosure agreements","aide":"Have suitable confidentiality undertakings (NDAs) signed."},"peo/6.7":{"titre":"Remote working","aide":"Secure work away from the office (device, connection, surroundings)."},"peo/6.8":{"titre":"Information security event reporting","aide":"Let anyone report a suspicious event quickly."},"phy/7.1":{"titre":"Physical security perimeters","aide":"Draw protected areas around sensitive assets."},"phy/7.2":{"titre":"Physical entry","aide":"Let only authorised people into secure areas."},"phy/7.3":{"titre":"Securing offices, rooms and facilities","aide":"Protect offices, rooms and facilities to match their sensitivity."},"phy/7.4":{"titre":"Physical security monitoring","aide":"Detect unauthorised physical access (CCTV, alarms)."},"phy/7.5":{"titre":"Protection against environmental threats","aide":"Guard against fire, water damage and natural disasters."},"phy/7.6":{"titre":"Working in secure areas","aide":"Specific rules of conduct inside sensitive areas."},"phy/7.7":{"titre":"Clear desk and clear screen","aide":"Leave no sensitive information in view and no session unlocked."},"phy/7.8":{"titre":"Equipment siting and protection","aide":"Site and protect equipment against hazards and prying eyes."},"phy/7.9":{"titre":"Security of assets off-premises","aide":"Protect equipment used away from the site (mobile working)."},"phy/7.10":{"titre":"Storage media","aide":"Manage the media life cycle (use, transport, disposal)."},"phy/7.11":{"titre":"Supporting utilities","aide":"Make the power, cooling and network that carry IT dependable."},"phy/7.12":{"titre":"Cabling security","aide":"Protect network and power cabling against interception and damage."},"phy/7.13":{"titre":"Equipment maintenance","aide":"Maintain equipment to preserve its availability and integrity."},"phy/7.14":{"titre":"Secure disposal or re-use of equipment","aide":"Erase the data before equipment is discarded or re-used."},"tec/8.1":{"titre":"User endpoint devices","aide":"Secure desktops, laptops and mobiles (hardening, protection)."},"tec/8.2":{"titre":"Privileged access rights","aide":"Restrict privileged accounts and watch them closely."},"tec/8.3":{"titre":"Information access restriction","aide":"Limit access to information in line with the access control policy."},"tec/8.4":{"titre":"Access to source code","aide":"Control read and write access to source code and its tooling."},"tec/8.5":{"titre":"Secure authentication","aide":"Put strong authentication mechanisms in place (MFA)."},"tec/8.6":{"titre":"Capacity management","aide":"Size and watch resources so that they do not run out."},"tec/8.7":{"titre":"Protection against malware","aide":"Anti-malware, filtering and awareness against malicious code."},"tec/8.8":{"titre":"Management of technical vulnerabilities","aide":"Find, assess and fix vulnerabilities (watch plus patching)."},"tec/8.9":{"titre":"Configuration management","aide":"Define, apply and monitor secure configurations."},"tec/8.10":{"titre":"Information deletion","aide":"Delete information that is no longer needed (retention periods)."},"tec/8.11":{"titre":"Data masking","aide":"Mask or anonymise sensitive data wherever the use allows."},"tec/8.12":{"titre":"Data leakage prevention","aide":"Detect and stop the exfiltration of sensitive information (DLP)."},"tec/8.13":{"titre":"Information backup","aide":"Back up regularly, and test the restores."},"tec/8.14":{"titre":"Redundancy of information processing facilities","aide":"Provide redundancy so that services stay available."},"tec/8.15":{"titre":"Logging","aide":"Log the relevant events, and protect the logs themselves."},"tec/8.16":{"titre":"Monitoring activities","aide":"Monitor systems to detect abnormal behaviour."},"tec/8.17":{"titre":"Clock synchronization","aide":"Keep clocks aligned so that log correlation can be trusted."},"tec/8.18":{"titre":"Use of privileged utility programs","aide":"Govern tools capable of overriding system controls."},"tec/8.19":{"titre":"Installation of software on operational systems","aide":"Control software installation on production systems."},"tec/8.20":{"titre":"Networks security","aide":"Protect the networks and the data that crosses them."},"tec/8.21":{"titre":"Security of network services","aide":"Define and check the security mechanisms of network services."},"tec/8.22":{"titre":"Segregation of networks","aide":"Segment networks by sensitivity and by trust."},"tec/8.23":{"titre":"Web filtering","aide":"Filter access to websites to cut exposure to threats."},"tec/8.24":{"titre":"Use of cryptography","aide":"Set rules for using encryption, and manage the keys."},"tec/8.25":{"titre":"Secure development life cycle","aide":"Build security in throughout software development."},"tec/8.26":{"titre":"Application security requirements","aide":"State application security requirements from the outset."},"tec/8.27":{"titre":"Secure architecture and engineering principles","aide":"Design systems on secure engineering principles."},"tec/8.28":{"titre":"Secure coding","aide":"Apply coding practices that avoid the common vulnerabilities."},"tec/8.29":{"titre":"Security testing in development and acceptance","aide":"Test security during development and acceptance."},"tec/8.30":{"titre":"Outsourced development","aide":"Direct and check security in outsourced development."},"tec/8.31":{"titre":"Separation of development, test and production","aide":"Keep environments apart in order to protect production."},"tec/8.32":{"titre":"Change management","aide":"Control system changes through a formal process."},"tec/8.33":{"titre":"Test information","aide":"Select and protect the data used for testing."},"tec/8.34":{"titre":"Protection of systems during audit testing","aide":"Plan audit tests so that production systems are not disturbed."}}}'::jsonb),
  ('REFX-0004', null, 'nis2-art21', 'en',
   '{"version":"10 measures","nom":"NIS2 — Article 21 measures","description":"The minimum risk-management measures that the European NIS2 Directive (Article 21) imposes on essential and important entities. Transposed into national law, it widens considerably the range of organisations concerned.","aide":"NIS2 requires an all-hazards approach to risk and makes the management body accountable. The 10 measures below are grouped into themes for readability; the text of the directive remains the reference.","domaines":{"gouvernance":{"nom":"Risk governance","court":"Governance","aide":"Analyse the risks, adopt policies and check that they actually work."},"incidents":{"nom":"Incidents & continuity","court":"Incidents","aide":"Handle incidents and keep the business running through a crisis."},"chaine":{"nom":"Supply chain & development","court":"Supply chain","aide":"Secure the suppliers and the life cycle of the systems."},"hygiene":{"nom":"Hygiene, access & cryptography","court":"Hygiene & access","aide":"The fundamentals: training, cryptography, access management and multi-factor authentication."}},"exigences":{"gouvernance/a":{"titre":"Risk analysis and information system security policies","aide":"Hold policies on risk analysis and on the security of information systems."},"gouvernance/f":{"titre":"Assessing the effectiveness of the measures","aide":"Put procedures in place to assess whether the cybersecurity risk-management measures are effective."},"incidents/b":{"titre":"Incident handling","aide":"Detect, handle and report security incidents."},"incidents/c":{"titre":"Business continuity and crisis management","aide":"Backup management, disaster recovery and crisis management."},"chaine/d":{"titre":"Supply chain security","aide":"Control the risks carried by direct suppliers and service providers."},"chaine/e":{"titre":"Security in acquisition, development and maintenance","aide":"Covers vulnerability handling and disclosure as well."},"hygiene/g":{"titre":"Cyber hygiene and training","aide":"Basic cyber hygiene practices and cybersecurity training."},"hygiene/h":{"titre":"Cryptography and encryption","aide":"Policies and procedures governing the use of cryptography."},"hygiene/i":{"titre":"HR security, access control and asset management","aide":"Human resources security, access control policies and the asset inventory."},"hygiene/j":{"titre":"Multi-factor authentication and secured communications","aide":"Multi-factor authentication, and secured voice, video, text and emergency communications."}}}'::jsonb),
  ('REFX-0005', null, 'dora', 'en',
   '{"version":"5 pillars","nom":"DORA — operational resilience","description":"The European framework for digital operational resilience in the financial sector: ICT risk management, incidents, testing, third-party risk and information sharing.","aide":"DORA aims to make sure that financial entities withstand ICT disruption. The 5 pillars are summarised here as indicative measures; the regulation and its technical standards (RTS/ITS) remain the reference.","domaines":{"p1":{"nom":"ICT risk management","court":"ICT risk","aide":"A governance and control framework for ICT risk, driven by the management body."},"p2":{"nom":"ICT-related incident management","court":"Incidents","aide":"Handle, classify and report ICT-related incidents."},"p3":{"nom":"Resilience testing","court":"Testing","aide":"Test resilience regularly, up to advanced threat-led testing."},"p4":{"nom":"ICT third-party risk","court":"Third parties","aide":"Control the dependency on ICT service providers, cloud included."},"p5":{"nom":"Information sharing","court":"Sharing","aide":"Exchange cyber threat information to strengthen collective resilience."}},"exigences":{"p1/1.1":{"titre":"ICT risk management framework","aide":"Governance, accountability of the management body, and a documented framework."},"p1/1.2":{"titre":"Identification of assets and dependencies","aide":"Identify the critical ICT-supported business functions, assets and dependencies."},"p1/1.3":{"titre":"Protection and prevention","aide":"Security and continuity measures that prevent incidents."},"p1/1.4":{"titre":"Detection of anomalous activities","aide":"Promptly detect abnormal activity and ICT-related incidents."},"p1/1.5":{"titre":"ICT business continuity and recovery policy","aide":"Backups, recovery plans, recovery time and recovery point objectives (RTO/RPO)."},"p2/2.1":{"titre":"ICT-related incident management process","aide":"Detect, record and handle incidents consistently."},"p2/2.2":{"titre":"Classification of incidents","aide":"Assess how significant an incident is against defined criteria."},"p2/2.3":{"titre":"Reporting of major incidents","aide":"Report major ICT-related incidents to the competent authorities within the deadlines."},"p3/3.1":{"titre":"Digital operational resilience testing programme","aide":"Regularly test ICT tools and systems (vulnerability assessments, scenario-based tests)."},"p3/3.2":{"titre":"Advanced testing (TLPT)","aide":"Threat-led penetration testing, for the entities that fall in scope."},"p4/4.1":{"titre":"Register of information on ICT providers","aide":"Maintain the register of information on all contractual arrangements for the use of ICT services."},"p4/4.2":{"titre":"Key contractual provisions","aide":"Mandatory clauses (access, audit, security, subcontracting)."},"p4/4.3":{"titre":"Monitoring of critical ICT providers","aide":"Follow up on critical ICT third-party service providers, and watch for concentration risk."},"p4/4.4":{"titre":"Exit strategies","aide":"Plan for reversibility and for exiting critical ICT services."},"p5/5.1":{"titre":"Cyber threat information sharing","aide":"Take part in information-sharing arrangements on cyber threat information and intelligence."}}}'::jsonb),
  ('REFX-0006', null, 'aircyber', 'en',
   '{"description":"Cyber security maturity questionnaire of the aerospace supply chain (AirCyber / BoostAerospace programme). Self-assessment of practices, with a label level (Bronze / Silver / Gold), a priority and a classification domain (CL0-CL6).","aide":"Questionnaire used across the aerospace supply chain. Each question carries, where it is known, its label level (Bronze/Silver/Gold), its priority and its CL0-CL6 domain. Tool inventory questions are not included. The level/priority/CL mapping covers 156 of the 234 questions.","domaines":{"phys":{"nom":"Physical security of premises","court":"Physical","aide":"Access to buildings and server rooms, and protection against power cuts and environmental hazards."},"parc":{"nom":"Inventory and mapping of the IT estate","court":"Inventory","aide":"Knowing your IT estate and your network: the basis of any control."},"ident":{"nom":"Identities and authorisations","court":"Identities","aide":"Named accounts, pre-employment screening and authorisations."},"acces":{"nom":"Access and vulnerability management","court":"Access","aide":"The access lifecycle, rights, and the watch on vulnerabilities and patches."},"serveurs":{"nom":"Server hardening and monitoring","court":"Servers","aide":"Hardening sensitive servers, and protecting and monitoring the information system."},"donnees":{"nom":"Backups and data protection","court":"Data","aide":"Regular, tested backups, and the ownership and protection of data."},"ot":{"nom":"Industrial systems (OT)","court":"Industrial","aide":"Segregation, mapping and protection of the industrial production environments."},"clients":{"nom":"Customer security requirements","court":"Customers","aide":"The information security requirements of your customers, and how far you comply with them."},"gouv":{"nom":"Cyber governance and risk","court":"Governance","aide":"Awareness of the risks, budget, insurance and the steering of cyber security."},"ext":{"nom":"Extended questions (Ext)","court":"Extended","aide":"Additional questions from the questionnaire, to probe maturity further."}},"exigences":{"phys/1.1":{"titre":"Is access to your buildings, offices and IT facilities controlled and restricted (for example by locked doors, card readers, and devices to prevent, detect and respond to theft)?"},"phys/1.2":{"titre":"Is the perimeter of your server rooms and technical areas secured by a fence, an entry barrier, CCTV and an alarm?"},"phys/1.3":{"titre":"Is the perimeter of your premises secured by security guards with a night watch, an entry barrier, CCTV and an alarm?"},"phys/1.4":{"titre":"Are visitors escorted at all times while on your premises?"},"phys/1.5":{"titre":"Do you use uninterruptible power supplies (UPS) or backup batteries to maintain power during an outage?"},"phys/1.6":{"titre":"Do you have a clear desk and clear screen policy covering papers and sensitive removable storage media?"},"phys/1.7":{"titre":"If you have several geographical IT sites, do you visit them regularly to check physical and IT security (at least once every 2 years)?"},"parc/2.1":{"titre":"Do you keep a complete, up-to-date inventory of your IT estate (servers, desktops, laptops, printers, network equipment, smartphones)? Do you keep an accurate, up-to-date inventory of the assets (workstations, servers) involved in producing for your customers?"},"parc/2.1.1":{"titre":"Do you have a complete network diagram of your company?"},"parc/2.1.2":{"titre":"Is your map of networks and permitted protocols available and updated automatically?"},"parc/2.1.3":{"titre":"Have you deployed a solution (such as NAC or DHCP monitoring) to detect and monitor new equipment connecting to your internal network (PCs, servers, printers, routers)?"},"parc/2.10":{"titre":"Do you define and apply an automatic backup policy for the critical components, with a tested restore procedure?"},"parc/2.11":{"titre":"Have you set rules on how users may connect peripherals to their computers (never plugging in a USB stick found by chance, scanning partners'' sticks with anti-virus, not connecting arbitrary accessories)?"},"parc/2.2":{"titre":"Is the list of your IT estate updated regularly (servers, desktops, laptops, printers, network equipment, smartphones)?"},"parc/2.3":{"titre":"Is there a person or a department assigned to managing the IT system?"},"parc/2.4":{"titre":"Do you have a point of contact for information system security (a CISO or equivalent)?"},"parc/2.4.1":{"titre":"Has your organisation put an information security policy and its supporting directives in place? Do you communicate them to all users and project managers?"},"parc/2.5":{"titre":"Do you use a tool to make sure that all your workstations (servers, laptops, desktops) are secured consistently (identical security policies across machines, management of deviations)?"},"parc/2.5.1":{"titre":"Do you use a tool to make sure that all your smartphones are secured consistently (identical security policies across devices, management of deviations)?"},"parc/2.6":{"titre":"Have you deployed a malware detection tool (anti-virus) across the whole office IT estate and on the servers?"},"parc/2.7":{"titre":"Have you deployed a behaviour-based tool (EDR) to remove or quarantine malware across the whole IT estate?"},"parc/2.8":{"titre":"Are corporate smartphones managed by your IT team (for example password configuration and the anti-virus policy)?"},"parc/2.8.1":{"titre":"Do corporate smartphones have a dedicated security policy?"},"parc/2.8.2":{"titre":"Are corporate smartphones managed centrally, with a tool that controls their configuration and security posture?"},"parc/2.9":{"titre":"Do you have a central solution to enable, retain (for at least one year) and configure the logs of the most important components, such as the firewalls or the Internet access?"},"parc/2.9.1":{"titre":"Do you analyse the logs of the most important components (servers, desktops, laptops, printers, network equipment, smartphones) — for example real-time monitoring and investigation, or a SOC?"},"parc/2.9.2":{"titre":"Do you enable, retain for at least one year and configure the administrator authentication logs on network equipment, servers and computers?"},"parc/2.9.3":{"titre":"Do you follow a procedure to implement log recording on the most important components, such as the firewalls and the Internet access?"},"parc/2.9.4":{"titre":"Do you harden the default configuration of your Active Directory (AD) server, and retain the AD authentication logs for at least one year? This covers hardening the operating system (restricting the protocols and services that run, forbidding direct Internet access from the server, disabling default accounts) and the Active Directory settings (read-only AD, validation of the policies and of the security rules applied to AD-managed workstations, restricted and hardened passwords for privileged accounts)."},"parc/2.9.5":{"titre":"Have you completed the hardening of your Active Directory server — applying all the good practice, or formally accepting the residual risks of the controls not deployed — and enabled detailed alerting on a security incident (detailed log configuration, log monitoring)?"},"ident/3.1":{"titre":"Does every employee have a named user account on the IT and production environments?"},"ident/3.1.1":{"titre":"Where necessary, do you screen the nationality and background of employees before hiring (for example criminal record checks or references), according to the role they will hold in the company (senior staff, IT staff, maintenance staff)?"},"ident/3.1.2":{"titre":"Where security constraints have been identified — a required security clearance, for instance — do you check the background and the suitability of new hires (criminal record, nationality)?"},"ident/3.2":{"titre":"Can you confirm that the accounts given to users to reach and use the information system (computer, server, cloud) hold no administrator rights? Administrators can change security settings, install software and devices, and reach every file on the computer."},"ident/3.3":{"titre":"Do you keep a complete inventory of privileged (administrator) accounts, and do you keep it up to date?"},"ident/3.3.1":{"titre":"If administrator accounts are used on the machines, do you have a solution to control their security (password strength, account lockout, remote password change)?"},"ident/3.4":{"titre":"Do you train the operational teams (network, security and system administrators, project managers, developers, the CISO) in information system security?"},"ident/3.5":{"titre":"Do you raise users'' awareness of the rules, the expected behaviour and the information security instructions that govern day-to-day work? Is this confirmed by signing an acceptable use policy for the information systems, setting out the cyber security rules they must follow, or a legally binding equivalent (an annex to the internal rules, or the employment contract)?"},"ident/3.5.1":{"titre":"Do you run systematic cyber security training for all employees and contractors, tailored to their role in the company, and do you track attendance?"},"ident/3.6":{"titre":"Are users given the security measures needed when travelling with their laptop (privacy screen, security cable, VPN, encryption, monitoring)?"},"acces/4.1":{"titre":"Is there a joiner and leaver procedure for users and administrators?"},"acces/4.10":{"titre":"Do you subscribe to a news feed informing you of new cyber security vulnerabilities and alerts, such as those published by government CERTs (ANSSI in France, NIST in the US) or by international security watch sites?"},"acces/4.11":{"titre":"Have you set up or contracted professional security alerting services tailored to your company, its sector of activity and the IT equipment you have deployed (commercial or sector CERTs, threat intelligence services)?"},"acces/4.2":{"titre":"Does installing software on a user''s computer require administrator rights, obtained through a separate authentication with an admin account or through IT support?"},"acces/4.2.1":{"titre":"Do you manage user accounts centrally and securely, with the ability to detect abnormal behaviour (credential theft, use on non-standard servers, password guessing attempts)?"},"acces/4.3":{"titre":"Do you protect the passwords stored on the systems (encryption)?"},"acces/4.4":{"titre":"Is there a password management policy (renewal frequency, minimum security constraints, special characters, length, a specific policy for administrator profiles)?"},"acces/4.4.1":{"titre":"Do you change the default passwords and account names across the IT estate?"},"acces/4.5":{"titre":"Do you regularly update the components of your IT estate (servers, desktops, laptops, printers, network equipment, smartphones)?"},"acces/4.6":{"titre":"Do you anticipate the end of support for software and systems?"},"acces/4.6.1":{"titre":"To head off potential vulnerabilities (unknown or out-of-date software), do you check the versions of the software installed across your IT estate?"},"acces/4.6.2":{"titre":"Do you keep a list of the permitted and forbidden software?"},"acces/4.7":{"titre":"Do you follow, at least weekly, a procedure for handling the security alerts and advisories issued by CERTs (Computer Emergency Response Teams) and by software vendors?"},"acces/4.8":{"titre":"Is there a Security Operations Centre (SOC) that detects and monitors the security of the information system?"},"acces/4.8.1":{"titre":"Do you centralise security incidents and events through SIEM (Security Information and Event Management) collection tools?"},"acces/4.8.2":{"titre":"Do you monitor user devices such as desktops, laptops, smartphones and USB sticks?"},"acces/4.8.3":{"titre":"Is there an alerting tool that can automatically shut down or isolate parts of the estate during a major incident?"},"acces/4.8.4":{"titre":"Is there a Network Operations Centre (NOC) monitoring your network and able to detect security incidents?"},"acces/4.8.5":{"titre":"Do you block unauthorised connections to your network?"},"acces/4.8.6":{"titre":"Have you deployed network probes, and do you monitor them, to detect malicious or abnormal activity?"},"acces/4.9":{"titre":"Are there escalation and alerting processes for security incidents?"},"acces/4.9.1":{"titre":"Have you deployed solutions on PCs and servers that detect abnormal behaviour and either block it or raise an alert (IDS/IPS)?"},"serveurs/5.1":{"titre":"Do you know which are the most sensitive servers in your estate?"},"serveurs/5.10":{"titre":"Is Internet traffic monitored, with both alerts and indicators (KPIs) on how company data is used over the Internet?"},"serveurs/5.10.1":{"titre":"Do you encrypt the connections between your company sites and your partners?"},"serveurs/5.10.2":{"titre":"If browsing to non-work websites is allowed, have you deployed a secure browsing solution that isolates it from the standard IT network?"},"serveurs/5.11":{"titre":"Do you have a guest Wi-Fi access isolated from the rest of the company network (a specific connection, a dedicated Wi-Fi)?"},"serveurs/5.12":{"titre":"Do you have secured Wi-Fi with separation of uses (personal, industrial, business, guest)?"},"serveurs/5.13":{"titre":"Is there an email filtering system (anti-spam, removal of suspicious attachments)?"},"serveurs/5.13.1":{"titre":"Do you give users an easy way to encrypt the content of their emails?"},"serveurs/5.14":{"titre":"Do you secure the network interconnections with your subcontractors and suppliers?"},"serveurs/5.14.1":{"titre":"Do you provide a secure exchange platform for your subcontractors and suppliers?"},"serveurs/5.14.2":{"titre":"If your website is hosted inside the company, do you separate it and the Internet-facing services from the rest of the corporate network, through a segregated network zone such as a DMZ?"},"serveurs/5.15":{"titre":"Do you allow only devices that are identified and managed by the information system to connect to the network?"},"serveurs/5.17":{"titre":"For remote access to your information system (mobile or on-call users, remote sites, preventive or corrective maintenance), have you systematically put in place a security solution that guarantees identification and strong authentication of the user (VPN combined with MFA, personal, unique and non-transferable credentials, certificates)?"},"serveurs/5.2":{"titre":"Do you use security equipment to protect and segment your internal network (firewall, proxy)?"},"serveurs/5.2.1":{"titre":"Do you run a firewall on the client machines (laptops, desktops)?"},"serveurs/5.2.2":{"titre":"Do you review the firewall configuration at least once a year?"},"serveurs/5.3":{"titre":"Does your network architecture favour secure communications, allowing unsecured ones only by exception and isolating them from the rest of the network? For example, encouraging encrypted communications and forbidding insecure protocols: configuring the network, workstation and server firewalls to block Telnet on port 23 across the local network, Windows shares over Samba v1, and NTLMv1 authentication."},"serveurs/5.4":{"titre":"Do you use strong authentication to reach your corporate email from the Internet (two-factor authentication with a phone, account lockout against password guessing, regular password changes, complex passwords)?"},"serveurs/5.5":{"titre":"Do you use strong authentication, and monitor logins with alerts on failure, when connecting to sensitive equipment such as the administration of IT equipment, of cloud services and of websites?"},"serveurs/5.5.1":{"titre":"Do you use single sign-on (SSO) for HTTP applications, or enterprise SSO with an automated password manager?"},"serveurs/5.6":{"titre":"Do you administer the information system over a dedicated network, segregated from the Internet and from user workstations, and secured by protocol-break mechanisms (jump servers, an administration bastion, proxying)?"},"serveurs/5.6.1":{"titre":"Do the workstations carry a protection that stops users opening an unsecured Internet connection — by plugging in a modem, a 3G USB dongle or a smartphone — while the same computer is connected to the corporate network?"},"serveurs/5.7":{"titre":"Do you protect yourself against the threats that come with removable media?"},"serveurs/5.7.1":{"titre":"Do you encrypt sensitive data on removable media with no action required from users (transparent automatic encryption)?"},"serveurs/5.8":{"titre":"Has every device connected to the company information system (computer, tablet, smartphone) been through a formal prior approval procedure?"},"serveurs/5.8.1":{"titre":"Do you have full control over the work environment holding corporate applications and data on mobile devices (a sealed separation between the personal and work environments)?"},"serveurs/5.9":{"titre":"Is Internet access filtered through a proxy server?"},"serveurs/5.9.1":{"titre":"Do you protect the web servers reachable from outside the company network with filtering equipment such as a web application firewall (WAF)?"},"donnees/6.1":{"titre":"Is important data backed up regularly?"},"donnees/6.10":{"titre":"Have you established that your company data must be assigned to identified owners, with their responsibilities set out (HR data, engineering design data)?"},"donnees/6.2":{"titre":"Are your backups protected in a secured room?"},"donnees/6.3":{"titre":"Do you use a centrally managed data storage and backup system, such as a cloud service (AWS, Office 365 SharePoint, OneDrive, Google Drive)?"},"donnees/6.4":{"titre":"Do you encrypt the hard disks of computers and smartphones with no interaction from users (transparent automatic encryption)?"},"donnees/6.5":{"titre":"Do you deploy solutions to manage the protection of company data (detection of confidential data leakage, roles and responsibilities)?"},"donnees/6.6":{"titre":"Do you carry out regular security audits (application, network, process), and then apply the corrective actions that follow?"},"donnees/6.6.1":{"titre":"Do you check the compliance of your company''s subsidiaries?"},"donnees/6.6.2":{"titre":"Do you regularly review your firewall rules?"},"donnees/6.7":{"titre":"Do you run regular penetration tests on your information system and on those of your subsidiaries, and then apply the corrective actions that follow?"},"donnees/6.7.1":{"titre":"Do you run penetration tests on your company''s websites, and then apply the corrective actions that follow?"},"donnees/6.7.2":{"titre":"Do you regularly check and update your cyber attack detection capabilities — for example by updating the security monitoring rules after penetration tests on your systems, or through security project management?"},"donnees/6.8":{"titre":"Do you have the means and tools needed to encrypt sensitive data sent outside the company?"},"donnees/6.9":{"titre":"Do you define a data classification policy based on how the data is used (public, company confidential, confidential) and on the protection rules to apply to it?"},"donnees/6.9.1":{"titre":"Have you deployed a solution that classifies your company data automatically, or that helps decide how to protect data classified as sensitive?"},"donnees/6.9.2":{"titre":"Do you have a solution that blocks the sending of unprotected confidential data, or encrypts it systematically before it is saved or sent outside your information system?"},"ot/7.0":{"titre":"Do you segregate the industrial production environment from the other environments (qualification, pre-production, corporate information systems)?"},"ot/7.1.1":{"titre":"Have you mapped your industrial information system, identifying its most sensitive components?"},"ot/7.1.2":{"titre":"Do you back up the most sensitive parts of your industrial information systems (configuration, source code and data)?"},"ot/7.1.3":{"titre":"Are the backups of your information systems tested regularly?"},"ot/7.10":{"titre":"Is there an architecture, and are there management rules, defined specifically for these systems?"},"ot/7.11":{"titre":"Are the change processes and the dedicated IACS solutions subject to an annual technical security compliance audit?"},"ot/7.12":{"titre":"Are the ICS components covered by a threat and vulnerability monitoring process?"},"ot/7.13":{"titre":"Is there a security monitoring centre for your network (SOC, NOC, backup status) able to detect security incidents and backup failures, and to actively monitor the industrial systems (IACS)?"},"ot/7.14":{"titre":"When an incident occurs in production, do you investigate whether it could have a malicious cause?"},"ot/7.2":{"titre":"Are the documentation, the parts list and the diagrams of the ICS equipment kept up to date?"},"ot/7.3":{"titre":"Is there a documented crisis management process (for example recovery of operations after a system crash)?"},"ot/7.4":{"titre":"Is the documentation on ICS design, components and operation stored with an appropriate level of security?"},"ot/7.5":{"titre":"Is there a qualified person or a dedicated department for the design, operation and monitoring of the ICS equipment?"},"ot/7.6":{"titre":"Is there an ICS security awareness or training programme for employees and subcontractors?"},"ot/7.7":{"titre":"Have the users, control engineers and administrators of the industrial automation and control systems (IACS) signed an acceptable use policy covering cyber security good practice?"},"ot/7.8":{"titre":"Are procedures in place to manage the ICS lifecycle?"},"ot/7.9":{"titre":"Do you use a dedicated, segregated network to administer the ICS?"},"clients/8.1":{"titre":"Do your customers place specific requirements on you for managing information system security (for example in invitations to tender, or as contract clauses)?"},"clients/8.2":{"titre":"If so, how far do you comply with those requirements?"},"clients/8.3":{"titre":"If so, do those requirements differ from one customer to another?"},"clients/8.4":{"titre":"Have you, in turn, placed specific cyber security requirements on your own suppliers?"},"gouv/9.1":{"titre":"Do you have a good grasp of the full range of cyber security risks (outsourced IT, data loss, company reputation, cyber espionage, legal risk)?"},"gouv/9.10":{"titre":"Do your insurance policies cover you for business interruption caused by an IT security problem?"},"gouv/9.2":{"titre":"Is there a specific budget for IT management in the company (hardware, monitoring, maintenance, security)?"},"gouv/9.3":{"titre":"If so, how large is that budget each year (%)?"},"gouv/9.4":{"titre":"What share of that IT budget is currently allocated to cyber security (%)?"},"gouv/9.5":{"titre":"After how long an outage of your information systems would your business suffer a measurable impact?"},"gouv/9.6":{"titre":"Do you consider yourself sufficiently protected today against the risks that come with IT and the Internet?"},"gouv/9.7":{"titre":"To your knowledge, have you ever been the victim of a cyber attack?"},"gouv/9.7.1":{"titre":"Have you put in place, documented and tested at least annually a security incident handling procedure that assures you of reacting quickly and involving the right people, internal or external?"},"gouv/9.8":{"titre":"Have you ever carried out a cyber risk assessment of your company?"},"gouv/9.8.1":{"titre":"Do you review your company''s cyber risk level each year by revisiting its risk assessments?"},"gouv/9.8.2":{"titre":"Do you have a software solution for risk management that reports the cyber risk level, more or less automatically, and supports its treatment?"},"gouv/9.9":{"titre":"Do you hold an insurance policy covering IT risk (equipment and cyber attack)?"},"ext/Ext1":{"titre":"Do you export cyber security logs outside the environment that generates them, so as to guarantee their integrity?"},"ext/Ext10":{"titre":"Mapping: are the physical devices, the software platforms and the systems within the organisation inventoried and categorised? Do you have a map of all the product''s interfaces with other systems, and does it include every protocol used and the flow matrix?"},"ext/Ext11":{"titre":"When you have requested remote access to a customer''s information system for your employees, do you systematically tell that customer when the access must be revoked (after an employee leaves, for instance)?"},"ext/Ext12":{"titre":"Do you apply a security hardening policy to the configuration of your workstations and servers?"},"ext/Ext13":{"titre":"Does the anti-virus automatically scan the servers, the workstations and the USB sticks connected to the production test benches?"},"ext/Ext14":{"titre":"Do you disable automatic execution (autorun) for newly connected devices on PCs, laptops and servers?"},"ext/Ext15":{"titre":"Do you have a policy for updating the anti-virus signature databases and engines at least daily across the standard estate, with exceptions managed for specific equipment?"},"ext/Ext16":{"titre":"Do you have a central management console for the update mechanisms of the protection against malicious code execution across the estate?"},"ext/Ext17":{"titre":"Do you test the effectiveness of the anti-malware protection?"},"ext/Ext18":{"titre":"Do you apply security controls matched to the classification level of the data handled on each medium (laptop, USB, email)?"},"ext/Ext19":{"titre":"Is there a procedure to create, change and remove the access of the users and administrators involved in the production environments?"},"ext/Ext2":{"titre":"Do you enable log generation and recording on your IT equipment?"},"ext/Ext20":{"titre":"Do you systematically set an expiry date when creating accounts for interns or external contractors in the production environments?"},"ext/Ext21":{"titre":"Do you create named accounts for each employee of a contractor company?"},"ext/Ext22":{"titre":"Do you update your systems in line with the vendors'' recommendations (updates, configuration)?"},"ext/Ext23":{"titre":"Have you put in place a vulnerability management process for your services (identification, classification, prioritisation, remediation and mitigation)?"},"ext/Ext24":{"titre":"Do you follow decommissioning processes (certificate of destruction, complete erasure of files) before assets are disposed of (workstations, servers)?"},"ext/Ext25":{"titre":"Are the media awaiting destruction stored in an environment with restricted and controlled access?"},"ext/Ext26":{"titre":"Are the backup systems checked regularly to confirm that they work correctly?"},"ext/Ext27":{"titre":"Do you run crisis management training and simulation exercises?"},"ext/Ext28":{"titre":"Do you hold an insurance policy against the consequences of an incident: physical damage, IT damage, cyber damage, business interruption?"},"ext/Ext29":{"titre":"Is your organisation certified in cyber security? Please provide the certificate and the details of the certification scope."},"ext/Ext3":{"titre":"Do you use a secure exchange platform with your customers for sensitive information?"},"ext/Ext30":{"titre":"Do you have a typical functional diagram showing the cycle of exchanges (physical and digital) and the production flows between you and your customers for making a product, including internal exchanges and customer deliveries on removable media?"},"ext/Ext31":{"titre":"In the industrial environment, do you take account of the sensitivity of the information exchanged with your customers?"},"ext/Ext32":{"titre":"Is a project security management plan drawn up, implemented, delivered and communicated to your customers, so that every interested party understands the project''s expectations and their own roles and responsibilities? Does that plan name the point of contact accountable for cyber security activities during the project?"},"ext/Ext33":{"titre":"Do you have an incident handling process — covering personal data breaches — that provides for notifying customers when an incident affects the product or the services supplied to them?"},"ext/Ext34":{"titre":"Do you identify where the data and assets processed or operated under the contract are located, including your customers'' personal data where relevant, especially when it is held in shared cloud spaces (backup and disaster recovery locations included)? If so, please explain how you proceed, and list the countries where the data is located."},"ext/Ext35":{"titre":"Do you handle the information and data supplied by your customers, or produced under the contract, in line with the latest version of their information protection directive?"},"ext/Ext36":{"titre":"Do you use cloud environments to produce or process your customers'' data? If so, do you separate the data by customer, at least logically, across every environment (production, backup)?"},"ext/Ext37":{"titre":"Have you identified the maximum tolerable outage of your production line against your customer contracts?"},"ext/Ext38":{"titre":"Is access to the various development environments granted on the least privilege principle — not giving every user access to every environment, but using user groups tied to specific equipment?"},"ext/Ext39":{"titre":"Do you have a policy for default log generation in the products delivered to customers, recording the product''s main actions?"},"ext/Ext4":{"titre":"Do you use only the Internet access points defined within the company?"},"ext/Ext40":{"titre":"Can you list the physical production sites involved in the services supplied to your customers? Do you have an up-to-date diagram of the network interconnections between you and them (IP mapping, servers and addressing)?"},"ext/Ext41":{"titre":"Are the suppliers and third-party partners of information systems, components and services identified, prioritised and assessed through a supply chain risk assessment process?"},"ext/Ext42":{"titre":"Is a cyber security point of contact identified for the production facilities?"},"ext/Ext43":{"titre":"Have you formalised the security rules to apply in the production environments, and trained the staff concerned?"},"ext/Ext44":{"titre":"Are the workstations in the production environment updated regularly?"},"ext/Ext45":{"titre":"Do you update the spare workstations held in stock before putting them back into service?"},"ext/Ext46":{"titre":"Do you have technical means or processes to trace who performed an action in the production environments (authentication logs, correlation between the shift roster and the accounts used)?"},"ext/Ext47":{"titre":"Are the system and anti-virus logs enabled in the production environments?"},"ext/Ext48":{"titre":"Have you defined controls governing the use of privileged accounts (creation, change, removal, and specific rules for generic accounts)? If so, please give details."},"ext/Ext49":{"titre":"Where shared accounts are used in the production environments, do you have security controls beyond the password to log in (physical access control to the room holding the production workstations, or software such as a transparent screen lock)?"},"ext/Ext5":{"titre":"Do you have a business continuity plan describing the processes and technologies in place to restore critical servers, network equipment, laptops and desktops after an incident?"},"ext/Ext50":{"titre":"Do you carry out at least two update campaigns a year on the production equipment?"},"ext/Ext51":{"titre":"Do you change the default passwords and account names in your customers'' production environments?"},"ext/Ext52":{"titre":"Do you have a means of detecting foreign or unauthorised connections to the servers used by your industrial systems, so as to qualify them and block them where needed?"},"ext/Ext53":{"titre":"Is the production Wi-Fi network dedicated and isolated from the other Wi-Fi networks?"},"ext/Ext54":{"titre":"Do you disable Wi-Fi and wireless connections by default on your equipment (industrial production test benches)?"},"ext/Ext55":{"titre":"Do you provide media scanning kiosks, open to all users, to confirm that the removable media used for your customers'' production carry nothing harmful?"},"ext/Ext56":{"titre":"Do you apply specific restrictions or controls governing the use of removable devices in the production environments?"},"ext/Ext57":{"titre":"Is one of the anti-virus engines used on the media scanning kiosks different from the one used on the workstations?"},"ext/Ext58":{"titre":"Do you have security controls that govern and secure BYOD use in your customers'' production environments (network connection, anti-malware protection)?"},"ext/Ext59":{"titre":"Do you have a crisis and incident handling process for incidents in your customers'' production, shared with those customers (alerting the customer''s security manager)?"},"ext/Ext6":{"titre":"Are your crisis management, business continuity and disaster recovery plans designed to include your contractors and suppliers?"},"ext/Ext60":{"titre":"Do your external contractors and suppliers sign the acceptable use and cyber security good practice policy for the industrial automation and control systems (IACS)? Do you archive those signed documents?"},"ext/Ext61":{"titre":"Have you ever carried out a cyber risk assessment of your production information systems?"},"ext/Ext62":{"titre":"Do you update the risks affecting your production information systems at least annually?"},"ext/Ext63":{"titre":"Are the findings of the risk assessment taken into account in the company''s business continuity plan?"},"ext/Ext64":{"titre":"Where the backups are held in a storage room, is physical access to it regulated?"},"ext/Ext65":{"titre":"Do you have an IT disaster recovery plan for the production environments, including the production machines and test benches?"},"ext/Ext66":{"titre":"Is access to the archives restricted or physically protected (keys, badges)?"},"ext/Ext67":{"titre":"Does your backup policy cover the data and the products supplied to your customers?"},"ext/Ext68":{"titre":"Can you identify the server rooms used under the contract for each of your customers?"},"ext/Ext69":{"titre":"Do you hold the details of the customer contacts to alert on a security incident, and have you given your customers your own contacts so that they can be reached when they raise an alert?"},"ext/Ext7":{"titre":"Has your organisation put in place a body of directives, processes, procedures and instructions based on a cyber security good practice baseline or standard (ISO 27001/27002, NIST, IEC 62443, CMMC)? If so, which framework do you use?"},"ext/Ext70":{"titre":"Do you audit your supply chain regularly where it is connected to your information system, or where equipment and devices are routinely exchanged (compliance audit or technical audit)? If so, please state the frequency."},"ext/Ext71":{"titre":"Do you pass your customers'' security requirements down contractually to your suppliers and third-party partners, so that they implement the appropriate controls to meet the project objectives?"},"ext/Ext72":{"titre":"Do you back up the configurations regularly, so that the environments can be restored after a security incident?"},"ext/Ext73":{"titre":"Do you have a secure coding good practice baseline for each language your developers use?"},"ext/Ext74":{"titre":"Are developers systematically trained in secure development good practice, based on a recognised baseline?"},"ext/Ext75":{"titre":"At the start of each project, do you have a process to identify and approve the software versions and libraries to be used, confirming that they carry no known vulnerabilities, so as to secure both the product and the development environment?"},"ext/Ext76":{"titre":"During development, do you keep control of the development environments by actively watching for vulnerabilities in the software versions installed (operating systems, libraries)?"},"ext/Ext77":{"titre":"At the start of each project, do you have a process to identify and approve the firmware versions and the hardware COTS components to be used, confirming that they carry no known vulnerabilities, so as to secure both the product and the development environment?"},"ext/Ext78":{"titre":"Do you have hardening principles that reduce the attack surface?"},"ext/Ext79":{"titre":"Before each project starts, do you have a process for hardening the development environments, for example disabling the functions, ports, protocols and components that are not used?"},"ext/Ext8":{"titre":"Is the business continuity plan reviewed and tested regularly?"},"ext/Ext80":{"titre":"If you store your development code in public collaborative spaces (GitHub, cloud services), do you have a code storage policy that identifies, for instance, the cases in which the practice is not allowed?"},"ext/Ext81":{"titre":"To confirm that secure code and design rules have been implemented, is a code audit systematically carried out, at least at the end of a product''s development, and are the corrective actions applied before the product is delivered?"},"ext/Ext82":{"titre":"To confirm that secure code and design rules have been implemented, are security tests carried out at least before delivery, or throughout the product development cycle?"},"ext/Ext83":{"titre":"Do you have tools that check the security of the code (static analysis, dynamic analysis, or analysis of third-party components)?"},"ext/Ext84":{"titre":"Do you run a penetration test on the products you develop before delivering them to your customers?"},"ext/Ext85":{"titre":"Do you have a security by design policy that systematically reviews whether a risk assessment applies to the products and services before they are delivered to customers, so as to identify the risks and the controls that treat them, and do you tell your customers this has been done before delivery?"},"ext/Ext86":{"titre":"Do you check that the deliveries, whether initial or updates, are free of malware and vulnerabilities?"},"ext/Ext87":{"titre":"If a product is suspected of having been tampered with, do you have the means to investigate and establish it?"},"ext/Ext88":{"titre":"Do you run anti-virus or anti-malware scans on the environments where the software code is stored, to confirm that no malicious code is present?"},"ext/Ext89":{"titre":"During delivery, do you have the means (such as a hash function or a signature) to guarantee the integrity and the authenticity of the software that makes up the solution developed?"},"ext/Ext9":{"titre":"Do you identify the types of data you handle so as to treat them accordingly: personal data, data regulated by country, export-controlled data, sensitive data, other types of data (please specify)?"},"ext/Ext90":{"titre":"Before delivery, do you inspect and disinfect the storage media and the equipment before use, to confirm that they hold no malicious code? Once the inspection is done, do you keep the media and equipment in a secured store?"},"ext/Ext91":{"titre":"Once in service, are changes within the product approved in line with the defined project security plan before they are implemented?"},"ext/Ext92":{"titre":"Do you have security capabilities to protect your customers'' development environments, for example defence-in-depth equipment (IDS, IPS), central access rights management (PAM, privileged access management) and monitoring facilities (NOC, SOC)?"},"ext/Ext93":{"titre":"Does your development process include the cyber security activities needed to obtain a security certification for the products and services where that is required? Please detail the certifications this development process can achieve."},"ext/Ext94":{"titre":"Where the product or service processes your customers'' personal data, do you make sure you comply with the GDPR (data location, data retention, and mechanisms for access, rectification and erasure)?"}}}'::jsonb)
on conflict (id) do nothing;

-- =====================================================================================
-- §10 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ **CE QU'IL NE PEUT PAS FAIRE, ET QUI EST DIT ICI PLUTÔT QUE PASSÉ SOUS SILENCE.**
--
-- Le critère du lot demande que *« un essai compare le catalogue migré au catalogue
-- source, exigence par exigence »*. Ce garde-fou ne le fait PAS : une fonction PL/pgSQL
-- ne lit aucun fichier, et le §41 du `CONVENTIONS.md` lui interdit de toute façon de lire
-- une ligne d'une table cloisonnée. La comparaison octet par octet vit donc au banc —
-- `test/catalogues/fidelite.test.mjs` — et c'est **écrit ici** pour qu'un lecteur ne
-- prenne pas le vert de ce garde pour la preuve qu'il n'apporte pas.
--
-- Ce que ce garde mesure, lui, c'est ce qu'une migration future pourrait casser sans
-- toucher aux fichiers source :
--
--   1. les quatre tables existent, et la dérivation de l'ancienneté avec ;
--   2. **l'invariant de `(ref_id, code)`** — l'unicité porte le RÉFÉRENTIEL, et la clé
--      des exigences est COMPOSITE : sans elle, deux exigences de même code sous deux
--      domaines d'un même référentiel rendraient le couple AMBIGU, et une réponse
--      d'audit désignerait deux questions à la fois ;
--   3. **`evaluations.ref_id` n'a PAS de clé étrangère** — le contrôle est POSITIF sur
--      une absence, ce qui est rare et délibéré : le jour où quelqu'un « réparera » ce
--      qu'il prendra pour un oubli, la reprise d'une sauvegarde portant des évaluations
--      d'un catalogue archivé cesserait de fonctionner, et le refus arriverait en 23503
--      sans nommer sa cause ;
--   4. la dérivation de l'ancienneté est **ÉPROUVÉE** sur cinq cas témoins (§39.1), dont
--      celui qui compte : *une date inconnue n'est JAMAIS « à jour »*.
-- =====================================================================================

create or replace function f_verifier_catalogues()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_table text;
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('t','referentiel_domaines','n','uq_referentiel_domaines_id_referentiel',
            'e','la cible de la clé COMPOSITE des exigences disparaît, et une exigence '
                'peut alors déclarer un référentiel autre que celui de son domaine — son '
                'code se retrouve compté sous le mauvais référentiel, c''est-à-dire '
                'rattaché aux auto-évaluations d''un autre'),
        jsonb_build_object('t','referentiel_exigences','n','fk_referentiel_exigences_domaine',
            'e','le rattachement d''une exigence à son domaine n''est plus vérifié'),
        jsonb_build_object('t','referentiel_exigences','n','ck_referentiel_exigences_code',
            'e','un code VIDE devient écrivable — et le code est la moitié droite de la '
                'clé par laquelle toute auto-évaluation est stockée'),
        jsonb_build_object('t','referentiel_exigences','n','ck_referentiel_exigences_niveau',
            'e','le vocabulaire du niveau de label AirCyber n''est plus clos : une '
                'exigence hors vocabulaire n''est proposée par aucun bouton, et disparaît '
                'du panneau « préparation au label » SANS un message'),
        jsonb_build_object('t','referentiel_exigences','n','ck_referentiel_exigences_priorite',
            'e','même effet sur la priorité'),
        jsonb_build_object('t','referentiels','n','ck_referentiels_scoring',
            'e','le mode de comptage n''est plus clos : un troisième mode ferait diverger '
                'le score affiché sur la fiche de celui du tableau de bord'),
        jsonb_build_object('t','referentiels','n','ck_referentiels_archive',
            'e','un catalogue archivé sans date, ou daté sans être archivé, devient '
                'écrivable — et l''action 26.3 perd la trace du passage d''une version à '
                'l''autre, qui est tout ce qu''elle promet'),
        jsonb_build_object('t','referentiels_actifs','n','fk_referentiels_actifs_referentiel',
            'e','une filiale peut activer un référentiel qui n''existe pas : l''écran ne '
                'le propose pas, la couverture le compte pour rien, et la ligne reste '
                'invisible — le constat Q-150 sous une autre forme'),
        jsonb_build_object('t','referentiel_traductions','n','ck_referentiel_traductions_langue',
            'e','le français redevient admis comme dictionnaire — donc une SECONDE source '
                'du texte français, qui divergera du catalogue (constat Q-219)')
    );
    v_piece jsonb;
    -- Les cas témoins de la dérivation de l'ancienneté.
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('p', null, 'd', 60, 'attendu', 'date_inconnue',
            'effet', 'UN CATALOGUE SANS DATE PASSERAIT POUR À JOUR. C''est le signal '
                     'faux dans le sens rassurant — celui qu''on ne va pas vérifier'),
        jsonb_build_object('p', null, 'd', null, 'attendu', 'date_inconnue',
            'effet', 'idem : l''absence de date prime sur l''absence de surveillance, '
                     'parce qu''elle est la plus grave des deux'),
        jsonb_build_object('p', '2017-01-01', 'd', null, 'attendu', 'non_surveille',
            'effet', 'un catalogue sans durée d''alerte serait annoncé « à vérifier » ou '
                     '« à jour » alors que personne n''a dit au bout de combien de temps'),
        jsonb_build_object('p', '2017-01-01', 'd', 60, 'attendu', 'a_verifier',
            'effet', 'LE SIGNAL D''ANCIENNETÉ NE SE DÉCLENCHERAIT JAMAIS. Le guide '
                     'd''hygiène de l''ANSSI date de 2017 : c''est le cas nominal du parc'),
        jsonb_build_object('p', '2022-02-15', 'd', 600, 'attendu', 'a_jour',
            'effet', 'tout serait annoncé « à vérifier », et l''alerte deviendrait un '
                     'bruit de fond que personne ne lit')
    );
    v_un      jsonb;
    v_rendu   text;
begin
    -- ── 1. LES QUATRE TABLES ──────────────────────────────────────────────────────
    foreach v_table in array array['referentiels', 'referentiel_domaines',
                                   'referentiel_exigences', 'referentiel_traductions']
    loop
        if to_regclass('public.' || v_table) is null then
            objet    := v_table;
            anomalie := 'table_catalogue_absente';
            detail   := format('La table « %s » du lot L26 a disparu : les référentiels '
                               'ne sont plus servis, et aucun écran de conformité ne '
                               'fonctionne.', v_table);
            return next;
            return;
        end if;
        -- Le domaine `type_entite` doit les admettre, sans quoi elles sont INCRÉABLES
        -- (`CONVENTIONS.md` §40.1). ⚠️ On ÉPROUVE le domaine, on ne lit pas son texte.
        begin
            perform v_table::type_entite;
        exception when others then
            objet    := v_table;
            anomalie := 'catalogue_entite_non_designable';
            detail   := format(
                'Le domaine « type_entite » n''admet pas « %s » : la table est INCRÉABLE, '
                'parce que toute création écrit au journal et que journal_audit.entite_type '
                'porte ce domaine. Le refus arrive à l''utilisateur en 400 « Une valeur de '
                'l''enregistrement n''est pas admise », qui ne désigne rien.', v_table);
            return next;
        end;
    end loop;

    -- ── 2. ⚠️ L'UNICITÉ PORTE LE RÉFÉRENTIEL, PAS LE DOMAINE ──────────────────────
    --
    -- C'est l'invariant dont dépend `evaluations(ref_id, code)`. Mesuré dans le
    -- CATALOGUE — les colonnes réelles de l'index —, jamais dans son nom : un index qui
    -- porterait le bon nom sur les mauvaises colonnes passerait tout contrôle textuel.
    if not exists (
        select 1
          from pg_index i
          join pg_class c on c.oid = i.indexrelid
         where i.indrelid = to_regclass('public.referentiel_exigences')
           and c.relname = 'uq_referentiel_exigences_code'
           and i.indisunique
           and (select array_agg(a.attname order by a.attname)
                  from unnest(i.indkey) as k(attnum)
                  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum)::text[]
               = array['code', 'filiale_id', 'referentiel_id'])
    then
        objet    := 'referentiel_exigences.uq_referentiel_exigences_code';
        anomalie := 'unicite_code_deplacee';
        detail   := 'L''unicité des codes d''exigence ne porte plus (filiale_id, '
                    'referentiel_id, code). C''est l''invariant dont dépend le stockage '
                    'des auto-évaluations : « evaluations » enregistre par (ref_id, code), '
                    'et deux exigences de même code sous deux domaines d''un MÊME '
                    'référentiel rendraient ce couple ambigu — une réponse d''audit '
                    'désignerait deux questions à la fois. Mesuré sur les six catalogues '
                    'livrés : 424 exigences, 424 codes distincts par référentiel.';
        return next;
    end if;

    -- ── 3. ⚠️ UN CONTRÔLE POSITIF SUR UNE ABSENCE ─────────────────────────────────
    if exists (
        select 1 from pg_constraint
         where conrelid = to_regclass('public.evaluations')
           and contype = 'f'
           and confrelid = to_regclass('public.referentiels'))
    then
        objet    := 'evaluations.ref_id';
        anomalie := 'cle_etrangere_sur_evaluations';
        detail   := 'Une clé étrangère a été posée de « evaluations » vers « referentiels ». '
                    'Elle a l''air d''une réparation ; elle casse deux choses. (1) '
                    'L''action 26.3 : une auto-évaluation doit survivre à l''ARCHIVAGE du '
                    'catalogue qui l''a produite — les réponses de 2022 restent attachées '
                    'au catalogue de 2022, qui est la vérité. (2) La reprise : un fichier '
                    'de sauvegarde portant des évaluations d''un catalogue retiré depuis '
                    'serait refusé en 23503, et le message ne nommerait pas la cause. '
                    'C''est la classe des trois conflits de la migration 041 et des '
                    'constats Q-194 / Q-284 — restaurer une sauvegarde gagne.';
        return next;
    end if;

    -- ── 4. LES PIÈCES NOMMÉES, UNE PAR UNE (§39.7) ────────────────────────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if not exists (select 1 from pg_constraint
                        where conrelid = to_regclass('public.' || (v_piece ->> 't'))
                          and conname = v_piece ->> 'n')
        then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'piece_catalogue_absente';
            detail   := format('La contrainte « %s » a disparu. Ce que cela produit : %s.',
                               v_piece ->> 'n', v_piece ->> 'e');
            return next;
        end if;
    end loop;

    -- ── 5. LA DÉRIVATION DE L'ANCIENNETÉ EST ÉPROUVÉE (§39.1) ─────────────────────
    if to_regprocedure('public.f_referentiel_age(date, integer)') is null then
        objet    := 'f_referentiel_age';
        anomalie := 'derivation_age_absente';
        detail   := 'La dérivation de l''ancienneté d''un catalogue a disparu (action '
                    '26.5) : le produit cesse de signaler qu''une norme a vieilli, et il '
                    'le cesse EN SILENCE.';
        return next;
        return;
    end if;

    for v_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := f_referentiel_age((v_un ->> 'p')::date, (v_un ->> 'd')::integer);
        if v_rendu is distinct from (v_un ->> 'attendu') then
            objet    := 'f_referentiel_age';
            anomalie := 'derivation_age_fausse';
            detail   := format(
                'Publié le « %s », alerte à « %s » mois : la fonction rend « %s » au lieu '
                'de « %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE la dérivation '
                'sur des valeurs témoins — il ne lit pas le texte de la fonction (§39.1).',
                coalesce(v_un ->> 'p', '(null)'), coalesce(v_un ->> 'd', '(null)'),
                coalesce(v_rendu, '(null)'), v_un ->> 'attendu', v_un ->> 'effet');
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_catalogues() is
    'Garde-fou des catalogues en base (lot L26, actions 26.1, 26.3 et 26.5). Il mesure '
    'l''invariant dont dépend le stockage des auto-évaluations — l''unicité des codes '
    'porte le RÉFÉRENTIEL et non le domaine, relevée sur les COLONNES de l''index et non '
    'sur son nom —, il vérifie POSITIVEMENT que « evaluations.ref_id » n''a toujours PAS '
    'de clé étrangère (une « réparation » y casserait la reprise d''une sauvegarde et '
    'l''archivage d''une version), il nomme neuf pièces une par une (§39.7), et il '
    'ÉPROUVE la dérivation de l''ancienneté sur cinq cas témoins (§39.1). ⚠️ Ce qu''il '
    'ne fait PAS, et qui est écrit dans son corps : la comparaison OCTET PAR OCTET du '
    'catalogue migré aux fichiers source, qui vit au banc — une fonction PL/pgSQL ne lit '
    'aucun fichier. Découvert par f_decouvrir_controles_schema().';

-- =====================================================================================
-- §11 — CONSIGNATION
-- =====================================================================================

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('051', 'Les catalogues de référentiels entrent en base (lot L26, actions 26.1 et '
               '26.5) : six catalogues, 40 domaines, 424 exigences et six dictionnaires '
               'de traduction, ENGENDRÉS depuis les fichiers source pour que les codes '
               'soient conservés à l''octet près — ils sont la moitié droite de la clé '
               'par laquelle toute auto-évaluation est stockée')
on conflict (version) do nothing;

commit;
