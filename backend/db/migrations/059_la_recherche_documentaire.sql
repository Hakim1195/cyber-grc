-- =====================================================================================
--  059 — LA RECHERCHE DOCUMENTAIRE : UN INDEX PLEIN TEXTE, BORNÉ PAR LA RLS
--
--  §0  Le périmètre de la migration
--  §1  Le repli d'accents — `f_sans_accent()`, immuable, sans extension
--  §2  La colonne `documents.recherche` — ENGENDRÉE, donc jamais désynchronisée
--  §3  L'index GIN
--  §4  Le registre de l'article 30
--  §5  Le garde-fou — il ÉPROUVE la recherche, il ne la reconnaît pas
--  §6  Consignation
--
-- =====================================================================================
--  POURQUOI CETTE MIGRATION EXISTE
--
--  Action **D3** du `docs/PLAN_EXECUTION.md` §3, dernière des cinq du lot **L16** :
--  *« Recherche. `tsvector` natif sur `titre`, `type`, `notes` d'abord — aucune
--  dépendance neuve. L'extraction du contenu des PDF est un second temps, et elle doit
--  passer par la même chaîne contrôlée que ClamAV. »*
--
--  Elle a été reportée cinq fois, et toujours pour le même motif, écrit dès la vague 9 :
--  ⚠️ **une recherche est un ORACLE.** Elle répond « zéro » ou « un » sur un terme
--  choisi, et ces deux réponses disent quelque chose de ce qui existe — y compris de ce
--  qui existe AILLEURS. C'est la surface la plus propice à une fuite entre filiales, et
--  c'est pour cela qu'elle attendait.
--
--  ── ⚠️ CE QUI BORNE, ET CE QUI NE BORNE PAS ────────────────────────────────────────
--
--  **La RLS borne, et elle seule.** L'index vit sur `documents`, qui porte ses quatre
--  politiques depuis la `004`. Une recherche n'est donc pas « filtrée » : elle ne VOIT
--  pas les lignes de la voisine, au même titre qu'un `select *`. Aucune requête du
--  produit ne nommera de filiale pour cette route — c'est la décision n° 1 de
--  `src/recherche/index.ts`, et elle vaut ici mot pour mot : *un filtre applicatif
--  serait une barrière que le prochain chemin d'écriture contournerait, et il y a
--  toujours un chemin de plus* (constats Q-232 / Q-233).
--
--  ── ⚠️ ET LA QUESTION QUI A DEMANDÉ UN ARBITRAGE : `notes` ──────────────────────────
--
--  Le point 3 de `src/recherche/index.ts` — écrit le 16/09 pour la recherche GLOBALE —
--  refuse de balayer le texte libre, au motif que *« le registre de l'article 30 dit
--  qu'une partie porte des personnes »*. La spécification de D3, elle, est antérieure
--  (07/09) et demande `notes`. Les deux ne peuvent pas être suivies à la lettre.
--
--  **Mesuré avant de trancher**, dans le registre lui-même :
--
--    · `documents.titre` — `non_personnelle`, régime « signaler » ;
--    · `documents.type`  — `non_personnelle`, vocabulaire clos ;
--    · `documents.notes` — `non_personnelle`, régime « signaler » :
--      *« SAISIE LIBRE dont le sujet est l'objet annoté, pas une personne — mais un nom
--      peut y figurer. »*
--
--  Aucune des trois n'est `personnelle`. Le registre de l'article 30 fait autorité sur
--  cette question, et il dit que les indexer est licite. **Les trois sont donc
--  indexées, comme la spécification le demande** — et deux garde-corps sont posés,
--  parce que « licite » n'est pas « sans conséquence » :
--
--   1. **La route ne rend JAMAIS l'extrait** qui a produit la correspondance. Elle rend
--      le document : son identifiant, son titre, son type, son statut. C'est la
--      différence entre *trouver une procédure* et *fouiller des annotations*, et c'est
--      la réponse exacte au point 3 de la recherche globale. Un produit qui rendrait la
--      phrase deviendrait un moteur de recherche sur les personnes qu'elle nomme.
--   2. **Le poids range l'annotation en dernier** — `A` au titre, `B` au type, `C` aux
--      notes. Une occurrence en annotation ne passe jamais devant une occurrence dans
--      le titre, si bien que l'usage normal ne rencontre pas les notes.
--
--  ⚠️ **Et une propriété de la colonne ENGENDRÉE qui n'est pas un détail RGPD** : elle
--  se recalcule à chaque écriture, sans qu'aucun code ne l'y aide. La purge de
--  l'article 17 qui vide `notes` vide donc l'index **dans la même instruction**. Un
--  index tenu par un déclencheur, ou par un traitement de fond, aurait pu survivre à la
--  donnée qu'il indexe — c'est-à-dire garder une trace de ce qu'on vient d'effacer.
--
--  ── ⚠️ PAS D'EXTENSION, ET CE N'EST PAS UNE COQUETTERIE ────────────────────────────
--
--  `unaccent` est *disponible* sur cette grappe mais *non installé*, et `create
--  extension unaccent` exige le **superutilisateur** : une migration tourne sous
--  `grc_proprietaire`. La poser ici ferait échouer l'installation chez le client, au
--  milieu d'une migration, pour une raison qui n'a rien à voir avec le produit. Le
--  repli d'accents se fait donc par `translate()` — immuable, sans dépendance, et
--  suffisant pour le français (§1).
--
--  ── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────────────
--
--  **Le contenu des pièces jointes n'est pas indexé.** La spécification le range
--  explicitement dans un second temps, et elle dit pourquoi : l'extraction doit passer
--  par la même chaîne contrôlée que ClamAV (lot L6, huit contrôles dans un ordre figé).
--  Extraire du texte d'un PDF, c'est l'analyser ; l'analyser hors de cette chaîne, ce
--  serait ouvrir une seconde porte d'entrée aux fichiers hostiles. Le `nom` du fichier,
--  lui, reste trouvable par la recherche globale.
-- =====================================================================================
-- Invocation :
--   psql -v ON_ERROR_STOP=1 -d cyber_grc -f 059_la_recherche_documentaire.sql
-- =====================================================================================

