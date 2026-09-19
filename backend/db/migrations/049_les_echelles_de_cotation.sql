-- =====================================================================================
--  049 — LES ÉCHELLES DE COTATION : versionnées, datées, et PORTÉES PAR LA COTATION
--
--  §0   Le périmètre de la migration
--  §0 bis  Une quatrième provenance : « socle »
--  §1   Les échelles — MIXTE, et figées dès l'entrée en vigueur
--  §2   Les niveaux d'une échelle
--  §2 bis  Ce que toute table métier doit à trois garde-fous déjà posés
--  §3   Ce que les cotations portent — six colonnes sur cinq tables
--  §4   La DÉCLARATION des porteurs — lue par le garde-fou ET par le serveur
--  §5   Le déclencheur : une cotation appartient à l'échelle qu'elle nomme
--  §6   Une échelle en vigueur ne se modifie plus — elle se remplace
--  §7   Le socle du Groupe — quatre échelles, semées PUIS vérifiées
--  §8   `type_entite`
--  §9   Cloisonnement
--  §10  Le garde-fou
--  §11  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE — action 25.3 du `docs/PLAN_PRODUIT.md`
--
--  Le critère d'acceptation tient en une phrase, et elle dit le défaut avant le remède :
--
--    *« Une échelle modifiée après coup rend les cotations existantes incomparables : le
--      changement est versionné et daté, et les cotations portent l'échelle qui les a
--      produites. »*
--
--  Aujourd'hui, l'échelle n'existe nulle part. Le produit propose quatre niveaux — dans
--  `js/modules/risques.js`, dans `js/modules/ebios.js` — et le schéma borne 1 à 10 pour
--  absorber la reprise d'un export produit ailleurs. Entre les deux, **rien** : aucune
--  ligne du dépôt ne dit ce que « 3 » veut dire, ni qui l'a décidé, ni depuis quand.
--
--  La conséquence n'est pas théorique. Le jour où une filiale décide que sa gravité va
--  de 1 à 5, ou que son niveau 3 cesse de s'appeler « Grave » pour s'appeler « Majeure »,
--  **les cotations d'hier et celles de demain se rangent dans la même colonne** et le
--  tableau de bord les additionne. Personne ne le voit : la donnée est du même type, dans
--  la même borne, sous le même nom.
--
--  ── ⚠️ LE CONFLIT AVEC LE `PLAN_SERVEUR` §2.2, ET COMMENT IL SE TRANCHE ───────────
--
--  Le `PLAN_SERVEUR` §2.2 — cadrage clos avec le client — range « échelle de cotation des
--  risques » au niveau **Groupe**, avec ce motif : *« sans quoi les risques ne
--  s'additionnent pas »*. Le `PLAN_PRODUIT` 25.3 dit « échelles configurables **par
--  filiale** ». Les deux documents font autorité, et ils ne disent pas la même chose.
--
--  Ils ne se contredisent que si l'on lit le §2.2 comme un INTERDIT. Il n'en est pas un :
--  c'est l'énoncé d'une conséquence — *sans échelle commune, l'addition est fausse*. Le
--  remède n'est donc pas d'interdire à une filiale d'avoir la sienne : c'est de rendre
--  l'échelle **explicite et portée par chaque cotation**, pour que la consolidation
--  puisse REFUSER d'additionner ce qui n'est pas comparable, au lieu de l'additionner en
--  silence.
--
--  D'où le patron retenu, qui est celui de `parametres` (migration `048`) et de
--  `mesure_catalogue` : **socle du Groupe, surcharge par filiale, et la surcharge se
--  VOIT**. Une filiale qui ne décide rien cote sur l'échelle du Groupe — le cas nominal,
--  et celui de toutes les filiales au jour de la livraison.
--
--  ── ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS, ET C'EST LE CŒUR ───────────────────────
--
--  **Elle ne réinterprète AUCUNE cotation existante.** C'est le critère 25.1 reconduit,
--  et c'est le motif du constat **Q-192** : renuméroter des évaluations produites en
--  audit les réattribue **en silence**, dans l'outil qui sert de preuve.
--
--  Concrètement : les six colonnes du §3 sont **nullables**, et `null` ne veut pas dire
--  « échelle du Groupe ». Il veut dire **« échelle non tracée »**, et c'est ce que l'écran
--  affiche. Une cotation saisie avant cette migration a été produite sous une échelle que
--  personne n'a écrite ; lui attribuer d'office celle d'aujourd'hui serait inventer un
--  fait. *Un chiffre qui a l'air mesuré sans l'être est pire que pas de chiffre* — le
--  critère 25.4, qui vaut ici mot pour mot.
--
--  ⚠️ **Et c'est pour cela qu'aucun déclencheur ne REMPLIT ces colonnes.** La pente
--  naturelle — un `before insert` qui pose l'échelle en vigueur quand le client n'en donne
--  pas — a été écrite, puis retirée : un déclencheur ne distingue pas « le client n'a rien
--  dit » de « le client a dit : pas d'échelle », et la reprise d'un export d'avant la
--  `049` serait repartie en base **estampillée de l'échelle du jour**. Le marquage vit
--  donc dans la couche qui, elle, connaît la différence : `src/entites/`, qui sait quels
--  champs la requête a nommés.
--
--  ── LES QUATRE SUJETS, ET POURQUOI PAS UN CINQUIÈME ───────────────────────────────
--
--  Une échelle porte un **sujet** : ce qu'elle gradue. Il y en a quatre, découverts en
--  balayant les colonnes de cotation du schéma plutôt qu'imaginés :
--
--    · `vraisemblance`              — `risques.f_frequence`, et la vraisemblance d'un
--                                     scénario opérationnel (atelier 4) ;
--    · `gravite`                    — `risques.g_gravite`, et la gravité d'un événement
--                                     redouté (atelier 1) ;
--    · `criteres_source`            — les trois critères d'un couple source / objectif ;
--    · `criteres_partie_prenante`   — les quatre critères d'une partie prenante.
--
--  ⚠️ **`risques.m_maitrise` n'en est PAS, et l'absence est une décision.** Ce n'est pas
--  un niveau choisi dans une liste : c'est un **coefficient** entre 0 et 1 qui multiplie
--  le score brut (`ck_risques_m`). Lui donner une échelle à niveaux nommés inviterait à
--  le moyenner avec une gravité, qui n'a pas la même nature — c'est l'arbitrage rendu mot
--  pour mot à `mesure_controle.efficacite` par la migration `037`.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 049_les_echelles_de_cotation.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- -------------------------------------------------------------------------------------
-- Le §3 ajoute six colonnes et leurs clés étrangères, ce qui les VALIDE contre les lignes
-- existantes ; le §7 écrit des lignes de portée Groupe, que la politique d'ajout réserve
-- à l'administration Groupe. Sans périmètre, la première échouerait sans nommer sa cause
-- et la seconde serait refusée. Règle du `CONVENTIONS.md` §42 : on déclare le groupe
-- ENTIER, jamais une filiale.
-- =====================================================================================

do $$
begin
    perform set_config('grc.utilisateur', 'migration-049', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
    perform set_config('grc.administration_groupe', 'oui', true);
end;
$$;

-- =====================================================================================
-- §0 bis — UNE QUATRIÈME PROVENANCE : « socle »
-- -------------------------------------------------------------------------------------
-- ⚠️ **Ce paragraphe est né d'un ÉCHEC DU BANC, et la leçon dépasse ce lot.** Le §7
-- sème quatre échelles du Groupe et leurs seize niveaux ; le jeu de découverte a aussitôt
-- refusé de se charger :
--
--     409 — « La base porte déjà 20 ligne(s) qui ne viennent pas du jeu de découverte. »
--
-- Le contrôle est juste : il refuse de mêler de la démonstration à des données réelles.
-- Ce qui était faux, c'est la marque portée par ces vingt lignes. Le domaine
-- `provenance_ligne` de la migration `032` n'en admettait que trois — `saisie`,
-- `decouverte`, `reprise` —, et une échelle livrée par une migration n'est **aucune des
-- trois** :
--
--   · personne ne l'a **saisie** ;
--   · elle ne vient pas du **jeu de découverte** ;
--   · elle ne vient pas d'un **export repris**.
--
-- Le domaine était donc **incomplet**, et il l'était depuis le jour où le produit a
-- commencé à livrer des données de référence. Son commentaire fermait la liste sur un
-- motif qui tient toujours — *« `import` n'est pas une valeur : une ligne importée depuis
-- le classeur du client EST une donnée réelle »* — mais ce motif ne dit rien du socle que
-- le produit s'apporte à lui-même.
--
-- ⚠️ **Et ce n'est pas une commodité pour ce lot-ci** : le lot **L26** fera entrer les
-- cinq catalogues de référentiels en base, soit des milliers de lignes livrées par une
-- migration. Sans cette quatrième valeur, il buterait sur le même mur — et la réponse
-- courte (« retirer la colonne `provenance` de ces tables-là ») aurait rendu le contrôle
-- du jeu de découverte aveugle table après table, ce qui est corriger l'instance et non
-- la classe.
--
-- ⚠️ **Le semis du §7 n'écrit PAS la valeur** : il pose `grc.provenance = 'socle'` et
-- laisse `f_marquer_provenance()` la porter. La marque reste **inforgeable par
-- l'appelant** — condition constitutive n° 1 du jeu de découverte, et c'est elle qui
-- donne sa valeur au contrôle « cette base est-elle vierge ? ».
-- =====================================================================================

do $$
declare
    v_predicat text;
begin
    select pg_get_constraintdef(c.oid) into v_predicat
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'provenance_ligne'
       and c.conname = 'ck_provenance_ligne';

    if v_predicat is null then
        raise exception 'ck_provenance_ligne est introuvable : la 032 n''a pas été '
                        'appliquée, et cette migration n''a rien à étendre.';
    end if;
    if position('''socle''' in v_predicat) > 0 then
        raise notice 'provenance_ligne admet déjà « socle » : rejeu, rien à faire.';
        return;
    end if;
    -- Le modèle : la troisième valeur de la `032`. Son absence signifie que le texte a
    -- changé depuis, et la substitution à l'aveugle est refusée plutôt qu'appliquée de
    -- travers (motif du §4 de la `027`).
    if position('''reprise''' in v_predicat) = 0 then
        raise exception 'La valeur « reprise » est introuvable dans le prédicat appliqué '
                        'de ck_provenance_ligne : son texte a changé, et la substitution à '
                        'l''aveugle est refusée.';
    end if;

    execute 'alter domain provenance_ligne drop constraint ck_provenance_ligne';
    execute format(
        'alter domain provenance_ligne add constraint ck_provenance_ligne %s',
        replace(v_predicat, '''reprise''', '''reprise'', ''socle'''));
    raise notice 'provenance_ligne admet désormais « socle ».';
end;
$$;

comment on domain provenance_ligne is
    'D''où vient une ligne : saisie (quelqu''un l''a tapée), decouverte (jeu de découverte '
    'du lot L18 bis), reprise (recopiée d''un export grc-backup), socle (livrée par une '
    'migration — le produit se l''apporte à lui-même, personne ne l''a saisie). Condition '
    'constitutive n° 1 du jeu de découverte — arbitrage A2 du 08/09/2026. ⚠️ « socle » est '
    'ajoutée par la migration 049 : sans elle, le socle des échelles comptait pour des '
    'données RÉELLES et le jeu de découverte refusait de se charger sur une base neuve. '
    '⚠️ « import » n''est toujours PAS une valeur : une ligne importée du classeur du '
    'client EST une donnée réelle, et lui donner une marque à part inviterait à la traiter '
    'comme moins vraie.';

-- =====================================================================================
-- §1 — LES ÉCHELLES — MIXTE, ET FIGÉES DÈS L'ENTRÉE EN VIGUEUR
-- -------------------------------------------------------------------------------------
-- Table MIXTE, calquée sur `risque_catalogue` (`012`) et `ebios_connaissances` (`046`) :
-- `filiale_id` nul = socle du Groupe, renseigné = échelle propre à une filiale.
--
-- ── CE QUI FAIT LA VERSION, ET CE QUI N'EST PAS ELLE ──────────────────────────────
--
-- ⚠️ **La révision d'une échelle NE PEUT PAS s'appeler `version`.** Cette colonne existe
-- déjà sur toute table métier et porte le **verrouillage optimiste** (risque P1 du
-- `PLAN_SERVEUR`) : c'est elle que `js/core/sync.js` renvoie pour détecter qu'un autre a
-- écrit entre-temps. Deux sens sous un nom est le motif exact du bloquant du 6ᵉ passage
-- de la porte S2 — *un même mot, vrai à un endroit et faux à l'autre, voyage d'autant
-- mieux qu'on a pris soin de n'en avoir qu'un*. La révision s'appelle donc `revision`.
--
-- ── POURQUOI L'IMMUABILITÉ EST UNE PROPRIÉTÉ DE LA TABLE, PAS UNE CONSIGNE ────────
--
-- Une cotation pointe une échelle. Si l'échelle pointée pouvait changer, le pointeur
-- suivrait le changement et la promesse du critère — *« les cotations portent l'échelle
-- qui les a produites »* — serait **fausse sans que rien ne bouge à l'écran**. C'est
-- pourquoi une échelle `en_vigueur` ou `archivee` ne se modifie plus (§6) : on en crée
-- une **révision**, et l'ancienne reste lisible, rattachée à ce qu'elle a produit.
--
-- C'est le mécanisme de `mesure_catalogue` (§17.6 : *« il s'archive »*), transposé : on
-- ne détruit rien chez les filiales, et le Groupe peut faire évoluer son socle.
-- =====================================================================================

