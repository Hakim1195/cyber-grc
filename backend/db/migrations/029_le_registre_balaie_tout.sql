-- =====================================================================================
--  029 — LE REGISTRE BALAIE TOUT, ET LE MOT « TEXTUELLE » N'A PLUS QU'UN SEUL SENS
--
--  §0  Le périmètre de la migration
--  §1  Deux identifiants métier reprennent leur domaine                        — Q-310
--  §2  « Colonne textuelle » se dit à UN SEUL endroit                          — Q-296
--  §3  Le balayage du registre est RENVERSÉ : tout est candidat                — Q-295
--  §4  Le semis — cent trente-neuf décisions de plus
--  §5  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  ── Q-295 — le garde affirmait sa propre complétude, et c'était circulaire ──────────
--
--  `f_verifier_colonnes_personnelles()` ne réclamait une décision que pour les colonnes
--  dont le NOM désigne une personne, ou celles de quatre tables nommées. Son commentaire
--  écrivait :
--
--    « ⚠️ La liste des tables de (b) est écrite à la main, et c'est le cas (a) du
--      `CLAUDE.md` §3 : son incomplétude ÉCHOUE BRUYAMMENT ici même, puisqu'une table qui
--      s'y ajoute fait apparaître ses colonnes comme non décidées. »
--
--  **L'affirmation est circulaire, et elle est fausse.** Ce qui faisait rougir, c'était
--  l'ajout d'une table À LA LISTE. Une table neuve ABSENTE de la liste ne produisait
--  rien. Mesuré par l'auditeur, sur une base jetable :
--
--      create table intervenants (… patronyme text, civilite text, portable text …);
--      select controle, objet, anomalie from f_verifier_schema();   →  (0 rows)
--
--      alter table actifs add column commentaire_rh text;           →  0 anomalie
--
--  Trois colonnes nominatives que **rien** ne réclame, dans l'artefact même dont c'est la
--  fonction : la pièce qu'on présente à un DPO pour répondre à *« quelles données
--  personnelles votre outil détient-il ? »*
--
--  ⚠️ **LE SENS DU BALAYAGE EST DONC RENVERSÉ**, comme `f_verifier_couverture_rls()`
--  l'avait été au constat Q-5 : **toute** colonne textuelle du schéma est candidate, et le
--  registre est la liste des décisions. Le semis passe de 58 à 197 lignes ; c'est le prix
--  d'une propriété qui tient. Une table neuve porteuse de personnes fait rougir le jour
--  où elle est créée, et non le jour où quelqu'un pense à l'inscrire quelque part.
--
--  ── Q-296 — deux moitiés qui ne parlaient pas du même ensemble ──────────────────────
--
--      f_verifier_colonnes_personnelles()   format_type(…) = 'text'
--      colonnesTextuelles()  (src/cycle)    format_type(…) in ('text','character varying')
--      le balayage du banc                  in ('text','character varying')
--
--  Une colonne `varchar` portant un nom de personne serait (a) jamais réclamée au
--  registre, (b) jamais anonymisée, et (c) rendue en « anomalie » à CHAQUE purge sans que
--  personne ne sache pourquoi. Classe Q-194 : *un défaut qui vit entre deux fichiers dont
--  aucun n'a tort seul*. Latent — le schéma ne porte aucune `varchar` (mesuré : 284 `text`,
--  114 `id_metier`, aucune `varchar`) — et il suffit d'une.
--
--  **Un seul endroit décide** : `f_colonnes_textuelles()`, que le garde, la purge et le
--  banc appellent tous les trois.
--
--  ── Q-310 — trouvé en écrivant celle-ci, et c'est la classe de Q-194 ────────────────
--
--  `risque_catalogue.id` et `risque_catalogue.filiale_id` sont de type `text` nu, pas du
--  domaine `id_metier` que porte TOUTE autre colonne d'identifiant du schéma. Mesuré :
--
--      insert into risque_catalogue (id, …) values ('', …);         →  ACCEPTÉ
--      insert into risque_catalogue (id, …) values ('  RSK-1  ', …); →  ACCEPTÉ
--      -- le témoin, sur `risques` (id_metier) :
--      insert into risques (id, …) values ('', …);
--      ERROR:  value for domain id_metier violates check constraint "id_metier_check"
--
--  C'est **mot pour mot le constat Q-194** — la migration `012` avait écrit
--  `catalogue_id text` au lieu du domaine, et `014` l'avait corrigé — sur la table que
--  cette même migration `012` a créée. La correction de l'instance avait laissé la classe.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- Le §1 change le TYPE de deux colonnes de `risque_catalogue` : PostgreSQL revalide alors
-- toutes les lignes existantes, donc il BALAIE une table cloisonnée. `force row level
-- security` s'appliquant au propriétaire lui-même, ce balayage passe par
-- `pol_risque_catalogue_lecture`. Sans réglage, la migration échouerait en GRC04 à cette
-- ligne précise, et le message ne nommerait pas la cause — c'est le motif du §0 de la
-- `012`, et il coûte une bissection au `psql` quand on l'oublie.
--
-- On déclare le groupe ENTIER : un périmètre partiel serait pire que pas de périmètre —
-- la revalidation porterait sur les seules lignes visibles, en silence.

