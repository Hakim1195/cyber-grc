-- =====================================================================================
--  032 — LA MARQUE DE PROVENANCE : UNE LIGNE DIT D'OÙ ELLE VIENT
--
--  §0  Le périmètre de la migration
--  §1  Le domaine « provenance_ligne » — trois valeurs, closes
--  §2  Le domaine est RANGÉ parmi les formes techniques
--  §3  La colonne, posée sur les entités MÉTIER découvertes dans le catalogue
--  §4  Le garde-fou : une entité métier sans marque de provenance fait rougir
--  §5  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Elle est la **première des cinq conditions constitutives** du jeu de découverte, que
--  l'utilisateur a autorisé le 08/09/2026 (`docs/PLAN_PRODUIT.md` §7, arbitrage A2) :
--
--    « Étiqueté dans la donnée elle-même, pas seulement à l'écran : chaque enregistrement
--      engendré porte une marque que l'export, l'impression et le journal reprennent. Un
--      jeu reconnaissable seulement par un bandeau devient indiscernable dès la première
--      exportation. »
--
--  Le motif est celui du brief d'origine, qui interdisait les données de démonstration :
--  **un outil produit en audit ne doit jamais laisser un doute sur l'origine d'une ligne.**
--  La marque ne rend pas le jeu de découverte inoffensif ; elle rend sa provenance
--  irréfutable, y compris hors de l'écran qui l'a affichée.
--
--  ── POURQUOI LA LISTE DES TABLES EST DÉCOUVERTE, ET NON ÉCRITE ─────────────────────
--
--  Le critère d'acceptation 18b.1 le dit en toutes lettres :
--
--    « ⚠️ La liste des entités marquées est découverte dans le catalogue, pas écrite à la
--      main : une entité oubliée produirait une ligne de démonstration INDISCERNABLE
--      d'une ligne réelle — exactement l'échec silencieux que la règle des listes
--      proscrit. »
--
--  C'est le cas (a) du `CLAUDE.md` §3 : *quelque chose réussirait en silence alors que
--  c'est faux*. On ne l'écrit donc pas — **on part du catalogue** (`CONVENTIONS.md` §39.4).
--
--  Le critère de découverte est **porte `filiale_id` ET porte `cree_par`**. Ces deux
--  colonnes ensemble définissent exactement « une ligne saisie par quelqu'un, à
--  l'intérieur d'une filiale » — c'est-à-dire une **entité métier**, par opposition aux
--  registres techniques (sans `cree_par`) et au journal d'audit (qui porte
--  `utilisateur_id`, jamais `cree_par`, parce qu'il n'est pas saisi mais émis).
--
--  Mesuré à l'écriture, sur la recette : **52 tables**, dont **35** portent `filiale_id`,
--  dont **32** portent aussi `cree_par`. Ce sont ces 32 moins trois écarts qui reçoivent
--  la marque.
--
--  ── ⚠️ POURQUOI « provenance » ET NON « origine », QUE LE PLAN NOMMAIT ─────────────
--
--  Le critère 18b.1 écrit « une colonne `origine` valant `decouverte` ». **Ce nom est
--  déjà pris, et il veut déjà dire autre chose — deux fois :**
--
--    · `referentiels_actifs.origine` — `socle_groupe` (imposé par le Groupe) vs
--      `ajout_local` (ajouté par la filiale) ;
--    · `risque_catalogue.origine`    — `interne` vs ce qui vient d'un référentiel.
--
--  Réutiliser le mot aurait produit **deux colonnes homonymes de sens différents dans le
--  même schéma**, et le `add column if not exists` aurait silencieusement NE RIEN FAIT sur
--  ces deux tables-là : elles seraient restées sans marque, c'est-à-dire que leurs lignes
--  de démonstration auraient été **indiscernables des réelles** — précisément le défaut
--  que cette migration existe pour empêcher.
--
--  C'est le garde-fou du §4, sens 3, qui l'a fait apparaître, à sa toute première
--  exécution. *La substance du critère est « une marque dans la donnée », pas un nom ;
--  le nom cède, la propriété non.*
--
--  ── ⚠️ ET POURQUOI LE DOMAINE NE PORTE PAS « not null » ────────────────────────────
--
--  La première rédaction déclarait `create domain … not null`. Elle a fait rougir
--  **quinze** anomalies sur trois tables sans rapport (`documents`, `document_etiquettes`,
--  `pieces_jointes`), toutes de la forme « le prédicat n'a pas pu être évalué ».
--
--  La cause : `f_contrainte_accepte()` (migration `028`) éprouve une contrainte en
--  construisant une ligne témoin par `jsonb_populate_record(null::<table>, …)`. **Toute
--  colonne non citée y vaut NULL** — et un domaine `not null` fait alors échouer la
--  construction elle-même, donc l'évaluation, donc le garde. Le garde le plus récent du
--  dépôt aurait été rendu aveugle par une colonne ajoutée ailleurs.
--
--  Le `not null` vit donc **sur la colonne**, où il ne gêne aucune construction de record.
--  *PostgreSQL déconseille d'ailleurs `NOT NULL` dans un domaine, pour cette raison même.*
--
--  ── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────────────
--
--  Elle **ne crée aucune donnée**. Elle pose la marque et son garde ; le semis du jeu de
--  découverte, son refus hors profil et sa purge sont le lot **L18 bis** et vivent dans
--  l'application. Une migration qui sèmerait des lignes de démonstration violerait la
--  condition 2 (« chargé sur geste volontaire uniquement, jamais par l'installateur ») —
--  et `install.sh` joue les migrations.
--
--  Le défaut `'saisie'` vaut pour tout le parc existant : **une ligne écrite avant cette
--  migration a été saisie par quelqu'un**, c'est la seule lecture honnête.
--
-- =====================================================================================
-- Invocation : psql -v ON_ERROR_STOP=1 -d cyber_grc -f 032_la_marque_de_provenance.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §3 ajoute une colonne `not null` avec défaut, et sa contrainte de domaine est validée
-- sur les lignes existantes. Ce balayage porte sur des tables cloisonnées, et
-- `force row level security` s'applique au propriétaire lui-même : sans réglage, la
-- migration échouerait en `GRC04` à une ligne qu'on ne pourrait pas nommer.
--
-- C'est le motif du §0 de la `012`, et il coûte une bissection au `psql` quand on l'oublie.
-- On déclare le groupe ENTIER : un périmètre partiel serait pire que pas de périmètre — la
-- validation ne porterait que sur les lignes visibles, **en silence**.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-032', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LE DOMAINE « provenance_ligne » : TROIS VALEURS, CLOSES
-- =====================================================================================
-- Un domaine plutôt qu'un `check` par table, et le motif est mesuré : le 10ᵉ passage de la
-- porte S8 a montré que **133 contraintes `check` sur 142 se vident** par « … or true »
-- sous zéro anomalie, et que **78 sont invisibles même à la suppression franche**. Un
-- domaine est une forme close, gardée par `f_verifier_domaines_textuels()` et
-- `f_verifier_domaines_eprouves()` — des gardes qui ÉPROUVENT la valeur interdite au lieu
-- de reconnaître un mot (`CONVENTIONS.md` §39.1).
--
-- Trois valeurs, et pas une de plus :
--
--   · `saisie`      quelqu'un l'a tapée. C'est le défaut, et c'est le cas de tout le parc.
--   · `decouverte`  engendrée par le jeu de découverte (lot L18 bis).
--   · `reprise`     entrée par `POST /api/reprise`, c'est-à-dire recopiée d'un export.
--
-- ⚠️ **`import` n'est PAS une valeur**, et c'est délibéré. Une ligne importée depuis un
-- classeur du client EST une donnée réelle : lui donner une provenance distincte inviterait
-- tôt ou tard à la traiter comme moins vraie. La trace de l'import vit dans la table
-- `imports` et au journal, là où elle a un sens.
--
-- ⚠️ Pas de `not null` ici : voir l'en-tête. Il casserait `f_contrainte_accepte()`.

create domain provenance_ligne as text
    default 'saisie'
    constraint ck_provenance_ligne check (value in ('saisie', 'decouverte', 'reprise'));

comment on domain provenance_ligne is
    'D''où vient une ligne : saisie (quelqu''un l''a tapée), decouverte (jeu de découverte '
    'du lot L18 bis), reprise (recopiée d''un export grc-backup). Condition constitutive '
    'n° 1 du jeu de découverte — arbitrage A2 du 08/09/2026. Une ligne de démonstration '
    'doit rester reconnaissable À L''EXPORT et À L''IMPRESSION, pas seulement à l''écran. '
    '⚠️ Le « not null » est porté par chaque COLONNE, jamais par ce domaine : dans un '
    'domaine il ferait échouer jsonb_populate_record(null::<table>, …), donc le garde-fou '
    'f_contrainte_accepte() de la migration 028.';

-- =====================================================================================
-- §2 — LE DOMAINE EST RANGÉ PARMI LES FORMES TECHNIQUES
-- =====================================================================================
-- `f_verifier_domaines_textuels()` (migration `029`) exige qu'un domaine textuel neuf soit
-- rangé : « technique » (forme close) ou « saisie libre » (de la prose, qui doit entrer
-- dans le balayage des données personnelles). Sans ce rangement, le déploiement rougit —
-- et c'est voulu : *une exclusion qui ne se déclare pas se transmet en silence* (Q-295).
--
-- `provenance_ligne` est **technique** : trois valeurs closes, aucune saisie libre, aucune
-- personne. La fonction est reposée entière — elle porte sa liste dans son corps — et le
-- seul écart avec la version de la `029` est l'ajout de la ligne `provenance_ligne`.

create or replace function f_verifier_domaines_textuels()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les domaines TECHNIQUES : une forme close, jamais de la prose. Ils sont écartés du
    -- balayage des données personnelles, et c'est une DÉCISION, pas un effet de bord.
    v_techniques constant text[] := array[
        'id_metier',            -- identifiant engendré par le produit
        'code_langue',          -- 'fr', 'en', 'es'
        'empreinte_sha256',     -- 64 hexadécimaux
        'type_entite',          -- vocabulaire clos des entités
        'niveau_droit',         -- vocabulaire clos des niveaux d'accès
        'domaine_fonctionnel',  -- vocabulaire clos des domaines métier
        'provenance_ligne'      -- saisie / decouverte / reprise (migration 032)
    ];
    -- Les domaines qui portent de la SAISIE LIBRE, s'il en apparaît un : leurs colonnes
    -- doivent rentrer dans le balayage, et `f_colonnes_textuelles()` doit les admettre.
    v_saisie_libre constant text[] := array[]::text[];
    r record;
    v_nom text;
begin
    for r in
        select t.typname::text as nom
          from pg_type t
          join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
          join pg_type bt on bt.oid = t.typbasetype
         where t.typtype = 'd'
           and bt.oid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype)
           and not (t.typname::text = any (v_techniques))
           and not (t.typname::text = any (v_saisie_libre))
         order by 1
    loop
        objet    := r.nom;
        anomalie := 'domaine_textuel_non_range';
        detail   := 'Ce domaine repose sur un type textuel, et rien ne dit si ses colonnes '
                    'peuvent porter de la SAISIE LIBRE. f_colonnes_textuelles() les écarte '
                    'du balayage des données personnelles — ce qui est juste pour une forme '
                    'technique (un identifiant, un code de langue) et FAUX EN SILENCE pour '
                    'un domaine qui porterait de la prose. Rangez-le dans '
                    'f_verifier_domaines_textuels() : « technique » ou « saisie libre ». '
                    '⚠️ C''est le renversement du constat Q-295 appliqué à sa propre '
                    'exception : une exclusion qui ne se déclare pas se transmet en silence.';
        return next;
    end loop;

    foreach v_nom in array v_techniques || v_saisie_libre loop
        if to_regtype('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'domaine_range_introuvable';
            detail   := 'domaine déclaré dans f_verifier_domaines_textuels() et introuvable : '
                        'la décision couvrirait tout domaine futur qui reprendrait ce nom.';
            return next;
        end if;
    end loop;
    return;
end;
$$;

-- =====================================================================================
-- §3 — LA COLONNE, POSÉE SUR LES ENTITÉS MÉTIER DÉCOUVERTES DANS LE CATALOGUE
-- =====================================================================================
-- On ne nomme aucune table : on les DÉCOUVRE. Les trois écarts sont déclarés, et le §4
-- les connaît nommément — un écart tu est un écart qui se perd.

do $$
declare
    -- Les trois écarts déclarés. Écrits à la main À DESSEIN : leur oubli n'est pas
    -- silencieux, il fait rougir le garde du §4, qui exige que tout écart soit ici.
    -- C'est le cas (b) du `CLAUDE.md` §3 — la liste est le bon outil quand son
    -- incomplétude ÉCHOUE BRUYAMMENT, et ici elle échoue vraiment.
    --
    --   · `parametres` — ce n'est pas une entité saisie, c'est la configuration de la
    --                    filiale. Un jeu de découverte ne crée pas de paramètre ; il
    --                    emprunte ceux qui existent.
    --   · `groupes_ad` — miroir de l'annuaire, écrit par la synchronisation, jamais par un
    --                    utilisateur. Le marquer laisserait croire qu'un groupe d'annuaire
    --                    peut être « de découverte », ce qui n'a pas de sens.
    --   · `imports`    — la trace d'un import ; sa provenance est déjà dite par sa nature.
    v_ecarts constant text[] := array['parametres', 'groupes_ad', 'imports'];
    r        record;
    v_posees int := 0;
begin
    for r in
        select c.relname::text as table_nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'filiale_id'
                          and a.attnum > 0 and not a.attisdropped)
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'cree_par'
                          and a.attnum > 0 and not a.attisdropped)
           and not (c.relname::text = any (v_ecarts))
         order by 1
    loop
        execute format(
            'alter table %I add column if not exists provenance provenance_ligne not null',
            r.table_nom);
        execute format($fmt$
            comment on column %I.provenance is
                'D''où vient cette ligne (domaine provenance_ligne, migration 032) : saisie, '
                'decouverte ou reprise. Reprise à l''export et à l''impression — condition '
                'constitutive n° 1 du jeu de découverte.'
        $fmt$, r.table_nom);
        v_posees := v_posees + 1;
    end loop;

    raise notice 'migration 032 : marque de provenance posée sur % table(s) métier, % écart(s) déclaré(s)',
                 v_posees, array_length(v_ecarts, 1);

    -- Un garde-fou qui ne trouverait RIEN passerait au vert sans rien garder : c'est le
    -- motif du constat Q-312, où `f_domaine_accepte()` n'était appelée par personne.
    -- On refuse ici de poursuivre sur un balayage vide.
    if v_posees = 0 then
        raise exception 'migration 032 : aucune entité métier découverte — le critère '
                        '(filiale_id ET cree_par) ne rend rien. Refus : poser une marque '
                        'sur zéro table reviendrait à ne rien poser, au vert.';
    end if;