create table if not exists echelles (
    id            id_metier   not null default f_generer_id('ECHL'),
    -- Nul = socle du Groupe. Renseigné = échelle propre à une filiale. Domaine
    -- `id_metier` et non `text` nu : constat **Q-310**, qui était **Q-194** rejoué sur la
    -- table que la même migration venait de créer.
    filiale_id    id_metier,

    -- Ce que l'échelle gradue. Vocabulaire FERMÉ : une échelle dont le sujet ne
    -- correspond à aucun porteur du §4 ne serait proposée par aucun écran, et le garde-fou
    -- du §10 la déclarerait orpheline.
    sujet         text        not null,
    nom           text        not null,
    -- ⚠️ La RÉVISION de l'échelle, et non le verrouillage optimiste : voir l'en-tête.
    revision      integer     not null default 1,
    statut        text        not null default 'brouillon',
    -- La révision que celle-ci remplace. Clé SIMPLE et non composite : la cible est
    -- MIXTE, et une clé composite depuis une ligne de filiale rendrait le socle du Groupe
    -- inatteignable (même arbitrage qu'à `ebios_sources_risque.connaissance_id`).
    remplace_id   id_metier,
    description   text,

    en_vigueur_le date,
    archivee_le   date,

    version       integer     not null default 1,
    cree_le       timestamptz not null default now(),
    cree_par      text        not null default f_utilisateur_courant(),
    modifie_le    timestamptz,
    modifie_par   text,

    constraint pk_echelles primary key (id),
    constraint fk_echelles_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    constraint fk_echelles_remplace foreign key (remplace_id)
        references echelles (id) on delete restrict,

    constraint ck_echelles_sujet check (sujet in (
        'vraisemblance', 'gravite', 'criteres_source', 'criteres_partie_prenante')),
    constraint ck_echelles_nom      check (nom <> ''),
    constraint ck_echelles_revision check (revision >= 1),
    constraint ck_echelles_statut   check (statut in ('brouillon', 'en_vigueur', 'archivee')),
    -- Une échelle qui n'est plus un brouillon a NÉCESSAIREMENT une date d'entrée en
    -- vigueur : c'est la moitié « datée » du critère 25.3, et elle ne se laisse pas à
    -- l'écran. L'égalité stricte pour l'archivage interdit les deux incohérences d'un
    -- coup — un archivé sans date, une date sans archivage (motif de `risque_catalogue`).
    constraint ck_echelles_en_vigueur check (statut = 'brouillon' or en_vigueur_le is not null),
    constraint ck_echelles_brouillon  check (statut <> 'brouillon' or en_vigueur_le is null),
    constraint ck_echelles_archive    check ((statut = 'archivee') = (archivee_le is not null)),
    constraint ck_echelles_dates      check (archivee_le is null or archivee_le >= en_vigueur_le),
    -- Une révision ne se remplace pas elle-même : le cycle serait invisible à l'écran,
    -- qui remonte la chaîne pour montrer l'historique d'une échelle.
    constraint ck_echelles_remplace_soi check (remplace_id is null or remplace_id <> id),

    -- Bornes de saisie — contrôle S13.
    constraint ck_echelles_longueurs check (
        length(nom) <= 120
        and (description is null or length(description) <= 2000))
);

-- ⚠️ **`nulls not distinct`, ET C'EST LA PIÈCE MAÎTRESSE DE CES DEUX INDEX.** Une unicité
-- ordinaire traite deux NULL comme distincts : `unique (filiale_id, sujet, revision)`
-- laisserait le socle du Groupe — dont le `filiale_id` est nul **par construction** —
-- porter deux révisions 1 du même sujet, sans un mot. C'est le pendant, du côté des
-- unicités, du piège `MATCH SIMPLE` décrit au §2 : *le nul dispense du contrôle*, et il le
-- fait deux fois dans cette migration, sur deux mécanismes différents.
--
-- ⚠️ La réponse habituelle du dépôt est un index PARTIEL réservé au socle, plus une
-- dispense nommée dans `f_verifier_unicite_cloisonnee()` — c'est ce que fait
-- `uq_mesure_catalogue_reference_groupe`. Elle est **écartée ici** : elle demande deux
-- index par contrainte, et surtout une entrée de plus dans une liste de dispenses que
-- personne ne relit. `nulls not distinct` (PostgreSQL 15 et au-delà ; la base est en 17)
-- dit la même chose en un mot, **et laisse `filiale_id` parmi les colonnes de clé** — donc
-- le garde-fou du cloisonnement continue de le voir, au lieu d'être dispensé de regarder.
create unique index if not exists uq_echelles_revision
    on echelles (filiale_id, sujet, revision) nulls not distinct;

-- ⚠️ **AU PLUS UNE ÉCHELLE EN VIGUEUR PAR PORTÉE ET PAR SUJET.** Sans cette unicité,
-- « l'échelle en vigueur » cesse d'être une expression définie : le serveur en choisirait
-- une, et laquelle dépendrait du plan d'exécution du jour. Une cotation serait estampillée
-- d'une révision, la suivante d'une autre, sans qu'aucun geste humain n'ait eu lieu.
create unique index if not exists uq_echelles_en_vigueur
    on echelles (filiale_id, sujet) nulls not distinct where statut = 'en_vigueur';

drop trigger if exists trg_echelles_maj on echelles;
create trigger trg_echelles_maj before update on echelles
    for each row execute function f_maj_tracabilite();

comment on table echelles is
    'Échelle de cotation versionnée (action 25.3). MIXTE : filiale_id nul = socle du '
    'Groupe, renseigné = échelle propre à une filiale — patron de « parametres » et de '
    '« mesure_catalogue ». ⚠️ Une échelle en vigueur ou archivée NE SE MODIFIE PLUS (§6) : '
    'une cotation la pointe, et un pointeur qui suit les retouches rendrait fausse la '
    'promesse du critère 25.3 sans que rien ne bouge à l''écran.';
comment on column echelles.filiale_id is
    'Nul = socle du Groupe, lisible de toutes les filiales. Renseigné = échelle locale. '
    'Le PLAN_SERVEUR §2.2 range l''échelle au niveau Groupe parce que « sans échelle '
    'commune les risques ne s''additionnent pas » : ce n''est pas un interdit, c''est la '
    'conséquence que la consolidation doit VOIR — d''où la colonne portée par la cotation.';
comment on column echelles.revision is
    '⚠️ Numéro de RÉVISION de l''échelle — à ne pas confondre avec « version », qui porte '
    'le verrouillage optimiste sur toute table métier. Modifier une échelle en service, '
    'c''est en publier une révision de plus.';
comment on column echelles.sujet is
    'Ce que l''échelle gradue. Vocabulaire fermé, et le §4 déclare quel porteur emploie '
    'quel sujet : une échelle dont le sujet n''a pas de porteur n''est proposée nulle part.';
comment on column echelles.remplace_id is
    'La révision que celle-ci remplace. Clé SIMPLE vers une table MIXTE, même arbitrage '
    'qu''à ebios_sources_risque.connaissance_id : une clé composite rendrait le socle du '
    'Groupe inatteignable depuis une filiale.';
comment on column echelles.en_vigueur_le is
    'Date d''entrée en vigueur — la moitié « datée » du critère 25.3. Obligatoire dès que '
    'l''échelle quitte l''état de brouillon (ck_echelles_en_vigueur).';

-- =====================================================================================
-- §2 — LES NIVEAUX D'UNE ÉCHELLE
-- -------------------------------------------------------------------------------------
-- ⚠️ **RELATIONNEL, ET NON UN `jsonb` DE NIVEAUX.** La tentation était réelle : une
-- échelle en vigueur est immuable (§6), donc ses niveaux sont un « document figé », et le
-- `CONVENTIONS.md` §6 réserve précisément `jsonb` à ces documents-là. Trois raisons l'ont
-- emporté :
--
--   1. **la liste du §6 est CLOSE** — *« tout autre besoin est relationnel »* ;
--   2. `audits.items`, le modèle invoqué, est décrit comme *« lu tel quel, jamais
--      interrogé colonne par colonne »*. Un niveau, lui, est interrogé à chaque cotation :
--      c'est ce que le déclencheur du §5 va chercher pour refuser un « 7 » sur une échelle
--      qui s'arrête à 4 ;
--   3. avec une vraie table, *« cette valeur appartient à cette échelle »* devient une
--      requête d'existence que la base sait faire. En `jsonb`, ce serait une boucle sur
--      `jsonb_array_elements` écrite à la main — *une contrainte qu'on relit au lieu d'une
--      contrainte qui mord*.
--
-- ── LA PORTÉE D'UN NIVEAU EST CELLE DE SON ÉCHELLE, ET UNE CLÉ COMPOSITE NE SUFFIT PAS ──
--
-- ⚠️ **C'est le piège de cette migration, et il mérite d'être écrit.** La règle du
-- `CONVENTIONS.md` §17.1 dit : toute clé étrangère entre deux tables cloisonnées est
-- composite. Écrite ici, elle aurait donné
-- `(echelle_id, filiale_id) references echelles (id, filiale_id)` — et **elle n'aurait
-- rien contrôlé pour le socle du Groupe.**
--
-- PostgreSQL applique `MATCH SIMPLE` par défaut : *une clé étrangère composite dont UNE
-- colonne est nulle est satisfaite, sans vérification*. Or le socle du Groupe porte
-- `filiale_id` nul **par construction**. Un niveau de portée Groupe aurait donc pu
-- désigner une échelle inexistante, et la clé l'aurait laissé passer. `MATCH FULL` ne
-- sauve pas non plus : il exige que les colonnes soient toutes nulles ou toutes
-- renseignées — et « toutes nulles » reste dispensé de vérification.
--
-- La réponse est donc : **clé simple** (qui, elle, vérifie toujours) **plus un
-- déclencheur** qui exige l'égalité des portées. C'est la règle du `CONVENTIONS.md` §39
-- retournée dans le bon sens : on ne reconnaît pas un NOM de colonne, on mesure ce que la
-- contrainte FAIT — et ici elle ne fait rien.
-- =====================================================================================

create table if not exists echelle_niveaux (
    id          id_metier   not null default f_generer_id('ECHN'),
    -- Toujours égale à celle de son échelle — tenue par trg_echelle_niveaux_portee.
    filiale_id  id_metier,
    echelle_id  id_metier   not null,

    -- `numeric` et non `smallint` : les porteurs sont des deux types (`risques.g_gravite`
    -- est `numeric`, `ebios_evenements_redoutes.gravite` est `smallint`), et la
    -- comparaison du §5 doit valoir pour les deux sans conversion implicite surprenante.
    valeur      numeric     not null,
    libelle     text        not null,
    description text,

    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text,

    constraint pk_echelle_niveaux primary key (id),
    constraint fk_echelle_niveaux_filiale foreign key (filiale_id)
        references filiales (id) on delete restrict,
    -- `cascade` et non `restrict` : un niveau n'a aucune existence hors de son échelle.
    -- ⚠️ Ce qui protège les cotations n'est pas ici : c'est le `restrict` du §3, qui
    -- refuse de supprimer une échelle qu'une cotation pointe.
    constraint fk_echelle_niveaux_echelle foreign key (echelle_id)
        references echelles (id) on delete cascade,

    constraint ck_echelle_niveaux_libelle check (libelle <> ''),
    constraint ck_echelle_niveaux_valeur  check (valeur >= 0),
    constraint ck_echelle_niveaux_longueurs check (
        length(libelle) <= 80
        and (description is null or length(description) <= 1000))
);

-- Deux unicités, et chacune ferme une confusion distincte : deux niveaux de même VALEUR
-- rendraient la cotation ambiguë (laquelle le « 3 » désigne-t-il ?), deux niveaux de même
-- LIBELLÉ rendraient l'écran illisible.
-- `filiale_id` en tête et `nulls not distinct` : même motif qu'au §1. ⚠️ Et il ne suffit
-- pas de dire « echelle_id détermine déjà la portée » — c'est vrai, le déclencheur de
-- portée le tient, mais le garde-fou du cloisonnement ne lit pas les déclencheurs. Une
-- unicité qui ne porte pas `filiale_id` le fait rougir, et elle DOIT le faire rougir : la
-- prochaine table qui invoquera le même raisonnement n'aura peut-être pas le déclencheur.
create unique index if not exists uq_echelle_niveaux_valeur
    on echelle_niveaux (filiale_id, echelle_id, valeur) nulls not distinct;
create unique index if not exists uq_echelle_niveaux_libelle
    on echelle_niveaux (filiale_id, echelle_id, lower(libelle)) nulls not distinct;

drop trigger if exists trg_echelle_niveaux_maj on echelle_niveaux;
create trigger trg_echelle_niveaux_maj before update on echelle_niveaux
    for each row execute function f_maj_tracabilite();

comment on table echelle_niveaux is
    'Les niveaux d''une échelle de cotation (action 25.3) : la valeur, ce qu''elle veut '
    'dire, et ce qui la distingue de la voisine. MIXTE comme son échelle, dont elle suit '
    'la portée — tenue par un DÉCLENCHEUR et non par une clé composite, qui ne contrôle '
    'rien quand filiale_id est nul (MATCH SIMPLE, voir l''en-tête du §2).';
comment on column echelle_niveaux.valeur is
    'La valeur cotée. C''est elle que le déclencheur du §5 confronte à ce qu''une cotation '
    'porte : un « 7 » sur une échelle qui s''arrête à 4 est refusé, et nommément.';
comment on column echelle_niveaux.libelle is
    'Ce que la valeur VEUT DIRE — « Grave », « Significative ». Sans lui, une échelle '
    'versionnée ne serait qu''une borne, et changer de révision n''aurait aucun sens.';

-- ── Le déclencheur de portée : ce que la clé composite ne peut pas faire ─────────────

create or replace function f_echelle_niveau_suit_sa_portee() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_portee_echelle text;
    v_trouvee        boolean;
begin
    select e.filiale_id, true into v_portee_echelle, v_trouvee
      from echelles e where e.id = new.echelle_id;

    -- Invisible par la RLS ou inexistante : la clé étrangère SIMPLE tranche le second cas
    -- avant nous ; ce qui reste ici est le premier, et il se refuse.
    if not coalesce(v_trouvee, false) then
        raise exception
            'echelle_niveaux : l''échelle « % » est introuvable dans le périmètre de '
            'cette session.', new.echelle_id
            using errcode = '23514',
                  hint = 'Un niveau ne se rattache qu''à une échelle que la session peut '
                         'lire : le socle du Groupe, ou une échelle de sa propre filiale.';
    end if;

    if new.filiale_id is distinct from v_portee_echelle then
        raise exception
            'echelle_niveaux : la portée d''un niveau (%) doit être celle de son échelle (%).',
            coalesce(new.filiale_id, 'Groupe'), coalesce(v_portee_echelle, 'Groupe')
            using errcode = '23514',
                  hint = 'Un niveau du socle du Groupe appartient au Groupe ; un niveau '
                         'd''une échelle locale appartient à sa filiale. Voir le §2 de la '
                         'migration 049 : une clé étrangère composite ne peut pas le dire, '
                         'parce que MATCH SIMPLE dispense de contrôle dès qu''une colonne '
                         'est nulle — et filiale_id l''est pour tout le socle.';
    end if;

    return new;
end;
$$;

comment on function f_echelle_niveau_suit_sa_portee() is
    'Exige qu''un niveau ait exactement la portée de son échelle. Tient la place d''une '
    'clé étrangère composite, qui ne CONTRÔLE RIEN ici : MATCH SIMPLE — le défaut de '
    'PostgreSQL — satisfait toute clé composite dont une colonne est nulle, et filiale_id '
    'est nul pour tout le socle du Groupe. Migration 049 §2.';

drop trigger if exists trg_echelle_niveaux_portee on echelle_niveaux;
create trigger trg_echelle_niveaux_portee
    before insert or update on echelle_niveaux
    for each row execute function f_echelle_niveau_suit_sa_portee();

-- =====================================================================================
-- §2 bis — CE QUE TOUTE TABLE MÉTIER DOIT À TROIS GARDE-FOUS DÉJÀ POSÉS
-- -------------------------------------------------------------------------------------
-- Aucun des trois points ci-dessous n'a été trouvé par une relecture : les trois ont été
-- rendus par `f_verifier_schema()`, qui a **refusé le déploiement** de la première
-- rédaction de cette migration — quatorze anomalies sur quatre contrôles. C'est la
-- quatrième fois de ce chantier qu'un installateur rattrape un lot qu'il n'a pas vu naître
-- (`docs/REPRISE.md`), et c'est exactement ce à quoi ces contrôles servent.
--
--   1. **La marque de provenance** (migration `032`) — sans elle, la purge du jeu de
--      découverte ne sait pas distinguer une échelle semée pour la démonstration d'une
--      échelle que quelqu'un a décidée. Elle laisserait la seconde, ou emporterait la
--      première : les deux sont graves, et aucune ne se voit.
--   2. **La traçabilité à l'insertion** (`CONVENTIONS.md` §18.1) — sans le déclencheur
--      « before insert », l'appelant fixe lui-même `version`, `cree_le` et `cree_par`, et
--      « version » cesse d'être un compteur : deux écritures concurrentes sur la même
--      version passent toutes les deux (risque P1).
--   3. **Le registre de l'article 30 du produit lui-même** (migration `026`) — toute
--      colonne textuelle est candidate, et chacune reçoit une DÉCISION. Un défaut d'ici
--      ne se voit jamais à l'usage : il se voit le jour où quelqu'un exerce son droit à
--      l'effacement et que la purge ne sait pas quoi faire de la colonne.
-- =====================================================================================

alter table echelles        add column if not exists provenance provenance_ligne not null;
alter table echelle_niveaux add column if not exists provenance provenance_ligne not null;

do $$
declare
    v_table text;
begin
    foreach v_table in array array['echelles', 'echelle_niveaux'] loop
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
    raise notice 'Traçabilité à l''insertion : % table(s) équipée(s).', v_poses;
end;
$$;

-- ── Le registre de l'article 30, pour les six colonnes textuelles des deux tables ──────
--
-- ⚠️ **Les six sont « non personnelles », et ce n'est pas une facilité.** Une échelle
-- gradue une GRANDEUR — une gravité, une vraisemblance — et ne nomme personne. C'est un
-- des rares cas du schéma où la réponse est franche : il n'y a pas de saisie libre dont
-- le sujet pourrait être quelqu'un, comme il y en a dans `derogations.motif` ou dans
-- `ebios_connaissances.description`, qui relèvent, eux, du régime « signaler ».
--
-- Les deux descriptions sont le seul point discutable : ce sont des saisies libres. Mais
-- leur sujet est *« ce que le niveau 3 veut dire »*, et l'écran ne propose rien qui
-- appelle un nom. On les déclare donc non personnelles, **en disant pourquoi** — la
-- justification est ce que l'auditeur lit, pas la case cochée.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('echelles', 'sujet', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : ce que l''échelle gradue (vraisemblance | gravite | criteres_source '
   '| criteres_partie_prenante). Ne désigne aucune personne.'),
  ('echelles', 'nom', 'non_personnelle', null, null, null, null,
   'Nom d''une graduation — « Gravité — échelle du Groupe ». Un intitulé de barème.'),
  ('echelles', 'statut', 'non_personnelle', null, null, null, null,
   'Vocabulaire clos : brouillon | en_vigueur | archivee.'),
  ('echelles', 'description', 'non_personnelle', null, null, null, null,
   'Saisie libre dont le sujet est un BARÈME : à quoi sert cette échelle, et dans quels '
   'ateliers on l''emploie. Rien dans l''écran n''appelle un nom de personne — à la '
   'différence de derogations.motif ou de ebios_connaissances.description, qui relèvent '
   'du régime « signaler » précisément parce que leur sujet peut en appeler un.'),
  ('echelle_niveaux', 'libelle', 'non_personnelle', null, null, null, null,
   'Ce qu''une valeur veut dire — « Grave », « Significative ». Un mot de barème.'),
  ('echelle_niveaux', 'description', 'non_personnelle', null, null, null, null,
   'Saisie libre décrivant un NIVEAU d''une graduation. Même motif que echelles.description.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §3 — CE QUE LES COTATIONS PORTENT — SIX COLONNES SUR CINQ TABLES
-- -------------------------------------------------------------------------------------
-- C'est la seconde moitié du critère 25.3 : *« et les cotations portent l'échelle qui les
-- a produites »*.
--
-- ── POURQUOI LE POINTEUR EST SUR LA COTATION, ET NON SUR L'ÉTUDE ──────────────────
--
-- Pour EBIOS RM, une conception plus courte était possible : `ebios_etudes` aurait porté
-- ses quatre échelles une fois pour toutes, et l'atelier entier en aurait hérité. C'est
-- d'ailleurs ce que fait la méthode, qui fixe ses échelles au cadrage.
--
-- Elle a été écartée pour une raison qui n'est pas de goût : **elle ne couvre pas
-- `risques`.** Un risque coté en F × G × M n'appartient à aucune étude — il est saisi un
-- jour, révisé trois ans plus tard, et c'est justement le cas où l'échelle a pu changer
-- entre-temps. Deux mécanismes auraient alors coexisté : un pointeur d'étude pour EBIOS,
-- un pointeur de ligne pour les risques, et **un seul des deux** aurait été porté par le
-- déclencheur du §5 et par le garde-fou du §10. *On a corrigé l'instance, pas la classe* —
-- le travers que ce chantier a payé sept fois.
--
-- Le pointeur est donc là où la valeur est, partout, sans exception. Le §4 le déclare, le
-- §5 le fait mordre, le §10 vérifie qu'aucun porteur n'a été oublié — **en partant du
-- catalogue, jamais de la liste** (`CONVENTIONS.md` §39.3).
--
-- ── `on delete restrict`, ET C'EST TOUT LE SUJET ──────────────────────────────────
--
-- Une échelle qu'une cotation pointe ne se supprime pas. Ni `cascade` (qui détruirait la
-- cotation), ni `set null` (qui la laisserait en place **en effaçant silencieusement ce
-- qui la rend interprétable** — le pire des trois). Une échelle dont on ne veut plus
-- s'ARCHIVE : elle cesse d'être proposée, et reste lisible pour tout ce qu'elle a produit.
-- C'est le §17.6, mot pour mot, transposé de `mesure_catalogue`.
-- =====================================================================================

