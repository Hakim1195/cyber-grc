-- =====================================================================================
-- 006_entropie_et_commentaires.sql — Un garde-fou qui mesure ce qu'il promet,
--                                    et des commentaires qui disent vrai
-- =====================================================================================
-- Constats **Q-17** et **Q-18** du cinquième passage de la porte S2
-- (docs/securite/RAPPORT_S2_QUINQUIES.md, registre du docs/PLAN_EXECUTION.md §7).
-- Cette migration ne crée aucune table, ne touche à aucune donnée, et ne change aucune
-- politique : elle réémet un garde-fou et corrige des textes.
--
-- Références : backend/db/CONVENTIONS.md §2 (le plancher d'entropie est une PROPRIÉTÉ,
-- pas un encodage), §17.5 (un garde-fou ne se voit pas prêter plus de portée qu'il n'en
-- a), §18.4 et §19.4 (le point d'appel unique), §20.2 (un garde-fou se vérifie dans les
-- deux sens), §23 (une migration appliquée ne se réécrit pas).
--
-- Dépendances : 001 à 005. Contenu :
--   §0  Gardes
--   §1  Q-17 — f_verifier_entropie_identifiants() mesure enfin une ENTROPIE
--   §2  Q-18 et le balayage — les commentaires du catalogue qui disaient faux
--   §3  Un décompte périmé dans un message, trouvé par le même balayage
--   §4  Consignation, puis vérification
--   §5  Enregistrement de la migration
--
-- -------------------------------------------------------------------------------------
-- Q-17 — CE QUI ÉTAIT MESURÉ, ET CE QUI ÉTAIT PROMIS
--
-- Le garde-fou tirait UN identifiant et vérifiait que sa part aléatoire faisait au moins
-- 32 CARACTÈRES. Le `CONVENTIONS.md` §2, lui, norme **52 bits tirés d'un générateur
-- cryptographique**. Un seuil dans la mauvaise unité (c'est le constat Q-14), et surtout
-- un seuil qu'un remplissage rend infaillible : `lpad(…, 32, '0')` — le `padStart` du
-- jumeau TypeScript — produit toujours la bonne longueur, quelle que soit l'entropie
-- portée. Le contrôle ne disait donc pas « le générateur est bon », il disait « la chaîne
-- est longue » — SOUS UN NOM QUI PROMET L'INVERSE. C'est ce que le §17.5 interdit : un
-- garde-fou auquel on prête plus de portée qu'il n'en a endort la vigilance au lieu de
-- l'entretenir. Une fausse assurance est pire qu'un silence.
--
-- CE QUI EST MESURÉ MAINTENANT, et pourquoi c'est celui-là
--
-- Sur un tirage en volume (512 identifiants), on compte, POSITION PAR POSITION, le
-- nombre de symboles distincts réellement observés, et on somme leurs logarithmes :
--
--     bits observés = Σ log2(symboles distincts à la position i)
--
-- Trois propriétés de cette mesure, et la première est celle qui compte :
--
--  1. C'est une BORNE SUPÉRIEURE de l'entropie du générateur (l'entropie jointe est
--     toujours ≤ la somme des entropies marginales). Quand elle passe sous 52, le
--     générateur est CERTAINEMENT sous le plancher : le refus est sûr, il ne peut pas
--     accuser à tort. C'est ce qui autorise à en faire un échec de déploiement.
--  2. Elle est exprimée dans l'unité de la norme — des bits —, ce qui referme le
--     constat Q-14 : aligner un jour f_generer_id() sur la forme du serveur (25 signes
--     base 36 pour 128 bits) ne fera plus crier ce garde-fou à tort, puisqu'il ne compte
--     plus des signes. Il s'adapte tout seul à l'alphabet employé.
--  3. Elle attrape le REMPLISSAGE, qui est la forme que prend en pratique une
--     dégradation : les positions de bourrage ne prennent qu'une valeur, elles pèsent
--     0 bit, et la somme s'effondre. C'est exactement le défaut que la longueur ne
--     pouvait pas voir.
--
-- Elle rend, sur le générateur d'aujourd'hui, **122 bits** — la valeur exacte d'un UUID
-- v4, dont quatre bits de version et deux de variante sont figés (30 × 4 + 0 + 2 = 122).
-- Retrouver ce nombre par la mesure, sans qu'il soit écrit nulle part, est le meilleur
-- contrôle de justesse de la mesure elle-même.
--
-- CE QU'ELLE NE VOIT PAS, ET IL FAUT LE DIRE (§17.5)
--
-- Un générateur dont chaque position varie normalement mais dont l'espace JOINT est
-- étroit — le condensat d'une graine étroite, `md5(<40 bits>)` — passe cette mesure. Le
-- décompte de valeurs distinctes ne le rattrape pas davantage : la détection par
-- collisions a un pouvoir en N², et pour voir 52 bits il faudrait **deux cents millions**
-- de tirages. C'est mathématique, et cela vaut pour tout remède fondé sur un comptage,
-- y compris celui du serveur : à 20 000 tirages, la détection est nulle dès 40 bits.
-- AUCUN CONTRÔLE STATISTIQUE NE PEUT CERTIFIER UN PLANCHER DE 52 BITS. Ce qui reste,
-- pour cette forme-là, est la lecture de la SOURCE — le corps de f_generer_id() doit
-- nommer un générateur cryptographique et ne pas appeler random(). C'est une
-- DÉCLARATION, pas un comportement, et c'est écrit comme telle.
--
-- Les trois mesures ensemble — forme, entropie par position, source — attrapent les
-- dégradations réelles ; le trou résiduel est nommé, il n'est pas caché.
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — GARDES
-- =====================================================================================

do $$
begin
    if current_setting('server_version_num')::integer < 150000 then
        raise exception
            'PostgreSQL 15 minimum requis, version trouvée : %. Voir backend/db/CONVENTIONS.md §1.',
            current_setting('server_version');
    end if;
end;
$$;

do $$
declare
    v_manquants text;
begin
    select string_agg(o, ', ' order by o)
      into v_manquants
      from unnest(array['f_verifier_entropie_identifiants()', 'f_verifier_privileges()',
                        'f_generer_id(text)', 'f_consigner_controles_schema()']) as o
     where to_regprocedure('public.' || o) is null;

    if v_manquants is not null then
        raise exception 'Migrations 001 à 005 non toutes appliquées : fonction(s) manquante(s) : %.',
                        v_manquants
            using hint = 'Ordre imposé : 001 à 005, puis ce fichier.';
    end if;

    if to_regtype('public.id_metier') is null then
        raise exception 'Domaine id_metier absent : la migration 001 n''est pas appliquée.';
    end if;
end;
$$;

-- =====================================================================================
-- §1 — Q-17 : LE GARDE-FOU D'ENTROPIE MESURE ENFIN UNE ENTROPIE
-- -------------------------------------------------------------------------------------
-- La fonction garde son nom et sa signature : le registre des garde-fous (005) la
-- reconnaît donc à l'identique, et le point d'appel unique continue de la jouer sans
-- qu'aucun fichier de déploiement change (CONVENTIONS.md §19.4).
--
-- LE VOLUME EST CHOISI PAR LA MESURE, PAS AU JUGÉ. 512 tirages coûtent ~20 ms, payés à
-- chaque fin de migration et à chaque vérification de déploiement. À ce volume, la
-- probabilité qu'un symbole d'un alphabet hexadécimal manque à une position est de
-- 16 × (15/16)^512 ≈ 2 × 10⁻¹³ : la mesure par position est certaine. Monter à 4096
-- coûterait huit fois plus cher pour ne déplacer que le pouvoir du décompte de
-- collisions, de ~17 à ~24 bits — très loin du plancher de 52 dans les deux cas. On paie
-- donc ce qui sert.
-- =====================================================================================

create or replace function f_verifier_entropie_identifiants()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Le plancher du CONVENTIONS.md §2, dans SON unité. Il ne s'agit plus d'un nombre de
    -- signes : 25 caractères en base 36 portent plus d'aléa que 32 en hexadécimal, et un
    -- seuil exprimé en signes se trompe donc de dimension (constat Q-14).
    v_plancher constant numeric := 52;
    v_tirages  constant integer := 512;
    v_bits       numeric;
    v_distincts  integer;
    v_longueur   integer;
    v_segments_min integer;
    v_segments_max integer;
    v_source     text;
    r            record;
begin
    -- 1. Le générateur, éprouvé par un TIRAGE EN VOLUME.
    if to_regprocedure('public.f_generer_id(text)') is null then
        objet    := 'f_generer_id';
        anomalie := 'generateur_absent';
        detail   := 'le générateur d''identifiants du serveur n''existe pas : les insertions '
                    'faites côté serveur (import, reprise, journal d''audit) n''ont plus de '
                    'source d''identifiant';
        return next;
    else
        with tirages as materialized (
            select f_generer_id('ZZVERIF')::text as id
              from generate_series(1, v_tirages)
        ),
        parts as (
            select split_part(id, '-', 3)                     as alea,
                   array_length(string_to_array(id, '-'), 1)  as segments
              from tirages
        ),
        forme as (
            select min(segments)               as smin,
                   max(segments)               as smax,
                   max(length(alea))           as l,
                   count(distinct alea)::integer as distincts
              from parts
        ),
        -- Le cœur de la mesure : combien de symboles DIFFÉRENTS chaque position
        -- prend-elle réellement ? Une position de bourrage n'en prend qu'un.
        positions as (
            select g.i, count(distinct substr(p.alea, g.i, 1)) as symboles
              from parts p, forme, generate_series(1, forme.l) g(i)
             group by g.i
        )
        select f.smin, f.smax, f.l, f.distincts,
               coalesce((select sum(log(2::numeric, symboles::numeric)) from positions), 0)
          into v_segments_min, v_segments_max, v_longueur, v_distincts, v_bits
          from forme f;

        -- Un seul constat par générateur : le premier qui tombe suffit à faire échouer le
        -- déploiement, et quatre lignes pour un seul défaut n'aideraient personne.
        if v_segments_min <> 3 or v_segments_max <> 3 then
            objet    := 'f_generer_id';
            anomalie := 'format_identifiant_rompu';
            detail   := format(
                'l''identifiant engendré ne porte pas les trois segments de la convention '
                '« <PRÉFIXE>-<millisecondes>-<aléa> » (CONVENTIONS.md §2) : %s à %s segments '
                'observés sur %s tirages', v_segments_min, v_segments_max, v_tirages);
            return next;

        elsif v_bits < v_plancher then
            objet    := 'f_generer_id';
            anomalie := 'identifiant_entropie_faible';
            detail   := format(
                'la part aléatoire porte AU PLUS %s bits — mesurés position par position sur '
                '%s tirages, %s signe(s) — quand le plancher normé est de %s bits '
                '(CONVENTIONS.md §2). La somme des logarithmes des symboles observés à chaque '
                'position majore l''entropie du générateur : sous ce seuil, il est '
                'CERTAINEMENT en deçà. Un import en lot tire ses identifiants dans la MÊME '
                'milliseconde : sous le plancher, les collisions de clé primaire font perdre '
                'des lignes au milieu d''un lot annoncé complet, sans que rien ne le signale '
                '(porte S2, constat bloquant). Attention : une chaîne LONGUE n''est pas une '
                'chaîne ALÉATOIRE — un remplissage donne la bonne longueur et zéro bit '
                '(constat Q-17).',
                round(v_bits, 1), v_tirages, v_longueur, v_plancher);
            return next;

        elsif v_distincts < v_tirages then
            objet    := 'f_generer_id';
            anomalie := 'identifiants_en_collision';
            detail   := format(
                '%s tirages n''ont rendu que %s valeurs distinctes. Les marges par position '
                'sont pourtant normales : l''espace ENGENDRÉ est donc plus étroit que la '
                'somme de ses positions ne le laisse croire — condensat d''une graine étroite, '
                'compteur recyclé, ou générateur figé.', v_tirages, v_distincts);
            return next;

        else
            -- 2. La SOURCE. C'est le seul contrôle qui parle du mot « cryptographique » de
            -- la norme, et le seul qui puisse voir une graine étroite étalée par un
            -- condensat. Il lit une DÉCLARATION, pas un comportement : c'est sa force
            -- (aucun volume de tirages ne verrait cette forme) et sa limite (une fonction
            -- peut nommer gen_random_uuid() et n'en garder que cinq octets).
            v_source := pg_get_functiondef('public.f_generer_id(text)'::regprocedure);

            if v_source !~ 'gen_random_(uuid|bytes)' then
                objet    := 'f_generer_id';
                anomalie := 'source_non_cryptographique';
                detail   := 'le corps du générateur ne nomme aucune source cryptographique '
                            '(gen_random_uuid ou gen_random_bytes). Le §2 norme un aléa TIRÉ '
                            'D''UN GÉNÉRATEUR CRYPTOGRAPHIQUE, et aucun tirage ne peut le '
                            'constater : un condensat d''une graine étroite passe toutes les '
                            'mesures statistiques praticables (constat Q-17).';
                return next;

            elsif v_source ~ '(^|[^_[:alnum:]])random[[:space:]]*\(' then
                objet    := 'f_generer_id';
                anomalie := 'source_a_hasard_faible';
                detail   := 'le corps du générateur appelle random(), qui n''est pas '
                            'cryptographique et dont la graine est devinable. Employer '
                            'gen_random_uuid() ou gen_random_bytes() (CONVENTIONS.md §2).';
                return next;
            end if;
        end if;
    end if;

    -- 3. Le balayage : une valeur par défaut « au hasard » sous une contrainte d'unicité.
    --    Inchangé depuis 001 — il cherche la FORME du défaut dans le catalogue, pas le nom
    --    de la fonction qui le portait.
    for r in
        select (c.relname || '.' || a.attname)::text as colonne,
               pg_get_expr(d.adbin, d.adrelid)       as defaut
          from pg_attrdef d
          join pg_class c on c.oid = d.adrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and pg_get_expr(d.adbin, d.adrelid) ~ 'random\s*\('
           and exists (
               select 1 from pg_index ix
                where ix.indrelid = c.oid and ix.indisunique
                  and a.attnum = any (ix.indkey::int2[]))
         order by 1
    loop
        objet    := r.colonne;
        anomalie := 'valeur_unique_a_hasard_etroit';
        detail   := format(
            'valeur par défaut tirée au hasard sur une colonne qui doit être UNIQUE, hors du '
            'générateur commun : %s. Une collision n''est pas un doublon, c''est une ligne '
            'refusée. Passer par f_generer_id(), ou justifier ici l''entropie retenue.',
            r.defaut);
        return next;
    end loop;

    return;
end;
$$;

comment on function f_verifier_entropie_identifiants() is
    'Vérifie que le générateur d''identifiants de la base tient la promesse du '
    'CONVENTIONS.md §2 — au moins 52 BITS d''aléa cryptographique — en TIRANT 512 '
    'identifiants et en mesurant, position par position, le nombre de symboles réellement '
    'observés. La somme de leurs logarithmes MAJORE l''entropie du générateur : sous le '
    'plancher, il est certainement en deçà, et le refus ne peut pas accuser à tort. Balaie '
    'ensuite le catalogue à la recherche de toute autre valeur par défaut tirée au hasard '
    'sur une colonne unique. Un schéma sain ne renvoie AUCUNE ligne. '
    'CE QUI A CHANGÉ, ET POURQUOI (constat Q-17) : il mesurait une LONGUEUR — « au moins 32 '
    'caractères » — sous un nom qui promet une entropie. Un remplissage rend cette longueur '
    'infaillible : le contrôle disait « la chaîne est longue » et laissait passer tout '
    'générateur dégradé qui bourre son résultat. Pouvoir de détection mesuré alors : 8 sur '
    '200 à 32 bits, 0 sur 200 à 40 bits, pour un plancher normé à 52. Mesurer des bits '
    'referme du même geste le constat Q-14 — un seuil en signes se trompe de dimension, '
    '25 signes en base 36 portant plus d''aléa que 32 en hexadécimal. '
    'PORTÉE EXACTE, À NE PAS SURESTIMER (CONVENTIONS.md §17.5) : la mesure par position voit '
    'tout REMPLISSAGE, à n''importe quel niveau de dégradation, et elle est certaine. Elle ne '
    'voit PAS un générateur dont les marges sont normales mais l''espace joint étroit — le '
    'condensat d''une graine étroite. Le décompte de valeurs distinctes ne l''y rattrape pas : '
    'la détection par collisions a un pouvoir en N², et voir 52 bits demanderait deux cents '
    'MILLIONS de tirages. Aucun contrôle statistique praticable ne certifie ce plancher ; '
    'pour cette forme-là, ce qui reste est la lecture de la SOURCE — le corps doit nommer '
    'gen_random_uuid ou gen_random_bytes et ne pas appeler random() —, qui est une '
    'déclaration et non un comportement. Le trou résiduel est nommé, pas caché. '
    'Sur le générateur d''aujourd''hui la mesure rend 122 bits : la valeur exacte d''un UUID '
    'v4, dont la version et la variante sont figées.';

-- =====================================================================================
-- §2 — Q-18 ET LE BALAYAGE : LES COMMENTAIRES DU CATALOGUE QUI DISAIENT FAUX
-- -------------------------------------------------------------------------------------
-- Le commentaire du domaine id_metier, posé par 001 et VIVANT DANS LE CATALOGUE, disait :
--
--   « Clé primaire métier au format "<PRÉFIXE>-<horodatage>-<aléa>" (ex.
--     RISK-1720000000000-482). Ni UUID ni serial : le format de l'application navigateur
--     est conservé pour garantir un round-trip exact à l'import d'un export grc-backup. »
--
-- Trois choses y sont fausses, et la troisième est celle qui coûte :
--
--  1. Le domaine N'IMPOSE PAS ce format. Il accepte « 7 », « ACT_2019_007 », et une
--     phrase entière — c'est délibéré (§2 : le format ACCEPTÉ est volontairement
--     permissif, sans quoi la reprise d'exports anciens échouerait), mais le commentaire
--     le présentait comme une contrainte.
--  2. L'exemple illustre le générateur à MILLE VALEURS, celui que le chantier a éliminé
--     partout et qui lui a coûté son seul constat bloquant : un import qui écrivait
--     223 lignes sur 250 en annonçant le succès.
--  3. « le format … est conservé POUR GARANTIR un round-trip exact » est la justification
--     que le chantier a déclarée fausse, et VÉRIFIÉE fausse (src/entites/index.ts) : la
--     reprise recopie les identifiants du fichier tels quels, quel que soit le format
--     ENGENDRÉ. S'appuyer sur le round-trip pour justifier ce format aurait rendu
--     intouchable le format d'un générateur qu'il a précisément fallu changer (Q-1).
--
-- POURQUOI DEUX BALAYAGES L'AVAIENT MANQUÉ, et ce qu'on en retient. Celui de Q-6 cherchait
-- des RENVOIS MORTS — un symbole cité qui n'existe plus — dans deux répertoires du
-- frontend. Celui de la migration 005 cherchait les commentaires rendus faux par le
-- correctif T-4, c'est-à-dire là où l'on savait déjà. Or la classe la plus fréquente n'est
-- ni l'une ni l'autre : c'est la JUSTIFICATION. Le texte de id_metier ne cite aucun
-- symbole disparu et ne parle pas des imports ; il énonce une causalité fausse. Un
-- balayage qui ne cherche que ce qu'il a déjà trouvé ne trouvera que ce qu'il cherche.
--
-- Le balayage mené pour cette migration a donc porté sur les 398 commentaires du
-- CATALOGUE des cinq migrations, en quatre classes : renvois morts, décomptes périmés,
-- justifications déclarées fausses, et affirmations de comportement portant sur du code
-- hors de la base. Il a rendu dix-huit candidats, dont seize se sont révélés JUSTES après
-- vérification — et il faut le dire, parce qu'un balayage qui n'aurait rendu que des
-- coupables serait un balayage qui ne cherche pas :
--
--   - « le round-trip » invoqué par actifs.criticite, prestataires.acces, tests_pra.succes
--     et personnes est VRAI : la reprise valide les valeurs contre les chaînes exactes du
--     frontend (src/reprise/index.ts) et ne normalise rien, si bien que la casse, les
--     accents et « Oui »/« Non » sont bien des contraintes de round-trip. La justification
--     fausse portait sur le format des IDENTIFIANTS, pas sur celui des VALEURS ;
--   - « ex-tableau actifs.dependances[] », et les quatre autres renvois de ce genre,
--     désignent le modèle NAVIGATEUR : ils ne pointent pas une colonne disparue ;
--   - « idempotente » qualifie des fonctions rejouables (f_armer_declencheurs,
--     f_poser_portee_figee, f_poser_tracabilite_insertion) et non le jeton retiré par T-4 ;
--   - « 32 caractères / 122 bits » sur f_generer_id est exact, et la mesure du §1 le
--     retrouve indépendamment.
--
-- Deux ont été retenus : le commentaire de id_metier, ci-dessous, et un décompte périmé,
-- au §3.
-- =====================================================================================

comment on domain id_metier is
    'Identifiant métier : le type de toute clé primaire et de toute clé étrangère métier '
    '(CONVENTIONS.md §2). Ni UUID ni « serial » — les identifiants d''un export grc-backup '
    'deviennent tels quels les clés primaires, et les clés étrangères du modèle continuent '
    'de pointer sans table de correspondance. '
    'CE QUE CE DOMAINE CONTRAINT, et rien de plus : du texte non vide, 64 caractères au '
    'plus, sans virgule (elle scinderait le périmètre de session transmis par '
    '« grc.filiales », §17.3) ni espace en tête ou en fin. IL N''IMPOSE AUCUN FORMAT, et '
    'c''est délibéré : les exports anciens portent des identifiants sans suffixe aléatoire '
    'et des identifiants de processus sans préfixe ; une expression régulière stricte '
    'casserait la reprise de données. '
    'CE QUI EST NORMÉ EST LE FORMAT ENGENDRÉ, PAS LE FORMAT ACCEPTÉ, et c''est une '
    'PROPRIÉTÉ, pas un encodage : au moins 52 bits d''aléa cryptographique. Le produit '
    'fabrique des identifiants à cinq endroits dans trois langages — trois générateurs et '
    'deux dérivations qui ne tirent rien —, dont les formes diffèrent légitimement. Le '
    'générateur de la base est f_generer_id(), et f_verifier_entropie_identifiants() '
    'mesure ce plancher à chaque déploiement. '
    'CORRIGÉ PAR LA MIGRATION 006 (constat Q-18). Le texte posé par 001 présentait le '
    'format comme une contrainte du domaine — il ne l''est pas —, l''illustrait par '
    '« RISK-1720000000000-482 », c''est-à-dire par le générateur à mille valeurs qui a '
    'coûté au chantier son seul constat bloquant, et justifiait ce format par le '
    'round-trip. Cette dernière justification a été déclarée fausse ET VÉRIFIÉE FAUSSE : '
    'la reprise recopie les identifiants du fichier tels quels, quel que soit le format '
    'engendré ; s''appuyer sur elle aurait rendu intouchable le format d''un générateur '
    'qu''il a précisément fallu changer (constat Q-1). La migration 001 est appliquée et '
    'ne se réécrit pas (§23) : son texte reste faux dans le fichier, il est vrai ici.';

-- =====================================================================================
-- §3 — UN DÉCOMPTE PÉRIMÉ, TROUVÉ PAR LE MÊME BALAYAGE
-- -------------------------------------------------------------------------------------
-- f_verifier_privileges() dit, dans le message de l'anomalie « attribut_de_role_interdit » :
-- « grc_lecture détient "select" sur les 47 tables ». Le schéma en porte 48 depuis que la
-- migration 005 a posé controles_schema — et c'est MOI qui ai reporté ce nombre, en
-- réémettant la fonction verbatim.
--
-- La leçon n'est pas « il fallait écrire 48 » : c'est qu'un décompte écrit dans un texte
-- vieillit à chaque migration, et qu'il n'a aucune raison d'être écrit là. Le message perd
-- donc son nombre. Ce qu'il voulait dire — ce rôle lit TOUT — se dit sans compter.
--
-- Le reste de la fonction est recopié VERBATIM depuis 005 : une migration appliquée ne se
-- réécrit pas, elle se corrige dans la suivante par « create or replace » (§23).
-- =====================================================================================

create or replace function f_verifier_privileges()
returns table (objet text, anomalie text, detail text)
    language plpgsql stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Les colonnes qui portent un SECRET D'AUTHENTIFICATION, sous la forme
    -- « table.colonne ». Aucun rôle autre que le propriétaire de la base ne les lit.
    v_secrets constant text[] := array['utilisateurs.mot_de_passe_hash'];
    -- Les REGISTRES TECHNIQUES : des tables que le déploiement écrit sous le compte
    -- propriétaire, et qu'aucun rôle de CONNEXION ne doit pouvoir réécrire. Ajouté par
    -- 005_controles_schema.sql (constat Q-5) ; le reste de cette fonction est recopié
    -- verbatim depuis 001 (CONVENTIONS.md §23).
    v_registres constant text[] := array['migrations_schema', 'controles_schema'];
    v_proprietaire constant oid := (select d.datdba from pg_database d
                                     where d.datname = current_database());
    r      record;
    v_nom  text;
begin
    -- 1. Le droit de CRÉER dans « public » (Q5-1).
    for r in
        select g.grantee::text as role_nom
          from (select (aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner)))).*
                  from pg_namespace n where n.nspname = 'public') g
         where g.privilege_type = 'CREATE'
           and g.grantee <> 0                      -- 0 = PUBLIC, traité juste après
           and g.grantee <> v_proprietaire
           and not exists (select 1 from pg_roles rr
                            where rr.oid = g.grantee and (rr.rolsuper or rr.rolname = 'pg_database_owner'))
         order by 1
    loop
        objet    := 'schema public';
        anomalie := 'creation_schema_ouverte';
        detail   := format('le rôle « %s » peut créer des objets dans le schéma public : il peut '
                           'donc y planter une fonction « f_verifier_<x>() », que le point d''appel '
                           'unique exécuterait (CONVENTIONS.md §19.4, constat Q5-1). '
                           'Corriger : revoke create on schema public from %I;',
                           (select rolname from pg_roles where oid = r.role_nom::oid),
                           (select rolname from pg_roles where oid = r.role_nom::oid));
        return next;
    end loop;

    if exists (select 1
                 from (select (aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner)))).*
                         from pg_namespace n where n.nspname = 'public') g
                where g.privilege_type = 'CREATE' and g.grantee = 0)
    then
        objet    := 'schema public';
        anomalie := 'creation_schema_ouverte';
        detail   := 'PUBLIC peut créer des objets dans le schéma public : tout rôle capable de '
                    'se connecter peut y planter une fonction que le point d''appel unique '
                    'exécuterait. Corriger : revoke create on schema public from public;';
        return next;
    end if;

    -- 2. Les secrets, dans les deux sens.
    foreach v_nom in array v_secrets loop
        if to_regclass('public.' || quote_ident(split_part(v_nom, '.', 1))) is null
           or not exists (select 1 from pg_attribute a
                           where a.attrelid = to_regclass('public.' || quote_ident(split_part(v_nom, '.', 1)))
                             and a.attname = split_part(v_nom, '.', 2)
                             and a.attnum > 0 and not a.attisdropped)
        then
            objet    := v_nom;
            anomalie := 'secret_declare_introuvable';
            detail   := 'colonne déclarée « secret d''authentification » dans '
                        'f_verifier_privileges() mais introuvable : la protection ne porte plus '
                        'sur rien, et elle couvrirait toute colonne future qui reprendrait ce nom';
            return next;
            continue;
        end if;

        for r in
            select rr.rolname::text as role_nom
              from pg_roles rr
             where not rr.rolsuper and rr.oid <> v_proprietaire and rr.rolcanlogin
               and has_column_privilege(rr.oid, split_part(v_nom, '.', 1),
                                        split_part(v_nom, '.', 2), 'SELECT')
             order by 1
        loop
            objet    := v_nom;
            anomalie := 'secret_lisible';
            detail   := format('le rôle « %s » peut LIRE un secret d''authentification. Cette '
                               'colonne s''écrit, elle ne se lit pas (§15 ter, constat Q5-3). '
                               'Corriger : revoke select on %I from %I; puis rendre les autres '
                               'colonnes par un « grant select (…) ».',
                               r.role_nom, split_part(v_nom, '.', 1), r.role_nom);
            return next;
        end loop;
    end loop;

    -- Le sens inverse : une colonne NON secrète devenue illisible au compte du service
    -- est un défaut d'exploitation que ce même correctif aurait pu créer.
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        for r in
            select (c.relname || '.' || a.attname)::text as colonne
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
             where n.nspname = 'public' and c.relkind in ('r', 'p')
               and not ((c.relname || '.' || a.attname) = any (v_secrets))
               and not has_column_privilege('grc_app', c.oid, a.attnum, 'SELECT')
             order by 1
        loop
            objet    := r.colonne;
            anomalie := 'colonne_illisible_au_service';
            detail   := 'le compte du service ne peut pas lire cette colonne, qui n''est pas '
                        'déclarée secrète : une colonne ajoutée après le « grant select (…) » '
                        'nominatif reste invisible, et le défaut ne se voit qu''en production';
            return next;
        end loop;
    end if;

    -- 3. Les attributs des DEUX rôles de connexion (Q5-8).
    for r in
        select rr.rolname::text as role_nom,
               concat_ws(', ', case when rr.rolsuper then 'SUPERUSER' end,
                               case when rr.rolbypassrls then 'BYPASSRLS' end,
                               case when rr.rolcreaterole then 'CREATEROLE' end,
                               case when rr.rolcreatedb then 'CREATEDB' end) as attributs
          from pg_roles rr
         where rr.rolname in ('grc_app', 'grc_lecture')
           and (rr.rolsuper or rr.rolbypassrls or rr.rolcreaterole or rr.rolcreatedb)
         order by 1
    loop
        objet    := r.role_nom;
        anomalie := 'attribut_de_role_interdit';
        -- Le décompte est parti (migration 006) : « 47 tables » est devenu faux dès que
        -- 005 en a posé une 48ᵉ, et il redeviendra faux à chaque migration. Ce que la
        -- phrase veut dire — ce rôle lit TOUT — se dit sans compter.
        detail   := format('le rôle porte : %s. BYPASSRLS suffit à rendre tout le cloisonnement '
                           'décoratif, et grc_lecture détient « select » sur toutes les tables '
                           'du schéma. '
                           'Corriger : alter role %I nosuperuser nobypassrls nocreaterole '
                           'nocreatedb;', r.attributs, r.role_nom);
        return next;
    end loop;

    -- 4. LES REGISTRES TECHNIQUES NE SONT PAS RÉINSCRIPTIBLES (constat Q-5).
    --
    -- migrations_schema porte l'empreinte qui détecte la réécriture d'une migration
    -- appliquée ; controles_schema porte la dernière observation des garde-fous, et
    -- c'est contre elle que f_verifier_schema() juge une disparition. Les deux sont
    -- écrits par le compte PROPRIÉTAIRE, au moment où une migration s'applique. Un rôle
    -- de connexion qui pourrait les écrire pourrait effacer l'alarme avant de la
    -- déclencher : le registre ne vaut que fermé.
    --
    -- L'ancien dispositif s'en remettait à deploy/install.sh pour migrations_schema —
    -- donc à un fichier, donc à un seul des chemins. Ici, c'est la base qui le tient, et
    -- le point d'appel unique le rejoue partout (CONVENTIONS.md §18.4).
    --
    -- La liste est écrite à la main, et le §19.5 ne l'admet qu'à une condition, tenue
    -- juste en dessous : le garde-fou vérifie qu'elle reste JUSTE.
    foreach v_nom in array v_registres loop
        if to_regclass('public.' || quote_ident(v_nom)) is null then
            objet    := v_nom;
            anomalie := 'registre_declare_introuvable';
            detail   := 'table déclarée « registre technique » dans f_verifier_privileges() '
                        'mais introuvable : le contrôle ne porte plus sur rien, et il '
                        'couvrirait toute table future qui reprendrait ce nom';
            return next;
            continue;
        end if;

        for r in
            select rr.rolname::text as role_nom,
                   concat_ws(', ',
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'insert')   then 'insert' end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'update')   then 'update' end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'delete')   then 'delete' end,
                       case when has_table_privilege(rr.oid, v_nom::regclass, 'truncate') then 'truncate' end)
                       as verbes
              from pg_roles rr
             where rr.rolcanlogin and not rr.rolsuper and rr.oid <> v_proprietaire
               and (has_table_privilege(rr.oid, v_nom::regclass, 'insert')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'update')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'delete')
                 or has_table_privilege(rr.oid, v_nom::regclass, 'truncate'))
             order by 1
        loop
            objet    := v_nom;
            anomalie := 'registre_reinscriptible';
            detail   := format('le rôle de connexion « %s » détient %s sur un registre '
                               'technique. migrations_schema porte l''empreinte qui détecte la '
                               'réécriture d''une migration appliquée ; controles_schema porte '
                               'la dernière observation des garde-fous, contre laquelle une '
                               'disparition est jugée (constat Q-5). Corriger : revoke insert, '
                               'update, delete, truncate on %I from %I;',
                               r.role_nom, r.verbes, v_nom, r.role_nom);
            return next;
        end loop;
    end loop;

    return;