end;
$$;

-- ── LE REGISTRE DE L'ARTICLE 30 RÉCLAME UNE DÉCISION POUR TOUTE COLONNE ─────────────
-- `f_verifier_colonnes_personnelles()` balaie TOUT le schéma depuis la `031` : chaque
-- colonne neuve doit être décidée, ou le déploiement rougit (constats Q-295, A-3 du 9ᵉ
-- passage). `provenance` n'est pas une donnée personnelle — c'est une provenance —, et
-- c'est une réponse recevable dès lors qu'elle est motivée.
--
-- ⚠️ La décision est posée **par découverte**, sur les mêmes tables que ci-dessus : une
-- liste écrite ici se serait désynchronisée du §3 à la première table neuve.

insert into colonnes_personnelles (table_nom, colonne, nature, justification)
select a.attrelid::regclass::text, 'provenance', 'non_personnelle',
       'Vocabulaire clos ou valeur technique : d''où vient la ligne (saisie / decouverte / '
       'reprise), posée par la migration 032. Ne désigne aucune personne — elle dit COMMENT '
       'la ligne est entrée dans la base, jamais QUI y figure. Aucune saisie libre : le '
       'domaine « provenance_ligne » ferme le vocabulaire.'
  from pg_attribute a
 where a.attname = 'provenance'
   and a.attnum > 0 and not a.attisdropped
   and a.atttypid = 'provenance_ligne'::regtype
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §3 bis — LA MARQUE EST POSÉE PAR LA BASE, JAMAIS PAR L'APPELANT
-- =====================================================================================
-- ⚠️ **C'est ici que la condition constitutive n° 1 devient une propriété plutôt qu'une
-- intention.** Une marque que la couche applicative écrit est une marque que la couche
-- applicative peut se tromper d'écrire — et il suffit d'un chemin d'écriture oublié pour
-- qu'une ligne de démonstration reparte en `saisie`, c'est-à-dire redevienne
-- indiscernable d'une ligne réelle.
--
-- On applique donc exactement le dispositif de `cree_par`, qui est la **couche 4** de la
-- garantie d'ajout seul du journal (`CONVENTIONS.md` §12) : **la valeur vient d'un
-- réglage de transaction, et c'est un déclencheur qui la pose.** Trois conséquences, et
-- ce sont les trois qu'on cherche :
--
--   · **aucun appelant ne peut forger sa provenance** — ni l'API, ni `psql`, ni un import :
--     la valeur envoyée dans l'`insert` est ÉCRASÉE ;
--   · **aucun chemin d'écriture ne peut l'oublier** — le déclencheur est sur la table, pas
--     sur la route, et il y a toujours une route de plus (leçon des constats Q-232/Q-233) ;
--   · **le semis du jeu de découverte n'a rien à énumérer** : il pose `grc.provenance` une
--     fois, et tout ce qu'il écrit dans cette transaction est marqué — quelles que soient
--     les tables touchées, y compris celles qui n'existeront que demain.
--
-- Le réglage absent vaut `saisie` : c'est le cas de toute écriture ordinaire, et c'est la
-- seule lecture honnête d'une ligne dont personne n'a déclaré la provenance.
--
-- ⚠️ `set_config(..., true)` — portée TRANSACTION. Un réglage de session survivrait à la
-- transaction et marquerait `decouverte` tout ce que la connexion écrirait ensuite, y
-- compris après que le pool l'a rendue à quelqu'un d'autre. *Le défaut serait silencieux,
-- et il produirait exactement l'inverse de ce que cette migration existe pour tenir.*