alter table risques add column if not exists echelle_f_id id_metier;
alter table risques add column if not exists echelle_g_id id_metier;
alter table risques drop constraint if exists fk_risques_echelle_f;
alter table risques drop constraint if exists fk_risques_echelle_g;
alter table risques add constraint fk_risques_echelle_f
    foreign key (echelle_f_id) references echelles (id) on delete restrict;
alter table risques add constraint fk_risques_echelle_g
    foreign key (echelle_g_id) references echelles (id) on delete restrict;

comment on column risques.echelle_f_id is
    'L''échelle de vraisemblance sous laquelle f_frequence a été cotée. ⚠️ NUL ne veut '
    'PAS dire « échelle du Groupe » : il veut dire « échelle non tracée », et c''est ce '
    'que l''écran affiche. Toute cotation antérieure à la migration 049 est dans ce cas, '
    'et lui attribuer d''office l''échelle du jour inventerait un fait (motif Q-192).';
comment on column risques.echelle_g_id is
    'L''échelle de gravité sous laquelle g_gravite a été cotée. Même remarque sur le nul '
    'que pour echelle_f_id. ⚠️ m_maitrise n''a pas d''échelle : c''est un coefficient de '
    '0 à 1, pas un niveau choisi dans une liste (voir l''en-tête de la migration).';