do $$
begin
    perform set_config('grc.utilisateur', 'migration-029', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — Q-310 : DEUX IDENTIFIANTS MÉTIER REPRENNENT LEUR DOMAINE
-- =====================================================================================
--
-- ⚠️ **Ce n'est pas cosmétique, et le §2 de `CONVENTIONS.md` le dit** : le domaine
-- `id_metier` est ce par quoi la couche d'écriture DÉCOUVRE qu'un identifiant ne peut pas
-- être vide — `chargerCatalogue()` résout les types **à travers les domaines**, et
-- `decouvrirVidesInterdits()` lit les contraintes portées par `contypid`. Une colonne
-- `text` nue n'apporte rien de tout cela : l'identifiant vide passe, l'identifiant non
-- rogné passe, et deux lignes qui ne diffèrent que par un espace de bordure deviennent
-- deux risques distincts dans le socle Groupe.

-- ⚠️ **Les politiques RLS doivent être déposées le temps du changement de type**, et
-- c'est PostgreSQL qui l'impose : « cannot alter type of a column used in a policy
-- definition ». Elles sont reposées à l'identique juste après — leur texte vient de
-- `pg_get_expr(polqual, polrelid)`, **relu dans le catalogue, pas écrit de mémoire**.
-- C'est la règle qui a coûté deux fois au chantier (`f_pieces_suivent_leur_porteur`).
--
-- ⚠️ Et le dépôt se fait **dans la même transaction** : entre le `drop policy` et le
-- `create policy`, la table est sans politique — mais `force row level security` reste
-- posée, et une table sans politique ne rend AUCUNE ligne. Le cloisonnement n'est donc
-- pas ouvert une seule instruction, il est fermé plus durement.

drop policy pol_risque_catalogue_lecture     on risque_catalogue;
drop policy pol_risque_catalogue_ajout       on risque_catalogue;
drop policy pol_risque_catalogue_maj         on risque_catalogue;
drop policy pol_risque_catalogue_suppression on risque_catalogue;

alter table risque_catalogue
    alter column id         type id_metier,
    alter column filiale_id type id_metier;

create policy pol_risque_catalogue_lecture on risque_catalogue for select using (
    case when filiale_id is null then true
         else filiale_id = any (f_filiales_lecture()) end);
create policy pol_risque_catalogue_ajout on risque_catalogue for insert with check (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);
create policy pol_risque_catalogue_maj on risque_catalogue for update using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);
create policy pol_risque_catalogue_suppression on risque_catalogue for delete using (
    case when filiale_id is null then f_administration_groupe()
         else filiale_id = f_filiale_ecriture() end);

comment on column risque_catalogue.id is
    'Identifiant métier, domaine « id_metier » — constat Q-310. Elle était de type « text » '
    'nu : la chaîne vide et les identifiants non rognés y entraient, quand toute autre '
    'colonne d''identifiant du schéma les refuse. C''est le constat Q-194 rejoué sur la '
    'table que la même migration 012 avait créée : la correction avait porté sur '
    'l''instance, pas sur la classe.';

-- ── LE GARDE DE CLASSE, pour que ça ne revienne pas ──────────────────────────────────
--
-- Toute colonne nommée `id` ou `<x>_id` porte le domaine `id_metier` — sauf les
-- exceptions DÉCLARÉES, avec leur motif. Les `ref_id` désignent un référentiel du
-- catalogue **statique** (« anssi-hygiene », « iso-27002-2022ial ») : ce ne sont pas des
-- identifiants métier engendrés par le produit, et le §2 des conventions ne les vise pas.

create or replace function f_verifier_domaine_identifiants()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les colonnes d'apparence « identifiant » qui n'en sont PAS. Écrite à la main, et
    -- son incomplétude échoue bruyamment : une exception oubliée fait rougir le
    -- déploiement, elle n'ouvre rien.
    v_exceptions constant text[] := array[
        'ref_id'   -- identifiant d'un référentiel du CATALOGUE STATIQUE (« anssi-hygiene »),
                   -- jamais engendré par le produit : il ne relève pas du §2 des conventions
    ];
    r record;
begin
    for r in
        select c.relname::text as tbl, a.attname::text as col,
               format_type(a.atttypid, a.atttypmod) as typ
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         where c.relkind = 'r'
           and (a.attname = 'id' or a.attname like '%\_id')
           and not (a.attname = any (v_exceptions))
           and format_type(a.atttypid, a.atttypmod) <> 'id_metier'
         order by 1, 2
    loop
        objet    := r.tbl || '.' || r.col;
        anomalie := 'identifiant_sans_domaine';
        detail   := format(
            'Cette colonne d''identifiant est de type « %s » et non du domaine « id_metier ». '
            'Le domaine est ce par quoi la couche d''écriture DÉCOUVRE qu''un identifiant ne '
            'peut être ni vide ni non rogné (chargerCatalogue résout les types À TRAVERS les '
            'domaines) : sans lui, la chaîne vide entre, et deux lignes qui ne diffèrent que '
            'par un espace de bordure deviennent deux enregistrements distincts. C''est le '
            'constat Q-194, rouvert par Q-310. Si ce n''en est pas un, déclarez-le dans '
            'v_exceptions avec son motif.', r.typ);
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_domaine_identifiants() is
    'Toute colonne « id » ou « <x>_id » porte le domaine id_metier, sauf exception déclarée '
    'avec son motif. Posé par le constat Q-310 : deux colonnes de risque_catalogue étaient '
    'restées en « text » nu et acceptaient la chaîne vide — le constat Q-194 rejoué sur la '
    'table que la même migration avait créée, la correction ayant porté sur l''instance et '
    'non sur la classe.';