end;
$$;

-- =====================================================================================
-- §4 — CONSIGNATION, PUIS VÉRIFICATION
-- -------------------------------------------------------------------------------------
-- Les trois instructions qui closent toute migration depuis 005 (§10 de ce fichier-là).
-- Ce fichier ne crée aucune table et aucun déclencheur : la pose de traçabilité n'a rien à
-- faire, mais elle est appelée quand même — une migration qui l'omettrait parce qu'elle
-- « sait » n'avoir rien créé est exactement la forme d'oubli que le §19.4 supprime.
--
-- La consignation ne doit rien avoir à consigner : les deux fonctions réémises gardent
-- leur nom ET leur signature, le registre les reconnaît donc à l'identique.
-- =====================================================================================

do $$
declare
    v_poses  integer;
    v_armes  integer;
begin
    v_poses := f_poser_tracabilite_insertion();
    v_armes := f_armer_declencheurs();
    raise notice 'Traçabilité d''insertion : % déclencheur(s) posé(s) ; % (ré)armé(s) en « always ».',
                 v_poses, v_armes;
end;
$$;

do $$
declare
    v_mouvements text;
    v_nombre     integer;
begin
    select string_agg(format('%s (%s)', garde_fou, mouvement), ', ' order by garde_fou),
           count(*)
      into v_mouvements, v_nombre
      from f_consigner_controles_schema();

    raise notice 'Registre des garde-fous : % mouvement(s)%. Total consigné : %.',
                 v_nombre,
                 coalesce(' — ' || v_mouvements, ''),
                 (select count(*) from controles_schema);