alter table ebios_evenements_redoutes
    add column if not exists echelle_gravite_id id_metier;
alter table ebios_evenements_redoutes drop constraint if exists fk_ebios_evenements_redoutes_echelle;
alter table ebios_evenements_redoutes add constraint fk_ebios_evenements_redoutes_echelle
    foreign key (echelle_gravite_id) references echelles (id) on delete restrict;

comment on column ebios_evenements_redoutes.echelle_gravite_id is
    'L''échelle de gravité de l''atelier 1. ⚠️ Elle vaut aussi pour les scénarios '
    'stratégiques, qui ne portent AUCUNE gravité propre : la leur est celle de '
    'l''événement redouté réalisé, remontée par la jointure (migration 047).';

alter table ebios_scenarios_operationnels
    add column if not exists echelle_vraisemblance_id id_metier;
alter table ebios_scenarios_operationnels drop constraint if exists fk_ebios_scenarios_operationnels_echelle;
alter table ebios_scenarios_operationnels add constraint fk_ebios_scenarios_operationnels_echelle
    foreign key (echelle_vraisemblance_id) references echelles (id) on delete restrict;

comment on column ebios_scenarios_operationnels.echelle_vraisemblance_id is
    'L''échelle de vraisemblance de l''atelier 4. Le NIVEAU d''un scénario, lui, ne voyage '
    'nulle part : il se dérive de la gravité et de la vraisemblance, à l''instant où on '
    'regarde (migration 047).';

alter table ebios_sources_risque
    add column if not exists echelle_criteres_id id_metier;
alter table ebios_sources_risque drop constraint if exists fk_ebios_sources_risque_echelle;
alter table ebios_sources_risque add constraint fk_ebios_sources_risque_echelle
    foreign key (echelle_criteres_id) references echelles (id) on delete restrict;

comment on column ebios_sources_risque.echelle_criteres_id is
    'UNE échelle pour les TROIS critères du couple — motivation, ressources, activité. '
    'Trois colonnes auraient permis de les coter sur trois graduations différentes, alors '
    'que f_ebios_pertinence() en fait la MOYENNE : moyenner des grandeurs graduées '
    'autrement produirait un nombre qui a l''air mesuré sans l''être (critère 25.4).';

alter table ebios_parties_prenantes
    add column if not exists echelle_criteres_id id_metier;
alter table ebios_parties_prenantes drop constraint if exists fk_ebios_parties_prenantes_echelle;
alter table ebios_parties_prenantes add constraint fk_ebios_parties_prenantes_echelle
    foreign key (echelle_criteres_id) references echelles (id) on delete restrict;

comment on column ebios_parties_prenantes.echelle_criteres_id is
    'UNE échelle pour les QUATRE critères de l''écosystème — dépendance, pénétration, '
    'maturité, confiance. Même motif qu''à ebios_sources_risque : f_ebios_niveau_menace() '
    'les combine, et une combinaison de graduations différentes ne veut rien dire.';

-- =====================================================================================
-- §4 — LA DÉCLARATION DES PORTEURS — LUE PAR LE GARDE-FOU *ET* PAR LE SERVEUR
-- -------------------------------------------------------------------------------------
-- ⚠️ **C'est une liste écrite à la main, et c'est délibéré.** Le `CLAUDE.md` donne le
-- discriminant, et il ne porte pas sur le sujet de la liste mais sur **ce qui arrive le
-- jour où elle devient incomplète** :
--
--   · si une omission fait **réussir quelque chose en silence** → la liste est le mauvais
--     outil, il faut découvrir dans le catalogue ;
--   · si une omission **échoue bruyamment** et qu'un humain doit décider → la liste est le
--     bon outil, on la fige à deux endroits qui la comparent au réel.
--
-- Nous sommes dans le second cas, et **par construction** : le garde-fou du §10 balaie le
-- CATALOGUE à la recherche de toute colonne nommée `echelle_%_id`, et exige que chacune
-- soit déclarée ici — **et réciproquement** (`CONVENTIONS.md` §20.2 : *un garde-fou se
-- vérifie dans les deux sens*). Une colonne ajoutée sans déclaration fait rougir
-- `f_verifier_schema()`, c'est-à-dire refuse le déploiement. Une déclaration qui ne
-- désigne plus rien le fait aussi.
--
-- Ce que la liste porte et que le catalogue ne peut pas dire : **quel sujet** gradue quel
-- porteur, et **quelles colonnes de valeur** ce pointeur couvre. Aucune convention de
-- nommage ne le donnerait sans devinette — et deviner, ici, c'est accepter une cotation
-- sur une échelle de gravité pour une vraisemblance.
-- =====================================================================================

create or replace function f_echelle_porteurs()
returns table (porteur text, colonne_echelle text, colonnes_valeur text[], sujet text)
    language sql immutable
    set search_path = pg_catalog, public, pg_temp as
$$
    select *
      from (values
        ('risques',                        'echelle_f_id',
         array['f_frequence'],                                        'vraisemblance'),
        ('risques',                        'echelle_g_id',
         array['g_gravite'],                                          'gravite'),
        ('ebios_evenements_redoutes',      'echelle_gravite_id',
         array['gravite'],                                            'gravite'),
        ('ebios_scenarios_operationnels',  'echelle_vraisemblance_id',
         array['vraisemblance'],                                      'vraisemblance'),
        ('ebios_sources_risque',           'echelle_criteres_id',
         array['motivation', 'ressources', 'activite'],               'criteres_source'),
        ('ebios_parties_prenantes',        'echelle_criteres_id',
         array['dependance', 'penetration', 'maturite', 'confiance'], 'criteres_partie_prenante')
      ) as t(porteur, colonne_echelle, colonnes_valeur, sujet);
$$;

comment on function f_echelle_porteurs() is
    'Déclare QUI porte une échelle : la table, la colonne qui la désigne, les colonnes de '
    'valeur qu''elle gradue, et le sujet attendu. Source unique du déclencheur du §5, du '
    'garde-fou du §10 et du marquage fait par src/entites/. ⚠️ Liste écrite à la main, et '
    'c''est le bon outil ICI parce qu''une omission ÉCHOUE BRUYAMMENT : le garde-fou part '
    'du catalogue et exige que toute colonne « echelle_%_id » y figure, et réciproquement.';

-- ── L'échelle en vigueur pour un sujet, dans une portée donnée ──────────────────────
--
-- ⚠️ La surcharge de la filiale l'emporte sur le socle du Groupe — c'est le patron de
-- `parametres` (migration `048`), et il n'y a aucune raison d'en inventer un second.
-- Rendre NUL quand rien n'est en vigueur, jamais une révision archivée : *un domaine hors
-- des droits rend null, jamais zéro*, et une échelle retirée du service ne doit pas
-- continuer à estampiller des cotations neuves.

create or replace function f_echelle_en_vigueur(p_sujet text, p_filiale_id text)
returns text
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select e.id
      from echelles e
     where e.sujet = p_sujet
       and e.statut = 'en_vigueur'
       and (e.filiale_id = p_filiale_id or e.filiale_id is null)
     order by (e.filiale_id is null)   -- false (la locale) avant true (le socle)
     limit 1;
$$;

comment on function f_echelle_en_vigueur(text, text) is
    'L''échelle en vigueur pour un sujet et une filiale : la sienne si elle en a une, le '
    'socle du Groupe sinon, NUL si aucune. Lue par src/entites/ au moment où une cotation '
    'est écrite. ⚠️ Soumise à la RLS, et c''est voulu : une session qui ne peut pas LIRE '
    'une échelle ne doit pas pouvoir en estampiller ses cotations.';

grant execute on function f_echelle_porteurs() to grc_app;
grant execute on function f_echelle_porteurs() to grc_lecture;
grant execute on function f_echelle_en_vigueur(text, text) to grc_app;
grant execute on function f_echelle_en_vigueur(text, text) to grc_lecture;

-- =====================================================================================
-- §5 — LE DÉCLENCHEUR : UNE COTATION APPARTIENT À L'ÉCHELLE QU'ELLE NOMME
-- -------------------------------------------------------------------------------------
-- Sans lui, la colonne du §3 serait une **étiquette** : on pourrait coter 3 en disant
-- « sur l'échelle de gravité » alors que l'échelle nommée gradue une vraisemblance, ou
-- coter 7 sur une échelle qui s'arrête à 4. L'écran afficherait un libellé vide et
-- personne ne saurait pourquoi.
--
-- ⚠️ **UNE SEULE FONCTION, ET ELLE LIT SA DÉCLARATION AU LIEU DE LA RECEVOIR.** Le
-- déclencheur ne prend qu'un argument — la colonne d'échelle — et va chercher dans
-- `f_echelle_porteurs()` le sujet attendu et les colonnes de valeur. Passer la liste en
-- arguments l'aurait recopiée **à un second endroit**, et un porteur modifié d'un côté
-- seulement se serait mis à valider autre chose que ce qu'il déclare (constat **Q-219**,
-- appliqué à un déclencheur).
--
-- ── QUATRE REFUS, ET LE CINQUIÈME QUI N'EN EST PAS UN ─────────────────────────────
--
--   1. l'échelle nommée est introuvable **ou invisible** — la RLS s'applique ici, et
--      c'est plus fort qu'une clé étrangère, qui l'ignore (`CONVENTIONS.md` §17.1) ;
--   2. son sujet n'est pas celui que ce porteur gradue ;
--   3. elle est encore un **brouillon** — une échelle qu'on n'a pas publiée n'a produit
--      aucune cotation ;
--   4. elle appartient à une **autre filiale** — le socle du Groupe est admis, l'échelle
--      de la voisine non ;
--   5. une valeur cotée n'est pas un niveau de cette échelle.
--
-- ⚠️ **Et ce qui n'est PAS refusé : une échelle ARCHIVÉE.** `f_echelle_en_vigueur()` n'en
-- rend jamais, donc le produit n'en estampille aucune ; mais une reprise ou un import de
-- données historiques doit pouvoir dire « ceci a été coté sous la révision 1 », et le
-- refuser obligerait à mentir sur la provenance pour faire entrer un fait vrai.
--
-- ⚠️ **Il ne REMPLIT rien.** Un déclencheur ne distingue pas « le client n'a rien dit »
-- de « le client a dit : pas d'échelle » ; le marquage vit donc dans `src/entites/`, qui
-- connaît la différence. Voir l'en-tête de la migration.
-- =====================================================================================

create or replace function f_cotation_dans_son_echelle() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_colonne  constant text := tg_argv[0];
    v_ligne    constant jsonb := to_jsonb(new);
    v_echelle  text;
    v_attendu  text;
    v_colonnes text[];
    v_sujet    text;
    v_statut   text;
    v_filiale  text;
    v_revision integer;
    v_col      text;
    v_valeur   numeric;