create or replace function f_marquer_provenance()
returns trigger
    language plpgsql
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_declaree text := nullif(current_setting('grc.provenance', true), '');
begin
    -- La valeur de l'appelant n'est pas consultée : elle est remplacée. Un `insert`
    -- portant « provenance = 'saisie' » sur une ligne de découverte serait sinon une
    -- marque effacée par celui-là même qu'elle décrit.
    new.provenance := coalesce(v_declaree, 'saisie');
    return new;
end;
$$;

comment on function f_marquer_provenance() is
    'Pose la marque de provenance depuis le réglage de transaction « grc.provenance » '
    '(migration 032). La valeur envoyée par l''appelant est ÉCRASÉE : une marque forgeable '
    'ne prouve rien, et le contrôle « la base porte-t-elle des données réelles ? » du jeu '
    'de découverte s''appuie dessus. Réglage absent = « saisie ».';

do $$
declare
    r        record;
    v_poses  int := 0;
begin
    for r in
        select a.attrelid::regclass::text as table_nom
          from pg_attribute a
         where a.attname = 'provenance' and a.attnum > 0 and not a.attisdropped
           and a.atttypid = 'provenance_ligne'::regtype
         order by 1
    loop
        execute format('drop trigger if exists trg_%s_provenance on %I',
                       r.table_nom, r.table_nom);
        -- `enable always` : sans cela, « set session_replication_role = replica »
        -- désarmerait la marque, et c'est la couche 3 de la garantie du journal.
        execute format(
            'create trigger trg_%s_provenance before insert on %I '
            'for each row execute function f_marquer_provenance()',
            r.table_nom, r.table_nom);
        execute format('alter table %I enable always trigger trg_%s_provenance',
                       r.table_nom, r.table_nom);
        v_poses := v_poses + 1;
    end loop;

    raise notice 'migration 032 : déclencheur de marque posé sur % table(s)', v_poses;

    if v_poses = 0 then
        raise exception 'migration 032 : aucune table ne porte « provenance » — le §3 n''a '
                        'donc rien fait, et poser zéro déclencheur passerait au vert.';
    end if;