grant execute on function f_verifier_domaine_identifiants() to grc_app;

-- =====================================================================================
-- §2 — Q-296 : « COLONNE TEXTUELLE » SE DIT À UN SEUL ENDROIT
-- =====================================================================================
--
-- Le garde disait `text` ; la purge disait `text` **et** `character varying`. Les deux
-- moitiés du dispositif ne parlaient pas du même ensemble de colonnes, et aucune n'avait
-- tort seule.
--
-- ⚠️ **`has_column_privilege` n'est pas une précaution de style**, et c'est pourquoi cette
-- fonction ne le pose PAS elle-même : elle est appelée par le garde sous le compte
-- PROPRIÉTAIRE (qui lit tout) et par la purge sous le compte APPLICATIF (qui ne lit pas
-- `utilisateurs.mot_de_passe_hash`). Le filtre de privilège appartient donc à l'appelant,
-- qui seul sait sous quelle identité il balaie. La fonction rend l'ensemble ; elle ne
-- décide pas qui a le droit de l'ouvrir.

create or replace function f_colonnes_textuelles()
returns table (table_nom text, colonne text, cloisonnee boolean)
    language sql stable
    set search_path = pg_catalog, public, pg_temp as
$$
    -- ⚠️ **ON NE COMPARE PAS LE TEXTE DU TYPE, ON REGARDE LE TYPE.** Les trois
    -- rédactions précédentes écrivaient `format_type(…) in ('text', 'character
    -- varying')` — et `format_type` rend **« character varying(120) »** pour une
    -- colonne bornée, c'est-à-dire la forme la plus courante. **Aucune** des trois
    -- moitiés du dispositif n'aurait donc vu un `varchar(n)` : le défaut que
    -- Q-296 décrit était PLUS LARGE que ce que le constat avait mesuré, et il a
    -- fallu **fabriquer la matière** pour s'en apercevoir — le banc restait vert
    -- des deux côtés du correctif (essai `test/base/gardes-eprouves.test.mjs`,
    -- motif Q-210 : *un essai qui couvre une règle sans jamais la faire décider
    -- ne la couvre pas*).
    --
    -- ── CE QU'ON ÉCARTE, ET POURQUOI CE N'EST PAS UN OUBLI ───────────────────
    --
    -- Les colonnes d'un **domaine** sont hors balayage : `id_metier`,
    -- `code_langue`, `empreinte_sha256`, `type_entite`, `niveau_droit`,
    -- `domaine_fonctionnel` sont des FORMES TECHNIQUES que le schéma a déclarées,
    -- et aucune ne peut porter un nom saisi en prose. Y chercher un nom ferait
    -- balayer 114 colonnes d'identifiants pour rien.
    --
    -- ⚠️ **Et cette exclusion ne se transmet pas en silence** : un domaine neuf
    -- sur une base textuelle — qui pourrait, lui, porter de la saisie libre — fait
    -- rougir `f_verifier_domaines_textuels()` ci-dessous tant que personne ne l'a
    -- rangé. C'est le renversement de Q-295 appliqué à sa propre exception.
    select c.relname::text, a.attname::text,
           exists (select 1 from pg_attribute f
                    where f.attrelid = c.oid and f.attname = 'filiale_id'
                      and f.attnum > 0 and not f.attisdropped)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t      on t.oid = a.atttypid
     where c.relkind = 'r'
       and t.typtype = 'b'                      -- type de base, jamais un domaine
       and t.oid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype)
     order by 1, 2;
$$;

comment on function f_colonnes_textuelles() is
    'LA source unique de « colonne textuelle » : le garde-fou du registre, la purge RGPD et '
    'le balayage du banc l''appellent tous les trois. ⚠️ Elle existe parce qu''ils disaient '
    'trois choses différentes — le garde « text », les deux autres « text et character '
    'varying » : une colonne varchar porteuse d''un nom n''aurait jamais été réclamée au '
    'registre, jamais anonymisée, et rendue en « anomalie » à chaque purge (constat Q-296, '
    'classe Q-194). Le filtre de PRIVILÈGE appartient à l''appelant, qui seul sait sous '
    'quelle identité il balaie.';

grant execute on function f_colonnes_textuelles() to grc_app;
grant execute on function f_colonnes_textuelles() to grc_lecture;

-- ── LE GARDE DE L'EXCLUSION : un domaine neuf doit être RANGÉ ────────────────────────
--
-- `f_colonnes_textuelles()` écarte les colonnes d'un domaine. C'est juste
-- aujourd'hui — les six domaines du schéma sont des formes techniques —, et ce serait
-- **faux en silence** le jour où quelqu'un déclare un domaine sur du texte pour porter,
-- par exemple, une note normalisée. Le balayage part donc du catalogue des domaines, et
-- exige une décision pour chacun.

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
        'domaine_fonctionnel'   -- vocabulaire clos des domaines métier
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