begin
    v_echelle := v_ligne ->> v_colonne;

    -- Nul = « échelle non tracée ». C'est le cas de toute cotation antérieure à la
    -- migration 049, et il se laisse passer : le refuser interdirait la reprise d'un
    -- export d'avant, c'est-à-dire de la sauvegarde qui sert à restaurer.
    if v_echelle is null then
        return new;
    end if;

    select p.colonnes_valeur, p.sujet into v_colonnes, v_attendu
      from f_echelle_porteurs() p
     where p.porteur = tg_table_name and p.colonne_echelle = v_colonne;

    if v_colonnes is null then
        raise exception
            'La colonne %.% porte une échelle sans être déclarée dans f_echelle_porteurs().',
            tg_table_name, v_colonne
            using errcode = '23514',
                  hint = 'Migration 049 §4 : toute colonne « echelle_<x>_id » se déclare, '
                         'et le garde-fou f_verifier_echelles() refuse le déploiement sinon.';
    end if;

    select e.sujet, e.statut, e.filiale_id, e.revision
      into v_sujet, v_statut, v_filiale, v_revision
      from echelles e where e.id = v_echelle;

    if v_sujet is null then
        raise exception
            '%.% : l''échelle « % » est introuvable dans le périmètre de cette session.',
            tg_table_name, v_colonne, v_echelle
            using errcode = '23514',
                  hint = 'Une cotation ne se rattache qu''à une échelle que la session peut '
                         'LIRE : le socle du Groupe, ou une échelle de sa propre filiale.';
    end if;

    if v_sujet <> v_attendu then
        raise exception
            '%.% : l''échelle « % » gradue « % », or cette cotation attend « % ».',
            tg_table_name, v_colonne, v_echelle, v_sujet, v_attendu
            using errcode = '23514',
                  hint = 'Coter une gravité sur une échelle de vraisemblance rendrait le '
                         'niveau affiché faux sans qu''aucune valeur soit hors borne.';
    end if;

    if v_statut = 'brouillon' then
        raise exception
            '%.% : l''échelle « % » (révision %) est encore un brouillon.',
            tg_table_name, v_colonne, v_echelle, v_revision
            using errcode = '23514',
                  hint = 'Une échelle se publie — statut « en_vigueur », avec sa date — '
                         'avant de pouvoir produire une cotation.';
    end if;

    if v_filiale is not null and v_filiale is distinct from new.filiale_id then
        raise exception
            '%.% : l''échelle « % » appartient à la filiale « % », et cette cotation à « % ».',
            tg_table_name, v_colonne, v_echelle, v_filiale, new.filiale_id
            using errcode = '23514',
                  hint = 'Le socle du Groupe est employable par toutes les filiales ; '
                         'l''échelle locale d''une filiale ne l''est que par elle.';
    end if;

    foreach v_col in array v_colonnes loop
        v_valeur := nullif(v_ligne ->> v_col, '')::numeric;
        if v_valeur is not null
           and not exists (select 1 from echelle_niveaux n
                            where n.echelle_id = v_echelle and n.valeur = v_valeur)
        then
            raise exception
                '%.% = % n''est pas un niveau de l''échelle « % » (révision %).',
                tg_table_name, v_col, v_valeur, v_echelle, v_revision
                using errcode = '23514',
                      hint = 'Les niveaux d''une échelle sont dans echelle_niveaux. Si la '
                             'graduation doit changer, on publie une RÉVISION de l''échelle '
                             '— on ne modifie pas celle qui est en service (migration 049 §6).';
        end if;
    end loop;

    return new;
end;
$$;

comment on function f_cotation_dans_son_echelle() is
    'Déclencheur des porteurs de cotation : refuse une échelle introuvable ou invisible, '
    'de sujet incompatible, encore en brouillon, appartenant à une autre filiale, ou une '
    'valeur qui n''est pas un de ses niveaux. ⚠️ Il LIT f_echelle_porteurs() au lieu de '
    'recevoir la liste en arguments : deux copies de la même déclaration se mettraient à '
    'diverger (constat Q-219). Il ne REMPLIT rien — voir l''en-tête de la migration 049.';

-- ── Pose, pilotée par la déclaration ───────────────────────────────────────────────
do $$
declare
    r      record;
    v_nom  text;
    v_pose integer := 0;
begin
    for r in select * from f_echelle_porteurs() loop
        v_nom := 'trg_' || r.porteur || '_' || r.colonne_echelle;
        if to_regclass('public.' || quote_ident(r.porteur)) is null then
            raise exception 'f_echelle_porteurs() déclare la table « % », qui n''existe pas.',
                            r.porteur;
        end if;
        execute format('drop trigger if exists %I on %I', v_nom, r.porteur);
        execute format(
            'create trigger %I before insert or update on %I for each row '
            'execute function f_cotation_dans_son_echelle(%L)',
            v_nom, r.porteur, r.colonne_echelle);
        v_pose := v_pose + 1;
    end loop;
    raise notice 'Cotation dans son échelle : % déclencheur(s) posé(s).', v_pose;
end;
$$;

-- =====================================================================================
-- §6 — UNE ÉCHELLE EN VIGUEUR NE SE MODIFIE PLUS — ELLE SE REMPLACE
-- -------------------------------------------------------------------------------------
-- C'est la première moitié du critère 25.3 : *« le changement est versionné et daté »*.
--
-- ⚠️ **Et c'est une propriété, pas une consigne.** Sans elle, le mécanisme entier est un
-- décor : une cotation pointe une échelle, et si cette échelle peut être retouchée, le
-- pointeur suit la retouche. Le produit continuerait d'afficher « coté sur l'échelle de
-- gravité, révision 1 » **en montrant les niveaux d'aujourd'hui** — c'est-à-dire
-- exactement le défaut que l'action 25.3 existe pour fermer, avec en plus l'assurance
-- trompeuse d'un numéro de révision.
--
-- Le remède à une échelle qui ne convient plus est d'en publier la **révision
-- suivante**, qui pointe la précédente par `remplace_id` : l'historique se lit en
-- remontant la chaîne.
--
-- ══ ⚠️ CE QUE LA PREMIÈRE RÉDACTION AVAIT CASSÉ, ET QUI L'A DIT ═══════════════════
--
-- La première rédaction de ce §6 interdisait AUSSI de supprimer une échelle publiée et
-- d'ajouter un niveau à une échelle publiée, **sans exception**. C'était cohérent sur le
-- papier, et **le produit ne savait plus relire sa propre sauvegarde** :
--
--     GET /api/export  puis  POST /api/reprise « remplacer »   →  409
--     « Les niveaux de l'échelle « ECHL-A » sont figés : elle est publiée. »
--
-- La reprise vide la filiale puis réécrit tout dans **une seule transaction** : elle
-- supprime des niveaux dont l'échelle existe encore, et réinsère des niveaux sous une
-- échelle que le fichier déclare publiée. Les deux gestes sont légitimes ; l'interdit les
-- prenait pour des retouches.
--
-- ⚠️ **C'est la classe des trois conflits de la migration `041`** — *un invariant d'ajout
-- seul contre un balayage qui supprime* — et des constats **Q-194** et **Q-284**. Elle
-- se tranche toujours pareil : **restaurer une sauvegarde gagne**. Ce qui reste à trouver
-- est la formulation qui garde la garantie sans casser la restauration.
--
-- ── LES DEUX DISCRIMINANTS RETENUS ────────────────────────────────────────────────
--
--   1. **Une ligne écrite dans LA MÊME TRANSACTION n'est « publiée » pour personne.**
--      `xmin = pg_current_xact_id()::xid` le dit sans qu'aucun appelant ait à coopérer —
--      ni marqueur à poser, ni liste de chemins à tenir à jour (ce qui serait « une
--      omission qui attend »). La reprise, le semis et l'assistant passent ; un
--      utilisateur qui retouche une échelle en service, lui, est dans une AUTRE
--      transaction, et il est refusé.
--
--   2. **La suppression d'une échelle n'est plus interdite ici — elle l'est mieux
--      ailleurs.** Les six clés étrangères du §3 sont en `on delete restrict` : une
--      échelle qu'une cotation interprète ne se supprime pas, et **une clé étrangère
--      ignore la RLS** (`CONVENTIONS.md` §17.1), donc la cotation d'une filiale
--      INVISIBLE la protège aussi. C'est plus fort que le déclencheur qu'on retire, et
--      cela laisse passer le seul cas où la suppression est juste : la filiale entière
--      s'en va (`POST /api/cycle/sortie-filiale`, reprise « remplacer »), ses cotations
--      partant d'abord.
--
--      ⚠️ Reste donc possible : supprimer une échelle publiée que **rien** n'interprète.
--      C'est sans effet sur une cotation — il n'y en a aucune — et le dire franchement
--      vaut mieux qu'un interdit qui casse la restauration pour couvrir un cas vide.
--
--   3. **Un niveau retiré d'une échelle publiée reste refusé, mais À LA FIN DE LA
--      TRANSACTION.** Un déclencheur `before delete` ne peut pas savoir que l'échelle
--      part elle aussi ; un déclencheur de CONTRAINTE, différé au `commit`, le voit —
--      l'échelle a disparu, il n'y a plus de graduation à protéger. Le geste isolé, lui,
--      laisse l'échelle en place et se fait refuser.
-- =====================================================================================

-- ── « Écrite ici » : le discriminant, et pourquoi ce n'est PAS une comparaison d'xid ──
--
-- ⚠️ **La première rédaction comparait `xmin` à `pg_current_xact_id()`, et c'était faux.**
-- `pg_current_xact_id()` rend l'identifiant de la transaction de PREMIER NIVEAU ; une
-- ligne écrite à l'intérieur d'un point de reprise porte celui de la SOUS-transaction.
-- Or la couche d'écriture en pose un à chaque insertion (`avecPointDeReprise`,
-- `src/entites/`) : l'exemption n'aurait joué sur aucun chemin réel, et la reprise serait
-- restée cassée — avec, en prime, un commentaire affirmant le contraire.
--
-- `pg_xact_status()` répond, lui, pour une sous-transaction comme pour une racine. Et le
-- raisonnement qui rend le test SÛR tient en une phrase : sous `read committed` comme
-- sous `repeatable read`, **une ligne non validée d'une AUTRE transaction ne nous est
-- jamais visible**. Donc « visible d'ici ET non encore validée » signifie « écrite par
-- nous ». Un identifiant trop ancien pour que son statut survive rend `null`, ce qui vaut
-- « pas à nous » — le refus, c'est-à-dire le côté sûr.
create or replace function f_ligne_ecrite_ici(p_xmin xid) returns boolean
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    select coalesce(pg_xact_status(p_xmin::text::xid8) = 'in progress', false);
$$;

comment on function f_ligne_ecrite_ici(xid) is
    'La ligne dont c''est le « xmin » a-t-elle été écrite par la transaction courante '
    '(sous-transactions comprises) ? ⚠️ NE PAS remplacer par « xmin = pg_current_xact_id() » : '
    'celui-ci rend la transaction de PREMIER NIVEAU, et la couche d''écriture pose un point '
    'de reprise à chaque insertion — l''exemption ne jouerait sur aucun chemin réel. '
    'Migration 049 §6.';

grant execute on function f_ligne_ecrite_ici(xid) to grc_app;
grant execute on function f_ligne_ecrite_ici(xid) to grc_lecture;

create or replace function f_echelle_publiee_est_figee() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- ⚠️ NOMMÉES UNE PAR UNE, et non « tout sauf trois ». Une colonne ajoutée plus tard
    -- serait alors figée SANS que personne l'ait décidé, et la migration qui l'ajoute
    -- échouerait sur un refus dont le message ne désignerait pas la cause. Ici, une
    -- colonne neuve est libre par défaut et le garde-fou du §10 la signale.
    v_figees constant text[] := array['filiale_id', 'sujet', 'nom', 'revision',
                                      'remplace_id', 'description', 'en_vigueur_le'];
    v_avant  constant jsonb := to_jsonb(old);
    v_apres  constant jsonb := to_jsonb(new);
    v_col    text;
begin
    if old.statut = 'brouillon' then
        return new;   -- un brouillon se travaille : c'est ce qu'il est.
    end if;

    -- ⚠️ Écrite dans CETTE transaction : personne ne l'a vue, elle n'est « publiée » pour
    -- personne. C'est ce qui laisse la reprise réécrire un fichier qui déclare ses
    -- échelles en vigueur, sans ouvrir la retouche d'une échelle en service.
    if f_ligne_ecrite_ici(old.xmin) then
        return new;
    end if;

    if old.statut = 'archivee' and new.statut <> 'archivee' then
        raise exception
            'L''échelle « % » est archivée : elle ne revient pas en service.', old.id
            using errcode = '23514',
                  hint = 'Remettre en service une échelle archivée ferait cohabiter deux '
                         'révisions en vigueur pour le même sujet, ou ressusciterait une '
                         'graduation que quelqu''un a délibérément retirée. On publie une '
                         'révision de plus.';
    end if;

    foreach v_col in array v_figees loop
        if (v_avant ->> v_col) is distinct from (v_apres ->> v_col) then
            raise exception
                'L''échelle « % » est publiée : « % » ne se modifie plus.', old.id, v_col
                using errcode = '23514',
                      hint = 'Une cotation POINTE cette échelle. La retoucher changerait ce '
                             'que des cotations déjà produites veulent dire, sans que rien '
                             'ne bouge à l''écran. Publiez une RÉVISION (migration 049 §6).';
        end if;
    end loop;

    return new;
end;
$$;

comment on function f_echelle_publiee_est_figee() is
    'Fige une échelle dès sa publication : ni son nom, ni son sujet, ni sa portée, ni sa '
    'date d''entrée en vigueur ne bougent, et une archivée ne revient pas en service. '
    '⚠️ EXEMPTION : une ligne écrite dans la MÊME transaction n''est publiée pour '
    'personne — sans quoi le produit ne saurait plus relire sa propre sauvegarde (§6). '
    '⚠️ La SUPPRESSION n''est pas traitée ici : elle est tenue par les six clés '
    'étrangères « on delete restrict » du §3, qui ignorent la RLS et protègent donc aussi '
    'la cotation d''une filiale invisible.';