end;
$$;

-- =====================================================================================
-- §4 — LE GARDE-FOU : UNE ENTITÉ MÉTIER SANS MARQUE DE PROVENANCE FAIT ROUGIR
-- =====================================================================================
-- Sans lui, la propriété tiendrait le jour de la migration et se perdrait à la première
-- table neuve — c'est-à-dire exactement le défaut que la condition 18b.1 décrit : **une
-- ligne de démonstration indiscernable d'une ligne réelle.**
--
-- Il balaie dans les TROIS SENS, parce qu'un seul sens laisse toujours une moitié ouverte
-- (`CONVENTIONS.md` §39.6) :
--
--   sens 1 — une entité métier (filiale_id + cree_par) SANS `provenance`, et qui n'est pas
--            un écart déclaré : la marque manque ;
--   sens 2 — un écart déclaré qui ne satisfait PLUS le critère, ou qui a disparu : la
--            déclaration ne désigne plus rien, et une dérogation périmée MENT ;
--   sens 3 — une colonne nommée `provenance` qui n'est PAS du domaine : elle échapperait
--            au vocabulaire clos. ⚠️ **C'est ce sens-là qui a trouvé la collision de nom
--            avec `origine`**, à sa première exécution — voir l'en-tête.

create or replace function f_verifier_marque_provenance()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    v_ecarts constant text[] := array['parametres', 'groupes_ad', 'imports'];
    r record;