comment on function f_verifier_domaines_textuels() is
    'Tout domaine reposant sur un type textuel est RANGÉ : « technique » — forme close, '
    'écartée du balayage des données personnelles — ou « saisie libre ». Posé avec '
    'f_colonnes_textuelles() : son exclusion des domaines est juste pour les six qui '
    'existent, et serait fausse EN SILENCE pour un domaine neuf qui porterait de la prose '
    '(constat Q-296, renversement de Q-295 appliqué à sa propre exception).';

grant execute on function f_verifier_domaines_textuels() to grc_app;

-- =====================================================================================
-- §3 — Q-295 : LE BALAYAGE DU REGISTRE EST RENVERSÉ
-- =====================================================================================
--
-- Sens 1 ne part plus d'un motif de nom ni d'une liste de tables : il part de **toutes**
-- les colonnes textuelles du schéma. Le registre devient la liste des décisions, et une
-- colonne — ou une table — qui apparaît sans décision fait rougir le déploiement.
--
-- ⚠️ **Le seul écart admis reste la traçabilité** (`cree_par`, `modifie_par`), et il est
-- MOTIVÉ, pas hérité : ces colonnes portent un LOGIN, déjà couvert par
-- `utilisateurs.identifiant`, et les inscrire une par table ferait quarante-quatre
-- déclarations qui disent la même chose — *un registre illisible cesse d'être lu*. Cet
-- écart est écrit ici, dans le code qui l'applique, et non dans un commentaire distant.
--
-- Les sens 2 (déclaration orpheline) et 3 (type qui dément le régime, constat Q-300) sont
-- repris de la migration 028 sans changement. Le corps vient de `pg_get_functiondef()`.

create or replace function f_verifier_colonnes_personnelles()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les colonnes de TRAÇABILITÉ : le seul écart au balayage, et il est motivé.
    v_tracabilite constant text[] := array['cree_par', 'modifie_par'];
    r record;
begin
    /* ── SENS 1 : TOUTE colonne textuelle non décidée — constat Q-295 ────────────────
       Le balayage part du CATALOGUE, jamais d'une liste. C'est le renversement que
       `f_verifier_couverture_rls()` a connu au constat Q-5 : une table neuve porteuse de
       personnes fait rougir le jour où elle est créée. */
    for r in
        select t.table_nom, t.colonne
          from f_colonnes_textuelles() t
         where t.table_nom <> 'colonnes_personnelles'
           and not (t.colonne = any (v_tracabilite))
           and not exists (select 1 from colonnes_personnelles p
                            where p.table_nom = t.table_nom and p.colonne = t.colonne)
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'colonne_personnelle_non_decidee';
        detail   := 'Cette colonne textuelle n''est PAS DÉCIDÉE au registre '
                    '« colonnes_personnelles ». Décidez : « personnelle » — avec sa '
                    'finalité, sa base légale, sa durée et ce qu''on en fait à l''expiration '
                    '— ou « non_personnelle », avec sa justification. ⚠️ « Non personnelle » '
                    'est une réponse recevable ; ne pas répondre ne l''est pas : la purge '
                    'RGPD laisserait alors la donnée en place en annonçant « terminé », et '
                    'le registre qu''on présente au DPO serait incomplet sans le dire. '
                    '⚠️ Si la colonne est une saisie libre dont le sujet n''est pas une '
                    'personne mais où un nom peut figurer, le régime est « signaler » : le '
                    'produit montre l''emplacement à un humain au lieu d''effacer.';
        return next;
    end loop;

    /* ── SENS 2 : une entrée du registre qui ne désigne plus rien ────────────────── */
    for r in
        select p.table_nom, p.colonne
          from colonnes_personnelles p
         where not exists (
                 select 1 from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
                   join pg_attribute a on a.attrelid = c.oid and a.attnum > 0
                                      and not a.attisdropped
                  where c.relname = p.table_nom and a.attname = p.colonne)
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'declaration_personnelle_orpheline';
        detail   := 'Le registre déclare cette colonne, et elle n''existe plus dans le '
                    'schéma. Une déclaration orpheline donne à croire qu''une question est '
                    'réglée : retirez-la, ou rétablissez la colonne.';
        return next;
    end loop;

    /* ── SENS 3 : une déclaration dont le TYPE dément le régime — Q-300 ──────────── */
    for r in
        select p.table_nom, p.colonne, p.a_expiration,
               format_type(a.atttypid, a.atttypmod) as typ
          from colonnes_personnelles p
          join pg_class c on c.relname = p.table_nom
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          join pg_attribute a on a.attrelid = c.oid and a.attname = p.colonne
                             and a.attnum > 0 and not a.attisdropped
         where p.a_expiration in ('anonymiser', 'signaler')
           and format_type(a.atttypid, a.atttypmod) not in ('text', 'character varying')
         order by 1, 2
    loop
        objet    := r.table_nom || '.' || r.colonne;
        anomalie := 'declaration_personnelle_de_mauvais_type';
        detail   := format(
            'Le registre déclare cette colonne « %s », et elle est de type « %s ». La purge '
            'y cherche un NOM : elle construit une comparaison textuelle, et la base la '
            'refuse — « function string_to_array(boolean, text) does not exist ». ⚠️ La purge '
            'est TRANSACTIONNELLE : une seule déclaration de ce genre l''avorte ENTIÈREMENT, '
            'pour toutes les filiales, aucune anonymisation, aucune suppression de fiche '
            '(constat Q-300). Déclarez « conserver » ou « supprimer », ou corrigez le nom de '
            'la colonne.', r.a_expiration, r.typ);
        return next;
    end loop;
    return;