begin;

-- =====================================================================================
-- §0 — LE PÉRIMÈTRE DE LA MIGRATION
-- =====================================================================================
-- ⚠️ `add column` sur une table cloisonnée LIT ses lignes pour calculer la colonne
-- engendrée, et `force row level security` vaut aussi pour le propriétaire. Sans ce
-- périmètre, la migration réussirait en n'indexant QUE ce qu'elle voit — c'est-à-dire
-- rien —, et l'on découvrirait des documents introuvables à la première recherche.
-- C'est le motif du §0 de la `012`, et la leçon du lot RGPD.
do $$
begin
    perform set_config('grc.utilisateur', 'migration-059', true);
    perform set_config('grc.filiales',
                       (select coalesce(string_agg(id, ','), '') from filiales), true);
end;
$$;

-- =====================================================================================
-- §1 — LE REPLI D'ACCENTS
-- =====================================================================================
-- ⚠️ **`immutable` est une CONDITION, pas un ornement** : PostgreSQL refuse une colonne
-- engendrée dont l'expression n'est pas immuable. C'est aussi ce qui garantit que
-- l'index et la requête replient de la même façon — une fonction `stable` pourrait
-- rendre autre chose demain, et l'index cesserait silencieusement de correspondre.
--
-- ⚠️ **Le `translate` couvre les deux casses**, et c'est nécessaire : `lower()` est
-- appliqué par `to_tsvector`, pas ici, et l'on veut que `f_sans_accent()` soit juste
-- toute seule — une fonction qui n'est vraie que dans le contexte de son appelant est
-- une fonction qu'on emploiera un jour ailleurs, de travers.