drop trigger if exists trg_echelles_figee on echelles;
create trigger trg_echelles_figee
    before update on echelles
    for each row execute function f_echelle_publiee_est_figee();

-- ── Les niveaux : figés à l'écriture, et gardés à la FIN de la transaction ──────────

create or replace function f_echelle_niveaux_figes() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_statut text;
    v_neuve  boolean;
begin
    select e.statut, f_ligne_ecrite_ici(e.xmin)
      into v_statut, v_neuve
      from echelles e where e.id = new.echelle_id;

    -- Échelle introuvable : la clé étrangère SIMPLE tranche déjà le cas, et le
    -- déclencheur de portée dit le reste. Rien à ajouter ici.
    if v_statut is null then
        return new;
    end if;

    if v_statut <> 'brouillon' and not coalesce(v_neuve, false) then
        raise exception
            'Les niveaux de l''échelle « % » sont figés : elle est publiée.', new.echelle_id
            using errcode = '23514',
                  hint = 'Modifier la graduation d''une échelle en service changerait ce '
                         'que des cotations déjà produites veulent dire. Publiez une '
                         'RÉVISION de l''échelle (migration 049 §6).';
    end if;

    return new;
end;
$$;

comment on function f_echelle_niveaux_figes() is
    'Interdit d''ajouter ou de modifier un niveau d''une échelle publiée. Figer l''échelle '
    'sans figer ses niveaux n''aurait rien figé du tout : c''est la graduation qui donne '
    'son sens à une cotation, pas le nom de l''échelle. ⚠️ EXEMPTION : une échelle écrite '
    'dans la MÊME transaction n''est publiée pour personne (reprise, semis). Le RETRAIT '
    'd''un niveau est gardé à part, par f_echelle_niveau_ne_disparait_pas().';

drop trigger if exists trg_echelle_niveaux_figes on echelle_niveaux;
create trigger trg_echelle_niveaux_figes
    before insert or update on echelle_niveaux
    for each row execute function f_echelle_niveaux_figes();

-- ⚠️ **DIFFÉRÉ, ET C'EST TOUTE LA DIFFÉRENCE.** Un `before delete` ordinaire ne peut pas
-- savoir que l'échelle s'en va elle aussi : il voit un niveau qui disparaît sous une
-- échelle encore présente, et refuse — ce qui rend la sortie d'une filiale et la reprise
-- « remplacer » impossibles. Évalué au `commit`, le même prédicat dit le contraire de ce
-- qu'il disait au début : l'échelle n'est plus là, il n'y a plus de graduation à
-- protéger. Le geste isolé, lui, laisse l'échelle en place et se fait refuser.
create or replace function f_echelle_niveau_ne_disparait_pas() returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
begin
    if exists (select 1 from echelles e
                where e.id = old.echelle_id
                  and e.statut <> 'brouillon'
                  and not f_ligne_ecrite_ici(e.xmin))
    then
        raise exception
            'Un niveau de l''échelle publiée « % » ne se retire pas.', old.echelle_id
            using errcode = '23514',
                  hint = 'Retirer un niveau change la graduation sous des cotations déjà '
                         'produites : elles continueraient de pointer cette échelle, et le '
                         'produit ne saurait plus dire ce que leur chiffre veut dire. '
                         'Publiez une RÉVISION (migration 049 §6).';
    end if;
    return old;
end;
$$;

comment on function f_echelle_niveau_ne_disparait_pas() is
    'Déclencheur de CONTRAINTE, différé au commit : refuse le retrait d''un niveau d''une '
    'échelle publiée. ⚠️ Différé parce qu''un « before delete » ne peut pas distinguer le '
    'retrait d''un niveau de la disparition de l''échelle entière — ce qui rendait la '
    'sortie d''une filiale et la reprise « remplacer » impossibles (§6).';

drop trigger if exists trg_echelle_niveau_ne_disparait_pas on echelle_niveaux;
create constraint trigger trg_echelle_niveau_ne_disparait_pas
    after delete on echelle_niveaux
    deferrable initially deferred
    for each row execute function f_echelle_niveau_ne_disparait_pas();

-- §7 — LE SOCLE DU GROUPE — QUATRE ÉCHELLES, SEMÉES *PUIS* VÉRIFIÉES
-- -------------------------------------------------------------------------------------
-- Ce ne sont pas des échelles inventées pour remplir un écran : ce sont les **quatre
-- graduations déjà écrites en dur** dans `js/modules/risques.js` et `js/modules/ebios.js`.
-- Elles entrent en base telles quelles, au niveau Groupe, en révision 1 — si bien que le
-- jour de la livraison, **rien ne change pour personne** : les écrans proposent les mêmes
-- quatre niveaux, sous les mêmes libellés, et la seule différence est qu'ils sont
-- désormais écrits quelque part.
--
-- ⚠️ **LE SEMIS PASSE PAR L'ÉTAT « BROUILLON », ET CE N'EST PAS UNE PRÉCAUTION DE STYLE.**
-- Le déclencheur du §6 refuse d'ajouter un niveau à une échelle publiée. Semer directement
-- en `en_vigueur` échouerait — et c'est la démonstration, ici, dans la migration qui le
-- pose, que la barrière mord. On publie donc APRÈS avoir gradué, ce qui est aussi l'ordre
-- dans lequel un humain le fera.
--
-- ⚠️ **ET LE SEMIS SE VÉRIFIE, il ne s'espère pas.** Le garde-fou du §10 ne peut pas le
-- faire : le `CONVENTIONS.md` §41 interdit à un garde-fou de schéma de LIRE des lignes
-- d'une table cloisonnée — `install.sh` appelle `f_verifier_schema()` sans périmètre. Le
-- contrôle est donc ici, à l'endroit et au moment où le périmètre existe.
-- =====================================================================================

do $$
declare
    v_socle constant jsonb := jsonb_build_array(
      jsonb_build_object(
        'sujet', 'gravite',
        'nom',   'Gravité — échelle du Groupe',
        'description',
            'Ampleur des conséquences d''un événement redouté pour la filiale. Échelle à '
            'quatre niveaux d''EBIOS RM, employée aussi par la cotation F × G × M.',
        'niveaux', jsonb_build_array(
            jsonb_build_object('v', 1, 'l', 'Mineure',
                'd', 'Gêne pour l''activité, absorbée sans mesure particulière.'),
            jsonb_build_object('v', 2, 'l', 'Significative',
                'd', 'Dégradation réelle de l''activité, réparable dans les délais habituels.'),
            jsonb_build_object('v', 3, 'l', 'Grave',
                'd', 'Atteinte durable à l''activité, aux engagements clients ou à la conformité.'),
            jsonb_build_object('v', 4, 'l', 'Critique',
                'd', 'Remise en cause de la capacité de la filiale à tenir son activité.'))),
      jsonb_build_object(
        'sujet', 'vraisemblance',
        'nom',   'Vraisemblance — échelle du Groupe',
        'description',
            'Possibilité que le scénario se réalise. Échelle à quatre niveaux d''EBIOS RM, '
            'employée aussi par la fréquence de la cotation F × G × M.',
        'niveaux', jsonb_build_array(
            jsonb_build_object('v', 1, 'l', 'Minime',
                'd', 'Le scénario paraît très difficile à réaliser en l''état.'),
            jsonb_build_object('v', 2, 'l', 'Significative',
                'd', 'Le scénario est réalisable, sans être facilité par ce qui est en place.'),
            jsonb_build_object('v', 3, 'l', 'Forte',
                'd', 'Le scénario est à la portée de la source, et rien ne l''entrave vraiment.'),
            jsonb_build_object('v', 4, 'l', 'Quasi certaine',
                'd', 'Le scénario se produira, ou s''est déjà produit ailleurs dans le groupe.'))),
      jsonb_build_object(
        'sujet', 'criteres_source',
        'nom',   'Critères d''une source de risque — échelle du Groupe',
        'description',
            'Gradue les trois critères d''un couple source de risque / objectif visé : '
            'motivation, ressources, activité (atelier 2).',
        'niveaux', jsonb_build_array(
            jsonb_build_object('v', 1, 'l', 'Faible',
                'd', 'Le critère joue à peine en faveur de la source.'),
            jsonb_build_object('v', 2, 'l', 'Modérée',
                'd', 'Le critère joue, sans être déterminant.'),
            jsonb_build_object('v', 3, 'l', 'Forte',
                'd', 'Le critère avantage nettement la source.'),
            jsonb_build_object('v', 4, 'l', 'Très forte',
                'd', 'Le critère est au maximum de ce que l''on sait observer.'))),
      jsonb_build_object(
        'sujet', 'criteres_partie_prenante',
        'nom',   'Critères d''une partie prenante — échelle du Groupe',
        'description',
            'Gradue les quatre critères de l''écosystème : dépendance, pénétration, '
            'maturité cyber, confiance (atelier 3).',
        'niveaux', jsonb_build_array(
            jsonb_build_object('v', 1, 'l', 'Négligeable',
                'd', 'Le critère ne pèse pas dans l''évaluation de la partie prenante.'),
            jsonb_build_object('v', 2, 'l', 'Faible',
                'd', 'Le critère pèse peu.'),
            jsonb_build_object('v', 3, 'l', 'Importante',
                'd', 'Le critère pèse nettement.'),
            jsonb_build_object('v', 4, 'l', 'Critique',
                'd', 'Le critère est déterminant pour le niveau de menace de l''écosystème.')))
    );
    v_echelle  jsonb;
    v_niveau   jsonb;
    v_id       text;
    v_semees   integer := 0;
    v_attendu  constant integer := 4;
    v_compte   integer;
begin
    -- La marque est POSEE PAR LA BASE, pas ecrite dans l'insertion : c'est le §0 bis, et
    -- c'est ce qui la rend inforgeable (condition constitutive n° 1).
    perform set_config('grc.provenance', 'socle', true);

    for v_echelle in select * from jsonb_array_elements(v_socle) loop
        if exists (select 1 from echelles
                    where filiale_id is null and sujet = v_echelle ->> 'sujet') then
            continue;   -- rejeu de la migration : le socle est déjà là.
        end if;

        insert into echelles (filiale_id, sujet, nom, revision, statut, description)
        values (null, v_echelle ->> 'sujet', v_echelle ->> 'nom', 1, 'brouillon',
                v_echelle ->> 'description')
        returning id into v_id;

        for v_niveau in select * from jsonb_array_elements(v_echelle -> 'niveaux') loop
            insert into echelle_niveaux (filiale_id, echelle_id, valeur, libelle, description)
            values (null, v_id, (v_niveau ->> 'v')::numeric,
                    v_niveau ->> 'l', v_niveau ->> 'd');
        end loop;

        -- La publication vient APRÈS la graduation : c'est le §6 qui l'impose, et c'est
        -- l'ordre dans lequel un humain travaille.
        update echelles
           set statut = 'en_vigueur', en_vigueur_le = current_date
         where id = v_id;

        v_semees := v_semees + 1;
    end loop;

    -- ── Ce qui est semé est MESURÉ, jamais supposé ─────────────────────────────────
    select count(*) into v_compte
      from echelles where filiale_id is null and statut = 'en_vigueur';
    if v_compte <> v_attendu then
        raise exception
            'Socle des échelles : % échelle(s) du Groupe en vigueur, % attendue(s).',
            v_compte, v_attendu;
    end if;

    select count(*) into v_compte
      from echelle_niveaux n join echelles e on e.id = n.echelle_id
     where e.filiale_id is null;
    if v_compte <> v_attendu * 4 then
        raise exception
            'Socle des échelles : % niveau(x) semé(s), % attendu(s).', v_compte, v_attendu * 4;
    end if;

    -- La marque est MESUREE, pas supposee : c'est elle qui decide si le jeu de
    -- decouverte se charge, et une ligne du socle marquee « saisie » ferait dire a ce
    -- controle qu'une base neuve porte des donnees reelles.
    select count(*) into v_compte
      from echelles where filiale_id is null and provenance <> 'socle';
    if v_compte > 0 then
        raise exception 'Socle des échelles : % ligne(s) ne portent pas la marque socle.',
                        v_compte;
    end if;
    select count(*) into v_compte
      from echelle_niveaux n join echelles e on e.id = n.echelle_id
     where e.filiale_id is null and n.provenance <> 'socle';
    if v_compte > 0 then
        raise exception 'Socle des échelles : % niveau(x) ne portent pas la marque socle.',
                        v_compte;
    end if;

    raise notice 'Socle des échelles : % échelle(s) semée(s), % en vigueur, % niveaux, '
                 'marqués socle.', v_semees, v_attendu, v_attendu * 4;