end;
$$;

comment on function f_verifier_colonnes_personnelles() is
    'DANS TROIS SENS. (1) TOUTE colonne textuelle du schéma — le balayage part du CATALOGUE, '
    'jamais d''une liste : c''est le renversement du constat Q-295, où une table neuve '
    'porteuse de personnes et une colonne de saisie libre ne produisaient RIEN. (2) Toute '
    'déclaration désigne une colonne qui existe. (3) Toute déclaration dont le régime fait '
    'chercher un NOM porte sur une colonne TEXTUELLE (constat Q-300). ⚠️ Le seul écart est '
    'la traçabilité — « cree_par » / « modifie_par » portent un LOGIN déjà couvert par '
    'utilisateurs.identifiant, et quarante-quatre déclarations identiques rendraient le '
    'registre illisible, donc non lu.';

-- =====================================================================================
-- §4 — LE SEMIS : cent trente-neuf décisions de plus
-- =====================================================================================
--
-- Elles ont été engendrées par famille puis relues une à une. Quatre familles :
--
--   · **vocabulaire clos ou valeur technique** → `non_personnelle`, sans régime. Un
--     statut, un code, un niveau, une version : aucune saisie libre, aucune personne ;
--   · **saisie libre dont le sujet est un objet** → `non_personnelle` avec le régime
--     **`signaler`**. C'est la nuance qui manquait au registre : la colonne n'est pas un
--     champ de données personnelles, mais un nom peut s'y trouver au milieu d'une phrase,
--     et *le remplacer détruirait la phrase*. Le produit montre l'emplacement à un
--     humain — exactement ce que `crise.notes` a fait découvrir ;
--   · **attribut d'une personne morale** → `non_personnelle`. L'adresse d'un
--     établissement, la raison sociale d'un prestataire : le RGPD ne les vise pas ;
--   · **donnée personnelle** → `personnelle`, avec sa finalité, sa base légale, sa durée
--     et son régime. Neuf en « signaler » (les prose d'incidents, le périmètre audité, les
--     destinataires et personnes concernées de l'article 30, la valeur rejetée d'un
--     import) et deux en « conserver » (le résumé du journal inaltérable, et qui a
--     appliqué une migration).
--
-- ⚠️ **`import_erreurs.valeur` mérite d'être lue** : c'est le CONTENU d'une cellule du
-- fichier importé, recopié tel quel. Si la colonne rejetée était un nom, le nom est là —
-- et aucun balayage par nom de colonne ne pouvait le voir. C'est l'argument même du
-- registre, et il ressort ici pour la seconde fois après `utilisateurs.identifiant`.
insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration,
     justification)