begin
    /* ── SENS 1 : une entité métier sans marque ─────────────────────────────────── */
    for r in
        select c.relname::text as table_nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'filiale_id' and a.attnum > 0 and not a.attisdropped)
           and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped)
           and not (c.relname::text = any (v_ecarts))
           and not exists (select 1 from pg_attribute a where a.attrelid = c.oid
                            and a.attname = 'provenance' and a.attnum > 0 and not a.attisdropped)
         order by 1
    loop
        objet    := r.table_nom;
        anomalie := 'marque_provenance_absente';
        detail   := 'Cette table porte « filiale_id » ET « cree_par » : c''est une entité '
                    'MÉTIER, et toute ligne métier doit dire d''où elle vient. Ajoutez '
                    '« provenance provenance_ligne not null », ou déclarez l''écart avec son '
                    'motif dans f_verifier_marque_provenance() ET dans la migration 032 §3. '
                    '⚠️ Sans marque, une ligne du jeu de découverte serait INDISCERNABLE '
                    'd''une ligne réelle dès le premier export — c''est la condition '
                    'constitutive n° 1 de l''arbitrage A2 du 08/09/2026.';
        return next;
    end loop;

    /* ── SENS 2 : un écart déclaré qui ne désigne plus rien ─────────────────────── */
    for r in
        select e.nom as table_nom
          from unnest(v_ecarts) as e(nom)
         where not exists (
                 select 1 from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r' and c.relname::text = e.nom
                    and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                 and a.attname = 'filiale_id' and a.attnum > 0 and not a.attisdropped)
                    and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                 and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped))
         order by 1
    loop
        objet    := r.table_nom;
        anomalie := 'ecart_marque_provenance_perime';
        detail   := 'Cette table est déclarée comme un écart à la marque de provenance, mais '
                    'elle ne satisfait plus le critère (filiale_id ET cree_par) — ou elle '
                    'n''existe plus. Une dérogation qui ne désigne plus rien MENT : retirez-la '
                    'de f_verifier_marque_provenance() et de la migration 032 §3, ou dites '
                    'pourquoi elle reste.';
        return next;
    end loop;

    /* ── SENS 3 : une colonne « provenance » hors du domaine ────────────────────── */
    for r in
        select a.attrelid::regclass::text as table_nom,
               format_type(a.atttypid, a.atttypmod) as type_reel
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and a.attname = 'provenance' and a.attnum > 0 and not a.attisdropped
           and a.atttypid <> 'provenance_ligne'::regtype
         order by 1
    loop
        objet    := r.table_nom || '.provenance';
        anomalie := 'marque_provenance_hors_domaine';
        detail   := 'Cette colonne s''appelle « provenance » mais n''est pas du domaine '
                    '« provenance_ligne » (type réel : ' || r.type_reel || '). Son vocabulaire '
                    'n''est donc pas clos, et rien n''empêche une quatrième valeur d''y '
                    'entrer. ⚠️ Le 10ᵉ passage de la porte S8 a mesuré qu''un « check » se '
                    'vide par « … or true » sous zéro anomalie ; un domaine, non.';
        return next;
    end loop;

    /* ── SENS 4 : la marque est-elle POSÉE, et le déclencheur est-il ARMÉ ? ───────
       Une colonne sans son déclencheur accepterait la valeur de l'appelant : la marque
       deviendrait forgeable, donc sans valeur de preuve.

       ⚠️ On mesure `tgtype` et `tgenabled`, **jamais la seule existence d'un nom** —
       c'est le constat Q-281 : les gardes des migrations `017` et `019` vérifiaient
       qu'un déclencheur EXISTE et est armé, jamais SUR QUOI il se déclenche, et les
       deux barrières étaient mortes sous zéro anomalie.
         tgtype 1 = FOR EACH ROW · 2 = BEFORE · 4 = INSERT  →  attendu : les trois.
         tgenabled 'A' = ALWAYS — sans quoi « session_replication_role = replica »
         désarme la marque, ce qui est la couche 3 de la garantie du journal. */
    for r in
        select a.attrelid::regclass::text as table_nom,
               t.tgtype, t.tgenabled
          from pg_attribute a
          left join pg_trigger t
                 on t.tgrelid = a.attrelid and not t.tgisinternal
                and t.tgfoid = 'f_marquer_provenance'::regproc
         where a.attname = 'provenance' and a.attnum > 0 and not a.attisdropped
           and a.atttypid = 'provenance_ligne'::regtype
           and (t.oid is null or (t.tgtype & 7) <> 7 or t.tgenabled <> 'A')
         order by 1
    loop
        objet    := r.table_nom;
        anomalie := case when r.tgtype is null then 'marque_provenance_sans_declencheur'
                         else 'marque_provenance_declencheur_devoye' end;
        detail   := 'La colonne « provenance » existe, mais rien ne la POSE : '
                    || case when r.tgtype is null
                            then 'aucun déclencheur n''appelle f_marquer_provenance().'
                            else 'le déclencheur existe mais ne se déclenche pas « before '
                                 'insert for each row », ou n''est pas armé « always » '
                                 '(tgtype=' || r.tgtype::text || ', tgenabled='
                                 || r.tgenabled::text || ').' end
                    || ' ⚠️ Sans lui, la valeur vient de l''APPELANT : la marque devient '
                    'forgeable, et le contrôle « la base porte-t-elle des données réelles ? » '
                    'du jeu de découverte n''est plus qu''une politesse. ⚠️ Ce sens mesure '
                    '« tgtype », jamais le seul nom — leçon du constat Q-281, où deux '
                    'barrières étaient mortes sous zéro anomalie.';
        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_marque_provenance() is
    'Garde-fou : toute entité métier (filiale_id + cree_par) porte la marque « provenance », '
    'les écarts déclarés désignent encore quelque chose, et aucune colonne « provenance » '
    'n''échappe au domaine. Condition constitutive n° 1 du jeu de découverte (A2, '
    '08/09/2026). Découvert par f_decouvrir_controles_schema(), appelé par '
    'f_verifier_schema().';