end;
$$;

-- =====================================================================================
-- §8 — `type_entite`
-- -------------------------------------------------------------------------------------
-- Une table absente de ce domaine est INCRÉABLE par les routes génériques, et le refus
-- qui remonte à l'utilisateur ne désigne rien (`CONVENTIONS.md` §40.1). La substitution
-- part d'un MODÈLE : si le texte appliqué a changé depuis, on **refuse plutôt que
-- d'appliquer de travers** (motif du §4 de la `027`).
-- =====================================================================================

do $$
declare
    v_predicat text;
    v_neuf     text;
    v_modele   constant text := '''ebios_scenarios_operationnels''';
    v_ajouts   constant text := '''ebios_scenarios_operationnels'', ''echelles'', '
                                '''echelle_niveaux''';
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
    if position('''echelles''' in v_predicat) > 0 then
        raise notice 'type_entite admet déjà les échelles : rejeu, rien à faire.';
        return;
    end if;
    if position(v_modele in v_predicat) = 0 then
        raise exception 'La valeur « ebios_scenarios_operationnels » est introuvable dans le '
                        'prédicat appliqué de type_entite_check : son texte a changé, et la '
                        'substitution à l''aveugle est refusée plutôt qu''appliquée de '
                        'travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(v_predicat, v_modele, v_ajouts);

    execute 'alter domain type_entite drop constraint type_entite_check';
    execute format('alter domain type_entite add constraint type_entite_check %s', v_neuf);
    raise notice 'type_entite admet désormais « echelles » et « echelle_niveaux ».';
end;
$$;

-- =====================================================================================
-- §9 — CLOISONNEMENT
-- -------------------------------------------------------------------------------------
-- Les deux tables sont MIXTES et suivent le patron de `risque_catalogue` : le socle du
-- Groupe est lisible de toutes les filiales et écrit par la seule administration Groupe ;
-- une échelle locale est lue et écrite par sa filiale seule.
--
-- ⚠️ **C'est cette politique de LECTURE qui rend inoffensive la clé simple du §3.** Une
-- filiale ne peut pas voir l'échelle locale d'une autre : aucun écran ne la lui propose,
-- et le déclencheur du §5 la refuserait même si elle en devinait l'identifiant — 52 bits
-- d'aléa cryptographique. Le contrôle est donc posé deux fois, à deux étages différents.
-- =====================================================================================

alter table echelles        enable row level security;
alter table echelles        force  row level security;
alter table echelle_niveaux enable row level security;
alter table echelle_niveaux force  row level security;

do $$
declare
    v_table text;
begin
    foreach v_table in array array['echelles', 'echelle_niveaux'] loop
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
    end loop;
end;
$$;

comment on policy pol_echelles_lecture on echelles is
    'Le socle du Groupe (filiale_id nul) est lisible de TOUTES les filiales : c''est ce '
    'qui permet à une filiale de coter sans rien décider. Une échelle LOCALE ne l''est que '
    'de sa filiale — et c''est la barrière qui rend inoffensive la clé simple du §3.';

grant select, insert, update, delete on echelles        to grc_app;
grant select, insert, update, delete on echelle_niveaux to grc_app;
grant select on echelles        to grc_lecture;
grant select on echelle_niveaux to grc_lecture;

select f_poser_portee_figee();
select f_armer_declencheurs();

-- ⚠️ LA POSE VIENT ICI, APRÈS LE §9 : `f_poser_declencheurs_pieces()` découvre les tables
-- porteuses par un prédicat dont l'une des conditions est que la politique de SUPPRESSION
-- soit cloisonnée. Appelée plus haut, elle ne verrait pas les deux tables neuves, rendrait
-- un compte plausible et les laisserait démunies sans une erreur (`CONVENTIONS.md` §40.2).
do $$
declare v_poses integer;
begin
    v_poses := f_poser_declencheurs_pieces();
    raise notice 'Déclencheurs « les pièces suivent leur porteur » : % table(s) équipée(s).',
                 v_poses;
end;
$$;

-- =====================================================================================
-- §10 — LE GARDE-FOU
-- -------------------------------------------------------------------------------------
-- ⚠️ Il **ÉPROUVE** au lieu de lire un texte (`CONVENTIONS.md` §39.1), il **part du
-- catalogue** et non de la liste (§39.3), il nomme ses barrières **une par une** parce
-- qu'un garde de CLASSE ne voit pas la disparition d'une PAIRE (§39.7), et il mesure ce
-- qu'une clé étrangère **FAIT** — son action de suppression — plutôt que son existence.
--
-- ⚠️ **Et il ne lit AUCUNE ligne.** Le `CONVENTIONS.md` §41 l'impose : `install.sh` appelle
-- `f_verifier_schema()` sans périmètre, et un garde qui lirait `echelles` rendrait des
-- verdicts dépendant de la session. Le contrôle du SEMIS vit donc au §7, là où le
-- périmètre existe. Corollaire du §41, et il s'applique ici : *un garde qui doit lire des
-- lignes est souvent le signe qu'une contrainte manque* — ce sont les contraintes du §1 et
-- le déclencheur du §5 qui tiennent la propriété, pas une requête.
-- =====================================================================================

create or replace function f_verifier_echelles()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- ── Les barrières nommées UNE PAR UNE, avec ce que leur disparition produit ──────
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('t','echelles','n','uq_echelles_en_vigueur','k','i',
            'e','DEUX RÉVISIONS PEUVENT ÊTRE EN VIGUEUR POUR LE MÊME SUJET. '
                '« L''échelle en vigueur » cesse alors d''être une expression définie : le '
                'serveur en choisit une, et laquelle dépend du plan d''exécution du jour. '
                'Une cotation serait estampillée d''une révision, la suivante d''une autre, '
                'sans qu''aucun geste humain n''ait eu lieu'),
        jsonb_build_object('t','echelles','n','uq_echelles_revision','k','i',
            'e','le socle du Groupe peut porter deux révisions 1 du même sujet — une '
                'unicité ordinaire traite deux NULL comme distincts, et « coalesce » est '
                'la seule chose qui le tienne (CONVENTIONS.md §19.1)'),
        jsonb_build_object('t','echelle_niveaux','n','uq_echelle_niveaux_valeur','k','i',
            'e','deux niveaux de même valeur : « 3 » cesse de désigner quelque chose, et '
                'l''écran affiche l''un ou l''autre libellé selon la requête du jour'),
        jsonb_build_object('t','echelles','n','ck_echelles_sujet','k','c',
            'e','le sujet d''une échelle n''est plus fermé : une échelle qu''aucun porteur '
                'ne gradue serait proposée à la saisie et ne cotera jamais rien'),
        jsonb_build_object('t','echelles','n','ck_echelles_en_vigueur','k','c',
            'e','UNE ÉCHELLE PEUT ÊTRE PUBLIÉE SANS DATE. C''est la moitié « datée » du '
                'critère 25.3 qui tombe : on saurait qu''une graduation a changé, jamais '
                'quand, donc jamais quelles cotations sont d''avant'),
        jsonb_build_object('t','echelles','n','ck_echelles_archive','k','c',
            'e','un archivage sans date, ou une date sans archivage'),
        jsonb_build_object('t','echelles','n','ck_echelles_remplace_soi','k','c',
            'e','une révision peut se remplacer elle-même, et l''écran qui remonte la '
                'chaîne des révisions boucle'),
        jsonb_build_object('t','echelle_niveaux','n','ck_echelle_niveaux_libelle','k','c',
            'e','un niveau sans libellé : l''échelle redevient une borne, et changer de '
                'révision ne veut plus rien dire')
    );

    -- ── Ce que les contraintes doivent REFUSER, éprouvé sur des lignes témoins ───────
    v_refus constant jsonb := jsonb_build_array(
        jsonb_build_object('t','echelles','n','ck_echelles_sujet',
            'ligne', jsonb_build_object('sujet','diffusion libre'),
            'e','le vocabulaire des sujets s''est vidé — c''est le motif de Q-312, où un '
                '« … or true » laissait passer toute valeur sous 0 anomalie'),
        jsonb_build_object('t','echelles','n','ck_echelles_en_vigueur',
            'ligne', jsonb_build_object('statut','en_vigueur','en_vigueur_le',null),
            'e','une échelle publiée sans date d''entrée en vigueur'),
        jsonb_build_object('t','echelles','n','ck_echelles_archive',
            'ligne', jsonb_build_object('statut','archivee','archivee_le',null),
            'e','une échelle archivée sans date d''archivage'),
        jsonb_build_object('t','echelle_niveaux','n','ck_echelle_niveaux_libelle',
            'ligne', jsonb_build_object('libelle',''),
            'e','un niveau au libellé vide')
    );

    v_piece  jsonb;
    v_verdict boolean;
    r        record;
    v_tg     record;
    v_compte integer;
begin
    -- ══ 1. LE CATALOGUE D'ABORD : toute colonne « echelle_%_id » est-elle déclarée ? ══
    -- ⚠️ On part de ce que la base PORTE, jamais de la liste (§39.3). Une colonne ajoutée
    -- sans déclaration ne serait gardée par rien : elle accepterait n'importe quel
    -- identifiant d'échelle, de n'importe quel sujet, **sous 0 anomalie**.
    for r in
        select c.relname::text as porteur, a.attname::text as colonne
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and a.attnum > 0 and not a.attisdropped
           and a.attname like 'echelle\_%\_id'
           and c.relname::text <> all (array['echelles', 'echelle_niveaux'])
    loop
        if not exists (select 1 from f_echelle_porteurs() p
                        where p.porteur = r.porteur and p.colonne_echelle = r.colonne) then
            objet    := r.porteur || '.' || r.colonne;
            anomalie := 'porteur_non_declare';
            detail   := 'colonne d''échelle absente de f_echelle_porteurs() : aucun '
                        'déclencheur ne la garde, et elle accepterait une échelle de '
                        'n''importe quel sujet — une gravité cotée sur une échelle de '
                        'vraisemblance, sous 0 anomalie (migration 049 §4)';
            return next;
        end if;
    end loop;

    -- ══ 2. …ET DANS L'AUTRE SENS (§20.2) : la déclaration désigne-t-elle du réel ? ══
    for r in select * from f_echelle_porteurs() loop
        if to_regclass('public.' || quote_ident(r.porteur)) is null then
            objet    := r.porteur;
            anomalie := 'porteur_introuvable';
            detail   := 'f_echelle_porteurs() déclare une table qui n''existe plus : la '
                        'déclaration ne porte plus sur rien, et la dispense couvrirait la '
                        'prochaine table du même nom (§19.5)';
            return next;
            continue;
        end if;

        if not exists (select 1 from pg_attribute a
                        where a.attrelid = to_regclass('public.' || quote_ident(r.porteur))
                          and a.attname = r.colonne_echelle
                          and a.attnum > 0 and not a.attisdropped) then
            objet    := r.porteur || '.' || r.colonne_echelle;
            anomalie := 'colonne_echelle_introuvable';
            detail   := 'la colonne d''échelle déclarée n''existe pas sur la table';
            return next;
        end if;

        -- Les colonnes de VALEUR : une seule qui disparaît, et une cotation cesse d'être
        -- confrontée à sa graduation — en silence, puisque la boucle du §5 ne la verrait
        -- simplement plus.
        select count(*) into v_compte
          from unnest(r.colonnes_valeur) as v(nom)
         where not exists (select 1 from pg_attribute a
                            where a.attrelid = to_regclass('public.' || quote_ident(r.porteur))
                              and a.attname = v.nom
                              and a.attnum > 0 and not a.attisdropped);
        if v_compte > 0 then
            objet    := r.porteur;
            anomalie := 'colonne_valeur_introuvable';
            detail   := format('%s colonne(s) de valeur déclarée(s) pour « %s » n''existe(nt) '
                               'plus : la cotation correspondante ne serait plus confrontée à '
                               'l''échelle qu''elle nomme', v_compte, r.colonne_echelle);
            return next;
        end if;

        -- ══ 3. LE DÉCLENCHEUR : présent, armé, ET SUR LES BONS ÉVÉNEMENTS ══
        -- ⚠️ `tgtype` est mesuré, pas supposé : c'est le constat **Q-281**, où deux gardes
        -- vérifiaient qu'un déclencheur existe et est armé pendant que ses événements
        -- avaient été déplacés — 0 anomalie, deux barrières mortes.
        select t.tgname, t.tgtype, t.tgenabled, p.proname::text as fonction
          into v_tg
          from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = to_regclass('public.' || quote_ident(r.porteur))
           and not t.tgisinternal
           and t.tgname = 'trg_' || r.porteur || '_' || r.colonne_echelle;

        if v_tg is null then
            objet    := r.porteur || '.' || r.colonne_echelle;
            anomalie := 'declencheur_cotation_absent';
            detail   := 'aucun déclencheur ne confronte cette cotation à son échelle : une '
                        'valeur hors graduation, ou une échelle d''un autre sujet, entrerait '
                        'sans un mot (migration 049 §5)';
            return next;
        elsif v_tg.fonction <> 'f_cotation_dans_son_echelle' then
            objet    := r.porteur || '.' || r.colonne_echelle;
            anomalie := 'declencheur_cotation_detourne';
            detail   := format('le déclencheur appelle « %s » et non f_cotation_dans_son_echelle',
                               v_tg.fonction);
            return next;
        elsif v_tg.tgenabled <> 'A' then
            objet    := r.porteur || '.' || r.colonne_echelle;
            anomalie := 'declencheur_cotation_non_arme';
            detail   := format('déclencheur non armé « always » (tgenabled = %s) : il ne se '
                               'déclenche pas pour le propriétaire de la base, c''est-à-dire '
                               'pour les migrations et la reprise', v_tg.tgenabled);
            return next;
        elsif (v_tg.tgtype & 1) = 0 or (v_tg.tgtype & 2) = 0
              or (v_tg.tgtype & 4) = 0 or (v_tg.tgtype & 16) = 0 then
            objet    := r.porteur || '.' || r.colonne_echelle;
            anomalie := 'declencheur_cotation_mal_arme';
            detail   := format('le déclencheur ne couvre pas « BEFORE INSERT OR UPDATE … FOR '
                               'EACH ROW » (tgtype = %s) : une cotation entrerait ou serait '
                               'corrigée sans être confrontée à son échelle — constat Q-281, '
                               'où deux gardes vérifiaient l''existence et non les événements',
                               v_tg.tgtype);
            return next;
        end if;

        -- ══ 4. CE QUE LA CLÉ ÉTRANGÈRE *FAIT* — son action de suppression ══
        -- ⚠️ « Elle existe » ne suffit pas. Un `set null` laisserait la cotation en place
        -- en effaçant SILENCIEUSEMENT ce qui la rend interprétable : c'est le pire des
        -- trois comportements, et il ne se voit pas à l'usage.
        select count(*) into v_compte
          from pg_constraint k
         where k.conrelid = to_regclass('public.' || quote_ident(r.porteur))
           and k.contype = 'f'
           and k.confrelid = to_regclass('public.echelles')
           and k.confdeltype = 'r'
           and exists (select 1 from unnest(k.conkey) as ck(att)
                        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = ck.att
                       where a.attname = r.colonne_echelle);
        if v_compte = 0 then
            objet    := r.porteur || '.' || r.colonne_echelle;
            anomalie := 'cle_echelle_sans_restrict';
            detail   := 'aucune clé étrangère « on delete restrict » de cette colonne vers '
                        '« echelles » : une échelle employée redeviendrait supprimable. En '
                        'cascade elle détruirait la cotation, en « set null » elle la '
                        'laisserait en place EN EFFAÇANT ce qui la rend interprétable — et '
                        'rien à l''écran ne le dirait (migration 049 §3)';
            return next;
        end if;
    end loop;

    -- ══ 5. LES QUATRE DÉCLENCHEURS DES ÉCHELLES ELLES-MÊMES ══
    for r in
        select * from (values
            ('echelles',        'trg_echelles_figee',           'f_echelle_publiee_est_figee',
             19, 'UNE ÉCHELLE PUBLIÉE REDEVIENT MODIFIABLE, et le mécanisme entier devient '
                 'un décor : une cotation la pointe, et le pointeur suivrait la retouche. Le '
                 'produit afficherait « révision 1 » en montrant les niveaux d''aujourd''hui'),
            ('echelle_niveaux', 'trg_echelle_niveaux_figes',    'f_echelle_niveaux_figes',
             23, 'la GRADUATION d''une échelle publiée redevient modifiable. Figer l''échelle '
                 'sans figer ses niveaux n''aurait rien figé : c''est la graduation qui donne '
                 'son sens à une cotation, pas le nom de l''échelle'),
            ('echelle_niveaux', 'trg_echelle_niveau_ne_disparait_pas',
             'f_echelle_niveau_ne_disparait_pas',
             9,  'UN NIVEAU PEUT ÊTRE RETIRÉ d''une échelle publiée : les cotations '
                 'continueraient de la pointer, et le produit ne saurait plus dire ce que '
                 'leur chiffre veut dire. ⚠️ Ce déclencheur est DIFFÉRÉ à dessein — un '
                 '« before delete » ne distingue pas le retrait d''un niveau de la '
                 'disparition de l''échelle entière, et rendait la sortie d''une filiale '
                 'impossible (§6)'),
            ('echelle_niveaux', 'trg_echelle_niveaux_portee',   'f_echelle_niveau_suit_sa_portee',
             23, 'un niveau peut appartenir à une portée autre que celle de son échelle. '
                 '⚠️ Aucune clé étrangère ne le rattrape : MATCH SIMPLE dispense de contrôle '
                 'dès qu''une colonne est nulle, et filiale_id l''est pour tout le socle')
        ) as t(tbl, nom, fonction, masque, effet)
    loop
        select t.tgtype, t.tgenabled, p.proname::text as fonction
          into v_tg
          from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = to_regclass('public.' || quote_ident(r.tbl))
           and not t.tgisinternal and t.tgname = r.nom;

        if v_tg is null then
            objet := r.tbl || '.' || r.nom; anomalie := 'declencheur_absent';
            detail := r.effet; return next;
        elsif v_tg.fonction <> r.fonction then
            objet := r.tbl || '.' || r.nom; anomalie := 'declencheur_detourne';
            detail := format('appelle « %s » et non « %s ». Effet : %s',
                             v_tg.fonction, r.fonction, r.effet); return next;
        elsif v_tg.tgenabled <> 'A' then
            objet := r.tbl || '.' || r.nom; anomalie := 'declencheur_non_arme';
            detail := format('tgenabled = %s, donc inactif pour le propriétaire de la base. '
                             'Effet : %s', v_tg.tgenabled, r.effet); return next;
        elsif (v_tg.tgtype & r.masque) <> r.masque then
            objet := r.tbl || '.' || r.nom; anomalie := 'declencheur_mal_arme';
            detail := format('tgtype = %s, il ne couvre pas les événements attendus (masque '
                             '%s). Effet : %s', v_tg.tgtype, r.masque, r.effet); return next;
        end if;
    end loop;

    -- ══ 6. LES BARRIÈRES NOMMÉES — existence ══
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if v_piece ->> 'k' = 'i' then
            if to_regclass('public.' || quote_ident(v_piece ->> 'n')) is null then
                objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
                anomalie := 'index_unique_absent';
                detail   := v_piece ->> 'e';
                return next;
            end if;
        else
            if not exists (select 1 from pg_constraint k
                            where k.conrelid = to_regclass('public.' || quote_ident(v_piece ->> 't'))
                              and k.conname = v_piece ->> 'n') then
                objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
                anomalie := 'contrainte_absente';
                detail   := v_piece ->> 'e';
                return next;
            end if;
        end if;
    end loop;

    -- ══ 7. …ET CE QU'ELLES REFUSENT, ÉPROUVÉ (§39.1) ══
    -- Le texte d'une contrainte peut porter son nom, ses quatre littéraux, et ne plus
    -- rien refuser : « … or true » suffit. Seule l'évaluation du prédicat réel sur une
    -- ligne témoin le voit (constats Q-291, Q-312).
    for v_piece in select * from jsonb_array_elements(v_refus) loop
        v_verdict := f_contrainte_accepte(v_piece ->> 't', v_piece ->> 'n', v_piece -> 'ligne');
        if v_verdict is null then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_non_mesurable';
            detail   := 'le prédicat n''a pas pu être évalué sur une ligne témoin : la '
                        'contrainte a disparu, ou elle référence une fonction non native '
                        'que f_contrainte_accepte() refuse d''exécuter (constat A-4)';
            return next;
        elsif v_verdict then
            objet    := (v_piece ->> 't') || '.' || (v_piece ->> 'n');
            anomalie := 'contrainte_ne_refuse_plus';
            detail   := format('la contrainte ACCEPTE une ligne qu''elle doit refuser. '
                               'Effet : %s', v_piece ->> 'e');
            return next;
        end if;
    end loop;

    return;
end;
$$;

comment on function f_verifier_echelles() is
    'Garde-fou de l''action 25.3. Part du CATALOGUE — toute colonne « echelle_%_id » doit '
    'être déclarée — et vérifie la déclaration dans l''autre sens (§20.2). Mesure le '
    'tgtype des déclencheurs (constat Q-281), l''action de suppression des clés étrangères '
    '(« restrict », pas seulement « existe »), et ÉPROUVE les contraintes sur des lignes '
    'témoins (§39.1). ⚠️ Il ne lit aucune ligne (§41) : le contrôle du SEMIS vit au §7 de '
    'la migration 049, là où le périmètre existe.';

-- =====================================================================================
-- §11 — CONSIGNATION
-- -------------------------------------------------------------------------------------
-- Un garde-fou que rien n'appelle est un commentaire (`CONVENTIONS.md` §18.4).
-- `f_consigner_controles_schema()` le DÉCOUVRE par sa convention d'écriture et l'inscrit
-- au registre : un contrôle qui cesserait d'être découvert ne disparaîtrait plus en
-- silence.
-- =====================================================================================

select f_consigner_controles_schema();

do $$
declare v_anomalies integer;
begin
    select count(*) into v_anomalies from f_verifier_echelles();
    if v_anomalies > 0 then
        raise exception 'f_verifier_echelles() rend % anomalie(s) à la fin de sa propre '
                        'migration.', v_anomalies;
    end if;
    raise notice 'f_verifier_echelles() : 0 anomalie.';
end;
$$;

insert into migrations_schema (version, nom)
values ('049', 'les échelles de cotation : ce que « 3 » veut dire cesse d''être écrit en '
               'dur dans le navigateur. Échelles versionnées et datées, figées dès leur '
               'publication, socle du Groupe surchargeable par filiale — et chaque '
               'cotation porte celle qui l''a produite, « non tracée » restant « non '
               'tracée » plutôt que de se voir attribuer l''échelle du jour')
on conflict (version) do nothing;

commit;

-- =====================================================================================
--  POUR DÉFAIRE CETTE MIGRATION (recette seulement) :
--
--    delete from controles_schema where fonction in ('f_verifier_echelles');
--    drop function if exists f_verifier_echelles();
--    drop function if exists f_cotation_dans_son_echelle() cascade;
--    drop function if exists f_echelle_publiee_est_figee() cascade;
--    drop function if exists f_echelle_niveaux_figes() cascade;
--    drop function if exists f_echelle_niveau_suit_sa_portee() cascade;
--    drop function if exists f_echelle_en_vigueur(text, text);
--    drop function if exists f_echelle_porteurs();
--    alter table risques drop column if exists echelle_f_id, drop column if exists echelle_g_id;
--    alter table ebios_evenements_redoutes      drop column if exists echelle_gravite_id;
--    alter table ebios_scenarios_operationnels  drop column if exists echelle_vraisemblance_id;
--    alter table ebios_sources_risque           drop column if exists echelle_criteres_id;
--    alter table ebios_parties_prenantes        drop column if exists echelle_criteres_id;
--    drop table if exists echelle_niveaux;
--    drop table if exists echelles;
--    delete from migrations_schema where version = '049';
--
--  ⚠️ Et le domaine `type_entite` garde ses deux valeurs : les retirer exigerait de
--  réécrire son prédicat, ce qu'une migration appliquée ne fait pas (§23).
-- =====================================================================================