create or replace function f_sans_accent(p_texte text)
returns text
    language sql
    immutable
    parallel safe
    returns null on null input
    set search_path = pg_catalog, public, pg_temp as
$$
    select translate(
        p_texte,
        'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
        'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY');
$$;

comment on function f_sans_accent(text) is
    'Replie les accents d''un texte, sans extension (action D3). ⚠️ « unaccent » est '
    'disponible sur la grappe mais NON installé, et « create extension unaccent » exige '
    'le superutilisateur : une migration tourne sous grc_proprietaire, et la poser ici '
    'ferait échouer l''installation chez le client au milieu d''une migration. '
    '⚠️ IMMUTABLE est une CONDITION : PostgreSQL refuse une colonne engendrée dont '
    'l''expression ne l''est pas, et c''est aussi ce qui garantit que l''index et la '
    'requête replient de la même façon.';

grant execute on function f_sans_accent(text) to grc_app;
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'grc_lecture') then
        execute 'grant execute on function f_sans_accent(text) to grc_lecture';
    end if;
end;
$$;

-- =====================================================================================
-- §2 — LA COLONNE « documents.recherche »
-- =====================================================================================
-- ⚠️ **`to_tsvector(regconfig, text)` est immuable ; `to_tsvector(text)` ne l'est pas.**
-- La forme à un argument dépend de `default_text_search_config`, un réglage de session :
-- l'employer ici ferait dépendre le CONTENU DE L'INDEX du réglage de celui qui écrit.
-- Deux sessions, deux index. La configuration est donc nommée, en dur, et c'est voulu.
--
-- ⚠️ **Les poids ne sont pas un confort de classement** : ils sont le second garde-corps
-- de l'arbitrage sur `notes` (voir l'entête). `C` range l'annotation derrière le titre
-- et le type, si bien que l'usage normal du produit ne la rencontre pas.

alter table documents
    add column if not exists recherche tsvector
    generated always as (
        setweight(to_tsvector('french'::regconfig, f_sans_accent(coalesce(titre, ''))), 'A')
     || setweight(to_tsvector('french'::regconfig, f_sans_accent(coalesce(type,  ''))), 'B')
     || setweight(to_tsvector('french'::regconfig, f_sans_accent(coalesce(notes, ''))), 'C')
    ) stored;

comment on column documents.recherche is
    'Index plein texte du document (action D3, lot L16) — colonne ENGENDRÉE. '
    '⚠️ Elle se recalcule à chaque écriture sans qu''aucun code ne l''y aide : la purge '
    'de l''article 17 qui vide « notes » vide donc l''index DANS LA MÊME INSTRUCTION. Un '
    'index tenu par un déclencheur aurait pu survivre à la donnée qu''il indexe. '
    '⚠️ Poids A/B/C — titre, type, notes : « C » range l''annotation en dernier, de '
    'sorte qu''une occurrence en note ne passe jamais devant une occurrence dans le '
    'titre. ⚠️ Et la route qui l''interroge ne rend JAMAIS l''extrait qui a produit la '
    'correspondance : elle rend le document. C''est la différence entre trouver une '
    'procédure et fouiller des annotations.';

-- =====================================================================================
-- §3 — L'INDEX GIN
-- =====================================================================================
-- GIN et non GiST : l'index est interrogé bien plus souvent qu'il n'est écrit, et GIN
-- rend des recherches plus rapides au prix d'écritures plus lentes. Un document se
-- cherche tous les jours et se modifie deux fois par an.

create index if not exists ix_documents_recherche on documents using gin (recherche);

-- =====================================================================================
-- §4 — LE REGISTRE DE L'ARTICLE 30 (constats Q-295 / Q-296)
-- =====================================================================================
-- ⚠️ Le garde-fou du registre REFUSE LE DÉMARRAGE pour une colonne non déclarée, et il
-- l'a déjà fait trois lots de suite sur des colonnes engendrées (`REPRISE.md` §5,
-- piège n° 1). Elle est donc déclarée ici, et son régime est celui de sa source la plus
-- exposée : `notes` est en « signaler », l'index qui la reprend l'est aussi.