end;
$$;

do $$
declare
    v_anomalies text;
    v_nombre    integer;
begin
    select string_agg(format('  - [%s] %s : %s (%s)', controle, objet, anomalie, detail),
                      E'\n' order by controle, objet, anomalie),
           count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception E'Vérification du schéma en défaut — % anomalie(s) :\n%',
                        v_nombre, v_anomalies
            using errcode = '42501',
                  hint = 'Voir backend/db/CONVENTIONS.md §18.4 et §19.4.';
    end if;

    raise notice 'Schéma vérifié : % garde-fou(x) consigné(s), % joué(s).',
                 (select count(*) from controles_schema),
                 (select count(*) from f_decouvrir_controles_schema() where conforme);
end;
$$;

-- =====================================================================================
-- §5 — ENREGISTREMENT DE LA MIGRATION
-- =====================================================================================

insert into migrations_schema (version, nom)
values ('006', 'Le garde-fou d''entropie mesure des bits et non des signes (constat Q-17) ; '
               'commentaire du domaine id_metier rendu vrai, et décompte périmé retiré d''un '
               'message (constats Q-18 et balayage)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire — le retour arrière réel se fait par instantané Proxmox)
-- -------------------------------------------------------------------------------------
-- Rejouer ce bloc rendrait au garde-fou d'entropie sa mesure de LONGUEUR, c'est-à-dire
-- son absence de pouvoir de détection (constat Q-17), et remettrait dans le catalogue un
-- commentaire faux. Les versions de 001 et 005 doivent être reposées à la main :
-- « create or replace » ne garde pas l'ancienne.
--
-- begin;
--   -- reposer f_verifier_entropie_identifiants() dans sa forme de 001_socle.sql
--   -- reposer f_verifier_privileges() dans sa forme de 005_controles_schema.sql
--   -- reposer le commentaire de id_metier dans sa forme de 001_socle.sql — qui est FAUSSE :
--   --   le §23 dit que le fichier ne se réécrit pas, il ne dit pas que le mensonge se
--   --   restaure.
--   delete from migrations_schema where version = '006';
-- commit;
-- =====================================================================================