values
    ('actif_dependances', 'type', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une typologie bornée. Aucune saisie libre, aucune personne.'),
    ('actifs', 'criticite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un niveau de criticité borné. Aucune saisie libre, aucune personne.'),
    ('actifs', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet décrit (actif, risque, processus, mesure, document…), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('actifs', 'type', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une typologie bornée. Aucune saisie libre, aucune personne.'),
    ('actions', 'commentaire', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet commenté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('actions', 'priorite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un niveau de priorité borné. Aucune saisie libre, aucune personne.'),
    ('actions', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('actions', 'titre', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet intitulé, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('approbations', 'commentaire', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet commenté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('approbations', 'etape', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''étape d''un circuit d''approbation, bornée par une contrainte. Aucune saisie libre, aucune personne.'),
    ('approbations', 'objet_type', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le genre d''objet soumis à approbation. Aucune saisie libre, aucune personne.'),
    ('approbations', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('approbations', 'version_objet', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le numéro de version de l''objet au moment de la décision. Aucune saisie libre, aucune personne.'),
    ('audits', 'audite', 'personnelle', 'Dire ce qui a été audité', 'Intérêt légitime', 1095, 'signaler',
     'Le périmètre audité désigne le plus souvent un service ou un site — mais la saisie est libre et peut nommer un responsable. SIGNALÉ : effacer le périmètre d''un audit rendrait le rapport inexploitable.'),
    ('audits', 'perimetre', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un périmètre — des filiales et des domaines, jamais une personne. Aucune saisie libre, aucune personne.'),
    ('audits', 'ref_id', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''identifiant d''un référentiel du catalogue statique (« anssi-hygiene »…). Aucune saisie libre, aucune personne.'),
    ('audits', 'reference', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une référence de clause ou de document normatif. Aucune saisie libre, aucune personne.'),
    ('audits', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('audits', 'synthese', 'personnelle', 'Rendre les conclusions d''un audit', 'Intérêt légitime', 1095, 'signaler',
     'Une synthèse d''audit nomme les interlocuteurs rencontrés. SIGNALÉE : le rapport est une preuve, il ne se réécrit pas.'),
    ('clients', 'secteur', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — le secteur d''activité d''un donneur d''ordre —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('controles_schema', 'fonction', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le nom d''une fonction SQL de garde-fou. Aucune saisie libre, aucune personne.'),
    ('controles_schema', 'signature', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la signature d''une fonction SQL de garde-fou. Aucune saisie libre, aucune personne.'),
    ('document_referentiels', 'ref_id', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''identifiant d''un référentiel du catalogue statique (« anssi-hygiene »…). Aucune saisie libre, aucune personne.'),
    ('documents', 'emplacement', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est le lieu où réside un document resté ailleurs (chemin, URL), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('documents', 'notes', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet annoté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('documents', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('documents', 'titre', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet intitulé, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('documents', 'type', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une typologie bornée. Aucune saisie libre, aucune personne.'),
    ('documents', 'version_document', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le numéro de version d''un document. Aucune saisie libre, aucune personne.'),
    ('evaluations', 'code', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un code technique ou normatif. Aucune saisie libre, aucune personne.'),
    ('evaluations', 'commentaire', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet commenté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('evaluations', 'preuves', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est les preuves citées à l''appui d''une évaluation, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('evaluations', 'ref_id', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''identifiant d''un référentiel du catalogue statique (« anssi-hygiene »…). Aucune saisie libre, aucune personne.'),
    ('evaluations', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('exigences', 'code', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un code technique ou normatif. Aucune saisie libre, aucune personne.'),
    ('exigences', 'commentaire', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet commenté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('exigences', 'intitule', 'non_personnelle', null, null, null, null,
     'Texte d''une exigence, repris du catalogue de référentiels (statique). Aucune saisie d''utilisateur, aucune personne.'),
    ('exigences', 'statut_conformite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état de conformité d''une exigence, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('filiales', 'adresse', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — l''adresse d''un établissement —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('filiales', 'code', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un code technique ou normatif. Aucune saisie libre, aucune personne.'),
    ('filiales', 'code_postal', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — le code postal d''un établissement —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('filiales', 'notes', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet annoté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('filiales', 'pays', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — le pays d''un établissement —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('filiales', 'raison_sociale', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — la raison sociale d''une filiale —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('filiales', 'site_web', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — le site web d''un établissement —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('filiales', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('filiales', 'ville', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — la ville d''un établissement —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('groupes_ad', 'description', 'non_personnelle', null, null, null, null,
     'Description d''un groupe d''annuaire, écrite par l''administrateur du domaine. Un groupe est un rôle, pas une personne — idem profils.nom.'),
    ('groupes_ad', 'perimetre', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le périmètre qu''un groupe d''annuaire ouvre. Aucune saisie libre, aucune personne.'),
    ('import_erreurs', 'colonne', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le nom d''une colonne du modèle. Aucune saisie libre, aucune personne.'),
    ('import_erreurs', 'message', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''erreur rencontrée pendant un import, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('import_erreurs', 'valeur', 'personnelle', 'Dire à l''utilisateur QUELLE valeur son fichier a fait refuser', 'Intérêt légitime', 1095, 'signaler',
     '⚠️ C''est le CONTENU d''une cellule du fichier importé, recopié tel quel : si la colonne rejetée était un nom, le nom est ici. Invisible d''un balayage par nom de colonne — c''est le motif même de ce registre (classe utilisateurs.identifiant).'),
    ('imports', 'entite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le nom d''une entité du modèle. Aucune saisie libre, aucune personne.'),
    ('imports', 'message', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''erreur rencontrée pendant un import, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('imports', 'source', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la provenance d''un import (nom logique, pas le fichier). Aucune saisie libre, aucune personne.'),
    ('imports', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('incidents', 'actions_immediates', 'personnelle', 'Consigner les gestes faits à chaud', 'Intérêt légitime', 1095, 'signaler',
     'Idem incidents.description.'),
    ('incidents', 'cause_racine', 'personnelle', 'Analyser la cause d''un incident', 'Intérêt légitime', 1095, 'signaler',
     'Idem incidents.description : l''analyse d''une cause nomme fréquemment un acteur.'),
    ('incidents', 'declaration_anssi', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''une déclaration réglementaire, borné. Aucune saisie libre, aucune personne.'),
    ('incidents', 'declaration_cnil', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''une déclaration réglementaire, borné. Aucune saisie libre, aucune personne.'),
    ('incidents', 'description', 'personnelle', 'Décrire ce qui s''est passé', 'Intérêt légitime', 1095, 'signaler',
     'Idem incidents.titre — c''est le cas fondateur du régime « signaler ».'),
    ('incidents', 'gravite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un niveau de gravité borné. Aucune saisie libre, aucune personne.'),
    ('incidents', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('incidents', 'titre', 'personnelle', 'Retrouver un incident dans le registre', 'Intérêt légitime', 1095, 'signaler',
     '⚠️ Un titre d''incident nomme souvent la personne concernée (« Hameçonnage — poste de … »). SIGNALÉ, jamais effacé : « une description libre peut contenir un nom comme elle peut contenir la seule preuve d''un incident » (§35.3).'),
    ('incidents', 'type', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une typologie bornée. Aucune saisie libre, aucune personne.'),
    ('journal_audit', 'action', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''action journalisée, bornée par le vocabulaire clos du journal. Aucune saisie libre, aucune personne.'),
    ('journal_audit', 'resume', 'personnelle', 'Rendre le journal lisible par un auditeur', 'Obligation légale', 1095, 'conserver',
     'La phrase du journal peut nommer l''acteur ou l''objet d''une action. ⚠️ CONSERVÉE pour la même raison que journal_audit.utilisateur_libelle : le journal est INALTÉRABLE par dessein, et l''anonymiser romprait la chaîne d''empreintes.'),
    ('journal_audit', 'version_application', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la version du produit qui a écrit l''entrée. Aucune saisie libre, aucune personne.'),
    ('mapping_exigences', 'code', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un code technique ou normatif. Aucune saisie libre, aucune personne.'),
    ('mapping_exigences', 'ref_id', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''identifiant d''un référentiel du catalogue statique (« anssi-hygiene »…). Aucune saisie libre, aucune personne.'),
    ('mappings', 'aide', 'non_personnelle', null, null, null, null,
     'Note pédagogique d''un groupe de correspondances, écrite au catalogue.'),
    ('mappings', 'theme', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un thème de correspondance entre référentiels. Aucune saisie libre, aucune personne.'),
    ('mco_actions', 'commentaire', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet commenté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('mco_actions', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet décrit (actif, risque, processus, mesure, document…), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('mco_actions', 'frequence', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une périodicité bornée. Aucune saisie libre, aucune personne.'),
    ('mco_actions', 'priorite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un niveau de priorité borné. Aucune saisie libre, aucune personne.'),
    ('mco_actions', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('mco_actions', 'titre', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet intitulé, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('mesure_catalogue', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est une mesure de sécurité du socle Groupe, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('mesure_catalogue', 'domaine', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un domaine fonctionnel borné. Aucune saisie libre, aucune personne.'),
    ('mesure_catalogue', 'reference', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une référence de clause ou de document normatif. Aucune saisie libre, aucune personne.'),
    ('mesure_catalogue', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('mesure_mise_en_oeuvre', 'commentaire', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet commenté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('mesure_mise_en_oeuvre', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('migrations_schema', 'applique_par', 'personnelle', 'Savoir qui a appliqué un changement de schéma', 'Obligation légale', 1095, 'conserver',
     'Porte un LOGIN. ⚠️ CONSERVÉE, comme journal_audit.utilisateur_libelle : le registre des migrations est la preuve de ce qu''est devenu le schéma, et l''anonymiser ferait perdre la trace de qui a engagé un changement irréversible. Article 17.3 ; la borne reste la rétention de trois ans.'),
    ('migrations_schema', 'version', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un numéro de version. Aucune saisie libre, aucune personne.'),
    ('parametres', 'categorie', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une catégorie de classement. Aucune saisie libre, aucune personne.'),
    ('parametres', 'cle', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la clé d''un paramètre d''application. Aucune saisie libre, aucune personne.'),
    ('parametres', 'description', 'non_personnelle', null, null, null, null,
     'Description d''un paramètre d''application, écrite au déploiement.'),
    ('parametres', 'reference_secret', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le NOM de la variable d''environnement qui porte un secret — jamais le secret. Aucune saisie libre, aucune personne.'),
    ('parametres', 'type_valeur', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le type d''un paramètre d''application. Aucune saisie libre, aucune personne.'),
    ('parametres', 'valeur', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est la valeur d''un paramètre d''application ou d''une cellule rejetée à l''import, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('parametres', 'valeur_defaut', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est la valeur par défaut d''un paramètre d''application, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('pieces_a_purger', 'chemin_stockage', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le chemin du magasin, dérivé de l''empreinte SHA-256 du contenu. Aucune saisie libre, aucune personne.'),
    ('pieces_a_purger', 'motif', 'non_personnelle', null, null, null, null,
     'Motif technique de mise en file, écrit par le déclencheur f_pieces_suivent_leur_porteur() — jamais par un utilisateur. File interne, vidée par l''application après le commit : aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'chemin_stockage', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le chemin du magasin, dérivé de l''empreinte SHA-256 du contenu. Aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet décrit (actif, risque, processus, mesure, document…), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('pieces_jointes', 'etat_analyse', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état de l''analyse antivirale, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'etat_integrite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état du rapprochement d''empreinte, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'extension', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''extension d''un fichier. Aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'resultat_analyse', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le verdict brut de l''analyse antivirale. Aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'signature_virale', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le nom d''une signature antivirale rendu par ClamAV. Aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'type_mime', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le type de contenu déclaré d''un fichier. Aucune saisie libre, aucune personne.'),
    ('pieces_jointes', 'version_piece', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le numéro de version d''une pièce jointe. Aucune saisie libre, aucune personne.'),
    ('prestataires', 'acces', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le niveau d''accès accordé à un prestataire. Aucune saisie libre, aucune personne.'),
    ('prestataires', 'criticite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un niveau de criticité borné. Aucune saisie libre, aucune personne.'),
    ('prestataires', 'notes', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet annoté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('prestataires', 'societe', 'non_personnelle', null, null, null, null,
     'Attribut d''une PERSONNE MORALE — la raison sociale d''un prestataire —, pas d''une personne physique. Idem filiales.email, décidée ainsi au semis de la migration 026.'),
    ('prestataires', 'type', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une typologie bornée. Aucune saisie libre, aucune personne.'),
    ('processus', 'criticite', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un niveau de criticité borné. Aucune saisie libre, aucune personne.'),
    ('processus', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet décrit (actif, risque, processus, mesure, document…), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('processus', 'rpo', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une perte de données maximale admissible. Aucune saisie libre, aucune personne.'),
    ('processus', 'rto', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une durée maximale d''interruption admissible. Aucune saisie libre, aucune personne.'),
    ('profils', 'code', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un code technique ou normatif. Aucune saisie libre, aucune personne.'),
    ('profils', 'description', 'non_personnelle', null, null, null, null,
     'Description d''un profil de droits, semée par une migration. Un profil est un rôle, pas une personne — idem profils.nom.'),
    ('referentiels_actifs', 'motif', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : le motif d''activation d''un référentiel. Aucune saisie libre, aucune personne.'),
    ('referentiels_actifs', 'origine', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la provenance d''un enregistrement (socle Groupe, saisie locale). Aucune saisie libre, aucune personne.'),
    ('referentiels_actifs', 'ref_id', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''identifiant d''un référentiel du catalogue statique (« anssi-hygiene »…). Aucune saisie libre, aucune personne.'),
    ('revues', 'donnees_entree', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est les éléments présentés à une revue de direction, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('revues', 'donnees_sortie', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est les décisions d''une revue de direction, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('risque_catalogue', 'categorie', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une catégorie de classement. Aucune saisie libre, aucune personne.'),
    ('risque_catalogue', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet décrit (actif, risque, processus, mesure, document…), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('risque_catalogue', 'origine', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la provenance d''un enregistrement (socle Groupe, saisie locale). Aucune saisie libre, aucune personne.'),
    ('risque_catalogue', 'reference', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une référence de clause ou de document normatif. Aucune saisie libre, aucune personne.'),
    ('risque_catalogue', 'statut', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''état d''un enregistrement, borné par une contrainte. Aucune saisie libre, aucune personne.'),
    ('risques', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet décrit (actif, risque, processus, mesure, document…), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('risques', 'niveau', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : un niveau borné. Aucune saisie libre, aucune personne.'),
    ('scenarios_pra', 'description', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet décrit (actif, risque, processus, mesure, document…), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('tests_pra', 'bilan', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est le bilan d''un exercice de continuité, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('tests_pra', 'succes', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : l''issue d''un exercice. Aucune saisie libre, aucune personne.'),
    ('tests_pra', 'type_test', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : une typologie d''exercice bornée. Aucune saisie libre, aucune personne.'),
    ('traitements', 'base_legale', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la base légale déclarée au registre art. 30, bornée par une contrainte. Aucune saisie libre, aucune personne.'),
    ('traitements', 'categories_donnees', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est les catégories de données d''un traitement (art. 30), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('traitements', 'destinataires', 'personnelle', 'Déclarer à qui les données d''un traitement sont communiquées (art. 30)', 'Obligation légale', 1095, 'signaler',
     'Exigée par l''article 30 lui-même, et elle NOMME souvent des personnes ou des services. SIGNALÉE plutôt qu''anonymisée : effacer un destinataire d''un registre art. 30 le rendrait faux, et c''est le registre qui fait foi devant l''autorité de contrôle.'),
    ('traitements', 'duree_conservation', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la durée de conservation déclarée au registre art. 30. Aucune saisie libre, aucune personne.'),
    ('traitements', 'finalite', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est la finalité d''un traitement (art. 30), pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('traitements', 'notes', 'non_personnelle', null, null, null, 'signaler',
     'SAISIE LIBRE dont le sujet est l''objet annoté, pas une personne — mais un nom peut y figurer au milieu d''une phrase, et le remplacer détruirait la phrase. Le produit SIGNALE l''emplacement à un humain au lieu d''effacer (même régime que crise.notes).'),
    ('traitements', 'personnes_concernees', 'personnelle', 'Déclarer les catégories de personnes concernées (art. 30)', 'Obligation légale', 1095, 'signaler',
     'Exigée par l''article 30. Elle décrit des CATÉGORIES (« salariés », « clients ») mais la saisie est libre et un nom peut s''y trouver. Idem traitements.destinataires.'),
    ('traitements', 'transfert_hors_ue', 'non_personnelle', null, null, null, null,
     'Vocabulaire clos ou valeur technique : la mention de transfert hors Union, du registre art. 30. Aucune saisie libre, aucune personne.')
on conflict (table_nom, colonne) do nothing;

-- =====================================================================================
-- §5 — CONSIGNATION ET VÉRIFICATION
-- =====================================================================================

do $$
declare v_anomalies text; v_nombre integer; v_decidees integer;
begin
    select count(*) into v_decidees from colonnes_personnelles;
    raise notice 'registre des données personnelles : % colonnes décidées.', v_decidees;
    select string_agg(format('%s / %s : %s', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre from f_verifier_schema();
    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 029 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, balayage renversé compris.';
end;
$$;

insert into migrations_schema (version, nom)
values ('029', 'le registre des données personnelles balaie TOUT le schéma, et « colonne '
               'textuelle » ne se dit plus qu''à un seul endroit — deux identifiants métier '
               'reprennent leur domaine (constats Q-295, Q-296, Q-310)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_domaine_identifiants();
--   drop function if exists f_colonnes_textuelles();
--   delete from controles_schema where fonction in
--       ('f_verifier_domaine_identifiants');
--   delete from migrations_schema where version = '029';
--   commit;
--   -- ⚠️ Le retour de risque_catalogue.id au type « text » nu n'est PAS écrit ici : il
--   --    rouvrirait le constat Q-310, et rien ne l'exige — le domaine est plus permissif
--   --    que toute valeur légitime.
--   -- ⚠️ f_verifier_colonnes_personnelles() ne se rétablit pas par un « drop » : elle est
--   --    posée par 026 puis remplacée par 028 et 029.
-- =====================================================================================