-- =====================================================================================
-- §4 bis — LE DOMAINE NEUF EST ÉPROUVÉ, ET LA LISTE DES ÉPROUVÉS CESSE D'ÊTRE MUETTE
-- =====================================================================================
-- ⚠️ **Trouvé en mutant la migration qu'on vient d'écrire**, et c'est la classe que le
-- 10ᵉ passage de la porte S8 a nommée deux heures plus tôt (constat A-2) :
--
--     alter domain provenance_ligne drop constraint ck_provenance_ligne;
--     alter domain provenance_ligne add  constraint ck_provenance_ligne
--           check ((value in ('saisie','decouverte','reprise')) or true);
--     select count(*) from f_verifier_schema();        →  0
--
-- Le vocabulaire se vide, le nom reste, les littéraux restent, et **le déploiement passe
-- au vert**. Le garde qui devrait le voir — `f_verifier_domaines_eprouves()`, posé par la
-- `031` précisément pour ça — porte une **liste de témoins écrite à la main** couvrant
-- « les six domaines du schéma ». Un **septième** domaine n'y entre jamais.
--
-- C'est le cas (a) du `CLAUDE.md` §3 sous sa forme la plus pure : *un domaine non éprouvé
-- RÉUSSIT EN SILENCE.* Deux moitiés, donc, et la seconde compte plus que la première :
--
--   1. `provenance_ligne` reçoit ses témoins, dans les deux sens ;
--   2. **le garde DÉCOUVRE les domaines dans le catalogue** et rend une anomalie pour tout
--      domaine sans témoin. Le prochain domaine neuf fera rougir le déploiement **le jour
--      où il est créé**, et non le jour où quelqu'un pensera à l'éprouver.
--
-- *Corriger l'instance sans la classe est le travers que ce chantier a payé sept fois
-- (`CONVENTIONS.md` §39) — et ici la classe coûte douze lignes de plus que l'instance.*