insert into colonnes_personnelles
    (table_nom, colonne, nature, finalite, base_legale, duree_jours, a_expiration, justification)
values
  ('documents', 'recherche', 'non_personnelle', null, null, null, 'conserver',
   'Index plein texte ENGENDRÉ depuis titre, type et notes (action D3). Il ne porte '
   'aucune donnée propre : il est la projection de trois colonnes déjà inscrites à ce '
   'registre, toutes trois « non_personnelle ». ⚠️ Régime « conserver », et le registre '
   'DIT pourquoi comme le veut la 026 : une colonne engendrée se recalcule à chaque '
   'écriture, donc la purge qui vide « notes » vide l''index DANS LA MÊME INSTRUCTION. '
   'Il n''y a rien à y faire, et rien ne peut y survivre. ⚠️ « signaler » a été essayé '
   'et REFUSÉ PAR LE GARDE, à raison : ce régime fait construire à la purge une '
   'comparaison TEXTUELLE pour y chercher un nom, un « tsvector » n''est pas textuel, '
   'et la purge étant transactionnelle une seule déclaration de ce genre l''avorterait '
   'ENTIÈREMENT, pour toutes les filiales (constat Q-300).')
on conflict (table_nom, colonne) do nothing;

-- ── §4 bis — LE TYPE « tsvector » EST RANGÉ ────────────────────────────────────────
--
-- ⚠️ **Ce n'est pas moi qui l'ai vu** : `f_verifier_types_ranges()` a refusé la
-- migration, en toutes lettres — *« un type de ce nom apparaît dans le schéma, et rien
-- ne dit s'il peut porter une donnée personnelle »*. C'est le renversement du constat
-- A-3, et il fait exactement son office.
--
-- **La réponse est « porteur », et elle mérite d'être écrite** : un `tsvector` contient
-- les lexèmes du texte dont il est tiré. Si `notes` porte « relancé Mme Ollier », l'index
-- porte « ollier ». Le ranger parmi les types qui ne peuvent JAMAIS désigner une personne
-- serait faux, et ce serait précisément la faute que ce garde existe pour empêcher : huit
-- colonnes `jsonb` avaient échappé au registre qu'on présente à un DPO.
--
-- ⚠️ **Et la fonction est patchée, jamais RECOPIÉE** (`docs/REPRISE.md` §5, piège n° 4) :
-- une migration ultérieure l'a peut-être étendue, et une copie prise dans la `031`
-- effacerait son extension en silence. On lit le texte APPLIQUÉ, on insère à côté de son
-- modèle, et l'on REFUSE D'AGIR si ce modèle a changé — motif du §4 de la `027`.

do $$
declare
    v_def  text;
    v_neuf text;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'f_verifier_types_ranges'
       and p.pronargs = 0;

    if v_def is null then
        raise exception 'f_verifier_types_ranges() est introuvable : la 031 n''a pas été '
                        'appliquée.';
    end if;
    if position('''tsvector''' in v_def) > 0 then
        raise notice 'Le type « tsvector » est déjà rangé : rejeu, rien à faire.';
        return;
    end if;
    if position('''xml'', ''bytea''' in v_def) = 0 then
        raise exception 'Le modèle « ''xml'', ''bytea'' » est introuvable dans le texte '
                        'APPLIQUÉ de f_verifier_types_ranges() : sa rédaction a changé, '
                        'et la substitution à l''aveugle est refusée plutôt qu''appliquée '
                        'de travers (motif du §4 de la 027).';
    end if;

    v_neuf := replace(
        v_def,
        '''xml'', ''bytea''',
        '''xml'', ''bytea'','
        || E'\n        -- Un « tsvector » contient les LEXÈMES du texte dont il est tiré :'
        || E'\n        -- si la note porte « relancé Mme Ollier », l''index porte « ollier ».'
        || E'\n        -- Le ranger ailleurs serait la faute même du constat A-3 (059).'
        || E'\n        ''tsvector''');

    execute v_neuf;
    raise notice 'Le type « tsvector » est rangé parmi les porteurs possibles.';