create or replace function f_verifier_domaines_eprouves()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Chaque témoin : le domaine, la valeur, ce qu'on en attend, et POURQUOI.
    v_temoins constant jsonb := jsonb_build_array(
        -- ── id_metier : la forme de TOUT identifiant métier du produit ──────────────
        jsonb_build_object('d','id_metier','v','', 'attendu', false,
            'motif','la chaîne VIDE doit être refusée : c''est par le domaine que la couche '
                    'd''écriture DÉCOUVRE qu''un identifiant ne peut pas être vide, et le '
                    'constat Q-194 est né de son absence'),
        jsonb_build_object('d','id_metier','v','  RSK-1  ', 'attendu', false,
            'motif','un identifiant non rogné doit être refusé : sans cela deux lignes qui '
                    'ne diffèrent que par un espace de bordure deviennent deux '
                    'enregistrements distincts (constat Q-310)'),
        jsonb_build_object('d','id_metier','v','RSK-1,B', 'attendu', false,
            'motif','la virgule est le séparateur des listes de périmètre : l''admettre dans '
                    'un identifiant ferait d''un identifiant deux, à la relecture'),
        jsonb_build_object('d','id_metier','v','RSK-1789000000000-abcdefghijklmno',
            'attendu', true,
            'motif','un identifiant ordinaire du produit doit passer : un domaine qui '
                    'refuse ce que le produit engendre est un défaut d''une autre nature'),
        -- ── type_entite : il borne le lien POLYMORPHE des pièces jointes ────────────
        jsonb_build_object('d','type_entite','v','documents', 'attendu', true,
            'motif','« documents » est l''un des porteurs de pièces jointes : le refuser '
                    'casserait le dépôt'),
        jsonb_build_object('d','type_entite','v','risques', 'attendu', true,
            'motif','idem « documents »'),
        jsonb_build_object('d','type_entite','v','entite_inventee_par_le_garde',
            'attendu', false,
            'motif','le vocabulaire est CLOS : une valeur inventée ferait une pièce jointe '
                    'attachée sous un nom que nul déclencheur ne porte, donc une pièce qui '
                    'ne suivrait JAMAIS son porteur (constats Q-232 / Q-233)'),
        -- ── les quatre autres domaines, un témoin de chaque sens ────────────────────
        jsonb_build_object('d','code_langue','v','fr', 'attendu', true,
            'motif','le français est la langue par défaut du produit'),
        jsonb_build_object('d','code_langue','v','de', 'attendu', false,
            'motif','le vocabulaire est clos à fr/en/es : une langue non traduite '
                    'afficherait des clés à la place des libellés'),
        jsonb_build_object('d','niveau_droit','v','administration', 'attendu', true,
            'motif','le niveau le plus élevé doit rester écrivable'),
        jsonb_build_object('d','niveau_droit','v','superadmin', 'attendu', false,
            'motif','un niveau inventé serait un niveau que la projection des droits ne '
                    'sait pas comparer — donc un accès dont personne ne connaît la portée'),
        jsonb_build_object('d','domaine_fonctionnel','v','journal', 'attendu', true,
            'motif','le domaine du journal d''audit doit rester déclarable'),
        jsonb_build_object('d','domaine_fonctionnel','v','domaine_invente','attendu', false,
            'motif','un domaine inventé serait un droit que le produit accorde et que '
                    'l''écran ne sait pas nommer'),
        jsonb_build_object('d','empreinte_sha256','v',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'attendu', true, 'motif','une empreinte SHA-256 valide doit passer'),
        jsonb_build_object('d','empreinte_sha256','v','pas-une-empreinte', 'attendu', false,
            'motif','une empreinte qui n''en est pas rendrait le rapprochement d''intégrité '
                    'ininterprétable (migration 020)'),
        -- ── provenance_ligne : la marque du jeu de découverte (migration 032) ───────
        jsonb_build_object('d','provenance_ligne','v','decouverte', 'attendu', true,
            'motif','c''est la valeur que porte chaque ligne du jeu de découverte : un '
                    'domaine qui la refuserait rendrait le jeu INSEMABLE'),
        jsonb_build_object('d','provenance_ligne','v','saisie', 'attendu', true,
            'motif','le défaut de tout le parc existant — le refuser bloquerait toute '
                    'écriture ordinaire'),
        jsonb_build_object('d','provenance_ligne','v','demonstration', 'attendu', false,
            'motif','le vocabulaire est CLOS à trois valeurs. Une quatrième, fût-elle de '
                    'bonne foi, ferait une ligne dont ni la purge du jeu de découverte ni '
                    'le contrôle « la base porte-t-elle des données réelles ? » ne '
                    'sauraient quoi penser — c''est-à-dire une ligne de démonstration '
                    'INDISCERNABLE d''une ligne réelle, le défaut même que la marque '
                    'existe pour empêcher')
    );
    v_temoin  jsonb;
    v_accepte boolean;
    r         record;