end;
$$;

-- =====================================================================================
-- §5 — LE GARDE-FOU
-- =====================================================================================
-- ⚠️ Il **ÉPROUVE** (`CONVENTIONS.md` §39.1). Un garde qui vérifierait que la colonne
-- « existe » passerait au vert sur une colonne engendrée depuis le seul `titre` — donc
-- sur une recherche qui ne trouve plus rien de ce que l'utilisateur a annoté, **sans un
-- mot**. Il fait donc trois choses qu'on ne peut pas simuler :
--
--   1. il **replie et cherche pour de vrai**, sur des valeurs témoins, en passant par
--      la même chaîne que le produit (`f_sans_accent` → `to_tsvector` → `@@`) ;
--   2. il vérifie qu'un terme ÉTRANGER ne correspond PAS — sans quoi une expression
--      dégénérée qui rend « tout » passerait les cinq premiers cas ;
--   3. il lit l'expression APPLIQUÉE de la colonne engendrée et exige les trois sources
--      et les trois poids, nommément (`CONVENTIONS.md` §39.7 : *un garde de CLASSE ne
--      voit pas la disparition d'une PAIRE*).
--
-- ⚠️ **Il ne lit AUCUNE ligne de `documents`** — `CONVENTIONS.md` §41 : `install.sh`
-- appelle `f_verifier_schema()` sans périmètre, et un garde qui lirait une table
-- cloisonnée conclurait au vert parce qu'il ne voit rien.

create or replace function f_verifier_recherche_documentaire()
returns table (objet text, anomalie text, detail text)
    language plpgsql
    stable
    set search_path = pg_catalog, public, pg_temp as
$$
declare
    -- Chaque cas dit ce que sa disparition PRODUIT, pas ce qu'il teste.
    v_cas constant jsonb := jsonb_build_array(
        jsonb_build_object('indexe', 'Sécurité des accès', 'cherche', 'securite',
            'attendu', true,
            'effet', 'LA RECHERCHE CESSERAIT D''IGNORER LES ACCENTS. « securite » ne '
                     'trouverait plus « Sécurité », et l''utilisateur conclurait que la '
                     'procédure n''existe pas — dans l''outil où il vient prouver '
                     'qu''elle existe'),
        jsonb_build_object('indexe', 'Politique de chiffrement', 'cherche', 'chiffrer',
            'attendu', true,
            'effet', 'LA RACINISATION FRANÇAISE SERAIT PERDUE : « chiffrer » ne '
                     'trouverait plus « chiffrement », et la recherche redeviendrait un '
                     '« ilike » à la lettre près — c''est-à-dire ce qu''elle remplace'),
        jsonb_build_object('indexe', 'Sauvegardes externalisées', 'cherche', 'sauvegarde',
            'attendu', true,
            'effet', 'un pluriel ne trouverait plus son singulier'),
        jsonb_build_object('indexe', 'Procédure de revue', 'cherche', 'chiffrement',
            'attendu', false,
            'effet', '⚠️ LA RECHERCHE RENDRAIT TOUT. C''est le cas qui distingue un '
                     'index qui marche d''une expression dégénérée : sans lui, une '
                     'colonne qui correspondrait à n''importe quoi passerait tous les '
                     'autres cas au vert, et la recherche deviendrait l''oracle que '
                     'cette action existe pour fermer')
    );
    v_cas_un  jsonb;
    v_rendu   boolean;
    v_expr    text;
    -- Les trois sources et les trois poids, NOMMÉMENT (§39.7).
    v_pieces constant jsonb := jsonb_build_array(
        jsonb_build_object('motif', 'titre',
            'effet', 'le TITRE sortirait de l''index : la recherche documentaire ne '
                     'trouverait plus les documents par leur nom'),
        jsonb_build_object('motif', 'type',
            'effet', 'le TYPE sortirait de l''index : « politique », « procédure » ne '
                     'ramèneraient plus rien'),
        jsonb_build_object('motif', 'notes',
            'effet', 'les ANNOTATIONS sortiraient de l''index, silencieusement — un '
                     'utilisateur qui a annoté un document ne le retrouverait plus par '
                     'ce qu''il en a écrit'),
        jsonb_build_object('motif', '''A''',
            'effet', 'le titre perdrait son poids de tête, et une occurrence en note '
                     'passerait devant une occurrence dans le titre — c''est le second '
                     'garde-corps de l''arbitrage sur « notes » qui tomberait'),
        jsonb_build_object('motif', '''B''',
            'effet', 'le type perdrait son rang intermédiaire'),
        jsonb_build_object('motif', '''C''',
            'effet', '⚠️ LES NOTES CESSERAIENT D''ÊTRE RANGÉES EN DERNIER. L''arbitrage '
                     'de l''entête tient à ce poids : c''est lui qui fait que l''usage '
                     'normal du produit ne rencontre pas les annotations')
    );
    v_piece jsonb;
begin
    -- ── La fonction de repli existe-t-elle seulement ? ──────────────────────
    if to_regprocedure('public.f_sans_accent(text)') is null then
        objet    := 'f_sans_accent';
        anomalie := 'repli_accents_absent';
        detail   := 'La fonction de repli d''accents a disparu. Sans elle, la colonne '
                    'engendrée ne peut plus se calculer : toute écriture sur un '
                    'document échouerait.';
        return next;
        return;
    end if;

    -- ── La colonne est-elle là, et ENGENDRÉE ? ──────────────────────────────
    select pg_get_expr(d.adbin, d.adrelid) into v_expr
      from pg_attribute a
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = to_regclass('public.documents')
       and a.attname = 'recherche' and a.attgenerated = 's';

    if v_expr is null then
        objet    := 'documents.recherche';
        anomalie := 'index_recherche_absent';
        detail   := 'La colonne d''index plein texte a disparu, ou elle a cessé d''être '
                    'ENGENDRÉE. Une colonne ordinaire devrait être écrite par quelque '
                    'chose — et le jour où ce quelque chose ne tourne pas, la recherche '
                    'rend un résultat périmé sans le dire. Pire ici : un index qui '
                    'SURVIT à la purge RGPD de « notes » garde une trace de ce qu''on '
                    'vient d''effacer.';
        return next;
        return;
    end if;

    -- ── 1 et 2 : on cherche POUR DE VRAI ────────────────────────────────────
    for v_cas_un in select * from jsonb_array_elements(v_cas) loop
        v_rendu := to_tsvector('french'::regconfig,
                               f_sans_accent(v_cas_un ->> 'indexe'))
                   @@ plainto_tsquery('french'::regconfig,
                               f_sans_accent(v_cas_un ->> 'cherche'));
        if v_rendu is distinct from (v_cas_un ->> 'attendu')::boolean then
            objet    := 'f_verifier_recherche_documentaire';
            anomalie := 'recherche_documentaire_fausse';
            detail   := format(
                'Indexé « %s », cherché « %s » : la chaîne rend « %s » au lieu de '
                '« %s ». Ce que cela produit : %s. ⚠️ Ce garde ÉPROUVE la recherche sur '
                'des valeurs témoins — il ne lit pas le texte de l''expression (§39.1).',
                v_cas_un ->> 'indexe', v_cas_un ->> 'cherche',
                coalesce(v_rendu::text, '(null)'), v_cas_un ->> 'attendu',
                v_cas_un ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── 3 : les trois sources et les trois poids, une par une ───────────────
    for v_piece in select * from jsonb_array_elements(v_pieces) loop
        if position((v_piece ->> 'motif') in v_expr) = 0 then
            objet    := 'documents.recherche';
            anomalie := 'index_recherche_ampute';
            detail   := format(
                'L''expression appliquée de la colonne engendrée ne mentionne plus '
                '« %s ». Ce que sa disparition produit : %s. ⚠️ Les cas éprouvés '
                'ci-dessus ne peuvent PAS le voir : ils mesurent la chaîne de recherche, '
                'pas les colonnes qu''on y verse (§39.7 — un garde de CLASSE ne voit pas '
                'la disparition d''une PAIRE).',
                v_piece ->> 'motif', v_piece ->> 'effet');
            return next;
        end if;
    end loop;

    -- ── L'index est-il là ? Sans lui, tout marche — et tout rampe ───────────
    if not exists (
        select 1 from pg_index i
          join pg_class c on c.oid = i.indexrelid
          join pg_am am on am.oid = c.relam
         where i.indrelid = to_regclass('public.documents')
           and am.amname = 'gin')
    then
        objet    := 'ix_documents_recherche';
        anomalie := 'index_gin_absent';
        detail   := 'L''index GIN a disparu. ⚠️ Rien ne casse — et c''est le problème : '
                    'la recherche continue de rendre les BONS résultats, en balayant la '
                    'table entière. Le défaut ne se voit qu''au volume du client, '
                    'c''est-à-dire là où personne ne le cherche.';
        return next;
    end if;

    return;
end;
$$;

comment on function f_verifier_recherche_documentaire() is
    'Garde-fou de l''action D3 : la chaîne de recherche est ÉPROUVÉE sur QUATRE cas '
    'témoins (§39.1) — dont un cas NÉGATIF, sans lequel une expression dégénérée qui '
    'correspond à tout passerait les trois autres au vert —, puis les trois sources et '
    'les trois poids de la colonne engendrée sont exigés UN PAR UN (§39.7). '
    '⚠️ Il ne lit AUCUNE ligne de « documents » : install.sh appelle f_verifier_schema() '
    'sans périmètre, et un garde qui lirait une table cloisonnée conclurait au vert '
    'parce qu''il ne voit rien (§41). Découvert par f_decouvrir_controles_schema().';

grant execute on function f_verifier_recherche_documentaire() to grc_app;

-- =====================================================================================
-- §6 — CONSIGNATION, VÉRIFICATION, ENREGISTREMENT
-- =====================================================================================

select f_consigner_controles_schema();

do $$
declare v_anomalies text; v_nombre integer;
begin
    select string_agg(format('%s : %s (%s)', objet, anomalie, detail), E'\n'), count(*)
      into v_anomalies, v_nombre
      from f_verifier_schema();

    if v_nombre > 0 then
        raise exception 'Le schéma est en défaut après 059 : %', v_anomalies;
    end if;
    raise notice 'f_verifier_schema() : aucune anomalie, recherche documentaire comprise.';
end;
$$;

insert into migrations_schema (version, nom)
values ('059', 'la recherche documentaire : un index plein texte ENGENDRÉ sur titre, type '
               'et notes, borné par la RLS et par rien d''autre, dont la purge RGPD de la '
               'source purge l''index dans la même instruction (D3)')
on conflict (version) do nothing;

commit;

-- =====================================================================================
-- ANNULATION (documentaire)
--   begin;
--   drop function if exists f_verifier_recherche_documentaire();
--   delete from controles_schema where fonction = 'f_verifier_recherche_documentaire';
--   drop index if exists ix_documents_recherche;
--   alter table documents drop column if exists recherche;
--   drop function if exists f_sans_accent(text);
--   delete from colonnes_personnelles where table_nom = 'documents' and colonne = 'recherche';
--   delete from migrations_schema where version = '059';
--   commit;
-- ⚠️ Annuler ne détruit AUCUNE donnée : la colonne est engendrée, ses trois sources
--    restent intactes. C'est la seule migration du chantier dont l'annulation soit sans
--    perte — dire le contraire par prudence rituelle ferait douter des autres avis.
-- =====================================================================================