begin
    /* ── SENS 1 : chaque témoin décide, et dans le sens attendu ─────────────────── */
    for v_temoin in select * from jsonb_array_elements(v_temoins) loop
        v_accepte := f_domaine_accepte(v_temoin ->> 'd', v_temoin ->> 'v');

        if v_accepte is null then
            objet    := v_temoin ->> 'd';
            anomalie := 'domaine_introuvable';
            detail   := format('Le domaine « %s » n''existe plus. ⚠️ Ce qu''il tenait : %s.',
                               v_temoin ->> 'd', v_temoin ->> 'motif');
            return next;
            continue;
        end if;

        if v_accepte <> (v_temoin ->> 'attendu')::boolean then
            objet    := (v_temoin ->> 'd') || ' ← « ' || (v_temoin ->> 'v') || ' »';
            anomalie := case when (v_temoin ->> 'attendu')::boolean
                             then 'domaine_refuse_une_valeur_legitime'
                             else 'domaine_laisse_passer_l_interdit' end;
            detail   := format(
                'Le domaine %s cette valeur témoin, on attendait l''inverse. %s '
                '⚠️ Ce garde n''a PAS lu le texte du domaine — il a tenté la conversion. Un '
                'domaine vidé par « … or true », qui garde son nom et ses littéraux, est '
                'donc visible ici, et il ne l''était NULLE PART ailleurs : la mutation a été '
                'jouée au 9ᵉ passage de la porte S8, et « insert into risques (id) values '
                '('''') » est passé sous un f_verifier_schema() à zéro anomalie (constat '
                'A-1, qui est Q-310 et Q-194 rouverts).',
                case when v_accepte then 'ACCEPTE' else 'REFUSE' end,
                v_temoin ->> 'motif');
            return next;
        end if;
    end loop;

    /* ── SENS 2 : un domaine du CATALOGUE que personne n'éprouve — migration 032 ──
       Le balayage part du catalogue, jamais de la liste (`CONVENTIONS.md` §39.4). Sans
       ce sens, la liste ci-dessus est muette sur ce qu'elle ne contient pas : mesuré le
       14/09/2026, `provenance_ligne` — créé la même heure — se vidait par « … or true »
       sous ZÉRO anomalie, parce qu'aucun témoin ne le nommait. */
    for r in
        select t.typname::text as nom
          from pg_type t
          join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
         where t.typtype = 'd'
           and not exists (
                 select 1 from jsonb_array_elements(v_temoins) as e(x)
                  where e.x ->> 'd' = t.typname::text)
         order by 1
    loop
        objet    := r.nom;
        anomalie := 'domaine_sans_temoin';
        detail   := 'Ce domaine existe et **aucun témoin ne l''éprouve**. Son vocabulaire '
                    'peut donc se vider par « … or true » — nom conservé, littéraux '
                    'conservés — sous un f_verifier_schema() à zéro anomalie. Ajoutez-lui '
                    'au moins deux témoins dans f_verifier_domaines_eprouves() : une valeur '
                    'légitime qui doit PASSER, une valeur interdite qui doit être REFUSÉE. '
                    '⚠️ Un seul sens ne suffit pas : un domaine qui refuse tout passerait le '
                    'témoin négatif en cassant le produit. C''est le constat A-2 du 10ᵉ '
                    'passage de la porte S8, fermé à la CLASSE et non à l''instance.';
        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_domaines_eprouves() is
    'ÉPROUVE les domaines du schéma : des valeurs témoins, dans les DEUX sens, tentées par '
    'conversion réelle — jamais par lecture du texte de la contrainte. ⚠️ Depuis la '
    'migration 032, il balaie aussi le CATALOGUE et rend « domaine_sans_temoin » pour tout '
    'domaine que personne n''éprouve : la liste de témoins ne peut plus être muette sur ce '
    'qu''elle ne contient pas.';

-- =====================================================================================
-- §5 — CONSIGNATION
-- =====================================================================================
-- Le registre des garde-fous se remplit par DÉCOUVERTE (migration `005`) : on n'inscrit
-- rien à la main ici, on demande au registre de se réobserver. Un garde-fou qui cesse
-- d'être découvert ne s'efface plus en silence.

select f_consigner_controles_schema();

insert into migrations_schema (version, nom)
values ('032', 'la marque de provenance : toute entité métier découverte dans le catalogue '
               'dit si sa ligne a été saisie, engendrée par le jeu de découverte, ou reprise '
               'd''un export — condition constitutive n° 1 de l''arbitrage A2')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_marque_provenance();
--   delete from controles_schema where fonction = 'f_verifier_marque_provenance';
--   delete from colonnes_personnelles where colonne = 'provenance';
--   -- puis, table par table : alter table <t> drop column provenance;
--   drop domain if exists provenance_ligne;
--   -- ⚠️ f_verifier_domaines_textuels() doit être RÉTABLIE dans sa version de la 029,
--   --    sans quoi elle citerait un domaine disparu et rendrait « domaine_range_introuvable ».
--   delete from migrations_schema where version = '032';
--   commit;
--   -- ⚠️ Annuler cette migration RETIRE la condition constitutive n° 1 du jeu de
--   --    découverte. Si le jeu a déjà été semé, ses lignes deviennent indiscernables des
--   --    lignes réelles — purgez-le AVANT d'annuler, jamais après.
-- =====================================================================================
